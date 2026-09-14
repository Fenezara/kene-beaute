// POST /api/wallet/topup — recharge wallet via Payment MoMo (confirmé ensuite
// via /api/payments/confirm).: le Payment pending porte un code de
// confirmation — token BRUT renvoyé au front (contrat 63-b), hash sha256 seul
// stocké. Sans ce code, la confirmation refuse le paiement (fin du « mint »
// anonyme) et le crédit wallet part dans la transaction de confirmation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef } from "@/lib/kene/server";
import { newConfirmToken, paymentWithConfirmToken } from "@/lib/kene/confirm-token";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, WALLET_TOPUP } from "@/lib/kene/rate-limit";

const Body = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(100),
  method: z.enum(["wave", "orange"]),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "wallet:topup"), WALLET_TOPUP);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de recharges à la suite — patiente quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide (amount ≥ 100, method wave|orange)", 400);

    // Session signée (, migration douce): avec cookie, la recharge ne
    // peut créer un paiement que pour le compte de la session.
    const guard = guardUserClaim(req, "wallet:topup", parsed.data.userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    // Création atomique du paiement pending + de son code de confirmation.
    const { token, tokenHash } = newConfirmToken();
    const payment = await db.$transaction(async (tx) =>
      tx.payment.create({
        data: {
          userId: user.id,
          purpose: "wallet_topup",
          method: parsed.data.method,
          amount: parsed.data.amount,
          status: "pending",
          ref: genRef("PAY"),
          metaJson: JSON.stringify({ userId: user.id }),
          confirmTokenHash: tokenHash,
        },
      })
    );

    return NextResponse.json({ payment: paymentWithConfirmToken(payment, token) }, { status: 201 });
  } catch (err) {
    return serverError("wallet/topup", err);
  }
}
