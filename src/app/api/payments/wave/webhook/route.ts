// POST /api/payments/wave/webhook — Réception des webhooks officiels Wave Mobile Money
// Traitement asynchrone sécurisé lorsqu'une cliente finalise son paiement sur l'application Wave:
// 1. Validation de la signature cryptographique Wave-Signature
// 2. Extraction du client_reference (identifiant du Payment Kènè)
// 3. Déclenchement atomique et idempotent de executePaymentSuccess()
// 4. Audit de sécurité horodaté

import { NextRequest, NextResponse } from "next/server";
import { verifyWaveSignature } from "@/lib/payments/wave";
import { executePaymentSuccess } from "@/lib/kene/payment-core";
import { audit, clientIp } from "@/lib/kene/audit";
import { claimWebhookEvent } from "@/lib/payments/idempotency";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const secret = process.env.WAVE_WEBHOOK_SECRET?.trim();
  const signature = req.headers.get("wave-signature") || req.headers.get("Wave-Signature");

  // Récupération du raw body pour le calcul HMAC
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error("[Wave Webhook] Impossible de lire le corps de la requête:", err);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Vérification de signature si le secret est configuré
  if (secret) {
    const isValid = verifyWaveSignature(rawBody, signature, secret);
    if (!isValid) {
      console.warn(`[Wave Webhook] Signature invalide reçue depuis ${ip}`);
      void audit({
        kind: "security_alert",
        ip,
        detail: "Wave webhook signature verification failed",
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    // Mode développement / local sans secret configuré
    if (process.env.NODE_ENV === "production") {
      console.error("[Wave Webhook] WAVE_WEBHOOK_SECRET non configuré en production");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
  }

  // Analyse du payload JSON
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Wave envoie généralement { type: "checkout.session.completed", data: { client_reference: "...", ... } }
  // ou directement les données de la session
  const eventType = payload.type ?? "checkout.session.completed";
  const sessionData = payload.data ?? payload;
  const paymentId = sessionData.client_reference ?? sessionData.clientReference ?? sessionData.paymentId;

  if (!paymentId || typeof paymentId !== "string") {
    console.warn("[Wave Webhook] Webhook reçu sans client_reference valide:", payload);
    return NextResponse.json({ error: "Missing client_reference" }, { status: 400 });
  }

  // Verrou d'idempotence strict (anti-double débit sur rejeu automatique Wave)
  const eventId = String(payload.id || sessionData.id || `wave_${paymentId}`);
  const { isDuplicate } = await claimWebhookEvent("wave", eventId);
  if (isDuplicate) {
    return NextResponse.json({ received: true, note: "idempotent_duplicate" }, { status: 200 });
  }

  // Exécution idempotente
  try {
    const outcome = await executePaymentSuccess(paymentId);

    void audit({
      kind: "payment_webhook_wave",
      ip,
      detail: `event=${eventType} · paymentId=${paymentId} · success=${outcome.success}`,
    });

    if (!outcome.success) {
      if (outcome.reason === "already_confirmed") {
        // Idempotence : Wave peut rejouer les webhooks, on renvoie 200 OK
        return NextResponse.json({ received: true, note: "already_confirmed" }, { status: 200 });
      }
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ received: true, status: "processed" }, { status: 200 });
  } catch (err: any) {
    console.error(`[Wave Webhook] Erreur lors du traitement du paiement ${paymentId}:`, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
