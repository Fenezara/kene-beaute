// GET /api/pro/diagnoses/report?tenantId=&id= → PDF « Compte-rendu de
// diagnostic en institut » — score fusionné, indicateurs, vigilances,
// protocole, réponses à l'entretien, consentements horodatés, signatures.
// Session pro/admin + institut propriétaire du diagnostic (isolation stricte).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { proDiagReportPdf, proDiagReportFilename } from "@/lib/kene/consultation-pdf";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro/diagnoses:report");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("id du diagnostic requis", 400);

    const diag = await db.proDiagnosis.findFirst({
      where: { id, tenantId: tenant.id },
      include: { clientProfile: { select: { name: true, phone: true } } },
    });
    if (!diag) return jsonError("Diagnostic introuvable dans cet institut", 404);

    const pdf = proDiagReportPdf({
      tenantName: tenant.name,
      tenantCity: tenant.city,
      tenantPhone: tenant.phone,
      diagnosis: {
        zone: diag.zone,
        practitioner: diag.practitioner,
        createdAt: diag.createdAt,
        scoreGlobal: diag.scoreGlobal,
        consentPhoto: diag.consentPhoto,
        consentData: diag.consentData,
        consentTs: diag.consentTs,
        photoUsed: diag.photoUsed,
        vlmUsed: diag.vlmUsed,
        questionnaireJson: diag.questionnaireJson,
        resultJson: diag.resultJson,
      },
      client: diag.clientProfile,
    });

    return new NextResponse(new Uint8Array(pdf.data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${proDiagReportFilename(diag.clientProfile.name, diag.createdAt)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError("pro/diagnoses:report:GET", err);
  }
}
