// GET /api/pro/marketing/pdf?type=flyer-a5|pass-a6|parrainage-carte|attestation-a4&tenantId=...
// Génère et télécharge le support marketing au format PDF haute résolution pour impression.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import {
  generateCommercialPdf,
  type CommercialDocType,
} from "@/lib/kene/commercial-pdf";

export const runtime = "nodejs";

const VALID_TYPES: CommercialDocType[] = [
  "flyer-a5",
  "pass-a6",
  "parrainage-carte",
  "attestation-a4",
  "manuel-pro",
];

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:marketing:pdf");
    if (guard) return guard;

    const sp = req.nextUrl.searchParams;
    const tenant = await resolveTenant(req, sp.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const rawType = sp.get("type") || "flyer-a5";
    if (!VALID_TYPES.includes(rawType as CommercialDocType)) {
      return jsonError(`Type de document invalide: ${rawType}. Types acceptés: ${VALID_TYPES.join(", ")}`, 400);
    }
    const type = rawType as CommercialDocType;

    const host = req.headers.get("host") || "kene-beaute.com";
    const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    const appUrl = `${proto}://${host}`;

    // Récupérer le code d'affiliation ou le slug du salon
    const referralCode = `KENE-${tenant.name.replace(/[^a-zA-Z0-9]/g, "").substring(0, 6).toUpperCase()}-2026`;

    const { data, filename } = generateCommercialPdf({
      type,
      tenantName: tenant.name,
      tenantCity: tenant.city,
      tenantPhone: tenant.phone || "+225 07 00 00 00 00",
      tenantAddress: tenant.address || "Plateau / Cocody",
      referralCode,
      appUrl,
    });

    return new NextResponse(Buffer.from(data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: any) {
    console.error("Erreur génération PDF commercial:", err);
    return jsonError(`Erreur lors de la génération du document PDF: ${err.message}`, 500);
  }
}
