// GET /api/pro/payroll/ecnps?tenantId=&period= — export e-CNPS XML (DSN simplifiée)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildECnpsXml } from "@/lib/payroll";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : export navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:payroll:ecnps");
    if (guard) return guard;

    const period = req.nextUrl.searchParams.get("period");
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return jsonError("Paramètre period (YYYY-MM) requis", 400);

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const payPeriod = await db.payPeriod.findFirst({
      where: { tenantId: tenant.id, period },
      include: { payslips: { include: { employee: true } } },
    });
    if (!payPeriod) return jsonError(`Aucune période de paie validée pour ${period}`, 404);

    const xml = buildECnpsXml(
      payPeriod.payslips.map((p) => ({
        employee: { name: p.employee.name, cnpsNumber: p.employee.cnpsNumber },
        net: p.netSalary,
        cnpsEmployee: p.cnpsEmployee,
        cnpsEmployer: p.cnpsEmployer,
        gross: p.grossSalary,
      })),
      period,
      "CI-ABJ-" + tenant.id.slice(0, 8).toUpperCase()
    );

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="ecnps-${period}.xml"`,
      },
    });
  } catch (err) {
    return serverError("pro/payroll/ecnps", err);
  }
}
