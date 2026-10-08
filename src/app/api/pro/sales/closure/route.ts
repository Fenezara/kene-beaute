// GET /api/pro/sales/closure?tenantId=&date= | POST — Clôture de Caisse Journalière (« Rapport Z »)
// Pointage physique des espèces, rapprochement Mobile Money, calcul d'écart et archivage légal.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { splitTVA } from "@/lib/accounting/syscohada";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:sales:closure:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const dateParam = req.nextUrl.searchParams.get("date");
    const targetDate = dateParam && !Number.isNaN(new Date(dateParam).getTime()) ? new Date(dateParam) : new Date();

    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    // Ventes de la journée
    const sales = await db.sale.findMany({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: start, lte: end },
        status: { in: ["completed", "refunded"] },
      },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    const activeSales = sales.filter((s) => s.status === "completed");

    let cashSales = 0;
    let waveSales = 0;
    let orangeSales = 0;
    let cardSales = 0;
    let walletSales = 0;

    for (const s of activeSales) {
      if (s.paymentMethod === "cash") cashSales += s.total;
      else if (s.paymentMethod === "wave") waveSales += s.total;
      else if (s.paymentMethod === "orange") orangeSales += s.total;
      else if (s.paymentMethod === "card") cardSales += s.total;
      else if (s.paymentMethod === "wallet") walletSales += s.total;
    }

    const totalSales = activeSales.reduce((acc, s) => acc + s.total, 0);
    const { tva, ht } = splitTVA(totalSales);

    // Dépenses / Sorties de caisse en espèces du jour
    const expenseLogs = await db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entity: "cash_expense",
        action: "disbursement",
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "asc" },
    });

    const expensesList = expenseLogs.map((log) => {
      try {
        return JSON.parse(log.detailsJson ?? "{}");
      } catch {
        return null;
      }
    }).filter(Boolean);

    const cashExpenses = expensesList.reduce((acc: number, x: any) => acc + (Number(x.amount) || 0), 0);

    // Historique des dernières clôtures Z enregistrées
    const pastClosures = await db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entity: "cash_closure",
        action: "z_closure",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const pastZ = pastClosures.map((c) => {
      try {
        return JSON.parse(c.detailsJson ?? "{}");
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({
      date: targetDate.toISOString(),
      salesCount: activeSales.length,
      cashSales,
      cashExpenses,
      expensesList,
      waveSales,
      orangeSales,
      cardSales,
      walletSales,
      totalSales,
      tvaAmount: tva,
      htAmount: ht,
      tenant: {
        name: tenant.name,
        city: tenant.city,
        phone: tenant.phone,
      },
      pastClosures: pastZ,
    });
  } catch (err) {
    return serverError("pro/sales/closure:get", err);
  }
}

const PostSchema = z.object({
  tenantId: z.string().min(1),
  closedBy: z.string().trim().min(1),
  openingCash: z.number().int().min(0),
  countedCash: z.number().int().min(0),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Clôture de caisse = opération financière engageante. Rate-limit 20/min (AUTH_MUTATION).
  const rl = rateLimit(rlKey(req, "pro:sales:closure:post"), AUTH_MUTATION);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  try {
    const guard = guardProRole(req, "pro:sales:closure:post");
    if (guard) return guard;

    const parsed = PostSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Données de clôture invalides", 400);

    const { tenantId, closedBy, openingCash, countedCash, notes } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    const sales = await db.sale.findMany({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: start, lte: end },
        status: "completed",
      },
    });

    let cashSales = 0;
    let waveSales = 0;
    let orangeSales = 0;
    let cardSales = 0;
    let walletSales = 0;

    for (const s of sales) {
      if (s.paymentMethod === "cash") cashSales += s.total;
      else if (s.paymentMethod === "wave") waveSales += s.total;
      else if (s.paymentMethod === "orange") orangeSales += s.total;
      else if (s.paymentMethod === "card") cardSales += s.total;
      else if (s.paymentMethod === "wallet") walletSales += s.total;
    }

    // Sorties de caisse en espèces du jour
    const expenseLogs = await db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entity: "cash_expense",
        action: "disbursement",
        createdAt: { gte: start, lte: end },
      },
    });
    const cashExpenses = expenseLogs.reduce((acc, log) => {
      try {
        const d = JSON.parse(log.detailsJson ?? "{}");
        return acc + (Number(d.amount) || 0);
      } catch {
        return acc;
      }
    }, 0);

    const totalSales = sales.reduce((acc, s) => acc + s.total, 0);
    const expectedCashInDrawer = openingCash + cashSales - cashExpenses;
    const cashVariance = countedCash - expectedCashInDrawer;

    const closureRecord = {
      id: `Z-${Date.now()}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantCity: tenant.city,
      tenantPhone: tenant.phone,
      closureDate: today.toISOString(),
      closedBy,
      openingCash,
      cashSales,
      cashExpenses,
      expectedCash: expectedCashInDrawer,
      countedCash,
      cashVariance,
      waveSales,
      orangeSales,
      cardSales,
      walletSales,
      totalSales,
      salesCount: sales.length,
      notes: notes?.trim() || null,
    };

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "z_closure",
        entity: "cash_closure",
        entityId: closureRecord.id,
        detailsJson: JSON.stringify(closureRecord),
      },
    });

    return NextResponse.json({
      success: true,
      closure: closureRecord,
    });
  } catch (err) {
    return serverError("pro/sales/closure:post", err);
  }
}
