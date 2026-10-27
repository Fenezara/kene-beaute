// GET /api/diagnoses/prescription?userId=&id=
// Retourne l'ordonnance dermo-cosmétique avec Pass Cabine QR en PDF vectoriel natif.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim, sessionFromRequest } from "@/lib/kene/session";
import { generatePrescriptionPdf } from "@/lib/kene/dermo-prescription-pdf";
import type { DiagnosisResult } from "@/lib/kene/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sess = sessionFromRequest(req);
    const userId = req.nextUrl.searchParams.get("userId")?.trim() || sess?.userId;
    if (!userId) return jsonError("userId requis", 400);

    const guard = guardUserClaim(req, "diagnoses:prescription", userId);
    if (guard) return guard;

    let id = req.nextUrl.searchParams.get("id")?.trim() || req.nextUrl.searchParams.get("diagnosisId")?.trim();

    let userPhone = "";
    let userName = "";
    let zone = "visage";
    let createdAt = new Date();
    let resultJson = "";
    let effectiveId = id;

    // 1. Recherche dans les auto-scans smartphone (Diagnosis)
    const clientDiag = await db.diagnosis.findFirst({
      where: id ? { id, userId, status: "done" } : { userId, status: "done" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        zone: true,
        createdAt: true,
        resultJson: true,
        user: { select: { name: true, phone: true } },
      },
    });

    if (clientDiag) {
      effectiveId = clientDiag.id;
      userName = clientDiag.user.name;
      userPhone = clientDiag.user.phone;
      zone = clientDiag.zone;
      createdAt = clientDiag.createdAt;
      resultJson = clientDiag.resultJson;
    } else {
      // 2. Recherche dans les diagnostics réalisés en cabine par l'institut (ProDiagnosis)
      const userRecord = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, phone: true },
      });
      const digits = userRecord?.phone ? userRecord.phone.replace(/\D/g, "") : "";
      const tail = digits.length >= 8 ? digits.slice(-8) : digits;

      const proDiag = await db.proDiagnosis.findFirst({
        where: {
          ...(id ? { id } : {}),
          OR: [
            { userId },
            ...(userRecord ? [{ clientProfile: { userId: userRecord.id } }] : []),
            ...(tail ? [{ clientProfile: { phone: { contains: tail } } }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          clientProfile: { select: { name: true, phone: true } },
          tenant: { select: { name: true } },
        },
      });

      if (!proDiag) {
        return jsonError("Aucune ordonnance trouvée pour cette utilisatrice", 404);
      }

      effectiveId = proDiag.id;
      userName = proDiag.clientProfile.name || userRecord?.name || "Cliente";
      userPhone = proDiag.clientProfile.phone || userRecord?.phone || "";
      zone = proDiag.zone;
      createdAt = proDiag.createdAt;
      resultJson = proDiag.resultJson;
    }

    let parsedResult: DiagnosisResult;
    try {
      parsedResult = JSON.parse(resultJson);
    } catch {
      return jsonError("Données de diagnostic corrompues", 500);
    }

    const origin = req.nextUrl.origin || "https://kene.app";
    const passUrl = `${origin}/pro?clientPass=${encodeURIComponent(effectiveId || "")}`;

    const pdf = generatePrescriptionPdf({
      userName,
      userPhone,
      zone,
      createdAt,
      diagnosisResult: parsedResult,
      passUrl,
    });

    const safeName = userName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const filename = `kene-recommandation-botanique-${safeName}-${(effectiveId || "ord").slice(-6)}.pdf`;

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
