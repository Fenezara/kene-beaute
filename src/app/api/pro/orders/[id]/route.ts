// PATCH /api/pro/orders/[id] — suivi boutique par l'institut:
// • status "delivered": commande payée passée en « livrée »;
// • status "cancelled": annulation institut — remboursement wallet automatique
//   si payée par wallet, retour en stock des articles de CET institut,
//   cliente notifiée. Transaction atomique + réveil temps réel de l'espace Pro.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, notify, ensureWallet, creditWallet } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { pushTenantFeed } from "@/lib/kene/realtime";
import { xof } from "@/lib/kene/format";

const Body = z.object({
  status: z.enum(["paid", "preparing", "in_transit", "delivered", "cancelled"]),
  paymentMethod: z.enum(["cash", "wave", "orange", "card", "wallet"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = guardProRole(req, "pro:orders:[id]:patch");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Statut invalide (preparing | in_transit | delivered | cancelled)", 400);

    const { id } = await params;
    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { id: true, tenantId: true } } } },
        payment: true,
        user: { select: { id: true, name: true, phone: true } },
      },
    });
    // L'institut ne touche que les commandes contenant SES produits.
    if (!order || !order.items.some((i) => i.product.tenantId === tenant.id)) {
      return jsonError("Commande introuvable", 404);
    }

    const target = parsed.data.status;
    const paymentMethod = parsed.data.paymentMethod || "cash";

    if (target === "paid" && order.status !== "pending") {
      return jsonError("Seule une commande en attente peut être encaissée", 400);
    }
    if (target === "preparing" && order.status !== "paid" && order.status !== "pending") {
      return jsonError("Seule une commande payée ou en attente peut être mise en préparation", 400);
    }
    if (target === "in_transit" && order.status !== "paid" && order.status !== "preparing") {
      return jsonError("Seule une commande payée ou en préparation peut être expédiée", 400);
    }
    if (target === "delivered" && order.status !== "paid" && order.status !== "preparing" && order.status !== "in_transit" && order.status !== "pending") {
      return jsonError("Cette commande ne peut pas être marquée comme livrée", 400);
    }
    if (target === "cancelled" && order.status !== "pending" && order.status !== "paid" && order.status !== "preparing") {
      return jsonError("Cette commande ne peut plus être annulée", 400);
    }
    if (order.status === target) {
      return NextResponse.json({ order });
    }

    const ref = order.id.slice(-6).toUpperCase();
    const updated = await db.$transaction(async (tx) => {
      // Si la commande est encaissée manuellement en caisse ou à la livraison
      if (target === "paid" || (target === "delivered" && order.status === "pending")) {
        // Enregistrement d'un paiement en caisse si absent
        if (!order.paymentId) {
          const payment = await tx.payment.create({
            data: {
              purpose: "shop_order",
              method: paymentMethod,
              amount: order.total,
              status: "success",
              ref: `ENCAISSEMENT-${ref}-${Date.now()}`,
              userId: order.userId,
            },
          });
          await tx.order.update({
            where: { id: order.id },
            data: { paymentId: payment.id },
          });
        }
      }

      if (target === "cancelled") {
        // Remboursement wallet automatique (paiement wallet confirmé)
        if (order.payment?.method === "wallet" && order.payment.status === "success") {
          const w = await ensureWallet(order.userId, tx);
          if (w) await creditWallet(w.id, order.total, "refund", `cancel:${order.id}`, tx);
        }
        // Retour en stock des articles de CET institut uniquement si la commande avait été payée/préparée
        for (const item of order.items) {
          if (item.product.tenantId !== tenant.id) continue;
          if (order.status === "paid" || order.status === "preparing") {
            // le stock n'est décrémenté qu'au paiement — on ne rend que si payée
            await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.qty } } });
            await tx.inventoryMovement.create({
              data: { tenantId: tenant.id, productId: item.productId, type: "in", qty: item.qty, reason: "Annulation commande boutique" },
            });
          }
        }
      }
      return tx.order.update({ where: { id: order.id }, data: { status: target } });
    });

    // Cliente informée de l'état logistique de sa commande
    if (order.user) {
      let statusMsg = "";
      if (target === "preparing") {
        statusMsg = `Kènè : ta commande ${ref} est désormais en cours de préparation chez ${tenant.name} 🌿`;
      } else if (target === "in_transit") {
        statusMsg = `Kènè : ta commande ${ref} a été expédiée et est en cours d'acheminement 🚚`;
      } else if (target === "delivered") {
        statusMsg = `Kènè : ta commande ${ref} a été livrée avec succès 🎁 Prends grand soin de ta peau avec ${tenant.name} !`;
      } else if (target === "cancelled") {
        statusMsg = `Kènè : ta commande ${ref} a été annulée par ${tenant.name}.${
          order.payment?.method === "wallet" && order.payment.status === "success"
            ? ` ${xof(order.total)} remboursés sur ton wallet Kènè.`
            : order.payment?.status === "success"
              ? " Le remboursement est en cours de traitement."
              : ""
        }`;
      }

      if (statusMsg) {
        await notify({
          userId: order.user.id,
          tenantId: tenant.id,
          channel: "whatsapp",
          toPhone: order.user.phone,
          message: statusMsg,
        });
      }
    }

    pushTenantFeed(tenant.id);
    return NextResponse.json({ order: updated });
  } catch (err) {
    return serverError("pro/orders/[id]", err);
  }
}
