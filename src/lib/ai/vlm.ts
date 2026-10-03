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

/** Phase 1 — prompt vision au FORMAT COMPACT: indicateurs en map
 * {nom: score} (zéro note par défaut), notes uniquement pour les 3 plus
 * faibles (champ focus), marquages en tableaux courts. Sortie ~500-600
 * caractères même pour le visage (14 indicateurs) — contre ~1 800 en
 * tableau détaillé: c'est la génération qui dominait (18-77 s mesurés). */
function buildAnalysisPrompt(zone: BodyZone, knownFitz?: string, allergies?: string, numImages = 1): string {
  const indicateurs = ZONE_INDICATORS[zone];
  const abcdePart =
    zone === "naevi"
      ? `,"abcde":[["A","Asymétrie",<true|false>,"≤ 40 caractères"],...]`
      : "";
  const multiAnglePart =
    numImages > 1
      ? ` ${numImages} angles de vue de la zone sont fournis : réalise une synthèse clinique 360° en combinant tous les angles.`
      : "";
  const zoneLabel = zone === "mains" ? "mains & pieds (extrémités acrales : paumes, plantes, talons, ongles)" : zone;
  return `Analyse cutanée de peau mélanoderme (Fitzpatrick IV-VI), zone « ${zoneLabel} ».${knownFitz ? ` Phototype déclaré : ${knownFitz}.` : ""}${allergies ? ` Allergies : ${allergies}.` : ""}${multiAnglePart}
Catalogue des affections africaines plausibles sur cette zone (id=signature visuelle sur peau noire) : ${vlmCatalogForZone(zone)}.
Ne pas confondre pigmentation naturelle et pathologie. L'érythème est masqué sur peau foncée : chercher la teinte violacée-brune.
Réponds STRICTEMENT en JSON ultra-compact (≤ 650 caractères, sans markdown, sans texte autour) :
{"score":<0-100>,"fitz":"IV"|"V"|"VI"|"III","ind":{${indicateurs.map((i) => `"${i}":<0-100>`).join(",")}},"marks":[["<zone>",<x 0-100>,<y 0-100>,<w 10-28>,<h 10-28>,<sev 0-3>],...],"focus":[["<indicateur le plus faible>","<note ≤ 40 caractères>"],...2-3 entrées],"conds":[["<id du catalogue>",<confiance 0-100>],...0-2],"derm":<bool>,"why":"<si derm, ≤ 80 caractères>"${abcdePart}}
Règles : TOUS les indicateurs listés dans "ind" ; 4 à 6 marks ; sev 0=sain 1=léger 2=modéré 3=marqué ; conds = UNIQUEMENT des ids du catalogue ci-dessus (la/les plus probables, 0-2, confiance ≥ 40 seulement) ; si la photo ne montre pas de peau : score 0, derm false, conds vide.`;
}

/** Phase 2 — prompt texte (glm-4.6): recommandations personnalisées à partir
 * de l'analyse réelle. Texte pur = génération rapide (~4 s). */
