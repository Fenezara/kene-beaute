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

const CACHE_TTL_MS = 60_000;

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
  // t. 135 — monétisation: abonnées actives + revenus mensuels simulés
  // (MRR — les mois offerts par la Console comptent 0 F).
  activeSubs: number;
  subsMrrFcfa: number;
};

// Singleton sur globalThis: survit aux rechargements de modules en dev (HMR)
// et reste unique même si la route est bundlée plusieurs fois.
const g = globalThis as typeof globalThis & { __keneAdminStatsCache?: { data: StatsPayload; at: number } };

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:stats"), ADMIN_STATS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Statistiques très sollicitées — reprends dans quelques secondes");
  }
  try {
    // Session signée (, migration douce): avec cookie, la console
    // exige un compte admin; sans cookie → legacy (route publique + rate-limit).
    const guard = guardAdminRole(req, "admin:stats");
    if (guard) return guard;

    //: chaque passage de la garde (session admin vérifiée) est
    // journalisé — userId + IP. Legacy sans cookie: pas d'événement (rien
    // n'est authentifiable) — c'est la trace des ACCÈS réels qui compte.
    const sess = sessionFromRequest(req);
    if (sess) {
      void audit({ kind: "admin_access", userId: sess.userId, ip: clientIp(req) });
    }

    const cached = g.__keneAdminStatsCache;
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 86_400_000);

    const [users, tenants, diagnoses, orders, paidOrders, diagRecent, sales30, referrals, activeSubsRaw] = await Promise.all([
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
      // t. 135 — lignes d'abonnement actives non expirées (MRR simulé).
      db.subscription.findMany({
        where: { status: "active", expiresAt: { gt: now } },
        select: { priceFcfa: true },
      }),
    ]);

    const gmvBoutique = paidOrders.reduce((s, o) => s + o.total, 0);

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
    };
    g.__keneAdminStatsCache = { data: payload, at: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    return serverError("admin/stats", err);
  }
}
