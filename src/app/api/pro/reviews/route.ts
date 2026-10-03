// GET /api/pro/reviews?tenantId= — tous les avis reçus par l'institut pour l'espace Pro
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:reviews:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const reviews = await db.review.findMany({
      where: { tenantId: tenant.id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        appointment: {
          select: {
            id: true,
            startAt: true,
            service: { select: { name: true } },
            resource: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
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
        clientName: r.user?.name ?? "Cliente",
        clientPhone: r.user?.phone ?? null,
        rating: r.rating,
        comment: r.comment,
        serviceName: r.appointment?.service?.name ?? null,
        practitionerName: r.appointment?.resource?.name ?? null,
        appointmentDate: r.appointment?.startAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return serverError("pro/reviews", err);
  }
}