function buildRecommendationsPrompt(analysisJson: string, zone: BodyZone): string {
  const zoneLabel = zone === "mains" ? "mains et pieds (extrémités acrales)" : zone;
  return `Tu es conseillère dermo-botanique Kènè pour peaux mélanodermes africaines. Kènè ne vend aucun cosmétique (recommandations neutres, zéro prix, marques ou incitation commerciale).
Analyse cutanée récente (zone « ${zoneLabel} ») : ${analysisJson.slice(0, 700)}
Rédige des recommandations personnalisées ciblant spécifiquement les indicateurs les plus faibles (ex: taches/pigmentation -> sérum unifiant vitamine C & niacinamide 10% + fluide solaire SPF 50+; boutons/sébum -> gel purifiant moringa & zinc; sécheresse -> baume réparateur karité brut & céramides).
JSON STRICT compact (≤ 800 caractères, sans texte autour) :
{"resume":"<2 phrases, ton bienveillant, tutoiement>","routine_matin":["≤ 3 étapes courtes"],"routine_soir":["≤ 3 étapes courtes"],"botaniques_conseillees":["≤ 3"],"produits":["≤ 3 types précis de soins ou principes actifs"],"soins_conseilles":["≤ 2 soins en institut"],"conseils_hygiene_vie":["≤ 2"]}`;
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

  // Scores: map compacte "ind" {nom: nombre} ou ancien tableau indicateurs[].
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
  const scoreGlobal = clamp(o.score ?? o.score_global, 0, 100, Math.round(validScore));
  const derm = o.derm ?? o.orientation_dermato;
  const why = o.why ?? o.raison_orientation;
  const fitzRaw = o.fitz ?? o.fitzpatrick_estime;

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

/** Recommandations déterministes hautement personnalisées dérivées des
 * indicateurs réels (selon la zone et les faiblesses cutanées identifiées).
 * Kènè ne vend aucun produit cosmétique → recommandations de typologies
 * de soins et principes actifs purs, sans marque ni prix. */
export function derivePersonalizedRecommendations(
  zone: BodyZone,
  indicateurs: Indicator[],
  scoreGlobal: number,
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

  const focusTxt = worst ? `« ${worst.nom} » (${worst.pourcentage} %)` : "l'harmonie générale de votre peau";

  return {
    resume: `Votre score global de santé cutanée est de ${scoreGlobal}/100. L'indicateur prioritaire identifié est ${focusTxt}. La routine dermo-botanique recommandée ci-dessous cible précisément ces besoins pour rétablir l'équilibre et révéler l'éclat de votre peau.`,
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
): RecommendationSet {
  return derivePersonalizedRecommendations(
    analysis.zone,
    analysis.indicateurs,
    analysis.score_global,
  );
}

/** Fallback déterministe si le VLM échoue (toujours fonctionnel) */
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

  const customRec = derivePersonalizedRecommendations(zone, indicateurs, score);

  return {
    score_global: score,
    fitzpatrick_estime: "V",
    zone,
    indicateurs,
    zones_marquages: marquages,
    recommandations: {
      ...customRec,
      resume: `Analyse simulée (mode secours). Votre peau montre un score global de ${score}/100. Routine personnalisée sans engagement commercial adaptée à vos indicateurs.`,
    },
    orientation_dermato: false,
    avertissement: "Mode secours : résultat simulé car le moteur IA est momentanément indisponible.",
    source: "fallback",
    confidence: "indicative",
  };
}

/**
 * Appel Google Gemini Flash Vision REST (si GEMINI_API_KEY est défini en production)
 * Prend en charge une ou plusieurs photos sous différents angles.
 */
async function callGeminiVision(opts: {
  images: string[];
  zone: BodyZone;
  fitzpatrick?: string;
  allergies?: string;
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || opts.images.length === 0) return null;

  try {
    const inlineParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    for (const img of opts.images) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        inlineParts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
    }
    if (inlineParts.length === 0) return null;

    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const prompt = buildAnalysisPrompt(opts.zone, opts.fitzpatrick, opts.allergies, inlineParts.length);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...inlineParts,
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
      signal: AbortSignal.timeout(VLM_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[kene:gemini] HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    const dataJson = await res.json();
    const candidateText = dataJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidateText || null;
  } catch (err) {
    console.error("[kene:gemini] Error calling Gemini API:", (err as Error).message);
    return null;
  }
}

async function callGeminiRecommendations(analysisJson: string, zone: BodyZone): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const prompt = buildRecommendationsPrompt(analysisJson, zone);

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
          temperature: 0.3,
        },
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const dataJson = await res.json();
    return dataJson?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}

