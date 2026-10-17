// GET /api/diagnoses/report?userId=&id= → PDF « Mon diagnostic de peau »
// — compte-rendu du self-scan IA de la cliente: score, indicateurs,
// routine conseillée, orientation éventuelle, mention non médicale.
// Session cliente (guardUserClaim) — chacun ne voit que ses comptes-rendus.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { clientDiagReportPdf, clientDiagReportFilename } from "@/lib/kene/consultation-pdf";
import { processMultiSpectralSuite } from "@/lib/kene/spectral-imaging";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);
    const guard = guardUserClaim(req, "diagnoses:report", userId);
    if (guard) return guard;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("id du diagnostic requis", 400);

    const diag = await db.diagnosis.findFirst({
      where: { id, userId, status: "done" },
      select: {
        id: true,
        zone: true,
        imageData: true,
        createdAt: true,
        resultJson: true,
        user: { select: { name: true, avatarData: true } },
      },
    });
    if (!diag) return jsonError("Diagnostic introuvable", 404);

    let resolvedImageData = diag.imageData;
    if (!resolvedImageData || resolvedImageData.trim().length < 30) {
      const prevDiagWithPhoto = await db.diagnosis.findFirst({
        where: { userId, imageData: { not: "" } },
        orderBy: { createdAt: "desc" },
        select: { imageData: true },
      });
      if (prevDiagWithPhoto?.imageData && prevDiagWithPhoto.imageData.trim().length > 30) {
        resolvedImageData = prevDiagWithPhoto.imageData;
      } else if (diag.user.avatarData && diag.user.avatarData.trim().length > 30) {
        resolvedImageData = diag.user.avatarData;
      }
    }

    let parsedIndicators: Array<{ nom: string; pourcentage: number }> | undefined;
    try {
      if (diag.resultJson) {
        const parsed = JSON.parse(diag.resultJson);
        if (parsed && Array.isArray(parsed.indicateurs)) {
          parsedIndicators = parsed.indicateurs;
        }
      }
    } catch {
      // ignore
    }

    const spectral = await processMultiSpectralSuite(resolvedImageData, {
      clientName: diag.user.name,
      date: diag.createdAt,
      zoneLabel: diag.zone,
      indicators: parsedIndicators,
    });

    const pdf = clientDiagReportPdf({
      userName: diag.user.name,
      diagnosis: { id: diag.id, zone: diag.zone, createdAt: diag.createdAt, resultJson: diag.resultJson, imageData: resolvedImageData },
      multiSpectral: spectral,
      spectralImage: spectral.legacyAcne,
    });

    return new NextResponse(new Uint8Array(pdf.data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${clientDiagReportFilename(diag.user.name, diag.createdAt)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError("diagnoses:report:GET", err);
  }
}
