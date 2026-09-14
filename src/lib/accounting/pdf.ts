// Kènè — Générateur PDF à ZÉRO DÉPENDANCE: liasse comptable SYSCOHADA (dossier complet).
// Moteur minimal mais rigoureux: pages A4, polices standard PDF (Helvetica,
// Helvetica-Bold, Helvetica-Oblique — aucun fichier de police à embarquer),
// encodage WinAnsi (accents français OK), texte aligné à droite par métriques
// AFM, rects/lignes, pagination automatique, en-têtes & pieds de page en 2e passe.
// Lib PURE (serveur) — aucune dépendance, aucun accès disque/réseau.

import type { BalanceRow, FinancialStatements } from "./syscohada";
import { csvDate, paymentMethodLabel, type JournalExportEntry, type SaleExportRow } from "./csv";

// ─────────────── Constantes de page (points PDF) ───────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M_X = 44; // marge latérale
const M_RIGHT = PAGE_W - M_X;
const CONTENT_TOP = 64; // 1re ligne de contenu (sous l'en-tête courant)
const RESERVE_BOTTOM = 52; // réserve pied de page
const CONTENT_W = M_RIGHT - M_X; // ≈ 507

export type RGB = readonly [number, number, number];
const INK: RGB = [0.16, 0.11, 0.05];
const SOFT: RGB = [0.45, 0.38, 0.28];
const GOLD: RGB = [0.69, 0.497, 0.078]; // #B07F14 — identité Kènè
const GOLD_DARK: RGB = [0.545, 0.376, 0.043];
const GOLD_BAND: RGB = [0.965, 0.918, 0.812]; // bande de titre de section
const CREAM: RGB = [0.973, 0.945, 0.894]; // zébrures #F8F1E4
const CARD: RGB = [0.988, 0.972, 0.937];
const LINE: RGB = [0.85, 0.79, 0.68];
const GREEN: RGB = [0.13, 0.45, 0.28];
const RED: RGB = [0.72, 0.26, 0.18];
export { INK, SOFT, GOLD, GOLD_DARK, GOLD_BAND, CREAM, CARD, LINE, GREEN, RED };
export { PAGE_W, PAGE_H, M_X, M_RIGHT, CONTENT_W, CONTENT_TOP };

export type Font = "regular" | "bold" | "oblique";

// ─────────────── Encodage WinAnsi (cp1252) ───────────────
// PDF: les polices Type1 standard déclarent /WinAnsiEncoding → un octet par
// caractère; l'Unicode hors cp1252 est remplacé par «? » (contrôlé: nos
// textes sont français; les données saisies passent par le même filtre).
const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

/** Chaîne JS → octets cp1252 + échappement \  pour l'opérateur Tj */
function encodePdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 63;
    const b = c <= 0xff ? c : (CP1252_EXTRA[c] ?? 63);
    if (b === 0x5c || b === 0x28 || b === 0x29) out += "\\";
    out += String.fromCharCode(b);
  }
  return out;
}

// ─────────────── Métriques Helvetica (AFM, largeurs 1/1000) ───────────────
// ASCII exact (Adobe AFM public); accents ≈ largeur de la lettre de base
// (règle AFM: accent sans chasse). Les montants étant ASCII pur, l'alignement
// à droite des colonnes numériques est exact au point près.
const W_REG = buildWidths(false);
const W_BOLD = buildWidths(true);

function asciiWidths(bold: boolean): number[] {
  const w = new Array<number>(0x60).fill(556);
  // sp! " # $ % & ' 
  const reg = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333,
    // * +, -. / 0 … 9
    389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    //:; < = >? @ A B C D
    278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722,
    // E F G H I J K L M N
    667, 611, 778, 722, 278, 500, 667, 556, 833, 722,
    // O P Q R S T U V W
    778, 667, 778, 722, 667, 611, 722, 667, 944,
    // X Y Z [ \ ] ^ _ ` a
    667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
    // b c d e f g h i j k
    556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    // l m n o p q r s t u
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556,
    // v w x y z { | } ~
    500, 722, 500, 500, 500, 334, 260, 334, 584];
  const bld = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333,
    389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
    333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722,
    667, 611, 778, 722, 278, 556, 722, 611, 833, 722,
    778, 667, 778, 722, 667, 611, 722, 667, 944,
    667, 667, 611, 333, 278, 333, 584, 556, 333, 556,
    611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
    278, 889, 611, 611, 611, 611, 389, 556, 333, 611,
    556, 778, 556, 556, 500, 389, 280, 389, 584];
  const src = bold ? bld : reg;
  for (let i = 0; i < src.length; i++) w[i] = src[i];
  return w;
}

