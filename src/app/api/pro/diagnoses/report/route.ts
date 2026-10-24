// GET /api/pro/diagnoses/report?tenantId=&id= → PDF « Compte-rendu de
// diagnostic en institut » — score fusionné, indicateurs, vigilances,
// protocole, réponses à l'entretien, consentements horodatés, signatures.
// Session pro/admin + institut propriétaire du diagnostic (isolation stricte).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { proDiagReportPdf, proDiagReportFilename } from "@/lib/kene/consultation-pdf";
import { processMultiSpectralSuite } from "@/lib/kene/spectral-imaging";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro/diagnoses:report");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    let id = req.nextUrl.searchParams.get("id")?.trim() || req.nextUrl.searchParams.get("diagnosisId")?.trim();
    if (!id) {
      const clientId = req.nextUrl.searchParams.get("clientId") || req.nextUrl.searchParams.get("clientProfileId");
      const latest = await db.proDiagnosis.findFirst({
        where: { tenantId: tenant.id, ...(clientId ? { clientProfileId: clientId } : {}) },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!latest) return jsonError("Aucun diagnostic cabine trouvé pour cet institut", 404);
      id = latest.id;
    }

    const diag = await db.proDiagnosis.findFirst({
      where: { id, tenantId: tenant.id },
      include: { clientProfile: { select: { id: true, name: true, phone: true } } },
    });
    if (!diag) return jsonError("Diagnostic introuvable dans cet institut", 404);

    // Résolution garantie de la photo réelle de la cliente (diagnostic courant → dernier scan cabine → dernier scan cliente / avatar)
    let resolvedPhotoData = diag.photoData;
    if (!resolvedPhotoData || resolvedPhotoData.trim().length < 30) {
      const prevProWithPhoto = await db.proDiagnosis.findFirst({
        where: {
          clientProfileId: diag.clientProfileId,
          photoData: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { photoData: true },
      });
      if (prevProWithPhoto?.photoData && prevProWithPhoto.photoData.trim().length > 30) {
        resolvedPhotoData = prevProWithPhoto.photoData;
      } else if (diag.clientProfile.phone) {
        const linkedUser = await db.user.findFirst({
          where: { phone: diag.clientProfile.phone },
          select: { id: true, avatarData: true },
        });
        if (linkedUser) {
          const latestUserDiag = await db.diagnosis.findFirst({
            where: { userId: linkedUser.id, imageData: { not: "" } },
            orderBy: { createdAt: "desc" },
            select: { imageData: true },
          });
          if (latestUserDiag?.imageData && latestUserDiag.imageData.trim().length > 30) {
            resolvedPhotoData = latestUserDiag.imageData;
          } else if (linkedUser.avatarData && linkedUser.avatarData.trim().length > 30) {
            resolvedPhotoData = linkedUser.avatarData;
          }
        }
      }
    }

    let parsedIndicators: Array<{ nom: string; pourcentage: number }> | undefined;
    try {
      const parsed = JSON.parse(diag.resultJson);
      if (parsed && Array.isArray(parsed.indicateurs)) {
        parsedIndicators = parsed.indicateurs;
      }
    } catch {
      // ignore
    }

    // Analyse optique multi-spectrale cabine : Quad 4 Bandes sur les clichés réels de la cliente
    // Supporte la sélection tactile des 4 vues cliniques parmi les 8 (?views=standard,amber585,green540,blue405)
    const rawViewsParam = req.nextUrl.searchParams.get("views");
    const selectedViews = rawViewsParam
      ? rawViewsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const spectral = await processMultiSpectralSuite(resolvedPhotoData, {
      clientName: diag.clientProfile.name,
      date: diag.createdAt,
      zoneLabel: diag.zone,
      indicators: parsedIndicators,
      scoreGlobal: diag.scoreGlobal,
      selectedViews,
    });

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
        photoData: diag.photoData,
      },
      client: diag.clientProfile,
      multiSpectral: spectral,
      spectralImage: spectral.legacyAcne,
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
