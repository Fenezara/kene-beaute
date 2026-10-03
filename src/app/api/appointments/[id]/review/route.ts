// POST /api/appointments/[id]/review — avis après RDV + recalcul note institut
// SYNCHRO CLIENT→INSTITUT: l'avis déposé depuis l'app cliente réveille
// l'espace Pro en temps réel (pushTenantFeed + ligne Notification adressée
// à l'institut) — la gérante voit l'avis arriver sans recharger.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, REVIEWS_POST } from "@/lib/kene/rate-limit";

const Body = z.object({
  userId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(600).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "appointments:review"), REVIEWS_POST);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop d'avis soumis rapidement — veuillez patienter quelques instants");
  }
  try {
    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Note (1-5) requise", 400);

    // Session signée (, migration douce): avec cookie, l'avis est
    // déposé pour le compte de la session; sans cookie → legacy.
    const guard = guardUserClaim(req, "appointments:review", parsed.data.userId);
    if (guard) return guard;

    const appointment = await db.appointment.findUnique({ where: { id } });
    if (!appointment) return jsonError("Rendez-vous introuvable", 404);

    const user = await db.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    // PROPRIÉTÉ: l'avis ne peut porter que sur un RDV de la cliente
    // elle-même (l'appointmentId étant devinable, un avis « emprunté »
    // sur le RDV d'une autre est refusé — même garde que l'annulation).
    if (appointment.userId !== user.id) {
      return jsonError("Cet avis ne concerne pas votre rendez-vous", 403);
    }

    // Un seul avis par RDV (appointmentId unique en base): réponse
    // claire plutôt qu'une erreur P2002 brute au second clic.
    const existing = await db.review.findUnique({ where: { appointmentId: appointment.id } });
    if (existing) return jsonError("Un avis a déjà été déposé pour ce rendez-vous", 409);

    const review = await db.review.create({
      data: {
        tenantId: appointment.tenantId,
        userId: user.id,
        appointmentId: appointment.id,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
      },
    });

    // Recalcul de la note moyenne de l'institut
    const [agg, tenant] = await Promise.all([
      db.review.aggregate({
        where: { tenantId: appointment.tenantId },
        _avg: { rating: true },
        _count: true,
      }),
      db.tenant.findUnique({ where: { id: appointment.tenantId }, select: { id: true, phone: true } }),
    ]);
    await db.tenant.update({
      where: { id: appointment.tenantId },
      data: {
        rating: agg._count > 0 && agg._avg.rating !== null ? Math.round(agg._avg.rating * 10) / 10 : 5.0,
        reviewCount: agg._count,
      },
    });

    // Temps réel institut: ligne Notification adressée à l'institut
    // (traçabilité) + pushTenantFeed → toast « Nouvel avis » sur l'espace
    // Pro connecté, immédiatement.
    const stars = "★".repeat(parsed.data.rating);
    if (tenant) {
      await notify({
        tenantId: tenant.id,
        channel: "whatsapp",
        toPhone: tenant.phone,
        message: `Kènè Pro : nouvel avis de ${user.name} — ${stars} (${parsed.data.rating}/5)${parsed.data.comment ? ` « ${parsed.data.comment.slice(0, 140)} »` : ""}`,
      });
    }

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return serverError("appointments/review", err);
  }
}
