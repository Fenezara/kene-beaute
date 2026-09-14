// Kènè — Fil de Kente: partition du récit d'introduction immersive.
// Ranges de progression globale p ∈ [0,1] partagés entre le canvas 3D (Intro3D)
// et les overlays HTML (KenteIntro). Copie = UX Writer (ton intime, tutoiement).
// L'état persisté (déjà vue?) vit dans./introState (useSyncExternalStore).

export type OverlayPos = "center" | "left-low" | "top" | "bottom" | "right-low";

export interface ChapterDef {
  id: string;
  from: number;
  to: number;
  overline: string;
  title: string;
  sub: string;
  pos: OverlayPos;
}

/** 6 chapitres — la traversée fait ~6,4 écrans de défilement. */
export const CHAPTERS: ChapterDef[] = [
  {
    id: "prologue",
    from: 0.0,
    to: 0.12,
    overline: "Rituel d'accueil",
    title: "La beauté mélanoderme, enfin comprise.",
    sub: "Laisse-toi porter. Six chapitres, un fil : le tien.",
    pos: "center",
  },
  {
    id: "fil",
    from: 0.12,
    to: 0.34,
    overline: "Chapitre I — Le fil",
    title: "Ta peau a une histoire.",
    sub: "Un fil d'or, le tien. Chaque soin, chaque geste : un croisement de plus dans la trame.",
    pos: "left-low",
  },
  {
    id: "jardin",
    from: 0.34,
    to: 0.56,
    overline: "Chapitre II — Le jardin",
    title: "La matière vient d'ici.",
    sub: "Baobab · Moringa · Karité — des botaniques africaines choisies pour les mélanines.",
    pos: "top",
  },
  {
    id: "fitz",
    from: 0.56,
    to: 0.74,
    overline: "Chapitre III — La carnation",
    title: "IV · V · VI",
    sub: "Ici, ta carnation n'est pas une marge de marché. C'est la norme.",
    pos: "bottom",
  },
  {
    id: "scan",
    from: 0.74,
    to: 0.9,
    overline: "Chapitre IV — L'écho",
    title: "Une IA qui lit ta peau.",
    sub: "Diagnostic multi-zones calibré Fitzpatrick IV–VI. Les mélanines enfin comprises.",
    pos: "right-low",
  },
  {
    id: "kente",
    from: 0.9,
    to: 1.0,
    overline: "Le kente est tissé",
    title: "Deviens la tisseuse de ta beauté.",
    sub: "2 minutes · Diagnostic IA offert",
    pos: "center",
  },
];

/** Keyframes caméra (position + point visé) interpolées sur la progression. */
export const CAM: { at: number; pos: [number, number, number]; look: [number, number, number] }[] = [
  { at: 0.0, pos: [0, 0.3, 10.5], look: [0, 0, 0] },
  { at: 0.12, pos: [0.6, 0.5, 6.8], look: [0, 0.2, 0] },
  { at: 0.34, pos: [-0.9, 0.4, 7.2], look: [0, 0.1, -0.5] },
  { at: 0.56, pos: [0, 0.1, 7.4], look: [0, 0.3, -1.2] },
  { at: 0.74, pos: [0, 0.15, 6.2], look: [0, 0.05, 0] },
  { at: 0.9, pos: [0, 1.15, 7.6], look: [0, 0.35, -0.6] },
  { at: 1.0, pos: [0, 1.05, 7.0], look: [0, 0.35, -0.6] },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface ChapterT {
 /** 0→1 à l'intérieur du chapitre */
  local: number;
 /** fondu d'entrée individuel 0→1 */
  inT: number;
 /** fondu de sortie individuel 0→1 */
  outT: number;
 /** visibilité combinée 0→1 (min des deux) */
  vis: number;
}

/** Position dans un chapitre avec marges de fondu (en fraction du chapitre).
 * fadeIn/fadeOut = 0 → pas de fondu correspondant (visible dès le début / jusqu'à la fin). */
export function chapterT(p: number, from: number, to: number, fadeIn = 0.25, fadeOut = 0.25): ChapterT {
  const local = clamp01((p - from) / (to - from));
  const inT = fadeIn <= 0.001 ? 1 : clamp01(local / fadeIn);
  const outT = fadeOut <= 0.001 ? 1 : clamp01((1 - local) / fadeOut);
  return { local, inT, outT, vis: Math.min(inT, outT) };
}

export const easeInOut = (t: number) => smooth(clamp01(t));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
