// Kènè — Documents de consultation & comptes-rendus (t. 119).
// Lib PURE serveur, construite sur le moteur PDF maison (src/lib/accounting/pdf.ts) :
//  1. FICHE DE CONSULTATION — support papier de l'entretien en institut :
//     identité, consentements (photos + données de peau) à signer, peau connue,
//     questionnaire dermatologique complet (4 sections, 21 questions),
//     observations, protocole, signatures. Pré-remplie si la cliente a une
//     fiche CRM, sinon vierge.
//  2. COMPTE-RENDU CABINE — résultat complet d'un diagnostic réalisé en
//     institut (score, indicateurs, vigilances, recommandations, réponses).
//  3. COMPTE-RENDU SELF-SCAN — résultat d'un diagnostic IA réalisé par la
//     cliente sur l'app (mention non médicale obligatoire).
import { PdfDoc, textWidth, INK, SOFT, GOLD, GOLD_DARK, GOLD_BAND, CREAM, CARD, LINE, GREEN, RED, M_X, M_RIGHT, CONTENT_W, type RGB } from "@/lib/accounting/pdf";
import { QUESTIONNAIRE_SECTIONS, QUESTIONS, type QAnswers, type Question, type ProDiagnosisResult } from "@/lib/kene/questionnaire";
import { BODY_ZONES, type BodyZone, type DiagnosisResult } from "@/lib/kene/types";

export { PdfDoc };

// ─────────────── Utilitaires partagés ───────────────

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const n = new Date(d);
  if (Number.isNaN(n.getTime())) return "—";
  return n.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
};
const stamp = (d = new Date()): string =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const slug = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "cliente";

export interface ConsultPdfResult {
  data: Uint8Array;
  pages: number;
}

/** Bande de titre de section (même langage que la liasse comptable). */
function sectionBand(doc: PdfDoc, title: string, subtitle?: string): void {
  doc.ensure(subtitle ? 34 : 26);
  doc.rect(M_X, doc.cursorY, CONTENT_W, subtitle ? 21 : 16, GOLD_BAND);
  doc.text(title, M_X + 8, doc.cursorY + (subtitle ? 11.5 : 11), { font: "bold", size: 10.5, color: GOLD_DARK, letterSpace: 0.4 });
  if (subtitle) doc.text(subtitle, M_X + 8, doc.cursorY + 18, { size: 7.5, color: SOFT });
  doc.advance(subtitle ? 30 : 24);
}

/** Case à cocher dessinée (le glyphe ☐ n'existe pas en cp1252). */
function checkbox(doc: PdfDoc, x: number, y: number, size = 8.5, checked = false, color: RGB = INK): void {
  doc.rectStroke(x, y, size, size, color, 0.9);
  if (checked) {
    // coche ✓ : petit segment descendant puis longue remontée
    doc.line(x + 1.7, y + size * 0.52, x + size * 0.38, y + size * 0.78, color, 1.2);
    doc.line(x + size * 0.38, y + size * 0.78, x + size * 0.86, y + size * 0.14, color, 1.2);
  }
}

/** Ligne de saisie pointillée (champ à compléter à la main). */
function writeLine(doc: PdfDoc, y: number, x1 = M_X, x2 = M_RIGHT): void {
  doc.hline(x1, x2, y, LINE, 0.8);
}

