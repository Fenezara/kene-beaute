// GET /api/admin/orders — Liste centralisée de toutes les commandes de la plateforme
// PATCH /api/admin/orders — Mise à jour du statut d'une commande par l'administrateur
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { serverError, jsonError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest): NextResponse | null {
  const sess = sessionFromRequest(req);
  if (!sess) {
    return NextResponse.json(
      { error: "Console de gestion réservée aux comptes admin — reconnecte-toi" },
      { status: 401 },
    );
  }
  if (sess.role !== "admin") {
    return NextResponse.json({ error: "Console admin réservée aux comptes admin" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:orders"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const guard = requireAdmin(req);
  if (guard) return guard;

  try {
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const status = req.nextUrl.searchParams.get("status")?.trim().toLowerCase() ?? "all";
    const limit = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get("limit") || 100)));

    const whereClause: any = {};

    if (status && status !== "all") {
      whereClause.status = status;
    }

    if (q) {
      whereClause.OR = [
        { id: { contains: q } },
        { deliveryCity: { contains: q } },
        { deliveryArea: { contains: q } },
        { deliveryAddress: { contains: q } },
        { deliveryPhone: { contains: q } },
        { user: { name: { contains: q } } },
        { user: { phone: { contains: q } } },
        { couponCode: { contains: q } },
      ];
    }

    const [orders, totalCount, paidCount, preparingCount, inTransitCount, deliveredCount, pendingCount, cancelledCount] =
      await Promise.all([
        db.order.findMany({
          where: whereClause,
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
            payment: { select: { id: true, method: true, status: true, ref: true, createdAt: true } },
            items: {
              include: {
                product: {
                  select: { id: true, name: true, brandLine: true, image: true, tenant: { select: { id: true, name: true } } },
                },
              },
            },
          },
        }),
        db.order.count(),
        db.order.count({ where: { status: "paid" } }),
        db.order.count({ where: { status: "preparing" } }),
        db.order.count({ where: { status: "in_transit" } }),
        db.order.count({ where: { status: "delivered" } }),
        db.order.count({ where: { status: "pending" } }),
        db.order.count({ where: { status: "cancelled" } }),
      ]);

    const totalRevenue = orders
      .filter((o) => ["paid", "preparing", "in_transit", "delivered"].includes(o.status))
      .reduce((acc, o) => acc + o.total, 0);

    return NextResponse.json({
      orders,
      stats: {
        total: totalCount,
        paid: paidCount,
        preparing: preparingCount,
        inTransit: inTransitCount,
        delivered: deliveredCount,
        pending: pendingCount,
        cancelled: cancelledCount,
        totalRevenue,
      },
    });
  } catch (err) {
    return serverError("admin/orders:get", err);
  }
}

const PatchSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["pending", "paid", "preparing", "in_transit", "delivered", "cancelled"]),
});

export async function PATCH(req: NextRequest) {
  const guard = requireAdmin(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Corps de requête invalide", 400);
    }

    const { orderId, status } = parsed.data;

    const existing = await db.order.findUnique({
      where: { id: orderId },
    });

    if (!existing) {
      return jsonError("Commande introuvable", 404);
    }

    const updated = await db.order.update({
      where: { id: orderId },
      data: { status },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        payment: true,
        items: true,
      },
    });

    const sess = sessionFromRequest(req);
    void audit({
      kind: "admin_action",
      userId: sess?.userId,
      ip: clientIp(req),
      detail: `order_status_update:${orderId}:${existing.status}->${status}`,
    });

    return NextResponse.json({ success: true, order: updated });
  } catch (err) {
    return serverError("admin/orders:patch", err);
  }
}