function buildWidths(bold: boolean): number[] {
  const ascii = asciiWidths(bold);
  const w = new Array<number>(0x100).fill(556);
  for (let b = 0x20; b < 0x80; b++) w[b] = ascii[b - 0x20];
  // Latin-1 + cp1252: largeur de la lettre de base (NFD)
  for (let b = 0xa0; b < 0x100; b++) {
    const ch = String.fromCharCode(b).normalize("NFD")[0] ?? "?";
    const c = ch.charCodeAt(0);
    w[b] = c >= 0x20 && c < 0x80 ? ascii[c - 0x20] : 556;
  }
  // ponctuation typographique cp1252 (0x80-0x9F)
  const typo: Record<number, number> = bold
    ? { 0x91: 238, 0x92: 238, 0x93: 474, 0x94: 474, 0x96: 333, 0x97: 1000, 0x85: 1000, 0x95: 350, 0x80: 556 }
    : { 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x96: 556, 0x97: 1000, 0x85: 1000, 0x95: 350, 0x80: 556 };
  for (const [k, v] of Object.entries(typo)) w[Number(k)] = v;
  return w;
}

/** Largeur d'un texte (unités utilisateur) — métriques AFM Helvetica */
export function textWidth(s: string, size: number, font: Font = "regular"): number {
  const table = font === "bold" ? W_BOLD : W_REG;
  let units = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 63;
    let b = c <= 0xff ? c : (CP1252_EXTRA[c] ?? 0x3f);
    if (b >= 0x80 && b < 0xa0) {
      // déjà couvert par typo (ou défaut 556)
    } else if (b >= 0xa0) {
      const base = ch.normalize("NFD")[0] ?? "?";
      const bc = base.charCodeAt(0);
      if (bc >= 0x20 && bc < 0x80) b = bc;
    }
    units += table[b] ?? 556;
  }
  return (units * size) / 1000;
}

/** Coupe le texte à maxW en conservant la fin lisible (suffixe « … ») */
function clip(s: string, maxW: number, size: number, font: Font = "regular"): string {
  if (textWidth(s, size, font) <= maxW) return s;
  const ell = "…";
  let out = "";
  for (const ch of s) {
    if (textWidth(out + ch + ell, size, font) > maxW) break;
    out += ch;
  }
  return out + ell;
}

