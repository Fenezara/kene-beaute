// GET /api/pro/overview?tenantId= — tableau de bord institut (KPIs, CA, agenda, stock)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, resolveProTenants, resolveUserProContext, dayStart, dayEnd, daysAgo, ddMM } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:overview:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const proTenants = await resolveProTenants(req);

    // Résolution stricte des droits du collaborateur/gérant connecté
    const sess = sessionFromRequest(req);
    const queryUserId = req.nextUrl.searchParams.get("userId");
    const targetUserId = sess?.userId || queryUserId;
    let viewer: {
      isOwner: boolean;
      employeeRole: string | null;
      employeePermissions: string[] | null;
      employeeName: string | null;
    } | null = null;
    if (targetUserId) {
      const dbUser = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, phone: true, name: true, role: true },
      });
      if (dbUser) {
        const proCtx = await resolveUserProContext(dbUser);
        viewer = {
          isOwner: proCtx.isOwner,
          employeeRole: proCtx.employeeRole,
          employeePermissions: proCtx.employeePermissions,
          employeeName: proCtx.employeeLink?.name ?? null,
        };
      }
    }

    const now = new Date();
    const todayStart = dayStart();
    const since7 = new Date(now.getTime() - 7 * 86_400_000);
    const since14 = daysAgo(13);
    const since30 = new Date(now.getTime() - 30 * 86_400_000);
    const completed = { tenantId: tenant.id, status: "completed" as string };
    const paidOrderStatuses = ["paid", "preparing", "in_transit", "delivered"];

    const [
      salesToday,
      agg7,
      agg30,
      activeResources,
      apptsToday,
      newClients,
      sales14,
      sales30d,
      todayAppts,
      appts14d,
      paidOrders30d,
      products,
      recentReviews,
      reviewStats,
      pendingOrders,
      cashExpenses30d,
      skinDiagnosesCount30d,
    ] = await Promise.all([
      db.sale.findMany({ where: { ...completed, createdAt: { gte: todayStart } }, select: { total: true } }),
      db.sale.aggregate({ where: { ...completed, createdAt: { gte: since7 } }, _sum: { total: true } }),
      db.sale.aggregate({ where: { ...completed, createdAt: { gte: since30 } }, _sum: { total: true }, _count: true }),
      db.resource.count({ where: { tenantId: tenant.id, active: true } }),
      db.appointment.count({
        where: { tenantId: tenant.id, startAt: { gte: todayStart, lte: dayEnd() }, status: { not: "cancelled" } },
      }),
      db.clientProfile.count({ where: { tenantId: tenant.id, createdAt: { gte: since30 } } }),
      db.sale.findMany({
        where: { ...completed, createdAt: { gte: since14 } },
        select: { createdAt: true, total: true },
      }),
      db.sale.findMany({
        where: { ...completed, createdAt: { gte: since30 } },
        select: {
          total: true,
          paymentMethod: true,
          items: {
            select: {
              kind: true,
              total: true,
              serviceId: true,
              productId: true,
              label: true,
              qty: true,
              service: { select: { name: true } },
              product: { select: { name: true } },
            },
          },
        },
      }),
      db.appointment.findMany({
        where: { tenantId: tenant.id, startAt: { gte: todayStart, lte: dayEnd() } },
        include: { service: { select: { name: true } }, resource: { select: { name: true } } },
        orderBy: { startAt: "asc" },
      }),
      db.appointment.findMany({
        where: { tenantId: tenant.id, startAt: { gte: since14, lte: dayEnd() }, status: { not: "cancelled" } },
        select: { startAt: true },
      }),
      db.order.findMany({
        where: {
          status: { in: paidOrderStatuses },
          createdAt: { gte: since30 },
          items: { some: { product: { tenantId: tenant.id } } },
        },
        select: {
          createdAt: true,
          payment: { select: { method: true } },
          items: {
            select: {
              total: true,
              product: { select: { id: true, name: true, tenantId: true } },
            },
          },
        },
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
          user: { select: { name: true, phone: true } },
          appointment: { select: { service: { select: { name: true } } } },
        },
      }),
      db.review.aggregate({
        where: { tenantId: tenant.id },
        _avg: { rating: true },
        _count: true,
      }),
      // Commandes en attente (ordonnances et boutique) contenant au moins un produit de l'institut
      db.order.findMany({
        where: {
          status: "pending",
          items: { some: { product: { tenantId: tenant.id } } },
        },
        include: {
          user: { select: { name: true, phone: true } },
          items: {
            where: { product: { tenantId: tenant.id } },
            select: { label: true, total: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      // Sorties de caisse (Journal CA cash_expense) du jour et sur 30j
      db.journalEntry.findMany({
        where: {
          tenantId: tenant.id,
          journalCode: "CA",
          sourceType: "cash_expense",
          date: { gte: since30 },
        },
        select: {
          date: true,
          lines: { where: { debit: { gt: 0 } }, select: { debit: true } },
        },
      }),
      // Diagnostics peau réalisés sur 30j
      db.proDiagnosis.count({
        where: { tenantId: tenant.id, createdAt: { gte: since30 } },
      }),
    ]);

    // Consolidation : Ventes Caisse POS + Commandes Boutique en ligne (articles appartenant à cet institut)
    const ordersWithOwnTotal = paidOrders30d
      .map((o) => ({
        createdAt: new Date(o.createdAt),
        method: o.payment?.method ?? "wallet",
        ownTotal: o.items.filter((i) => i.product.tenantId === tenant.id).reduce((s, i) => s + i.total, 0),
      }))
      .filter((o) => o.ownTotal > 0);

    const ordersTodayTotal = ordersWithOwnTotal
      .filter((o) => o.createdAt >= todayStart)
      .reduce((s, o) => s + o.ownTotal, 0);
    const orders7dTotal = ordersWithOwnTotal
      .filter((o) => o.createdAt >= since7)
      .reduce((s, o) => s + o.ownTotal, 0);
    const orders30dTotal = ordersWithOwnTotal.reduce((s, o) => s + o.ownTotal, 0);

    const caToday = salesToday.reduce((s, x) => s + x.total, 0) + ordersTodayTotal;
    const ca7d = (agg7._sum.total ?? 0) + orders7dTotal;
    const ca30d = (agg30._sum.total ?? 0) + orders30dTotal;
    const txCount30d = agg30._count + ordersWithOwnTotal.length;
    const avgBasket = txCount30d > 0 ? Math.round(ca30d / txCount30d) : 0;

    const openMinutes = Math.max(0, (tenant.closingHour ?? 19) - (tenant.openingHour ?? 9)) * 60;
    const totalCapacityMinutes = Math.max(1, activeResources) * openMinutes;
    const bookedMinutesToday = todayAppts
      .filter((a) => a.status !== "cancelled")
      .reduce((sum, a) => sum + (a.durationMin || 60), 0);
    const occupancyPct = totalCapacityMinutes > 0 ? Math.min(100, Math.round((bookedMinutesToday / totalCapacityMinutes) * 100)) : 0;

    // CA, transactions et RDV des 14 derniers jours par jour
    const dayMap = new Map<string, { total: number; count: number; apptsCount: number }>();
    for (let i = 13; i >= 0; i--) {
      dayMap.set(ddMM(daysAgo(i)), { total: 0, count: 0, apptsCount: 0 });
    }
    for (const s of sales14) {
      const key = ddMM(new Date(s.createdAt));
      const cur = dayMap.get(key);
      if (cur) {
        cur.total += s.total;
        cur.count += 1;
      }
    }
    for (const o of ordersWithOwnTotal) {
      if (o.createdAt < since14) continue;
      const key = ddMM(o.createdAt);
      const cur = dayMap.get(key);
      if (cur) {
        cur.total += o.ownTotal;
        cur.count += 1;
      }
    }
    for (const a of appts14d) {
      const key = ddMM(new Date(a.startAt));
      const cur = dayMap.get(key);
      if (cur) {
        cur.apptsCount += 1;
      }
    }
    const chart = [...dayMap.entries()].map(([date, val]) => ({
      date,
      total: val.total,
      count: val.count,
      apptsCount: val.apptsCount,
    }));

    // Répartition des encaissements 30 j (POS + Boutique en ligne)
    const splitMap = new Map<string, number>();
    for (const s of sales30d) splitMap.set(s.paymentMethod, (splitMap.get(s.paymentMethod) ?? 0) + s.total);
    for (const o of ordersWithOwnTotal) splitMap.set(o.method, (splitMap.get(o.method) ?? 0) + o.ownTotal);
    const paymentSplit = [...splitMap.entries()].map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total);

    // Dépenses de caisse (Journal CA)
    const expensesToday = cashExpenses30d
      .filter((e) => new Date(e.date) >= todayStart)
      .reduce((sum, e) => sum + e.lines.reduce((s, l) => s + l.debit, 0), 0);
    const expenses30d = cashExpenses30d.reduce(
      (sum, e) => sum + e.lines.reduce((s, l) => s + l.debit, 0),
      0
    );

    // CA attendu des RDV du jour restants (confirmés ou en cours)
    const expectedApptsToday = todayAppts
      .filter((a) => a.status === "confirmed" || a.status === "pending")
      .reduce((sum, a) => sum + (a.price || 0), 0);

    // Top 5 soins & Top 5 produits vendus sur 30j
    const svcMap = new Map<string, { name: string; count: number; total: number }>();
    const prodMap = new Map<string, { name: string; count: number; total: number }>();
    let totalServicesRevenue30d = 0;
    let totalProductsRevenue30d = 0;

    for (const s of sales30d) {
      for (const item of s.items) {
        if (item.kind === "service") {
          const key = item.serviceId || item.label;
          const row = svcMap.get(key) ?? { name: item.service?.name ?? item.label, count: 0, total: 0 };
          row.count += item.qty || 1;
          row.total += item.total;
          totalServicesRevenue30d += item.total;
          svcMap.set(key, row);
        } else if (item.kind === "product") {
          const key = item.productId || item.label;
          const row = prodMap.get(key) ?? { name: item.product?.name ?? item.label, count: 0, total: 0 };
          row.count += item.qty || 1;
          row.total += item.total;
          totalProductsRevenue30d += item.total;
          prodMap.set(key, row);
        }
      }
    }

    // Ajouter les commandes boutique dans les produits
    for (const o of paidOrders30d) {
      for (const item of o.items) {
        if (item.product?.tenantId === tenant.id) {
          const key = item.product.id || "boutique";
          const row = prodMap.get(key) ?? { name: item.product.name ?? "Produit Kènè", count: 0, total: 0 };
          row.count += 1;
          row.total += item.total;
          totalProductsRevenue30d += item.total;
          prodMap.set(key, row);
        }
      }
    }

    const topServices = [...svcMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);
    const topProducts = [...prodMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

    // Alertes stock: produits sous le seuil (comparaison colonne à colonne en JS)
    const stockAlerts = products
      .filter((p) => p.stock <= p.stockAlert)
      .map((p) => ({ id: p.id, name: p.name, stock: p.stock, stockAlert: p.stockAlert }));

    const tenantWithLiveReviews = {
      ...tenant,
      rating: reviewStats._count > 0 && reviewStats._avg.rating ? Math.round(reviewStats._avg.rating * 10) / 10 : tenant.rating,
      reviewCount: reviewStats._count > 0 ? reviewStats._count : tenant.reviewCount,
    };

    const pendingOrdersFormatted = pendingOrders.map((o) => {
      const ownItems = o.items;
      const ownTotal = ownItems.reduce((s, i) => s + i.total, 0);
      return {
        id: o.id,
        clientName: o.user.name,
        clientPhone: o.user.phone,
        total: ownTotal,
        itemsCount: ownItems.length,
        labels: ownItems.map((i) => i.label),
        createdAt: o.createdAt.toISOString(),
      };
    });

    const pendingOrdersCount = pendingOrdersFormatted.length;
    const pendingOrdersTotal = pendingOrdersFormatted.reduce((s, o) => s + o.total, 0);

    // Anniversaires clientes : du jour et du mois
    const clientsWithBirthdays = await db.clientProfile.findMany({
      where: { tenantId: tenant.id, birthDate: { not: null } },
      select: { id: true, name: true, phone: true, birthDate: true },
    });
    const curDay = now.getDate();
    const curMonth = now.getMonth() + 1; // 1-12
    const birthdaysToday: { id: string; name: string; phone: string; birthDate: string }[] = [];
    let birthdaysThisMonthCount = 0;

    for (const c of clientsWithBirthdays) {
      if (!c.birthDate) continue;
      const clean = c.birthDate.trim();
      let d: number | null = null;
      let m: number | null = null;
      if (clean.includes("/")) {
        const parts = clean.split("/");
        d = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
      } else if (clean.includes("-")) {
        const parts = clean.split("-");
        if (parts.length >= 3) {
          d = parseInt(parts[2], 10);
          m = parseInt(parts[1], 10);
        } else if (parts.length === 2) {
          m = parseInt(parts[0], 10);
          d = parseInt(parts[1], 10);
        }
      }
      if (m === curMonth) {
        birthdaysThisMonthCount += 1;
        if (d === curDay) {
          birthdaysToday.push({ id: c.id, name: c.name, phone: c.phone, birthDate: clean });
        }
      }
    }

    return NextResponse.json({
      tenant: tenantWithLiveReviews,
      viewer,
      tenants: proTenants.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        country: t.country,
        plan: t.plan,
        phone: t.phone,
      })),
      kpis: {
        caToday,
        ca7d,
        ca30d,
        avgBasket,
        appointmentsToday: apptsToday,
        newClients30d: newClients,
        occupancyPct,
        pendingOrdersCount,
        pendingOrdersTotal,
        expensesToday,
        expenses30d,
        expectedApptsToday,
        totalServicesRevenue30d,
        totalProductsRevenue30d,
        skinDiagnosesCount30d,
        bookedMinutesToday,
        totalCapacityMinutes,
      },
      chart,
      paymentSplit,
      topServices,
      topProducts,
      pendingOrders: pendingOrdersFormatted,
      todayAppointments: todayAppts.map((a) => ({
        id: a.id,
        clientName: a.clientName,
        service: a.service.name,
        serviceName: a.service.name,
        resource: a.resource.name,
        resourceName: a.resource.name,
        startAt: a.startAt,
        status: a.status,
        price: a.price,
      })),
      stockAlerts,
      recentReviews: recentReviews.map((r) => ({
        id: r.id,
        clientName: r.user.name,
        clientPhone: r.user.phone,
        rating: r.rating,
        comment: r.comment,
        serviceName: r.appointment?.service?.name ?? null,
        createdAt: r.createdAt,
      })),
      birthdays: {
        today: birthdaysToday,
        thisMonthCount: birthdaysThisMonthCount,
      },
    });
  } catch (err) {
    return serverError("pro/overview", err);
  }
}
