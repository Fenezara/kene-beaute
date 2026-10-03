// GET /api/pro/orders?tenantId= — commandes boutique passées par les
// clientes DEPUIS L'APP et contenant au moins un produit de CET institut.
// SYNCHRO CLIENT→INSTITUT: jusque-là l'institut ne voyait qu'un compteur
// du jour (flux live) — voici la liste complète: cliente, articles, statut
// de paiement/livraison, coupon utilisé. Le CA boutique ne compte que les
// articles de l'institut (une commande mixte peut contenir des produits
// d'autres instituts ou maison).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, dayStart } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:orders:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const orders = await db.order.findMany({
      where: { items: { some: { product: { tenantId: tenant.id } } } },
      include: {
        items: { orderBy: { label: "asc" }, include: { product: { select: { tenantId: true } } } },
        user: { select: { id: true, name: true, phone: true } },
        payment: { select: { method: true, status: true, ref: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // KPIs: articles DE L'INSTITUT uniquement (commandes mixtes neutralisées)
    const ownItems = (o: (typeof orders)[number]) => o.items.filter((i) => i.product.tenantId === tenant.id);
    const today = dayStart();
    const kpis = {
      today: orders.filter((o) => new Date(o.createdAt) >= today).length,
      toPay: orders.filter((o) => o.status === "pending").length,
      toDeliver: orders.filter((o) => o.status === "paid").length,
      revenue30d: orders
        .filter((o) => new Date(o.createdAt) >= since30 && (o.status === "paid" || o.status === "delivered"))
        .reduce((s, o) => s + ownItems(o).reduce((x, i) => x + i.total, 0), 0),
    };

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        status: o.status,
        clientName: o.user.name,
        clientPhone: o.user.phone,
        items: o.items.map((i) => ({ label: i.label, qty: i.qty, unitPrice: i.unitPrice, total: i.total, mine: i.product.tenantId === tenant.id })),
        total: o.total,
        discount: o.discount,
        couponCode: o.couponCode,
        ownTotal: ownItems(o).reduce((x, i) => x + i.total, 0),
        payment: o.payment ? { method: o.payment.method, status: o.payment.status, ref: o.payment.ref } : null,
      })),
      kpis,
    });
  } catch (err) {
    return serverError("pro/orders", err);
  }
}
