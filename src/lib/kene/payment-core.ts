// Kènè — Cœur transactionnel d'encaissement et confirmation de paiement
// Centralise l'exécution atomique et idempotente (anti-TOCTOU) des paiements:
// • Commandes boutique (passage paid, sortie de stock, mouvements inventaire, cashback 5%, parrainage)
// • Acomptes de rendez-vous en institut (confirmation, notification, rappel J-1 programmé)
// • Rechargements de wallet (topup)
// Utilisé à la fois par:
// 1. La confirmation manuelle / dev (/api/payments/confirm)
// 2. Le webhook automatique Wave (/api/payments/wave/webhook)
// 3. Tout futur agrégateur Mobile Money (CinetPay, etc.)

import type { Order, Payment, Wallet } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureWallet, creditWallet, notify, rewardReferrerIfNeeded } from "@/lib/kene/server";
import { xof } from "@/lib/kene/format";

export type PaymentExecutionOutcome =
  | { success: false; reason: "not_found" | "already_confirmed" }
  | { success: true; payment: Payment; order: Order | null; wallet: Wallet | null };

/**
 * Exécute la transition pending -> success d'un paiement et applique TOUS les effets métier
 * de manière strictement atomique et idempotente.
 */
export async function executePaymentSuccess(paymentId: string): Promise<PaymentExecutionOutcome> {
  const outcome = await db.$transaction(async (tx) => {
    // 1. Flip atomique conditionnel
    const res = await tx.payment.updateMany({
      where: { id: paymentId, status: "pending" },
      data: { status: "success", confirmedAt: new Date() },
    });

    if (res.count === 0) {
      return { stale: true as const };
    }

    const confirmed = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!confirmed) return { stale: true as const };

    const meta = confirmed.metaJson ? (JSON.parse(confirmed.metaJson) as Record<string, string>) : {};
    let order: Order | null = null;
    let wallet: Wallet | null = null;

    // 2. Traitement selon la finalité (purpose)
    if (confirmed.purpose === "shop_order" && meta.orderId) {
      const orderWithItems = await tx.order.findUnique({
        where: { id: meta.orderId },
        include: { items: { include: { product: { select: { id: true, tenantId: true } } } } },
      });

      if (orderWithItems && orderWithItems.status !== "paid") {
        order = await tx.order.update({
          where: { id: orderWithItems.id },
          data: { status: "paid" },
        });

        // Cashback 5% crédité sur le wallet
        if (order.cashback > 0) {
          const w = await ensureWallet(order.userId, tx);
          if (w) {
            wallet = await creditWallet(w.id, order.cashback, "cashback", order.id, tx);
          }
        }

        // Récompense du parrain à la première commande payée
        await rewardReferrerIfNeeded(order.userId, tx);

        // Décrémentation sécurisée des stocks (anti-stock négatif sous concurrence)
        for (const item of orderWithItems.items) {
          const currentProd = await tx.product.findUnique({ where: { id: item.productId } });
          const safeNextStock = Math.max(0, (currentProd?.stock ?? item.qty) - item.qty);
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: safeNextStock },
          });

          if (item.product.tenantId) {
            await tx.inventoryMovement.create({
              data: {
                tenantId: item.product.tenantId,
                productId: item.productId,
                type: "out",
                qty: item.qty,
                reason: "Commande boutique Kènè",
              },
            });
          }
        }

        // Notification cliente & institut
        const user = await tx.user.findUnique({ where: { id: order.userId } });
        if (user) {
          const orderTenantIds = [
            ...new Set(orderWithItems.items.map((i) => i.product.tenantId).filter((t): t is string => Boolean(t))),
          ];
          await notify(
            {
              userId: user.id,
              tenantId: orderTenantIds.length === 1 ? orderTenantIds[0] : null,
              channel: "sms",
              toPhone: user.phone,
              message: `Kènè : commande confirmée ✅ ${xof(order.total)} payés${order.cashback ? ` — ${xof(order.cashback)} de cashback crédités` : ""}. Livraison en cours de préparation.`,
            },
            tx
          );
        }
      }
    } else if (confirmed.purpose === "wallet_topup") {
      const userId = meta.userId ?? confirmed.userId;
      if (userId) {
        const w = await ensureWallet(userId, tx);
        if (w) {
          wallet = await creditWallet(w.id, confirmed.amount, "topup", confirmed.id, tx);
        }
      }
    } else if (confirmed.purpose === "appointment_deposit" && meta.appointmentId) {
      const appointment = await tx.appointment.findUnique({ where: { id: meta.appointmentId } });
      if (appointment && appointment.status === "pending") {
        const updated = await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: "confirmed", depositAmount: confirmed.amount },
        });

        await notify(
          {
            userId: updated.userId,
            tenantId: updated.tenantId,
            channel: "sms",
            toPhone: updated.clientPhone,
            message: `Kènè : acompte de ${xof(confirmed.amount)} reçu — votre RDV est confirmé ✅`,
          },
          tx
        );

        // Rappel automatique J-1 programmé
        const [svc, tnt] = await Promise.all([
          tx.service.findUnique({ where: { id: updated.serviceId }, select: { name: true } }),
          tx.tenant.findUnique({ where: { id: updated.tenantId }, select: { name: true } }),
        ]);

        const fireAt = new Date(new Date(updated.startAt).getTime() - 24 * 3_600_000);
        await notify(
          {
            userId: updated.userId,
            tenantId: updated.tenantId,
            channel: "whatsapp",
            toPhone: updated.clientPhone,
            message: `Kènè ✨ petit rappel : ${svc?.name ?? "ton soin"} chez ${tnt?.name ?? "l'institut"} le ${new Date(updated.startAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Préviens-nous si tu dois déplacer, sinon on t'attend avec plaisir !`,
            status: "scheduled",
            scheduledAt: fireAt.getTime() > Date.now() ? fireAt : new Date(),
            metaJson: JSON.stringify({ apptId: updated.id }),
          },
          tx
        );
      }
    } else if (confirmed.purpose === "subscription_renew" || confirmed.purpose === "subscription_activate") {
      const targetUserId = meta.userId || confirmed.userId;
      if (targetUserId) {
        const { renewPlan } = await import("@/lib/kene/plans");
        await renewPlan(targetUserId, confirmed.method || "saspay", meta.planId);
      }
    }

    return { stale: false as const, payment: confirmed, order, wallet };
  });

  if (outcome.stale) {
    const existing = await db.payment.findUnique({
      where: { id: paymentId },
      select: { status: true },
    });
    if (existing?.status === "success") {
      return { success: false, reason: "already_confirmed" };
    }
    return { success: false, reason: "not_found" };
  }

  return {
    success: true,
    payment: outcome.payment,
    order: outcome.order,
    wallet: outcome.wallet,
  };
}
