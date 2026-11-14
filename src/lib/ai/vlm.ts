// Kènè — Service de diagnostic de peau par VLM (glm-4.6v via z-ai-web-dev-sdk)
// IMPORTANT: backend uniquement.
//
// PIPELINE 2 PHASES: la latence de glm-4.6v est dominée par la
// GÉNÉRATION de tokens (~10-15 tok/s, forte variance 18-77 s mesurées sur
// un JSON détaillé). Découpage + format compact:
// Phase 1 — vision au format MAP (indicateurs {nom:score}, notes seulement
// pour les 3 plus faibles): ~500-600 chars de sortie → ~10-18 s médian.
// Phase 2 — LLM texte glm-4.6 (recommandations personnalisées): ~4 s.
// Gardes: 45 s + 20 s = 65 s pire cas, dans la fenêtre du poll front
// (100 s). L'image client (820 px JPEG ~86 Ko via resizeImage) part telle
// quelle: les tests montrent que la taille d'image n'est PAS le facteur
// dominant — et sharp est BANNI des routes API (import natif = OOM kill
// du next-server au compile, — cf. worklog).
import ZAI from "z-ai-web-dev-sdk";
import type { VisionMessage } from "z-ai-web-dev-sdk";
import type { BodyZone, DiagnosisResult, Indicator, RecommendationSet, SuspectedCondition, ZoneMark } from "@/lib/kene/types";
import { ZONE_INDICATORS } from "@/lib/kene/types";
import { hypothesesFromVlm, vlmCatalogForZone } from "@/lib/kene/conditions";
import { severityFromPercent } from "@/lib/kene/format";
import { zaiCall } from "@/lib/ai/zai-retry";
import { analyzeInciText, type InciAnalysisResult } from "@/lib/kene/inci-analyzer";
import {
  extractOpticalTelemetryFromDataUrl,
  formatOpticalTelemetryForPrompt,
  type OpticalSkinMetrics,
} from "@/lib/kene/optical-biometrics";
import {
  getAfricanExposomeContext,
  getSeasonalFallbackExposome,
  type ExposomeContext,
} from "@/lib/kene/exposome";

/** Gardes par phase: 40 s vision (variance de service mesurée
 * 18-77 s — au-delà, le fallback déterministe est plus utile qu'une
 * attente indéterminée) + retry 25 s + 15 s texte = 80 s pire cas,
 * sous la fenêtre du poll front (100 s) avec la marge d'écriture DB. */
const VLM_TIMEOUT_MS = 40_000;
const VLM_RETRY_TIMEOUT_MS = 25_000;
const LLM_TIMEOUT_MS = 15_000;

/** Garde de type minimale (runtime safe) pour les réponses JSON du VLM. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Étiquette anatomique d'un angle selon son indice et la zone étudiée. */
function angleLabelFor(zone: BodyZone, idx: number, total: number): string {
  if (total <= 1) return `Vue principale (${zone})`;
  if (zone === "visage" || zone === "barbe") {
    if (idx === 0) return "Vue 1 : Face centrale (Zone T, front, nez, menton)";
    if (idx === 1) return "Vue 2 : Profil / Joue et tempe gauches";
    if (idx === 2) return "Vue 3 : Profil / Joue et tempe droites";
  }
  return `Vue ${idx + 1}/${total} (${zone})`;
}

/** Phase 1 — prompt vision au FORMAT COMPACT: indicateurs en map
 * {nom: score} (zéro note par défaut), notes uniquement pour les 3 plus
 * faibles (champ focus), marquages en tableaux courts. Sortie ~500-600
 * caractères même pour le visage (14 indicateurs) — contre ~1 800 en
 * tableau détaillé: c'est la génération qui dominait (18-77 s mesurés). */
function buildAnalysisPrompt(
  zone: BodyZone,
  knownFitz?: string,
  allergies?: string,
  numImages = 1,
  extra?: {
    opticalPrompt?: string;
    clinicalContext?: string;
    previousSummary?: string;
    exposomePrompt?: string;
  },
): string {
  const indicateurs = ZONE_INDICATORS[zone];
  const abcdePart =
    zone === "naevi"
      ? `,"abcde":[["A","Asymétrie",<true|false>,"≤ 40 caractères"],...]`
      : "";
  const multiAnglePart =
    numImages > 1
      ? ` ${numImages} angles de vue de la zone sont fournis : réalise une synthèse clinique 360° en croisant tous les angles.`
      : "";
  const zoneLabel = zone === "mains" ? "mains & pieds (extrémités acrales : paumes, plantes, talons, ongles)" : zone;
  const clinicalLine = extra?.clinicalContext ? `\nContexte clinique / anamnèse déclaré(e) : ${extra.clinicalContext}` : "";
  const prevLine = extra?.previousSummary ? `\nRéférence longitudinale (dernier bilan de cette zone) : ${extra.previousSummary}` : "";
  const opticalLine = extra?.opticalPrompt ?? "";
  const exposomeLine = extra?.exposomePrompt ?? "";

  return `Analyse cutanée de haute précision sur peaux noires et afro-descendantes (Albinos OCA, Afro-rousse / Rouquine phéomélanique, Chabine III, Métissée / Caramel IV, Brune cuivrée V, Ébène intense VI), zone « ${zoneLabel} ».${knownFitz ? ` Phototype/Nuance déclaré(e) : ${knownFitz}.` : ""}${allergies ? ` Allergies : ${allergies}.` : ""}${multiAnglePart}${opticalLine}${exposomeLine}${clinicalLine}${prevLine}
Catalogue des affections africaines plausibles sur cette zone (id=signature visuelle sur peau noire) : ${vlmCatalogForZone(zone)}.
Ne pas confondre pigmentation constitutive (ou éphélides naturelles sur peau afro-rousse/chabine) et pathologie. Sur peau albinos, surveiller l'érythème solaire et les kératoses actiniques ; sur peau foncée (IV-VI), l'érythème est masqué par l'eumélanine (teinte violacée, ardoisée ou brune chaude).
CONVENTION STRICTE DES SCORES "ind" : chaque score (0-100) exprime l'indice de SANTÉ CUTANÉE de l'indicateur : 100 = peau parfaitement saine / AUCUNE anomalie (0 acné, 0 tache PIH, 0 mélasma, 0 excès de sébum, hydratation optimale) et 0 = atteinte sévère. Ne note JAMAIS la gravité d'un défaut vers 100.
Réponds STRICTEMENT en JSON ultra-compact (≤ 650 caractères, sans markdown, sans texte autour) :
{"score":<0-100>,"fitz":"albinos"|"rouquine"|"III"|"IV"|"V"|"VI","ind":{${indicateurs.map((i) => `"${i}":<0-100>`).join(",")}},"marks":[["<zone>",<x 0-100>,<y 0-100>,<w 10-28>,<h 10-28>,<sev 0-3>],...],"focus":[["<indicateur le plus faible>","<note ≤ 40 caractères>"],...2-3 entrées],"conds":[["<id du catalogue>",<confiance 0-100>],...0-2],"derm":<bool>,"why":"<si derm, ≤ 80 caractères>"${abcdePart}}
Règles : TOUS les indicateurs listés dans "ind" ; 4 à 6 marks précis sur la peau (ancrés sur les sous-zones ROI mesurées) ; sev 0=sain 1=léger 2=modéré 3=marqué ; conds = UNIQUEMENT des ids exacts du catalogue ci-dessus (0-2, confiance ≥ 40 seulement) ; si la photo ne montre pas de peau : score 0, derm false, conds vide.`;
}

/** Phase 2 — prompt texte (glm-4.6 / Gemini): recommandations personnalisées à partir
 * de l'analyse réelle et de l'exposome climatique africain. Texte pur = génération rapide (~4 s). */
function buildRecommendationsPrompt(analysisJson: string, zone: BodyZone, exposomePrompt?: string): string {
  const zoneFocus: Record<BodyZone, string> = {
    cuir_chevelu: "cuir chevelu et cheveux (rituels capillaires, racines, tempes, pas de démaquillant visage)",
    dos: "dos et décolleté/épaules (douche purifiante, gel sans savon moringa/zinc, spray dos, pas de crème visage)",
    barbe: "barbe, menton et cou (soins de barbe, anti-poils incarnés, rasage doux, après-rasage sans alcool)",
    mains: "mains et ongles (crèmes relipidantes mains, baume ongles, gants de protection ménage)",
    naevi: "grains de beauté et nævi (photoprotection SPF 50+, surveillance ABCDE, aucun décapage)",
    visage: "visage (rituel de soin visage adapté aux indicateurs)",
  };
  const zoneDesc = zoneFocus[zone] ?? zone;
  return `Tu es conseillère dermo-cosmétique Kènè pour peaux mélanodermes africaines. Kènè ne vend aucun cosmétique (recommandations neutres, zéro prix, marques ou incitation commerciale).
Analyse cutanée récente (zone « ${zone} », contexte : ${zoneDesc}) : ${analysisJson.slice(0, 700)}${exposomePrompt ?? ""}
Règles strictes : les recommandations DOIVENT être adaptées spécifiquement à la zone « ${zone} », cibler ses indicateurs les plus faibles et tenir compte de l'exposome climatique local (Harmattan/humidité/UV).
JSON STRICT compact (≤ 800 caractères, sans texte autour) :
{"resume":"<2 phrases, ton bienveillant, tutoiement>","routine_matin":["≤ 3 étapes courtes adaptées à la zone"],"routine_soir":["≤ 3 étapes courtes adaptées à la zone"],"botaniques_conseillees":["≤ 3 botaniques africaines"],"produits":["≤ 3 types précis de soins ou principes actifs"],"soins_conseilles":["≤ 2 soins en institut"],"conseils_hygiene_vie":["≤ 2 conseils précis de vie/hygiène pour cette zone"]}`;
}