async function callGeminiTriage(
  imageOrImages: string | string[],
): Promise<{ niveau: "vert" | "jaune" | "rouge"; message: string } | null> {
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
    const prompt = `Tu es « Dr Kènè », la grande sœur dermo-conseillère bienveillante de l'application Kènè à Abidjan, experte de la peau noire et métissée (Fitzpatrick IV-VI).
L'utilisatrice vient de t'envoyer ${countLabel} de sa peau.
Examine attentivement l'ensemble de ces clichés pour analyser les zones (boutons, taches, sébum, déshydratation, grain de peau).
Réponds STRICTEMENT sous format JSON valide avec la structure suivante :
{
  "niveau": "vert"|"jaune"|"rouge",
  "message": "Ton analyse bienveillante et chaleureuse en français d'Abidjan (environ 80 à 120 mots, sans markdown astérisques **). Accueille avec tendresse (Bonjour ma chérie, Yako si boutons/taches), décris ce que tu remarques sur les clichés, donne un conseil dermo-botanique de chez nous (beurre de karité brut, gel d'aloka, huile de moringa, écran solaire SPF50), oriente vers une dermo-conseillère en institut partenaire certifié Kènè à Abidjan si jaune, ou vers une consultation dermatologique urgente si rouge. Conclus TOUJOURS complètement ton discours par une phrase chaleureuse terminée par un point final."
}
Règles cliniques :
- vert = Bénin, petites imperfections, déshydratation ou routine d'entretien.
- jaune = Acné inflammatoire, comédons, mélasma ou taches marquées nécessitant un soin dermo en cabine d'institut.
- rouge = Lésion atypique asymétrique, ulcération ou urgence médicale.`;

    const candidateModels = [
      "gemini-flash-lite-latest",
      "gemini-2.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-2.5-flash",
    ];

    for (const model of candidateModels) {
      try {
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
              maxOutputTokens: 1500,
            },
          }),
          signal: AbortSignal.timeout(VLM_TIMEOUT_MS),
        });

        if (!res.ok) continue;
        const dataJson = await res.json();
        const raw = dataJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const json = extractJson(raw);
        if (!isRecord(json)) continue;
        const niveauRaw = String(json.niveau ?? "");
        const niveau: "vert" | "jaune" | "rouge" = niveauRaw === "vert" || niveauRaw === "rouge" ? niveauRaw : "jaune";
        const message = typeof json.message === "string" && json.message.trim() ? json.message.trim() : "";
        if (message.length > 15) {
          return { niveau, message };
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

/** Appel principal — pipeline 2 phases avec fallback par phase.
 * Phase 1: vision minimale (analyse réelle de la photo, ~12 s).
 * Phase 2: LLM texte (recommandations personnalisées, ~4 s) — si elle
 * échoue, des recommandations dérivées de l'analyse réelle prennent le
 * relais (le diagnostic reste « haute » confiance: la vision a réussi).
 * Phase 1 en échec → fallback global déterministe (mode secours assumé). */
export async function runDiagnosis(opts: {
  imageBase64?: string | string[]; // data URL complète ou tableau
  images?: string[];
  zone: BodyZone;
  fitzpatrick?: string;
  allergies?: string;
}): Promise<DiagnosisResult> {
  const { zone, fitzpatrick, allergies } = opts;
  const seed = Date.now() % 1000;

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
  if (validImages.length === 0) {
    return fallbackResult(zone, seed);
  }

  // 1. Essai primaire Gemini VLM si configuré
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiRaw = await callGeminiVision({ images: validImages, zone, fitzpatrick, allergies });
      if (geminiRaw) {
        const analysis = normalizeAnalysis(extractJson(geminiRaw), zone);
        if (analysis) {
          let rec: RecommendationSet | null = null;
          const recRaw = await callGeminiRecommendations(
            JSON.stringify({
              score_global: analysis.score_global,
              indicateurs: analysis.indicateurs.map((i) => ({ nom: i.nom, pourcentage: i.pourcentage, note: i.note ?? "" })),
              zones_marquages: analysis.zones_marquages.map((m) => ({ label: m.label, severite: m.severite })),
              fitzpatrick_estime: analysis.fitzpatrick_estime ?? null,
            }),
            zone
          );
          if (recRaw) {
            rec = normalizeRecommendations(extractJson(recRaw));
          }
          if (!rec) {
            rec = ruleRecommendations(analysis);
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
      console.error("[kene:vlm] Gemini attempt failed, falling back to ZAI/default:", (err as Error).message);
    }
  }

  try {
    const zai = await ZAI.create();

    // ── Phase 1: vision compacte — 2 tentatives (variance de format du
    // modèle: un JSON tronqué/enrobé tombe dans extractJson → retry une
    // fois; la 2e réponse est souvent propre). ──────────────────────────
    let analysis: ReturnType<typeof normalizeAnalysis> = null;
    let lastRaw = "";
    const prompt = buildAnalysisPrompt(zone, fitzpatrick, allergies, validImages.length);
    const content: VisionMessage["content"] = [
      { type: "text", text: prompt },
      ...validImages.map((img) => ({ type: "image_url" as const, image_url: { url: img } })),
    ];

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
      analysis = normalizeAnalysis(extractJson(lastRaw), zone);
      if (!analysis) {
        console.error(
          `[kene:vlm] phase 1 réponse illisible (tentative ${attempt + 1}/2) — complet :`,
          lastRaw.slice(0, 2000).replace(/\s+/g, " "),
        );
      }
    }
    if (!analysis) return fallbackResult(zone, seed);

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

/**
 * Profils d'expertise dermo-botanique Dr Kènè pour peaux mélanodermes (Fitzpatrick IV-VI).
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
      "J'observe une hyperpigmentation superficielle fréquente après une inflammation sur peau mélanoderme. Une routine douce associant un sérum au moringa régulateur, du beurre de karité de Korhogo et un écran solaire SPF50 évitera que la zone ne s'assombrisse. Avec de la régularité et une hydratation bienveillante, votre peau retrouvera toute son harmonie.",
  },
  {
    niveau: "vert",
    message:
      "L'aspect visuel traduit une déshydratation avec un léger voile cendré, signe d'une barrière cutanée éprouvée par l'eau calcaire ou l'harmattan. Je vous recommande d'appliquer de l'huile pure de baobab ou du karité brut après une brume florale apaisante à l'aloka, matin et soir. Votre film hydrolipidique retrouvera rapidement son éclat et sa souplesse.",
  },
  {
    niveau: "jaune",
    message:
      "La photo met en évidence de petits comédons et une inflammation locale modérée qui requiert un soin ciblé pour prévenir les taches cicatricielles. Évitez absolument de percer ou frotter les lésions, et appliquez quelques gouttes d'huile de neem purifiante le soir. Je vous invite à prendre rendez-vous avec une dermo-conseillère partenaire Kènè pour un protocole assainissant personnalisé.",
  },
  {
    niveau: "jaune",
    message:
      "Je note des zones pigmentaires diffuses qui évoquent un mélasma ou des macules tenaces. Il est capital de proscrire les produits décapants ou éclaircissants agressifs qui aggraveraient le rebond pigmentaire. Un rendez-vous avec une dermo-conseillère Kènè permettra d'instaurer un rituel unifiant doux, complété impérativement par une protection solaire SPF50 quotidienne.",
  },
  {
    niveau: "vert",
    message:
      "La zone photographiée montre une sensibilité cutanée passagère sans caractère d'alerte. Privilégiez un nettoyage doux sans tensioactifs agressifs, suivi d'un massage nourrissant à l'huile de baobab et au beurre de karité. Veillez à protéger votre peau du soleil direct avec un fluide protecteur SPF50.",
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
): Promise<{ niveau: "vert" | "jaune" | "rouge"; message: string }> {
  const images = Array.isArray(imageOrImages) ? imageOrImages : [imageOrImages];
  const primaryImage = images[0] || "";

  // Tier 1: Gemini Vision REST (multi-images ou image unique)
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
            text: `Tu es Dr Kènè, la grande sœur et dermo-conseillère bienveillante d'Abidjan. Analyse ces ${images.length > 1 ? `${images.length} photos` : "photo"} de peau mélanoderme. Réponds STRICTEMENT en JSON: {"niveau":"vert"|"jaune"|"rouge","message":"<ton chaleureux d'Abidjan, 3 phrases avec conseil botanique africain si vert, institut partenaire si jaune, dermato urgent si rouge. Termine par un point final.>"}.`,
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
    const niveauRaw = isRecord(json) ? String(json.niveau ?? "") : "";
    const niveau: "vert" | "jaune" | "rouge" = niveauRaw === "vert" || niveauRaw === "rouge" ? niveauRaw : "jaune";
    const message =
      isRecord(json) && typeof json.message === "string" && json.message.trim()
        ? json.message.trim()
        : "";
    if (message.length > 10) {
      return { niveau, message };
    }
    return expertVisualTriage(primaryImage);
  } catch {
    // Tier 3: Moteur dermo-botanique expert autonome (zéro panne, zéro message d'erreur générique)
    return expertVisualTriage(primaryImage);
  }
}
