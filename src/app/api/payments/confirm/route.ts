// POST /api/payments/confirm — simule la confirmation MoMo et déclenche les effets métier
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet, creditWallet, notify, rewardReferrerIfNeeded } from "@/lib/kene/server";
import { xof } from "@/lib/kene/format";
import { rateLimit, rlKey, rateLimitResponse, PAYMENTS } from "@/lib/kene/rate-limit";

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "payments:confirm"), PAYMENTS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes de paiement — patiente quelques secondes");
  }
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

        // Parrainage : récompense du parrain à la première commande payée
        await rewardReferrerIfNeeded(order.userId);

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
            message: `Kènè : commande confirmée ✅ ${xof(order.total)} payés${order.cashback ? ` — ${xof(order.cashback)} de cashback crédités` : ""}. Livraison en cours de préparation.`,
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
          message: `Kènè : acompte de ${xof(payment.amount)} reçu — votre RDV est confirmé ✅`,
        });
        // Rappel automatique J-1 réel : programmé 24 h avant le RDV, envoyé au
        // fil de l'eau par le due-runner (GET /api/notifications).
        const [svc, tnt] = await Promise.all([
          db.service.findUnique({ where: { id: updated.serviceId }, select: { name: true } }),
          db.tenant.findUnique({ where: { id: updated.tenantId }, select: { name: true } }),
        ]);
        const fireAt = new Date(new Date(updated.startAt).getTime() - 24 * 3_600_000);
        await notify({
          userId: updated.userId,
          tenantId: updated.tenantId,
          channel: "whatsapp",
          toPhone: updated.clientPhone,
          message: `Kènè ✨ petit rappel : ${svc?.name ?? "ton soin"} chez ${tnt?.name ?? "l'institut"} le ${new Date(updated.startAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Préviens-nous si tu dois déplacer, sinon on t'attend avec plaisir !`,
          status: "scheduled",
          scheduledAt: fireAt.getTime() > Date.now() ? fireAt : new Date(),
          metaJson: JSON.stringify({ apptId: updated.id }),
        });
      }
    }

    return NextResponse.json({ payment, order: order ?? undefined, wallet: wallet ?? undefined });
  } catch (err) {
    return serverError("payments/confirm", err);
  }
}
