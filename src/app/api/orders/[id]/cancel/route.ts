// POST /api/orders/[id]/cancel — Annulation d'une commande par la cliente
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify, ensureWallet, creditWallet, debitWallet } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { pushTenantFeed } from "@/lib/kene/realtime";

const Body = z.object({
  userId: z.string().optional(),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(raw);
    const userId = parsed.success ? parsed.data.userId : undefined;

    const sess = sessionFromRequest(req);
    if (!sess) return jsonError("Session requise", 401);

    const order = await db.order.findUnique({
      where: { id },
      include: {
        payment: true,
        items: { include: { product: { select: { id: true, tenantId: true } } } },
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!order) return jsonError("Commande introuvable", 404);

    // Une cliente ne peut annuler QUE sa propre commande
    if (sess.role === "client" && order.userId !== sess.userId) {
      return jsonError("Cette commande ne t'appartient pas", 403);
    }

    if (order.status === "cancelled") {
      return jsonError("Cette commande est déjà annulée", 400);
    }
    if (order.status === "delivered") {
      return jsonError("Une commande déjà livrée ne peut plus être annulée", 400);
    }

    const ref = order.id.slice(-6).toUpperCase();

    // Annulation atomique en base
    const updated = await db.$transaction(async (tx) => {
      // Remboursement wallet si payée avec reprise du cashback accordé
      if (order.payment?.method === "wallet" && order.payment.status === "success") {
        const w = await ensureWallet(order.userId, tx);
        if (w) {
          await creditWallet(w.id, order.total, "refund", `cancel:${order.id}`, tx);
          if (order.cashback > 0) {
            await debitWallet(w.id, order.cashback, "Reprise cashback (commande annulée)", `clawback:${order.id}`, tx);
          }
        }
      }

      // Remise en stock si la commande avait été payée ou préparée
      if (order.status === "paid" || order.status === "preparing") {
        for (const item of order.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.qty } },
            });
            await tx.inventoryMovement.create({
              data: {
                tenantId: item.product?.tenantId ?? "system",
                productId: item.productId,
                type: "in",
                qty: item.qty,
                reason: `Annulation commande #${ref}`,
              },
            });
          }
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled" },
      });
    });

    // Notification aux instituts concernés par les produits
    const tenantIds = Array.from(new Set(order.items.map((i) => i.product.tenantId)));
    for (const tId of tenantIds) {
      pushTenantFeed(tId);

      notify({
        userId: order.userId,
        tenantId: tId,
        channel: "whatsapp",
        toPhone: order.user?.phone ?? "",
        message: `La commande #${ref} (${order.total.toLocaleString("fr-FR")} FCFA) a été annulée par ${order.user?.name ?? "la cliente"}.`,
        metaJson: JSON.stringify({ orderId: order.id, status: "cancelled_by_client" }),
      });
    }

    return NextResponse.json({
      ok: true,
      order: updated,
      message: `Commande #${ref} désactivée avec succès.`,
    });
  } catch (err) {
    return serverError("orders:cancel", err);
  }
}
