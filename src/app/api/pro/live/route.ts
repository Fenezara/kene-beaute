// GET /api/pro/live?tenantId= — flux temps réel institut (badge Pro, KPIs live)
// Payload VOLONTAIREMENT léger et diffable : le mini-service notify-service le
// sérialise et n'émet `tenant-feed` que si la sérialisation change (compteur
// qui bouge, dernier événement qui change). Jamais de liste lourde ici.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, dayStart, dayEnd } from "@/lib/kene/server";
import { xof } from "@/lib/kene/format";

interface LiveEvent {
  type: "appointment" | "order" | "sale";
  id: string;
  at: string;
  label: string;
  status?: string; // RDV : pending = réservé côté cliente (à confirmer)
}

export async function GET(req: NextRequest) {
  try {
    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);
    const now = new Date();

    const [pendingAppts, apptsToday, aggToday, ordersToday, lastAppt, lastOrder, lastSale] = await Promise.all([
      // RDV réservés par des clientes, à confirmer par l'institut
      db.appointment.count({ where: { tenantId: tenant.id, status: "pending", startAt: { gte: now } } }),
      db.appointment.count({
        where: { tenantId: tenant.id, startAt: { gte: dayStart(), lte: dayEnd() }, status: { not: "cancelled" } },
      }),
      db.sale.aggregate({ where: { tenantId: tenant.id, status: "completed", createdAt: { gte: dayStart() } }, _sum: { total: true } }),
      // Commandes boutique du jour contenant au moins un produit de l'institut
      db.order.count({ where: { createdAt: { gte: dayStart() }, items: { some: { product: { tenantId: tenant.id } } } } }),
      db.appointment.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, clientName: true, startAt: true, createdAt: true, status: true, service: { select: { name: true } } },
      }),
      db.order.findFirst({
        where: { items: { some: { product: { tenantId: tenant.id } } } },
        orderBy: { createdAt: "desc" },
        select: { id: true, total: true, createdAt: true, user: { select: { name: true } }, items: { select: { qty: true } } },
      }),
      db.sale.findFirst({
        where: { tenantId: tenant.id, status: "completed" },
        orderBy: { createdAt: "desc" },
        select: { id: true, total: true, createdAt: true, paymentMethod: true },
      }),
    ]);

    const candidates: LiveEvent[] = [];
    if (lastAppt) {
      candidates.push({
        type: "appointment",
        id: lastAppt.id,
        at: lastAppt.createdAt.toISOString(),
        status: lastAppt.status,
        label: `${lastAppt.service?.name ?? "RDV"} · ${lastAppt.clientName} · ${new Date(lastAppt.startAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`,
      });
    }
    if (lastOrder) {
      const articles = lastOrder.items.reduce((s, i) => s + i.qty, 0);
      candidates.push({
        type: "order",
        id: lastOrder.id,
        at: lastOrder.createdAt.toISOString(),
        label: `${xof(lastOrder.total)} · ${articles} article(s) · ${lastOrder.user?.name ?? "cliente"}`,
      });
    }
    if (lastSale) {
      candidates.push({
        type: "sale",
        id: lastSale.id,
        at: lastSale.createdAt.toISOString(),
        label: `${xof(lastSale.total)} · ${lastSale.paymentMethod}`,
      });
    }
    candidates.sort((a, b) => (a.at < b.at ? 1 : -1));

    return NextResponse.json({
      tenantId: tenant.id,
      pendingAppts,
      apptsToday,
      salesToday: aggToday._sum.total ?? 0,
      ordersToday,
      last: candidates[0] ?? null,
    });
  } catch (err) {
    return serverError("pro/live", err);
  }
}