function headerBand(doc: PdfDoc, title: string, line2: string, line3: string): void {
  doc.ensure(46);
  doc.rect(M_X, doc.cursorY, CONTENT_W, 38, GOLD);
  doc.text("Kènè Pro", M_X + 10, doc.cursorY + 13, { font: "bold", size: 12, color: CREAM, letterSpace: 1 });
  doc.text(title, M_X + 10, doc.cursorY + 26, { font: "bold", size: 10.5, color: CREAM });
  doc.textRight(line2, M_RIGHT - 10, doc.cursorY + 13, { size: 8, color: CREAM, maxW: 300 });
  doc.textRight(line3, M_RIGHT - 10, doc.cursorY + 26, { size: 8, color: CREAM, maxW: 300 });
  doc.advance(48);
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
  /** derniers self-scans Kènè (si compte lié) : { zone, score, date } */
  scans?: { zone: string; score: number; date: string }[];
  appAccount?: boolean;
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
  doc.setFooter(`Kènè Pro — Fiche de consultation & diagnostic de peau · générée le ${fmtDate(input.date ?? new Date())} · document à conserver au dossier client`);

  headerBand(
    doc,
    "FICHE DE CONSULTATION & DIAGNOSTIC DE PEAU",
    `${input.tenantName} · ${input.tenantCity}`,
    `${input.tenantPhone ? `Tél ${input.tenantPhone} · ` : ""}Date : ${fmtDate(input.date ?? new Date())}`
  );

  // — 1. Identité —
  sectionBand(doc, "1 · IDENTITÉ DE LA CLIENTE");
  const c = input.client ?? null;
  const idRows: [string, string][] = [
    ["Nom et prénom", c?.name ?? ""],
    ["Téléphone", c?.phone ?? ""],
  ];
  let y = doc.cursorY;
  for (const [label, val] of idRows) {
    doc.ensure(18);
    doc.text(label, M_X, y + 4, { size: 8.5, color: SOFT });
    const lx = M_X + 110;
    if (val) {
      doc.text(val, lx, y + 4, { font: "bold", size: 10, color: INK, maxW: M_RIGHT - lx });
    } else {
      writeLine(doc, y + 6, lx, M_RIGHT);
    }
    y += 17;
  }
  doc.ensure(18);
  doc.text("Praticienne", M_X, y + 4, { size: 8.5, color: SOFT });
  if (input.practitioner) {
    doc.text(input.practitioner, M_X + 110, y + 4, { font: "bold", size: 10, color: INK });
  } else {
    writeLine(doc, y + 6, M_X + 110, M_RIGHT);
  }
  doc.advance(26);
  if (c?.appAccount) {
    doc.text("Cliente sur l'app Kènè — ses self-scans et son jumeau de peau sont visibles dans la fiche CRM.", M_X, doc.cursorY, { size: 7.5, color: SOFT, font: "oblique" });
    doc.advance(13);
  }

  // — 2. Consentements —
  sectionBand(doc, "2 · CONSENTEMENTS — À FAIRE SIGNER AVANT LE DIAGNOSTIC", "Conformité données de santé & photos (RGPD / loi ivoirienne n°2013-450 relative à la protection des données à caractère personnel)");
  doc.ensure(64);
  // t. 120 — clientes qui ne lisent pas : les consentements sont EXPLIQUÉS à
  // voix haute et la signature peut être une empreinte digitale (pouce encre).
  doc.text("Les consentements sont expliqués à la cliente avant signature — lecture à voix haute si nécessaire.", M_X, doc.cursorY, { size: 7.5, color: SOFT, font: "oblique" });
  doc.advance(12);
  const consents: [boolean, string][] = [
    [false, "Je consens à la prise et à la conservation de photographies de ma peau dans mon dossier client,"],
    [false, "uniquement pour le suivi de mes diagnostics (aucune diffusion, aucun autre usage)."],
  ];
  y = doc.cursorY;
  checkbox(doc, M_X, y - 6, 9);
  doc.text("PHOTOS", M_X + 14, y + 1, { font: "bold", size: 9, color: GOLD_DARK });
  for (const [, t] of consents.slice(0, 1)) doc.text(t, M_X + 68, y + 1, { size: 8.5, color: INK, maxW: M_RIGHT - M_X - 68 });
  doc.text(consents[1][1], M_X + 68, y + 12, { size: 8.5, color: INK, maxW: M_RIGHT - M_X - 68 });
  y += 28;
  checkbox(doc, M_X, y - 6, 9);
  doc.text("DONNÉES DE PEAU", M_X + 14, y + 1, { font: "bold", size: 9, color: GOLD_DARK });
  doc.text(
    "Je consens à la conservation de mes données de peau et de diagnostic par l'institut",
    M_X + 68,
    y + 1,
    { size: 8.5, color: INK, maxW: M_RIGHT - M_X - 68 }
  );
  doc.text("(historique, scores, protocoles) pour personnaliser mes soins. Je peux les retirer à tout moment.", M_X + 68, y + 12, {
    size: 8.5,
    color: INK,
    maxW: M_RIGHT - M_X - 68,
  });
  y += 30;
  writeLine(doc, y, M_X + 130, M_X + 300);
  writeLine(doc, y, M_X + 380, M_RIGHT);
  doc.text("Signature ou empreinte digitale", M_X, y + 3, { size: 8, color: SOFT });
  doc.text("Date", M_X + 320, y + 3, { size: 8, color: SOFT });
  doc.advance(24);

  // — 3. Peau connue —
  sectionBand(doc, "3 · PEAU CONNUE (si la cliente est déjà dans le CRM)");
  const known: [string, string][] = [
    ["Type de peau", c?.skinType ? c.skinType.replace(/^\w/, (m) => m.toUpperCase()) : ""],
    ["Phototype", c?.fitzpatrick ? `Fitzpatrick ${c.fitzpatrick}` : ""],
  ];
  y = doc.cursorY;
  for (const [label, val] of known) {
    doc.ensure(17);
    doc.text(label, M_X, y + 4, { size: 8.5, color: SOFT });
    const lx = M_X + 110;
    if (val) doc.text(val, lx, y + 4, { font: "bold", size: 10, color: INK, maxW: 180 });
    else writeLine(doc, y + 6, lx, M_X + 290);
    y += 17;
  }
  doc.ensure(17);
  doc.text("Allergies connues", M_X, y + 4, { size: 8.5, color: SOFT });
  writeLine(doc, y + 6, M_X + 110, M_RIGHT);
  doc.advance(22);

  if (c?.scans && c.scans.length > 0) {
    doc.ensure(20 + c.scans.length * 13 + 6);
    doc.text("Derniers self-scans Kènè :", M_X, doc.cursorY, { font: "bold", size: 8.5, color: INK });
    doc.advance(13);
    for (const s of c.scans) {
      const zoneLabel = BODY_ZONES.find((z) => z.id === s.zone)?.label ?? s.zone;
      doc.text(`• ${zoneLabel} — score ${s.score}/100 — ${fmtDate(s.date)}`, M_X + 10, doc.cursorY, { size: 8.5, color: SOFT });
      doc.advance(12);
    }
    doc.advance(6);
  }

  // — 4. Questionnaire —
  sectionBand(doc, "4 · QUESTIONNAIRE DERMATOLOGIQUE GUIDÉ", "À remplir pendant l'entretien — les réponses alimentent le moteur de scoring Kènè");
  for (const section of QUESTIONNAIRE_SECTIONS) {
    const qs = QUESTIONS.filter((q) => q.section === section.id);
    doc.ensure(24);
    doc.text(section.label.toUpperCase(), M_X, doc.cursorY + 2, { font: "bold", size: 8.5, color: GOLD_DARK, letterSpace: 0.5 });
    doc.advance(15);
    for (const q of qs) {
      renderQuestion(doc, q);
    }
    doc.advance(6);
  }

  // — 5 & 6. Observations + protocole —
  sectionBand(doc, "5 · OBSERVATIONS DE LA PRATICIENNE");
  for (let i = 0; i < 4; i++) {
    doc.ensure(16);
    writeLine(doc, doc.cursorY + 4);
    doc.advance(16);
  }
  sectionBand(doc, "6 · PROTOCOLE & RECOMMANDATIONS");
  for (let i = 0; i < 4; i++) {
    doc.ensure(16);
    writeLine(doc, doc.cursorY + 4);
    doc.advance(16);
  }

  // — 7. Signatures —
  sectionBand(doc, "7 · VALIDATION");
  doc.ensure(40);
  y = doc.cursorY;
  writeLine(doc, y, M_X, M_X + 220);
  writeLine(doc, y, M_X + 290, M_RIGHT);
  doc.text("Signature ou empreinte digitale", M_X, y + 3, { size: 8, color: SOFT });
  doc.text("Signature & cachet de l'institut", M_X + 290, y + 3, { size: 8, color: SOFT });
  doc.advance(14);

  return doc.finish();
}

