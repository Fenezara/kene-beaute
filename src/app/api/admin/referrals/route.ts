// GET /api/admin/referrals — Pilotage du Fil du Parrainage & des Ambassadrices
// Vue exécutive de la viralité, du classement des marraines et de leurs filleules.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError } from "@/lib/kene/server";
import { calculateGrantedMonths, getReferralProgress, REFERRAL_TIERS } from "@/lib/kene/referral";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { requireAdmin } from "../tenants/route";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:referrals"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  const guard = requireAdmin(req);
  if (guard) return guard;

  try {
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

    // 1. Récupérer toutes les utilisatrices qui ont parrainé au moins 1 personne
    // (users ayant des personnes dont referredBy pointe vers leur ID)
    const allReferredUsers = await db.user.findMany({
      where: { referredBy: { not: null } },
      select: {
        id: true,
        name: true,
        phone: true,
        referredBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Diagnostiques réalisés par ces filleules
    const filleulIds = allReferredUsers.map((u) => u.id);
    const diagnoses = await db.diagnosis.findMany({
      where: { userId: { in: filleulIds } },
      select: { userId: true },
    });
    const scannedUserIds = new Set(diagnoses.map((d) => d.userId));

    // Regrouper les filleules par parrain
    const filleulsByParrain = new Map<string, Array<{
      id: string;
      name: string;
      phone: string;
      joinedAt: string;
      hasScanned: boolean;
    }>>();

    for (const f of allReferredUsers) {
      if (!f.referredBy) continue;
      const list = filleulsByParrain.get(f.referredBy) ?? [];
      list.push({
        id: f.id,
        name: f.name,
        phone: f.phone,
        joinedAt: f.createdAt.toISOString(),
        hasScanned: scannedUserIds.has(f.id),
      });
      filleulsByParrain.set(f.referredBy, list);
    }

    const parrainIds = Array.from(filleulsByParrain.keys());

    // Récupérer les marraines / parrains
    const parrains = await db.user.findMany({
      where: { id: { in: parrainIds } },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        city: true,
        createdAt: true,
        wallet: { select: { referralCode: true } },
      },
    });

    // Abonnements offerts par parrainage
    const referralSubs = await db.subscription.findMany({
      where: {
        source: { in: ["referral_gift", "referral_tier_reward"] },
      },
      select: { userId: true, plan: true, expiresAt: true, status: true },
    });
    const subByUserId = new Map(referralSubs.map((s) => [s.userId, s]));

    // Construire le tableau des marraines
    let ambassadors = parrains.map((p) => {
      const invitees = filleulsByParrain.get(p.id) ?? [];
      const totalInvitees = invitees.length;
      const scannedCount = invitees.filter((i) => i.hasScanned).length;
      const monthsGranted = calculateGrantedMonths(totalInvitees);
      const progress = getReferralProgress(totalInvitees);
      const sub = subByUserId.get(p.id);

      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        role: p.role,
        city: p.city,
        referralCode: p.wallet?.referralCode ?? "—",
        totalInvitees,
        scannedCount,
        monthsGranted,
        tierName: progress.tierName,
        currentTierId: progress.currentTier?.id ?? null,
        nextTierGoal: progress.nextTier ? progress.nextTier.minInvitees : 100,
        progressPct: progress.progressPct,
        activeSubUntil: sub ? sub.expiresAt.toISOString() : null,
        invitees,
      };
    });

    // Tri par nombre d'invitées décroissant (Leaderboard)
    ambassadors.sort((a, b) => b.totalInvitees - a.totalInvitees);

    // Filtrage recherche
    if (q) {
      ambassadors = ambassadors.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.phone.toLowerCase().includes(q) ||
          a.referralCode.toLowerCase().includes(q) ||
          (a.city && a.city.toLowerCase().includes(q))
      );
    }

    // Statistiques globales
    const totalReferrals = allReferredUsers.length;
    const totalActiveScanned = Array.from(scannedUserIds).length;
    const totalAmbassadors = parrains.length;
    const totalMonthsGiven = ambassadors.reduce((s, a) => s + a.monthsGranted, 0);

    const tierBreakdown = {
      initie: ambassadors.filter((a) => a.totalInvitees >= 10 && a.totalInvitees < 25).length,
      ambassadrice: ambassadors.filter((a) => a.totalInvitees >= 25 && a.totalInvitees < 50).length,
      cercle_dor: ambassadors.filter((a) => a.totalInvitees >= 50 && a.totalInvitees < 100).length,
      icone: ambassadors.filter((a) => a.totalInvitees >= 100).length,
      en_route: ambassadors.filter((a) => a.totalInvitees < 10).length,
    };

    return NextResponse.json({
      stats: {
        totalReferrals,
        totalActiveScanned,
        totalAmbassadors,
        totalMonthsGiven,
        tierBreakdown,
      },
      tiers: REFERRAL_TIERS,
      ambassadors,
    });
  } catch (err) {
    return serverError("admin/referrals", err);
  }
}
