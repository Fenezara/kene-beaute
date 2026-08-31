// Kènè — Skin Twin : mathématiques du Jumeau de Peau.
// Sculpture procédurale de la tête (bosses gaussiennes sur icosaèdre), projection
// des marqueurs du diagnostic (photo 2D → surface 3D par zone du corps), teintes
// mélanodermes Fitzpatrick, rapprochement marqueur ↔ indicateur.
// Toutes les fonctions sont pures → partagées par la scène 3D et le fallback SVG.

import * as THREE from "three";
import type { BodyZone, ZoneMark } from "@/lib/kene/types";

/* ───────────────────────── Palette & teintes ───────────────────────── */

/** Hex de sévérité 0→3 (baobab, or, sunset, bissap — identiques à la photo annotée). */
export const SEV_HEX = ["#3F7D3F", "#C8951E", "#E07A2B", "#8B1A3B"] as const;

/** Teintes mélanodermes du jumeau selon le phototype Fitzpatrick estimé. */
export const FITZ_SKIN: Record<string, string> = {
  IV: "#9C6B45",
  V: "#7A5233",
  VI: "#54382A",
};
export const DEFAULT_SKIN = "#7A5233";

/* ───────────────────────── Dimensions du buste ───────────────────────── */

export const HEAD_CENTER = new THREE.Vector3(0, 1.38, 0);
export const TORSO_CENTER = new THREE.Vector3(0, 0.55, 0);
export const TORSO_RADII = { x: 0.52, y: 0.46, z: 0.3 };
export const HAND = { x: 0.62, y: 0.42, z: 0.02, rx: 0.135, ry: 0.2, rz: 0.085 };

/* ───────────────────────── Sculpture de la tête ───────────────────────── */

/** Bosse gaussienne sur la sphère : k = 1 − cos(angle) ∈ [0, 2], centre normalisé. */
function bump(d: THREE.Vector3, cx: number, cy: number, cz: number, sigma: number): number {
  const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
  const k = 1 - Math.max(-1, Math.min(1, (d.x * cx + d.y * cy + d.z * cz) / len));
  return Math.exp(-(k * k) / (sigma * sigma));
}

const smooth01 = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * Rayon sculpté de la tête pour une direction unitaire `d`
 * (repère local : z+ = visage, y+ = sommet, x+ = joue droite du sujet).
 * Menton, arcade, orbites, arête nasale, pommettes, oreilles, lèvres — stylisé, jamais photoréaliste.
 */
export function headRadius(d: THREE.Vector3): number {
  let r = 0.5;
  r *= 1 + 0.05 * smooth01(d.y + 0.15) * smooth01((1 - d.z) * 0.9); // occiput plein
  const jaw = smooth01((-d.y - 0.05) / 0.7); // effilement mandibulaire
  r *= 1 - 0.2 * jaw * (0.5 + 0.5 * Math.abs(d.x));
  r += 0.055 * bump(d, 0, -0.88, 0.48, 0.1); // menton
  r += 0.026 * bump(d, 0, 0.3, 0.95, 0.16); // arcade sourcilière
  r -= 0.03 * (bump(d, 0.36, 0.18, 0.91, 0.075) + bump(d, -0.36, 0.18, 0.91, 0.075)); // orbites
  r += 0.06 * bump(d, 0, 0.03, 1, 0.055); // arête nasale
  r += 0.03 * (bump(d, 0.56, -0.16, 0.6, 0.1) + bump(d, -0.56, -0.16, 0.6, 0.1)); // pommettes
  r += 0.045 * (bump(d, 1, -0.06, 0.06, 0.075) + bump(d, -1, -0.06, 0.06, 0.075)); // oreilles
  r += 0.022 * bump(d, 0, -0.55, 0.83, 0.07); // lèvres
  return r;
}

/** Rayon d'un ellipsoïde de demi-axes (a, b, c) dans la direction unitaire `d`. */
export function torsoRadius(d: THREE.Vector3): number {
  const { x: a, y: b, z: c } = TORSO_RADII;
  return 1 / Math.sqrt((d.x / a) ** 2 + (d.y / b) ** 2 + (d.z / c) ** 2);
}

/* ───────────────────────── Projection des marqueurs ───────────────────────── */

const D2R = Math.PI / 180;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Direction unitaire depuis longitude/latitude degrés (z+ = devant). */
export function sphDir(lonDeg: number, latDeg: number): THREE.Vector3 {
  const lon = lonDeg * D2R;
  const lat = latDeg * D2R;
  return new THREE.Vector3(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat));
}

/**
 * Position 3D d'un marqueur : la photo de la zone (x, y en %) est projetée sur la
 * région anatomique correspondante du buste. Chaque zone a sa fenêtre angulaire.
 */
