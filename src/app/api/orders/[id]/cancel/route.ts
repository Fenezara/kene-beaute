// POST /api/orders/[id]/cancel — Annulation d'une commande par la cliente
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify, ensureWallet, creditWallet } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
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

    const guard = guardUserClaim(req, "orders:cancel", userId);
    if (guard) return guard;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        payment: true,
        items: { include: { product: { select: { id: true, tenantId: true } } } },
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!order) return jsonError("Commande introuvable", 404);

    // Vérification d'appartenance si userId fourni
    if (userId && order.userId !== userId) {
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
      // Remboursement wallet si payée
      if (order.payment?.method === "wallet" && order.payment.status === "success") {
        const w = await ensureWallet(order.userId, tx);
        if (w) {
          await creditWallet(w.id, order.total, "refund", `cancel:${order.id}`, tx);
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
