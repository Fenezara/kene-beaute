// GET /api/pro/payroll?tenantId= — périodes de paie + bulletins
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";

export async function GET(req: NextRequest) {
  try {
    const tenant = await resolveTenant(req.nextUrl.searchParams.get("tenantId"));
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
