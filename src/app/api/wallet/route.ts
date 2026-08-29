// GET /api/wallet?userId= — wallet + transactions (créé à la volée si absent)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet } from "@/lib/kene/server";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const wallet = await ensureWallet(userId);
    if (!wallet) return jsonError("Utilisatrice introuvable", 404);

    const transactions = await db.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ wallet, transactions });
  } catch (err) {
    return serverError("wallet:get", err);
  }
}
