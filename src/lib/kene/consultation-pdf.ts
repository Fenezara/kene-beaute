// Kènè — Documents de consultation & comptes-rendus.
// Lib PURE serveur, construite sur le moteur PDF maison (src/lib/accounting/pdf.ts):
// 1. FICHE DE CONSULTATION — support papier d'excellence pour l'entretien en institut:
//    - Identité & coordonnées complètes de la cliente (grille 2 colonnes structurée)
//    - Cadre légal de consentement éclairé & décharge (loi n°2013-450 / RGPD, imagerie & données)
//    - Profil dermatologique de base & antécédents (types de peau, Fitzpatrick, allergies, cosmétiques)
//    - Questionnaire clinique guidé (4 domaines, 21 questions alignées avec cases à cocher nettes)
//    - Grille d'examen visuel & observations cabine (6 critères cliniques + espace ligné)
//    - Protocole de soin & recommandation botanique (soin cabine, routines matin/soir, contrôle)
//    - Cadre de validation & signatures bilatérales (Cliente et Institut / Praticienne)
// 2. COMPTE-RENDU CABINE — résultat complet d'un diagnostic réalisé en institut
// 3. COMPTE-RENDU SELF-SCAN — résultat d'un diagnostic IA réalisé par la cliente sur l'app
import {
  PdfDoc,
  textWidth,
  wrapText,
  INK,
  SOFT,
  GOLD,
  GOLD_DARK,
  GOLD_BAND,
  CREAM,
  CARD,
  LINE,
  GREEN,
  RED,
  M_X,
  M_RIGHT,
  CONTENT_W,
  type RGB,
  type Font,
} from "@/lib/accounting/pdf";
import {
  QUESTIONNAIRE_SECTIONS,
  QUESTIONS,
  type QAnswers,
  type Question,
  type ProDiagnosisResult,
} from "@/lib/kene/questionnaire";
import { BODY_ZONES, type BodyZone, type DiagnosisResult } from "@/lib/kene/types";
import type { SpectralAcneResult } from "@/lib/kene/spectral-imaging";

export { PdfDoc };

// ─────────────── Utilitaires & Formatage ───────────────

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const n = new Date(d);
  if (Number.isNaN(n.getTime())) return "—";
  return n.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
};

const stamp = (d = new Date()): string =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const slug = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "cliente";

export interface ConsultPdfResult {
  data: Uint8Array;
  pages: number;
}

const LINE_LIGHT: RGB = [0.89, 0.86, 0.81];

// ─────────────── Primitives Graphiques Soignées ───────────────

/** Encadré structuré avec fond et bordure optionnels */
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

/** Ligne d'écriture manuelle (pointillée ou fine pour stylo) */
function writeLine(doc: PdfDoc, y: number, x1 = M_X, x2 = M_RIGHT, lw = 0.6): void {
  doc.hline(x1, x2, y, LINE, lw);
}

/** Case à cocher vectorielle d'une précision millimétrique */
function checkbox(
  doc: PdfDoc,
  x: number,
  yTop: number,
  size = 8,
  checked = false,
  color: RGB = INK
): void {
  doc.rectStroke(x, yTop, size, size, checked ? GOLD_DARK : LINE, 0.8);
  if (checked) {
    // Segment descendant puis remontée nette de coche ✓
    doc.line(x + 1.6, yTop + size * 0.52, x + size * 0.40, yTop + size * 0.80, GOLD_DARK, 1.2);
    doc.line(x + size * 0.40, yTop + size * 0.80, x + size * 0.86, yTop + size * 0.16, GOLD_DARK, 1.2);
  }
}

/** Case à cocher alignée avec la ligne de base du texte */
function checkboxItem(
  doc: PdfDoc,
  x: number,
  baselineY: number,
  label: string,
  checked = false,
  opts: {
    font?: Font;
    size?: number;
    color?: RGB;
    boxSize?: number;
    maxW?: number;
  } = {}
): number {
  const boxSize = opts.boxSize ?? 8;
  const fSize = opts.size ?? 8;
  const font = opts.font ?? (checked ? "bold" : "regular");
  const color = opts.color ?? (checked ? GOLD_DARK : INK);

  // Calage vertical parfait : le haut de la boîte à baselineY - 6.5
  const yTop = baselineY - 6.5;
  checkbox(doc, x, yTop, boxSize, checked, color);
  doc.text(label, x + boxSize + 4.5, baselineY, { font, size: fSize, color, maxW: opts.maxW });

  return boxSize + 4.5 + textWidth(label, fSize, font);
}

/** En-tête officiel de prestige Kènè Pro (net, contrasté, économe en toner) */
function headerBanner(
  doc: PdfDoc,
  mainTitle: string,
  subtitle: string,
  tenantInfo: { name: string; city?: string | null; phone?: string | null; date?: Date }
): void {
  doc.ensure(52);
  const topY = doc.cursorY;
  const bannerH = 46;

  // Fond doux et liseré double
  doc.rect(M_X, topY, CONTENT_W, bannerH, CREAM);
  doc.rectStroke(M_X, topY, CONTENT_W, bannerH, LINE, 0.7);
  // Bandeau supérieur accent or Kènè
  doc.rect(M_X, topY, CONTENT_W, 2.5, GOLD);

  // Colonne Gauche : Marque + Titre du document
  doc.text("KÈNÈ PRO", M_X + 12, topY + 15, {
    font: "bold",
    size: 11,
    color: GOLD_DARK,
    letterSpace: 1.6,
  });
  doc.text(mainTitle, M_X + 12, topY + 27, {
    font: "bold",
    size: 9.5,
    color: INK,
    letterSpace: 0.3,
  });
  doc.text(subtitle, M_X + 12, topY + 38, {
    size: 7.2,
    color: SOFT,
    font: "oblique",
  });

  // Colonne Droite : Coordonnées de l'institut & Référence
  const cityStr = tenantInfo.city ? ` · ${tenantInfo.city}` : "";
  const phoneStr = tenantInfo.phone ? `Tél. ${tenantInfo.phone}` : "";
  const dateStr = `Date : ${fmtDate(tenantInfo.date ?? new Date())}`;

  doc.textRight(tenantInfo.name + cityStr, M_RIGHT - 12, topY + 15, {
    font: "bold",
    size: 8.5,
    color: INK,
    maxW: 240,
  });
  if (phoneStr) {
    doc.textRight(phoneStr, M_RIGHT - 12, topY + 26, {
      size: 7.8,
      color: SOFT,
      maxW: 200,
    });
  }
  doc.textRight(dateStr, M_RIGHT - 12, topY + 37, {
    font: "bold",
    size: 7.8,
    color: GOLD_DARK,
    maxW: 200,
  });

  doc.advance(bannerH + 10);
}

