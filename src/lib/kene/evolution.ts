// Kènè — Le Fil du Temps: évolution des indicateurs + projection indicative.
// Lib PURE (aucune dépendance three/react) — partagée par l'API (serveur) et
// l'UI (client). La projection est une SIMULATION NON MÉDICALE: cinétique par
// famille d'indicateur (renouvellement cutané mélanoderme), adhérence à la
// routine, horizon plafonné à 12 semaines.

export const PROJECT_WEEKS_MAX = 12;

export type Adherence = "pleine" | "partielle";

/** Facteur d'adhérence (routine intégrale vs irrégulière) sur la cinétique. */
export const ADHERENCE_FACTOR: Record<Adherence, number> = {
  pleine: 1,
  partielle: 0.55,
};

/* ───────────────────────── Normalisation ───────────────────────── */

/** Clé normalisée d'un nom d'indicateur (accents/ponctuation/pluriels tolérés). */
export const normKey = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ───────────────────────── Types publics ───────────────────────── */

export interface EvolutionPoint {
  date: string; // ISO
  value: number; // score santé 0-100 (plus haut = mieux)
  zone: string;
  diagId: string;
}

export interface IndicatorSeries {
  key: string; // normKey du libellé
  label: string; // libellé le plus récent
  points: EvolutionPoint[];
  first: number;
  last: number;
  delta: number;
}

export interface ScorePoint {
  date: string;
  value: number;
  zone: string;
}

export interface EvolutionData {
  count: number; // diagnostics terminés
  firstAt: string | null;
  lastAt: string | null;
  series: IndicatorSeries[];
  scores: ScorePoint[];
}

export interface EvolutionRow {
  id: string;
  zone: string;
  scoreGlobal: number;
  resultJson: string;
  createdAt: Date | string;
}

/* ───────────────────────── Historique → séries ───────────────────────── */

interface ParsedResult {
  score_global: number;
  indicateurs: { nom: string; pourcentage: number }[];
}

function parseRow(row: EvolutionRow): ParsedResult | null {
  try {
    const r = JSON.parse(row.resultJson) as ParsedResult;
    if (typeof r?.score_global !== "number" || !Array.isArray(r?.indicateurs)) return null;
    return r;
  } catch {
    return null;
  }
}

/**
 * Agrège l'historique des diagnostics en séries temporelles par indicateur
 * (fusion floue via normKey — le VLM varie légèrement les libellés d'un scan à
 * l'autre) + la série du score global. Chronologie croissante.
 */
