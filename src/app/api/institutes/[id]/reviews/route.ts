// GET & POST /api/institutes/[id]/reviews — consultation et dépôt public d'avis
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, REVIEWS_POST } from "@/lib/kene/rate-limit";

const ReviewBody = z.object({
  userId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(600).optional(),
  appointmentId: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await db.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, rating: true, reviewCount: true },
    });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const reviews = await db.review.findMany({
      where: { tenantId: id },
      include: {
        user: { select: { name: true } },
        appointment: { select: { service: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of reviews) {
      if (r.rating >= 1 && r.rating <= 5) {
        breakdown[r.rating] = (breakdown[r.rating] || 0) + 1;
        sum += r.rating;
      }
    }

    const totalCount = reviews.length;
    const averageRating = totalCount > 0 ? Math.round((sum / totalCount) * 10) / 10 : tenant.rating || 5.0;
    const positiveCount = (breakdown[4] || 0) + (breakdown[5] || 0);
    const satisfactionRate = totalCount > 0 ? Math.round((positiveCount / totalCount) * 100) : 100;

    return NextResponse.json({
      summary: {
        averageRating,
        totalCount: Math.max(totalCount, tenant.reviewCount),
        breakdown,
        satisfactionRate,
      },
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        user: r.user ? { name: r.user.name } : null,
        serviceName: r.appointment?.service?.name ?? null,
      })),
    });
  } catch (err) {
    return serverError("institutes/[id]/reviews:get", err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "institutes:review"), REVIEWS_POST);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop d'avis soumis rapidement — veuillez patienter quelques instants");
  }
  try {
    const { id } = await params;
    const parsed = ReviewBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Note (1-5) requise", 400);

    const guard = guardUserClaim(req, "institutes:review", parsed.data.userId);
    if (guard) return guard;

    const tenant = await db.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true },
    });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const user = await db.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    let linkedAppointmentId: string | null = null;

    if (parsed.data.appointmentId) {
      const appt = await db.appointment.findUnique({ where: { id: parsed.data.appointmentId } });
      if (!appt) return jsonError("Rendez-vous introuvable", 404);
      if (appt.userId !== user.id) return jsonError("Ce rendez-vous ne vous appartient pas", 403);
      if (appt.tenantId !== id) return jsonError("Ce rendez-vous ne concerne pas cet institut", 400);

      const existingApptReview = await db.review.findUnique({ where: { appointmentId: appt.id } });
      if (existingApptReview) return jsonError("Un avis a déjà été déposé pour ce rendez-vous", 409);
      linkedAppointmentId = appt.id;
    } else {
      // Vérifier si un avis direct récent existe déjà
      const existingDirect = await db.review.findFirst({
        where: { tenantId: id, userId: user.id, appointmentId: null },
      });
      if (existingDirect) {
        // Mise à jour de l'avis existant
        const updated = await db.review.update({
          where: { id: existingDirect.id },
          data: {
            rating: parsed.data.rating,
            comment: parsed.data.comment ?? null,
            createdAt: new Date(),
          },
        });
        await refreshTenantRating(id);
        return NextResponse.json({ review: updated, updated: true });
      }
    }

    const review = await db.review.create({
      data: {
        tenantId: id,
        userId: user.id,
        appointmentId: linkedAppointmentId,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
      },
    });

    await refreshTenantRating(id);

    // Notification Pro
    const stars = "★".repeat(parsed.data.rating);
    await notify({
      tenantId: tenant.id,
      channel: "whatsapp",
      toPhone: tenant.phone,
      message: `Kènè Pro : nouvel avis de ${user.name} — ${stars} (${parsed.data.rating}/5)${parsed.data.comment ? ` « ${parsed.data.comment.slice(0, 140)} »` : ""}`,
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return serverError("institutes/[id]/reviews:post", err);
  }
}

async function refreshTenantRating(tenantId: string) {
  const agg = await db.review.aggregate({
    where: { tenantId },
    _avg: { rating: true },
    _count: true,
  });
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      rating: agg._count > 0 && agg._avg.rating !== null ? Math.round(agg._avg.rating * 10) / 10 : 5.0,
      reviewCount: agg._count,
    },
  });
}
