// GET /api/referral?userId= — Le Fil du Parrainage: code, parrain, filleules, stats mois Kènè+
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet } from "@/lib/kene/server";
import {
  calculateGrantedMonths,
  getReferralProgress,
  type ReferralSummary,
  type ReferralInvitee,
} from "@/lib/kene/referral";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse } from "@/lib/kene/rate-limit";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "referral:get"), { limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — patiente quelques secondes");

  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const denied = guardUserClaim(req, "/api/referral", userId);
    if (denied) return denied;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);
    if (user.phone.startsWith("+22500") || user.name === "Nouvelle invitée") {
      return jsonError("Le parrainage est réservé aux membres enregistrées", 403);
    }

    const wallet = await ensureWallet(userId);
    if (!wallet) return jsonError("Wallet introuvable", 404);

    // Parrain de la cliente (si elle a échangé un code)
    let referredBy: ReferralSummary["referredBy"] = null;
    if (user.referredBy) {
      const parrain = await db.user.findUnique({ where: { id: user.referredBy } });
      if (parrain) {
        referredBy = { id: parrain.id, name: parrain.name };
      }
    }

    // Filleules parrainées par la cliente
    const filleuls = await db.user.findMany({
      where: { referredBy: userId },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Filleules ayant au moins un diagnostic de peau réalisé (amies actives)
    const filleulIds = filleuls.map((f) => f.id);
    const scannedRecords = await db.diagnosis.findMany({
      where: { userId: { in: filleulIds } },
      select: { userId: true },
    });
    const scannedUserIds = new Set(scannedRecords.map((s) => s.userId));

    const invitees: ReferralInvitee[] = filleuls.map((f) => {
      // Une filleule est considérée active si elle a réalisé un scan cutané ou si son compte existe
      const hasScanned = scannedUserIds.has(f.id);
      return {
        id: f.id,
        name: f.name,
        joinedAt: f.createdAt.toISOString(),
        hasScanned,
      };
    });

    const activeCount = invitees.length; // Toute filleule ayant rejoint via le lien
    const monthsGranted = calculateGrantedMonths(activeCount);
    const progress = getReferralProgress(activeCount);

    const summary: ReferralSummary = {
      code: wallet.referralCode,
      referredBy,
      invitees,
      stats: {
        totalInvitees: invitees.length,
        activeInvitees: activeCount,
        monthsGranted,
        nextTierGoal: progress.nextTier ? progress.nextTier.minInvitees : 100,
        currentTier: progress.tierName,
        progressPct: progress.progressPct,
      },
    };
    return NextResponse.json(summary);
  } catch (err) {
    return serverError("referral:get", err);
  }
}
