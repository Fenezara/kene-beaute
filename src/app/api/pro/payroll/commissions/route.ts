// GET & POST /api/pro/payroll/commissions?tenantId=&period=YYYY-MM
// Gestion souveraine des primes et commissions praticiennes par le Patron / Direction.
// Les primes sont attribuées par la direction (instantanée, fin de journée ou fin de mois).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, resolveUserProContext } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";

export const runtime = "nodejs";

export interface PractitionerCommission {
  employeeId: string;
  name: string;
  role: string;
  servicesRevenue: number;
  servicesCount: number;
  serviceCommissionRate: number;
  serviceCommission: number;
  productsRevenue: number;
  productsCount: number;
  productCommissionRate: number;
  productCommission: number;
  totalCommission: number;
  awardedBonus: number; // Montant officiel attribué par le patron
  bonuses: Array<{ id: string; amount: number; reason: string; moment: string; createdAt: string; awardedBy: string }>;
  salesCount: number;
}

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:payroll:commissions:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const periodParam = req.nextUrl.searchParams.get("period");
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const period = periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : currentPeriod;

    const [yearStr, monthStr] = period.split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;

    const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

    // Récupérer toutes les ventes terminées de la période avec leurs lignes d'articles
    const sales = await db.sale.findMany({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: start, lte: end },
        status: "completed",
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Récupérer les employées de l'institut
    const employees = await db.employee.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
    });

    // Récupérer les primes expressément attribuées par le patron pour cette période
    const bonusLogs = await db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entity: "employee_bonus",
        action: "awarded",
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "desc" },
    });

    const employeeMap = new Map<string, PractitionerCommission>();

    for (const emp of employees) {
      employeeMap.set(emp.name.toLowerCase().trim(), {
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        servicesRevenue: 0,
        servicesCount: 0,
        serviceCommissionRate: 0.10,
        serviceCommission: 0,
        productsRevenue: 0,
        productsCount: 0,
        productCommissionRate: 0.05,
        productCommission: 0,
        totalCommission: 0,
        awardedBonus: 0,
        bonuses: [],
        salesCount: 0,
      });
    }

    // Répartition des ventes
    let unassignedServicesRevenue = 0;
    let unassignedProductsRevenue = 0;
    let unassignedSalesCount = 0;

    for (const sale of sales) {
      const cashierKey = (sale.cashierName ?? "").toLowerCase().trim();
      let matchedCommission = employeeMap.get(cashierKey);

      if (!matchedCommission && cashierKey) {
        for (const [key, val] of employeeMap.entries()) {
          if (key.includes(cashierKey) || cashierKey.includes(key)) {
            matchedCommission = val;
            break;
          }
        }
      }

      let saleServicesRevenue = 0;
      let saleServicesCount = 0;
      let saleProductsRevenue = 0;
      let saleProductsCount = 0;

      for (const item of sale.items) {
        if (item.kind === "service") {
          saleServicesRevenue += item.total;
          saleServicesCount += item.qty;
        } else {
          saleProductsRevenue += item.total;
          saleProductsCount += item.qty;
        }
      }

      if (matchedCommission) {
        matchedCommission.salesCount += 1;
        matchedCommission.servicesRevenue += saleServicesRevenue;
        matchedCommission.servicesCount += saleServicesCount;
        matchedCommission.productsRevenue += saleProductsRevenue;
        matchedCommission.productsCount += saleProductsCount;
      } else {
        unassignedSalesCount += 1;
        unassignedServicesRevenue += saleServicesRevenue;
        unassignedProductsRevenue += saleProductsRevenue;
      }
    }

    // Intégration des primes patronales attribuées
    for (const log of bonusLogs) {
      try {
        const d = JSON.parse(log.detailsJson || "{}");
        const empId = log.entityId;
        const matched = Array.from(employeeMap.values()).find((e) => e.employeeId === empId);
        if (matched) {
          const amt = Number(d.amount) || 0;
          matched.awardedBonus += amt;
          matched.bonuses.push({
            id: log.id,
            amount: amt,
            reason: d.reason || "Prime de direction",
            moment: d.moment || "direction",
            createdAt: log.createdAt.toISOString(),
            awardedBy: d.awardedBy || "Direction",
          });
        }
      } catch {}
    }

    // Calculer les montants finaux de commission
    const practitioners: PractitionerCommission[] = [];
    let totalServicesRevenue = 0;
    let totalProductsRevenue = 0;
    let totalCommissions = 0;
    let totalAwardedBonuses = 0;

    for (const comm of employeeMap.values()) {
      comm.serviceCommission = Math.round(comm.servicesRevenue * comm.serviceCommissionRate);
      comm.productCommission = Math.round(comm.productsRevenue * comm.productCommissionRate);
      comm.totalCommission = comm.serviceCommission + comm.productCommission;

      totalServicesRevenue += comm.servicesRevenue;
      totalProductsRevenue += comm.productsRevenue;
      totalCommissions += comm.totalCommission;
      totalAwardedBonuses += comm.awardedBonus;

      practitioners.push(comm);
    }

    totalServicesRevenue += unassignedServicesRevenue;
    totalProductsRevenue += unassignedProductsRevenue;

    return NextResponse.json({
      period,
      periodLabel: new Date(year, monthIndex, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      practitioners,
      unassigned: {
        salesCount: unassignedSalesCount,
        servicesRevenue: unassignedServicesRevenue,
        productsRevenue: unassignedProductsRevenue,
      },
      summary: {
        totalSalesCount: sales.length,
        totalServicesRevenue,
        totalProductsRevenue,
        totalRevenue: totalServicesRevenue + totalProductsRevenue,
        totalCommissions,
        totalAwardedBonuses,
      },
    });
  } catch (err) {
    return serverError("pro/payroll/commissions:get", err);
  }
}

