// Kènè — Fil de Kente : palette des fils, armure du tissage et refs mutables.
// Module PUR (aucune dépendance three / React) : réutilisable côté scène WebGL,
// fallback CSS ou serveur. Suit la convention de twinMath / evolution.

export interface KenteThread {
  id: string;
  /** nom poétique du fil (légende visible) */
  name: string;
  hex: string;
}

/** Les six fils du métier Kènè — or, bissap, baobab, karité, mélanine, sunset. */
export const KENTE_THREADS: KenteThread[] = [
  { id: "or", name: "or", hex: "#C8951E" },
  { id: "bissap", name: "bissap", hex: "#8B1A3B" },
  { id: "baobab", name: "baobab", hex: "#3F7D3F" },
  { id: "karite", name: "karité", hex: "#F8F1E4" },
  { id: "melanine", name: "mélanine", hex: "#241A10" },
  { id: "sunset", name: "sunset", hex: "#E07A2B" },
];

/**
 * Armure kente — index de fil pour une cellule (col, row) de la TRAME.
 * Rangées de cadre en liseré or ponctué de mélanine ; à l'intérieur, le pas
 * s'inverse une rangée sur deux → chevrons, comme le tissage Ashanti réel.
 */
export function weftThreadIndex(col: number, row: number, rows: number): number {
  if (row === 0 || row === rows - 1) return col % 5 === 0 ? 4 : 0;
  const dir = row % 2 === 0 ? 1 : -1;
  return (((row + col * dir) % 6) + 6) % 6;
}

/** Chaîne — cycle or / mélanine avec accents bissap et baobab. */
export function warpThreadIndex(col: number): number {
  const WARP = [0, 4, 0, 1, 0, 4, 0, 2];
  return WARP[((col % WARP.length) + WARP.length) % WARP.length];
}

/** Catégorie boutique → fil mis en avant dans la bande (−1 = aucun). */
export function categoryThread(cat: string): number {
  switch (cat) {
    case "serum":
      return 1; // bissap
    case "creme":
      return 3; // karité
    case "huile":
      return 0; // or
    case "gommage":
      return 5; // sunset
    case "masque":
      return 2; // baobab
    case "savon":
      return 4; // mélanine
    default:
      return -1;
  }
}

/* ───────────────────────── Refs mutables (pattern Phase A/D) ─────────────────────────
   La carte écrit, la scène ne fait que LIRE — la progression du tissage est
   possédée par la scène elle-même (weaveKey comparé, lecture seule). */

export interface WeaveRefs {
  /** index du fil mis en avant (−1 = aucun) */
  highlight: { index: number };
}

export function createWeaveRefs(): WeaveRefs {
  return { highlight: { index: -1 } };
}
