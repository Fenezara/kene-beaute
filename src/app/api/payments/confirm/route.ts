// POST /api/payments/confirm — confirme un paiement MoMo (code de confirmation)
// et déclenche les effets métier. t. 63-c :
//  • le paiement n'est confirmé QU'AVEC son code (confirmToken) — un simple
//    paymentId ne suffit plus (fin du « mint anonyme » de wallet/cashback) ;
//  • le passage pending → success est un updateMany CONDITIONNEL (anti-TOCTOU :
//    deux confirmations concurrentes ne passent qu'une seule fois) ;
//  • TOUS les effets consécutifs (crédit wallet topup, commande/acompte payé,
//    cashback, décrément stock + InventoryMovement, notifications) partagent
//    UNE seule prisma.$transaction — plus de panne partielle (commande payée
//    sans stock décrémenté).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Order, Payment, Wallet } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet, creditWallet, notify, rewardReferrerIfNeeded } from "@/lib/kene/server";
import { xof } from "@/lib/kene/format";
import { confirmTokenMatches, serializePayment } from "@/lib/kene/confirm-token";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, PAYMENTS_CONFIRM } from "@/lib/kene/rate-limit";

const Body = z.object({
  paymentId: z.string().min(1),
  // absent/vide → message dédié (contrat 63-b : le front passe r.payment.confirmToken)
  confirmToken: z.string().optional(),
});

type ConfirmOutcome =
  | { stale: true }
  | { stale: false; payment: Payment; order: Order | null; wallet: Wallet | null };

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "payments:confirm"), PAYMENTS_CONFIRM);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes de paiement — patiente quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { paymentId } = parsed.data;
    const confirmToken = parsed.data.confirmToken?.trim();
    if (!confirmToken) return jsonError("Code de confirmation requis", 400);

    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return jsonError("Paiement introuvable", 404);

    // Session signée (t. 71-b) : avec cookie, seul le compte propriétaire du
    // paiement (payment.userId) peut le confirmer ; sans cookie → legacy
    // (le code de confirmation reste la barrière anti-mint de t. 63-c).
    const guard = guardUserClaim(req, "payments:confirm", payment.userId ?? undefined);
    if (guard) return guard;

    if (!payment.confirmTokenHash) {
      return jsonError("Paiement sans code de confirmation — recommence l'opération", 400);
    }
    if (!confirmTokenMatches(confirmToken, payment.confirmTokenHash)) {
      return jsonError("Code de confirmation invalide", 400);
    }

    // Anti-TOCTOU + atomicité : le flip pending → success et TOUS les effets
    // métier sont dans la même transaction. Si une autre requête a déjà
    // confirmé (updateMany → count 0), tout est annulé, aucun effet rejoué.
    const outcome: ConfirmOutcome = await db.$transaction(async (tx) => {
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: "pending" },
        data: { status: "success", confirmedAt: new Date() },
      });
      if (res.count === 0) return { stale: true };

      const confirmed = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!confirmed) return { stale: true };

      const meta = confirmed.metaJson ? (JSON.parse(confirmed.metaJson) as Record<string, string>) : {};
      let order: Order | null = null;
      let wallet: Wallet | null = null;

      if (confirmed.purpose === "shop_order" && meta.orderId) {
        const orderWithItems = await tx.order.findUnique({
          where: { id: meta.orderId },
          include: { items: { include: { product: { select: { id: true, tenantId: true } } } } },
        });
        if (orderWithItems && orderWithItems.status !== "paid") {
          order = await tx.order.update({ where: { id: orderWithItems.id }, data: { status: "paid" } });

          // Cashback 5 % sur wallet
          if (order.cashback > 0) {
            const w = await ensureWallet(order.userId, tx);
            if (w) wallet = await creditWallet(w.id, order.cashback, "cashback", order.id, tx);
          }

          // Parrainage : récompense du parrain à la première commande payée
          await rewardReferrerIfNeeded(order.userId, tx);

          // Sorties de stock (+ mouvements pour les produits rattachés à un tenant)
          for (const item of orderWithItems.items) {
            await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.qty } } });
            if (item.product.tenantId) {
              await tx.inventoryMovement.create({
                data: { tenantId: item.product.tenantId, productId: item.productId, type: "out", qty: item.qty, reason: "Commande boutique Kènè" },
              });
            }
          }

          const user = await tx.user.findUnique({ where: { id: order.userId } });
          if (user) {
            await notify({
              userId: user.id,
              channel: "sms",
              toPhone: user.phone,
              message: `Kènè : commande confirmée ✅ ${xof(order.total)} payés${order.cashback ? ` — ${xof(order.cashback)} de cashback crédités` : ""}. Livraison en cours de préparation.`,
            }, tx);
          }
        }
      } else if (confirmed.purpose === "wallet_topup") {
        const userId = meta.userId ?? confirmed.userId;
        if (userId) {
          const w = await ensureWallet(userId, tx);
          if (w) wallet = await creditWallet(w.id, confirmed.amount, "topup", confirmed.id, tx);
        }
      } else if (confirmed.purpose === "appointment_deposit" && meta.appointmentId) {
        const appointment = await tx.appointment.findUnique({ where: { id: meta.appointmentId } });
        if (appointment && appointment.status === "pending") {
          const updated = await tx.appointment.update({
            where: { id: appointment.id },
            data: { status: "confirmed", depositAmount: confirmed.amount },
          });
          await notify({
            userId: updated.userId,
            tenantId: updated.tenantId,
            channel: "sms",
            toPhone: updated.clientPhone,
            message: `Kènè : acompte de ${xof(confirmed.amount)} reçu — votre RDV est confirmé ✅`,
          }, tx);
          // Rappel automatique J-1 réel : programmé 24 h avant le RDV, envoyé au
          // fil de l'eau par le due-runner (GET /api/notifications).
          const [svc, tnt] = await Promise.all([
            tx.service.findUnique({ where: { id: updated.serviceId }, select: { name: true } }),
            tx.tenant.findUnique({ where: { id: updated.tenantId }, select: { name: true } }),
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
          }, tx);
        }
      }

      return { stale: false, payment: confirmed, order, wallet };
    });

    if (outcome.stale) {
      // updateMany a raté : déjà confirmé par une requête concurrente, ou disparu.
      const again = await db.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
      if (again?.status === "success") return jsonError("Paiement déjà confirmé", 400);
      return jsonError("Paiement introuvable", 404);
    }

    return NextResponse.json({
      payment: serializePayment(outcome.payment),
      order: outcome.order ?? undefined,
      wallet: outcome.wallet ?? undefined,
    });
  } catch (err) {
    return serverError("payments/confirm", err);
  }
}
