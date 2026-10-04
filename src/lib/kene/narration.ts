// Kènè — narration vocale des diagnostics (TTS): texte parlé ≤ 950 caractères.
// Lib PURE (aucune dépendance React) — consommée par VoiceNarration (client).
// Les nombres passent en toutes lettres: les moteurs TTS lisent plus
// fiablement « soixante-deux » que « 62 », et la cible non-lectrice
// n'a pas besoin de lire l'écran, seulement d'écouter.
import type { DiagnosisResult } from "./types";

/** Budget max (marge sous la limite SDK de 1024 chars par requête) */
export const NARRATION_MAX = 950;

/* ───────── Nombres 0-100 en toutes lettres ───────── */
const U = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const T: Record<number, string> = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante" };

export function numberToFrench(n: number): string {
  if (!Number.isFinite(n)) return "zéro";
  const v = Math.round(Math.abs(n));
  const sign = n < 0 ? "moins " : "";
  if (v <= 19) return sign + U[v];
  if (v === 100) return sign + "cent";
  if (v < 60) {
    const d = Math.floor(v / 10);
    const r = v % 10;
    return sign + T[d] + (r === 1 ? " et un" : r > 0 ? "-" + U[r] : "");
  }
  if (v < 80) {
    const r = v - 60;
    if (r === 0) return sign + "soixante";
    if (r === 1) return sign + "soixante et un";
    if (r === 11) return sign + "soixante et onze";
    return sign + "soixante-" + U[r];
  }
  const r = v - 80;
  if (r === 0) return sign + "quatre-vingts";
  return sign + "quatre-vingt-" + U[r];
}

/* ───────── Verdict parlé (mêmes seuils que l'UI) ───────── */
function verdictWord(score: number): string {
  if (score >= 80) return "Excellente santé de peau.";
  if (score >= 60) return "Bon équilibre général.";
  if (score >= 40) return "Quelques points à surveiller.";
  return "Ta peau a besoin de soin.";
}

/* Niveau parlé d'une priorité (bas = prioritaire — pourcentage = score santé) */
function levelWord(pct: number): string {
  if (pct < 45) return "à surveiller de près";
  if (pct < 65) return "à améliorer";
  if (pct < 85) return "léger";
  return "très bien";
}

/** Coupe un paragraphe à la fin de la dernière phrase complète ≤ max chars. */
function clipSentences(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const dot = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  const end = dot >= max * 0.5 ? dot + 1 : cut.trimEnd().length; // pas de phrase? coupe net
  return cut.slice(0, end).trim();
}

/** Hash FNV-1a 32 bits (clé de cache, client & serveur) */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

const ORDINALS = ["Première priorité", "Deuxième priorité", "Troisième priorité"];

/** Langue de narration parlée disponible (Français naturel haute fidélité) */
export const NARRATION_LANGS = [
  { code: "fr", label: "Français" },
] as const;

export type NarrationLang = "fr";

/**
 * Narration COURTE (≤ 420 chars) pour les langues locales:
 * l'essentiel oralisable — score, verdict, priorité n°1, un geste,
 * orientation dermato, avertissement. Les traductions locales portent
 * sur ce texte compact (plus fiable + moins coûteux).
 */