/** Bandeau de titre de section avec pastille numérotée et liseré */
function sectionBand(doc: PdfDoc, num: string, title: string, subtitle?: string): void {
  doc.ensure(subtitle ? 30 : 24);
  const curY = doc.cursorY;

  // Pastille numérotée dorée
  const badgeW = 20;
  const badgeH = 13;
  doc.rect(M_X, curY, badgeW, badgeH, GOLD_BAND);
  doc.rectStroke(M_X, curY, badgeW, badgeH, GOLD, 0.5);
  doc.text(num, M_X + badgeW / 2 - textWidth(num, 7.5, "bold") / 2, curY + 9.5, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
  });

  // Titre principal
  doc.text(title, M_X + badgeW + 8, curY + 9.5, {
    font: "bold",
    size: 9.5,
    color: INK,
    letterSpace: 0.4,
  });

  // Liseré horizontal d'accompagnement
  const titleW = textWidth(title, 9.5, "bold");
  const lineStart = M_X + badgeW + 12 + titleW;
  if (lineStart < M_RIGHT - 20) {
    doc.hline(lineStart, M_RIGHT, curY + 6.5, LINE, 0.5);
  }

  // Sous-titre optionnel
  if (subtitle) {
    doc.text(subtitle, M_X + badgeW + 8, curY + 20, {
      size: 7.2,
      color: SOFT,
      font: "oblique",
      maxW: CONTENT_W - badgeW - 10,
    });
    doc.advance(26);
  } else {
    doc.advance(19);
  }
}

const SEV_LABELS = ["Aucun", "Léger", "Modéré", "Sévère"];
const sevLabel = (s: number): string => SEV_LABELS[Math.max(0, Math.min(3, Math.round(s)))];
const sevColor = (pct: number): RGB => (pct >= 75 ? GREEN : pct >= 50 ? GOLD_DARK : RED);
const pctLabel = (pct: number): string => `${Math.round(pct)} %`;

// ─────────────── 1. Fiche de consultation (support papier) ───────────────

export interface ConsultationClientPrefill {
  name: string;
  phone: string;
  skinType?: string | null;
  fitzpatrick?: string | null;
  notes?: string | null;
  cosmeticsUsed?: string | null;
  productObservations?: string | null;
  /** Derniers self-scans Kènè (si compte lié): { zone, score, date } */
  scans?: { zone: string; score: number; date: string }[];
  appAccount?: boolean;
  /** La cliente a-t-elle partagé ses self-scans avec cet institut ? */
  scansShared?: boolean;
}

