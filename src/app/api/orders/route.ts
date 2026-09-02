// POST /api/orders — commande boutique (wallet = paiement immédiat, MoMo = en attente)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef, debitWallet, creditWallet, notify, rewardReferrerIfNeeded } from "@/lib/kene/server";
import { CASHBACK_RATE, xof } from "@/lib/kene/format";

const Body = z.object({
  userId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(20) })).min(1),
  paymentMethod: z.enum(["wave", "orange", "wallet"]),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { userId, items, paymentMethod } = parsed.data;

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
    // Taux de cashback : celui de la wallet de la cliente, sinon le taux par défaut
    const wallet = await db.wallet.findUnique({ where: { userId } });
    const cashback = Math.round(subtotal * (wallet?.cashbackRate ?? CASHBACK_RATE));

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
      // Paiement wallet : solde vérifié puis débit immédiat (wallet déjà chargée ci-dessus)
      if (!wallet || wallet.balance < subtotal) {
        return jsonError("Solde wallet insuffisant — rechargez votre wallet Kènè", 400);
      }
      order = await db.order.create({
        data: { userId, subtotal, cashback, total: subtotal, status: "paid", items: { create: orderItemsData } },
      });
      payment = await db.payment.create({
        data: {
          userId,
          purpose: "shop_order",
          method: "wallet",
          amount: subtotal,
          status: "success",
          confirmedAt: new Date(),
          ref: genRef("PAY"),
          metaJson: JSON.stringify({ orderId: order.id }),
        },
      });
      await db.order.update({ where: { id: order.id }, data: { paymentId: payment.id } });

      await debitWallet(wallet.id, subtotal, "payment", order.id);
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
        data: { userId, subtotal, cashback, total: subtotal, status: "pending", items: { create: orderItemsData } },
      });
      payment = await db.payment.create({
        data: {
          userId,
          purpose: "shop_order",
          method: paymentMethod,
          amount: subtotal,
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
      message: `Kènè : commande ${order.id.slice(-6).toUpperCase()} enregistrée (${xof(subtotal)}${cashback ? `, ${xof(cashback)} de cashback` : ""}). Réf paiement ${payment.ref}.`,
    });

    const fullOrder = await db.order.findUnique({ where: { id: order.id }, include: { items: true } });
    return NextResponse.json({ order: fullOrder, payment: paid ? null : payment, paid }, { status: 201 });
  } catch (err) {
    return serverError("orders", err);
  }
}
