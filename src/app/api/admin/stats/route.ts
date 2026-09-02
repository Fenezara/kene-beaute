// GET /api/admin/stats — KPIs plateforme (espace Admin)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, daysAgo, ddMM } from "@/lib/kene/server";

export async function GET() {
  try {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 86_400_000);

    const [users, tenants, diagnoses, orders, paidOrders, diagRecent, sales30, referrals] = await Promise.all([
      db.user.count(),
      db.tenant.count(),
      db.diagnosis.count(),
      db.order.count(),
      db.order.findMany({
        where: { status: { in: ["paid", "delivered"] } },
        include: { items: { include: { product: { include: { tenant: { select: { commissionRate: true } } } } } } },
      }),
      db.diagnosis.findMany({ where: { createdAt: { gte: daysAgo(13) } }, select: { createdAt: true } }),
      db.sale.findMany({
        where: { status: "completed", createdAt: { gte: since30 } },
        select: { tenantId: true, total: true },
      }),
      db.user.count({ where: { referredBy: { not: null } } }),
    ]);

    const gmvBoutique = paidOrders.reduce((s, o) => s + o.total, 0);

    // Commissions marketplace : ventes de produits rattachés à un institut partenaire
    let commissionTotal = 0;
    for (const o of paidOrders) {
      for (const item of o.items) {
        const rate = item.product?.tenant?.commissionRate ?? 0;
        commissionTotal += Math.round(item.total * rate);
      }
    }

    // Diagnostics par jour (14 j)
    const dayMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) dayMap.set(ddMM(daysAgo(i)), 0);
    for (const d of diagRecent) {
      const key = ddMM(new Date(d.createdAt));
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const chart = [...dayMap.entries()].map(([date, count]) => ({ date, count }));

    // Top instituts par CA 30 j
    const caByTenant = new Map<string, number>();
    for (const s of sales30) caByTenant.set(s.tenantId, (caByTenant.get(s.tenantId) ?? 0) + s.total);
    const tenantIds = [...caByTenant.keys()];
    const tenantInfos = await db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, city: true } });
    const topTenants = tenantInfos
      .map((t) => ({ name: t.name, city: t.city, ca30: caByTenant.get(t.id) ?? 0 }))
      .sort((a, b) => b.ca30 - a.ca30)
      .slice(0, 5);

    return NextResponse.json({
      users,
      tenants,
      diagnoses,
      orders,
      gmvBoutique,
      commissionTotal,
      referrals,
      chart,
      topTenants,
    });
  } catch (err) {
    return serverError("admin/stats", err);
  }
}
