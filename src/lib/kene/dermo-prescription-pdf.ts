// Kènè — Ordonnance Dermo-Botanique & Pass Cabine (PDF Vectoriel Natif)
// Moteur PDF zéro-dépendance (src/lib/accounting/pdf.ts) avec QR Code vectoriel intégré
// Conforme pour remise cliente & transmission protocole en salon.

import QRCode from "qrcode";
import {
  PdfDoc,
  PAGE_W,
  M_X,
  M_RIGHT,
  CONTENT_W,
  INK,
  SOFT,
  GOLD,
  GOLD_DARK,
  GOLD_BAND,
  CREAM,
  LINE,
  GREEN,
  RED,
  type RGB,
} from "@/lib/accounting/pdf";
import type { DiagnosisResult } from "@/lib/kene/types";
import { BODY_ZONES } from "@/lib/kene/types";

export interface PrescriptionPdfInput {
  userName: string;
  userPhone?: string;
  zone: string;
  createdAt: Date | string;
  diagnosisResult: DiagnosisResult;
  passUrl?: string;
  tenantName?: string;
}

const fmtDateLong = (d: Date | string): string => {
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "Date du jour";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/** Dessine un QR Code 100% vectoriel dans le document PDF */
function drawVectorQrCode(doc: PdfDoc, text: string, x: number, y: number, totalSize: number): void {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const modules = qr.modules;
    const numModules = modules.size;
    const moduleSize = totalSize / numModules;

    // Fond crème
    doc.rect(x - 4, y - 4, totalSize + 8, totalSize + 8, CREAM);
    doc.rectStroke(x - 4, y - 4, totalSize + 8, totalSize + 8, GOLD, 0.8);

    // Tracé des modules noirs
    for (let row = 0; row < numModules; row++) {
      for (let col = 0; col < numModules; col++) {
        if (modules.get(row, col)) {
          doc.rect(x + col * moduleSize, y + row * moduleSize, moduleSize + 0.1, moduleSize + 0.1, INK);
        }
      }
    }
  } catch {
    // Si échec génération QR, encadré de repli
    doc.rect(x, y, totalSize, totalSize, CREAM);
    doc.text("QR PASS", x + 10, y + totalSize / 2, { size: 9, color: SOFT });
  }
}

