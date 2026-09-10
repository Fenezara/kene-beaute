// Kènè — Service de diagnostic de peau par VLM (glm-4.6v via z-ai-web-dev-sdk)
// IMPORTANT : backend uniquement.
//
// PIPELINE 2 PHASES (t. 77) : la latence de glm-4.6v est dominée par la
// GÉNÉRATION de tokens (~10-15 tok/s, forte variance 18-77 s mesurées sur
// un JSON détaillé). Découpage + format compact :
//   Phase 1 — vision au format MAP (indicateurs {nom:score}, notes seulement
//   pour les 3 plus faibles) : ~500-600 chars de sortie → ~10-18 s médian.
//   Phase 2 — LLM texte glm-4.6 (recommandations personnalisées) : ~4 s.
//   Gardes : 45 s + 20 s = 65 s pire cas, dans la fenêtre du poll front
//   (100 s). L'image client (820 px JPEG ~86 Ko via resizeImage) part telle
//   quelle : les tests montrent que la taille d'image n'est PAS le facteur
//   dominant — et sharp est BANNI des routes API (import natif = OOM kill
//   du next-server au compile, t. 77 — cf. worklog).
import ZAI from "z-ai-web-dev-sdk";
import type { VisionMessage } from "z-ai-web-dev-sdk";
import type { BodyZone, DiagnosisResult, Indicator, RecommendationSet, SuspectedCondition, ZoneMark } from "@/lib/kene/types";
import { ZONE_INDICATORS } from "@/lib/kene/types";
import { hypothesesFromVlm, vlmCatalogForZone } from "@/lib/kene/conditions";
import { severityFromPercent } from "@/lib/kene/format";
import { withTimeout } from "@/lib/kene/with-timeout";

/** Gardes par phase (t. 77) : 40 s vision (variance de service mesurée
 *  18-77 s — au-delà, le fallback déterministe est plus utile qu'une
 *  attente indéterminée) + retry 25 s + 15 s texte = 80 s pire cas,
 *  sous la fenêtre du poll front (100 s) avec la marge d'écriture DB. */
const VLM_TIMEOUT_MS = 40_000;
const VLM_RETRY_TIMEOUT_MS = 25_000;
const LLM_TIMEOUT_MS = 15_000;

/** Garde de type minimale (runtime safe) pour les réponses JSON du VLM. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Phase 1 — prompt vision au FORMAT COMPACT (t. 77) : indicateurs en map
 *  {nom: score} (zéro note par défaut), notes uniquement pour les 3 plus
 *  faibles (champ focus), marquages en tableaux courts. Sortie ~500-600
 *  caractères même pour le visage (14 indicateurs) — contre ~1 800 en
 *  tableau détaillé : c'est la génération qui dominait (18-77 s mesurés). */
function buildAnalysisPrompt(zone: BodyZone, knownFitz?: string, allergies?: string): string {
  const indicateurs = ZONE_INDICATORS[zone];
  const abcdePart =
    zone === "naevi"
      ? `,"abcde":[["A","Asymétrie",<true|false>,"≤ 40 caractères"],...]`
      : "";
  return `Analyse cutanée de peau mélanoderme (Fitzpatrick IV-VI), zone « ${zone} ».${knownFitz ? ` Phototype déclaré : ${knownFitz}.` : ""}${allergies ? ` Allergies : ${allergies}.` : ""}
Catalogue des affections africaines plausibles sur cette zone (id=signature visuelle sur peau noire) : ${vlmCatalogForZone(zone)}.
Ne pas confondre pigmentation naturelle et pathologie. L'érythème est masqué sur peau foncée : chercher la teinte violacée-brune.
Réponds STRICTEMENT en JSON ultra-compact (≤ 650 caractères, sans markdown, sans texte autour) :
{"score":<0-100>,"fitz":"IV"|"V"|"VI"|"III","ind":{${indicateurs.map((i) => `"${i}":<0-100>`).join(",")}},"marks":[["<zone>",<x 0-100>,<y 0-100>,<w 10-28>,<h 10-28>,<sev 0-3>],...],"focus":[["<indicateur le plus faible>","<note ≤ 40 caractères>"],...2-3 entrées],"conds":[["<id du catalogue>",<confiance 0-100>],...0-2],"derm":<bool>,"why":"<si derm, ≤ 80 caractères>"${abcdePart}}
Règles : TOUS les indicateurs listés dans "ind" ; 4 à 6 marks ; sev 0=sain 1=léger 2=modéré 3=marqué ; conds = UNIQUEMENT des ids du catalogue ci-dessus (la/les plus probables, 0-2, confiance ≥ 40 seulement) ; si la photo ne montre pas de peau : score 0, derm false, conds vide.`;
}

