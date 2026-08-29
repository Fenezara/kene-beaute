// POST /api/pro/payroll/run — {tenantId, period "YYYY-MM"} : bulletins + totaux + écriture PA
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { computePayroll } from "@/lib/payroll";
import { payrollJournalLines } from "@/lib/accounting/syscohada";
import { jsonError, serverError, genRef, createJournalEntry } from "@/lib/kene/server";

const Body = z.object({
  tenantId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period au format YYYY-MM requis"),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide (period YYYY-MM)", 400);
    const { tenantId, period } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const existing = await db.payPeriod.findFirst({ where: { tenantId, period } });
    if (existing) return jsonError("Période déjà validée", 400);

    const employees = await db.employee.findMany({ where: { tenantId, active: true } });
    if (employees.length === 0) return jsonError("Aucune employée active pour ce tenant", 400);

    let grossT = 0;
    let employerT = 0;
    let employeeT = 0;
    let taxT = 0;
    let netT = 0;
    let cnT = 0;

    const payslipsData = employees.map((emp) => {
      const country = emp.country === "SN" ? "SN" : "CI";
      const result = computePayroll({
        country,
        baseSalary: emp.baseSalary,
        transport: emp.transport,
        housing: emp.housing,
        cadres: emp.cadres,
      });
      grossT += result.brut;
      employerT += result.cnpsEmployer;
      employeeT += result.cnpsEmployee;
      taxT += result.incomeTax;
      netT += result.net;
      cnT += result.cn;

      return {
        employeeId: emp.id,
        baseSalary: emp.baseSalary,
        hoursWorked: 173.33,
        grossSalary: result.brut,
        cnpsEmployee: result.cnpsEmployee,
        cnpsEmployer: result.cnpsEmployer,
        incomeTax: result.incomeTax,
        cn: result.cn,
        netSalary: result.net,
        detailsJson: JSON.stringify({
          lines: result.lines,
          regime: result.regimeLabel,
          coutEmployeur: result.coutEmployeur,
          hoursWorked: 173.33,
        }),
      };
    });

    const totals = { grossT, employerT, employeeT, taxT, netT, cnT };

    // Dernier jour du mois de paie
    const [year, month] = period.split("-").map(Number);
    const periodDate = new Date(year, month, 0, 12);

    const payPeriod = await db.payPeriod.create({
      data: {
        tenantId,
        period,
        country: tenant.country,
        status: "validated",
        totalsJson: JSON.stringify(totals),
        payslips: { create: payslipsData },
      },
      include: { payslips: { include: { employee: { select: { name: true, role: true, cnpsNumber: true } } } } },
    });

    // Écriture comptable PA (SYSCOHADA) — comptes manquants ignorés
    await createJournalEntry(tenantId, {
      journalCode: "PA",
      date: periodDate,
      reference: genRef("PA"),
      description: `Paie ${period} — ${payslipsData.length} bulletin(s)`,
      sourceType: "payroll",
      sourceId: payPeriod.id,
      lines: payrollJournalLines({
        grossTotal: grossT,
        employerContribTotal: employerT,
        employeeContribTotal: employeeT,
        incomeTaxTotal: taxT,
      }),
    });

    return NextResponse.json({ payPeriod, payslips: payPeriod.payslips }, { status: 201 });
  } catch (err) {
    return serverError("pro/payroll/run", err);
  }
}