/** Génère la recommandation dermo-botanique avec son Pass Cabine vectoriel */
export function generatePrescriptionPdf(input: PrescriptionPdfInput): { data: Uint8Array; pages: number } {
  const doc = new PdfDoc("Kènè — Recommandation Dermo-Botanique & Pass Cabine");
  doc.setFooter(`Kènè · Plateforme éditée par Dermo TIC · Recommandation de Soin Botanique & Pass Cabine · ${input.userName} · ${fmtDateLong(input.createdAt)}`);

  const zoneLabel = BODY_ZONES.find((z) => z.id === input.zone)?.label ?? input.zone;
  const res = input.diagnosisResult;

  // 1. BANDEAU DE TÊTE LUXE
  doc.ensure(56);
  doc.rect(M_X, doc.cursorY, CONTENT_W, 46, GOLD);
  doc.text("KÈNÈ · HAUTE COSMÉTOLOGIE BOTANIQUE", M_X + 12, doc.cursorY + 14, {
    font: "bold",
    size: 11,
    color: CREAM,
    letterSpace: 1.2,
  });
  doc.text("RECOMMANDATION DE SOIN & PASS CABINE", M_X + 12, doc.cursorY + 28, {
    font: "bold",
    size: 11.5,
    color: CREAM,
  });
  doc.textRight(fmtDateLong(input.createdAt), M_RIGHT - 12, doc.cursorY + 14, {
    size: 8.5,
    color: CREAM,
  });
  doc.textRight(`Zone : ${zoneLabel.toUpperCase()}`, M_RIGHT - 12, doc.cursorY + 28, {
    size: 8.5,
    color: CREAM,
  });
  doc.advance(56);

  // 2. BLOC IDENTITÉ CLIENTE & SYNTHÈSE SCORE
  doc.ensure(52);
  doc.rect(M_X, doc.cursorY, CONTENT_W, 44, CREAM);
  doc.rectStroke(M_X, doc.cursorY, CONTENT_W, 44, LINE, 0.8);

  // Colonne gauche : Bénéficiaire
  doc.text("BÉNÉFICIAIRE", M_X + 12, doc.cursorY + 12, { font: "bold", size: 8, color: SOFT });
  doc.text(input.userName, M_X + 12, doc.cursorY + 24, { font: "bold", size: 12, color: INK });
  if (input.userPhone) {
    doc.text(`Tél : ${input.userPhone}`, M_X + 12, doc.cursorY + 35, { size: 8.5, color: SOFT });
  }

  // Colonne droite : Score cutané
  const score = res.score_global ?? 75;
  const scoreColor: RGB = score >= 75 ? GREEN : score >= 50 ? GOLD_DARK : RED;
  doc.textRight("VITALITÉ CUTANÉE", M_RIGHT - 12, doc.cursorY + 12, { font: "bold", size: 8, color: SOFT });
  doc.textRight(`${score} / 100`, M_RIGHT - 12, doc.cursorY + 26, { font: "bold", size: 14, color: scoreColor });
  if (res.fitzpatrick_estime) {
    doc.textRight(`Phototype : ${res.fitzpatrick_estime}`, M_RIGHT - 12, doc.cursorY + 36, { size: 8.5, color: SOFT });
  }
  doc.advance(54);

  // 3. RITUELS PRESCRITS (Matin & Soir)
  doc.ensure(24);
  doc.rect(M_X, doc.cursorY, CONTENT_W, 16, GOLD_BAND);
  doc.text("RITUEL BOTANIQUE QUOTIDIEN RECOMMANDÉ", M_X + 8, doc.cursorY + 11, {
    font: "bold",
    size: 9.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });
  doc.advance(22);

  const reco = res.recommandations;

  if (reco?.routine_matin && reco.routine_matin.length > 0) {
    doc.ensure(18);
    doc.text("🌞 LE MATIN :", M_X + 4, doc.cursorY, { font: "bold", size: 9, color: GOLD_DARK });
    doc.advance(12);
    for (const step of reco.routine_matin) {
      doc.ensure(12);
      doc.text("• " + step, M_X + 12, doc.cursorY, { size: 8.5, color: INK, maxW: CONTENT_W - 20 });
      doc.advance(11);
    }
    doc.advance(4);
  }

  if (reco?.routine_soir && reco.routine_soir.length > 0) {
    doc.ensure(18);
    doc.text("🌙 LE SOIR :", M_X + 4, doc.cursorY, { font: "bold", size: 9, color: GOLD_DARK });
    doc.advance(12);
    for (const step of reco.routine_soir) {
      doc.ensure(12);
      doc.text("• " + step, M_X + 12, doc.cursorY, { size: 8.5, color: INK, maxW: CONTENT_W - 20 });
      doc.advance(11);
    }
    doc.advance(4);
  }

  // 4. BOTANIQUES D'AFRIQUE DE L'OUEST & SOINS INSTITUT
  if (reco?.botaniques_conseillees && reco.botaniques_conseillees.length > 0) {
    doc.ensure(20);
    doc.text("🌿 ACTIFS BOTANIQUES CLÉS :", M_X + 4, doc.cursorY, { font: "bold", size: 9, color: GOLD_DARK });
    doc.advance(12);
    doc.text(reco.botaniques_conseillees.join("  ·  "), M_X + 12, doc.cursorY, {
      size: 8.5,
      color: INK,
      font: "oblique",
      maxW: CONTENT_W - 20,
    });
    doc.advance(16);
  }

  if (reco?.soins_conseilles && reco.soins_conseilles.length > 0) {
    doc.ensure(20);
    doc.text("💆‍♀️ PROTOCOLE EN CABINE CONSEILLÉ :", M_X + 4, doc.cursorY, { font: "bold", size: 9, color: GOLD_DARK });
    doc.advance(12);
    doc.text(reco.soins_conseilles.join("  ·  "), M_X + 12, doc.cursorY, {
      size: 8.5,
      color: INK,
      maxW: CONTENT_W - 20,
    });
    doc.advance(18);
  }

  // 5. ENCADRÉ PASS CABINE AVEC QR CODE VECTORIEL
  doc.ensure(90);
  const qrBoxY = doc.cursorY;
  const qrBoxH = 80;
  doc.rect(M_X, qrBoxY, CONTENT_W, qrBoxH, CREAM);
  doc.rectStroke(M_X, qrBoxY, CONTENT_W, qrBoxH, GOLD, 1);

  // Tracé du QR Code vectoriel (62x62 pt)
  const qrTarget = input.passUrl || `https://kene.app/pass?u=${encodeURIComponent(input.userName)}&z=${input.zone}`;
  drawVectorQrCode(doc, qrTarget, M_X + 12, qrBoxY + 9, 62);

  // Texte d'explication Pass Cabine
  const textX = M_X + 88;
  doc.text("PASS CABINE KÈNÈ (SCAN INSTITUT)", textX, qrBoxY + 18, {
    font: "bold",
    size: 10,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });
  doc.text(
    "Présentez ce QR Code lors de votre passage en salon ou spa partenaire.",
    textX,
    qrBoxY + 31,
    { size: 8.5, color: INK, maxW: CONTENT_W - 95 }
  );
  doc.text(
    "L'esthéticienne chargera directement votre profil dermo-botanique et adaptera les principes actifs en cabine.",
    textX,
    qrBoxY + 43,
    { size: 8, color: SOFT, maxW: CONTENT_W - 95 }
  );
  doc.text("Validité : 90 jours · Mis à jour à chaque diagnostic", textX, qrBoxY + 65, {
    font: "oblique",
    size: 7.5,
    color: SOFT,
  });

  doc.advance(qrBoxH + 16);

  // 6. MENTION DÉONTOLOGIQUE
  doc.ensure(28);
  doc.rect(M_X, doc.cursorY, CONTENT_W, 20, CREAM);
  doc.text(
    "Note déontologique : Ce document d'orientation cosmétique est édité via la plateforme technologique Kènè (Dermo TIC) pour guider votre rituel de soin quotidien et en institut partenaire. Il ne remplace pas une consultation médicale dermatologique en cas de pathologie avérée.",
    M_X + 8,
    doc.cursorY + 8,
    { size: 7.5, color: SOFT, maxW: CONTENT_W - 16 }
  );
  doc.advance(24);

  return doc.finish();
}
