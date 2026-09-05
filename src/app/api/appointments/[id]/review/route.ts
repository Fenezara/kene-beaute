// POST /api/appointments/[id]/review — avis après RDV + recalcul note institut
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";

const Body = z.object({
  userId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(600).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Note (1-5) requise", 400);

    // Session signée (t. 71-b, migration douce) : avec cookie, l'avis est
    // déposé pour le compte de la session ; sans cookie → legacy.
    const guard = guardUserClaim(req, "appointments:review", parsed.data.userId);
    if (guard) return guard;

    const appointment = await db.appointment.findUnique({ where: { id } });
    if (!appointment) return jsonError("Rendez-vous introuvable", 404);

    const user = await db.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

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
    const agg = await db.review.aggregate({
      where: { tenantId: appointment.tenantId },
      _avg: { rating: true },
      _count: true,
    });
    await db.tenant.update({
      where: { id: appointment.tenantId },
      data: {
        rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count,
      },
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return serverError("appointments/review", err);
  }
}
