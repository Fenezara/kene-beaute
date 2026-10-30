// Kènè — Ordonnance Dermo-Cosmétique & Pass Cabine (PDF Vectoriel Natif)
// Moteur PDF zéro-dépendance (src/lib/accounting/pdf.ts) avec QR Code vectoriel intégré
// Conforme pour remise cliente & transmission protocole en salon.

import QRCode from "qrcode";
import {
  PdfDoc,
  M_X,
  M_RIGHT,
  CONTENT_W,
  INK,
  SOFT,
  BISSAP,
  BISSAP_DARK,
  BISSAP_SOFT,
  GOLD,
  GOLD_DARK,
  KARITE,
  CREAM,
  CARD,
  LINE,
  GREEN,
  RED,
  INDIGO,
  type RGB,
} from "@/lib/accounting/pdf";
import type { DiagnosisResult } from "@/lib/kene/types";
import { BODY_ZONES } from "@/lib/kene/types";
import type { StructuredPrescription } from "@/lib/kene/prescription-schema";

export interface PrescriptionPdfInput {
  userName: string;
  userPhone?: string;
  zone: string;
  createdAt: Date | string;
  diagnosisResult?: DiagnosisResult | null;
  passUrl?: string;
  tenantName?: string;
  cureNumber?: number;
  changeReason?: string;
  structuredPrescription?: StructuredPrescription;
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

/** Génère la recommandation dermo-cosmétique avec son Pass Cabine vectoriel */
export function generatePrescriptionPdf(input: PrescriptionPdfInput): { data: Uint8Array; pages: number } {
  const doc = new PdfDoc("Kènè — Ordonnance Dermo-Esthétique & Pass Cabine");
  doc.setFooter(`Kènè · Plateforme éditée par Dermo TIC · Ordonnance Dermo-Esthétique & Pass Cabine · ${input.userName} · ${fmtDateLong(input.createdAt)}`);

  const zoneLabel = BODY_ZONES.find((z) => z.id === input.zone)?.label ?? input.zone;
  const res = input.diagnosisResult;
  const sp = input.structuredPrescription;
  const instName = sp?.tenantName || input.tenantName || "Cabinet LA DERMO";
  const activeCure = sp?.cureNumber || input.cureNumber || 1;

  const hasInstitutePrescription = Boolean(
    sp &&
    (sp.products.length > 0 || sp.cabineServices.length > 0 || (sp.notes && sp.notes.trim().length > 0))
  );

  // 1. BANDEAU DE TÊTE LUXE KÈNÈ
  doc.ensure(64);
  const topY = doc.cursorY;
  const bannerH = 54;
  doc.rect(M_X, topY, CONTENT_W, bannerH, CARD);
  doc.rectStroke(M_X, topY, CONTENT_W, bannerH, LINE, 0.7);
  doc.drawBrandRibbon(M_X, topY, CONTENT_W, 3.5);

  doc.text("KÈNÈ · HAUTE COSMÉTOLOGIE BOTANIQUE", M_X + 12, topY + 15, {
    font: "bold",
    size: 10,
    color: BISSAP,
    letterSpace: 1.4,
  });

  const docTitle = `ORDONNANCE DERMO-ESTHÉTIQUE · CURE ACTIVE #${activeCure}`;
  doc.text(docTitle, M_X + 12, topY + 29, {
    font: "bold",
    size: 11,
    color: INK,
  });

  doc.text(`Établie par l'équipe de « ${instName} »`, M_X + 12, topY + 43, {
    font: "bold",
    size: 9,
    color: GOLD_DARK,
  });

  doc.textRight(fmtDateLong(input.createdAt), M_RIGHT - 12, topY + 16, {
    size: 8,
    color: SOFT,
  });
  doc.textRight(`Zone : ${zoneLabel.toUpperCase()}`, M_RIGHT - 12, topY + 30, {
    font: "bold",
    size: 8.5,
    color: GOLD_DARK,
  });
  doc.advance(62);

  // 2. BLOC IDENTITÉ CLIENTE & SYNTHÈSE SCORE
  doc.ensure(50);
  doc.rect(M_X, doc.cursorY, CONTENT_W, 42, KARITE);
  doc.rectStroke(M_X, doc.cursorY, CONTENT_W, 42, LINE, 0.8);

  // Colonne gauche : Bénéficiaire
  doc.text("BÉNÉFICIAIRE", M_X + 12, doc.cursorY + 12, { font: "bold", size: 8, color: SOFT });
  doc.text(input.userName, M_X + 12, doc.cursorY + 24, { font: "bold", size: 11.5, color: INK });
  if (input.userPhone) {
    doc.text(`Tél : ${input.userPhone}`, M_X + 12, doc.cursorY + 34, { size: 8, color: SOFT });
  }

  // Colonne droite : Score cutané
  const score = res?.score_global ?? 80;
  const scoreColor: RGB = score >= 75 ? GREEN : score >= 50 ? GOLD_DARK : RED;
  doc.textRight("VITALITÉ CUTANÉE", M_RIGHT - 12, doc.cursorY + 12, { font: "bold", size: 8, color: SOFT });
  doc.textRight(`${score} / 100`, M_RIGHT - 12, doc.cursorY + 25, { font: "bold", size: 13, color: scoreColor });
  if (res?.fitzpatrick_estime) {
    const rawF = res.fitzpatrick_estime;
    const labelF =
      rawF === "albinos"
        ? "Albinos (OCA)"
        : rawF === "rouquine"
        ? "Afro-rousse (Phéomélanine)"
        : rawF === "III"
        ? "Fitzpatrick III (Chabine)"
        : rawF === "IV"
        ? "Fitzpatrick IV (Caramel)"
        : rawF === "V"
        ? "Fitzpatrick V (Brune)"
        : rawF === "VI"
        ? "Fitzpatrick VI (Ébène)"
        : `Phototype ${rawF}`;
    doc.textRight(`Nuance : ${labelF}`, M_RIGHT - 12, doc.cursorY + 35, { size: 8, color: SOFT });
  }
  doc.advance(50);

  // 🎯 Évolution & Motif de transition de cure
  const changeReason = sp?.changeReason || input.changeReason;
  if (changeReason) {
    doc.ensure(30);
    doc.rect(M_X, doc.cursorY, CONTENT_W, 24, CREAM);
    doc.rectStroke(M_X, doc.cursorY, CONTENT_W, 24, GOLD, 0.7);
    doc.text("OBJECTIF & ÉVOLUTION DU PROTOCOLE :", M_X + 10, doc.cursorY + 9, {
      font: "bold",
      size: 8,
      color: GOLD_DARK,
    });
    doc.text(changeReason, M_X + 10, doc.cursorY + 19, {
      font: "oblique",
      size: 8.5,
      color: INK,
      maxW: CONTENT_W - 20,
    });
    doc.advance(30);
  }

  if (hasInstitutePrescription && sp) {
    // ═══════════════ CAS 1 : VÉRITABLE ORDONNANCE ÉMISE PAR L'INSTITUT ═══════════════

    // 1. PRODUITS COSMÉTIQUES PRESCRITS POUR CHEZ VOUS
    if (sp.products.length > 0) {
      doc.ensure(28);
      doc.rect(M_X, doc.cursorY, CONTENT_W, 18, BISSAP_SOFT);
      doc.text(`1. PRODUITS COSMÉTIQUES PRESCRITS POUR CHEZ VOUS (${sp.products.length})`, M_X + 10, doc.cursorY + 12, {
        font: "bold",
        size: 9,
        color: BISSAP_DARK,
        letterSpace: 0.5,
      });
      doc.advance(24);

      for (let i = 0; i < sp.products.length; i++) {
        const prod = sp.products[i];
        doc.ensure(36);
        const cardY = doc.cursorY;
        const cardH = 32;

        doc.rect(M_X, cardY, CONTENT_W, cardH, CARD);
        doc.rectStroke(M_X, cardY, CONTENT_W, cardH, LINE, 0.6);

        // Nom du produit + moment
        const momentStr =
          prod.moment === "matin"
            ? "Matin"
            : prod.moment === "soir"
            ? "Soir"
            : prod.moment === "matin_soir"
            ? "Matin & Soir"
            : "Hebdomadaire";

        doc.text(`${prod.name}`, M_X + 10, cardY + 12, {
          font: "bold",
          size: 9.5,
          color: INK,
        });

        doc.text(`[ ${momentStr} ]`, M_X + 140, cardY + 12, {
          font: "bold",
          size: 8,
          color: BISSAP,
        });

        // Prix à droite
        if (prod.price) {
          doc.textRight(`${prod.price.toLocaleString("fr-FR")} FCFA`, M_RIGHT - 10, cardY + 12, {
            font: "bold",
            size: 9,
            color: GOLD_DARK,
          });
        }

        // Posologie / application
        const posologyText = prod.posology || "Appliquer selon recommandations sur peau propre";
        doc.text(`👉 ${posologyText}`, M_X + 10, cardY + 23, {
          size: 8,
          color: SOFT,
          maxW: CONTENT_W - 30,
        });

        doc.advance(cardH + 4);
      }
      doc.advance(6);
    }

    // 2. SOINS ESTHÉTIQUES PRESCRITS EN CABINE
    if (sp.cabineServices.length > 0) {
      doc.ensure(28);
      doc.rect(M_X, doc.cursorY, CONTENT_W, 18, KARITE);
      doc.rectStroke(M_X, doc.cursorY, CONTENT_W, 18, LINE, 0.7);
      doc.text(`2. SOINS ESTHÉTIQUES PRESCRITS EN CABINE (${sp.cabineServices.length})`, M_X + 10, doc.cursorY + 12, {
        font: "bold",
        size: 9,
        color: INDIGO,
        letterSpace: 0.5,
      });
      doc.advance(24);

      for (let i = 0; i < sp.cabineServices.length; i++) {
        const srv = sp.cabineServices[i];
        doc.ensure(36);
        const cardY = doc.cursorY;
        const cardH = 32;

        doc.rect(M_X, cardY, CONTENT_W, cardH, CARD);
        doc.rectStroke(M_X, cardY, CONTENT_W, cardH, LINE, 0.6);

        // Nom du soin + durée
        const durStr = srv.durationMin ? ` (${srv.durationMin} min)` : "";
        doc.text(`${srv.name}${durStr}`, M_X + 10, cardY + 12, {
          font: "bold",
          size: 9.5,
          color: INK,
        });

        // Prix à droite
        if (srv.price) {
          doc.textRight(`${srv.price.toLocaleString("fr-FR")} FCFA`, M_RIGHT - 10, cardY + 12, {
            font: "bold",
            size: 9,
            color: INDIGO,
          });
        }

        // Rythme & protocole
        let desc = `Rythme conseillé : ${srv.frequency || "1 fois par mois"}`;
        if (srv.sessionsCount && srv.sessionsCount > 1) {
          desc += ` · Cure de ${srv.sessionsCount} séances`;
        }
        if (srv.objective) {
          desc += ` · Objectif : ${srv.objective}`;
        }

        doc.text(desc, M_X + 10, cardY + 23, {
          size: 8,
          color: SOFT,
          maxW: CONTENT_W - 30,
        });

        doc.advance(cardH + 4);
      }
      doc.advance(6);
    }

    // 3. RECOMMANDATIONS DE LA DERMO-CONSEILLÈRE
    if (sp.notes && sp.notes.trim()) {
      doc.ensure(44);
      const noteY = doc.cursorY;
      const noteH = 36;
      doc.rect(M_X, noteY, CONTENT_W, noteH, CREAM);
      doc.rectStroke(M_X, noteY, CONTENT_W, noteH, GOLD, 0.7);

      doc.text("RECOMMANDATIONS DE VOTRE DERMO-CONSEILLÈRE :", M_X + 10, noteY + 12, {
        font: "bold",
        size: 8.5,
        color: GOLD_DARK,
      });

      doc.text(sp.notes, M_X + 10, noteY + 24, {
        size: 8.5,
        color: INK,
        maxW: CONTENT_W - 20,
      });

      doc.advance(noteH + 10);
    }

  } else {
    // ═══════════════ CAS 2 : RECOMMANDATIONS SCAN IA (GÉNÉRIQUE) ═══════════════
    doc.ensure(24);
    doc.rect(M_X, doc.cursorY, CONTENT_W, 16, BISSAP_SOFT);
    doc.text("RITUEL BOTANIQUE QUOTIDIEN RECOMMANDÉ", M_X + 8, doc.cursorY + 11, {
      font: "bold",
      size: 9,
      color: BISSAP_DARK,
      letterSpace: 0.5,
    });
    doc.advance(22);

    const reco = res?.recommandations;

    if (reco?.routine_matin && reco.routine_matin.length > 0) {
      doc.ensure(18);
      doc.text("ROUTINE DU MATIN :", M_X + 4, doc.cursorY, { font: "bold", size: 9, color: GOLD_DARK });
      doc.advance(12);
      for (const step of reco.routine_matin) {
        doc.ensure(12);
        doc.text("- " + step, M_X + 12, doc.cursorY, { size: 8.5, color: INK, maxW: CONTENT_W - 20 });
        doc.advance(11);
      }
      doc.advance(4);
    }

    if (reco?.routine_soir && reco.routine_soir.length > 0) {
      doc.ensure(18);
      doc.text("ROUTINE DU SOIR :", M_X + 4, doc.cursorY, { font: "bold", size: 9, color: GOLD_DARK });
      doc.advance(12);
      for (const step of reco.routine_soir) {
        doc.ensure(12);
        doc.text("- " + step, M_X + 12, doc.cursorY, { size: 8.5, color: INK, maxW: CONTENT_W - 20 });
        doc.advance(11);
      }
      doc.advance(4);
    }

    if (reco?.botaniques_conseillees && reco.botaniques_conseillees.length > 0) {
      doc.ensure(20);
      doc.text("ACTIFS BOTANIQUES CLES :", M_X + 4, doc.cursorY, { font: "bold", size: 9, color: GOLD_DARK });
      doc.advance(12);
      doc.text(reco.botaniques_conseillees.join("  -  "), M_X + 12, doc.cursorY, {
        size: 8.5,
        color: INK,
        font: "oblique",
        maxW: CONTENT_W - 20,
      });
      doc.advance(16);
    }
  }

  // 4. ENCADRÉ PASS CABINE AVEC QR CODE VECTORIEL
  doc.ensure(88);
  const qrBoxY = doc.cursorY;
  const qrBoxH = 78;
  doc.rect(M_X, qrBoxY, CONTENT_W, qrBoxH, KARITE);
  doc.rectStroke(M_X, qrBoxY, CONTENT_W, qrBoxH, BISSAP, 0.8);

  // Tracé du QR Code vectoriel (60x60 pt)
  const qrTarget = input.passUrl || `https://kene.app/pass?u=${encodeURIComponent(input.userName)}&z=${input.zone}`;
  drawVectorQrCode(doc, qrTarget, M_X + 12, qrBoxY + 9, 60);

  // Texte d'explication Pass Cabine
  const textX = M_X + 88;
  doc.text("PASS CABINE KÈNÈ (SCAN INSTITUT)", textX, qrBoxY + 18, {
    font: "bold",
    size: 9.5,
    color: BISSAP_DARK,
    letterSpace: 0.5,
  });
  doc.text(
    `Présentez ce QR Code lors de votre passage au « ${instName} ».`,
    textX,
    qrBoxY + 31,
    { size: 8.5, color: INK, maxW: CONTENT_W - 95 }
  );
  doc.text(
    "L'esthéticienne chargera directement votre ordonnance dermo-esthétique et adaptera vos protocoles en cabine.",
    textX,
    qrBoxY + 43,
    { size: 8, color: SOFT, maxW: CONTENT_W - 95 }
  );
  doc.text("Validité : 90 jours · Mis à jour à chaque consultation en institut", textX, qrBoxY + 63, {
    font: "oblique",
    size: 7.5,
    color: SOFT,
  });

  doc.advance(qrBoxH + 14);

  // 5. MENTION DÉONTOLOGIQUE
  doc.ensure(26);
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
