// POST /api/payments/winipayer/init — Initialisation de session de paiement WiniPayer
// Accepte un paymentId existant (ou les paramètres d'acompte/commande) et retourne le lien de paiement sécurisé WiniPayer.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { createWiniPayerPaymentSession } from "@/lib/payments/winipayer";
import { rateLimit, rlKey, rateLimitResponse, PAYMENTS } from "@/lib/kene/rate-limit";

const Body = z.object({
  paymentId: z.string().min(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "payments:winipayer:init"), PAYMENTS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec);
  }

  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError("Données de paiement invalides", 400);
    }

    const { paymentId, successUrl, cancelUrl } = parsed.data;

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return jsonError("Transaction de paiement introuvable", 404);
    }

    if (payment.status === "success") {
      return jsonError("Ce paiement a déjà été validé", 400);
    }

    // Récupération des informations de la cliente si disponible
    let clientName: string | undefined;
    let clientPhone: string | undefined;

    if (payment.userId) {
      const user = await db.user.findUnique({
        where: { id: payment.userId },
        select: { name: true, phone: true },
      });
      if (user) {
        clientName = user.name;
        clientPhone = user.phone;
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

    const sessionResult = await createWiniPayerPaymentSession({
      paymentId: payment.id,
      amount: payment.amount,
      description,
      clientName,
      clientPhone,
      successUrl,
      cancelUrl,
      metadata: {
        paymentId: payment.id,
        purpose: payment.purpose,
        userId: payment.userId,
      },
    });

    // Mémorisation de l'identifiant WiniPayer dans metaJson
    await db.payment.update({
      where: { id: payment.id },
      data: {
        metaJson: JSON.stringify({ ...meta, winipayerId: sessionResult.id }),
      },
    });

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      invoiceId: sessionResult.id,
      paymentUrl: sessionResult.paymentUrl,
      mode: sessionResult.mode,
    });
  } catch (err) {
    return serverError("payments/winipayer/init", err);
  }
}