export function markerPosition(zone: BodyZone, x: number, y: number): THREE.Vector3 {
  switch (zone) {
    case "visage": {
      const d = sphDir(lerp(-52, 52, x / 100), lerp(38, -68, y / 100));
      return d.multiplyScalar(headRadius(d) * 1.04).add(HEAD_CENTER);
    }
    case "barbe": {
      const d = sphDir(lerp(-40, 40, x / 100), lerp(-20, -72, y / 100));
      return d.multiplyScalar(headRadius(d) * 1.05).add(HEAD_CENTER);
    }
    case "cuir_chevelu": {
      const d = sphDir(lerp(-55, 55, x / 100), lerp(42, 84, y / 100));
      return d.multiplyScalar(headRadius(d) * 1.05).add(HEAD_CENTER);
    }
    case "dos": {
      const d = sphDir(lerp(232, 128, x / 100), lerp(34, -62, y / 100));
      return d.multiplyScalar(torsoRadius(d) * 1.05).add(TORSO_CENTER);
    }
    case "mains": {
      const left = x < 50;
      const d = sphDir(((x % 50) / 50) * 360, lerp(52, -58, y / 100));
      return new THREE.Vector3(
        (left ? -HAND.x : HAND.x) + d.x * HAND.rx,
        HAND.y + d.y * HAND.ry,
        HAND.z + d.z * HAND.rz,
      );
    }
    case "naevi":
    default: {
      const d = sphDir(lerp(-62, 62, x / 100), lerp(55, -68, y / 100));
      return d.multiplyScalar(torsoRadius(d) * 1.05).add(TORSO_CENTER);
    }
  }
}

/** Projection 2D (viewBox 100×110) d'un marqueur pour le fallback SVG statique. */
export function fallbackXY(zone: BodyZone, x: number, y: number): [number, number] {
  switch (zone) {
    case "visage":
    case "barbe":
    case "cuir_chevelu":
      return [50 + (x - 50) * 0.38, 34 + (y - 50) * 0.46];
    case "mains":
      return [(x < 50 ? 24 : 76) + ((x % 50) / 50) * 8 - 4, 88 + (y - 50) * 0.22];
    default:
      return [50 + (x - 50) * 0.55, 88 + (y - 50) * 0.36];
  }
}

/* ───────────────────────── Types & assemblage ───────────────────────── */

export interface TwinIndicator {
  nom: string;
  pourcentage: number;
  note?: string;
}

export interface TwinEntry {
  id: string;
  zone: BodyZone;
  score: number;
  fitz?: string;
  marks: ZoneMark[];
  date?: string;
  indicators?: TwinIndicator[];
}

export interface TwinMarker {
  key: string;
  label: string;
  sev: number;
  zone: BodyZone;
  diagId: string;
  x: number;
  y: number;
  pos: [number, number, number];
}

export function buildMarkers(entries: TwinEntry[]): TwinMarker[] {
  const out: TwinMarker[] = [];
  for (const e of entries) {
    for (let i = 0; i < e.marks.length; i++) {
      const m = e.marks[i];
      const p = markerPosition(e.zone, m.x, m.y);
      out.push({
        key: `${e.id}-${i}`,
        label: m.label,
        sev: Math.min(3, Math.max(0, m.severite)),
        zone: e.zone,
        diagId: e.id,
        x: m.x,
        y: m.y,
        pos: [p.x, p.y, p.z],
      });
    }
  }
  return out;
}

/* ───────────────────────── Marqueur ↔ indicateur ───────────────────────── */

const normWords = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Rapprochement flou (mots-clés, tolérance pluriels) entre un marqueur et les indicateurs. */
export function matchIndicator(label: string, indicators: TwinIndicator[] | undefined): TwinIndicator | null {
  if (!indicators?.length) return null;
  const wl = normWords(label);
  if (wl.length === 0) return null;
  let best: { score: number; ind: TwinIndicator } | null = null;
  for (const ind of indicators) {
    const wi = normWords(ind.nom);
    let hits = 0;
    for (const w of wl) {
      const stem = w.length > 4 ? w.slice(0, 5) : w;
      if (wi.some((t) => t.startsWith(stem) || (t.length > 4 && stem.startsWith(t.slice(0, 5))))) hits++;
    }
    const score = hits / wl.length;
    if (!best || score > best.score) best = { score, ind };
  }
  return best && best.score >= 0.34 ? best.ind : null;
}

/* ───────────────────────── État de rotation (drag) ───────────────────────── */

export interface DragState {
  down: boolean;
  dragged: boolean;
  rotY: number;
  rotX: number;
  velY: number;
  idle: number;
  lastX: number;
  lastY: number;
  moved: number;
}

/** rotY initial = vue 3/4 légère (plus sculptural qu'une vue frontale). */
export function createDragState(): DragState {
  return { down: false, dragged: false, rotY: 0.45, rotX: 0.03, velY: 0, idle: 99, lastX: 0, lastY: 0, moved: 0 };
}
