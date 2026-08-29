// GET /api/institutes/[id] — fiche institut + services + praticiennes + avis
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, instituteImage } from "@/lib/kene/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tenant = await db.tenant.findUnique({ where: { id } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [services, resources, reviews] = await Promise.all([
      db.service.findMany({ where: { tenantId: id, active: true }, orderBy: { price: "asc" } }),
      db.resource.findMany({ where: { tenantId: id, active: true } }),
      db.review.findMany({
        where: { tenantId: id },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      institute: { ...tenant, image: instituteImage(tenant.name) },
      services,
      resources,
      reviews,
    });
  } catch (err) {
    return serverError("institutes/[id]", err);
  }
}