function renderQuestion(doc: PdfDoc, q: Question): void {
  const label = q.label + (q.help ? ` — ${q.help}` : "") + (q.required ? " *" : "");
  doc.ensure(20);
  doc.text(label, M_X, doc.cursorY + 2, { font: "bold", size: 8.5, color: INK, maxW: CONTENT_W });
  doc.advance(14);
  if (q.type === "text") {
    doc.ensure(16);
    writeLine(doc, doc.cursorY + 4);
    doc.advance(16);
    return;
  }
  // Options : 2 par ligne si courtes, sinon 1 par ligne (les cases restent
  // alignées — le praticienne coche à la main).
  const boxes = q.options.map((o) => o.label);
  const twoPerLine = boxes.every((b) => textWidth(b, 8) < (CONTENT_W - 40) / 2 - 24);
  const colW = (CONTENT_W - 12) / 2;
  let i = 0;
  while (i < boxes.length) {
    const row = twoPerLine ? boxes.slice(i, i + 2) : boxes.slice(i, i + 1);
    doc.ensure(14);
    let x = M_X + 6;
    for (const b of row) {
      checkbox(doc, x, doc.cursorY - 6, 8);
      doc.text(b, x + 12, doc.cursorY + 1, { size: 8, color: INK, maxW: colW - 16 });
      x += colW + 6;
    }
    doc.advance(13);
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
  };
  client: { name: string; phone: string };
}): ConsultPdfResult {
  const result = safeParse<ProDiagnosisResult>(input.diagnosis.resultJson);
  const answers = safeParse<QAnswers>(input.diagnosis.questionnaireJson) ?? {};
  const zoneLabel = BODY_ZONES.find((z) => z.id === input.diagnosis.zone)?.label ?? input.diagnosis.zone;
  const doc = new PdfDoc(`Kènè Pro — Compte-rendu de diagnostic · ${input.tenantName}`);
  doc.setFooter(`Kènè Pro — Compte-rendu de diagnostic en institut · ${input.client.name} · ${fmtDate(input.diagnosis.createdAt)} · document à remettre à la cliente`);

  headerBand(
    doc,
    "COMPTE-RENDU DE DIAGNOSTIC DE PEAU",
    `${input.tenantName} · ${input.tenantCity}`,
    `${fmtDate(input.diagnosis.createdAt)}${input.diagnosis.practitioner ? ` · ${input.diagnosis.practitioner}` : ""}`
  );

  // Identité
  doc.ensure(36);
  doc.rect(M_X, doc.cursorY, CONTENT_W, 30, CARD);
  let y = doc.cursorY + 11;
  doc.text("Cliente", M_X + 8, y, { size: 8, color: SOFT });
  doc.text(`${input.client.name} · ${input.client.phone}`, M_X + 60, y, { font: "bold", size: 9.5, color: INK, maxW: 260 });
  doc.text("Zone", M_X + 330, y, { size: 8, color: SOFT });
  doc.text(zoneLabel, M_X + 370, y, { font: "bold", size: 9.5, color: INK });
  y += 13;
  doc.text("Méthode", M_X + 8, y, { size: 8, color: SOFT });
  doc.text(
    input.diagnosis.vlmUsed ? "Entretien déclaratif (38 %) + analyse IA de la photo (62 %)" : "Entretien déclaratif (questionnaire complet)",
    M_X + 60,
    y,
    { size: 8.5, color: INK, maxW: 320 }
  );
  doc.advance(40);

  // Score
  if (result) {
    const score = result.score_global;
    doc.ensure(52);
    doc.rect(M_X, doc.cursorY, CONTENT_W, 44, GOLD_BAND);
    doc.text(`${score}`, M_X + 14, doc.cursorY + 32, { font: "bold", size: 26, color: sevColor(score) });
    doc.text("/ 100", M_X + 14, doc.cursorY + 40, { size: 8, color: SOFT });
    doc.text("SCORE DE SANTÉ DE PEAU — FUSION ENTRETIEN + OBSERVATION", M_X + 80, doc.cursorY + 20, { font: "bold", size: 9.5, color: GOLD_DARK });
    doc.text(
      score >= 80 ? "Excellente santé de peau" : score >= 60 ? "Bon équilibre général" : score >= 40 ? "Points à surveiller" : "Besoin de soin",
      M_X + 80,
      doc.cursorY + 33,
      { size: 8.5, color: INK }
    );
    doc.advance(52);

    // Indicateurs
    sectionBand(doc, "INDICATEURS PAR ZONE");
    const rows = [...result.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage);
    for (const ind of rows) {
      doc.ensure(15);
      const color = sevColor(ind.pourcentage);
      doc.text(ind.nom, M_X + 2, doc.cursorY + 2, { size: 8.5, color: INK, maxW: 250 });
      doc.text(sevLabel(ind.severite), M_X + 270, doc.cursorY + 2, { size: 8, color: SOFT });
      // barre de santé
      const bx = M_X + 330;
      const bw = 130;
      doc.rect(bx, doc.cursorY - 3, bw, 8, CREAM);
      doc.rect(bx, doc.cursorY - 3, (bw * Math.max(0, Math.min(100, ind.pourcentage))) / 100, 8, color);
      doc.textRight(pctLabel(ind.pourcentage), M_RIGHT - 2, doc.cursorY + 2, { font: "bold", size: 8.5, color });
      doc.advance(14);
    }
    doc.advance(6);

    // Vigilances
    const flags = result.questionnaire?.flags ?? [];
    if (flags.length > 0) {
      sectionBand(doc, "POINTS DE VIGILANCE");
      for (const f of flags) {
        const color = f.level === "danger" ? RED : f.level === "warn" ? GOLD_DARK : SOFT;
        doc.ensure(14);
        doc.text("•", M_X + 2, doc.cursorY + 2, { font: "bold", size: 9, color });
        doc.text(f.label, M_X + 12, doc.cursorY + 2, { font: "bold", size: 8.5, color, maxW: CONTENT_W - 12 });
        doc.advance(12);
        if (f.detail) {
          doc.ensure(12);
          doc.text(f.detail, M_X + 12, doc.cursorY + 2, { size: 8, color: SOFT, maxW: CONTENT_W - 12 });
          doc.advance(11);
        }
      }
      doc.advance(6);
    }

    // Recommandations
    sectionBand(doc, "PROTOCOLE & RECOMMANDATIONS");
    const reco = result.recommandations;
    if (reco.resume) {
      doc.ensure(14);
      doc.text(reco.resume, M_X, doc.cursorY + 2, { size: 8.5, color: INK, font: "oblique", maxW: CONTENT_W });
      doc.advance(13);
    }
    const recoBlocks: [string, string[]][] = [
      ["Routine matin", reco.routine_matin],
      ["Routine soir", reco.routine_soir],
      ["Botaniques conseillées", reco.botaniques_conseillees],
      ["Soins en institut", reco.soins_conseilles],
      ["Hygiène de vie", reco.conseils_hygiene_vie],
    ];
    for (const [title, items] of recoBlocks) {
      if (!items?.length) continue;
      doc.ensure(14);
      doc.text(title, M_X, doc.cursorY + 2, { font: "bold", size: 8.5, color: GOLD_DARK });
      doc.advance(12);
      doc.ensure(12);
      doc.text(items.join(" · "), M_X + 10, doc.cursorY + 2, { size: 8.5, color: INK, maxW: CONTENT_W - 10 });
      doc.advance(12);
    }
    doc.advance(6);

    if (result.orientation_dermato) {
      doc.ensure(26);
      doc.rectStroke(M_X, doc.cursorY, CONTENT_W, 20, RED, 1);
      doc.text("AVIS DERMATOLOGIQUE RECOMMANDÉ", M_X + 8, doc.cursorY + 8, { font: "bold", size: 9, color: RED });
      if (result.raison_orientation) doc.text(result.raison_orientation, M_X + 8, doc.cursorY + 16, { size: 8, color: INK, maxW: CONTENT_W - 16 });
      doc.advance(28);
    }
  }

  // Réponses à l'entretien (trace)
  sectionBand(doc, "RÉPONSES À L'ENTRETIEN (TRACE DU DOSSIER)");
  for (const q of QUESTIONS) {
    const a = answers[q.id];
    if (a === undefined || a === null || a === "") continue;
    const labels = Array.isArray(a)
      ? a.map((v) => q.options.find((o) => o.value === v)?.label ?? v).join(", ")
      : q.options.find((o) => o.value === a)?.label ?? String(a);
    doc.ensure(13);
    doc.text(q.label, M_X, doc.cursorY + 2, { size: 8, color: SOFT, maxW: 170 });
    doc.text(labels, M_X + 180, doc.cursorY + 2, { size: 8.5, color: INK, maxW: M_RIGHT - M_X - 180 });
    doc.advance(12);
  }
  doc.advance(6);

  // Consentements + signatures
  sectionBand(doc, "CONSENTEMENTS & SIGNATURES");
  doc.ensure(40);
  const cs = input.diagnosis;
  checkbox(doc, M_X, doc.cursorY - 6, 9, cs.consentPhoto);
  doc.text("Conservation de photos dans le dossier client", M_X + 14, doc.cursorY + 1, { size: 8.5, color: INK });
  doc.advance(14);
  checkbox(doc, M_X, doc.cursorY - 6, 9, cs.consentData);
  doc.text("Conservation des données de peau et de diagnostic", M_X + 14, doc.cursorY + 1, { size: 8.5, color: INK });
  doc.textRight(`Recueillis le ${fmtDate(cs.consentTs ?? cs.createdAt)}`, M_RIGHT, doc.cursorY + 1, { size: 8, color: SOFT });
  doc.advance(24);
  writeLine(doc, doc.cursorY, M_X, M_X + 220);
  writeLine(doc, doc.cursorY, M_X + 290, M_RIGHT);
  doc.text("Signature de la praticienne", M_X, doc.cursorY + 3, { size: 8, color: SOFT });
  doc.text("Signature ou empreinte digitale", M_X + 290, doc.cursorY + 3, { size: 8, color: SOFT });
  doc.advance(14);

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
  };
}): ConsultPdfResult {
  const result = safeParse<DiagnosisResult>(input.diagnosis.resultJson);
  const zoneLabel = BODY_ZONES.find((z) => z.id === input.diagnosis.zone)?.label ?? input.diagnosis.zone;
  const doc = new PdfDoc("Kènè — Mon diagnostic de peau");
  doc.setFooter(`Kènè — Compte-rendu de diagnostic IA · ${input.userName} · ${fmtDate(input.diagnosis.createdAt)} · estimation non médicale`);

  headerBand(doc, "MON DIAGNOSTIC DE PEAU", `${fmtDate(input.diagnosis.createdAt)} · ${zoneLabel}`, `Analyse ${result?.source === "vlm" ? "IA vision (VLM)" : "indicative"}`);

  doc.ensure(30);
  doc.text("Cliente", M_X, doc.cursorY, { size: 8, color: SOFT });
  doc.text(input.userName, M_X + 50, doc.cursorY, { font: "bold", size: 10, color: INK });
  doc.advance(16);

  if (result) {
    const score = result.score_global;
    doc.ensure(52);
    doc.rect(M_X, doc.cursorY, CONTENT_W, 44, GOLD_BAND);
    doc.text(`${score}`, M_X + 14, doc.cursorY + 32, { font: "bold", size: 26, color: sevColor(score) });
    doc.text("/ 100", M_X + 14, doc.cursorY + 40, { size: 8, color: SOFT });
    doc.text("SCORE DE SANTÉ DE PEAU", M_X + 80, doc.cursorY + 20, { font: "bold", size: 9.5, color: GOLD_DARK });
    doc.text(
      score >= 80 ? "Excellente santé de peau" : score >= 60 ? "Bon équilibre général" : score >= 40 ? "Points à surveiller" : "Besoin de soin",
      M_X + 80,
      doc.cursorY + 33,
      { size: 8.5, color: INK }
    );
    doc.advance(52);

    if (result.fitzpatrick_estime) {
      doc.ensure(13);
      doc.text(`Phototype estimé : ${result.fitzpatrick_estime}`, M_X, doc.cursorY, { size: 8.5, color: SOFT });
      doc.advance(12);
    }

    sectionBand(doc, "MES INDICATEURS");
    const rows = [...result.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage);
    for (const ind of rows) {
      doc.ensure(15);
      const color = sevColor(ind.pourcentage);
      doc.text(ind.nom, M_X + 2, doc.cursorY + 2, { size: 8.5, color: INK, maxW: 250 });
      doc.text(sevLabel(ind.severite), M_X + 270, doc.cursorY + 2, { size: 8, color: SOFT });
      const bx = M_X + 330;
      const bw = 130;
      doc.rect(bx, doc.cursorY - 3, bw, 8, CREAM);
      doc.rect(bx, doc.cursorY - 3, (bw * Math.max(0, Math.min(100, ind.pourcentage))) / 100, 8, color);
      doc.textRight(pctLabel(ind.pourcentage), M_RIGHT - 2, doc.cursorY + 2, { font: "bold", size: 8.5, color });
      doc.advance(14);
    }
    doc.advance(6);

    const reco = result.recommandations;
    sectionBand(doc, "MA ROUTINE CONSEILLÉE");
    if (reco.resume) {
      doc.ensure(14);
      doc.text(reco.resume, M_X, doc.cursorY + 2, { size: 8.5, color: INK, font: "oblique", maxW: CONTENT_W });
      doc.advance(13);
    }
    const recoBlocks: [string, string[]][] = [
      ["Le matin", reco.routine_matin],
      ["Le soir", reco.routine_soir],
      ["Botaniques pour moi", reco.botaniques_conseillees],
      ["Soins en institut", reco.soins_conseilles],
      ["Hygiène de vie", reco.conseils_hygiene_vie],
    ];
    for (const [title, items] of recoBlocks) {
      if (!items?.length) continue;
      doc.ensure(14);
      doc.text(title, M_X, doc.cursorY + 2, { font: "bold", size: 8.5, color: GOLD_DARK });
      doc.advance(12);
      doc.ensure(12);
      doc.text(items.join(" · "), M_X + 10, doc.cursorY + 2, { size: 8.5, color: INK, maxW: CONTENT_W - 10 });
      doc.advance(12);
    }
    doc.advance(6);

    if (result.orientation_dermato) {
      doc.ensure(26);
      doc.rectStroke(M_X, doc.cursorY, CONTENT_W, 20, RED, 1);
      doc.text("AVIS DERMATOLOGIQUE RECOMMANDÉ", M_X + 8, doc.cursorY + 8, { font: "bold", size: 9, color: RED });
      if (result.raison_orientation) doc.text(result.raison_orientation, M_X + 8, doc.cursorY + 16, { size: 8, color: INK, maxW: CONTENT_W - 16 });
      doc.advance(28);
    }
  }

  // Mention légale
  doc.ensure(34);
  doc.rect(M_X, doc.cursorY, CONTENT_W, 26, CREAM);
  doc.text(
    "Estimation non médicale — le diagnostic Kènè est une aide au soin, éditée par Kènè. En cas de lésion suspecte, de douleur ou de doute, consulte un dermatologue.",
    M_X + 8,
    doc.cursorY + 11,
    { size: 8, color: SOFT, maxW: CONTENT_W - 16 }
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
