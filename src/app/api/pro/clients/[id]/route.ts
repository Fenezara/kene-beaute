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

    const since12m = new Date();
    since12m.setFullYear(since12m.getFullYear() - 1);

    const [sales, appointments, sales12m, diagnoses, proDiagnoses, orders, reviews] = await Promise.all([
      db.sale.findMany({
        where: { clientProfileId: id },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 10,
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
      client.userId
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
    });
  } catch (err) {
    return serverError("pro/clients/[id]", err);
  }
}

const PatchBody = z.object({
  notes: z.string().trim().max(2000).nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = guardProRole(req, "pro:clients:[id]:patch");
    if (guard) return guard;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Notes invalides (2000 caractères maximum)", 400);

    const { id } = await params;
    const client = await db.clientProfile.findUnique({ where: { id } });
    if (!client) return jsonError("Fiche cliente introuvable", 404);

    // Même isolation que le GET: notes d'une fiche étrangère → 404.
    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant || client.tenantId !== tenant.id) return jsonError("Fiche cliente introuvable", 404);

    const updated = await db.clientProfile.update({
      where: { id },
      data: { notes: parsed.data.notes && parsed.data.notes.length > 0 ? parsed.data.notes : null },
    });

    return NextResponse.json({ client: updated });
  } catch (err) {
    return serverError("pro/clients/[id] PATCH", err);
  }
}
