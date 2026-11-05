// GET /api/pro/diagnoses/report?tenantId=&id= → PDF « Compte-rendu de
// diagnostic en institut » — score fusionné, indicateurs, vigilances,
// protocole, réponses à l'entretien, consentements horodatés, signatures.
// Session pro/admin + institut propriétaire du diagnostic (isolation stricte).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { proDiagReportPdf, proDiagReportFilename, type TenantLogoInput } from "@/lib/kene/consultation-pdf";
import { processMultiSpectralSuite } from "@/lib/kene/spectral-imaging";
import { parseStructuredPrescription } from "@/lib/kene/prescription-schema";
import sharp from "sharp";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * Résout le logo JPEG officiel pour l'en-tête du rapport PDF :
 * 1. `tenant.photoData` (si l'institut a uploadé son logo/photo de vitrine)
 * 2. Emblème certifié dans `public/instituts/<slug>.webp` ou `public/brand/`
 * 3. Génération dynamique vectorielle d'un médaillon monogramme signature pour l'institut
 */
async function resolveTenantLogoJpeg(tenant: { id: string; name: string; photoData?: string | null }): Promise<TenantLogoInput | null> {
  try {
    // 1. Photo officielle ou logo en base64 dans la base
    if (tenant.photoData && tenant.photoData.trim().length > 30) {
      const raw = tenant.photoData.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim();
      const buf = Buffer.from(raw, "base64");
      const jpeg = await sharp(buf)
        .removeAlpha()
        .resize(100, 100, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer();
      return { jpegBytes: new Uint8Array(jpeg), width: 100, height: 100 };
    }

    // 2. Fichier vitrine existant dans public/instituts
    const slug = tenant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const instituteWebp = path.join(process.cwd(), "public", "instituts", `${slug}.webp`);
    if (fs.existsSync(instituteWebp)) {
      const jpeg = await sharp(instituteWebp)
        .removeAlpha()
        .resize(100, 100, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer();
      return { jpegBytes: new Uint8Array(jpeg), width: 100, height: 100 };
    }

    // 3. Médaillon officiel monogramme Kènè Pro pour l'institut
    const initials = (tenant.name || "KÈNÈ")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");

    const svg = `
      <svg width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="emBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4a1525" />
            <stop offset="100%" stop-color="#230a12" />
          </linearGradient>
          <linearGradient id="emGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#b45309" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="56" fill="url(#emBg)" stroke="url(#emGold)" stroke-width="2.5" />
        <circle cx="60" cy="60" r="49" fill="none" stroke="#ca8a04" stroke-width="0.9" stroke-dasharray="3,2" stroke-opacity="0.75" />
        <text x="60" y="69" fill="#fef3c7" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="bold" text-anchor="middle" letter-spacing="1">
          ${initials || "KP"}
        </text>
      </svg>`;

    const jpeg = await sharp(Buffer.from(svg))
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92 })
      .toBuffer();

    return { jpegBytes: new Uint8Array(jpeg), width: 120, height: 120 };
  } catch (err) {
    console.warn("Impossible de résoudre le logo de l'institut pour le PDF :", err);
    return null;
  }
}

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
      include: { clientProfile: { select: { id: true, name: true, phone: true, cosmeticsUsed: true } } },
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
    // et l'angle photo spécifique choisi (?photoIdx=0, 1, 2...)
    const rawViewsParam = req.nextUrl.searchParams.get("views");
    const rawPhotoIdx = req.nextUrl.searchParams.get("photoIdx");
    const photoIndex = rawPhotoIdx !== null && rawPhotoIdx !== undefined && rawPhotoIdx !== ""
      ? parseInt(rawPhotoIdx, 10)
      : null;

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
      photoIndex,
    });

    // Résolution de l'ordonnance beauté / prescription active de la cliente
    const prescription = parseStructuredPrescription(diag.clientProfile.cosmeticsUsed, tenant.name);

    // Résolution du logo officiel de l'institut
    const tenantLogo = await resolveTenantLogoJpeg(tenant);

    const pdf = proDiagReportPdf({
      tenantName: tenant.name,
      tenantCity: tenant.city,
      tenantPhone: tenant.phone,
      tenantLogo,
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
      prescription,
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