export function buildNarrationCompact(result: DiagnosisResult, opts?: { userName?: string }): string {
  const name = (opts?.userName ?? "").trim().split(/\s+/)[0] ?? "";
  const hello = name ? `Bonjour ${name}.` : "Bonjour.";
  const blocks: string[] = [`${hello} Voici ton diagnostic en résumé.`];

  blocks.push(`Ton score est de ${numberToFrench(result.score_global)} sur cent. ${verdictWord(result.score_global)}`);

  const weakest = [...result.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage).find((ind) => ind.pourcentage < 85);
  if (weakest) blocks.push(`La priorité : ${weakest.nom}, ${levelWord(weakest.pourcentage)}.`);

  if (result.orientation_dermato) blocks.push("Important : une consultation dermatologique est conseillée.");

  const matin = (result.recommandations.routine_matin ?? [])[0];
  if (matin) blocks.push(`Le matin : ${clipSentences(matin, 110)}`);
  const soir = (result.recommandations.routine_soir ?? [])[0];
  if (soir) blocks.push(`Le soir : ${clipSentences(soir, 110)}`);

  blocks.push("Kènè est un outil d'éducation beauté, pas un avis médical.");

  const parts: string[] = [];
  let used = 0;
  for (const b of blocks) {
    if (b.length === 0) continue;
    if (used + b.length + 1 <= 420 || parts.length === 0) {
      parts.push(b);
      used += b.length + 1;
    } else if (420 - used > 60) {
      parts.push(clipSentences(b, 420 - used - 1));
      break;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Construit le texte parlé du diagnostic: score, verdict, 3 priorités,
 * résumé des conseils, 1 geste matin + soir, orientation dermato,
 * botaniques, avertissement — assemblés par priorité décroissante
 * dans le budget NARRATION_MAX.
 */
export function buildNarration(result: DiagnosisResult, opts?: { userName?: string }): string {
  const name = (opts?.userName ?? "").trim().split(/\s+/)[0] ?? "";
  const hello = name ? `Bonjour ${name}.` : "Bonjour.";
  const intro = `${hello} Voici la lecture vocale de ton diagnostic.`;

  const blocks: string[] = [intro];

  // 1. Score + verdict (toujours)
  blocks.push(`Ton score global est de ${numberToFrench(result.score_global)} sur cent. ${verdictWord(result.score_global)}`);

  // 2. Les 3 priorités (les indicateurs les plus faibles = score santé le plus bas)
  const weakest = [...result.indicateurs]
    .sort((a, b) => a.pourcentage - b.pourcentage)
    .slice(0, 3)
    .filter((ind) => ind.pourcentage < 85);
  if (weakest.length > 0) {
    blocks.push(
      weakest.map((ind, i) => `${ORDINALS[i] ?? "Priorité"} : ${ind.nom}, ${levelWord(ind.pourcentage)}.`).join(" ")
    );
  }

  // 3. Orientation dermato — mot la plus importante après le score
  if (result.orientation_dermato) {
    const raison = clipSentences(result.raison_orientation ?? "", 160);
    blocks.push(`Important : une consultation dermatologique est conseillée.${raison ? " " + raison : ""}`);
  }

  // 4. Résumé des conseils
  const resume = clipSentences((result.recommandations.resume ?? "").trim(), 260);
  if (resume) blocks.push(`L'essentiel des conseils : ${resume}`);

  // 5. Un geste matin + un geste soir
  const matin = (result.recommandations.routine_matin ?? [])[0];
  const soir = (result.recommandations.routine_soir ?? [])[0];
  if (matin) blocks.push(`Le matin : ${clipSentences(matin, 130)}`);
  if (soir) blocks.push(`Le soir : ${clipSentences(soir, 130)}`);

  // 6. Botaniques
  const botaniques = (result.recommandations.botaniques_conseillees ?? []).slice(0, 3);
  if (botaniques.length > 0) {
    blocks.push(`Les botaniques conseillées pour toi : ${botaniques.join(", ")}.`);
  }

  // 7. Avertissement (toujours si possible)
  blocks.push("Kènè est un outil d'éducation beauté. Cette lecture ne remplace pas un avis médical.");

  // Assemblage par budget: les blocs prioritaires d'abord, coupe à la fin de phrase
  const parts: string[] = [];
  let used = 0;
  for (const b of blocks) {
    if (b.length === 0) continue;
    if (used + b.length + 1 <= NARRATION_MAX || parts.length === 0) {
      parts.push(b);
      used += b.length + 1;
    } else {
      const remaining = NARRATION_MAX - used - 1;
      if (remaining > 60) parts.push(clipSentences(b, remaining));
      break;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
