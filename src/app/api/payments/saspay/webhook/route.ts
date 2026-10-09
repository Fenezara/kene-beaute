// POST /api/payments/saspay/webhook — Réception des notifications de paiement SasPay
// 1. Extraction de la référence Kènè (paymentId) et du statut
// 2. Déclenchement atomique et idempotent de executePaymentSuccess()
// 3. Traçabilité dans le journal d'audit

import { NextRequest, NextResponse } from "next/server";
import { executePaymentSuccess } from "@/lib/kene/payment-core";
import { audit, clientIp } from "@/lib/kene/audit";
import { claimWebhookEvent } from "@/lib/payments/idempotency";
import { verifySaspayPayment } from "@/lib/payments/saspay";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[SasPay Webhook] Corps JSON invalide:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  const rawStatus = String(data.status || data.state || payload.event || "").toLowerCase();

  // SasPay renvoie la session / transaction avec id, metadata ou description
  const metadata = (data.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;
  let paymentId = String(data.payment_id || data.paymentId || data.ref || metadata.paymentId || "");

  // Si paymentId n'est pas explicite, cherchons par providerRef
  const sessionId = String(data.id || data.session_id || payload.session_id || "");

  if (!paymentId && sessionId) {
    const matched = await db.payment.findFirst({
      where: { ref: sessionId },
    });
    if (matched) {
      paymentId = matched.id;
    }
  }

  if (!paymentId) {
    console.warn("[SasPay Webhook] Webhook reçu sans référence de paiement Kènè :", payload);
    return NextResponse.json({ received: true, note: "Ignored, no matching payment" });
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    console.warn(`[SasPay Webhook] Paiement introuvable pour la référence ${paymentId}`);
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const isSuccess = ["completed", "success", "paid", "done", "succeeded"].includes(rawStatus);

  if (!isSuccess) {
    console.log(`[SasPay Webhook] Transaction ${paymentId} au statut non payé (${rawStatus})`);
    if (["failed", "cancelled", "expired"].includes(rawStatus)) {
      await db.payment.update({
        where: { id: paymentId },
        data: { status: "failed" },
      });
    }
    return NextResponse.json({ received: true, status: rawStatus });
  }

  // Double-vérification de sécurité (defense-in-depth) :
  // En production, on exige la vérification auprès de l'API SasPay
  // pour s'assurer que la transaction a RÉELLEMENT été payée (anti-spoofing de webhook).
  if (process.env.NODE_ENV === "production" || process.env.SASPAY_API_KEY) {
    if (process.env.SASPAY_API_KEY) {
      const sessionToVerify = String(sessionId || payment.ref || paymentId);
      const verification = await verifySaspayPayment(sessionToVerify);
      if (!verification.isPaid) {
        console.warn(`[SasPay Webhook] Rejet de confirmation non certifiée par l'API pour ${paymentId}`);
        return NextResponse.json({ error: "Transaction unverified by provider" }, { status: 403 });
      }
    }
  }

  // Idempotence stricte (anti double-traitement)
  const eventId = String(sessionId || paymentId);
  const { isDuplicate } = await claimWebhookEvent("saspay", eventId);
  if (isDuplicate) {
    console.log(`[SasPay Webhook] Événement déjà traité pour ${eventId}`);
    return NextResponse.json({ received: true, status: "already_processed" });
  }

  // Confirmation atomique du paiement
  const outcome = await executePaymentSuccess(payment.id);

  void audit({
    kind: "momo_payment",
    ip,
    detail: `saspay_webhook:${payment.id}:${outcome.success ? "success" : outcome.reason}`,
  });

  return NextResponse.json({
    received: true,
    success: outcome.success,
    paymentId: payment.id,
  });
}
