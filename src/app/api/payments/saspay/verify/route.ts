// GET /api/payments/saspay/verify?paymentId= — Vérification et réconciliation d'un paiement SasPay
// Appelé par le client au retour de redirection pour synchroniser instantanément le statut.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { verifySaspayPayment } from "@/lib/payments/saspay";
import { executePaymentSuccess } from "@/lib/kene/payment-core";
import { rateLimit, rlKey, rateLimitResponse, PAYMENTS } from "@/lib/kene/rate-limit";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "payments:saspay:verify"), PAYMENTS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec);
  }

  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");

  if (!paymentId) {
    return jsonError("Paramètre paymentId manquant", 400);
  }

  try {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return jsonError("Paiement introuvable", 404);
    }

    // Si déjà validé en base, retour immédiat
    if (payment.status === "success") {
      return NextResponse.json({
        success: true,
        isPaid: true,
        status: "completed",
        amount: payment.amount,
        paymentId: payment.id,
        purpose: payment.purpose,
      });
    }

    let meta: Record<string, unknown> = {};
    try {
      meta = payment.metaJson ? JSON.parse(payment.metaJson) : {};
    } catch {
      meta = {};
    }

    // Interrogation de l'API SasPay
    const verifyTarget = (meta.saspayId as string) || payment.id;
    const verifyResult = await verifySaspayPayment(verifyTarget);

    if (verifyResult.isPaid) {
      await executePaymentSuccess(payment.id);

      return NextResponse.json({
        success: true,
        isPaid: true,
        status: "completed",
        amount: payment.amount,
        paymentId: payment.id,
        purpose: payment.purpose,
      });
    }

    return NextResponse.json({
      success: true,
      isPaid: false,
      status: payment.status,
      amount: payment.amount,
      paymentId: payment.id,
      purpose: payment.purpose,
    });
  } catch (err) {
    return serverError("payments/saspay/verify", err);
  }
}