export function buildEvolution(rows: EvolutionRow[]): EvolutionData {
  const pts = rows
    .map((row) => ({ row, parsed: parseRow(row), at: new Date(row.createdAt) }))
    .filter((x) => !Number.isNaN(x.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const scores: ScorePoint[] = pts.map(({ row, at }) => ({
    date: at.toISOString(),
    value: row.scoreGlobal,
    zone: row.zone,
  }));

  const map = new Map<string, IndicatorSeries>();
  for (const { row, parsed, at } of pts) {
    if (!parsed) continue;
    for (const ind of parsed.indicateurs) {
      if (typeof ind?.pourcentage !== "number") continue;
      const key = normKey(ind.nom ?? "");
      if (!key) continue;
      let s = map.get(key);
      if (!s) {
        s = { key, label: ind.nom, points: [], first: ind.pourcentage, last: ind.pourcentage, delta: 0 };
        map.set(key, s);
      }
      s.label = ind.nom; // libellé le plus récent
      s.points.push({ date: at.toISOString(), value: ind.pourcentage, zone: row.zone, diagId: row.id });
      s.last = ind.pourcentage;
    }
  }

  const series = [...map.values()]
    .map((s) => ({ ...s, delta: s.last - s.first }))
    .sort((a, b) => b.points.length - a.points.length || Math.abs(b.delta) - Math.abs(a.delta));

  return {
    count: pts.length,
    firstAt: pts[0]?.at.toISOString() ?? null,
    lastAt: pts[pts.length - 1]?.at.toISOString() ?? null,
    series,
    scores,
  };
}

/* ───────────────────────── Projection indicative ───────────────────────── */

/** Cinétique par famille (λ/semaine + gain plafonné) — heuristiques mélanoderme. */
const CAT_RATES: { re: RegExp; lambda: number; gain: number }[] = [
  { re: /(pih|tache|pigment|melas|lentigo|uniform)/, lambda: 0.15, gain: 34 }, // renouvellement lent
  { re: /(acne|imperfection|sebum|pore|comedon|noire|brillance)/, lambda: 0.3, gain: 40 },
  { re: /(hydrat|secher|barriere|cendre|ashy|tiraille)/, lambda: 0.38, gain: 38 },
  { re: /(eclat|radiance|teint|terne|luminos)/, lambda: 0.28, gain: 27 },
  { re: /(ride|rugin|fermet|age|collagen|elastic)/, lambda: 0.13, gain: 22 },
  { re: /(cicatrice|cheloi|grain|marque|vergeture)/, lambda: 0.11, gain: 18 },
  { re: /(rougeur|inflammation|sensib|reactiv|cerne)/, lambda: 0.22, gain: 30 },
];
const DEFAULT_RATE = { lambda: 0.2, gain: 30 };

function catOf(normalizedLabel: string): { lambda: number; gain: number } {
  for (const c of CAT_RATES) if (c.re.test(normalizedLabel)) return c;
  return DEFAULT_RATE;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth01 = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/**
 * Projection indicative d'un score santé (0-100) après `weeks` de routine
 * (facteur d'adhérence appliqué à la cinétique). Simulation non médicale.
 */
export function projectPct(p0: number, weeks: number, adherence: number, label = ""): number {
  const w = clamp(weeks, 0, PROJECT_WEEKS_MAX);
  const a = clamp(adherence, 0.2, 1.4);
  const { lambda, gain } = catOf(normKey(label));
  const target = Math.min(96, p0 + gain * (p0 < 50 ? 1 : 0.6));
  const k = 1 - Math.exp(-lambda * w * a);
  return Math.round(clamp(p0 + (target - p0) * k, 0, 100));
}

/** Sévérité indicative 0-3 depuis un score santé (≥80 → 0 … <30 → 3). */
export function pctToSev(p: number): number {
  return p >= 80 ? 0 : p >= 55 ? 1 : p >= 30 ? 2 : 3;
}

/**
 * Sévérité projetée d'un marqueur du jumeau (valeur continue — le slider
 * temporel interpole sans à-coups). Modèle hybride: si l'indicateur lié devient
 * sain (≥ 80), le marqueur guérit; sinon il s'estompe au prorata du gain
 * relatif de l'indicateur ((proj − pct) / (96 − pct)) — jamais d'aggravation.
 * Sans indicateur lié: décroissance douce.
 */
export function projectMarkerSev(
  sev: number,
  pct: number | null | undefined,
  weeks: number,
  adherence: number,
  label = "",
): number {
  const w = clamp(weeks, 0, PROJECT_WEEKS_MAX);
  let target: number;
  if (pct != null) {
    const proj = projectPct(pct, w, adherence, label);
    target =
      pctToSev(proj) <= 0
        ? 0
        : sev * (1 - Math.min(0.85, Math.max(0, (proj - pct) / Math.max(1, 96 - pct))));
  } else {
    target = Math.min(sev, sev * 0.2);
  }
  target = Math.min(target, sev);
  return clamp(sev + (target - sev) * smooth01(w / PROJECT_WEEKS_MAX), 0, 3);
}

/* ───────────────────────── Géométrie SVG partagée ───────────────────────── */

/** Chemin lissé Catmull-Rom → cubiques Bézier (usage SVG, zéro dépendance). */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/* ───────────────────────── Petites couleurs partagées ───────────────────────── */

/** Couleur de sévérité depuis un score santé (baobab → or → sunset → bissap). */
export function valueColorHex(v: number): string {
  return ["#3F7D3F", "#C8951E", "#E07A2B", "#8B1A3B"][pctToSev(v)] as string;
}

/** Interpolation hex (fallback SVG — pas de dépendance three ici). */
export function lerpHex(a: string, b: string, t: number): string {
  const k = clamp(t, 0, 1);
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
  const g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
  const bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
