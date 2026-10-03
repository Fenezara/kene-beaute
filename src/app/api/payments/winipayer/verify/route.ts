// GET /api/payments/winipayer/verify?paymentId= — Vérification et réconciliation d'un paiement WiniPayer
// Appelé par le client lors du retour de la page de paiement ou pour le contrôle de statut.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { verifyWiniPayerTransaction } from "@/lib/payments/winipayer";
import { executePaymentSuccess } from "@/lib/kene/payment-core";
import { rateLimit, rlKey, rateLimitResponse, PAYMENTS_CONFIRM } from "@/lib/kene/rate-limit";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "payments:winipayer:verify"), PAYMENTS_CONFIRM);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec);
  }

  try {
    const paymentId = req.nextUrl.searchParams.get("paymentId");
    if (!paymentId) {
      return jsonError("Paramètre 'paymentId' manquant", 400);
    }

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return jsonError("Paiement introuvable", 404);
    }

    async function getContext(p: NonNullable<typeof payment>) {
      let appointment: { id: string; serviceName: string; tenantName: string; startAt: string } | null = null;
      let order: { id: string; total: number; cashback: number } | null = null;

      try {
        if (p.purpose === "appointment_deposit") {
          let appt = await db.appointment.findFirst({
            where: { paymentId: p.id },
            include: { service: { select: { name: true } }, tenant: { select: { name: true } } },
          });
          if (!appt && p.metaJson) {
            const meta = JSON.parse(p.metaJson) as { appointmentId?: string };
            if (meta.appointmentId) {
              appt = await db.appointment.findUnique({
                where: { id: meta.appointmentId },
                include: { service: { select: { name: true } }, tenant: { select: { name: true } } },
              });
            }
          }
          if (appt) {
            appointment = {
              id: appt.id,
              serviceName: appt.service.name,
              tenantName: appt.tenant.name,
              startAt: appt.startAt.toISOString(),
            };
          }
        } else if (p.purpose === "shop_order") {
          const ord = await db.order.findFirst({
            where: { paymentId: p.id },
            select: { id: true, total: true, cashback: true },
          });
          if (ord) {
            order = ord;
          }
        }
      } catch {
        // Enrichissement silencieux et sécurisé
      }

      return { appointment, order, purpose: p.purpose };
    }

    // Si déjà validé en base, retour direct enrichi
    if (payment.status === "success") {
      const ctx = await getContext(payment);
      return NextResponse.json({
        isPaid: true,
        status: "completed",
        amount: payment.amount,
        paymentId: payment.id,
        purpose: ctx.purpose,
        appointment: ctx.appointment,
        order: ctx.order,
      });
    }

    // Vérification auprès de l'API WiniPayer
    let winipayerId: string | undefined;
    try {
      if (payment.metaJson) {
        const meta = JSON.parse(payment.metaJson) as { winipayerId?: string };
        winipayerId = meta.winipayerId;
      }
    } catch {
      // JSON parsing fallback
    }
    const lookupRef = winipayerId || payment.ref || payment.id;
    const verifyResult = await verifyWiniPayerTransaction(lookupRef);

    if (verifyResult.isPaid) {
      const outcome = await executePaymentSuccess(payment.id);
      const ctx = await getContext(payment);
      return NextResponse.json({
        isPaid: true,
        status: "completed",
        amount: payment.amount,
        paymentId: payment.id,
        reconciled: outcome.success,
        purpose: ctx.purpose,
        appointment: ctx.appointment,
        order: ctx.order,
      });
    }

    return NextResponse.json({
      isPaid: false,
      status: payment.status,
      amount: payment.amount,
      paymentId: payment.id,
    });
  } catch (err) {
    return serverError("payments/winipayer/verify", err);
  }
}