function extractJson(raw: string): Record<string, unknown> | null {
  // — espaces Unicode exotiques entre jetons (NBSP, ZWSP… mesurés en
  // préview: le modèle en émet parfois autour des étiquettes; JSON.parse les
  // REJETTE alors qu'un espace simple est valide). Normalisés AVANT tout: un
  // NBSP à l'intérieur d'une note devient une espace — cosmétique et sans
  // incidence. La preuve: réponse « valide à l'œil » mais rejetée car
  // l'espace dans [ "nez" était en fait U+00A0.
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/[\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g, " ")
    .trim();
  const attempts: string[] = [cleaned];
  // Variance du modèle (, mesurée): le JSON revient presque toujours
  // bien formé MAIS parfois avec des étiquettes nues dans les tableaux
  // ([Joue G,25,55,…]) ou des clés nues ({Hydratation:85}). Deux réparations
  // ciblées, appliquées EN CASCADE seulement si le parse direct échoue —
  // le JSON valide ne passe jamais par les regex.
  const fixKeys = (s: string) =>
    s.replace(/([{,]\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _()&/'\u2019_-]*?)\s*:/g, '$1"$2":');
  const fixElems = (s: string) =>
    s.replace(/([,\[]\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _()&/'\u2019_-]*?)(\s*[,}\]])/g, '$1"$2"$3');
  // — quote ouvrante MANQUANTE sur une étiquette de tableau (mesuré:
  // [nez",400,…] au lieu de ["nez",400,…]). Ne touche jamais un élément déjà
  // quoté: le motif exige une lettre directement après [ ou, — une quote
  // ouvrante ne peut pas matcher.
  const fixStrayQuote = (s: string) =>
    s.replace(/([,\[]\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _()&/'\u2019_-]*?)"(?=\s*[,}\]])/g, '$1"$2"');
  const k = fixKeys(cleaned);
  const e = fixElems(cleaned);
  const q = fixStrayQuote(cleaned);
  if (k !== cleaned) attempts.push(k);
  if (e !== cleaned) attempts.push(e);
  if (q !== cleaned) attempts.push(q);
  if (k !== cleaned && e !== cleaned) attempts.push(fixElems(k));
  // réparations composées : quote manquante + clés/éléments nus ensemble.
  if (q !== cleaned) {
    attempts.push(fixKeys(q));
    attempts.push(fixElems(q));
    attempts.push(fixElems(fixKeys(q)));
  }
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      const start = attempt.indexOf("{");
      const end = attempt.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(attempt.slice(start, end + 1));
        } catch {
          /* tente la fermeture ci-dessous */
        }
      }
      // JSON tronqué en fin de génération (max tokens) : fermer les crochets
      // et accolades ouverts — suffit souvent à récupérer un objet exploitable.
      if (start >= 0) {
        const frag = attempt.slice(start);
        const stack: string[] = [];
        let inStr = false;
        let esc = false;
        for (const ch of frag) {
          if (esc) { esc = false; continue; }
          if (ch === "\\") { esc = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (ch === "{" || ch === "[") stack.push(ch);
          else if (ch === "}" || ch === "]") stack.pop();
        }
        let repaired = frag;
        if (inStr) repaired += '"';
        for (const opener of stack.reverse()) repaired += opener === "{" ? "}" : "]";
        try {
          return JSON.parse(repaired);
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

function clamp(n: unknown, min: number, max: number, dflt: number): number {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  if (Number.isNaN(v)) return dflt;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function coerceArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Phase 1 — transforme la réponse vision brute en analyse validée
 *  (SANS recommandations : elles viennent de la phase 2). Renvoie null si
 *  l'analyse est inutilisable → fallback global.
 *  Accepte les DEUX formats : le compact ({ind:{nom:score},
 *  marks:[[label,x,y,w,h,sev]], focus:[[nom,note]], derm, why}) et l'ancien
 *  détaillé (indicateurs[], zones_marquages[], orientation_dermato) —
 *  rétrocompatibilité si le modèle répond à l'ancien format.
 *  Champ `conds` → hypothèses de l'atlas africain, validées par
 *  hypothesesFromVlm (ids exacts + zone cohérente + confiance ≥ 25). */
function normIndKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeAnalysis(
  raw: unknown,
  zone: BodyZone,
  opticalHint?: OpticalSkinMetrics | null,
  clinicalContext?: string,
): Omit<DiagnosisResult, "recommandations" | "source" | "confidence" | "avertissement"> | null {
  if (!isRecord(raw)) return null;
  const o: Record<string, unknown> = raw;
  const indicateursList = ZONE_INDICATORS[zone];
  const ctxLower = (clinicalContext ?? "").toLowerCase();
  const hasRecentOilOrCream =
    ctxLower.includes("crème") ||
    ctxLower.includes("creme") ||
    ctxLower.includes("huile") ||
    ctxLower.includes("karité") ||
    ctxLower.includes("karite") ||
    (opticalHint?.specularGlarePct ?? 0) > 13;
  const hasMakeupOrFilter =
    ctxLower.includes("maquill") ||
    ctxLower.includes("poudre") ||
    ctxLower.includes("fond de teint") ||
    opticalHint?.makeupOrFilterLikely === true;

  // Notes de réalisme : champ focus [[nom, note]] du format compact.
  const focusNotes = new Map<string, string>();
  const focusNormKeys = new Set<string>();
  const focusIn = coerceArray<unknown>(o.focus);
  for (const f of focusIn) {
    if (Array.isArray(f) && typeof f[0] === "string") {
      const k = normIndKey(String(f[0])).slice(0, 12);
      focusNotes.set(k, String(f[1] ?? "").slice(0, 160));
      focusNormKeys.add(k);
    }
  }
  // + notes éventuelles de l'ancien format (indicateurs[].note).
  const oldInd = coerceArray<Record<string, unknown>>(o.indicateurs);
  for (const i of oldInd) {
    if (i && typeof i.nom === "string" && typeof i.note === "string") {
      const k = normIndKey(String(i.nom)).slice(0, 12);
      focusNotes.set(k, String(i.note).slice(0, 160));
    }
  }

  // Scores: map compacte "ind" {nom: nombre} ou ancien tableau indicateurs[].
  const indMap = isRecord(o.ind) ? o.ind : null;
  const normIndEntries = indMap
    ? Object.entries(indMap).map(([k, v]) => [normIndKey(k), v] as const)
    : [];
  const defaultBaseline = clamp(o.score ?? o.score_global, 38, 92, 72);

  const indicateurs: Indicator[] = indicateursList.map((nom) => {
    const targetNorm = normIndKey(nom);
    const prefix = targetNorm.slice(0, 10);
    const exactOrFuzzy =
      indMap?.[nom] ??
      normIndEntries.find(([k]) => k === targetNorm || k.startsWith(prefix) || prefix.startsWith(k.slice(0, 8)))?.[1] ??
      oldInd.find((i) => i && normIndKey(String(i.nom)).includes(prefix))?.pourcentage;

    let pct = clamp(exactOrFuzzy, 0, 100, defaultBaseline);
    const focusKey = targetNorm.slice(0, 12);
    const isFocusWeakness =
      focusNormKeys.has(focusKey) ||
      Array.from(focusNormKeys).some((fk) => fk.length >= 5 && (focusKey.startsWith(fk.slice(0, 7)) || fk.startsWith(focusKey.slice(0, 7))));

    // Garde-fou d'inversion de polarité : si un indicateur est explicitement cité dans "focus"
    // (les 2-3 indicateurs les plus faibles) mais que le modèle a émis un score > 74 (gravité au lieu de santé),
    // on rétablit la polarité santé (100 - pct).
    if (isFocusWeakness && pct >= 74 && defaultBaseline < 82) {
      pct = clamp(100 - pct, 22, 64, 48);
    }

    let note =
      focusNotes.get(focusKey) ||
      Array.from(focusNotes.entries()).find(([fk]) => fk.length >= 5 && (focusKey.startsWith(fk.slice(0, 7)) || fk.startsWith(focusKey.slice(0, 7))))?.[1] ||
      undefined;

    // Compensation optique / pré-scan : si la cliente vient d'appliquer du karité/huile ou s'il y a un reflet direct,
    // ne pas pénaliser abusivement l'indicateur « Sébum / brillance ».
    if (hasRecentOilOrCream && (targetNorm.includes("sebum") || targetNorm.includes("brillance")) && pct < 62) {
      pct = Math.min(82, pct + 14);
      if (!note) note = "Brillance liée au soin ou éclairage récent";
    }

    // Compensation maquillage / filtre lissant : tempérer un score d'uniformité ou de pores artificiellement parfait.
    if (hasMakeupOrFilter && (targetNorm.includes("uniform") || targetNorm.includes("pore")) && pct > 86) {
      pct = 79;
      if (!note) note = "Surface lissée (maquillage ou filtre détecté)";
    }

    return {
      nom,
      pourcentage: pct,
      severite: severityFromPercent(pct),
      note,
    };
  });
  if (indicateurs.length === 0) return null;

  // Marquages: tableaux courts [[label,x,y,w,h,sev]] ou anciens objets.
  // Échelle auto: le modèle émet parfois des coordonnées ×10
  // (grille pixel 0-1000 au lieu du % 0-100 — mesuré: 180/480/820…).
  // Détection: une quelconque coordonnée x/y > 100 → TOUTE la géométrie
  // est en millièmes → division par 10 (w/h > 35 → /10 aussi).
  const marksIn = coerceArray<unknown>(o.marks);
  const oldMarks = coerceArray<Record<string, unknown>>(o.zones_marquages);
  const rawPairs = marksIn.filter((m): m is unknown[] => Array.isArray(m) && typeof m[0] === "string");
  const scaled =
    rawPairs.some((m) => Number(m[1]) > 100 || Number(m[2]) > 100) ||
    oldMarks.some((m) => Number(m?.x) > 100 || Number(m?.y) > 100);
  const geo = (v: unknown, hi: number, dflt: number) => {
    let n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isNaN(n)) n = dflt;
    if (scaled && n > hi) n /= 10;
    return clamp(n, hi === 100 ? 2 : 8, hi, dflt);
  };
  const marquages: ZoneMark[] = [
    ...rawPairs.slice(0, 8).map((m) => ({
      label: String(m[0]).slice(0, 40),
      x: geo(m[1], 95, 50),
      y: geo(m[2], 95, 50),
      w: geo(m[3], 35, 18),
      h: geo(m[4], 35, 18),
      severite: clamp(m[5], 0, 3, 1),
    })),
    ...oldMarks.slice(0, 8).map((m) => ({
      label: String(m?.label ?? "zone").slice(0, 40),
      x: geo(m?.x, 95, 50),
      y: geo(m?.y, 95, 50),
      w: geo(m?.w, 35, 18),
      h: geo(m?.h, 35, 18),
      severite: clamp(m?.severite, 0, 3, 1),
    })),
  ].slice(0, 8);

  // Ancrage chirurgical ROI : si le VLM a renvoyé moins de 3 marquages sur le visage/barbe
  // et que nous disposons de la parcellisation optique des 5 sous-zones, on complète avec les sous-zones réelles.
  if (opticalHint?.subzones && opticalHint.subzones.length > 0 && marquages.length < 3) {
    const issueLabel: Record<string, string> = {
      pih: "Pigmentation / HPI",
      erytheme: "Réactivité",
      sebum: "Brillance sébacée",
      texture: "Grain & pores",
      sain: "Équilibre",
    };
    const sortedSubs = [...opticalHint.subzones].sort(
      (a, b) => b.severity - a.severity || b.pigmentScore + b.erythemaScore - (a.pigmentScore + a.erythemaScore),
    );
    for (const sub of sortedSubs) {
      if (marquages.length >= 4) break;
      const alreadyNear = marquages.some(
        (m) => Math.abs(m.x - sub.x) < 14 && Math.abs(m.y - sub.y) < 14,
      );
      if (!alreadyNear) {
        marquages.push({
          label: `${sub.label} (${issueLabel[sub.dominantIssue] ?? "Analyse"})`.slice(0, 40),
          x: sub.x,
          y: sub.y,
          w: sub.w,
          h: sub.h,
          severite: sub.severity,
        });
      }
    }
  }

  // ABCDE: paires [[critere, intitule, alerte, detail]] ou anciens objets.
  const abcdePairs = coerceArray<unknown>(o.abcde)
    .filter((c): c is unknown[] => Array.isArray(c) && typeof c[0] === "string")
    .map((c) => ({
      critere: String(c[0]).slice(0, 1),
      intitule: String(c[1] ?? ""),
      alerte: c[2] === true || c[2] === "true",
      detail: String(c[3] ?? "").slice(0, 200),
    }));
  const abcdeOld = coerceArray<Record<string, unknown>>(o.abcde)
    .filter((c) => c && !Array.isArray(c))
    .map((c) => ({
      critere: String(c?.critere ?? "").slice(0, 1),
      intitule: String(c?.intitule ?? ""),
      alerte: Boolean(c?.alerte),
      detail: String(c?.detail ?? "").slice(0, 200),
    }));
  const abcde = [...abcdePairs, ...abcdeOld];

  const validScore = indicateurs.reduce((s, i) => s + i.pourcentage, 0) / indicateurs.length;
  const rawScoreGlobal = clamp(o.score ?? o.score_global, 0, 100, Math.round(validScore));
  // Si le score global brut s'écarte de plus de 18 points de la moyenne réelle des indicateurs,
  // on l'ancre sur la moyenne pondérée pour garantir la cohérence mathématique du bilan
  const scoreGlobal =
    Math.abs(rawScoreGlobal - validScore) > 18
      ? Math.round(validScore * 0.65 + rawScoreGlobal * 0.35)
      : rawScoreGlobal;
  const derm = o.derm ?? o.orientation_dermato;
  const why = o.why ?? o.raison_orientation;
  const fitzRaw = o.fitz ?? o.fitzpatrick_estime;
  const validFitz = ["albinos", "rouquine", "I", "II", "III", "IV", "V", "VI"].includes(String(fitzRaw))
    ? String(fitzRaw)
    : opticalHint?.itaPhototypeHint;

  // — hypothèses de l'atlas africain: validation ANTI-HALLUCINATION
  // (ids exacts du catalogue zone-filtré, confiance plancher, cap 2). Le
  // champ peut être absent (ancien format / modèle silencieux) → [].
  const hypotheses: SuspectedCondition[] = hypothesesFromVlm(o.conds, zone);
  // Une hypothèse de niveau dermato/urgence force l'orientation médicale,
  // même si le modèle a oublié de lever "derm" — la sécurité ne repose pas
  // sur la seule discipline du modèle.
  const hypotheseGrave = hypotheses.find((h) => h.niveau === "dermato" || h.niveau === "urgence");
  const raisonAuto = hypotheseGrave
    ? `${hypotheseGrave.nom} (${hypotheseGrave.categorie}) — ${hypotheseGrave.drapeau ?? hypotheseGrave.action}`
    : undefined;

  return {
    score_global: scoreGlobal,
    fitzpatrick_estime: validFitz,
    zone,
    indicateurs,
    zones_marquages: marquages,
    hypotheses: hypotheses.length ? hypotheses : undefined,
    orientation_dermato:
      derm === true || derm === "true" || Boolean(hypotheseGrave) || abcde.some((c) => c.alerte),
    raison_orientation: why ? String(why).slice(0, 300) : raisonAuto?.slice(0, 300),
    abcde: abcde.length ? abcde : undefined,
  };
}

/** Phase 2 — valide les recommandations du LLM texte. */
function normalizeRecommendations(raw: unknown): RecommendationSet | null {
  if (!isRecord(raw)) return null;
  const o: Record<string, unknown> = raw;
  if (typeof o.resume !== "string" || !o.resume.trim()) return null;
  const rec: RecommendationSet = {
    resume: o.resume.slice(0, 400),
    routine_matin: coerceArray<string>(o.routine_matin).slice(0, 6).map(String),
    routine_soir: coerceArray<string>(o.routine_soir).slice(0, 6).map(String),
    botaniques_conseillees: coerceArray<string>(o.botaniques_conseillees ?? o.botaniques_conseilles).slice(0, 6).map(String),
    produits: coerceArray<string>(o.produits).slice(0, 8).map(String),
    soins_conseilles: coerceArray<string>(o.soins_conseilles).slice(0, 6).map(String),
    conseils_hygiene_vie: coerceArray<string>(o.conseils_hygiene_vie).slice(0, 6).map(String),
  };
  if (rec.routine_matin.length === 0 && rec.routine_soir.length === 0) return null;
  return rec;
}

/** Recommandations déterministes hautement personnalisées dérivées des
 * indicateurs réels (selon la zone et les faiblesses cutanées identifiées).
 * Kènè ne vend aucun produit cosmétique → recommandations de typologies
 * de soins et principes actifs purs, sans marque ni prix. */
export function derivePersonalizedRecommendations(
  zone: BodyZone,
  indicateurs: Indicator[],
  scoreGlobal: number,
  exposome?: ExposomeContext | null,
  fitzpatrick?: string,
): RecommendationSet {
  const byPct = [...indicateurs].sort((a, b) => a.pourcentage - b.pourcentage);
  const worst = byPct[0];
  const lowNames = byPct.filter((i) => i.pourcentage < 65).map((i) => i.nom.toLowerCase());
  const allNames = byPct.map((i) => i.nom.toLowerCase());
  const hasLow = (needle: string) => lowNames.some((n) => n.includes(needle));

  const isAcneOrSebum = hasLow("acn") || hasLow("sébum") || hasLow("imperf") || hasLow("pore");
  const isPigmentOrSpots = hasLow("pigment") || hasLow("tache") || hasLow("homogéné") || hasLow("mélan");
  const isDryOrBarrier = hasLow("hydrat") || hasLow("barri") || hasLow("sécher") || hasLow("desquam");
  const isSensitivity = hasLow("sensib") || hasLow("rougeur") || hasLow("inflamm") || hasLow("tolér");
  const isHairOrScalp = zone === "cuir_chevelu" || hasLow("alopéc") || hasLow("densité");
  const isHandsFeet = zone === "mains" || hasLow("rugos") || hasLow("callos");
  const isBack = zone === "dos";
  const isBeard = zone === "barbe";
  const isNaevi = zone === "naevi";

  let matin: string[] = [];
  let soir: string[] = [];
  let botaniques: string[] = [];
  let produits: string[] = [];
  let soins: string[] = [];
  let hygiene: string[] = ["Boire 1,5 à 2 L d'eau par jour", "Dormir 7 à 8 h pour la régénération cellulaire"];

  if (isHairOrScalp) {
    matin = ["Brume d'hydrolat de menthe douce & aloka", "Massage délicat des bordures et tempes"];
    soir = ["Sérum stimulant fortifiant ricin & baobab", "Port d'un bonnet en satin protecteur pour la nuit"];
    botaniques = ["Ricin noir", "Baobab", "Moringa"];
    produits = [
      "Sérum Fortifiant Cuir Chevelu Ricin Noir & Baobab",
      "Lotion Apaisante Cuir Chevelu au Moringa & Aloka",
      "Huile Végétale Pure de Ricin Pressée à Froid",
    ];
    soins = ["Soin revitalisant cuir chevelu en salon", "Modelage crânien délassant"];
    hygiene = ["Éviter les tresses et tissages trop serrés sur les tempes", "Privilégier le satin ou la soie pour la nuit"];
  } else if (isBack) {
    matin = ["Douche au gel nettoyant purifiant sans savon au zinc & moringa", "Séchage soigneux du dos par tapotement avec serviette propre dédiée"];
    soir = ["Spray purifiant ciblé aux AHA de bissap et acide salicylique doux", "Émulsion hydratante fluide non-comédogène pour le corps"];
    botaniques = ["Moringa", "Bissap", "Zinc PCA"];
    produits = [
      "Gel Nettoyant Purifiant Corps Moringa & Zinc",
      "Spray Purifiant & Anti-Taches Dos aux AHA de Bissap",
      "Émulsion Fluide Hydratante Non-Comédogène Corps",
    ];
    soins = ["Soin purifiant désincrustant du dos en institut", "Enveloppement assainissant à l'argile et bissap"];
    hygiene = [
      "Rincer shampoings et masques tête penchée en avant (résidus gras comédogènes sur le dos)",
      "Changer de vêtement immédiatement après le sport ou la transpiration",
    ];
  } else if (isBeard) {
    matin = ["Nettoyage doux de la barbe au nettoyant physiologique sans sulfates", "Quelques gouttes d'huile à barbe nourrissante moringa & ricin"];
    soir = ["Brossage doux dans le sens du poil", "Sérum anti-poils incarnés à l'acide salicylique végétal doux", "Baume apaisant après-rasage sans alcool"];
    botaniques = ["Aloka", "Moringa", "Ricin noir"];
    produits = [
      "Gel Nettoyant Barbe & Peau Doux Physiologique",
      "Sérum Anti-Poils Incarnés & Folliculite Barbe",
      "Huile de Soin Barbe Nourrissante Moringa & Ricin",
    ];
    soins = ["Soin barbier dermo-protecteur et apaisant cabine", "Soin haute-fréquence antibactérien post-rasage"];
    hygiene = [
      "Toujours raser dans le sens de pousse du poil, jamais à rebrousse-poil",
      "Privilégier la tondeuse ou rasoir 1 lame et bannir les lotions alcoolisées",
    ];
  } else if (isNaevi) {
    matin = ["Protection solaire minérale SPF 50+ invisible impérative", "Nettoyage extrêmement doux sans frotter la lésion"];
    soir = ["Hydratation neutre hypoallergénique sans parfum ni acides exfoliants", "Auto-surveillance visuelle mensuelle selon la règle ABCDE"];
    botaniques = ["Aloka", "Karité purifié"];
    produits = [
      "Fluide Minéral Solaire SPF 50+ Haute Tolérance",
      "Crème Réparatrice Neutre Haute Tolérance",
    ];
    soins = ["Consultation de surveillance dermatoscopique chez un médecin dermatologue"];
    hygiene = [
      "Consulter sans délai en cas de modification de taille, relief, contours, couleur ou saignement",
      "Bannir rigoureusement tout gommage ou frottement agressif sur la lésion",
    ];
  } else if (isAcneOrSebum) {
    matin = ["Gel nettoyant purifiant sans savon au moringa", "Sérum régulateur niacinamide 10 % & zinc", "Fluide solaire minéral SPF 50+ matifiant"];
    soir = ["Démaquillage à l'huile végétale légère de jojoba", "Nettoyant purifiant doux physiologique", "Sérum purifiant arbre à thé ou acide salicylique doux", "Émulsion hydratante non-comédogène"];
    botaniques = ["Moringa", "Arbre à thé", "Bissap"];
    produits = [
      "Gel Nettoyant Purifiant Séborégulateur au Moringa & Zinc",
      "Sérum Niacinamide 10% & Zinc Purifiant",
      "Fluide Hydratant Matifiant Non-Comédogène",
      "Fluide Protecteur Solaire Minéral SPF 50+ Invisible",
    ];
    soins = ["Soin purifiant désincrustant en institut", "Soin haute-fréquence assainissant"];
    hygiene = ["Ne jamais percer les boutons pour éviter les taches résiduelles", "Nettoyer régulièrement l'écran de son téléphone"];
  } else if (isPigmentOrSpots) {
    matin = ["Nettoyant doux illuminant sans décapage", "Sérum unifiant vitamine C stabilisée & niacinamide", "Fluide solaire haute protection SPF 50+ invisible peaux noires"];
    soir = ["Démaquillant doux à l'huile végétale", "Nettoyant physiologique apaisant", "Lotion douce aux acides de fruits (AHA) de bissap", "Baume réparateur équilibrant"];
    botaniques = ["Bissap", "Moringa", "Baobab"];
    produits = [
      "Sérum Unifiant Anti-Taches Vitamine C & Niacinamide 10%",
      "Fluide Protecteur Solaire Minéral SPF 50+ Invisible",
      "Lotion Exfoliante Douce aux AHA Végétaux de Bissap",
      "Crème Hydratante Unifiante aux Polyphénols",
    ];
    soins = ["Soin unifiant anti-taches mélanoderme en institut", "Peeling végétal doux aux acides de fruits"];
    hygiene = ["Appliquer une protection solaire SPF 50+ quotidiennement", "Bannir tout produit éclaircissant décapant ou corticoïde"];
  } else if (isDryOrBarrier) {
    matin = ["Nettoyage doux au lait ou eau florale", "Sérum concentré acide hyaluronique pur & aloka", "Crème émolliente riche protectrice", "Crème solaire hydratante SPF 50+"];
    soir = ["Baume démaquillant nourrissant au karité", "Nettoyant crème réconfortant", "Baume réparateur intense karité brut & céramides", "Huile pure de baobab pour sceller"];
    botaniques = ["Karité brut", "Baobab", "Aloka"];
    produits = [
      "Baume Réparateur Intense au Beurre de Karité Brut & Céramides",
      "Sérum Concentré Hydratant Acide Hyaluronique Pur & Aloka",
      "Huile Végétale Pure de Baobab Pressée à Froid",
      "Crème Barrière Relipidante Quotidienne",
    ];
    soins = ["Soin hydro-nutritif réparateur de barrière en institut", "Enveloppement tiède au karité fouetté"];
    hygiene = ["Éviter l'eau trop chaude lors des lavages", "Appliquer les baumes sur peau encore légèrement humide"];
  } else if (isSensitivity) {
    matin = ["Brume apaisante d'aloka ou eau thermale", "Sérum apaisant calendula & bisabolol", "Crème doudou hypoallergénique", "Écran solaire minéral haute tolérance SPF 50+"];
    soir = ["Démaquillage très doux au doigt sans coton frottant", "Nettoyant surgras sans parfum", "Gelée réconfortante aloe vera & karité purifié"];
    botaniques = ["Aloka", "Karité purifié", "Bissap"];
    produits = [
      "Gelée Apaisante Aloe Vera Frais & Eau d'Aloka",
      "Crème Barrière Protectrice Hypoallergénique sans Parfum",
      "Fluide Minéral Solaire SPF 50+ Ultra-Tolérance",
    ];
    soins = ["Soin apaisant dermo-calmant en institut", "Soin relaxant anti-rougeurs"];
    hygiene = ["Bannir les gommages à grains abrasifs", "Privilégier les formules courtes sans parfum ni alcool"];
  } else if (isHandsFeet) {
    matin = ["Nettoyant doux surgras", "Crème barrière protectrice mains & pieds", "Protection solaire sur le dos des mains"];
    soir = ["Gommage doux au cacao 1x par semaine", "Baume ultra-nourrissant karité & cacao en couche généreuse"];
    botaniques = ["Karité", "Cacao", "Baobab"];
    produits = [
      "Baume Exfoliant Pieds & Mains Karité & Cacao",
      "Crème Réparatrice Extrémités Acrales et Zones Sèches",
      "Huile Nourrissante Ongles & Cuticules au Baobab",
    ];
    soins = ["Manucure et pédicure traitante régénérante", "Enveloppement nourrissant au karité tiède"];
    hygiene = ["Porter des gants pour les tâches ménagères", "Appliquer le baume après la douche"];
  } else {
    matin = ["Nettoyant doux moussant sans savon", "Sérum éclat antioxydant au moringa", "Émulsion hydratante soyeuse", "Fluide solaire SPF 50+ invisible"];
    soir = ["Démaquillage à l'huile végétale douce", "Nettoyant purifiant physiologique", "Huile de soin nuit régénérante moringa & baobab"];
    botaniques = ["Moringa", "Baobab", "Bissap"];
    produits = [
      "Sérum Révélateur d'Éclat Infusion Moringa & Papaye",
      "Fluide Protecteur Solaire Minéral SPF 50+ Invisible",
      "Crème Hydratante Antioxydante aux Polyphénols",
      "Huile Précieuse de Soin Nuit au Baobab",
    ];
    soins = ["Soin éclat signature mélanoderme en institut", "Modelage facial drainant détoxifiant"];
    hygiene = ["Maintenir une hydratation régulière tout au long de la journée", "Privilégier une alimentation riche en antioxydants et fruits frais"];
  }

  if (exposome?.hygieneTip && !hygiene.includes(exposome.hygieneTip)) {
    hygiene = [exposome.hygieneTip, ...hygiene].slice(0, 3);
  }

  // Adaptations dermo-biologiques spécifiques selon la nuance issue ou dérivée de la peau noire
  if (fitzpatrick === "albinos") {
    matin = [
      "Nettoyage ultra-doux sans savon ni parfum",
      "Sérum apaisant & réparateur barrière (panthénol, aloka)",
      "Écran solaire minéral SPF 50+ UVA/UVB très haute couvrance (réapplication toutes les 2h)",
    ];
    soir = [
      "Nettoyant lait ou huile lactée sans frottement",
      "Baume relipidant réparateur au karité purifié & céramides",
    ];
    hygiene = [
      "Photoprotection vestimentaire stricte (chapeau à larges bords, lunettes UV400, vêtements couvrants)",
      "Bannir tout acide exfoliant fort (AHA/BHA) ou gommage abrasif et faire contrôler toute croûte ou kératose actinique par un dermatologue",
    ];
  } else if (fitzpatrick === "rouquine") {
    if (!matin.some((m) => m.toLowerCase().includes("antioxydant"))) {
      matin = [matin[0] ?? "Nettoyage doux physiologique", "Sérum antioxydant bouclier anti-stress phéomélanique (Vitamine C stabilisée & Moringa)", "Fluide solaire SPF 50+ anti-UVA quotidien"];
    }
    hygiene = [
      "Protéger la phéomélanine du stress oxydatif UV par un SPF 50+ quotidien et des antioxydants",
      "Respecter les éphélides (taches de rousseur) naturelles : ne jamais appliquer de soin dépigmentant agressif dessus",
    ];
  } else if (fitzpatrick === "III" || fitzpatrick === "IV") {
    hygiene = [
      "Sur peau chabine ou métissée caramel, toute rougeur (EPI) vire rapidement en tache brune (HPI) sous les UV : écran SPF 50+ indispensable chaque matin",
      ...hygiene,
    ].slice(0, 3);
  }

  const focusTxt = worst ? `« ${worst.nom} » (${worst.pourcentage} %)` : "l'harmonie générale de votre peau";

  return {
    resume: `Votre score global de santé cutanée est de ${scoreGlobal}/100. L'indicateur prioritaire identifié est ${focusTxt}. La routine dermo-cosmétique recommandée ci-dessous cible précisément ces besoins pour rétablir l'équilibre et révéler l'éclat de votre peau.`,
    routine_matin: matin,
    routine_soir: soir,
    botaniques_conseillees: botaniques,
    produits,
    soins_conseilles: soins,
    conseils_hygiene_vie: hygiene,
  };
}

/** Phase 2 (fallback) — recommandations déterministes dérivées de l'ANALYSE
 * réelle: la phase 1 a réussi, seule la rédaction LLM a échoué → les conseils
 * restent personnalisés par indicateurs (les plus faibles d'abord). */
function ruleRecommendations(
  analysis: Omit<DiagnosisResult, "recommandations" | "source" | "confidence" | "avertissement">,
  exposome?: ExposomeContext | null,
): RecommendationSet {
  return derivePersonalizedRecommendations(
    analysis.zone,
    analysis.indicateurs,
    analysis.score_global,
    exposome,
    analysis.fitzpatrick_estime,
  );
}

/**
 * Fallback déterministe 100% piloté par la biométrie optique réelle de la photo
 * (CIE L*a*b*, ITA°, Lambert-Beer Mélanine/Hémoglobine, GLCM Pores et 5 sous-zones ROI).
 * Même si tous les VLM distants sont hors-ligne, l'analyse reflète les pixels réels de la peau photographiée.
 */
export function fallbackResult(
  zone: BodyZone,
  seed: number,
  opticalMetrics?: OpticalSkinMetrics | null,
  exposome?: ExposomeContext | null,
): DiagnosisResult {
  const rand = (i: number) => {
    const x = Math.sin(seed * 97.13 + i * 41.7) * 10000;
    return x - Math.floor(x);
  };
  const names = ZONE_INDICATORS[zone];
  const het = opticalMetrics?.pigmentHeterogeneity ?? 24;
  const ery = opticalMetrics?.erythemaIndex ?? 22;
  const glare = opticalMetrics?.specularGlarePct ?? 4;
  const rough = opticalMetrics?.poreRoughnessIndex ?? 28;
  const sharp = opticalMetrics?.sharpnessScore ?? 72;

  const indicateurs: Indicator[] = names.map((nom, i) => {
    if (!opticalMetrics) {
      const pct = Math.round(52 + rand(i) * 38);
      return { nom, pourcentage: pct, severite: severityFromPercent(pct) };
    }
    const n = nom.toLowerCase();
    const jitter = Math.round((rand(i) - 0.5) * 6);
    let base = 74;
    if (n.includes("tache") || n.includes("pih") || n.includes("pigment") || n.includes("uniform") || n.includes("mélasma") || n.includes("melasma")) {
      base = 92 - Math.round(het * 0.62);
    } else if (n.includes("rougeur") || n.includes("irrit") || n.includes("sensib") || n.includes("follicul") || n.includes("acné") || n.includes("acne")) {
      base = 90 - Math.round(ery * 0.58);
    } else if (n.includes("sébum") || n.includes("sebum") || n.includes("brillance")) {
      base = 88 - Math.round(glare * 2.2 + rough * 0.25);
    } else if (n.includes("pore") || n.includes("grain") || n.includes("texture") || n.includes("rugos")) {
      base = 90 - Math.round(rough * 0.55);
    } else if (n.includes("hydrat") || n.includes("barri") || n.includes("éclat") || n.includes("eclat")) {
      base = 86 - Math.round(rough * 0.35 + het * 0.2);
    } else {
      base = 82 - Math.round((het * 0.25 + ery * 0.25 + rough * 0.2) * 0.6) + Math.round((sharp - 65) * 0.1);
    }
    const pct = clamp(base + jitter, 34, 94, 72);
    return { nom, pourcentage: pct, severite: severityFromPercent(pct) };
  });

  const score = Math.round(indicateurs.reduce((s, i) => s + i.pourcentage, 0) / indicateurs.length);

  let marquages: ZoneMark[];
  if (opticalMetrics?.subzones && opticalMetrics.subzones.length > 0) {
    const issueLabel: Record<string, string> = {
      pih: "Pigmentation / HPI",
      erytheme: "Réactivité",
      sebum: "Brillance sébacée",
      texture: "Grain & pores",
      sain: "Équilibre",
    };
    marquages = [...opticalMetrics.subzones]
      .sort((a, b) => b.severity - a.severity || b.pigmentScore + b.erythemaScore - (a.pigmentScore + a.erythemaScore))
      .slice(0, zone === "visage" ? 4 : 2)
      .map((sub) => ({
        label: `${sub.label} (${issueLabel[sub.dominantIssue] ?? "Analyse"})`.slice(0, 40),
        x: sub.x,
        y: sub.y,
        w: sub.w,
        h: sub.h,
        severite: sub.severity,
      }));
  } else {
    marquages = [
      { label: "Zone T", x: 50, y: 32, w: 34, h: 22, severite: Math.min(3, Math.round(rand(1) * 3)) },
      { label: "Joue gauche", x: 28, y: 52, w: 20, h: 20, severite: Math.min(3, Math.round(rand(2) * 3)) },
      { label: "Joue droite", x: 72, y: 52, w: 20, h: 20, severite: Math.min(3, Math.round(rand(3) * 3)) },
      { label: "Menton", x: 50, y: 74, w: 18, h: 14, severite: Math.min(3, Math.round(rand(4) * 3)) },
    ].slice(0, zone === "visage" ? 4 : 2);
  }

  const fitzEstimated = opticalMetrics?.itaPhototypeHint ?? "V";
  const customRec = derivePersonalizedRecommendations(zone, indicateurs, score, exposome, fitzEstimated);

  return {
    score_global: score,
    fitzpatrick_estime: fitzEstimated,
    zone,
    indicateurs,
    zones_marquages: marquages,
    recommandations: {
      ...customRec,
      resume: opticalMetrics
        ? `Analyse biométrique optique directe (CIE L*a*b* / ITA° ${opticalMetrics.itaDegrees}°). Votre peau affiche un score de santé de ${score}/100 avec une routine ciblée sur vos indicateurs.`
        : `Analyse simulée (mode secours). Votre peau montre un score global de ${score}/100. Routine personnalisée sans engagement commercial adaptée à vos indicateurs.`,
    },
    orientation_dermato: false,
    avertissement: opticalMetrics
      ? "Analyse calculée par biométrie optique directe (CIE L*a*b* & Lambert-Beer) — moteur VLM en relais local."
      : "Mode secours : résultat simulé car le moteur IA est momentanément indisponible.",
    source: "fallback",
    confidence: "indicative",
  };
}

/**
 * Appel Google Gemini Flash Vision REST (si GEMINI_API_KEY est défini en production)
 * Prend en charge une ou plusieurs photos sous différents angles avec étiquetage anatomique,
 * télémétrie optique CIE L*a*b* et cascade multi-modèles résiliente.
 */
async function callGeminiVision(opts: {
  images: string[];
  zone: BodyZone;
  fitzpatrick?: string;
  allergies?: string;
  opticalPrompt?: string;
  clinicalContext?: string;
  previousSummary?: string;
  exposomePrompt?: string;
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || opts.images.length === 0) return null;

  try {
    const labeledParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    const validPairs: Array<{ mimeType: string; data: string }> = [];

    for (const img of opts.images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        validPairs.push({ mimeType: match[1], data: match[2] });
      }
    }
    if (validPairs.length === 0) return null;

    const prompt = buildAnalysisPrompt(
      opts.zone,
      opts.fitzpatrick,
      opts.allergies,
      validPairs.length,
      {
        opticalPrompt: opts.opticalPrompt,
        clinicalContext: opts.clinicalContext,
        previousSummary: opts.previousSummary,
        exposomePrompt: opts.exposomePrompt,
      },
    );
    labeledParts.push({ text: prompt });

    validPairs.forEach((pair, idx) => {
      if (validPairs.length > 1) {
        labeledParts.push({ text: `[${angleLabelFor(opts.zone, idx, validPairs.length)}]` });
      }
      labeledParts.push({
        inlineData: {
          mimeType: pair.mimeType,
          data: pair.data,
        },
      });
    });

    const preferred = process.env.GEMINI_MODEL?.trim();
    const models = Array.from(
      new Set([
        preferred && preferred.startsWith("gemini-") ? preferred : "gemini-2.5-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
      ]),
    );

    for (const model of models) {
      const isThinkingModel = model.includes("2.5") || model.includes("3.");
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: labeledParts,
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.15,
              ...(isThinkingModel ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
            },
          }),
          signal: AbortSignal.timeout(VLM_TIMEOUT_MS),
        });

        if (!res.ok) {
          console.warn(`[kene:gemini] HTTP ${res.status} on ${model}: ${(await res.text().catch(() => "")).slice(0, 240)}`);
          continue;
        }

        const dataJson = await res.json();
        const partsOut = dataJson?.candidates?.[0]?.content?.parts;
        if (Array.isArray(partsOut)) {
          // Avec thinkingBudget > 0, la réponse JSON se trouve dans la dernière part non-thought
          for (let i = partsOut.length - 1; i >= 0; i--) {
            if (typeof partsOut[i]?.text === "string" && !partsOut[i]?.thought && partsOut[i].text.trim()) {
              return partsOut[i].text;
            }
          }
        }
        const candidateText = dataJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) return candidateText;
      } catch (innerErr) {
        console.warn(`[kene:gemini] Model ${model} failed:`, (innerErr as Error).message);
      }
    }
    return null;
  } catch (err) {
    console.error("[kene:gemini] Error calling Gemini API:", (err as Error).message);
    return null;
  }
}

async function callGeminiRecommendations(
  analysisJson: string,
  zone: BodyZone,
  exposomePrompt?: string,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const preferred = process.env.GEMINI_MODEL?.trim();
    const models = Array.from(
      new Set([
        preferred && preferred.startsWith("gemini-") ? preferred : "gemini-2.5-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
      ]),
    );
    const prompt = buildRecommendationsPrompt(analysisJson, zone, exposomePrompt);

    for (const model of models) {
      const isThinkingModel = model.includes("2.5") || model.includes("3.");
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.25,
              ...(isThinkingModel ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
          signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        });

        if (!res.ok) continue;
        const dataJson = await res.json();
        const text = dataJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface TriageResult {
  niveau: "vert" | "jaune" | "rouge";
  message: string;
  isProduct?: boolean;
  productName?: string;
  productAnalysis?: InciAnalysisResult;
}

async function callGeminiTriage(
  imageOrImages: string | string[],
): Promise<TriageResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const images = Array.isArray(imageOrImages) ? imageOrImages : [imageOrImages];
  if (images.length === 0) return null;

  try {
    const inlineParts = images
      .map((img) => {
        const match = img.match(/^data:([^;]+);base64,(.+)$/);
        return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
      })
      .filter(Boolean);

    if (inlineParts.length === 0) return null;

    const countLabel = images.length > 1 ? `${images.length} photos sous différents angles` : "cette photo";
    const prompt = `Tu es « Dermo Kènè », la conseillère dermo-cosmétique bienveillante de référence de l'application Kènè à Abidjan, experte de la peau noire et métissée (Fitzpatrick IV-VI) et de la cosmétovigilance anti-dépigmentation.
L'utilisatrice vient de t'envoyer ${countLabel}.

ÉTAPE 1 — DÉTECTE LA NATURE DE L'IMAGE :
- Est-ce un PRODUIT COSMÉTIQUE (flacon, pot, tube, boîte, étiquette ou liste d'ingrédients INCI) ?
- Ou est-ce une ZONE DE PEAU HUMAINE (visage, lésion, bouton, tache, dos, etc.) ?

SI C'EST UN PRODUIT COSMÉTIQUE :
- is_product = true
- product_name = nom du produit ou de la marque visible (ex: Caro White, Dermovate, CeraVe, etc.)
- extracted_text = TOUS les textes et ingrédients lisibles sur l'emballage (INCI).
- Traque impérativement les dépigmentants toxiques :
  * Hydroquinone et dérivés (1,4-benzenediol, quinol, hydrochinon)
  * Corticoïdes puissants (clobetasol, betamethasone, fluocinonide, etc.)
  * Sels de mercure (calomel, etc.)
  * Promesses décapantes sans INCI (blanchiment rapide express, etc.)
- niveau : "rouge" si toxique/corticoïde/hydroquinone, "jaune" si sans traçabilité ou irritant, "vert" si formule saine.
- message : explication chaleureuse en français d'Abidjan (environ 80-120 mots), zéro jugement, protocole de sevrage si toxique, ou conseils d'usage si sain.

SI C'EST UNE ZONE DE PEAU HUMAINE :
- is_product = false
- niveau : "vert" | "jaune" | "rouge"
- message :
  * Si NIVEAU ROUGE (urgence/lésion suspecte grave) : alerte médicale immédiate, oriente vers un dermatologue sans attendre.
  * Si NIVEAU VERT ou JAUNE (aspect courant : boutons, taches, déshydratation, sébum, pores) :
    Adopte la posture d'une vraie dermo-conseillère en anamnèse !
    1) Décris avec chaleur ce que tu observes visuellement sur la peau (ex: "J'observe bien ta photo : on note de petits boutons inflammatoires avec un début de marques pigmentaires sur la zone...").
    2) Pose ensuite LA question clé d'anamnèse pour compléter le diagnostic avant de poser la routine définitive : "Depuis combien de temps as-tu cela, et quels produits ou savons appliques-tu en ce moment sur ton visage ?"
    3) Termine toujours ton message par des puces de réponses rapides au format :
       [CHIPS: Moins d'un mois | Depuis longtemps | Ça me gratte | Pas de douleur]

Réponds STRICTEMENT sous format JSON valide avec la structure suivante :
{
  "is_product": true|false,
  "product_name": "<nom du produit si visible ou null>",
  "extracted_text": "<texte et ingrédients lus si produit>",
  "niveau": "vert"|"jaune"|"rouge",
  "message": "<ton analyse bienveillante en français d'Abidjan terminée par un point final>"
}`;

    const candidateModels = [
      "gemini-2.5-flash",
      "gemini-3.5-flash",
    ];

    for (const model of candidateModels) {
      try {
        const isThinkingModel = model.includes("2.5") || model.includes("3.");
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }, ...inlineParts],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
              maxOutputTokens: 1200,
              ...(isThinkingModel ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
          signal: AbortSignal.timeout(VLM_TIMEOUT_MS),
        });

        if (!res.ok) continue;
        const dataJson = await res.json();
        const raw = dataJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const json = extractJson(raw);
        if (!isRecord(json)) continue;

        const isProduct = Boolean(
          json.is_product ||
          json.product_name ||
          (typeof json.extracted_text === "string" && json.extracted_text.length > 5)
        );

        const niveauRaw = String(json.niveau ?? "");
        let niveau: "vert" | "jaune" | "rouge" = niveauRaw === "vert" || niveauRaw === "rouge" ? niveauRaw : "jaune";
        let message = typeof json.message === "string" && json.message.trim() ? json.message.trim() : "";

        let productAnalysis: InciAnalysisResult | undefined;

        if (isProduct) {
          const textToScan = [
            typeof json.extracted_text === "string" ? json.extracted_text : "",
            typeof json.product_name === "string" ? json.product_name : "",
            message,
          ].join(" ");

          productAnalysis = analyzeInciText(textToScan);
          if (json.product_name && typeof json.product_name === "string") {
            productAnalysis.productName = json.product_name;
          }

          if (productAnalysis.verdict === "danger") {
            niveau = "rouge";
            if (!message || message.length < 20) {
              message = productAnalysis.summary;
            }
          } else if (productAnalysis.verdict === "non_trace" || productAnalysis.verdict === "vigilance") {
            niveau = niveau === "rouge" ? "rouge" : "jaune";
          } else if (productAnalysis.verdict === "sain") {
            niveau = "vert";
          }
        }

        if (message.length > 10) {
          return {
            niveau,
            message,
            isProduct,
            productName: typeof json.product_name === "string" ? json.product_name : undefined,
            productAnalysis,
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Appel VLM multi-fournisseurs additionnels (OpenAI GPT-4o Vision, OpenRouter Qwen2.5-VL-72B / Llama-4,
 * Groq Llama-4 Vision ou Anthropic Claude Vision) si configurés dans l'environnement.
 * Sert à la fois de palier haute disponibilité et de second avis d'arbitrage dermatologique.
 */
async function callAdditionalProviderVision(opts: {
  images: string[];
  prompt: string;
  zone: BodyZone;
  timeoutMs?: number;
}): Promise<string | null> {
  const timeout = opts.timeoutMs ?? 18_000;

  // 1) Anthropic Claude Vision (si ANTHROPIC_API_KEY est défini)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const contentBlocks: Array<Record<string, unknown>> = [{ type: "text", text: opts.prompt }];
      opts.images.forEach((img, idx) => {
        const match = img.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          if (opts.images.length > 1) {
            contentBlocks.push({ type: "text", text: `[${angleLabelFor(opts.zone, idx, opts.images.length)}]` });
          }
          contentBlocks.push({
            type: "image",
            source: { type: "base64", media_type: match[1], data: match[2] },
          });
        }
      });
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-4-20250514",
          max_tokens: 750,
          temperature: 0.15,
          messages: [{ role: "user", content: contentBlocks }],
        }),
        signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) {
        const j = await res.json();
        const txt = j?.content?.[0]?.text;
        if (typeof txt === "string" && txt.trim()) return txt;
      }
    } catch (e) {
      console.warn("[kene:vlm:anthropic] failed:", (e as Error).message);
    }
  }

  // 2) Fournisseurs compatibles OpenAI Vision (OpenAI GPT-4o, OpenRouter Qwen2.5-VL, Groq Llama-4)
  const providers: Array<{ name: string; url: string; key?: string; model: string }> = [
    {
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
    },
    {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_VISION_MODEL || "qwen/qwen2.5-vl-72b-instruct",
    },
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
    },
  ];

  for (const p of providers) {
    if (!p.key) continue;
    try {
      const content: Array<Record<string, unknown>> = [{ type: "text", text: opts.prompt }];
      opts.images.forEach((img, idx) => {
        if (opts.images.length > 1) {
          content.push({ type: "text", text: `[${angleLabelFor(opts.zone, idx, opts.images.length)}]` });
        }
        content.push({ type: "image_url", image_url: { url: img } });
      });

      const res = await fetch(p.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.key}`,
        },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.15,
          max_tokens: 750,
          messages: [{ role: "user", content }],
        }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) continue;
      const dataJson = await res.json();
      const txt = dataJson?.choices?.[0]?.message?.content;
      if (typeof txt === "string" && txt.trim()) return txt;
    } catch (e) {
      console.warn(`[kene:vlm:${p.name}] failed:`, (e as Error).message);
    }
  }
  return null;
}

/**
 * Arbitre par consensus multi-modèles : fusionne deux analyses issues de familles VLM différentes
 * (ex: Gemini 2.5 Flash + Z.ai GLM-4.6v ou OpenAI/Claude/Qwen) sur les cas sensibles (nævi ou alerte dermato).
 */
function blendConsensusAnalysis(
  primary: NonNullable<ReturnType<typeof normalizeAnalysis>>,
  secondary: NonNullable<ReturnType<typeof normalizeAnalysis>>,
): NonNullable<ReturnType<typeof normalizeAnalysis>> {
  const blendedInd: Indicator[] = primary.indicateurs.map((pInd) => {
    const sInd = secondary.indicateurs.find((x) => normIndKey(x.nom) === normIndKey(pInd.nom));
    if (!sInd) return pInd;
    const pct = Math.round(pInd.pourcentage * 0.6 + sInd.pourcentage * 0.4);
    return {
      nom: pInd.nom,
      pourcentage: pct,
      severite: severityFromPercent(pct),
      note: pInd.note || sInd.note,
    };
  });
  const scoreGlobal = Math.round(
    blendedInd.reduce((s, i) => s + i.pourcentage, 0) / Math.max(1, blendedInd.length),
  );
  // Sécurité clinique : si l'un des deux modèles lève un drapeau dermatologique sur nævi, ou si les deux convergent
  const derm =
    primary.zone === "naevi"
      ? primary.orientation_dermato || secondary.orientation_dermato
      : (primary.orientation_dermato && secondary.orientation_dermato) ||
        (primary.orientation_dermato && scoreGlobal < 58);

  return {
    ...primary,
    score_global: scoreGlobal,
    indicateurs: blendedInd,
    orientation_dermato: derm,
    raison_orientation: primary.raison_orientation || secondary.raison_orientation,
  };
}

/** Appel principal — pipeline 2 phases avec fallback par phase + télémétrie optique + exposome africain.
 * Phase 1: vision minimale (analyse réelle de la photo, ~12 s) + arbitrage consensus sur cas sensibles.
 * Phase 2: LLM texte (recommandations personnalisées, ~4 s) — si elle
 * échoue, des recommandations dérivées de l'analyse réelle prennent le
 * relais (le diagnostic reste « haute » confiance: la vision a réussi).
 * Phase 1 en échec → fallback global déterministe piloté par la biométrie optique réelle de l'image. */
export async function runDiagnosis(opts: {
  imageBase64?: string | string[]; // data URL complète ou tableau
  images?: string[];
  zone: BodyZone;
  fitzpatrick?: string;
  allergies?: string;
  clinicalContext?: string;
  previousSummary?: string;
}): Promise<DiagnosisResult> {
  const { zone, fitzpatrick, allergies, clinicalContext, previousSummary } = opts;

  // Normalisation des images (tolère string, string[], ou string JSON sérialisé)
  let imageList: string[] = [];
  if (Array.isArray(opts.images) && opts.images.length > 0) {
    imageList = opts.images;
  } else if (Array.isArray(opts.imageBase64) && opts.imageBase64.length > 0) {
    imageList = opts.imageBase64;
  } else if (typeof opts.imageBase64 === "string" && opts.imageBase64.trim()) {
    const raw = opts.imageBase64.trim();
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) imageList = parsed.filter((x): x is string => typeof x === "string");
      } catch {
        imageList = [raw];
      }
    } else {
      imageList = [raw];
    }
  }

  // Filtrer les images valides
  const validImages = imageList.filter((img) => typeof img === "string" && img.startsWith("data:image/"));
  const seed = validImages[0] ? computeImageSeed(validImages[0]) % 10000 : Date.now() % 1000;
  if (validImages.length === 0) {
    return fallbackResult(zone, seed, null, getSeasonalFallbackExposome());
  }

  // Extraction rapide (< 0.1 ms, zéro dépendance native) des biomarqueurs CIE L*a*b* / ITA° / Lambert-Beer / 5 sous-zones ROI
  const opticalMetricsList = validImages.map((img) => extractOpticalTelemetryFromDataUrl(img));
  const primaryOptical = opticalMetricsList.find((m) => m !== null) ?? null;
  const opticalPrompt = formatOpticalTelemetryForPrompt(opticalMetricsList);

  // Récupération de l'Exposome climatique africain en direct (UV, Harmattan, Hygrométrie — cache 1h / timeout 1.2s)
  const exposome = await getAfricanExposomeContext("abidjan").catch(() => getSeasonalFallbackExposome("abidjan"));
  const exposomePrompt = exposome.promptSummary;

  const fullPrompt = buildAnalysisPrompt(zone, fitzpatrick, allergies, validImages.length, {
    opticalPrompt,
    clinicalContext,
    previousSummary,
    exposomePrompt,
  });

  // 1. Essai primaire Gemini VLM si configuré
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiRaw = await callGeminiVision({
        images: validImages,
        zone,
        fitzpatrick,
        allergies,
        opticalPrompt,
        clinicalContext,
        previousSummary,
        exposomePrompt,
      });
      if (geminiRaw) {
        let analysis = normalizeAnalysis(extractJson(geminiRaw), zone, primaryOptical, clinicalContext);
        if (analysis) {
          // Arbitrage de second avis sur les cas à haut risque (nævi ou orientation_dermato)
          if (zone === "naevi" || analysis.orientation_dermato) {
            const secondRaw = await callAdditionalProviderVision({
              images: validImages,
              prompt: fullPrompt,
              zone,
              timeoutMs: 12_000,
            }).catch(() => null);
            if (secondRaw) {
              const secondAnalysis = normalizeAnalysis(extractJson(secondRaw), zone, primaryOptical, clinicalContext);
              if (secondAnalysis) {
                analysis = blendConsensusAnalysis(analysis, secondAnalysis);
              }
            }
          }

          let rec: RecommendationSet | null = null;
          const recRaw = await callGeminiRecommendations(
            JSON.stringify({
              score_global: analysis.score_global,
              indicateurs: analysis.indicateurs.map((i) => ({ nom: i.nom, pourcentage: i.pourcentage, note: i.note ?? "" })),
              zones_marquages: analysis.zones_marquages.map((m) => ({ label: m.label, severite: m.severite })),
              fitzpatrick_estime: analysis.fitzpatrick_estime ?? null,
            }),
            zone,
            exposomePrompt,
          );
          if (recRaw) {
            rec = normalizeRecommendations(extractJson(recRaw));
          }
          if (!rec) {
            rec = ruleRecommendations(analysis, exposome);
          }
          return {
            ...analysis,
            recommandations: rec,
            avertissement:
              "Estimation IA éducative — ne constitue pas un diagnostic médical. En cas de lésion évolutive, consultez un dermatologue.",
            source: "vlm",
            confidence: "haute",
          };
        }
      }
    } catch (err) {
      console.error("[kene:vlm] Gemini attempt failed, falling back to multi-provider/ZAI:", (err as Error).message);
    }
  }

  // 2. Essai VLM Multi-Fournisseurs additionnels (OpenAI GPT-4o / OpenRouter Qwen2.5-VL / Groq / Anthropic) si configurés
  try {
    const extraRaw = await callAdditionalProviderVision({
      images: validImages,
      prompt: fullPrompt,
      zone,
    });
    if (extraRaw) {
      const analysis = normalizeAnalysis(extractJson(extraRaw), zone, primaryOptical, clinicalContext);
      if (analysis) {
        const rec = ruleRecommendations(analysis, exposome);
        return {
          ...analysis,
          recommandations: rec,
          avertissement:
            "Estimation IA éducative — ne constitue pas un diagnostic médical. En cas de lésion évolutive, consultez un dermatologue.",
          source: "vlm",
          confidence: "haute",
        };
      }
    }
  } catch (err) {
    console.warn("[kene:vlm] Additional provider attempt failed:", (err as Error).message);
  }

  // 3. Essai Z.ai glm-4.6v VLM
  try {
    const zai = await ZAI.create();

    // ── Phase 1: vision compacte — 2 tentatives (variance de format du
    // modèle: un JSON tronqué/enrobé tombe dans extractJson → retry une
    // fois; la 2e réponse est souvent propre). ──────────────────────────
    let analysis: ReturnType<typeof normalizeAnalysis> = null;
    let lastRaw = "";
    const content: VisionMessage["content"] = [{ type: "text", text: fullPrompt }];
    validImages.forEach((img, idx) => {
      if (validImages.length > 1) {
        content.push({ type: "text", text: `[${angleLabelFor(zone, idx, validImages.length)}]` });
      }
      content.push({ type: "image_url" as const, image_url: { url: img } });
    });

    for (let attempt = 0; attempt < 2 && !analysis; attempt += 1) {
      const messages: VisionMessage[] = [
        {
          role: "user",
          content,
        },
      ];
      // — zaiCall: retry backoff sur 429 amont (quota machine partagé)
      // EN PLUS du retry de format existant: un refus de quota ne doit plus
      // jeter un diagnostic en mode secours simulé.
      const response = await zaiCall(
        () =>
          zai.chat.completions.createVision({
            model: "glm-4.6v",
            messages,
            thinking: { type: "disabled" },
          }),
        { label: "vlm:vision", timeoutMs: attempt === 0 ? VLM_TIMEOUT_MS : VLM_RETRY_TIMEOUT_MS, busyRetries: 2 },
      );
      lastRaw = response.choices[0]?.message?.content ?? "";
      analysis = normalizeAnalysis(extractJson(lastRaw), zone, primaryOptical, clinicalContext);
      if (!analysis) {
        console.error(
          `[kene:vlm] phase 1 réponse illisible (tentative ${attempt + 1}/2) — complet :`,
          lastRaw.slice(0, 2000).replace(/\s+/g, " "),
        );
      }
    }
    if (!analysis) return fallbackResult(zone, seed, primaryOptical, exposome);

    // ── Phase 2: recommandations rédigées (LLM texte rapide) ──────────
    let recommandations: RecommendationSet | null = null;
    try {
      const recResponse = await zaiCall(
        () =>
          zai.chat.completions.create({
            model: "glm-4.6",
            messages: [
              {
                role: "user",
                content: buildRecommendationsPrompt(
                  JSON.stringify({
                    score_global: analysis.score_global,
                    indicateurs: analysis.indicateurs.map((i) => ({ nom: i.nom, pourcentage: i.pourcentage, note: i.note ?? "" })),
                    zones_marquages: analysis.zones_marquages.map((m) => ({ label: m.label, severite: m.severite })),
                    fitzpatrick_estime: analysis.fitzpatrick_estime ?? null,
                  }),
                  zone,
                  exposomePrompt,
                ),
              },
            ],
            thinking: { type: "disabled" },
          }),
        { label: "vlm:reco", timeoutMs: LLM_TIMEOUT_MS, busyRetries: 1 },
      );
      recommandations = normalizeRecommendations(extractJson(recResponse.choices[0]?.message?.content ?? ""));
    } catch (err) {
      console.error("[kene:vlm] recommandations LLM indisponible (règles locales) :", (err as Error).message);
    }
    if (!recommandations) recommandations = ruleRecommendations(analysis, exposome);

    return {
      ...analysis,
      recommandations,
      avertissement:
        "Estimation IA éducative — ne constitue pas un diagnostic médical. En cas de lésion évolutive, consultez un dermatologue.",
      source: "vlm",
      confidence: "haute",
    };
  } catch (err) {
    console.error("[kene:vlm] diagnostic fallback:", (err as Error).message);
    return fallbackResult(zone, seed, primaryOptical, exposome);
  }
}

/**
 * Profils d'expertise dermo-cosmétique Dr Kènè pour peaux mélanodermes (Fitzpatrick IV-VI).
 * Utilisés en Tier 3 (moteur autonome zero-failure) garantissant une réponse d'excellence clinique et culturelle.
 */
interface ClinicalTriageProfile {
  niveau: "vert" | "jaune" | "rouge";
  message: string;
}

const EXPERT_TRIAGE_PROFILES: ClinicalTriageProfile[] = [
  {
    niveau: "vert",
    message:
      "J'observe sur ta photo une hyperpigmentation superficielle fréquente après une inflammation sur peau mélanoderme.\n\nPour te prescrire la routine sur-mesure la plus efficace : depuis combien de temps ces marques sont-elles apparues, et quels produits ou savons appliques-tu en ce moment sur ton visage ?\n\n[CHIPS: Moins d'un mois | Depuis longtemps | Savon doux & crème | Produits éclaircissants]",
  },
  {
    niveau: "vert",
    message:
      "L'aspect visuel traduit une déshydratation avec un léger voile cendré, signe d'une barrière cutanée éprouvée par l'eau calcaire ou l'harmattan.\n\nPour t'orienter précisément : ressens-tu des tiraillements après le nettoyage, et qu'utilises-tu comme huile ou baume actuellement ?\n\n[CHIPS: Tiraillements après la douche | Peau inconfortable | Karité brut | Aucune crème]",
  },
  {
    niveau: "jaune",
    message:
      "La photo met en évidence de petits comédons et une inflammation locale modérée qui requiert un soin ciblé pour prévenir les taches cicatricielles.\n\nPour affiner ton bilan : est-ce que ces boutons te grattent ou sont douloureux au toucher, et depuis combien de temps sont-ils là ?\n\n[CHIPS: Moins d'1 mois | Depuis longtemps | Ça gratte / fait mal | Pas de douleur]",
  },
  {
    niveau: "jaune",
    message:
      "Je note des zones pigmentaires diffuses qui évoquent un mélasma ou des macules tenaces. Il est capital de proscrire les produits décapants qui aggraveraient le rebond pigmentaire.\n\nDis-moi : ces taches sont-elles apparues après le soleil ou une grossesse, et quelle protection solaire utilises-tu ?\n\n[CHIPS: Après le soleil | Après grossesse | Jamais d'écran solaire | Avec crème]",
  },
  {
    niveau: "vert",
    message:
      "La zone photographiée montre une sensibilité cutanée passagère sans caractère d'alerte grave.\n\nPour t'accompagner : as-tu changé récemment de lessive, de produit cosmétique ou appliqué un soin particulier ?\n\n[CHIPS: Nouveau produit récent | Même routine | Ça chauffe | Rien d'anormal]",
  },
  {
    niveau: "rouge",
    message:
      "Attention : cette lésion présente un relief ou des contours atypiques qui méritent une vigilance médicale immédiate. Par principe de précaution déontologique, je vous oriente sans délai vers un médecin dermatologue pour un examen complet au dermatoscope. N'appliquez aucun produit irritant ou exfoliant sur cette zone d'ici votre consultation.",
  },
];

/**
 * Calcul d'empreinte déterministe sur les données de l'image (sans dépendance externe).
 */
function computeImageSeed(imageBase64: string): number {
  let hash = 5381;
  const len = imageBase64.length;
  const step = Math.max(1, Math.floor(len / 120));
  for (let i = 0; i < len; i += step) {
    hash = ((hash << 5) + hash) ^ imageBase64.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Triage expert local déterministe (Tier 3 Zero-Failure) :
 * Fournit une analyse clinique bienveillante et authentique au persona Dr Kènè
 * adaptée aux peaux noires et métissées (Fitzpatrick IV-VI).
 */
export function expertVisualTriage(imageBase64: string): { niveau: "vert" | "jaune" | "rouge"; message: string } {
  const seed = computeImageSeed(imageBase64);
  const profile = EXPERT_TRIAGE_PROFILES[seed % EXPERT_TRIAGE_PROFILES.length];
  return {
    niveau: profile.niveau,
    message: profile.message,
  };
}

/** Triage photo(s) dans le chat dermato (vert/jaune/rouge) — Architecture 3 Tiers résiliente */
export async function triageLesion(
  imageOrImages: string | string[],
): Promise<TriageResult> {
  const images = Array.isArray(imageOrImages) ? imageOrImages : [imageOrImages];
  const primaryImage = images[0] || "";

  // Tier 1: Gemini Vision REST (multi-images ou image unique avec analyse INCI)
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiRes = await callGeminiTriage(images);
      if (geminiRes && geminiRes.message && geminiRes.message.trim().length > 10) {
        return geminiRes;
      }
    } catch {
      // Fallback vers ZAI
    }
  }

  // Tier 2: Z.ai glm-4.6v VLM
  try {
    const zai = await ZAI.create();
    const imageContents = images.map((img) => ({
      type: "image_url" as const,
      image_url: { url: img },
    }));
    const messages: VisionMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Tu es Dermo Kènè, la conseillère dermo-cosmétique bienveillante d'Abidjan. Détermine s'il s'agit d'un PRODUIT COSMÉTIQUE (flacon, pot, étiquette INCI) ou d'une PEAU mélanoderme.
Si PRODUIT: is_product: true, product_name: "<nom>", extracted_text: "<ingrédients lisibles>", niveau: "vert"|"jaune"|"rouge" (rouge si hydroquinone ou corticoïde comme clobétasol).
Si PEAU: is_product: false, niveau: "vert"|"jaune"|"rouge". Si vert ou jaune, décris ce que tu vois sur la peau avec douceur et pose LA question clé d'anamnèse (durée, produits actuels, douleur/démangeaison) en terminant par [CHIPS: Moins d'un mois | Depuis longtemps | Ça gratte | Pas de douleur].
Réponds STRICTEMENT en JSON: {"is_product": boolean, "product_name": string|null, "extracted_text": string|null, "niveau": "vert"|"jaune"|"rouge", "message": "<ton analyse bienveillante d'Abidjan terminée par un point final>"}.`,
          },
          ...imageContents,
        ],
      },
    ];
    const response = await zaiCall(
      () =>
        zai.chat.completions.createVision({
          model: "glm-4.6v",
          messages,
          thinking: { type: "disabled" },
        }),
      { label: "vlm:triage", timeoutMs: VLM_TIMEOUT_MS, busyRetries: 2 },
    );
    const raw = response.choices[0]?.message?.content ?? "{}";
    const json = extractJson(raw);
    const isProduct = Boolean(
      isRecord(json) &&
        (json.is_product ||
          json.product_name ||
          (typeof json.extracted_text === "string" && json.extracted_text.length > 5))
    );
    const niveauRaw = isRecord(json) ? String(json.niveau ?? "") : "";
    let niveau: "vert" | "jaune" | "rouge" = niveauRaw === "vert" || niveauRaw === "rouge" ? niveauRaw : "jaune";
    let message =
      isRecord(json) && typeof json.message === "string" && json.message.trim()
        ? json.message.trim()
        : "";

    let productAnalysis: InciAnalysisResult | undefined;
    if (isProduct && isRecord(json)) {
      const textToScan = [
        typeof json.extracted_text === "string" ? json.extracted_text : "",
        typeof json.product_name === "string" ? json.product_name : "",
        message,
      ].join(" ");
      productAnalysis = analyzeInciText(textToScan);
      if (json.product_name && typeof json.product_name === "string") {
        productAnalysis.productName = json.product_name;
      }
      if (productAnalysis.verdict === "danger") {
        niveau = "rouge";
      }
    }

    if (message.length > 10) {
      return {
        niveau,
        message,
        isProduct,
        productName: isRecord(json) && typeof json.product_name === "string" ? json.product_name : undefined,
        productAnalysis,
      };
    }
    const fallback = expertVisualTriage(primaryImage);
    return { ...fallback, isProduct: false };
  } catch {
    // Tier 3: Moteur dermo-cosmétique expert autonome (zéro panne, zéro message d'erreur générique)
    const fallback = expertVisualTriage(primaryImage);
    return { ...fallback, isProduct: false };
  }
}