// POST : Attribution souveraine d'une prime par le Patron / Direction
const PostBonusSchema = z.object({
  tenantId: z.string().min(1),
  employeeId: z.string().min(1),
  amount: z.number().int().min(1),
  reason: z.string().trim().min(1),
  moment: z.enum(["instant", "end_of_day", "end_of_month"]).default("instant"),
});

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:payroll:commissions:post");
    if (guard) return guard;

    const body = await req.json().catch(() => null);
    const parsed = PostBonusSchema.safeParse(body);
    if (!parsed.success) return jsonError("Données de prime invalides", 400);

    const { tenantId, employeeId, amount, reason, moment } = parsed.data;

    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Vérification des droits : Seule la direction / patron peut attribuer des primes
    const sess = sessionFromRequest(req);
    const targetUserId = sess?.userId;
    if (targetUserId) {
      const dbUser = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, phone: true, name: true, role: true },
      });
      if (dbUser) {
        const proCtx = await resolveUserProContext(dbUser);
        if (!proCtx.isOwner && dbUser.role !== "admin") {
          return jsonError("Accès réservé : Seul le patron ou la direction peut attribuer une prime.", 403);
        }
      }
    }

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, role: true },
    });
    if (!employee) return jsonError("Collaboratrice introuvable", 404);

    const bonusRecord = {
      id: `BONUS-${Date.now()}`,
      tenantId: tenant.id,
      employeeId: employee.id,
      employeeName: employee.name,
      amount,
      reason,
      moment, // instant | end_of_day | end_of_month
      awardedAt: new Date().toISOString(),
      awardedBy: sess?.phone || "Direction",
    };

    const log = await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "awarded",
        entity: "employee_bonus",
        entityId: employee.id,
        detailsJson: JSON.stringify(bonusRecord),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Prime de ${amount} FCFA attribuée avec succès à ${employee.name}.`,
      bonus: bonusRecord,
      logId: log.id,
    });
  } catch (err) {
    return serverError("pro/payroll/commissions:post", err);
  }
}
