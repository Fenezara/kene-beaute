// POST /api/orders — commande boutique (wallet = paiement immédiat, MoMo = en attente)
// couponCode (facultatif) : validé puis consommé via lib/kene/coupons — la
// remise réduit le total payé, le cashback s'applique sur le montant payé.
// GET /api/orders?userId= — historique des commandes de la cliente (« Mes commandes ») :
// la cliente consulte ses données enregistrées, l'institut les voit côté CRM/Caisse.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef, debitWallet, creditWallet, notify, rewardReferrerIfNeeded } from "@/lib/kene/server";
import { CASHBACK_RATE, xof } from "@/lib/kene/format";
import { checkCoupon, redeemCoupon } from "@/lib/kene/coupons";
import { pushTenantFeed } from "@/lib/kene/realtime";

const Body = z.object({
  userId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(20) })).min(1),
  paymentMethod: z.enum(["wave", "orange", "wallet"]),
  couponCode: z.string().trim().max(40).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
    if (!userId) return jsonError("userId requis", 400);
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const orders = await db.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { label: "asc" } } },
    });
    return NextResponse.json({ orders });
  } catch (err) {
    return serverError("orders GET", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { userId, items, paymentMethod, couponCode } = parsed.data;

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
    const cashback = Math.round(total * (wallet?.cashbackRate ?? CASHBACK_RATE));

    const orderItemsData = lines.map((l) => ({
      productId: l.product.id,
      label: l.product.name,
      qty: l.qty,
      unitPrice: l.product.price,
      total: l.total,
    }));

    let order;
    let payment: Awaited<ReturnType<typeof db.payment.create>> | null = null;
    let paid = false;

    if (paymentMethod === "wallet") {
      // Paiement wallet : solde vérifié puis débit immédiat (sur le total remisé)
      if (!wallet || wallet.balance < total) {
        return jsonError("Solde wallet insuffisant — rechargez votre wallet Kènè", 400);
      }
      order = await db.order.create({
        data: { userId, subtotal, discount, couponCode: appliedCouponId ? couponCode!.toUpperCase() : null, cashback, total, status: "paid", items: { create: orderItemsData } },
      });

      // Consommation du coupon AVANT tout effet de bord (wallet/stock) : si la
      // garde échoue (usage simultané), la commande est supprimée proprement.
      if (appliedCouponId) {
        const redeemed = await redeemCoupon(appliedCouponId, userId, subtotal, order.id);
        if (!redeemed.ok) {
          await db.order.delete({ where: { id: order.id } }).catch(() => undefined); // cascade items
          return jsonError(redeemed.error, 400);
        }
      }

      payment = await db.payment.create({
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
      await db.order.update({ where: { id: order.id }, data: { paymentId: payment.id } });

      await debitWallet(wallet.id, total, "payment", order.id);
      await creditWallet(wallet.id, cashback, "cashback", order.id);
      // Parrainage : récompense du parrain à la première commande payée
      await rewardReferrerIfNeeded(userId);

      // Sorties de stock (+ mouvements pour les produits rattachés à un tenant)
      for (const l of lines) {
        await db.product.update({ where: { id: l.product.id }, data: { stock: { decrement: l.qty } } });
        if (l.product.tenantId) {
          await db.inventoryMovement.create({
            data: { tenantId: l.product.tenantId, productId: l.product.id, type: "out", qty: l.qty, reason: "Commande boutique Kènè" },
          });
        }
      }
      paid = true;
    } else {
      // MoMo (wave/orange) : commande en attente de confirmation du paiement
      order = await db.order.create({
        data: { userId, subtotal, discount, couponCode: appliedCouponId ? couponCode!.toUpperCase() : null, cashback, total, status: "pending", items: { create: orderItemsData } },
      });

      // Consommation du coupon avant création du paiement (même logique anti-course)
      if (appliedCouponId) {
        const redeemed = await redeemCoupon(appliedCouponId, userId, subtotal, order.id);
        if (!redeemed.ok) {
          await db.order.delete({ where: { id: order.id } }).catch(() => undefined); // cascade items
          return jsonError(redeemed.error, 400);
        }
      }

      payment = await db.payment.create({
        data: {
          userId,
          purpose: "shop_order",
          method: paymentMethod,
          amount: total,
          status: "pending",
          ref: genRef("PAY"),
          metaJson: JSON.stringify({ orderId: order.id }),
        },
      });
      await db.order.update({ where: { id: order.id }, data: { paymentId: payment.id } });
    }

    await notify({
      userId,
      channel: "sms",
      toPhone: user.phone,
      message: `Kènè : commande ${order.id.slice(-6).toUpperCase()} enregistrée (${xof(total)}${discount ? `, remise ${xof(discount)} appliquée` : ""}${cashback ? `, ${xof(cashback)} de cashback` : ""}). Réf paiement ${payment.ref}.`,
    });

    // Temps réel institut : si la commande contient des produits de l'institut,
    // l'espace Pro connecté est réveillé (badge + toast + KPIs). Les produits
    // maison (tenantId null) ne concernent aucun institut → silence.
    for (const t of new Set(lines.map((l) => l.product.tenantId).filter((t): t is string => !!t))) {
      pushTenantFeed(t);
    }

    const fullOrder = await db.order.findUnique({ where: { id: order.id }, include: { items: true } });
    return NextResponse.json({ order: fullOrder, payment: paid ? null : payment, paid }, { status: 201 });
  } catch (err) {
    return serverError("orders", err);
  }
}
