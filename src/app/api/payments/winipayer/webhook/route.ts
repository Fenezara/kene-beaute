// POST /api/payments/winipayer/webhook — Réception des webhooks WiniPayer
// Traitement asynchrone sécurisé lorsqu'une cliente finalise son paiement via Wave, Orange, MTN ou Carte sur WiniPayer :
// 1. Extraction de la référence Kènè (paymentId) et du statut de paiement
// 2. Déclenchement atomique et idempotent de executePaymentSuccess()
// 3. Traçabilité dans le journal d'audit

import { NextRequest, NextResponse } from "next/server";
import { executePaymentSuccess } from "@/lib/kene/payment-core";
import { audit, clientIp } from "@/lib/kene/audit";
import { claimWebhookEvent } from "@/lib/payments/idempotency";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch (err) {
    console.error("[WiniPayer Webhook] Corps JSON invalide:", err);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // WiniPayer renvoie généralement { status: "completed", ref: "payment_id", ... }
  // ou un sous-objet transaction / invoice
  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  const rawStatus = String(data.status || data.state || payload.event || "").toLowerCase();
  
  // Recherche du paymentId dans ref, payment_id ou metadata
  const metadata = (data.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;
  const paymentId = String(data.ref || data.paymentId || data.payment_id || metadata.paymentId || "");

  if (!paymentId) {
    console.warn("[WiniPayer Webhook] Webhook reçu sans référence de paiement :", payload);
    return NextResponse.json({ error: "Missing payment reference" }, { status: 400 });
  }

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    console.warn(`[WiniPayer Webhook] Paiement introuvable pour la référence ${paymentId}`);
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const isSuccess = ["completed", "success", "paid", "done"].includes(rawStatus);

  if (!isSuccess) {
    console.log(`[WiniPayer Webhook] Transaction ${paymentId} au statut non payé (${rawStatus})`);
    if (["failed", "cancelled", "expired"].includes(rawStatus)) {
      await db.payment.update({
        where: { id: paymentId },
        data: { status: "failed" },
      });
    }
    return NextResponse.json({ received: true, status: rawStatus });
  }

  // Verrou d'idempotence strict (anti-double traitement sur rejeu WiniPayer)
  const eventId = String(data.transaction_id || data.id || `wp_${paymentId}`);
  const { isDuplicate } = await claimWebhookEvent("winipayer", eventId);
  if (isDuplicate) {
    return NextResponse.json({ received: true, note: "idempotent_duplicate" }, { status: 200 });
  }

  // Déclenchement idempotent du paiement
  try {
    const outcome = await executePaymentSuccess(paymentId);
    const reason = outcome.success ? "success" : outcome.reason;

    void audit({
      kind: "momo_payment",
      ip,
      detail: `winipayer_webhook:${paymentId}:${reason}`,
    });

    return NextResponse.json({
      received: true,
      processed: outcome.success,
      reason,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[WiniPayer Webhook] Erreur lors de l'exécution de paiement:", errorMsg);
    return NextResponse.json({ error: "Processing error", detail: errorMsg }, { status: 500 });
  }
}
