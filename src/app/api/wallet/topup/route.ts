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
import { createWaveCheckoutSession } from "@/lib/payments/wave";
import { createWiniPayerPaymentSession } from "@/lib/payments/winipayer";
import { createSaspayCheckoutSession } from "@/lib/payments/saspay";

const Body = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(100),
  method: z.enum(["wave", "orange", "mtn", "moov", "saspay", "winipayer"]),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "wallet:topup"), WALLET_TOPUP);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de recharges à la suite — patiente quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide (amount ≥ 100, method wave|orange|saspay)", 400);

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

    let paymentUrl: string | null = null;
    let saspayLaunchUrl: string | null = null;
    let winipayerLaunchUrl: string | null = null;
    let waveLaunchUrl: string | null = null;

    const hasSaspay = Boolean(process.env.SASPAY_API_KEY?.trim());
    const hasWiniPayer = Boolean(process.env.WINIPAYER_MERCHANT_UUID && process.env.WINIPAYER_MERCHANT_TOKEN);

    // 1. SasPay Live (prioritaire si clé présente)
    if (hasSaspay && (parsed.data.method === "saspay" || parsed.data.method === "wave" || parsed.data.method === "orange" || parsed.data.method === "mtn" || parsed.data.method === "moov")) {
      const sasSession = await createSaspayCheckoutSession({
        paymentId: payment.id,
        amount: parsed.data.amount,
        description: `Recharge portefeuille Kènè (${parsed.data.amount} F)`,
        customerName: user.name,
        customerPhone: user.phone,
      });
      if (sasSession.checkoutUrl) {
        paymentUrl = sasSession.checkoutUrl;
        saspayLaunchUrl = sasSession.checkoutUrl;
        try {
          await db.payment.update({
            where: { id: payment.id },
            data: { metaJson: JSON.stringify({ userId: user.id, saspayId: sasSession.id }) },
          });
        } catch {}
      }
    }

    // 2. WiniPayer (repli)
    if (!paymentUrl && (hasWiniPayer && (parsed.data.method === "winipayer" || parsed.data.method === "wave" || parsed.data.method === "orange" || parsed.data.method === "mtn" || parsed.data.method === "moov"))) {
      const winiSession = await createWiniPayerPaymentSession({
        paymentId: payment.id,
        amount: parsed.data.amount,
        description: `Recharge portefeuille Kènè (${parsed.data.amount} F)`,
        clientName: user.name,
        clientPhone: user.phone,
      });
      paymentUrl = winiSession.paymentUrl;
      winipayerLaunchUrl = winiSession.paymentUrl;
    }

    if (!paymentUrl && parsed.data.method === "wave") {
      const waveSession = await createWaveCheckoutSession({
        paymentId: payment.id,
        amount: parsed.data.amount,
        description: `Recharge portefeuille Kènè (${parsed.data.amount} F)`,
      });
      waveLaunchUrl = waveSession.waveLaunchUrl ?? paymentUrl;
      if (!paymentUrl) paymentUrl = waveSession.waveLaunchUrl;
    }

    return NextResponse.json(
      { payment: paymentWithConfirmToken(payment, token), paymentUrl, saspayLaunchUrl, winipayerLaunchUrl, waveLaunchUrl },
      { status: 201 }
    );
  } catch (err) {
    return serverError("wallet/topup", err);
  }
}
