// Test automatisé : Génération du compte-rendu PDF avec photo d'analyse multi-spectrale en cabine (Acné & Film Lipidique)
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { processSpectralAcneImage } from "../src/lib/kene/spectral-imaging";
import { proDiagReportPdf, clientDiagReportPdf } from "../src/lib/kene/consultation-pdf";

async function run() {
  console.log("=== TEST COMPTE-RENDU PDF AVEC ANALYSE MULTI-SPECTRALE ===");

  // 1. Test processSpectralAcneImage en mode synthétique
  console.log("\n1. Test du processeur multi-spectral (mode synthétique)...");
  const syntheticResult = await processSpectralAcneImage(null, {
    clientName: "Test Cliente",
    zoneLabel: "visage",
  });
  console.log("  - isRealPhoto:", syntheticResult.isRealPhoto);
  console.log("  - Dimensions:", syntheticResult.width, "x", syntheticResult.height);
  console.log("  - JPEG bytes length:", syntheticResult.jpegBytes.length);
  if (syntheticResult.jpegBytes.length < 1000) {
    throw new Error("Taille du JPEG synthétique invalide");
  }

  // 2. Test proDiagReportPdf avec image synthétique
  console.log("\n2. Test génération PDF proDiagReportPdf avec projection multi-spectrale...");
  const dummyProResult = {
    score_global: 74,
    source: "vlm+questionnaire",
    indicateurs: [
      { nom: "Hydratation", pourcentage: 62, severite: 1 },
      { nom: "Sébum & Brillance", pourcentage: 45, severite: 2 },
      { nom: "Imperfections & Acné", pourcentage: 52, severite: 2 },
    ],
    recommandations: {
      resume: "Régulation sébacée douce et protection barrière.",
      routine_matin: ["Nettoyant doux", "Lotion rééquilibrante"],
      routine_soir: ["Double nettoyage", "Soin ciblé"],
      botaniques_conseillees: ["Moringa", "Néroli"],
      soins_conseilles: ["Soin cabine purifiant"],
      conseils_hygiene_vie: ["Hydratation régulière"],
    },
    orientation_dermato: false,
  };

  const proPdf = proDiagReportPdf({
    tenantName: "Institut Kènè Cocody",
    tenantCity: "Abidjan",
    tenantPhone: "+225 07 00 00 00",
    diagnosis: {
      zone: "visage",
      practitioner: "Dr. Kènè Pro",
      createdAt: new Date(),
      scoreGlobal: 74,
      consentPhoto: true,
      consentData: true,
      consentTs: new Date(),
      photoUsed: true,
      vlmUsed: true,
      questionnaireJson: JSON.stringify({ fitz: "VI", type_peau: "grasse" }),
      resultJson: JSON.stringify(dummyProResult),
    },
    client: { name: "Awa Touré", phone: "+225 01 23 45 67" },
    spectralImage: syntheticResult,
  });

  console.log("  - Pages générées:", proPdf.pages);
  console.log("  - Octets PDF:", proPdf.data.length);
  const proPdfString = Buffer.from(proPdf.data).toString("binary");
  if (!proPdfString.startsWith("%PDF-1.4")) {
    throw new Error("En-tête PDF-1.4 manquant");
  }
  if (!proPdfString.includes("/proSpectralAcne") || !proPdfString.includes("/DCTDecode")) {
    throw new Error("XObject image /proSpectralAcne DCTDecode non trouvé dans le PDF");
  }
  if (!proPdfString.includes("ANALYSE MULTI-SPECTRALE EN CABINE")) {
    throw new Error("Titre de section multi-spectrale non trouvé dans le PDF");
  }
  console.log("  - XObject /proSpectralAcne et en-têtes validés avec succès !");

  // 3. Test avec une vraie photo en base de données
  console.log("\n3. Recherche d'un ProDiagnosis avec photo réelle...");
  const realDiag = await db.proDiagnosis.findFirst({
    where: { photoUsed: true, photoData: { not: null } },
    include: { clientProfile: true, tenant: true },
  });

  if (realDiag && realDiag.photoData) {
    console.log(`  - Trouvé: diagnostic ${realDiag.id} pour ${realDiag.clientProfile.name}`);
    console.log(`  - Taille photo brute base64: ${realDiag.photoData.length} caractères`);

    const realSpectral = await processSpectralAcneImage(realDiag.photoData, {
      clientName: realDiag.clientProfile.name,
      date: realDiag.createdAt,
      zoneLabel: realDiag.zone,
    });

    console.log("  - Traitement multi-spectral réel réussi !");
    console.log("  - isRealPhoto:", realSpectral.isRealPhoto);
    console.log("  - JPEG bytes length:", realSpectral.jpegBytes.length);

    const realPdf = proDiagReportPdf({
      tenantName: realDiag.tenant.name,
      tenantCity: realDiag.tenant.city,
      tenantPhone: realDiag.tenant.phone,
      diagnosis: {
        zone: realDiag.zone,
        practitioner: realDiag.practitioner,
        createdAt: realDiag.createdAt,
        scoreGlobal: realDiag.scoreGlobal,
        consentPhoto: realDiag.consentPhoto,
        consentData: realDiag.consentData,
        consentTs: realDiag.consentTs,
        photoUsed: realDiag.photoUsed,
        vlmUsed: realDiag.vlmUsed,
        questionnaireJson: realDiag.questionnaireJson,
        resultJson: realDiag.resultJson,
        photoData: realDiag.photoData,
      },
      client: { name: realDiag.clientProfile.name, phone: realDiag.clientProfile.phone },
      spectralImage: realSpectral,
    });

    console.log("  - Pages PDF réel:", realPdf.pages);
    console.log("  - Octets PDF réel:", realPdf.data.length);

    // Sauvegarde du PDF dans un dossier de contrôle
    const outDir = path.join(process.cwd(), "scratch");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "compte-rendu-cabine-spectral-test.pdf");
    fs.writeFileSync(outPath, realPdf.data);
    console.log(`  - PDF de contrôle écrit sur le disque : ${outPath}`);
  } else {
    console.log("  - Aucune photo réelle en base, test synthétique suffisant.");
  }

  // 4. Test clientDiagReportPdf avec spectralImage
  console.log("\n4. Test clientDiagReportPdf avec analyse multi-spectrale...");
  const clientPdf = clientDiagReportPdf({
    userName: "Fanta Keïta",
    diagnosis: {
      id: "diag-test-123",
      zone: "visage",
      createdAt: new Date(),
      resultJson: JSON.stringify(dummyProResult),
    },
    spectralImage: syntheticResult,
  });
  console.log("  - Pages client PDF:", clientPdf.pages);
  console.log("  - Octets client PDF:", clientPdf.data.length);
  const clientPdfString = Buffer.from(clientPdf.data).toString("binary");
  if (!clientPdfString.includes("/clientSpectralAcne")) {
    throw new Error("XObject /clientSpectralAcne non trouvé dans le PDF cliente");
  }

  console.log("\n>>> TOUS LES TESTS PDF MULTI-SPECTRAUX ONT RÉUSSI AVEC SUCCÈS ! <<<");
}

run().catch((err) => {
  console.error("ÉCHEC DU TEST :", err);
  process.exit(1);
});