/** Découpe un texte en lignes ≤ maxW (coupe mot à mot, puis caractère par caractère) */
function wrapText(s: string, maxW: number, size: number, font: Font): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (textWidth(test, size, font) <= maxW) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = w;
    while (textWidth(line, size, font) > maxW) {
      let cut = line.length - 1;
      while (cut > 0 && textWidth(line.slice(0, cut), size, font) > maxW) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ─────────────── Tampon d'octets (chaque caractère ≤ 0xFF) ───────────────
class ByteBuf {
  private chunks: Uint8Array[] = [];
  private len = 0;
  append(s: string): void {
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
    this.chunks.push(a);
    this.len += a.length;
  }
  get length(): number {
    return this.len;
  }
  toUint8(): Uint8Array {
    const out = new Uint8Array(this.len);
    let p = 0;
    for (const c of this.chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
}

const fmtPt = (n: number): string => String(Math.round(n * 100) / 100);
export { fmtPt };

// ─────────────── Document (primitives + pagination) ───────────────
interface TextOpts {
  font?: Font;
  size?: number;
  color?: RGB;
  maxW?: number; // tronque avec « … »
  letterSpace?: number; // point
}

export class PdfDoc {
  private pages: string[][] = [];
  private cur: string[] = [];
  private y = CONTENT_TOP;
  private footerLeft = "";
  // En-tête courant des pages 2+ (: le moteur sert aussi la fiche de
  // consultation et les comptes-rendus — pas seulement la liasse comptable).
  constructor(private headerText = "Kènè Pro — Liasse comptable SYSCOHADA") {}

  /** Position verticale courante (baseline, depuis le HAUT de page) */
  get cursorY(): number {
    return this.y;
  }
  advance(dy: number): void {
    this.y += dy;
  }
  newPage(): void {
    if (this.cur.length > 0) this.pages.push(this.cur);
    this.cur = [];
    this.y = CONTENT_TOP;
  }
  /** Réserve dy de hauteur: saute de page si nécessaire */
  ensure(dy: number): void {
    if (this.y + dy > PAGE_H - RESERVE_BOTTOM) this.newPage();
  }
  setFooter(left: string): void {
    this.footerLeft = left;
  }

  private op(s: string): void {
    this.cur.push(s);
  }

  // — primitives de dessin (y = distance depuis le HAUT) —
  text(s: string, x: number, y: number, o: TextOpts = {}): void {
    const font = o.font ?? "regular";
    const size = o.size ?? 9;
    const color = o.color ?? INK;
    const str = o.maxW ? clip(s, o.maxW, size, font) : s;
    const enc = encodePdfText(str);
    const f = font === "bold" ? "/F2" : font === "oblique" ? "/F3" : "/F1";
    // Tc TOUJOURS explicite: l'état texte (Tc) survit aux blocs BT/ET —
    // sans remise à zéro, l'interlettrage d'un titre bave sur les textes suivants.
    const ls = fmtPt(o.letterSpace ?? 0);
    this.op(
      `BT ${f} ${fmtPt(size)} Tf ${color.map((v) => fmtPt(v)).join(" ")} rg ${ls} Tc 1 0 0 1 ${fmtPt(x)} ${fmtPt(PAGE_H - y)} Tm (${enc}) Tj ET`
    );
  }
  textRight(s: string, xRight: number, y: number, o: TextOpts = {}): void {
    const font = o.font ?? "regular";
    const size = o.size ?? 9;
    const str = o.maxW ? clip(s, o.maxW, size, font) : s;
    const w = textWidth(str, size, font);
    this.text(str, xRight - w, y, o);
  }
  rect(x: number, y: number, w: number, h: number, color: RGB): void {
    this.op(`${color.map((v) => fmtPt(v)).join(" ")} rg ${fmtPt(x)} ${fmtPt(PAGE_H - y - h)} ${fmtPt(w)} ${fmtPt(h)} re f`);
  }
  rectStroke(x: number, y: number, w: number, h: number, color: RGB, lw = 0.7): void {
    this.op(`${color.map((v) => fmtPt(v)).join(" ")} RG ${fmtPt(lw)} w ${fmtPt(x)} ${fmtPt(PAGE_H - y - h)} ${fmtPt(w)} ${fmtPt(h)} re S`);
  }
  hline(x1: number, x2: number, y: number, color: RGB = LINE, lw = 0.7): void {
    this.op(`${color.map((v) => fmtPt(v)).join(" ")} RG ${fmtPt(lw)} w ${fmtPt(x1)} ${fmtPt(PAGE_H - y)} m ${fmtPt(x2)} ${fmtPt(PAGE_H - y)} l S`);
  }
  /** Segment quelconque (coordonnées y depuis le HAUT) — coches, diagonales. */
  line(x1: number, y1: number, x2: number, y2: number, color: RGB = LINE, lw = 0.9): void {
    this.op(`${color.map((v) => fmtPt(v)).join(" ")} RG ${fmtPt(lw)} w ${fmtPt(x1)} ${fmtPt(PAGE_H - y1)} m ${fmtPt(x2)} ${fmtPt(PAGE_H - y2)} l S`);
  }

  // — sérialisation —
  finish(): { data: Uint8Array; pages: number } {
    this.newPage();
    const total = this.pages.length;
    const pageStreams = this.pages.map((ops, i) => {
      const parts: string[] = [];
      if (i > 0) {
        parts.push(this.runningHeader());
      }
      parts.push(ops.join("\n"));
      parts.push(this.pageFooter(i + 1, total));
      return parts.join("\n");
    });

    const buf = new ByteBuf();
    buf.append("%PDF-1.4\n");
    buf.append("%\u00e2\u00e3\u00cf\u00d3\n");
    const offsets: number[] = [];
    const obj = (body: string): void => {
      offsets.push(buf.length);
      buf.append(`${offsets.length} 0 obj\n${body}\nendobj\n`);
    };

    const kids = pageStreams.map((_, i) => `${6 + 2 * i} 0 R`).join(" ");
    obj(`<< /Type /Catalog /Pages 2 0 R >>`);
    obj(`<< /Type /Pages /Count ${total} /Kids [${kids}] >>`);
    obj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    obj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    obj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>`);
    pageStreams.forEach((stream, i) => {
      obj(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmtPt(PAGE_W)} ${fmtPt(PAGE_H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${7 + 2 * i} 0 R >>`
      );
      obj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    const xrefPos = buf.length;
    const count = offsets.length + 1;
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
    buf.append(xref);
    buf.append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
    return { data: buf.toUint8(), pages: total };
  }

  private runningHeader(): string {
    const left = encodePdfText(this.headerText);
    return (
      `BT /F1 7 Tf 0 Tc ${SOFT.map(fmtPt).join(" ")} rg 1 0 0 1 ${M_X} ${fmtPt(PAGE_H - 36)} Tm (${left}) Tj ET\n` +
      `q ${GOLD.map((v) => fmtPt(v)).join(" ")} RG 1.1 w ${M_X} ${fmtPt(PAGE_H - 46)} m ${M_RIGHT} ${fmtPt(PAGE_H - 46)} l S Q`
    );
  }
  private pageFooter(n: number, total: number): string {
    const left = encodePdfText(this.footerLeft);
    const right = encodePdfText(`Page ${n} / ${total}`);
    const wR = textWidth(`Page ${n} / ${total}`, 7);
    return (
      `BT /F1 7 Tf 0 Tc ${SOFT.map(fmtPt).join(" ")} rg 1 0 0 1 ${M_X} 34 Tm (${left}) Tj ET\n` +
      `BT /F1 7 Tf 0 Tc ${SOFT.map(fmtPt).join(" ")} rg 1 0 0 1 ${fmtPt(M_RIGHT - wR)} 34 Tm (${right}) Tj ET`
    );
  }
}

// ─────────────── Formats métier ───────────────
function fmtAmount(n: number): string {
  const r = Math.round(Number.isFinite(n) ? n : 0);
  const a = Math.abs(r);
  const s = a === 0 ? "0" : String(a).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return r < 0 ? `-${s}` : s;
}
const fmtFcfa = (n: number): string => `${fmtAmount(n)} FCFA`;

// ─────────────── Document: la liasse complète ───────────────
export interface LiassePdfInput {
  tenantName: string;
  tenantCity?: string | null;
  from?: Date;
  to?: Date;
  /** Écritures de journal triées par date croissante (lignes incluses) */
  entries: JournalExportEntry[];
  balance: BalanceRow[];
  statements: FinancialStatements;
  sales: SaleExportRow[];
}

export interface LiassePdfResult {
  data: Uint8Array;
  pages: number;
}

/** Nom de fichier: kene-liasse-{AAAAMMJJ-AAAAMMJJ|tout}.pdf */
export function liassePdfFilename(from?: Date, to?: Date): string {
  const stamp = (d?: Date): string => {
    if (!d || Number.isNaN(new Date(d).getTime())) return "";
    const n = new Date(d);
    return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}`;
  };
  const a = stamp(from);
  const b = stamp(to);
  const period = a && b ? `${a}-${b}` : a || b || "tout";
  return `kene-liasse-${period}.pdf`;
}

interface Col {
  x: number;
  w: number;
  align?: "left" | "right";
  font?: Font;
  size?: number;
  color?: RGB;
}

export function liassePdf(input: LiassePdfInput): LiassePdfResult {
  const doc = new PdfDoc();
  const st = input.statements;
  const periodLabel = input.from
    ? `du ${csvDate(input.from)}${input.to ? ` au ${csvDate(input.to)}` : ""}`
    : "intégralité des données";
  const ventesTtc = input.sales.reduce((t, s) => t + (Number.isFinite(s.total) ? s.total : 0), 0);

  // ════════ PAGE DE GARDE ════════
  doc.setFooter(`Kènè Pro · ${input.tenantName} · Liasse ${periodLabel}`);
  doc.text("KÈNÈ", M_X, 78, { font: "bold", size: 26, color: GOLD, letterSpace: 2.2 });
  doc.text("Liasse comptable — dossier complet", M_X, 100, { font: "bold", size: 15, color: INK });
  doc.text("Référentiel SYSCOHADA révisé (OHADA) — présentation simplifiée", M_X, 116, { size: 9.5, color: SOFT });
  doc.hline(M_X, M_X + 130, 130, GOLD, 2);
  doc.text(input.tenantName, M_X, 158, { font: "bold", size: 13, color: INK });
  if (input.tenantCity) doc.text(input.tenantCity, M_X, 174, { size: 9.5, color: SOFT });
  doc.text(`Période : ${periodLabel}`, M_X, 200, { font: "bold", size: 10.5, color: INK });
  doc.text(
    `Édition du ${csvDate(new Date())} · ${input.entries.length} écritures · ${input.sales.length} ventes · montants en FCFA`,
    M_X, 216, { size: 9, color: SOFT }
  );

  // Chiffres clés — 3 colonnes × 2 lignes
  const BOX_W = 155, BOX_H = 62, GAP = 21;
  const bx = (c: number): number => M_X + c * (BOX_W + GAP);
  const by = (r: number): number => 248 + r * (BOX_H + 16);
  doc.text("CHIFFRES CLÉS DE LA PÉRIODE", M_X, 240, { font: "bold", size: 8.5, color: GOLD_DARK, letterSpace: 1.4 });
  const keys: { label: string; value: string; color: RGB }[] = [
    { label: "Produits", value: fmtAmount(st.produits), color: INK },
    { label: "Charges", value: fmtAmount(st.charges), color: INK },
    { label: "Résultat net", value: fmtAmount(st.resultat), color: st.resultat >= 0 ? GREEN : RED },
    { label: "TVA nette à payer", value: fmtAmount(st.tvaAPayer), color: INK },
    { label: "Total bilan", value: fmtAmount(st.totalActif), color: INK },
    { label: "Ventes encaissées (TTC)", value: fmtAmount(ventesTtc), color: INK },
  ];
  keys.forEach((k, i) => {
    const c = i % 3, r = Math.floor(i / 3);
    doc.rect(bx(c), by(r), BOX_W, BOX_H, CARD);
    doc.hline(bx(c), bx(c) + BOX_W, by(r), GOLD, 1.6);
    doc.text(k.label, bx(c) + 10, by(r) + 20, { size: 6.8, color: SOFT, maxW: BOX_W - 16, letterSpace: 0.6 });
    doc.textRight(k.value, bx(c) + BOX_W - 10, by(r) + 46, { font: "bold", size: 13.5, color: k.color, maxW: BOX_W - 18 });
  });

  // Sommaire
  const tocY = by(1) + BOX_H + 46;
  doc.text("SOMMAIRE", M_X, tocY, { font: "bold", size: 8.5, color: GOLD_DARK, letterSpace: 1.4 });
  const toc = [
    "1 · Compte de résultat",
    "2 · Déclaration de TVA",
    "3 · Bilan — actif & passif",
    "4 · Balance générale des comptes",
    "5 · Journal des écritures",
    "6 · Livre des ventes (TVA)",
    "7 · Mentions & contrôles",
  ];
  toc.forEach((t, i) => doc.text(t, M_X, tocY + 16 + i * 14, { size: 9, color: INK }));

  const noteY = tocY + 16 + toc.length * 14 + 26;
  doc.text(
    "Document destiné à l'institut, son comptable et l'administration fiscale — généré automatiquement par Kènè Pro.",
    M_X, noteY, { font: "oblique", size: 7.5, color: SOFT, maxW: CONTENT_W }
  );
  doc.newPage();

  // ════════ Primitives de section ════════
  function section(no: number, title: string, subtitle?: string): void {
    doc.ensure(64);
    doc.advance(30);
    doc.rect(M_X, doc.cursorY - 13, CONTENT_W, 22, GOLD_BAND);
    doc.text(String(no), M_X + 8, doc.cursorY + 3, { font: "bold", size: 13, color: GOLD });
    doc.text(title.toUpperCase(), M_X + 24, doc.cursorY + 3, { font: "bold", size: 10.5, color: INK, letterSpace: 0.8 });
    doc.advance(20);
    if (subtitle) {
      doc.text(subtitle, M_X, doc.cursorY, { size: 8, color: SOFT, maxW: CONTENT_W });
      doc.advance(12);
    }
  }
  function kvRow(label: string, amount: number | null, o: { indent?: number; bold?: boolean; band?: boolean; color?: RGB } = {}): void {
    doc.ensure(16);
    if (o.band) doc.rect(M_X, doc.cursorY - 10, CONTENT_W, 15, GOLD_BAND);
    doc.text(label, M_X + (o.indent ?? 0), doc.cursorY + 1, {
      font: o.bold ? "bold" : "regular", size: o.bold ? 9.5 : 9, color: o.color ?? INK, maxW: CONTENT_W - 110,
    });
    if (amount !== null) {
      doc.textRight(fmtAmount(amount), M_RIGHT, doc.cursorY + 1, {
        font: o.bold ? "bold" : "regular", size: o.bold ? 9.5 : 9, color: o.color ?? INK, maxW: 100,
      });
    }
    doc.advance(15);
  }
  function subsection(label: string): void {
    doc.ensure(24);
    doc.advance(6);
    doc.text(label, M_X, doc.cursorY, { font: "bold", size: 9, color: GOLD_DARK, letterSpace: 0.5 });
    doc.hline(M_X, M_RIGHT, doc.cursorY + 4, LINE, 0.6);
    doc.advance(16);
  }
  function controlNote(ok: boolean, okMsg: string, koMsg: string): void {
    doc.ensure(16);
    doc.advance(6);
    doc.text(`Contrôle : ${ok ? okMsg : koMsg}`, M_X, doc.cursorY, {
      font: "oblique", size: 7.8, color: ok ? GREEN : RED, maxW: CONTENT_W,
    });
    doc.advance(14);
  }
  function tableHeader(cols: { title: string; col: Col }[]): void {
    doc.ensure(18);
    for (const { title, col } of cols) {
      // pas d'interlettrage sur les colonnes alignées à droite: la mesure de
      // largeur (AFM) ne compte pas le Tc — l'alignement resterait approximatif.
      if (col.align === "right") doc.textRight(title, col.x + col.w, doc.cursorY + 2, { font: "bold", size: 7, color: SOFT });
      else doc.text(title, col.x, doc.cursorY + 2, { font: "bold", size: 7, color: SOFT, letterSpace: 0.4 });
    }
    doc.hline(M_X, M_RIGHT, doc.cursorY + 6, LINE, 0.8);
    doc.advance(16);
  }

  // ════════ 1 · COMPTE DE RÉSULTAT ════════
  section(1, "Compte de résultat", "Solde des comptes de produits (classe 7) et de charges (classe 6) sur la période.");
  subsection("PRODUITS D'EXPLOITATION");
  const produitsRows = input.balance.filter((r) => r.type === "produit");
  for (const r of produitsRows) kvRow(r.accountLabel, -r.solde, { indent: 10 });
  if (produitsRows.length === 0) kvRow("Aucun produit enregistré sur la période", 0, { indent: 10 });
  kvRow("TOTAL PRODUITS", st.produits, { bold: true });
  subsection("CHARGES D'EXPLOITATION");
  const chargesRows = input.balance.filter((r) => r.type === "charge");
  for (const r of chargesRows) kvRow(r.accountLabel, r.solde, { indent: 10 });
  if (chargesRows.length === 0) kvRow("Aucune charge enregistrée sur la période", 0, { indent: 10 });
  kvRow("TOTAL CHARGES", st.charges, { bold: true });
  kvRow("RÉSULTAT NET DE LA PÉRIODE", st.resultat, { bold: true, band: true, color: st.resultat >= 0 ? GREEN : RED });
  controlNote(
    st.resultat >= 0,
    `bénéfice de ${fmtFcfa(st.resultat)} — les produits couvrent les charges.`,
    `perte de ${fmtFcfa(-st.resultat)} — les charges dépassent les produits.`
  );

  // ════════ 2 · DÉCLARATION DE TVA ════════
  section(2, "Déclaration de TVA", "TVA 18 % incluse dans les encaissements — compte 443 (facturée) et 445 (récupérable).");
  kvRow("TVA collectée (facturée aux clientes)", st.tvaCollected, { indent: 10 });
  kvRow("TVA déductible (sur achats)", st.tvaDeductible, { indent: 10 });
  kvRow("TVA NETTE À PAYER", st.tvaAPayer, { bold: true, band: true });
  doc.ensure(18);
  doc.advance(4);
  doc.text(
    "Remboursements et avoirs passent par écritures OD — voir journal, section 5.",
    M_X, doc.cursorY, { font: "oblique", size: 7.8, color: SOFT, maxW: CONTENT_W }
  );
  doc.advance(14);

  // ════════ 3 · BILAN ════════
  section(3, "Bilan — actif & passif", "Présentation simplifiée : comptes de classes 1 à 5 regroupés par poste.");
  subsection("ACTIF");
  for (const a of st.actif) kvRow(a.label, a.amount, { indent: 10 });
  kvRow("TOTAL ACTIF", st.totalActif, { bold: true });
  subsection("PASSIF");
  for (const p of st.passif) kvRow(p.label, p.amount, { indent: 10 });
  kvRow("TOTAL PASSIF", st.totalPassif, { bold: true });
  controlNote(
    st.totalActif === st.totalPassif,
    `actif = passif (${fmtFcfa(st.totalActif)}), bilan équilibré.`,
    `écart actif/passif de ${fmtFcfa(Math.abs(st.totalActif - st.totalPassif))} à investiguer.`
  );

  // ════════ 4 · BALANCE GÉNÉRALE ════════
  section(4, "Balance générale des comptes", "Totaux mouvements et soldes par compte — base du bilan et du compte de résultat.");
  const balCols: { title: string; col: Col }[] = [
    { title: "COMPTE", col: { x: M_X, w: 56, size: 7.5 } },
    { title: "INTITULÉ", col: { x: M_X + 60, w: 176, size: 7.5 } },
    { title: "TOT. DÉBIT", col: { x: M_X + 236, w: 66, align: "right", size: 7.5 } },
    { title: "TOT. CRÉDIT", col: { x: M_X + 302, w: 66, align: "right", size: 7.5 } },
    { title: "SOLDE DÉB.", col: { x: M_X + 368, w: 66, align: "right", size: 7.5 } },
    { title: "SOLDE CRÉD.", col: { x: M_X + 434, w: 73, align: "right", size: 7.5 } },
  ];
  tableHeader(balCols);
  let totD = 0, totC = 0;
  input.balance.forEach((r, i) => {
    totD += r.totalDebit;
    totC += r.totalCredit;
    doc.ensure(13);
    if (i % 2 === 1) doc.rect(M_X, doc.cursorY - 9.5, CONTENT_W, 12, CREAM);
    const y = doc.cursorY + 2;
    doc.text(r.accountCode, M_X, y, { size: 7.5, color: INK });
    doc.text(r.accountLabel, M_X + 60, y, { size: 7.5, color: INK, maxW: 174 });
    doc.textRight(fmtAmount(r.totalDebit), M_X + 302, y, { size: 7.5, color: INK });
    doc.textRight(fmtAmount(r.totalCredit), M_X + 368, y, { size: 7.5, color: INK });
    doc.textRight(r.solde > 0 ? fmtAmount(r.solde) : "—", M_X + 434, y, { size: 7.5, color: INK });
    doc.textRight(r.solde < 0 ? fmtAmount(-r.solde) : "—", M_X + 507, y, { size: 7.5, color: INK });
    doc.advance(12.5);
  });
  // Totaux alignés sous leurs colonnes (débit → 346, crédit → 412)
  doc.ensure(20);
  doc.hline(M_X, M_RIGHT, doc.cursorY + 6, GOLD, 1.1);
  doc.advance(15);
  doc.text("TOTAUX", M_X, doc.cursorY + 2, { font: "bold", size: 8.5, color: INK });
  doc.textRight(fmtAmount(totD), M_X + 302, doc.cursorY + 2, { font: "bold", size: 8.5, color: INK });
  doc.textRight(fmtAmount(totC), M_X + 368, doc.cursorY + 2, { font: "bold", size: 8.5, color: INK });
  doc.advance(16);
  controlNote(totD === totC, "balance équilibrée (total débit = total crédit).", `DÉSÉQUILIBRE de ${fmtFcfa(Math.abs(totD - totC))} — écriture déséquilibrée à corriger.`);

  // ════════ 5 · JOURNAL DES ÉCRITURES ════════
  section(5, "Journal des écritures", "Chronologie complète — chaque écriture équilibrée (débit = crédit).");
  let journalTotD = 0, journalTotC = 0;
  for (const e of input.entries) {
    doc.ensure(46); // en-tête + 1re ligne jamais orphelines
    doc.rect(M_X, doc.cursorY - 10, CONTENT_W, 16, GOLD_BAND);
    const hy = doc.cursorY + 3;
    doc.text(csvDate(e.date), M_X + 6, hy, { font: "bold", size: 7.8, color: INK });
    doc.text(e.journalCode, M_X + 58, hy, { font: "bold", size: 7.8, color: GOLD_DARK });
    doc.text(e.reference, M_X + 92, hy, { size: 7.8, color: SOFT, maxW: 100 });
    doc.text(e.description, M_X + 196, hy, { font: "bold", size: 7.8, color: INK, maxW: 305 });
    doc.advance(17);
    for (const l of e.lines) {
      journalTotD += l.debit;
      journalTotC += l.credit;
      doc.ensure(13);
      const y = doc.cursorY + 2;
      doc.text(l.account?.code ?? "?", M_X + 12, y, { size: 7.3, color: INK });
      doc.text(l.label ?? l.account?.label ?? "", M_X + 92, y, { size: 7.3, color: SOFT, maxW: 240 });
      doc.textRight(l.debit > 0 ? fmtAmount(l.debit) : "", M_X + 368, y, { size: 7.3, color: INK });
      doc.textRight(l.credit > 0 ? fmtAmount(l.credit) : "", M_X + 507, y, { size: 7.3, color: INK });
      doc.advance(12.5);
    }
    doc.hline(M_X, M_RIGHT, doc.cursorY - 6, LINE, 0.5);
    doc.advance(8);
  }
  // Totaux alignés sous les colonnes débit (412) / crédit (551)
  doc.ensure(22);
  doc.rect(M_X, doc.cursorY - 10, CONTENT_W, 17, GOLD_BAND);
  doc.text("TOTAL JOURNAL — DÉBIT / CRÉDIT", M_X, doc.cursorY + 2, { font: "bold", size: 9.5, color: INK, maxW: 320 });
  doc.textRight(fmtAmount(journalTotD), M_X + 368, doc.cursorY + 2, { font: "bold", size: 9.5, color: INK });
  doc.textRight(fmtAmount(journalTotC), M_RIGHT, doc.cursorY + 2, { font: "bold", size: 9.5, color: INK });
  doc.advance(17);
  controlNote(journalTotD === journalTotC, "journal équilibré (chaque écriture débit = crédit).", `déséquilibre de ${fmtFcfa(Math.abs(journalTotD - journalTotC))}.`);

  // ════════ 6 · LIVRE DES VENTES ════════
  section(6, "Livre des ventes (TVA)", "Ventes encaissées en caisse (statut « completed ») — base de la TVA collectée.");
  const ventesCols: { title: string; col: Col }[] = [
    { title: "DATE", col: { x: M_X, w: 44, size: 7.3 } },
    { title: "RÉF", col: { x: M_X + 48, w: 36, size: 7.3 } },
    { title: "CLIENTE", col: { x: M_X + 88, w: 150, size: 7.3 } },
    { title: "ART.", col: { x: M_X + 242, w: 18, align: "right", size: 7.3 } },
    { title: "MODE", col: { x: M_X + 266, w: 90, size: 7.3 } },
    { title: "HT", col: { x: M_X + 316, w: 59, align: "right", size: 7.3 } },
    { title: "TVA", col: { x: M_X + 378, w: 59, align: "right", size: 7.3 } },
    { title: "TTC", col: { x: M_X + 448, w: 59, align: "right", size: 7.3 } },
  ];
  tableHeader(ventesCols);
  const t = { ht: 0, tva: 0, ttc: 0, art: 0 };
  input.sales.forEach((s, i) => {
    const ht = (Number.isFinite(s.total) ? s.total : 0) - (Number.isFinite(s.tvaAmount) ? s.tvaAmount : 0);
    t.ht += ht;
    t.tva += s.tvaAmount;
    t.ttc += s.total;
    t.art += s.itemCount;
    doc.ensure(13);
    if (i % 2 === 1) doc.rect(M_X, doc.cursorY - 9.5, CONTENT_W, 12, CREAM);
    const y = doc.cursorY + 2;
    doc.text(csvDate(s.date), M_X, y, { size: 7.3, color: INK });
    doc.text(s.ref ?? "", M_X + 48, y, { size: 7.3, color: SOFT, maxW: 36 });
    doc.text(s.clientName ?? "Cliente de passage", M_X + 88, y, { size: 7.3, color: INK, maxW: 148 });
    doc.textRight(String(s.itemCount), M_X + 260, y, { size: 7.3, color: SOFT });
    doc.text(paymentMethodLabel(s.paymentMethod), M_X + 266, y, { size: 7.3, color: SOFT, maxW: 88 });
    doc.textRight(fmtAmount(ht), M_X + 375, y, { size: 7.3, color: INK });
    doc.textRight(fmtAmount(s.tvaAmount), M_X + 437, y, { size: 7.3, color: INK });
    doc.textRight(fmtAmount(s.total), M_RIGHT, y, { size: 7.3, font: "bold", color: INK });
    doc.advance(12.5);
  });
  kvRow(`TOTAUX — ${input.sales.length} ventes · ${t.art} articles`, t.ttc, { bold: true, band: true });
  doc.textRight(fmtAmount(t.ht), M_X + 375, doc.cursorY - 14, { font: "bold", size: 9.5, color: INK });
  doc.textRight(fmtAmount(t.tva), M_X + 437, doc.cursorY - 14, { font: "bold", size: 9.5, color: INK });

  // ════════ 7 · MENTIONS ════════
  section(7, "Mentions & conformité");
  const mentions = [
    `Document généré automatiquement par Kènè Pro le ${csvDate(new Date())} — institut : ${input.tenantName}${input.tenantCity ? ` (${input.tenantCity})` : ""}.`,
    "Présentation simplifiée inspirée du référentiel SYSCOHADA révisé (OHADA) ; ne remplace pas les modèles officiels de la liasse fiscale (C.E.D.I.F / N.C.M.F) à déposer auprès de la DGI.",
    "Montants exprimés en FCFA. TVA 18 % incluse dans les montants encaissés ; l'extraction hors TVA est détaillée dans le livre des ventes.",
    "Le livre des ventes couvre les ventes de caisse au statut « completed » ; les commandes en ligne institut transitent par le compte clients (411000) et la commission Kènè par le compte 752000.",
    "Support authentique : le journal (section 5) et la balance (section 4) font foi pour toute vérification de cohérence.",
  ];
  for (const m of mentions) {
    const lines = wrapText(m, CONTENT_W, 7.8, "oblique");
    doc.ensure(lines.length * 11 + 8);
    doc.advance(4);
    for (const ln of lines) {
      doc.text(ln, M_X, doc.cursorY, { font: "oblique", size: 7.8, color: SOFT });
      doc.advance(11);
    }
    doc.advance(3);
  }

  return doc.finish();
}