export function consultationSheetPdf(input: {
  tenantName: string;
  tenantCity: string;
  tenantPhone?: string | null;
  practitioner?: string | null;
  client?: ConsultationClientPrefill | null;
  date?: Date;
}): ConsultPdfResult {
  const doc = new PdfDoc(`Kènè Pro — Fiche de consultation · ${input.tenantName}`);
  doc.setFooter(
    `Kènè Pro — Fiche de consultation & diagnostic de peau · dossier cabine · ${fmtDate(input.date ?? new Date())}`
  );

  // En-tête officiel
  headerBanner(
    doc,
    "FICHE CLINIQUE DE CONSULTATION & DIAGNOSTIC DE PEAU",
    "Dossier confidentiel de suivi cabine — à renseigner lors de l'entretien et de l'examen",
    {
      name: input.tenantName,
      city: input.tenantCity,
      phone: input.tenantPhone,
      date: input.date ?? new Date(),
    }
  );

  const c = input.client ?? null;

  // ── 1. IDENTITÉ & FICHE CLIENTE ──
  sectionBand(doc, "1", "IDENTITÉ & COORDONNÉES DE LA CLIENTE");
  doc.ensure(64);
  const idBoxY = doc.cursorY;
  const idBoxH = 58;

  // Cadre global bicolore
  drawBox(doc, M_X, idBoxY, CONTENT_W, idBoxH, CARD, LINE, 0.7);

  // Séparateur vertical central
  const colMid = M_X + 265;
  doc.line(colMid, idBoxY, colMid, idBoxY + idBoxH, LINE_LIGHT, 0.7);

  // Colonne Gauche : Identité
  let yL = idBoxY + 12;
  doc.text("NOM & PRÉNOM", M_X + 10, yL, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  if (c?.name) {
    doc.text(c.name, M_X + 10, yL + 11, { font: "bold", size: 9.5, color: INK, maxW: 240 });
  } else {
    writeLine(doc, yL + 11, M_X + 10, colMid - 10);
  }

  yL += 22;
  doc.text("TÉLÉPHONE / WHATSAPP", M_X + 10, yL, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  if (c?.phone) {
    doc.text(c.phone, M_X + 10, yL + 10, { font: "bold", size: 9, color: INK, maxW: 240 });
  } else {
    writeLine(doc, yL + 10, M_X + 10, colMid - 10);
  }

  // Colonne Droite : Suivi & Cabine
  let yR = idBoxY + 12;
  doc.text("PRATICIENNE EN CHARGE", colMid + 10, yR, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  if (input.practitioner) {
    doc.text(input.practitioner, colMid + 10, yR + 11, { font: "bold", size: 9, color: INK, maxW: 220 });
  } else {
    writeLine(doc, yR + 11, colMid + 10, M_RIGHT - 10);
  }

  yR += 22;
  doc.text("STATUT DU DOSSIER", colMid + 10, yR, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  const statusText = c?.appAccount
    ? c.scansShared
      ? "Compte Kènè App (Historique partagé)"
      : "Compte Kènè App (Non partagé)"
    : "Dossier Papier Cabine";
  doc.text(statusText, colMid + 10, yR + 10, { font: "bold", size: 8.5, color: c?.appAccount ? GREEN : GOLD_DARK });

  doc.advance(idBoxH + 10);

  // ── 2. CADRE RÉGLEMENTAIRE & CONSENTEMENTS ÉCLAIRÉS ──
  sectionBand(
    doc,
    "2",
    "CADRE RÉGLEMENTAIRE & CONSENTEMENTS ÉCLAIRÉS",
    "Conformité données de santé & photos (Loi n°2013-450 / RGPD) — explications orales préalables"
  );
  doc.ensure(84);
  const csBoxY = doc.cursorY;
  const csBoxH = 76;

  // Cartouche de sécurité avec fond crème et bordure or
  drawBox(doc, M_X, csBoxY, CONTENT_W, csBoxH, CREAM, LINE, 0.7);
  doc.rect(M_X, csBoxY, 3, csBoxH, GOLD); // filet gauche or

  let yCs = csBoxY + 11;
  doc.text(
    "Les consentements suivants sont expliqués à la cliente avant toute prise de vue ou acte de soin :",
    M_X + 12,
    yCs,
    { size: 7.2, color: SOFT, font: "oblique" }
  );

  yCs += 15;
  checkbox(doc, M_X + 12, yCs - 6.5, 8, false);
  doc.text("PRISE DE CLICHÉS & IMAGERIE CABINE :", M_X + 25, yCs, { font: "bold", size: 7.8, color: GOLD_DARK });
  doc.text(
    "J'autorise la prise de photographies cutanées pour mon suivi exclusif au sein de l'institut (aucune diffusion publique).",
    M_X + 25,
    yCs + 9,
    { size: 7.2, color: INK, maxW: CONTENT_W - 35 }
  );

  yCs += 20;
  checkbox(doc, M_X + 12, yCs - 6.5, 8, false);
  doc.text("TRAITEMENT & CONSERVATION DES DONNÉES :", M_X + 25, yCs, { font: "bold", size: 7.8, color: GOLD_DARK });
  doc.text(
    "J'accepte la conservation de mes données cutanées (scores, routines, historique) pour la personnalisation de mes soins.",
    M_X + 25,
    yCs + 9,
    { size: 7.2, color: INK, maxW: CONTENT_W - 35 }
  );

  // Ligne de signature consentements
  yCs += 19;
  doc.hline(M_X + 12, M_RIGHT - 12, yCs - 4, LINE_LIGHT, 0.5);
  doc.text("Fait le : ...............................   Lieu : ...............................", M_X + 12, yCs + 6, {
    size: 7.2,
    color: SOFT,
  });
  doc.text(
    "Signature ou empreinte digitale de la cliente (précédée de « Lu et approuvé ») :",
    M_X + 225,
    yCs + 6,
    { size: 7.2, color: SOFT }
  );
  doc.rectStroke(M_RIGHT - 120, yCs - 2, 110, 14, LINE, 0.6);

  doc.advance(csBoxH + 11);

  // ── 3. PROFIL DERMATOLOGIQUE DE BASE & ANTÉCÉDENTS ──
  sectionBand(doc, "3", "PROFIL DERMATOLOGIQUE & ANTÉCÉDENTS");
  doc.ensure(115);
  const profBoxY = doc.cursorY;
  const profBoxH = 110;

  drawBox(doc, M_X, profBoxY, CONTENT_W, profBoxH, CARD, LINE, 0.7);

  let yP = profBoxY + 12;

  // Ligne 1 : Type de peau
  doc.text("TYPE DE PEAU OBSERVÉ / DÉCLARÉ :", M_X + 10, yP, { font: "bold", size: 7.2, color: GOLD_DARK });
  const rawSkin = (c?.skinType ?? "").toLowerCase();
  const skinTypes = [
    { id: "normale", label: "Normale", match: rawSkin.includes("norm") },
    { id: "seche", label: "Sèche", match: rawSkin.includes("sech") || rawSkin.includes("sèch") },
    { id: "mixte", label: "Mixte (Zone T)", match: rawSkin.includes("mixt") },
    { id: "grasse", label: "Grasse", match: rawSkin.includes("grass") },
    { id: "sensible", label: "Sensible", match: rawSkin.includes("sens") },
    { id: "deshydratee", label: "Déshydratée", match: rawSkin.includes("deshydr") || rawSkin.includes("déshydr") },
  ];

  let xP = M_X + 10;
  yP += 12;
  for (const st of skinTypes) {
    checkboxItem(doc, xP, yP, st.label, st.match, { size: 7.5 });
    xP += 82;
  }

  // Ligne 2 : Phototype Fitzpatrick
  yP += 16;
  doc.text("PHOTOTYPE DE FITZPATRICK :", M_X + 10, yP, { font: "bold", size: 7.2, color: GOLD_DARK });
  const rawFitz = (c?.fitzpatrick ?? "").toUpperCase();
  const fitzTypes = [
    { label: "Type I", match: rawFitz.includes("I") && !rawFitz.includes("II") && !rawFitz.includes("IV") && !rawFitz.includes("V") && !rawFitz.includes("VI") },
    { label: "Type II", match: rawFitz.includes("II") && !rawFitz.includes("III") },
    { label: "Type III", match: rawFitz.includes("III") },
    { label: "Type IV", match: rawFitz.includes("IV") },
    { label: "Type V", match: rawFitz.includes("V") && !rawFitz.includes("VI") },
    { label: "Type VI", match: rawFitz.includes("VI") },
  ];

  xP = M_X + 10;
  yP += 12;
  for (const ft of fitzTypes) {
    checkboxItem(doc, xP, yP, ft.label, ft.match, { size: 7.5 });
    xP += 82;
  }

  // Ligne 3 : Allergies & Vigilances médicales
  yP += 16;
  doc.text("ALLERGIES CONNUES & CONTRE-INDICATIONS :", M_X + 10, yP, { font: "bold", size: 7.2, color: RED });
  if (c?.notes) {
    doc.text(c.notes, M_X + 10, yP + 10, { font: "bold", size: 8, color: INK, maxW: CONTENT_W - 20 });
  } else {
    writeLine(doc, yP + 10, M_X + 10, M_RIGHT - 10);
  }

  // Ligne 4 : Cosmétiques & Traitements actuels
  yP += 20;
  doc.text("COSMÉTIQUES & TRAITEMENTS EN COURS (SAVONS, ACIDES, RÉTINOÏDES, SOLAIRE) :", M_X + 10, yP, {
    font: "bold",
    size: 7.2,
    color: GOLD_DARK,
  });
  if (c?.cosmeticsUsed) {
    doc.text(c.cosmeticsUsed, M_X + 10, yP + 10, { size: 8, color: INK, maxW: CONTENT_W - 20 });
  } else {
    writeLine(doc, yP + 10, M_X + 10, M_RIGHT - 10);
  }

  doc.advance(profBoxH + 11);

  // Self-scans si disponibles
  if (c?.scans && c.scans.length > 0) {
    doc.ensure(24 + c.scans.length * 14);
    doc.text("HISTORIQUE DES SCANS KÈNÈ DE LA CLIENTE :", M_X, doc.cursorY + 2, {
      font: "bold",
      size: 7.8,
      color: GOLD_DARK,
    });
    doc.advance(11);
    for (const s of c.scans) {
      const zoneLabel = BODY_ZONES.find((z) => z.id === s.zone)?.label ?? s.zone;
      doc.text(`• ${zoneLabel} — Score santé : ${s.score}/100 — réalisé le ${fmtDate(s.date)}`, M_X + 8, doc.cursorY + 2, {
        size: 7.8,
        color: SOFT,
      });
      doc.advance(12);
    }
    doc.advance(5);
  }

  // ── 4. QUESTIONNAIRE DERMATOLOGIQUE CABINE ──
  sectionBand(
    doc,
    "4",
    "QUESTIONNAIRE CLINIQUE CABINE (ENTRETIEN GUIDÉ)",
    "Renseigné avec la cliente — les réponses alimentent le score d'équilibre et les recommandations"
  );

  let qSectionIndex = 1;
  for (const section of QUESTIONNAIRE_SECTIONS) {
    const qs = QUESTIONS.filter((q) => q.section === section.id);
    doc.ensure(26);
    // Petit bandeau de sous-section du questionnaire
    doc.rect(M_X, doc.cursorY, CONTENT_W, 15, CREAM);
    doc.text(
      `4.${qSectionIndex} · ${section.label.toUpperCase()} — ${section.description}`,
      M_X + 8,
      doc.cursorY + 10.5,
      { font: "bold", size: 7.5, color: GOLD_DARK, letterSpace: 0.3 }
    );
    doc.advance(19);

    for (const q of qs) {
      renderQuestionCard(doc, q);
    }
    doc.advance(4);
    qSectionIndex++;
  }

  // ── 5. EXAMEN VISUEL & DIAGNOSTIC CLINIQUE EN CABINE ──
  sectionBand(
    doc,
    "5",
    "EXAMEN CLINIQUE & OBSERVATIONS PRATICIENNE",
    "Constats visuels sous lampe loupe / lumière de Wood avant protocole"
  );
  doc.ensure(118);
  const obsBoxY = doc.cursorY;
  const obsBoxH = 112;

  drawBox(doc, M_X, obsBoxY, CONTENT_W, obsBoxH, CARD, LINE, 0.7);

  // Grille d'évaluation clinique en 6 critères
  let yObs = obsBoxY + 11;
  const criteria = [
    {
      title: "Éclat & Teint :",
      items: ["Lumineux", "Terne / Asphyxié", "Taches / HPI", "Irrégulier"],
    },
    {
      title: "Pores & Relief :",
      items: ["Resserrés", "Dilatés zone T", "Dilatés diffus", "Comédons / Microkystes"],
    },
    {
      title: "Sébum & Brillance :",
      items: ["Équilibré", "Brillance zone T", "Hyperséborrhée", "Alipidique (sec)"],
    },
    {
      title: "Hydratation & Barrière :",
      items: ["Souple", "Déshydratée (stries)", "Desquamation", "Tiraillements"],
    },
    {
      title: "Sensibilité :",
      items: ["Résistante", "Réactive au frottement", "Rougeurs / Érythème", "Échauffements"],
    },
    {
      title: "Fermeté :",
      items: ["Tonique", "Légère perte d'élasticité", "Ridules superficielles", "Relâchement"],
    },
  ];

  for (const crit of criteria) {
    doc.text(crit.title, M_X + 10, yObs, { font: "bold", size: 7.2, color: GOLD_DARK });
    let xCrit = M_X + 110;
    for (const item of crit.items) {
      checkboxItem(doc, xCrit, yObs, item, false, { size: 7.2 });
      xCrit += 98;
    }
    yObs += 12.5;
  }

  // Lignes d'observations manuscrites libres
  yObs += 3;
  doc.text("Observations cliniques complémentaires & Particularités anatomiques :", M_X + 10, yObs, {
    font: "bold",
    size: 7,
    color: SOFT,
  });
  yObs += 9;
  writeLine(doc, yObs, M_X + 10, M_RIGHT - 10);
  yObs += 10;
  writeLine(doc, yObs, M_X + 10, M_RIGHT - 10);

  doc.advance(obsBoxH + 11);

  // ── 6. PROTOCOLE CABINE & RECOMMANDATION BOTANIQUE ──
  sectionBand(
    doc,
    "6",
    "PROTOCOLE DE SOIN & RECOMMANDATION BOTANIQUE",
    "Protocole cabine personnalisé et routine quotidienne recommandée"
  );
  doc.ensure(96);
  const protBoxY = doc.cursorY;
  const protBoxH = 90;

  drawBox(doc, M_X, protBoxY, CONTENT_W, protBoxH, CREAM, LINE, 0.7);

  let yPr = protBoxY + 11;
  doc.text("SOIN EN CABINE PRÉCONISÉ :", M_X + 10, yPr, { font: "bold", size: 7.2, color: GOLD_DARK });
  writeLine(doc, yPr + 1, M_X + 145, M_RIGHT - 100);
  doc.text("DURÉE :", M_RIGHT - 90, yPr, { font: "bold", size: 7.2, color: SOFT });
  writeLine(doc, yPr + 1, M_RIGHT - 50, M_RIGHT - 10);

  yPr += 16;
  doc.text("ROUTINE DOMICILE DU MATIN :", M_X + 10, yPr, { font: "bold", size: 7.2, color: INK });
  writeLine(doc, yPr + 1, M_X + 145, M_RIGHT - 10);

  yPr += 14;
  doc.text("ROUTINE DOMICILE DU SOIR :", M_X + 10, yPr, { font: "bold", size: 7.2, color: INK });
  writeLine(doc, yPr + 1, M_X + 145, M_RIGHT - 10);

  yPr += 14;
  doc.text("ACTIFS & BOTANIQUES PHARES :", M_X + 10, yPr, { font: "bold", size: 7.2, color: GOLD_DARK });
  writeLine(doc, yPr + 1, M_X + 145, M_RIGHT - 10);

  yPr += 16;
  doc.text("PROCHAIN CONTRÔLE CONSEILLÉ :", M_X + 10, yPr, { font: "bold", size: 7.2, color: SOFT });
  checkboxItem(doc, M_X + 160, yPr, "15 jours", false, { size: 7.2 });
  checkboxItem(doc, M_X + 220, yPr, "1 mois", false, { size: 7.2 });
  checkboxItem(doc, M_X + 275, yPr, "2 mois", false, { size: 7.2 });
  checkboxItem(doc, M_X + 330, yPr, "Trimestriel", false, { size: 7.2 });
  doc.text("Date fixée :", M_X + 395, yPr, { size: 7.2, color: SOFT });
  writeLine(doc, yPr + 1, M_X + 440, M_RIGHT - 10);

  doc.advance(protBoxH + 11);

  // ── 7. VALIDATION & SIGNATURES ──
  sectionBand(doc, "7", "CADRE DE VALIDATION & SIGNATURES", "Engagement réciproque et traçabilité");
  doc.ensure(64);
  const signY = doc.cursorY;
  const signW = (CONTENT_W - 14) / 2;
  const signH = 58;

  // Cartouche Cliente
  drawBox(doc, M_X, signY, signW, signH, CARD, LINE, 0.7);
  doc.text("ACCORD & VISA CLIENTE", M_X + 10, signY + 11, { font: "bold", size: 7.8, color: GOLD_DARK });
  doc.text(
    "Je certifie l'exactitude des renseignements et valide le protocole proposé.",
    M_X + 10,
    signY + 21,
    { size: 6.8, color: SOFT, maxW: signW - 20 }
  );
  doc.text("Signature ou empreinte :", M_X + 10, signY + 34, { size: 7, color: SOFT });
  doc.rectStroke(M_X + 10, signY + 37, signW - 20, 16, LINE_LIGHT, 0.6);

  // Cartouche Praticienne / Institut
  const pX = M_X + signW + 14;
  drawBox(doc, pX, signY, signW, signH, CARD, LINE, 0.7);
  doc.text("VISA INSTITUT & PRATICIENNE", pX + 10, signY + 11, { font: "bold", size: 7.8, color: GOLD_DARK });
  const pLabel = input.practitioner ? `Praticienne : ${input.practitioner}` : "Praticienne en charge :";
  doc.text(pLabel, pX + 10, signY + 21, { size: 7, color: INK, maxW: signW - 20 });
  doc.text("Signature & cachet de l'institut :", pX + 10, signY + 34, { size: 7, color: SOFT });
  doc.rectStroke(pX + 10, signY + 37, signW - 20, 16, LINE_LIGHT, 0.6);

  doc.advance(signH + 10);

  return doc.finish();
}

/** Rendu propre d'une question d'entretien */
function renderQuestionCard(doc: PdfDoc, q: Question): void {
  const fullLabel = `${q.label}${q.help ? ` — ${q.help}` : ""}${q.required ? " *" : ""}`;

  doc.ensure(24);
  doc.text(fullLabel, M_X + 4, doc.cursorY + 2, { font: "bold", size: 8, color: INK, maxW: CONTENT_W - 8 });
  doc.advance(13);

  if (q.type === "text") {
    doc.ensure(14);
    writeLine(doc, doc.cursorY + 4, M_X + 10, M_RIGHT - 10);
    doc.advance(15);
    return;
  }

  // Options alignées en 2 colonnes ou 1 colonne selon la longueur
  const boxes = q.options.map((o) => o.label);
  const twoPerLine = boxes.every((b) => textWidth(b, 7.5) < (CONTENT_W - 40) / 2 - 20);
  const colW = (CONTENT_W - 20) / 2;

  let i = 0;
  while (i < boxes.length) {
    const row = twoPerLine ? boxes.slice(i, i + 2) : boxes.slice(i, i + 1);
    doc.ensure(13);
    let x = M_X + 10;
    for (const b of row) {
      checkboxItem(doc, x, doc.cursorY + 1, b, false, { size: 7.5, maxW: colW - 14 });
      x += colW + 10;
    }
    doc.advance(12.5);
    i += row.length;
  }
  doc.advance(3);
}

// ─────────────── 2. Compte-rendu du diagnostic en institut ───────────────

export function proDiagReportPdf(input: {
  tenantName: string;
  tenantCity: string;
  tenantPhone?: string | null;
  diagnosis: {
    zone: string;
    practitioner?: string | null;
    createdAt: Date | string;
    scoreGlobal: number;
    consentPhoto: boolean;
    consentData: boolean;
    consentTs?: Date | string | null;
    photoUsed: boolean;
    vlmUsed: boolean;
    questionnaireJson: string;
    resultJson: string;
    photoData?: string | null;
  };
  client: { name: string; phone: string };
  spectralImage?: SpectralAcneResult | null;
}): ConsultPdfResult {
  const result = safeParse<ProDiagnosisResult>(input.diagnosis.resultJson);
  const answers = safeParse<QAnswers>(input.diagnosis.questionnaireJson) ?? {};
  const zoneLabel = BODY_ZONES.find((z) => z.id === input.diagnosis.zone)?.label ?? input.diagnosis.zone;

  const doc = new PdfDoc(`Kènè Pro — Compte-rendu de diagnostic · ${input.tenantName}`);
  doc.setFooter(
    `Kènè Pro — Compte-rendu de diagnostic en institut · ${input.client.name} · ${fmtDate(input.diagnosis.createdAt)}`
  );

  headerBanner(
    doc,
    "COMPTE-RENDU OFFICIEL DE DIAGNOSTIC DE PEAU",
    "Bilan dermatologique complet réalisé en cabine d'institut",
    {
      name: input.tenantName,
      city: input.tenantCity,
      phone: input.tenantPhone,
      date: new Date(input.diagnosis.createdAt),
    }
  );

  // 1. Identité & Méthode
  doc.ensure(40);
  const metaY = doc.cursorY;
  const metaH = 34;
  drawBox(doc, M_X, metaY, CONTENT_W, metaH, CARD, LINE, 0.7);

  let yM = metaY + 12;
  doc.text("CLIENTE", M_X + 10, yM, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  doc.text(`${input.client.name} · ${input.client.phone}`, M_X + 10, yM + 11, {
    font: "bold",
    size: 9,
    color: INK,
    maxW: 240,
  });

  const col2X = M_X + 265;
  doc.text("ZONE ANALYSÉE", col2X, yM, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  doc.text(zoneLabel, col2X, yM + 11, { font: "bold", size: 9, color: GOLD_DARK });

  const col3X = M_RIGHT - 120;
  doc.text("MÉTHODE APPLIQUÉE", col3X, yM, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  const methodStr = input.diagnosis.vlmUsed ? "Entretien + IA Vision" : "Entretien cabine complet";
  doc.text(methodStr, col3X, yM + 11, { size: 8, color: INK });

  doc.advance(metaH + 11);

  // 2. Score Global
  if (result) {
    const score = result.score_global;
    doc.ensure(48);
    const scoreBoxY = doc.cursorY;
    const scoreBoxH = 42;

    drawBox(doc, M_X, scoreBoxY, CONTENT_W, scoreBoxH, GOLD_BAND, GOLD, 0.8);

    // Chiffre du score
    const sColor = sevColor(score);
    doc.text(`${score}`, M_X + 14, scoreBoxY + 30, { font: "bold", size: 26, color: sColor });
    doc.text("/ 100", M_X + 14 + textWidth(String(score), 26, "bold") + 3, scoreBoxY + 30, {
      size: 8.5,
      color: SOFT,
    });

    const labelColX = M_X + 85;
    doc.text("INDICE GLOBAL DE SANTÉ & ÉQUILIBRE CUTANÉ", labelColX, scoreBoxY + 16, {
      font: "bold",
      size: 9,
      color: GOLD_DARK,
      letterSpace: 0.3,
    });

    const statusMsg =
      score >= 80
        ? "Excellente vitalité cutanée — barrière saine et fonctions d'hydratation optimales"
        : score >= 60
        ? "Bon équilibre général — quelques axes d'optimisation identifiés"
        : score >= 40
        ? "Déséquilibre modéré — protocole de soin ciblé recommandé"
        : "Nécessité d'un soin intensif rééquilibrant et réparateur";

    doc.text(statusMsg, labelColX, scoreBoxY + 28, { size: 8, color: INK, maxW: CONTENT_W - 95 });

    doc.advance(scoreBoxH + 12);

    // 3. Analyse Multi-Spectrale en Cabine (Acné & Sébum)
    if (input.spectralImage) {
      const sp = input.spectralImage;
      const imgId = "proSpectralAcne";
      doc.addImage(imgId, sp.jpegBytes, sp.width, sp.height);

      sectionBand(
        doc,
        "A",
        "ANALYSE MULTI-SPECTRALE EN CABINE — SÉBUM & PORPHYRINES",
        sp.isRealPhoto
          ? "Révélation optique haute définition (Fluorescence UV 405nm)"
          : "Cartographie biométrique de référence (Fluorescence UV 405nm)"
      );

      const blockH = 152;
      doc.ensure(blockH + 10);
      const topY = doc.cursorY;

      drawBox(doc, M_X, topY, CONTENT_W, blockH, CARD, LINE, 0.7);

      // Cliché optique cabine
      const imgSize = 136;
      const imgX = M_X + 8;
      const imgY = topY + 8;
      doc.rect(imgX - 2, imgY - 2, imgSize + 4, imgSize + 4, [0.03, 0.05, 0.1]);
      doc.drawImage(imgId, imgX, imgY, imgSize, imgSize);
      doc.rectStroke(imgX, imgY, imgSize, imgSize, GOLD, 1);

      // Colonne d'analyse
      const colX = imgX + imgSize + 14;
      const colW = M_RIGHT - colX - 8;
      let textY = topY + 13;

      doc.text("DIAGNOSTIC CABINE : FILM LIPIDIQUE & FLORE CUTANÉE", colX, textY, {
        font: "bold",
        size: 8,
        color: GOLD_DARK,
        letterSpace: 0.3,
      });
      textY += 12;
      doc.text(
        "Cartographie des zones comédogènes, de l'émulsion sébacée superficielle et des sécrétions de Cutibacterium acnes.",
        colX,
        textY,
        { size: 7.5, color: SOFT, maxW: colW }
      );
      textY += 18;

      // Indicateur 1 : Film lipidique
      drawBox(doc, colX, textY - 2, colW, 20, CREAM, LINE_LIGHT, 0.5);
      doc.text("Film Hydrolipidique & Sébum", colX + 6, textY + 6, { font: "bold", size: 7.8, color: INK });
      doc.textRight(sp.lipidFilmStatus ?? "Activité sébacée modérée", M_RIGHT - 14, textY + 6, {
        font: "bold",
        size: 7.8,
        color: GOLD_DARK,
      });
      doc.text(
        "Brillance cutanée concentrée en zone T · Émulsion superficielle observée",
        colX + 6,
        textY + 14.5,
        { size: 6.8, color: SOFT, maxW: colW - 12 }
      );
      textY += 25;

      // Indicateur 2 : Porphyrines
      drawBox(doc, colX, textY - 2, colW, 20, CREAM, LINE_LIGHT, 0.5);
      doc.text("Porphyrines C. acnes", colX + 6, textY + 6, { font: "bold", size: 7.8, color: INK });
      const spotsCount = sp.porphyrinSpotsCount ?? 14;
      doc.textRight(`${spotsCount} foyers fluorescents`, M_RIGHT - 14, textY + 6, {
        font: "bold",
        size: 7.8,
        color: spotsCount > 10 ? RED : GREEN,
      });
      doc.text(
        "Sécrétions métaboliques fluorescentes orange · Points noirs et microkystes",
        colX + 6,
        textY + 14.5,
        { size: 6.8, color: SOFT, maxW: colW - 12 }
      );
      textY += 25;

      // Indicateur 3 : Protocole cabine immédiat
      drawBox(doc, colX, textY - 2, colW, 26, CARD, GOLD, 0.7);
      doc.text("PROTOCOLE CABINE IMMÉDIAT", colX + 6, textY + 6, { font: "bold", size: 7.2, color: GOLD_DARK });
      doc.text(
        "Désincrustation douce à la vapeur tiède, lotion sébo-régulatrice végétale, éviter tout décapage asséchant susceptible de déclencher une hyperséborrhée réactionnelle.",
        colX + 6,
        textY + 15,
        { size: 6.8, color: INK, maxW: colW - 12 }
      );

      doc.advance(blockH + 11);
    }

    // 4. Indicateurs Cliniques Détaillés
    sectionBand(doc, "B", "INDICATEURS CLINIQUES PAR DOMAINE");
    const rows = [...result.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage);
    for (const ind of rows) {
      doc.ensure(16);
      const color = sevColor(ind.pourcentage);
      doc.text(ind.nom, M_X + 4, doc.cursorY + 2, { font: "bold", size: 8, color: INK, maxW: 240 });
      doc.text(sevLabel(ind.severite), M_X + 260, doc.cursorY + 2, { size: 7.5, color: SOFT });

      // Barre de santé cutanée
      const bx = M_X + 320;
      const bw = 135;
      doc.rect(bx, doc.cursorY - 4, bw, 7, CREAM);
      doc.rect(bx, doc.cursorY - 4, (bw * Math.max(0, Math.min(100, ind.pourcentage))) / 100, 7, color);
      doc.rectStroke(bx, doc.cursorY - 4, bw, 7, LINE_LIGHT, 0.4);

      doc.textRight(pctLabel(ind.pourcentage), M_RIGHT - 4, doc.cursorY + 2, {
        font: "bold",
        size: 8,
        color,
      });
      doc.advance(13.5);
    }
    doc.advance(6);

    // 5. Points de Vigilance
    const flags = result.questionnaire?.flags ?? [];
    if (flags.length > 0) {
      sectionBand(doc, "C", "POINTS DE VIGILANCE & PRÉCAUTIONS PARTICULIÈRES");
      for (const f of flags) {
        const color = f.level === "danger" ? RED : f.level === "warn" ? GOLD_DARK : SOFT;
        doc.ensure(15);
        doc.text("•", M_X + 4, doc.cursorY + 2, { font: "bold", size: 9, color });
        doc.text(f.label, M_X + 14, doc.cursorY + 2, { font: "bold", size: 8, color, maxW: CONTENT_W - 16 });
        doc.advance(11.5);
        if (f.detail) {
          doc.ensure(12);
          doc.text(f.detail, M_X + 14, doc.cursorY + 2, { size: 7.5, color: SOFT, maxW: CONTENT_W - 16 });
          doc.advance(11);
        }
      }
      doc.advance(6);
    }

    // 6. Protocole & Recommandations
    sectionBand(doc, "D", "PROTOCOLE & RECOMMANDATIONS PERSONNALISÉES");
    const reco = result.recommandations;
    if (reco.resume) {
      doc.ensure(15);
      doc.text(reco.resume, M_X + 4, doc.cursorY + 2, { size: 8, color: INK, font: "oblique", maxW: CONTENT_W - 8 });
      doc.advance(13);
    }

    const recoBlocks: [string, string[]][] = [
      ["Routine du matin", reco.routine_matin],
      ["Routine du soir", reco.routine_soir],
      ["Botaniques conseillées", reco.botaniques_conseillees],
      ["Soins en institut", reco.soins_conseilles],
      ["Conseils d'hygiène de vie", reco.conseils_hygiene_vie],
    ];

    for (const [title, items] of recoBlocks) {
      if (!items?.length) continue;
      doc.ensure(15);
      doc.text(title, M_X + 4, doc.cursorY + 2, { font: "bold", size: 8, color: GOLD_DARK });
      doc.advance(11);
      doc.ensure(12);
      doc.text(items.join(" · "), M_X + 14, doc.cursorY + 2, { size: 8, color: INK, maxW: CONTENT_W - 18 });
      doc.advance(12);
    }
    doc.advance(6);

    // Orientation dermatologique si lésion
    if (result.orientation_dermato) {
      doc.ensure(28);
      drawBox(doc, M_X, doc.cursorY, CONTENT_W, 24, CREAM, RED, 0.9);
      doc.text("AVIS DERMATOLOGIQUE MÉDICAL RECOMMANDÉ", M_X + 8, doc.cursorY + 8, {
        font: "bold",
        size: 8.5,
        color: RED,
      });
      if (result.raison_orientation) {
        doc.text(result.raison_orientation, M_X + 8, doc.cursorY + 18, {
          size: 7.5,
          color: INK,
          maxW: CONTENT_W - 16,
        });
      }
      doc.advance(30);
    }
  }

  // 7. Traçabilité des réponses de l'entretien
  sectionBand(doc, "E", "SYNTHÈSE DE L'ENTRETIEN CABINE (TRACE DU DOSSIER)");
  for (const q of QUESTIONS) {
    const a = answers[q.id];
    if (a === undefined || a === null || a === "") continue;
    const labels = Array.isArray(a)
      ? a.map((v) => q.options.find((o) => o.value === v)?.label ?? v).join(", ")
      : q.options.find((o) => o.value === a)?.label ?? String(a);

    doc.ensure(14);
    doc.text(q.label, M_X + 4, doc.cursorY + 2, { size: 7.5, color: SOFT, maxW: 190 });
    doc.text(labels, M_X + 200, doc.cursorY + 2, { size: 8, color: INK, maxW: M_RIGHT - M_X - 205 });
    doc.advance(12);
  }
  doc.advance(6);

  // 8. Signatures & Décharge
  sectionBand(doc, "F", "CONSENTEMENTS RECUEILLIS & CLÔTURE DU DOSSIER");
  doc.ensure(56);
  const cs = input.diagnosis;

  checkboxItem(doc, M_X + 4, doc.cursorY + 2, "Consentement photographique recueilli au dossier", cs.consentPhoto, {
    size: 7.8,
  });
  doc.advance(12);
  checkboxItem(doc, M_X + 4, doc.cursorY + 2, "Consentement aux données dermatologiques recueilli", cs.consentData, {
    size: 7.8,
  });
  doc.textRight(`Recueillis le ${fmtDate(cs.consentTs ?? cs.createdAt)}`, M_RIGHT - 4, doc.cursorY + 2, {
    size: 7.5,
    color: SOFT,
  });
  doc.advance(18);

  const signW = (CONTENT_W - 14) / 2;
  const signH = 46;
  const sTop = doc.cursorY;

  drawBox(doc, M_X, sTop, signW, signH, CARD, LINE, 0.7);
  doc.text("Visa de la praticienne", M_X + 8, sTop + 9, { font: "bold", size: 7.5, color: GOLD_DARK });
  doc.rectStroke(M_X + 8, sTop + 14, signW - 16, 26, LINE_LIGHT, 0.5);

  const sRightX = M_X + signW + 14;
  drawBox(doc, sRightX, sTop, signW, signH, CARD, LINE, 0.7);
  doc.text("Visa ou empreinte de la cliente", sRightX + 8, sTop + 9, { font: "bold", size: 7.5, color: GOLD_DARK });
  doc.rectStroke(sRightX + 8, sTop + 14, signW - 16, 26, LINE_LIGHT, 0.5);

  doc.advance(signH + 8);

  return doc.finish();
}

// ─────────────── 3. Compte-rendu du self-scan cliente ───────────────

export function clientDiagReportPdf(input: {
  userName: string;
  diagnosis: {
    id: string;
    zone: string;
    createdAt: Date | string;
    resultJson: string;
    imageData?: string | null;
  };
  spectralImage?: SpectralAcneResult | null;
}): ConsultPdfResult {
  const result = safeParse<DiagnosisResult>(input.diagnosis.resultJson);
  const zoneLabel = BODY_ZONES.find((z) => z.id === input.diagnosis.zone)?.label ?? input.diagnosis.zone;

  const doc = new PdfDoc("Kènè — Mon diagnostic de peau");
  doc.setFooter(
    `Kènè — Bilan de santé de peau · ${input.userName} · ${fmtDate(input.diagnosis.createdAt)} · estimation non médicale`
  );

  headerBanner(
    doc,
    "MON DIAGNOSTIC DE PEAU & BILAN BOTANIQUE",
    `Zone analysée : ${zoneLabel} · Diagnostic ${result?.source === "vlm" ? "IA Vision" : "indicatif"}`,
    {
      name: "Kènè Cosmétique",
      city: "Abidjan",
      date: new Date(input.diagnosis.createdAt),
    }
  );

  // Carte d'identité cliente
  doc.ensure(34);
  const userBoxY = doc.cursorY;
  drawBox(doc, M_X, userBoxY, CONTENT_W, 28, CARD, LINE, 0.7);
  doc.text("CLIENTE", M_X + 10, userBoxY + 11, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  doc.text(input.userName, M_X + 10, userBoxY + 21, { font: "bold", size: 9.5, color: INK });

  doc.text("DATE DE L'ANALYSE", M_X + 260, userBoxY + 11, { font: "bold", size: 6.8, color: SOFT, letterSpace: 0.3 });
  doc.text(fmtDate(input.diagnosis.createdAt), M_X + 260, userBoxY + 21, { font: "bold", size: 9, color: INK });

  doc.advance(36);

  if (result) {
    const score = result.score_global;
    doc.ensure(48);
    const scoreBoxY = doc.cursorY;
    const scoreBoxH = 42;

    drawBox(doc, M_X, scoreBoxY, CONTENT_W, scoreBoxH, GOLD_BAND, GOLD, 0.8);

    const sColor = sevColor(score);
    doc.text(`${score}`, M_X + 14, scoreBoxY + 30, { font: "bold", size: 26, color: sColor });
    doc.text("/ 100", M_X + 14 + textWidth(String(score), 26, "bold") + 3, scoreBoxY + 30, {
      size: 8.5,
      color: SOFT,
    });

    const labelColX = M_X + 85;
    doc.text("SCORE GLOBAL DE SANTÉ DE PEAU", labelColX, scoreBoxY + 16, {
      font: "bold",
      size: 9,
      color: GOLD_DARK,
      letterSpace: 0.3,
    });

    const statusMsg =
      score >= 80
        ? "Excellente santé de peau — équilibre et protection naturelle optimaux"
        : score >= 60
        ? "Bon équilibre général — quelques points de vigilance à choyer"
        : score >= 40
        ? "Déséquilibre modéré — routine botanique réparatrice conseillée"
        : "Peau fatiguée ou fragilisée — besoin d'apaisement et de régénération";

    doc.text(statusMsg, labelColX, scoreBoxY + 28, { size: 8, color: INK, maxW: CONTENT_W - 95 });

    doc.advance(scoreBoxH + 12);

    if (result.fitzpatrick_estime) {
      doc.ensure(14);
      doc.text(`Phototype estimé : Fitzpatrick ${result.fitzpatrick_estime}`, M_X + 4, doc.cursorY + 2, {
        font: "bold",
        size: 8,
        color: SOFT,
      });
      doc.advance(13);
    }

    // Cliché multi-spectral si disponible
    if (input.spectralImage) {
      const sp = input.spectralImage;
      const imgId = "clientSpectralAcne";
      doc.addImage(imgId, sp.jpegBytes, sp.width, sp.height);

      sectionBand(
        doc,
        "A",
        "RÉVÉLATION DU FILM LIPIDIQUE & ZONES COMÉDOGÈNES",
        sp.isRealPhoto
          ? "Révélation optique par fluorescence UV (Porphyrines & Sébum)"
          : "Cartographie de référence du film lipidique (UV 405nm)"
      );

      const blockH = 142;
      doc.ensure(blockH + 10);
      const topY = doc.cursorY;

      drawBox(doc, M_X, topY, CONTENT_W, blockH, CARD, LINE, 0.7);

      const imgSize = 126;
      const imgX = M_X + 8;
      const imgY = topY + 8;
      doc.rect(imgX - 2, imgY - 2, imgSize + 4, imgSize + 4, [0.03, 0.05, 0.1]);
      doc.drawImage(imgId, imgX, imgY, imgSize, imgSize);
      doc.rectStroke(imgX, imgY, imgSize, imgSize, GOLD, 1);

      const colX = imgX + imgSize + 14;
      const colW = M_RIGHT - colX - 8;
      let textY = topY + 13;

      doc.text("ANALYSE DU SÉBUM & DES MICRO-COMÉDONS", colX, textY, { font: "bold", size: 8, color: GOLD_DARK });
      textY += 13;
      doc.text(
        "Ce cliché filtre le spectre visible pour mettre en lumière les pores engorgés et la surproduction de sébum.",
        colX,
        textY,
        { size: 7.5, color: SOFT, maxW: colW }
      );
      textY += 18;

      drawBox(doc, colX, textY - 2, colW, 20, CREAM, LINE_LIGHT, 0.5);
      doc.text("Équilibre du Sébum", colX + 6, textY + 6, { font: "bold", size: 7.8, color: INK });
      doc.textRight(sp.lipidFilmStatus ?? "Activité sébacée modérée", M_RIGHT - 14, textY + 6, {
        font: "bold",
        size: 7.8,
        color: GOLD_DARK,
      });
      doc.text(
        "Concentration visible sur le front, les ailes du nez et le menton.",
        colX + 6,
        textY + 14.5,
        { size: 6.8, color: SOFT, maxW: colW - 12 }
      );
      textY += 25;

      drawBox(doc, colX, textY - 2, colW, 24, CARD, GOLD, 0.7);
      doc.text("CONSEIL SOIN QUOTIDIEN", colX + 6, textY + 6, { font: "bold", size: 7.2, color: GOLD_DARK });
      doc.text(
        "Double nettoyage le soir avec une huile végétale non comédogène, suivi d'un gel doux purifiant au moringa.",
        colX + 6,
        textY + 15,
        { size: 6.8, color: INK, maxW: colW - 12 }
      );

      doc.advance(blockH + 10);
    }

    // Indicateurs
    sectionBand(doc, "B", "MES INDICATEURS DE SANTÉ CUTANÉE");
    const rows = [...result.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage);
    for (const ind of rows) {
      doc.ensure(16);
      const color = sevColor(ind.pourcentage);
      doc.text(ind.nom, M_X + 4, doc.cursorY + 2, { font: "bold", size: 8, color: INK, maxW: 240 });
      doc.text(sevLabel(ind.severite), M_X + 260, doc.cursorY + 2, { size: 7.5, color: SOFT });

      const bx = M_X + 320;
      const bw = 135;
      doc.rect(bx, doc.cursorY - 4, bw, 7, CREAM);
      doc.rect(bx, doc.cursorY - 4, (bw * Math.max(0, Math.min(100, ind.pourcentage))) / 100, 7, color);
      doc.rectStroke(bx, doc.cursorY - 4, bw, 7, LINE_LIGHT, 0.4);

      doc.textRight(pctLabel(ind.pourcentage), M_RIGHT - 4, doc.cursorY + 2, {
        font: "bold",
        size: 8,
        color,
      });
      doc.advance(13.5);
    }
    doc.advance(6);

    // Routine conseillée
    const reco = result.recommandations;
    sectionBand(doc, "C", "MA ROUTINE BOTANIQUE CONSEILLÉE");
    if (reco.resume) {
      doc.ensure(15);
      doc.text(reco.resume, M_X + 4, doc.cursorY + 2, { size: 8, color: INK, font: "oblique", maxW: CONTENT_W - 8 });
      doc.advance(13);
    }

    const recoBlocks: [string, string[]][] = [
      ["Le matin", reco.routine_matin],
      ["Le soir", reco.routine_soir],
      ["Botaniques recommandées", reco.botaniques_conseillees],
      ["Soins en institut", reco.soins_conseilles],
      ["Hygiène de vie", reco.conseils_hygiene_vie],
    ];

    for (const [title, items] of recoBlocks) {
      if (!items?.length) continue;
      doc.ensure(15);
      doc.text(title, M_X + 4, doc.cursorY + 2, { font: "bold", size: 8, color: GOLD_DARK });
      doc.advance(11);
      doc.ensure(12);
      doc.text(items.join(" · "), M_X + 14, doc.cursorY + 2, { size: 8, color: INK, maxW: CONTENT_W - 18 });
      doc.advance(12);
    }
    doc.advance(6);

    if (result.orientation_dermato) {
      doc.ensure(28);
      drawBox(doc, M_X, doc.cursorY, CONTENT_W, 24, CREAM, RED, 0.9);
      doc.text("AVIS DERMATOLOGIQUE MÉDICAL RECOMMANDÉ", M_X + 8, doc.cursorY + 8, {
        font: "bold",
        size: 8.5,
        color: RED,
      });
      if (result.raison_orientation) {
        doc.text(result.raison_orientation, M_X + 8, doc.cursorY + 18, {
          size: 7.5,
          color: INK,
          maxW: CONTENT_W - 16,
        });
      }
      doc.advance(30);
    }
  }

  // Mention légale de précaution
  doc.ensure(34);
  drawBox(doc, M_X, doc.cursorY, CONTENT_W, 26, CREAM, LINE, 0.6);
  doc.text(
    "Estimation non médicale — le diagnostic Kènè est un outil d'accompagnement cosmétique personnalisé. En cas d'anomalie cutanée suspecte, de douleur ou de lésion persistante, consultez un médecin dermatologue.",
    M_X + 10,
    doc.cursorY + 11,
    { size: 7.2, color: SOFT, maxW: CONTENT_W - 20 }
  );
  doc.advance(30);

  return doc.finish();
}

// ─────────────── Noms de fichiers ───────────────

export function consultationSheetFilename(clientName?: string | null): string {
  return `kene-fiche-consultation-${clientName ? slug(clientName) : "vierge"}-${stamp()}.pdf`;
}

export function proDiagReportFilename(clientName: string, date: Date | string): string {
  return `kene-compte-rendu-${slug(clientName)}-${stamp(new Date(date))}.pdf`;
}

export function clientDiagReportFilename(userName: string, date: Date | string): string {
  return `kene-mon-diagnostic-${slug(userName)}-${stamp(new Date(date))}.pdf`;
}

function safeParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
