// GET /api/admin/stats — KPIs plateforme (espace Admin)
// Deux gardes:
// • rate-limit 30/min par IP: la route est publique côté front, un scan
// coûteux ne doit pas être martelé;
// • cache mémoire globalThis TTL 60 s (pattern singleton du rate-limit):
// la route scanne toute la base (orders + items, ventes 30 j, diagnostics
// 14 j) — les hits répétés servent le snapshot au lieu de re-scanner.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, daysAgo, ddMM } from "@/lib/kene/server";
import { guardAdminRole, sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";
import { DEMO_PHONES, DEMO_TENANT_IDS } from "@/lib/kene/demo";

const CACHE_TTL_MS = 30_000;

type StatsPayload = {
  users: number;
  tenants: number;
  diagnoses: number;
  orders: number;
  gmvBoutique: number;
  commissionTotal: number;
  referrals: number;
  chart: { date: string; count: number }[];
  topTenants: { name: string; city: string; ca30: number }[];
  activeSubs: number;
  subsMrrFcfa: number;
  salesCount: number;
  salesVolume: number;
  appointmentsCount: number;
  appointmentsDeposit: number;
  networkGmv: number;
  scope: "real" | "all";
};

// Singleton sur globalThis indexé par scope pour éviter les collisions de cache
const g = globalThis as typeof globalThis & { __keneAdminStatsCache?: Record<string, { data: StatsPayload; at: number }> };

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:stats"), ADMIN_STATS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Statistiques très sollicitées — reprends dans quelques secondes");
  }
  try {
    const guard = guardAdminRole(req, "admin:stats");
    if (guard) return guard;

    const sess = sessionFromRequest(req);
    if (sess) {
      void audit({ kind: "admin_access", userId: sess.userId, ip: clientIp(req) });
    }

    const scope = (req.nextUrl.searchParams.get("scope")?.trim() === "all" ? "all" : "real") as "real" | "all";
    const excludeDemo = scope === "real";

    if (!g.__keneAdminStatsCache) g.__keneAdminStatsCache = {};
    const cached = g.__keneAdminStatsCache[scope];
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 86_400_000);

    const demoTenantsArr = Array.from(DEMO_TENANT_IDS);
    const demoPhonesArr = Array.from(DEMO_PHONES);

    const [
      users,
      tenants,
      diagnoses,
      orders,
      paidOrders,
      diagRecent,
      sales30,
      referrals,
      activeSubsRaw,
      salesCount,
      salesAgg,
      appointmentsCount,
      appointmentsDepositAgg,
    ] = await Promise.all([
      db.user.count({
        where: excludeDemo ? { phone: { notIn: demoPhonesArr } } : undefined,
      }),
      db.tenant.count({
        where: excludeDemo ? { active: true, id: { notIn: demoTenantsArr } } : undefined,
      }),
      db.diagnosis.count({
        where: excludeDemo ? { user: { phone: { notIn: demoPhonesArr } } } : undefined,
      }),
      db.order.count({
        where: excludeDemo ? { user: { phone: { notIn: demoPhonesArr } } } : undefined,
      }),
      db.order.findMany({
        where: {
          status: { in: ["paid", "delivered"] },
          ...(excludeDemo ? { user: { phone: { notIn: demoPhonesArr } } } : {}),
        },
        include: { items: { include: { product: { include: { tenant: { select: { commissionRate: true } } } } } } },
      }),
      db.diagnosis.findMany({
        where: {
          createdAt: { gte: daysAgo(13) },
          ...(excludeDemo ? { user: { phone: { notIn: demoPhonesArr } } } : {}),
        },
        select: { createdAt: true },
      }),
      db.sale.findMany({
        where: {
          status: "completed",
          createdAt: { gte: since30 },
          ...(excludeDemo ? { tenantId: { notIn: demoTenantsArr } } : {}),
        },
        select: { tenantId: true, total: true },
      }),
      db.user.count({
        where: {
          referredBy: { not: null },
          ...(excludeDemo ? { phone: { notIn: demoPhonesArr } } : {}),
        },
      }),
      db.subscription.findMany({
        where: { status: "active", expiresAt: { gt: now } },
        select: { priceFcfa: true },
      }),
      db.sale.count({
        where: {
          status: "completed",
          ...(excludeDemo ? { tenantId: { notIn: demoTenantsArr } } : {}),
        },
      }),
      db.sale.aggregate({
        where: {
          status: "completed",
          ...(excludeDemo ? { tenantId: { notIn: demoTenantsArr } } : {}),
        },
        _sum: { total: true },
      }),
      db.appointment.count({
        where: excludeDemo ? { tenantId: { notIn: demoTenantsArr } } : undefined,
      }),
      db.appointment.aggregate({
        where: {
          status: { in: ["confirmed", "completed"] },
          ...(excludeDemo ? { tenantId: { notIn: demoTenantsArr } } : {}),
        },
        _sum: { depositAmount: true },
      }),
    ]);

    const salesVolume = salesAgg._sum.total ?? 0;
    const appointmentsDeposit = appointmentsDepositAgg._sum.depositAmount ?? 0;
    const gmvBoutique = paidOrders.reduce((s, o) => s + o.total, 0);

    // Formule unifiée du Volume Réseau Global (GMV) :
    // Totalité de l'argent circulant sur Kènè = Ventes Caisses Salons + Commandes Boutique Web + Acomptes RDV
    const networkGmv = salesVolume + appointmentsDeposit + gmvBoutique;

    // Commissions marketplace: ventes de produits rattachés à un institut partenaire
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

    const payload: StatsPayload = {
      users,
      tenants,
      diagnoses,
      orders,
      gmvBoutique,
      commissionTotal,
      referrals,
      chart,
      topTenants,
      activeSubs: activeSubsRaw.length,
      subsMrrFcfa: activeSubsRaw.reduce((s, x) => s + x.priceFcfa, 0),
      salesCount,
      salesVolume,
      appointmentsCount,
      appointmentsDeposit,
      networkGmv,
      scope,
    };
    g.__keneAdminStatsCache[scope] = { data: payload, at: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    return serverError("admin/stats", err);
  }
}