/** Phase 2 — prompt texte (glm-4.6) : recommandations personnalisées à partir
 *  de l'analyse réelle. Texte pur = génération rapide (~4 s). */
function buildRecommendationsPrompt(analysisJson: string, zone: BodyZone): string {
  return `Tu es conseillère beauté Kènè, spécialiste des peaux mélanodermes africaines. Botaniques maison : karité, moringa, baobab, bissap, aloka.
Analyse cutanée récente (zone « ${zone} ») : ${analysisJson.slice(0, 700)}
Rédige des recommandations personnalisées cohérentes avec CES résultats. JSON STRICT compact (≤ 700 caractères, sans texte autour) :
{"resume":"<2 phrases, ton bienveillant, tutoiement>","routine_matin":["≤ 3 étapes courtes"],"routine_soir":["≤ 3 étapes courtes"],"botaniques_conseillees":["≤ 3"],"produits":["≤ 2 types"],"soins_conseilles":["≤ 2 soins en institut"],"conseils_hygiene_vie":["≤ 2"]}`;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const attempts: string[] = [cleaned];
  // Variance du modèle (t. 77, mesurée) : le JSON revient presque toujours
  // bien formé MAIS parfois avec des étiquettes nues dans les tableaux
  // ([Joue G,25,55,…]) ou des clés nues ({Hydratation:85}). Deux réparations
  // ciblées, appliquées EN CASCADE seulement si le parse direct échoue —
  // le JSON valide ne passe jamais par les regex.
  const fixKeys = (s: string) =>
    s.replace(/([{,]\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _()&/'\u2019_-]*?)\s*:/g, '$1"$2":');
  const fixElems = (s: string) =>
    s.replace(/([,\[]\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _()&/'\u2019_-]*?)(\s*[,}\]])/g, '$1"$2"$3');
  const k = fixKeys(cleaned);
  const e = fixElems(cleaned);
  if (k !== cleaned) attempts.push(k);
  if (e !== cleaned) attempts.push(e);
  if (k !== cleaned && e !== cleaned) attempts.push(fixElems(k));
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
 *  Accepte les DEUX formats (t. 77) : le compact ({ind:{nom:score},
 *  marks:[[label,x,y,w,h,sev]], focus:[[nom,note]], derm, why}) et l'ancien
 *  détaillé (indicateurs[], zones_marquages[], orientation_dermato) —
 *  rétrocompatibilité si le modèle répond à l'ancien format.
 *  t. 84 : champ `conds` → hypothèses de l'atlas africain, validées par
 *  hypothesesFromVlm (ids exacts + zone cohérente + confiance ≥ 25). */
function normalizeAnalysis(
  raw: unknown,
  zone: BodyZone,
): Omit<DiagnosisResult, "recommandations" | "source" | "confidence" | "avertissement"> | null {
  if (!isRecord(raw)) return null;
  const o: Record<string, unknown> = raw;
  const indicateursList = ZONE_INDICATORS[zone];

  // Notes de réalisme : champ focus [[nom, note]] du format compact.
  const focusNotes = new Map<string, string>();
  const focusIn = coerceArray<unknown>(o.focus);
  for (const f of focusIn) {
    if (Array.isArray(f) && typeof f[0] === "string") {
      focusNotes.set(String(f[0]).toLowerCase().slice(0, 12), String(f[1] ?? "").slice(0, 160));
    }
  }
  // + notes éventuelles de l'ancien format (indicateurs[].note).
  const oldInd = coerceArray<Record<string, unknown>>(o.indicateurs);
  for (const i of oldInd) {
    if (i && typeof i.nom === "string" && typeof i.note === "string") {
      focusNotes.set(String(i.nom).toLowerCase().slice(0, 12), String(i.note).slice(0, 160));
    }
  }

  // Scores : map compacte "ind" {nom: nombre} ou ancien tableau indicateurs[].
  const indMap = isRecord(o.ind) ? o.ind : null;
  const indicateurs: Indicator[] = indicateursList.map((nom) => {
    const pct = clamp(indMap?.[nom] ?? oldInd.find((i) => i && String(i.nom).toLowerCase().includes(nom.toLowerCase().slice(0, 10)))?.pourcentage, 0, 100, 70);
    const note = focusNotes.get(nom.toLowerCase().slice(0, 12)) || undefined;
    return {
      nom,
      pourcentage: pct,
      severite: severityFromPercent(pct),
      note,
    };
  });
  if (indicateurs.length === 0) return null;

  // Marquages : tableaux courts [[label,x,y,w,h,sev]] ou anciens objets.
  // Échelle auto (t. 77) : le modèle émet parfois des coordonnées ×10
  // (grille pixel 0-1000 au lieu du % 0-100 — mesuré : 180/480/820…).
  // Détection : une quelconque coordonnée x/y > 100 → TOUTE la géométrie
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

  // ABCDE : paires [[critere, intitule, alerte, detail]] ou anciens objets.
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
  const scoreGlobal = clamp(o.score ?? o.score_global, 0, 100, Math.round(validScore));
  const derm = o.derm ?? o.orientation_dermato;
  const why = o.why ?? o.raison_orientation;
  const fitzRaw = o.fitz ?? o.fitzpatrick_estime;

  // t. 84 — hypothèses de l'atlas africain : validation ANTI-HALLUCINATION
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
    fitzpatrick_estime: ["III", "IV", "V", "VI"].includes(String(fitzRaw)) ? String(fitzRaw) : undefined,
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
    botaniques_conseillees: coerceArray<string>(o.botaniques_conseilles).slice(0, 6).map(String),
    produits: coerceArray<string>(o.produits).slice(0, 8).map(String),
    soins_conseilles: coerceArray<string>(o.soins_conseilles).slice(0, 6).map(String),
    conseils_hygiene_vie: coerceArray<string>(o.conseils_hygiene_vie).slice(0, 6).map(String),
  };
  if (rec.routine_matin.length === 0 && rec.routine_soir.length === 0) return null;
  return rec;
}

/** Phase 2 (fallback) — recommandations déterministes dérivées de l'ANALYSE
 *  réelle : la phase 1 a réussi, seule la rédaction LLM a échoué → les conseils
 *  restent personnalisés par indicateurs (les plus faibles d'abord). */
function ruleRecommendations(
  analysis: Omit<DiagnosisResult, "recommandations" | "source" | "confidence" | "avertissement">,
): RecommendationSet {
  const byPct = [...analysis.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage);
  const worst = byPct[0];
  const worstNames = new Set(byPct.slice(0, 3).map((i) => i.nom.toLowerCase()));
  const has = (needle: string) => [...worstNames].some((n) => n.includes(needle));

  const matin: string[] = ["Nettoyant doux sans savon"];
  if (has("pigment") || has("tache")) matin.push("Sérum vitamine C stabilisé", "Crème solaire SPF 50 teintée");
  else if (has("imperf") || has("acn") || has("sébum")) matin.push("Sérum niacinamide 5 %", "Crème solaire SPF 50 teintée");
  else matin.push("Brume hydratante aloka", "Crème solaire SPF 50 teintée");

  const soir: string[] = ["Démaquillant huileux karité", "Nettoyant doux"];
  if (has("hydrat") || has("barri") || has("sécher")) soir.push("Baume réparateur karité nuit");
  else if (has("imperf") || has("acn")) soir.push("Sérum niacinamide 5 %");
  else soir.push("Huile nourricière baobab nuit");

  const botaniques = has("pigment") || has("éclat")
    ? ["Moringa", "Bissap", "Baobab"]
    : has("hydrat")
      ? ["Karité", "Aloka", "Moringa"]
      : ["Karité", "Moringa", "Baobab"];

  return {
    resume: `Ton score de santé cutanée est de ${analysis.score_global}/100. L'indicateur à surveiller en priorité est « ${worst?.nom ?? "l'équilibre général"} » (${worst ? worst.pourcentage : "-"} %) — la routine ci-dessous cible ces zones en priorité. Reste régulière : la peau mélanoderme adore la constance.`,
    routine_matin: matin,
    routine_soir: soir,
    botaniques_conseillees: botaniques,
    produits: ["Sérum Éclat Moringa", "Baume Nuit Karité"],
    soins_conseilles: ["Soin éclat mélanoderme en institut"],
    conseils_hygiene_vie: ["Boire 1,5 L d'eau/jour", "Dormir 7-8 h"],
  };
}

/** Fallback déterministe si le VLM échoue (POC toujours fonctionnel) */
export function fallbackResult(zone: BodyZone, seed: number): DiagnosisResult {
  const rand = (i: number) => {
    const x = Math.sin(seed * 97.13 + i * 41.7) * 10000;
    return x - Math.floor(x);
  };
  const names = ZONE_INDICATORS[zone];
  const indicateurs: Indicator[] = names.map((nom, i) => {
    const pct = Math.round(45 + rand(i) * 50);
    return { nom, pourcentage: pct, severite: severityFromPercent(pct) };
  });
  const score = Math.round(indicateurs.reduce((s, i) => s + i.pourcentage, 0) / indicateurs.length);
  const marquages: ZoneMark[] = [
    { label: "Zone T", x: 50, y: 32, w: 34, h: 22, severite: Math.min(3, Math.round(rand(1) * 3)) },
    { label: "Joue gauche", x: 28, y: 52, w: 20, h: 20, severite: Math.min(3, Math.round(rand(2) * 3)) },
    { label: "Joue droite", x: 72, y: 52, w: 20, h: 20, severite: Math.min(3, Math.round(rand(3) * 3)) },
    { label: "Menton", x: 50, y: 74, w: 18, h: 14, severite: Math.min(3, Math.round(rand(4) * 3)) },
  ].slice(0, zone === "visage" ? 4 : 2);

  return {
    score_global: score,
    fitzpatrick_estime: "V",
    zone,
    indicateurs,
    zones_marquages: marquages,
    recommandations: {
      resume:
        "Analyse simulée (mode secours). Votre peau montre une hydratation correcte avec des zones de pigmentation à surveiller — routine adaptative proposée.",
      routine_matin: ["Nettoyant doux sans savon", "Brume hydratante aloka", "Sérum vitamine C stabilisé", "Crème solaire SPF 50 teintée"],
      routine_soir: ["Démaquillant huileux karité", "Nettoyant doux", "Sérum niacinamide 5 %", "Baume réparateur nuit"],
      botaniques_conseillees: ["Karité", "Moringa", "Baobab", "Bissap"],
      produits: ["Sérum Éclat Moringa", "Baume Nuit Karité"],
      soins_conseilles: ["Soin éclat mélanoderme en institut"],
      conseils_hygiene_vie: ["Boire 1,5 L d'eau/jour", "Dormir 7-8 h", "Éviter le percutané maison non stérile"],
    },
    orientation_dermato: false,
    avertissement: "Mode secours : résultat simulé car le moteur IA est momentanément indisponible.",
    source: "fallback",
    // Champ confiance (t. 71) : mode secours déterministe → « indicative ».
    confidence: "indicative",
  };
}

/** Appel principal — pipeline 2 phases (t. 77) avec fallback par phase.
 *  Phase 1 : vision minimale (analyse réelle de la photo, ~12 s).
 *  Phase 2 : LLM texte (recommandations personnalisées, ~4 s) — si elle
 *  échoue, des recommandations dérivées de l'analyse réelle prennent le
 *  relais (le diagnostic reste « haute » confiance : la vision a réussi).
 *  Phase 1 en échec → fallback global déterministe (mode secours assumé). */
export async function runDiagnosis(opts: {
  imageBase64: string; // data URL complète
  zone: BodyZone;
  fitzpatrick?: string;
  allergies?: string;
}): Promise<DiagnosisResult> {
  const { imageBase64, zone, fitzpatrick, allergies } = opts;
  const seed = Date.now() % 1000;
  try {
    const zai = await ZAI.create();

    // ── Phase 1 : vision compacte — 2 tentatives (variance de format du
    // modèle : un JSON tronqué/enrobé tombe dans extractJson → retry une
    // fois ; la 2e réponse est souvent propre). ──────────────────────────
    let analysis: ReturnType<typeof normalizeAnalysis> = null;
    let lastRaw = "";
    for (let attempt = 0; attempt < 2 && !analysis; attempt += 1) {
      const messages: VisionMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: buildAnalysisPrompt(zone, fitzpatrick, allergies) },
            { type: "image_url", image_url: { url: imageBase64 } },
          ],
        },
      ];
      const response = await withTimeout(
        zai.chat.completions.createVision({
          model: "glm-4.6v",
          messages,
          thinking: { type: "disabled" },
        }),
        attempt === 0 ? VLM_TIMEOUT_MS : VLM_RETRY_TIMEOUT_MS,
        "vlm:vision",
      );
      lastRaw = response.choices[0]?.message?.content ?? "";
      analysis = normalizeAnalysis(extractJson(lastRaw), zone);
      if (!analysis) {
        console.error(
          `[kene:vlm] phase 1 réponse illisible (tentative ${attempt + 1}/2) — complet :`,
          lastRaw.slice(0, 2000).replace(/\s+/g, " "),
        );
      }
    }
    if (!analysis) return fallbackResult(zone, seed);

    // ── Phase 2 : recommandations rédigées (LLM texte rapide) ──────────
    let recommandations: RecommendationSet | null = null;
    try {
      const recResponse = await withTimeout(
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
              ),
            },
          ],
          thinking: { type: "disabled" },
        }),
        LLM_TIMEOUT_MS,
        "vlm:reco",
      );
      recommandations = normalizeRecommendations(extractJson(recResponse.choices[0]?.message?.content ?? ""));
    } catch (err) {
      console.error("[kene:vlm] recommandations LLM indisponible (règles locales) :", (err as Error).message);
    }
    if (!recommandations) recommandations = ruleRecommendations(analysis);

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
    return fallbackResult(zone, seed);
  }
}

