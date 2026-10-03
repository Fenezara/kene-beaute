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
  status: z.enum(["delivered", "cancelled"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = guardProRole(req, "pro:orders:[id]:patch");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Statut invalide (delivered | cancelled)", 400);

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
    if (target === "delivered" && order.status !== "paid") {
      return jsonError("Seule une commande payée peut être marquée livrée", 400);
    }
    if (target === "cancelled" && order.status !== "pending" && order.status !== "paid") {
      return jsonError("Cette commande ne peut plus être annulée", 400);
    }
    if (order.status === target) {
      return NextResponse.json({ order });
    }

    const ref = order.id.slice(-6).toUpperCase();
    const updated = await db.$transaction(async (tx) => {
      if (target === "cancelled") {
        // Remboursement wallet automatique (paiement wallet confirmé)
        if (order.payment?.method === "wallet" && order.payment.status === "success") {
          const w = await ensureWallet(order.userId, tx);
          if (w) await creditWallet(w.id, order.total, "refund", `cancel:${order.id}`, tx);
        }
        // Retour en stock des articles de CET institut uniquement
        for (const item of order.items) {
          if (item.product.tenantId !== tenant.id) continue;
          if (order.status === "paid") {
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

    // Cliente informée de la décision de l'institut (ligne + temps réel léger)
    if (order.user) {
      await notify({
        userId: order.user.id,
        tenantId: tenant.id,
        channel: "whatsapp",
        toPhone: order.user.phone,
        message:
          target === "delivered"
            ? `Kènè : ta commande ${ref} a été livrée 🎁 À bientôt chez ${tenant.name} !`
            : `Kènè : ta commande ${ref} a été annulée par ${tenant.name}.${
                order.payment?.method === "wallet" && order.payment.status === "success"
                  ? ` ${xof(order.total)} remboursés sur ton wallet Kènè.`
                  : order.payment?.status === "success"
                    ? " Le remboursement est en cours de traitement."
                    : ""
              }`,
      });
    }

    pushTenantFeed(tenant.id);
    return NextResponse.json({ order: updated });
  } catch (err) {
    return serverError("pro/orders/[id]", err);
  }
}
