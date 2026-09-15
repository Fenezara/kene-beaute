// GET /api/admin/subscriptions?q= — gestion des abonnements Kènè+ / Pro
// (t. 135 — la monétisation entre dans la console). Liste COMPLÈTE
// (actifs, expirés, annulés, offerts) avec l'abonnée, tri « ce qui vit
// d'abord », + KPIs agrégés: abonnées actives, revenus mensuels simulés
// (MRR — les mois offerts par la Console comptent 0 F), échéances ≤ 7 j,
// mois offerts actifs, répartition par plan.
//
// NORMES (travail préparatoire t. 133): visibilité complète = standard de
// facto (Stripe Billing / Chargebee); MRR = LE KPI SaaS; l'historique est
// INTOUCHABLE (IFRS 15 / SYSCOHADA — on annule ou on ajoute une ligne,
// jamais on ne modifie ou supprime: cette route est LECTURE SEULE).
// Les écritures vivent dans PATCH /api/admin/subscriptions/[id] (step-up).
//
// Sécurité: session admin EXIGÉE (requireAdmin — même garde stricte que
// la gestion des instituts/comptes). 401 sans cookie, 403 autre rôle.
// Contrat: 200 { kpis, byPlan, subs } · 401/403.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, slugify } from "@/lib/kene/server";
import { subPlanLabel } from "@/lib/kene/plans";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { requireAdmin } from "../tenants/route";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:subs"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  const guard = requireAdmin(req);
  if (guard) return guard;
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const now = new Date();
    const DAY = 86_400_000;

    const subs = await db.subscription.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, phone: true, role: true } } },
    });

    // Statut DÉRIVÉ (jamais stocké — la ligne d'origine reste intacte):
    // « active » + expiresAt > now → actif (≤ 7 j → « expire bientôt »);
    // date passée → expiré; status cancelled → annulé.
    const derive = (s: (typeof subs)[number]) => {
      if (s.status === "cancelled") return "cancelled" as const;
      if (s.expiresAt.getTime() <= now.getTime()) return "expired" as const;
      if (s.expiresAt.getTime() - now.getTime() <= 7 * DAY) return "expiring" as const;
      return "active" as const;
    };

    const rows = subs.map((s) => ({
      id: s.id,
      userId: s.userId,
      userName: s.user.name,
      userPhone: s.user.phone,
      userRole: s.user.role,
      plan: s.plan,
      planLabel: subPlanLabel(s.plan),
      status: s.status,
      derived: derive(s),
      priceFcfa: s.priceFcfa,
      source: s.source, // momo_sim | console_gift
      startedAt: s.startedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    }));

    // KPIs — sur les lignes ACTIVES uniquement (une seule par cliente par
    // construction: activatePlan annule l'ancienne ligne au changement de plan).
    const live = rows.filter((r) => r.derived === "active" || r.derived === "expiring");
    const mrrFcfa = live.reduce((s, r) => s + r.priceFcfa, 0); // offerts = 0 F
    const kpis = {
      activeCount: live.length,
      mrrFcfa,
      expiringSoon: live.filter((r) => r.derived === "expiring").length,
      giftActive: live.filter((r) => r.source === "console_gift").length,
    };

    // Répartition par plan (actifs) — pills de la carte liste.
    const byPlanMap = new Map<string, { plan: string; label: string; count: number; mrr: number }>();
    for (const r of live) {
      const cur = byPlanMap.get(r.plan) ?? { plan: r.plan, label: r.planLabel, count: 0, mrr: 0 };
      cur.count += 1;
      cur.mrr += r.priceFcfa;
      byPlanMap.set(r.plan, cur);
    }
    const byPlan = [...byPlanMap.values()].sort((a, b) => b.mrr - a.mrr);

    // Recherche insensible casse/accents (pattern SQLite du projet).
    const filtered = q
      ? rows.filter((r) =>
          [r.userName, r.userPhone, r.planLabel, r.plan].some(
            (f) => f && (f.toLowerCase().includes(q) || slugify(f).includes(slugify(q))),
          ),
        )
      : rows;

    // Tri: ce qui vit d'abord — échéances proches, puis actives, puis
    // l'historique (expirés/annulés) du plus récent au plus ancien.
    const rank = { expiring: 0, active: 1, expired: 2, cancelled: 3 } as const;
    filtered.sort((a, b) => {
      if (rank[a.derived] !== rank[b.derived]) return rank[a.derived] - rank[b.derived];
      if (a.derived === "active" || a.derived === "expiring") {
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ kpis, byPlan, subs: filtered });
  } catch (err) {
    return serverError("admin/subscriptions", err);
  }
}
