// GET /api/pro/followups?tenantId= — relances calculées « Le Fil du Retour »
// POST /api/pro/followups — marquer une relance (done | dismissed | todo) + journalisation
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, notify } from "@/lib/kene/server";
import { buildFollowUps } from "@/lib/kene/followups";
import { guardProRole } from "@/lib/kene/session";
import { sharedScanUserIds } from "@/lib/kene/share-consent";

export async function GET(req: NextRequest) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:followups:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const since90 = new Date(Date.now() - 90 * 86_400_000);
    const since30 = new Date(Date.now() - 30 * 86_400_000);

    const [clients, appointments, marks] = await Promise.all([
      db.clientProfile.findMany({ where: { tenantId: tenant.id } }),
      db.appointment.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, clientProfileId: true, startAt: true, status: true, service: { select: { name: true } } },
      }),
      db.followUpMark.findMany({ where: { tenantId: tenant.id } }),
    ]);

    // Self-scans: seules les clientes qui ont EXPLICITEMENT partagé leur
    // historique avec cet institut alimentent les relances « contrôle
    // post-protocole » — un scan non partagé ne doit même pas transparaître
    // ici (sinon la relance révélerait l'existence du scan).
    const linkedUserIds = clients.map((c) => c.userId).filter((u): u is string => !!u);
    const userIds = [...(await sharedScanUserIds(linkedUserIds, tenant.id))];
    const [diagnoses, sales] = await Promise.all([
      userIds.length
        ? db.diagnosis.findMany({
            where: { userId: { in: userIds }, status: "done", createdAt: { gte: since90 } },
            select: { id: true, userId: true, zone: true, scoreGlobal: true, createdAt: true },
          })
        : Promise.resolve([]),
      db.sale.findMany({
        where: { tenantId: tenant.id, status: "completed", createdAt: { gte: since30 }, clientProfileId: { not: null } },
        select: { id: true, clientProfileId: true, createdAt: true, items: { where: { kind: "product" }, select: { label: true } } },
      }),
    ]);

    const items = buildFollowUps({
      clients,
      appointments: appointments.map((a) => ({ ...a, serviceName: a.service?.name })),
      diagnoses,
      sales: sales.map((s) => ({ ...s, productLabels: s.items.map((i) => i.label) })),
      marks,
    });

    const todo = items.filter((i) => i.status === "todo");
    const counts = {
      late: todo.filter((i) => i.daysFromNow < 0).length,
      week: todo.filter((i) => i.daysFromNow >= 0 && i.daysFromNow <= 7).length,
      upcoming: todo.filter((i) => i.daysFromNow > 7).length,
      done: items.filter((i) => i.status === "done").length,
      dismissed: items.filter((i) => i.status === "dismissed").length,
    };

    return NextResponse.json({ items, counts, tenant: { name: tenant.name } });
  } catch (err) {
    return serverError("pro/followups", err);
  }
}

const Body = z.object({
  tenantId: z.string().min(1),
  dedupKey: z.string().min(3),
  status: z.enum(["done", "dismissed", "todo"]),
  via: z.enum(["whatsapp", "call", "visit", "sms"]).nullish(),
  note: z.string().trim().max(500).optional(),
  clientProfileId: z.string().optional(),
  clientPhone: z.string().min(6).optional(),
  clientName: z.string().optional(),
  message: z.string().max(600).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Session signée (, migration douce): avec cookie, le traitement
    // d'une relance exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:followups:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, dedupKey, status, via, note, clientProfileId, clientPhone, clientName, message } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Réactivation: on efface la marque, la relance redevient « à traiter »
    if (status === "todo") {
      await db.followUpMark.deleteMany({ where: { tenantId, dedupKey } });
      await db.auditLog.create({
        data: {
          tenantId,
          action: "followup_reopen",
          entity: "followup",
          entityId: dedupKey,
          detailsJson: JSON.stringify({ by: "pro" }),
        },
      });
      return NextResponse.json({ ok: true });
    }

    const mark = await db.followUpMark.upsert({
      where: { tenantId_dedupKey: { tenantId, dedupKey } },
      create: { tenantId, dedupKey, status, via: via ?? null, note: note ?? null },
      update: { status, via: via ?? null, note: note ?? null },
    });

    // Relance traitée → le rappel automatique côté cliente (même diagnostic)
    // devient un doublon: on l'annule silencieusement.
    if (status === "done" && dedupKey.startsWith("diag:")) {
      const diagId = dedupKey.slice(5);
      let clientUserId: string | null = null;
      if (clientProfileId) {
        const profile = await db.clientProfile.findUnique({ where: { id: clientProfileId }, select: { userId: true } });
        clientUserId = profile?.userId ?? null;
      }
      if (clientUserId) {
        const scheds = await db.notification.findMany({
          where: { userId: clientUserId, status: "scheduled" },
          select: { id: true, metaJson: true },
        });
        const staleIds = scheds
          .filter((n) => {
            try {
              const m = JSON.parse(n.metaJson ?? "{}") as { diagId?: string };
              return m.diagId === diagId;
            } catch {
              return false;
            }
          })
          .map((n) => n.id);
        if (staleIds.length > 0) {
          await db.notification.deleteMany({ where: { id: { in: staleIds } } });
        }
      }
    }

    // Relance WhatsApp → notification journalisée (visible dans l'historique client)
    if (via === "whatsapp" && clientPhone) {
      let userId: string | null = null;
      if (clientProfileId) {
        const profile = await db.clientProfile.findUnique({ where: { id: clientProfileId }, select: { userId: true } });
        userId = profile?.userId ?? null;
      }
      await notify({
        userId,
        tenantId,
        channel: "whatsapp",
        toPhone: clientPhone,
        message: message ?? `Kènè : relance de ${clientName ?? "la cliente"} (${dedupKey}).`,
        status: "sent",
      });
    }

    await db.auditLog.create({
      data: {
        tenantId,
        action: "followup_mark",
        entity: "followup",
        entityId: dedupKey,
        detailsJson: JSON.stringify({ status, via: via ?? null, markId: mark.id }),
      },
    });

    return NextResponse.json({ ok: true, mark });
  } catch (err) {
    return serverError("pro/followups:post", err);
  }
}
