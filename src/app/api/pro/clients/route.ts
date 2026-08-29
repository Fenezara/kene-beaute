// GET /api/pro/clients?tenantId=&q= — annuaire CRM trié par CA
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, slugify } from "@/lib/kene/server";

export async function GET(req: NextRequest) {
  try {
    const tenant = await resolveTenant(req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

    const all = await db.clientProfile.findMany({
      where: { tenantId: tenant.id },
      include: { _count: { select: { sales: true, appointments: true } } },
      orderBy: { totalSpent: "desc" },
    });

    const clients = all.filter(
      (c) => !q || slugify(c.name).includes(slugify(q)) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );

    return NextResponse.json({ clients });
  } catch (err) {
    return serverError("pro/clients", err);
  }
}
