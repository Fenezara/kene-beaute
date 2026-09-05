// POST /api/orders — commande boutique (wallet = paiement immédiat, MoMo = en attente)
// couponCode (facultatif) : validé puis consommé via lib/kene/coupons — la
// remise réduit le total payé, le cashback s'applique sur le montant payé.
// t. 63-c : le flux complet (order.create, consommation coupon, payment.create,
// order.update paymentId, débit/crédit wallet, cashback, parrainage, sorties de
// stock + InventoryMovement, notification) passe dans UNE prisma.$transaction —
// plus de panne partielle. Le paiement MoMo pending porte un code de confirmation
// (confirmToken renvoyé au front, hash sha256 stocké). Les push temps réel
// institut restent best-effort, APRÈS le commit.
// GET /api/orders?userId= — historique des commandes de la cliente (« Mes commandes ») :
// la cliente consulte ses données enregistrées, l'institut les voit côté CRM/Caisse.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef, debitWallet, creditWallet, notify, rewardReferrerIfNeeded } from "@/lib/kene/server";
import { CASHBACK_RATE, xof } from "@/lib/kene/format";
import { checkCoupon, redeemCoupon } from "@/lib/kene/coupons";
import { newConfirmToken, paymentWithConfirmToken } from "@/lib/kene/confirm-token";
import { pushTenantFeed } from "@/lib/kene/realtime";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ORDERS_CREATE } from "@/lib/kene/rate-limit";

const Body = z.object({
  userId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(20) })).min(1),
  paymentMethod: z.enum(["wave", "orange", "wallet"]),
  couponCode: z.string().trim().max(40).optional(),
});

