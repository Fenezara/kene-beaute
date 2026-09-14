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
        phone: true, // t. 120 — numéro officiel : bouton WhatsApp cliente → institut
        rating: true,
        reviewCount: true,
        description: true,
        openingHour: true,
        closingHour: true,
        photoData: true,
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
          photoData: true, // t. 120 — visuel du soin (hasPhoto dans la réponse)
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

    const { photoData, ...institute } = tenant;
    return NextResponse.json({
      institute: {
        ...institute,
        // t. 120 — vitrine réelle si posée, sinon visuel studio du nom
        image: photoData ? `/api/media/tenant/${id}` : instituteImage(tenant.name),
        hasPhoto: Boolean(photoData),
        reviewCount: tenant.reviewCount ?? tenant._count.reviews,
      },
      // hasPhoto par soin (photo réelle prise en institut) — la data URL ne
      // part jamais dans le payload, /api/media/service/:id la sert.
      services: services.map(({ photoData: pd, ...s }) => ({ ...s, hasPhoto: Boolean(pd) })),
      resources,
      reviews,
    });
  } catch (err) {
    return serverError("institutes/[id]", err);
  }
}
