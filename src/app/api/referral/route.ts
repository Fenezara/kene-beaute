// GET /api/referral?userId= — Le Fil du Parrainage : code, parrain, filleules, stats
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet } from "@/lib/kene/server";
import type { ReferralSummary } from "@/lib/kene/referral";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const wallet = await ensureWallet(userId);
    if (!wallet) return jsonError("Wallet introuvable", 404);

    // Parrain de la cliente (si elle a échangé un code)
    let referredBy: ReferralSummary["referredBy"] = null;
    if (user.referredBy) {
      const parrain = await db.user.findUnique({ where: { id: user.referredBy } });
      if (parrain) {
        const rewarded = await db.walletTransaction.findFirst({
          where: { reason: "referral", refId: `parrain:${userId}` },
          select: { id: true },
        });
        referredBy = { id: parrain.id, name: parrain.name, rewarded: Boolean(rewarded) };
      }
    }

    // Filleules parrainées par la cliente
    const filleuls = await db.user.findMany({
      where: { referredBy: userId },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const rewardedMarks = await db.walletTransaction.findMany({
      where: { reason: "referral", refId: { in: filleuls.map((f) => `parrain:${f.id}`) } },
      select: { refId: true },
    });
    const rewardedIds = new Set(rewardedMarks.map((m) => m.refId?.split(":")[1] ?? ""));

    // Première commande payée par filleule (une seule requête groupée)
    const invitees: ReferralSummary["invitees"] = [];
    for (const f of filleuls) {
      const firstOrder = await db.order.findFirst({
        where: { userId: f.id, status: { in: ["paid", "delivered"] } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      invitees.push({
        id: f.id,
        name: f.name,
        joinedAt: f.createdAt.toISOString(),
        firstOrderAt: firstOrder ? firstOrder.createdAt.toISOString() : null,
        rewarded: rewardedIds.has(f.id),
      });
    }

    // Gains parrainage cumulés = bonus parrains crédités sur MA wallet
    const earningTxs = await db.walletTransaction.findMany({
      where: { walletId: wallet.id, type: "credit", reason: "referral" },
      select: { amount: true },
    });
    const earnings = earningTxs.reduce((s, t) => s + t.amount, 0);

    const summary: ReferralSummary = {
      code: wallet.referralCode,
      referredBy,
      invitees,
      stats: {
        invitees: invitees.length,
        rewarded: invitees.filter((i) => i.rewarded).length,
        earnings,
      },
    };
    return NextResponse.json(summary);
  } catch (err) {
    return serverError("referral:get", err);
  }
}