/** Erreur métier à remonter en 400 : le throw annule la transaction entière. */
class OrderFlowError extends Error {}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
    if (!userId) return jsonError("userId requis", 400);
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const orders = await db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { items: { orderBy: { label: "asc" } } },
    });
    return NextResponse.json({ orders });
  } catch (err) {
    return serverError("orders GET", err);
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "orders:create"), ORDERS_CREATE);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de commandes à la suite — patiente quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { userId, items, paymentMethod, couponCode } = parsed.data;

    // Session signée (t. 71-b, migration douce) : avec cookie, la commande ne
    // peut passer que pour le compte de la session ; sans cookie → legacy.
    const guard = guardUserClaim(req, "orders:post", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const productIds = items.map((i) => i.productId);
    const products = await db.product.findMany({ where: { id: { in: productIds }, active: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of items) {
      const p = byId.get(item.productId);
      if (!p) return jsonError(`Produit introuvable : ${item.productId}`, 404);
      if (p.stock < item.qty) return jsonError(`Stock insuffisant pour « ${p.name} » (${p.stock} dispo)`, 400);
    }

    const lines = items.map((i) => {
      const p = byId.get(i.productId)!;
      return { product: p, qty: i.qty, total: p.price * i.qty };
    });
    const subtotal = lines.reduce((s, l) => s + l.total, 0);

    // Coupon : validation complète AVANT toute écriture (garde d'usage incluse)
    let discount = 0;
    let appliedCouponId: string | null = null;
    if (couponCode) {
      const check = await checkCoupon(couponCode, subtotal, userId);
      if (!check.ok) return jsonError(check.error ?? "Code promo invalide", 400);
      discount = check.discount ?? 0;
      appliedCouponId = check.coupon?.id ?? null;
    }
    const total = subtotal - discount;

    // Taux de cashback : celui de la wallet de la cliente, sinon le taux par défaut
    // — appliqué au montant PAYÉ (après remise)
    const wallet = await db.wallet.findUnique({ where: { userId } });
    if (paymentMethod === "wallet" && (!wallet || wallet.balance < total)) {
      return jsonError("Solde wallet insuffisant — rechargez votre wallet Kènè", 400);
    }
    const cashback = Math.round(total * (wallet?.cashbackRate ?? CASHBACK_RATE));

    const orderItemsData = lines.map((l) => ({
      productId: l.product.id,
      label: l.product.name,
      qty: l.qty,
      unitPrice: l.product.price,
      total: l.total,
    }));

    // ─── Transaction atomique : commande + coupon + paiement + wallet + stock ───
    const created = await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: { userId, subtotal, discount, couponCode: appliedCouponId ? couponCode!.toUpperCase() : null, cashback, total, status: paymentMethod === "wallet" ? "paid" : "pending", items: { create: orderItemsData } },
      });

      // Consommation du coupon DANS la transaction : si la garde échoue
      // (usage simultané), le throw annule commande + items d'un coup.
      if (appliedCouponId) {
        const redeemed = await redeemCoupon(appliedCouponId, userId, subtotal, order.id, tx);
        if (!redeemed.ok) throw new OrderFlowError(redeemed.error);
      }

      let paymentId: string | null = null;
      let paymentRef = "";
      let confirmToken: string | null = null;
      let paid = false;

      if (paymentMethod === "wallet") {
        // Paiement wallet : débit immédiat (sur le total remisé), pas de code
        // de confirmation (succès instantané).
        const payment = await tx.payment.create({
          data: {
            userId,
            purpose: "shop_order",
            method: "wallet",
            amount: total,
            status: "success",
            confirmedAt: new Date(),
            ref: genRef("PAY"),
            metaJson: JSON.stringify({ orderId: order.id }),
          },
        });
        await tx.order.update({ where: { id: order.id }, data: { paymentId: payment.id } });
        paymentId = payment.id;
        paymentRef = payment.ref;

        await debitWallet(wallet!.id, total, "payment", order.id, tx);
        await creditWallet(wallet!.id, cashback, "cashback", order.id, tx);
        // Parrainage : récompense du parrain à la première commande payée
        await rewardReferrerIfNeeded(userId, tx);

        // Sorties de stock (+ mouvements pour les produits rattachés à un tenant)
        for (const l of lines) {
          await tx.product.update({ where: { id: l.product.id }, data: { stock: { decrement: l.qty } } });
          if (l.product.tenantId) {
            await tx.inventoryMovement.create({
              data: { tenantId: l.product.tenantId, productId: l.product.id, type: "out", qty: l.qty, reason: "Commande boutique Kènè" },
            });
          }
        }
        paid = true;
      } else {
        // MoMo (wave/orange) : commande en attente — le paiement pending porte
        // un code de confirmation (contrat 63-b : token brut renvoyé, hash stocké).
        const { token, tokenHash } = newConfirmToken();
        const payment = await tx.payment.create({
          data: {
            userId,
            purpose: "shop_order",
            method: paymentMethod,
            amount: total,
            status: "pending",
            ref: genRef("PAY"),
            metaJson: JSON.stringify({ orderId: order.id }),
            confirmTokenHash: tokenHash,
          },
        });
        await tx.order.update({ where: { id: order.id }, data: { paymentId: payment.id } });
        paymentId = payment.id;
        paymentRef = payment.ref;
        confirmToken = token;
      }

      await notify({
        userId,
        channel: "sms",
        toPhone: user.phone,
        message: `Kènè : commande ${order.id.slice(-6).toUpperCase()} enregistrée (${xof(total)}${discount ? `, remise ${xof(discount)} appliquée` : ""}${cashback ? `, ${xof(cashback)} de cashback` : ""}). Réf paiement ${paymentRef}.`,
      }, tx);

      return { orderId: order.id, paymentId, confirmToken, paid };
    });

    // Temps réel institut (best-effort, HORS transaction) : si la commande
    // contient des produits de l'institut, l'espace Pro connecté est réveillé
    // (badge + toast + KPIs). Les produits maison (tenantId null) ne
    // concernent aucun institut → silence.
    for (const t of new Set(lines.map((l) => l.product.tenantId).filter((t): t is string => !!t))) {
      pushTenantFeed(t);
    }

    const fullOrder = await db.order.findUnique({ where: { id: created.orderId }, include: { items: true } });
    const paymentRow = created.paymentId ? await db.payment.findUnique({ where: { id: created.paymentId } }) : null;
    const paymentOut = !created.paid && paymentRow && created.confirmToken
      ? paymentWithConfirmToken(paymentRow, created.confirmToken)
      : null;
    return NextResponse.json({ order: fullOrder, payment: paymentOut, paid: created.paid }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderFlowError) return jsonError(err.message, 400);
    return serverError("orders", err);
  }
}
