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
import { toCsv, csvDate, type CsvCell } from "@/lib/accounting/csv";
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
      // Mois offerts actifs: gestes Console (t. 135) + cadeaux parrainage (t. 138).
      giftActive: live.filter((r) => r.source === "console_gift" || r.source === "referral_gift").length,
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
    const byLife = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
      if (rank[a.derived] !== rank[b.derived]) return rank[a.derived] - rank[b.derived];
      if (a.derived === "active" || a.derived === "expiring") {
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    };
    filtered.sort(byLife);

    // t. 140 — EXPORT COMPTABLE CSV: l'historique COMPLET (toutes lignes,
    // hors recherche éventuelle — un export ne dépend jamais d'un filtre
    // d'écran) pour la comptable. Même discipline que la compta Pro: BOM
    // UTF-8 + «;» + \r\n + en-tête documentaire. Jamais de suppression ni
    // modification — l'export reflète la base telle quelle.
    if (req.nextUrl.searchParams.get("format") === "csv") {
      const SRC: Record<string, string> = {
        momo_sim: "Mobile Money",
        winipayer: "WiniPayer",
        console_gift: "Offert Console",
        referral_gift: "Cadeau parrainage",
      };
      const DER: Record<string, string> = {
        active: "Actif",
        expiring: "Expire ≤ 7 j",
        expired: "Expirée",
        cancelled: "Annulée",
      };
      const rowsCsv: CsvCell[][] = [
        ["Console Kènè — Abonnements Kènè+ & Pro"],
        ["Historique complet (IFRS 15) — inclut les lignes clôturées, rien ne s'efface"],
        [`Édité le ${csvDate(new Date())} · ${rows.length} lignes · montants en FCFA · paiements Mobile Money & Carte`],
        [],
        ["Créée le", "Abonnée", "Téléphone", "Rôle", "Plan", "Prix F/mois", "Source", "Statut ligne", "Statut réel", "Début", "Échéance"],
      ];
      for (const r of [...rows].sort(byLife)) {
        rowsCsv.push([
          csvDate(r.createdAt),
          r.userName,
          r.userPhone,
          r.userRole,
          r.planLabel,
          r.priceFcfa,
          SRC[r.source] ?? r.source,
          r.status === "cancelled" ? "Clôturée" : r.status,
          DER[r.derived] ?? r.derived,
          csvDate(r.startedAt),
          csvDate(r.expiresAt),
        ]);
      }
      rowsCsv.push(
        [],
        ["MRR actif", `${kpis.mrrFcfa} F/mois`],
        ["Abonnées actives", kpis.activeCount],
        ["Mois offerts actifs", kpis.giftActive],
      );
      const stamp = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}`;
      return new NextResponse(toCsv(rowsCsv), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="kene-abonnements-${stamp}.csv"`,
          "X-Rows-Count": String(rows.length),
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ kpis, byPlan, subs: filtered });
  } catch (err) {
    return serverError("admin/subscriptions", err);
  }
}
