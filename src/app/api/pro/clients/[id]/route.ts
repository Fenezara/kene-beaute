// GET /api/pro/clients/[id] — fiche client 360° (ventes, RDV, diagnostics,
// commandes boutique, avis) — ISOLATION: la fiche n'est lisible que par
// l'institut propriétaire (une gérante ne voit QUE ses clientes).
// PATCH — notes privées de la fiche (persistées en base, imprimées sur la
// fiche de consultation PDF — plus de notes locales par poste).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rfmScore } from "@/lib/kene/rfm";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { isScansShared } from "@/lib/kene/share-consent";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:clients:[id]:get");
    if (guard) return guard;

    const { id } = await params;
    const client = await db.clientProfile.findUnique({ where: { id } });
    if (!client) return jsonError("Fiche cliente introuvable", 404);

    // ISOLATION TENANT: la fiche doit appartenir à l'institut de la
    // session (gérante → son institut, employée → celui de son employeur,
    // admin → le tenant demandé). Une fiche d'un autre institut → 404.
    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant || client.tenantId !== tenant.id) return jsonError("Fiche cliente introuvable", 404);

    // PARTAGE SELF-SCANS: les diagnostics app de la cliente ne sont visibles
    // que si elle a explicitement partagé son historique avec CET institut
    // (case à la réservation ou carte « Partage » de son profil — révocable).
    // Le miroir peau (type + phototype) reste partagé: contexte minimal du soin.
    const scansShared = client.userId ? await isScansShared(client.userId, tenant.id) : false;

    const since12m = new Date();
    since12m.setFullYear(since12m.getFullYear() - 1);

    const [sales, appointments, sales12m, diagnoses, proDiagnoses, orders, reviews] = await Promise.all([
      db.sale.findMany({
        where: { clientProfileId: id },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  botanicals: true,
                  category: true,
                  brandLine: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.appointment.findMany({
        where: { clientProfileId: id },
        include: { service: { select: { name: true } } },
        orderBy: { startAt: "desc" },
        take: 10,
      }),
      db.sale.findMany({
        where: { clientProfileId: id, status: "completed", createdAt: { gte: since12m } },
        select: { total: true },
      }),
      client.userId && scansShared
        ? db.diagnosis.findMany({
            where: { userId: client.userId, status: "done" },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      // Diagnostics réalisés EN INSTITUT (questionnaire ± photo) — l'activité
      // de l'entreprise elle-même, distincte des self-scans de la cliente.
      db.proDiagnosis.findMany({
        where: { clientProfileId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Commandes boutique passées DEPUIS L'APP de la cliente et contenant
      // un produit de CET institut — la vue 360° couvre le online aussi.
      client.userId
        ? db.order.findMany({
            where: { userId: client.userId, items: { some: { product: { tenantId: tenant.id } } } },
            include: { items: { orderBy: { label: "asc" } } },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      // Avis déposés par la cliente sur CET institut (après ses RDV).
      client.userId
        ? db.review.findMany({
            where: { tenantId: tenant.id, userId: client.userId },
            include: { appointment: { include: { service: { select: { name: true } } } } },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
    ]);

    // RFM recalculé à la volée (non persisté)
    const recencyDays = client.lastVisit
      ? Math.max(0, Math.floor((Date.now() - client.lastVisit.getTime()) / 86_400_000))
      : 999;
    const monetary12m = sales12m.reduce((s, x) => s + x.total, 0);
    const rfm = rfmScore(recencyDays, sales12m.length, monetary12m);

    return NextResponse.json({
      client: { ...client, rfm },
      sales,
      appointments,
      diagnoses,
      proDiagnoses,
      orders,
      reviews,
      scansShared,
    });
  } catch (err) {
    return serverError("pro/clients/[id]", err);
  }
}

const PatchBody = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
  cosmeticsUsed: z.string().trim().max(3000).nullable().optional(),
  productObservations: z.string().trim().max(5000).nullable().optional(),
  district: z.string().trim().max(100).nullable().optional(),
  birthDate: z.string().trim().max(20).nullable().optional(),
  pregnant: z.boolean().nullable().optional(),
  preferredChannel: z.string().trim().max(20).nullable().optional(),
  beautyBudget: z.string().trim().max(100).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = guardProRole(req, "pro:clients:[id]:patch");
    if (guard) return guard;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Données invalides pour la fiche cliente", 400);

    const { id } = await params;
    const client = await db.clientProfile.findUnique({ where: { id } });
    if (!client) return jsonError("Fiche cliente introuvable", 404);

    // Même isolation que le GET: notes d'une fiche étrangère → 404.
    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant || client.tenantId !== tenant.id) return jsonError("Fiche cliente introuvable", 404);

    const data: Record<string, unknown> = {};

    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    if (parsed.data.cosmeticsUsed !== undefined) data.cosmeticsUsed = parsed.data.cosmeticsUsed;
    if (parsed.data.productObservations !== undefined) data.productObservations = parsed.data.productObservations;
    if (parsed.data.district !== undefined) data.district = parsed.data.district;
    if (parsed.data.birthDate !== undefined) data.birthDate = parsed.data.birthDate;
    if (parsed.data.pregnant !== undefined) data.pregnant = parsed.data.pregnant;
    if (parsed.data.preferredChannel !== undefined) data.preferredChannel = parsed.data.preferredChannel;
    if (parsed.data.beautyBudget !== undefined) data.beautyBudget = parsed.data.beautyBudget;

    const updated = await db.clientProfile.update({
      where: { id },
      data,
    });

    return NextResponse.json({ client: updated });
  } catch (err) {
    return serverError("pro/clients/[id] PATCH", err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = guardProRole(req, "pro:clients:[id]:delete");
    if (guard) return guard;

    const { id } = await params;
    const client = await db.clientProfile.findUnique({ where: { id } });
    if (!client) return jsonError("Fiche cliente introuvable", 404);

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant || client.tenantId !== tenant.id) return jsonError("Fiche cliente introuvable", 404);

    // Protection comptable : Si la cliente a déjà des ventes ou RDV passés,
    // on anonymise sa fiche CRM locale sans briser l'historique comptable de caisse
    const salesCount = await db.sale.count({ where: { clientProfileId: id } });
    const apptsCount = await db.appointment.count({ where: { clientProfileId: id } });

    if (salesCount > 0 || apptsCount > 0) {
      await db.clientProfile.update({
        where: { id },
        data: {
          name: "Cliente archivée",
          phone: `+22500${Date.now().toString().slice(-8)}`,
          email: null,
          notes: null,
          cosmeticsUsed: null,
          productObservations: null,
          userId: null,
        },
      });
      return NextResponse.json({
        ok: true,
        archived: true,
        message: "Fiche cliente archivée et anonymisée du salon.",
      });
    } else {
      // Aucune transaction financière liée : suppression propre de la fiche CRM
      await db.clientProfile.delete({ where: { id } });
      return NextResponse.json({
        ok: true,
        deleted: true,
        message: "Fiche cliente retirée du salon.",
      });
    }
  } catch (err) {
    return serverError("pro/clients/[id] DELETE", err);
  }
}

