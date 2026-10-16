// Kènè Pro — Moteur de génération des Bulletins de Paie officiels A4 (PDF vectoriel)
// Conforme réglementation du travail OHADA, CNPS Côte d'Ivoire & IPRES / IPM Sénégal.

import {
  PdfDoc,
  textWidth,
  wrapText,
  INK,
  SOFT,
  BISSAP,
  GOLD,
  GOLD_DARK,
  GOLD_BAND,
  CARD,
  CREAM,
  LINE,
  LINE_LIGHT,
  M_X,
  M_RIGHT,
  CONTENT_W,
  type RGB,
} from "@/lib/accounting/pdf";
import type { ProPayslip, PayslipDetails } from "@/components/kene/pro/types";
import { formatRole } from "@/lib/kene/hr-constants";

export interface PayslipPdfInput {
  tenantName: string;
  tenantCity?: string | null;
  tenantPhone?: string | null;
  periodLabel: string;
  country: string;
  slip: ProPayslip;
}

function parseDetails(ps: ProPayslip): PayslipDetails {
  try {
    const d = JSON.parse(ps.detailsJson) as PayslipDetails;
    return { ...d, lines: Array.isArray(d.lines) ? d.lines : [] };
  } catch {
    return { lines: [] };
  }
}

const fmtNumber = (n: number | undefined | null): string => {
  if (n === undefined || n === null || Number.isNaN(n)) return "";
  return Math.round(n).toLocaleString("fr-FR");
};

const fmtXOF = (n: number | undefined | null): string => {
  if (n === undefined || n === null || Number.isNaN(n)) return "0 FCFA";
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
};

function drawBox(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: RGB,
  stroke: RGB = LINE,
  lw = 0.6
): void {
  if (fill) doc.rect(x, y, w, h, fill);
  if (stroke && lw > 0) doc.rectStroke(x, y, w, h, stroke, lw);
}

