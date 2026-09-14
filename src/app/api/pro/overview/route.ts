// GET /api/pro/overview?tenantId= — tableau de bord institut (KPIs, CA, agenda, stock)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, dayStart, dayEnd, daysAgo, ddMM } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:overview:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const now = new Date();
    const since7 = new Date(now.getTime() - 7 * 86_400_000);
    const since30 = new Date(now.getTime() - 30 * 86_400_000);
    const completed = { tenantId: tenant.id, status: "completed" as string };

    const [salesToday, agg7, agg30, activeResources, apptsToday, newClients, sales14, sales30d, todayAppts, products, recentReviews] =
      await Promise.all([
        db.sale.findMany({ where: { ...completed, createdAt: { gte: dayStart() } }, select: { total: true } }),
        db.sale.aggregate({ where: { ...completed, createdAt: { gte: since7 } }, _sum: { total: true } }),
        db.sale.aggregate({ where: { ...completed, createdAt: { gte: since30 } }, _sum: { total: true }, _count: true }),
        db.resource.count({ where: { tenantId: tenant.id, active: true } }),
        db.appointment.count({
          where: { tenantId: tenant.id, startAt: { gte: dayStart(), lte: dayEnd() }, status: { not: "cancelled" } },
        }),
        db.clientProfile.count({ where: { tenantId: tenant.id, createdAt: { gte: since30 } } }),
        db.sale.findMany({
          where: { ...completed, createdAt: { gte: daysAgo(13) } },
          select: { createdAt: true, total: true },
        }),
        db.sale.findMany({
          where: { ...completed, createdAt: { gte: since30 } },
          select: {
            total: true,
            paymentMethod: true,
            items: { select: { kind: true, total: true, serviceId: true, service: { select: { name: true } } } },
          },
        }),
        db.appointment.findMany({
          where: { tenantId: tenant.id, startAt: { gte: dayStart(), lte: dayEnd() } },
          include: { service: { select: { name: true } }, resource: { select: { name: true } } },
          orderBy: { startAt: "asc" },
        }),
        db.product.findMany({ where: { tenantId: tenant.id } }),
        // Derniers avis déposés par les clientes depuis l'app (après RDV) —
        // remontés au tableau de bord: la gérante voit la parole cliente.
        db.review.findMany({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            user: { select: { name: true } },
            appointment: { select: { service: { select: { name: true } } } },
          },
        }),
      ]);

    const caToday = salesToday.reduce((s, x) => s + x.total, 0);
    const ca7d = agg7._sum.total ?? 0;
    const ca30d = agg30._sum.total ?? 0;
    const avgBasket = agg30._count > 0 ? Math.round(ca30d / agg30._count) : 0;
    const capacity = activeResources * Math.max(0, tenant.closingHour - tenant.openingHour) * 2;
    const occupancyPct = capacity > 0 ? Math.round((apptsToday / capacity) * 100) : 0;

    // CA des 14 derniers jours par jour
    const dayMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      dayMap.set(ddMM(daysAgo(i)), 0);
    }
    for (const s of sales14) {
      const key = ddMM(new Date(s.createdAt));
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + s.total);
    }
    const chart = [...dayMap.entries()].map(([date, total]) => ({ date, total }));

    // Répartition des encaissements 30 j
    const splitMap = new Map<string, number>();
    for (const s of sales30d) splitMap.set(s.paymentMethod, (splitMap.get(s.paymentMethod) ?? 0) + s.total);
    const paymentSplit = [...splitMap.entries()].map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total);

    // Top 5 prestations par CA 30 j
    const svcMap = new Map<string, { name: string; count: number; total: number }>();
    for (const s of sales30d) {
      for (const item of s.items) {
        if (item.kind !== "service" || !item.serviceId) continue;
        const row = svcMap.get(item.serviceId) ?? { name: item.service?.name ?? "Prestation", count: 0, total: 0 };
        row.count += 1;
        row.total += item.total;
        svcMap.set(item.serviceId, row);
      }
    }
    const topServices = [...svcMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

    // Alertes stock: produits sous le seuil (comparaison colonne à colonne en JS)
    const stockAlerts = products
      .filter((p) => p.stock <= p.stockAlert)
      .map((p) => ({ id: p.id, name: p.name, stock: p.stock, stockAlert: p.stockAlert }));

    return NextResponse.json({
      tenant,
      kpis: {
        caToday,
        ca7d,
        ca30d,
        avgBasket,
        appointmentsToday: apptsToday,
        newClients30d: newClients,
        occupancyPct,
      },
      chart,
      paymentSplit,
      topServices,
      todayAppointments: todayAppts.map((a) => ({
        id: a.id,
        clientName: a.clientName,
        service: a.service.name,
        resource: a.resource.name,
        startAt: a.startAt,
        status: a.status,
        price: a.price,
      })),
      stockAlerts,
      recentReviews: recentReviews.map((r) => ({
        id: r.id,
        clientName: r.user.name,
        rating: r.rating,
        comment: r.comment,
        serviceName: r.appointment?.service?.name ?? null,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    return serverError("pro/overview", err);
  }
}
