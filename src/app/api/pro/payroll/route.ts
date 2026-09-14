// GET /api/pro/payroll?tenantId= — périodes de paie + bulletins
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:payroll:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const payPeriods = await db.payPeriod.findMany({
      where: { tenantId: tenant.id },
      include: {
        payslips: {
          include: { employee: { select: { name: true, role: true, cnpsNumber: true } } },
          orderBy: { employee: { name: "asc" } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ payPeriods });
  } catch (err) {
    return serverError("pro/payroll:get", err);
  }
}
