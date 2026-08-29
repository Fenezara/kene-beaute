// POST /api/payments/confirm — simule la confirmation MoMo et déclenche les effets métier
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet, creditWallet, notify } from "@/lib/kene/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { paymentId?: string } | null;
    const paymentId = body?.paymentId;
    if (!paymentId) return jsonError("paymentId requis", 400);

    let payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return jsonError("Paiement introuvable", 404);
    if (payment.status === "success") return jsonError("Paiement déjà confirmé", 400);

    payment = await db.payment.update({
      where: { id: paymentId },
      data: { status: "success", confirmedAt: new Date() },
    });

    const meta = payment.metaJson ? (JSON.parse(payment.metaJson) as Record<string, string>) : {};
    let order: Awaited<ReturnType<typeof db.order.update>> | null = null;
    let wallet: Awaited<ReturnType<typeof creditWallet>> | null = null;

    if (payment.purpose === "shop_order" && meta.orderId) {
      let orderWithItems = await db.order.findUnique({ where: { id: meta.orderId }, include: { items: true } });
      if (orderWithItems && orderWithItems.status !== "paid") {
        const items = orderWithItems.items;
        order = await db.order.update({ where: { id: orderWithItems.id }, data: { status: "paid" } });

        // Cashback 5 % sur wallet
        if (order.cashback > 0) {
          const w = await ensureWallet(order.userId);
          if (w) wallet = await creditWallet(w.id, order.cashback, "cashback", order.id);
        }

        // Sorties de stock
        for (const item of items) {
          const product = await db.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;
          await db.product.update({ where: { id: product.id }, data: { stock: { decrement: item.qty } } });
          if (product.tenantId) {
            await db.inventoryMovement.create({
              data: { tenantId: product.tenantId, productId: product.id, type: "out", qty: item.qty, reason: "Commande boutique Kènè" },
            });
          }
        }

        const user = await db.user.findUnique({ where: { id: order.userId } });
        if (user) {
          await notify({
            userId: user.id,
            channel: "sms",
            toPhone: user.phone,
            message: `Kènè : commande confirmée ✅ ${order.total} FCFA payés${order.cashback ? ` — ${order.cashback} FCFA de cashback crédités` : ""}. Livraison en cours de préparation.`,
          });
        }
      }
    } else if (payment.purpose === "wallet_topup") {
      const userId = meta.userId ?? payment.userId;
      if (userId) {
        const w = await ensureWallet(userId);
        if (w) wallet = await creditWallet(w.id, payment.amount, "topup", payment.id);
      }
    } else if (payment.purpose === "appointment_deposit" && meta.appointmentId) {
      const appointment = await db.appointment.findUnique({ where: { id: meta.appointmentId } });
      if (appointment && appointment.status === "pending") {
        const updated = await db.appointment.update({
          where: { id: appointment.id },
          data: { status: "confirmed", depositAmount: payment.amount },
        });
        await notify({
          userId: updated.userId,
          tenantId: updated.tenantId,
          channel: "sms",
          toPhone: updated.clientPhone,
          message: `Kènè : acompte de ${payment.amount} FCFA reçu — votre RDV est confirmé ✅`,
        });
        await notify({
          userId: updated.userId,
          tenantId: updated.tenantId,
          channel: "whatsapp",
          toPhone: updated.clientPhone,
          message: `Kènè : rappel RDV J-1 programmé (simulé) — nous vous écrirons 24 h avant votre rendez-vous. À bientôt !`,
          status: "scheduled",
        });
      }
    }

    return NextResponse.json({ payment, order: order ?? undefined, wallet: wallet ?? undefined });
  } catch (err) {
    return serverError("payments/confirm", err);
  }
}
