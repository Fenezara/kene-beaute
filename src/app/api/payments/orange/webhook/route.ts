// POST /api/payments/orange/webhook — Webhook officiel Orange Money Web Payment
// Traite les notifications de succès et valide les transactions de façon atomique et idempotente.
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { executePaymentSuccess } from "@/lib/kene/payment-core";
import { claimWebhookEvent } from "@/lib/payments/idempotency";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      status?: string;
      order_id?: string;
      notif_token?: string;
      txnid?: string;
    } | null;

    if (!body || !body.order_id) {
      return NextResponse.json({ error: "order_id requis" }, { status: 400 });
    }

    const paymentId = body.order_id;
    const payment = await db.payment.findUnique({ where: { id: paymentId } });

    if (!payment) {
      return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
    }

    // Verrou d'idempotence strict (anti-rejeu automatique Orange Money)
    const eventId = String(body.txnid || body.notif_token || `om_${paymentId}`);
    const { isDuplicate } = await claimWebhookEvent("orange", eventId);
    if (isDuplicate) {
      return NextResponse.json({ status: "ok", note: "idempotent_duplicate" }, { status: 200 });
    }

    // Vérification cryptographique en temps constant si un secret de webhook est configuré
    const webhookSecret = process.env.ORANGE_MONEY_WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      const authHeader = req.headers.get("authorization") || req.headers.get("x-orange-token") || "";
      const expected = Buffer.from(webhookSecret);
      const actual = Buffer.from(authHeader.replace(/^Bearer\s+/i, ""));
      const isMatch = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
      if (!isMatch) {
        return NextResponse.json({ error: "Invalid webhook credentials" }, { status: 401 });
      }
    }

    // Le statut doit être EXPLICITEMENT valide (interdiction formelle du fallback !body.status)
    const rawStatus = (body.status ?? "").trim().toUpperCase();
    const isSuccess = rawStatus === "SUCCESS" || rawStatus === "COMPLETED";

    if (isSuccess) {
      const result = await executePaymentSuccess(paymentId);
      if (result.success) {
        return NextResponse.json({ status: "ok", message: "Paiement Orange Money confirmé" });
      }
      if (result.reason === "already_confirmed") {
        return NextResponse.json({ status: "ok", message: "Paiement déjà confirmé précédemment" });
      }
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ status: "ignored", reason: body.status });
  } catch (err: any) {
    console.error("[Orange Money Webhook Exception]:", err?.message || err);
    return NextResponse.json({ error: "Erreur serveur webhook Orange Money" }, { status: 500 });
  }
}