export function generatePayslipPdf(input: PayslipPdfInput): { data: Uint8Array; pages: number } {
  const { tenantName, tenantCity, tenantPhone, periodLabel, country, slip } = input;
  const details = parseDetails(slip);
  const employee = slip.employee;

  const doc = new PdfDoc(`Kènè Pro — Bulletin de paie · ${employee.name} · ${periodLabel}`);
  doc.setFooter(
    `Kènè Pro — Bulletin de paie · ${tenantName} · ${employee.name} · Période ${periodLabel} · Conforme CNPS / IPRES`
  );

  // 1. En-tête officiel
  doc.ensure(58);
  const topY = doc.cursorY;
  const bannerH = 50;

  drawBox(doc, M_X, topY, CONTENT_W, bannerH, CARD, LINE, 0.7);
  doc.drawBrandRibbon(M_X, topY, CONTENT_W, 3.2);

  // Colonne Gauche : Institut
  doc.text("KÈNÈ PRO", M_X + 12, topY + 16, { font: "bold", size: 10.5, color: BISSAP, letterSpace: 1.5 });
  doc.text(tenantName.toUpperCase(), M_X + 12, topY + 28, { font: "bold", size: 10, color: INK, letterSpace: 0.3 });
  const subLocation = [tenantCity ?? "Abidjan", tenantPhone].filter(Boolean).join(" · ");
  doc.text(subLocation, M_X + 12, topY + 41, { size: 7.2, color: SOFT });

  // Colonne Droite : Titre Bulletin & Période
  doc.textRight("BULLETIN DE PAIE", M_RIGHT - 12, topY + 20, { font: "bold", size: 12, color: INK, letterSpace: 0.5 });
  doc.textRight(`Période de paie : ${periodLabel}`, M_RIGHT - 12, topY + 34, { font: "bold", size: 8.5, color: GOLD_DARK });
  doc.textRight(
    country === "SN" ? "Régime IPRES / IPM (Sénégal)" : "Régime CNPS / IGR (Côte d'Ivoire)",
    M_RIGHT - 12,
    topY + 44,
    { size: 7, color: SOFT, font: "oblique" }
  );

  doc.advance(bannerH + 12);

  // 2. Cartouche Salarié & Contrat
  doc.ensure(46);
  const metaY = doc.cursorY;
  const metaH = 40;
  drawBox(doc, M_X, metaY, CONTENT_W, metaH, CREAM, LINE, 0.6);

  // Col 1 : Identité
  let yM = metaY + 11;
  doc.text("SALARIÉ(E)", M_X + 10, yM, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  doc.text(employee.name, M_X + 10, yM + 11, { font: "bold", size: 9.5, color: INK });
  doc.text(`Matricule : ${employee.cnpsNumber ?? "EN ATTENTE"}`, M_X + 10, yM + 22, { size: 7.5, color: SOFT });

  // Col 2 : Poste & Ancienneté
  const col2X = M_X + 180;
  doc.text("FONCTION / POSTE", col2X, yM, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  doc.text(formatRole(employee.role), col2X, yM + 11, { font: "bold", size: 9, color: INK });
  doc.text(`Contrat : ${(employee as { contractType?: string | null }).contractType ?? "CDI"}`, col2X, yM + 22, { size: 7.5, color: SOFT });

  // Col 3 : Salaire de base contractuel
  const col3X = M_RIGHT - 130;
  doc.text("SALAIRE CONTRACTUEL", col3X, yM, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  doc.text(fmtXOF(slip.grossSalary), col3X, yM + 11, { font: "bold", size: 9, color: GOLD_DARK });
  doc.text(`Date d'édition : ${new Date().toLocaleDateString("fr-FR")}`, col3X, yM + 22, { size: 7.2, color: SOFT });

  doc.advance(metaH + 12);

  // 3. Tableau détaillé des rubriques de paie
  const lines = details.lines ?? [];
  const colW = {
    libelle: 215,
    base: 65,
    taux: 45,
    gains: 65,
    retenues: 65,
    patronale: 52,
  };

  // En-tête du tableau
  doc.ensure(22);
  const thY = doc.cursorY;
  drawBox(doc, M_X, thY, CONTENT_W, 18, CARD, LINE, 0.7);

  let curX = M_X + 6;
  doc.text("RUBRIQUES / DÉSIGNATION", curX, thY + 12, { font: "bold", size: 7.2, color: INK });
  curX += colW.libelle;
  doc.textRight("BASE", curX + colW.base - 4, thY + 12, { font: "bold", size: 7.2, color: INK });
  curX += colW.base;
  doc.textRight("TAUX", curX + colW.taux - 4, thY + 12, { font: "bold", size: 7.2, color: INK });
  curX += colW.taux;
  doc.textRight("GAINS", curX + colW.gains - 4, thY + 12, { font: "bold", size: 7.2, color: INK });
  curX += colW.gains;
  doc.textRight("RETENUES", curX + colW.retenues - 4, thY + 12, { font: "bold", size: 7.2, color: INK });
  curX += colW.retenues;
  doc.textRight("CHARGES PAT.", M_RIGHT - 6, thY + 12, { font: "bold", size: 7.2, color: INK });

  doc.advance(18);

  // Lignes de rubriques
  let alt = false;
  for (const l of lines) {
    doc.ensure(16);
    const rowY = doc.cursorY;
    const isTotal = l.libelle === "Total retenues" || l.libelle.startsWith("TOTAL");
    const isNet = l.libelle === "NET À PAYER" || l.libelle.startsWith("NET");

    const bg = isNet ? GOLD_BAND : isTotal ? CARD : alt ? CREAM : undefined;
    drawBox(doc, M_X, rowY, CONTENT_W, 16, bg, LINE_LIGHT, 0.4);

    const fSize = isNet ? 8.2 : 7.2;
    const fFont = isNet || isTotal ? "bold" : "regular";
    const fColor = isNet ? GOLD_DARK : INK;

    let x = M_X + 6;
    doc.text(l.libelle, x, rowY + 11, { font: fFont, size: fSize, color: fColor, maxW: colW.libelle - 8 });
    x += colW.libelle;
    doc.textRight(fmtNumber(l.base), x + colW.base - 4, rowY + 11, { font: fFont, size: fSize, color: fColor });
    x += colW.base;
    doc.textRight(l.taux ? String(l.taux) : "", x + colW.taux - 4, rowY + 11, { font: fFont, size: fSize, color: fColor });
    x += colW.taux;
    doc.textRight(fmtNumber(l.gain), x + colW.gains - 4, rowY + 11, { font: fFont, size: fSize, color: fColor });
    x += colW.gains;
    doc.textRight(fmtNumber(l.retenue), x + colW.retenues - 4, rowY + 11, { font: fFont, size: fSize, color: fColor });
    x += colW.retenues;
    doc.textRight(fmtNumber(l.employeur), M_RIGHT - 6, rowY + 11, { font: "regular", size: 7, color: SOFT });

    doc.advance(16);
    alt = !alt;
  }

  // Si aucune ligne n'a été pré-calculée, afficher au moins la structure de base
  if (lines.length === 0) {
    doc.ensure(18);
    doc.text("Salaire brut de base", M_X + 6, doc.cursorY + 12, { font: "bold", size: 7.5, color: INK });
    doc.textRight(fmtNumber(slip.grossSalary), M_X + colW.libelle + colW.base + colW.taux + colW.gains - 4, doc.cursorY + 12, {
      font: "bold",
      size: 7.5,
      color: INK,
    });
    doc.advance(18);
  }

  doc.advance(10);

  // 4. Cartouche des Totaux & NET À PAYER
  const totalRetenues =
    details.lines.find((l) => l.libelle === "Total retenues")?.retenue ??
    slip.cnpsEmployee + slip.incomeTax + slip.cn;
  const coutEmployeur = slip.grossSalary + slip.cnpsEmployer;

  doc.ensure(56);
  const sumY = doc.cursorY;
  const sumBoxW = 220;
  const sumX = M_RIGHT - sumBoxW;

  drawBox(doc, sumX, sumY, sumBoxW, 52, CARD, LINE, 0.7);

  // Ligne 1 : Brut
  doc.text("Salaire Brut Imposable :", sumX + 8, sumY + 12, { size: 7.5, color: SOFT });
  doc.textRight(fmtXOF(slip.grossSalary), M_RIGHT - 8, sumY + 12, { font: "bold", size: 7.8, color: INK });

  // Ligne 2 : Retenues
  doc.text("Total Retenues Salariales :", sumX + 8, sumY + 23, { size: 7.5, color: SOFT });
  doc.textRight(`- ${fmtXOF(totalRetenues)}`, M_RIGHT - 8, sumY + 23, { font: "bold", size: 7.8, color: [0.72, 0.18, 0.18] });

  // Ligne 3 : NET À PAYER (mis en valeur)
  drawBox(doc, sumX + 2, sumY + 29, sumBoxW - 4, 20, GOLD_BAND, GOLD, 0.9);
  doc.text("NET À PAYER :", sumX + 8, sumY + 43, { font: "bold", size: 9, color: BISSAP, letterSpace: 0.3 });
  doc.textRight(fmtXOF(slip.netSalary), M_RIGHT - 8, sumY + 43, { font: "bold", size: 10.5, color: GOLD_DARK });

  // Coût global entreprise (à gauche des totaux)
  const leftBoxW = sumX - M_X - 12;
  drawBox(doc, M_X, sumY, leftBoxW, 52, CREAM, LINE, 0.5);
  doc.text("RÉCAPITULATIF CHARGES EMPLOYEUR", M_X + 8, sumY + 13, { font: "bold", size: 7, color: GOLD_DARK, letterSpace: 0.3 });
  doc.text(`Cotisations patronales : ${fmtXOF(slip.cnpsEmployer)}`, M_X + 8, sumY + 26, { size: 7.5, color: INK });
  doc.text(`Coût total pour l'institut : ${fmtXOF(coutEmployeur)}`, M_X + 8, sumY + 39, { font: "bold", size: 8, color: INK });

  doc.advance(62);

  // 5. Cadres de validation bilatérale (Signatures & Cachet)
  doc.ensure(64);
  const signY = doc.cursorY;
  const signBoxW = (CONTENT_W - 14) / 2;

  // Cadre Salarié(e)
  drawBox(doc, M_X, signY, signBoxW, 58, CARD, LINE, 0.6);
  doc.text("POUR LE SALARIÉ", M_X + 8, signY + 12, { font: "bold", size: 7.2, color: SOFT, letterSpace: 0.3 });
  doc.text("(Mention manuscrite « Lu et approuvé » + signature)", M_X + 8, signY + 22, { size: 6.5, color: SOFT, font: "oblique" });
  doc.hline(M_X + 8, M_X + signBoxW - 8, signY + 50, LINE_LIGHT, 0.5);

  // Cadre Institut / Direction
  const rightSignX = M_X + signBoxW + 14;
  drawBox(doc, rightSignX, signY, signBoxW, 58, CARD, LINE, 0.6);
  doc.text("POUR L'INSTITUT — LA DIRECTION", rightSignX + 8, signY + 12, { font: "bold", size: 7.2, color: SOFT, letterSpace: 0.3 });
  doc.text("Cachet officiel & Signature autorisée", rightSignX + 8, signY + 22, { size: 6.5, color: SOFT, font: "oblique" });
  doc.hline(rightSignX + 8, rightSignX + signBoxW - 8, signY + 50, LINE_LIGHT, 0.5);

  doc.advance(68);

  // Mentions légales obligatoires
  doc.ensure(20);
  const legY = doc.cursorY;
  doc.text(
    "Dans votre intérêt et pour vous aider à faire valoir vos droits, conservez ce bulletin de paie sans limitation de durée.",
    M_X,
    legY + 8,
    { size: 6.8, color: SOFT, font: "oblique" }
  );
  doc.text(
    "Document édité par Kènè Pro · Conforme législation du travail & SYSCOHADA.",
    M_X,
    legY + 17,
    { size: 6.5, color: SOFT }
  );

  return doc.finish();
}
