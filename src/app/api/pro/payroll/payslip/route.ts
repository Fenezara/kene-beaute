// GET /api/pro/payroll/payslip?tenantId=&slipId= → PDF officiel A4 du bulletin de paie
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { generatePayslipPdf } from "@/lib/kene/payslip-pdf";
import type { ProPayslip } from "@/components/kene/pro/types";

export const runtime = "nodejs";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "salarie";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:payroll:payslip");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const slipId = req.nextUrl.searchParams.get("slipId")?.trim() || req.nextUrl.searchParams.get("id")?.trim();
    if (!slipId) return jsonError("Identifiant de bulletin requis (slipId)", 400);

    const slip = await db.payslip.findFirst({
      where: { id: slipId, payPeriod: { tenantId: tenant.id } },
      include: {
        employee: true,
        payPeriod: { select: { period: true, country: true } },
      },
    });
    if (!slip) return jsonError("Bulletin de paie introuvable", 404);

    const pdf = generatePayslipPdf({
      tenantName: tenant.name,
      tenantCity: tenant.city,
      tenantPhone: tenant.phone,
      periodLabel: slip.payPeriod.period,
      country: slip.payPeriod.country,
      slip: slip as unknown as ProPayslip,
    });

    const filename = `bulletin-${slip.payPeriod.period}-${slug(slip.employee.name)}.pdf`;

    return new NextResponse(new Uint8Array(pdf.data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError("pro/payroll/payslip:GET", err);
  }
}
