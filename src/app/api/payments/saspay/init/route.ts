// POST /api/payments/saspay/init — Initialisation de session de paiement SasPay
// Accepte un paymentId existant et retourne le lien de paiement sécurisé SasPay.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { createSaspayCheckoutSession } from "@/lib/payments/saspay";
import { rateLimit, rlKey, rateLimitResponse, PAYMENTS } from "@/lib/kene/rate-limit";

const Body = z.object({
  paymentId: z.string().min(1),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "payments:saspay:init"), PAYMENTS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec);
  }

  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError("Données de paiement invalides", 400);
    }

    const { paymentId, returnUrl, cancelUrl } = parsed.data;

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return jsonError("Transaction de paiement introuvable", 404);
    }

    if (payment.status === "success") {
      return jsonError("Ce paiement a déjà été validé", 400);
    }

    let customerName: string | undefined;
    let customerPhone: string | undefined;
    let customerEmail: string | undefined;

    if (payment.userId) {
      const user = await db.user.findUnique({
        where: { id: payment.userId },
        select: { name: true, phone: true },
      });
      if (user) {
        customerName = user.name;
        customerPhone = user.phone;
      }
    }

    let meta: Record<string, unknown> = {};
    try {
      meta = payment.metaJson ? JSON.parse(payment.metaJson) : {};
    } catch {
      meta = {};
    }

    const description =
      (meta.description as string) ||
      (payment.purpose === "appointment_deposit"
        ? "Acompte Rendez-vous Kènè"
        : payment.purpose === "shop_order"
          ? "Commande Boutique Kènè"
          : `Paiement Kènè #${payment.id.slice(-6)}`);

    const sessionResult = await createSaspayCheckoutSession({
      paymentId: payment.id,
      amount: payment.amount,
      description,
      customerName,
      customerPhone,
      customerEmail,
      returnUrl,
      cancelUrl,
    });

    // Mémorisation de la référence SasPay dans metaJson
    await db.payment.update({
      where: { id: payment.id },
      data: {
        metaJson: JSON.stringify({ ...meta, saspayId: sessionResult.id }),
      },
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: sessionResult.checkoutUrl,
      sessionId: sessionResult.id,
      mode: sessionResult.mode,
      error: sessionResult.error,
    });
  } catch (err) {
    return serverError("payments/saspay/init", err);
  }
}
