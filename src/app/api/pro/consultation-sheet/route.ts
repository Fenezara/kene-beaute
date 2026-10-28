// GET /api/pro/consultation-sheet?tenantId=&clientId?=&practitioner?
// → PDF « Fiche de consultation & diagnostic de peau ».
// - sans clientId: fiche VIERGE (support papier universel, à remplir à la main);
// - avec clientId: fiche PRÉ-REMPLIE (identité, miroir peau, réponses réelles
//   au diagnostic si déjà réalisé, prescription active, consentements).
// Session pro/admin exigée (guardProRole) + institut résolu (isolation stricte).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { getScanVisibility } from "@/lib/kene/share-consent";
import { consultationSheetPdf, consultationSheetFilename, type ConsultationClientPrefill } from "@/lib/kene/consultation-pdf";
import { parseStructuredPrescription } from "@/lib/kene/prescription-schema";
import type { QAnswers } from "@/lib/kene/questionnaire";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:consultation-sheet:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const clientId = req.nextUrl.searchParams.get("clientId")?.trim() || req.nextUrl.searchParams.get("id")?.trim() || null;
    let practitioner = req.nextUrl.searchParams.get("practitioner")?.trim() || null;
    const rawZone = req.nextUrl.searchParams.get("zone");
    let zone = rawZone && ["visage", "dos", "cuir_chevelu", "mains", "barbe", "naevi"].includes(rawZone)
      ? (rawZone as any)
      : undefined;

    let prefill: ConsultationClientPrefill | null = null;
    if (clientId) {
      const client = await db.clientProfile.findFirst({
        where: { id: clientId, tenantId: tenant.id },
      });
      if (!client) return jsonError("Fiche cliente introuvable dans cet institut", 404);

      // Récupérer le dernier diagnostic en cabine réalisé pour cette cliente
      const latestProDiag = await db.proDiagnosis.findFirst({
        where: { clientProfileId: client.id, tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
      });

      // Si pas de diagnostic cabine, récupérer le dernier diagnostic self-scan app (si compte lié)
      const latestUserDiag = !latestProDiag && client.userId
        ? await db.diagnosis.findFirst({
            where: { userId: client.userId, status: "done" },
            orderBy: { createdAt: "desc" },
          })
        : null;

      // Résolution praticienne et zone
      if (!practitioner && latestProDiag?.practitioner) {
        practitioner = latestProDiag.practitioner;
      }
      if (!zone) {
        const dZone = latestProDiag?.zone || latestUserDiag?.zone;
        if (dZone && ["visage", "dos", "cuir_chevelu", "mains", "barbe", "naevi"].includes(dZone)) {
          zone = dZone as any;
        }
      }

      // Réponses réelles du questionnaire
      let parsedAnswers: QAnswers | undefined = undefined;
      if (latestProDiag?.questionnaireJson) {
        try {
          parsedAnswers = JSON.parse(latestProDiag.questionnaireJson) as QAnswers;
        } catch {}
      }

      // Recommandations & résultats
      let parsedResult: any = null;
      const rawResultJson = latestProDiag?.resultJson || latestUserDiag?.resultJson;
      if (rawResultJson) {
        try {
          parsedResult = JSON.parse(rawResultJson);
        } catch {}
      }

      // Décoder la prescription active
      const prescription = parseStructuredPrescription(client.cosmeticsUsed, tenant.name);
      let routineMatin: string[] = [];
      let routineSoir: string[] = [];
      let soinsCabine: string[] = [];
      let botaniques: string[] = [];
      let readableCosmetics = "";

      if (prescription.products && prescription.products.length > 0) {
        routineMatin = prescription.products
          .filter((p) => p.moment === "matin" || p.moment === "matin_soir")
          .map((p) => (p.posology ? `${p.name} (${p.posology})` : p.name));
        routineSoir = prescription.products
          .filter((p) => p.moment === "soir" || p.moment === "matin_soir")
          .map((p) => (p.posology ? `${p.name} (${p.posology})` : p.name));
        soinsCabine = (prescription.cabineServices ?? []).map(
          (s) => `${s.name}${s.frequency ? ` (${s.frequency})` : ""}`
        );
        readableCosmetics = prescription.products
          .map((p) => `${p.name} [${p.moment === "matin_soir" ? "Matin & Soir" : p.moment === "matin" ? "Matin" : p.moment === "soir" ? "Soir" : "Hebdo"}]`)
          .join(", ");
      } else if (parsedResult?.recommandations) {
        const reco = parsedResult.recommandations;
        routineMatin = reco.routine_matin || [];
        routineSoir = reco.routine_soir || [];
        soinsCabine = reco.soins_conseilles || [];
        botaniques = reco.botaniques_conseillees || [];
        readableCosmetics = (reco.produits || []).join(", ") || "";
      } else {
        readableCosmetics = client.cosmeticsUsed && !client.cosmeticsUsed.startsWith("KENE_")
          ? client.cosmeticsUsed
          : "";
      }

      // Allergies du compte app (si la fiche est liée) — miroir santé papier.
      const linkedUser = client.userId
        ? await db.user.findUnique({ where: { id: client.userId }, select: { allergies: true } })
        : null;

      // Self-scans: visibilité PAR DATE — les scans réalisés pendant un partage
      // actif restent visibles après révocation, pas les suivants.
      const visibility = client.userId ? await getScanVisibility(client.userId, tenant.id) : null;
      const scansShared = visibility?.currentlyShared ?? false;
      const scansRaw = client.userId && visibility
        ? await db.diagnosis.findMany({
            where: { userId: client.userId, status: "done" },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { zone: true, scoreGlobal: true, createdAt: true },
          })
        : [];
      const scans = visibility ? scansRaw.filter((s) => visibility.isVisibleAt(s.createdAt)).slice(0, 3) : [];

      let mergedNotes = client.notes || "";
      if (linkedUser?.allergies) {
        mergedNotes = `${mergedNotes ? `${mergedNotes} · ` : ""}Allergies app : ${linkedUser.allergies.slice(0, 120)}`;
      }

      prefill = {
        name: client.name,
        phone: client.phone,
        skinType: client.skinType,
        fitzpatrick: client.fitzpatrick,
        notes: mergedNotes || null,
        cosmeticsUsed: readableCosmetics || null,
        productObservations: client.productObservations,
        appAccount: Boolean(client.userId),
        scansShared,
        scans: scans.map((s) => ({ zone: s.zone, score: s.scoreGlobal, date: s.createdAt.toISOString() })),
        // Données du diagnostic cabine
        answers: parsedAnswers,
        latestDiagnosisDate: latestProDiag?.createdAt || latestUserDiag?.createdAt || null,
        latestDiagnosisScore: latestProDiag?.scoreGlobal ?? latestUserDiag?.scoreGlobal ?? null,
        cureNumber: prescription.cureNumber || 1,
        prescriptionStatus: prescription.status || "active",
        routineMatin,
        routineSoir,
        soinsCabine,
        botaniques,
        consentPhoto: latestProDiag?.consentPhoto ?? false,
        consentData: latestProDiag?.consentData ?? false,
        consentDate: latestProDiag?.consentTs ?? latestProDiag?.createdAt ?? null,
        clinicalObservations: client.productObservations || null,
      };
    }

    const pdf = consultationSheetPdf({
      tenantName: tenant.name,
      tenantCity: tenant.city,
      tenantPhone: tenant.phone,
      practitioner,
      zone,
      client: prefill,
      date: new Date(),
    });

    return new NextResponse(new Uint8Array(pdf.data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${consultationSheetFilename(prefill?.name)}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    return serverError("pro/consultation-sheet:GET", err);
  }
}
