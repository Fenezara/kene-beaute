// POST /api/payments/orange/webhook — Webhook officiel Orange Money Web Payment
// Traite les notifications de succès et valide les transactions de façon atomique et idempotente.
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

    // Si Orange confirme le succès (ou en simulation si le webhook est testé)
    const isSuccess = !body.status || body.status.toUpperCase() === "SUCCESS" || body.status.toUpperCase() === "COMPLETED";

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
