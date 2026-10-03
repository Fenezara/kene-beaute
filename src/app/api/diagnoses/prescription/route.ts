// GET /api/diagnoses/prescription?userId=&id=
// Retourne l'ordonnance dermo-botanique avec Pass Cabine QR en PDF vectoriel natif.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { generatePrescriptionPdf } from "@/lib/kene/dermo-prescription-pdf";
import type { DiagnosisResult } from "@/lib/kene/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const guard = guardUserClaim(req, "diagnoses:prescription", userId);
    if (guard) return guard;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return jsonError("id du diagnostic requis", 400);

    const diag = await db.diagnosis.findFirst({
      where: { id, userId, status: "done" },
      select: {
        id: true,
        zone: true,
        createdAt: true,
        resultJson: true,
        user: { select: { name: true, phone: true } },
      },
    });

    if (!diag) return jsonError("Diagnostic introuvable", 404);

    let parsedResult: DiagnosisResult;
    try {
      parsedResult = JSON.parse(diag.resultJson);
    } catch {
      return jsonError("Données de diagnostic corrompues", 500);
    }

    const origin = req.nextUrl.origin || "https://kene.app";
    const passUrl = `${origin}/pro?clientPass=${encodeURIComponent(diag.id)}`;

    const pdf = generatePrescriptionPdf({
      userName: diag.user.name,
      userPhone: diag.user.phone,
      zone: diag.zone,
      createdAt: diag.createdAt,
      diagnosisResult: parsedResult,
      passUrl,
    });

    const safeName = diag.user.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const filename = `kene-recommandation-botanique-${safeName}-${diag.id.slice(-6)}.pdf`;

    return new NextResponse(new Uint8Array(pdf.data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError("diagnoses:prescription:GET", err);
  }
}
