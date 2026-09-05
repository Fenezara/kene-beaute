// GET /api/institutes/[id] — fiche institut + services + praticiennes + avis
// Sécurité (t. 63-d) : select explicite partout — la fiche publique expose
// uniquement les champs consommés par le front (BookingScreen). Sont retirés
// de la réponse : ownerName, ownerPhone, phone, address, plan, commissionRate,
// active (données business) et commissionPct des services.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, instituteImage } from "@/lib/kene/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await db.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        city: true,
        country: true,
        rating: true,
        reviewCount: true,
        description: true,
        openingHour: true,
        closingHour: true,
        _count: { select: { services: true, reviews: true } },
      },
    });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [services, resources, reviews] = await Promise.all([
      db.service.findMany({
        where: { tenantId: id, active: true },
        orderBy: { price: "asc" },
        select: {
          id: true,
          name: true,
          category: true,
          durationMin: true,
          price: true,
          description: true,
          botanicals: true,
        },
      }),
      db.resource.findMany({
        where: { tenantId: id, active: true },
        select: { id: true, name: true, role: true, color: true },
      }),
      db.review.findMany({
        where: { tenantId: id },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      institute: { ...tenant, image: instituteImage(tenant.name), reviewCount: tenant.reviewCount ?? tenant._count.reviews },
      services,
      resources,
      reviews,
    });
  } catch (err) {
    return serverError("institutes/[id]", err);
  }
}
