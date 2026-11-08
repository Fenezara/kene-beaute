// GET /api/pro/audit/daily?tenantId=&date=YYYY-MM-DD
// Bilan complet d'une journée passée ou présente : Présences/Pointages, Recettes/Caisse, Soins & RDV, Factures
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:audit:daily:get");
    if (guard) return guard;

    const tenantId = req.nextUrl.searchParams.get("tenantId");
    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const dateParam = req.nextUrl.searchParams.get("date");
    let targetDate = new Date();
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split("-").map(Number);
      targetDate = new Date(y, m - 1, d);
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Pointages & Équipe du jour cible
    const attendances = await db.attendance.findMany({
      where: {
        employee: { tenantId: tenant.id },
        date: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        employee: { select: { id: true, name: true, role: true } },
      },
      orderBy: { checkIn: "asc" },
    });

    const activeEmployees = await db.employee.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { id: true, name: true, role: true },
    });

    // 2. Ventes & Encaissements de caisse du jour
    const sales = await db.sale.findMany({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        items: true,
        clientProfile: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Calcul des totaux de caisse par moyen de règlement
    const completedSales = sales.filter((s) => s.status === "completed");
    const refundedSales = sales.filter((s) => s.status === "refunded");
    
    let caTotal = 0;
    let waveTotal = 0;
    let orangeTotal = 0;
    let mtnTotal = 0;
    let moovTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;

    for (const s of completedSales) {
      caTotal += s.total;
      const m = s.paymentMethod?.toLowerCase() || "cash";
      if (m.includes("wave")) waveTotal += s.total;
      else if (m.includes("orange")) orangeTotal += s.total;
      else if (m.includes("mtn")) mtnTotal += s.total;
      else if (m.includes("moov")) moovTotal += s.total;
      else if (m.includes("cash") || m.includes("espece")) cashTotal += s.total;
      else if (m.includes("card") || m.includes("cb")) cardTotal += s.total;
    }

    // 3. Rendez-vous du jour
    const appointments = await db.appointment.findMany({
      where: {
        tenantId: tenant.id,
        startAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        service: { select: { name: true, price: true } },
        resource: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    });

    // 4. Mouvements de stock du jour
    const inventoryMovements = await db.inventoryMovement.findMany({
      where: {
        tenantId: tenant.id,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        product: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      date: dateParam || targetDate.toISOString().slice(0, 10),
      summary: {
        caTotal,
        completedSalesCount: completedSales.length,
        refundedSalesCount: refundedSales.length,
        payments: {
          wave: waveTotal,
          orange: orangeTotal,
          mtn: mtnTotal,
          moov: moovTotal,
          cash: cashTotal,
          card: cardTotal,
        },
        presentStaffCount: attendances.filter((a) => a.checkIn && a.status !== "leave").length,
        totalStaffCount: activeEmployees.length,
        apptsTotal: appointments.length,
        apptsCompleted: appointments.filter((a) => a.status === "completed").length,
      },
      attendances: attendances.map((a) => ({
        id: a.id,
        employeeName: a.employee.name,
        role: a.employee.role,
        checkIn: a.checkIn,
        checkOut: a.checkOut,
        status: a.status,
        hours: a.hours,
      })),
      absentEmployees: activeEmployees
        .filter((emp) => !attendances.some((a) => a.employeeId === emp.id && a.checkIn))
        .map((emp) => ({ id: emp.id, name: emp.name, role: emp.role })),
      sales: sales.map((s) => ({
        id: s.id,
        total: s.total,
        discount: s.discount,
        paymentMethod: s.paymentMethod,
        cashierName: s.cashierName,
        status: s.status,
        createdAt: s.createdAt,
        clientName: s.clientProfile?.name || "Cliente comptoir",
        items: s.items.map((it) => ({
          label: it.label,
          qty: it.qty,
          total: it.total,
          kind: it.kind,
        })),
      })),
      appointments: appointments.map((a) => ({
        id: a.id,
        clientName: a.clientName,
        clientPhone: a.clientPhone,
        serviceName: a.service?.name || "Soin cabine",
        resourceName: a.resource?.name || "Cabine principale",
        startAt: a.startAt,
        status: a.status,
        price: a.price,
      })),
      inventoryMovements: inventoryMovements.map((m) => ({
        id: m.id,
        productName: m.product?.name || "Produit",
        type: m.type,
        qty: m.qty,
        reason: m.reason,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    return serverError("pro:audit:daily:get", err);
  }
}