/** Triage photo dans le chat dermato (vert/jaune/rouge) */
export async function triageLesion(imageBase64: string): Promise<{ niveau: "vert" | "jaune" | "rouge"; message: string }> {
  try {
    const zai = await ZAI.create();
    const messages: VisionMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Tu es l'assistant triage Kènè. Analyse cette photo de lésion cutanée sur peau mélanoderme. Réponds STRICTEMENT en JSON: {"niveau":"vert"|"jaune"|"rouge","message":"<3 phrases max en français, ton rassurant, avec conseil botanique africain si vert, appel à une dermo-conseillère si jaune, urgence dermatologique si rouge>"}. Vert = bénin/soin routine. Jaune = avis dermo-conseillère requis. Rouge = signes ABCDE suspects → consultation immédiate.`,
          },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      },
    ];
    const response = await withTimeout(
      zai.chat.completions.createVision({
        model: "glm-4.6v",
        messages,
        thinking: { type: "disabled" },
      }),
      VLM_TIMEOUT_MS,
      "vlm:triage",
    );
    const raw = response.choices[0]?.message?.content ?? "{}";
    const json = extractJson(raw);
    const niveauRaw = isRecord(json) ? String(json.niveau ?? "") : "";
    const niveau: "vert" | "jaune" | "rouge" = niveauRaw === "vert" || niveauRaw === "rouge" ? niveauRaw : "jaune";
    const message =
      isRecord(json) && typeof json.message === "string" && json.message.trim()
        ? json.message
        : "Photo reçue. Un examen plus approfondi est recommandé : je vous oriente vers une dermo-conseillère Kènè.";
    return { niveau, message };
  } catch {
    return {
      niveau: "jaune",
      message: "La photo a bien été reçue, mais l'analyse IA est momentanément indisponible. Je vous conseille de prendre rendez-vous avec une dermo-conseillère partenaire Kènè pour un avis fiable.",
    };
  }
}
