// GET /api/pro/payroll/commissions?tenantId=&period=YYYY-MM
// Calcul et consolidation mensuelle des commissions praticiennes (10% soins, 5% ventes boutique)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export const runtime = "nodejs";

export interface PractitionerCommission {
  employeeId: string;
  name: string;
  role: string;
  servicesRevenue: number;
  servicesCount: number;
  serviceCommissionRate: number; // 0.10 (10%)
  serviceCommission: number;
  productsRevenue: number;
  productsCount: number;
  productCommissionRate: number; // 0.05 (5%)
  productCommission: number;
  totalCommission: number;
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

    const SERVICE_COMMISSION_RATE = 0.10; // 10% sur les soins cabine
    const PRODUCT_COMMISSION_RATE = 0.05; // 5% sur les ventes cosmétiques comptoir

    const employeeMap = new Map<string, PractitionerCommission>();

    for (const emp of employees) {
      employeeMap.set(emp.name.toLowerCase().trim(), {
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        servicesRevenue: 0,
        servicesCount: 0,
        serviceCommissionRate: SERVICE_COMMISSION_RATE,
        serviceCommission: 0,
        productsRevenue: 0,
        productsCount: 0,
        productCommissionRate: PRODUCT_COMMISSION_RATE,
        productCommission: 0,
        totalCommission: 0,
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

      // Si pas de correspondance exacte, chercher par prénom ou inclusion
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

    // Calculer les montants finaux de commission
    const practitioners: PractitionerCommission[] = [];
    let totalServicesRevenue = 0;
    let totalProductsRevenue = 0;
    let totalCommissions = 0;

    for (const comm of employeeMap.values()) {
      comm.serviceCommission = Math.round(comm.servicesRevenue * comm.serviceCommissionRate);
      comm.productCommission = Math.round(comm.productsRevenue * comm.productCommissionRate);
      comm.totalCommission = comm.serviceCommission + comm.productCommission;

      totalServicesRevenue += comm.servicesRevenue;
      totalProductsRevenue += comm.productsRevenue;
      totalCommissions += comm.totalCommission;

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
      },
    });
  } catch (err) {
    return serverError("pro/payroll/commissions:get", err);
  }
}
