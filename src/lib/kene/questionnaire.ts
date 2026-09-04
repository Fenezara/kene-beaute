// Kènè — Questionnaire dermatologique « Diagnostic en institut »
// Lib PURE (aucune dépendance React/serveur) : définition des questions,
// moteur de scoring par indicateur, drapeaux de vigilance, recommandations
// et fusion questionnaire ± analyse VLM (photo de cabine).
// L'entreprise réalise le diagnostic au sein de sa structure : la praticienne
// mène l'entretien (les réponses sont déclarées par la cliente), la photo
// apporte l'observation — les deux se combinent en un score unique.

import { severityFromPercent } from "@/lib/kene/format";
import type { BodyZone, DiagnosisResult, Indicator, RecommendationSet } from "@/lib/kene/types";
import { ZONE_INDICATORS } from "@/lib/kene/types";

// ─────────────────────────── Types ───────────────────────────

export type QFlagLevel = "info" | "warn" | "danger";

export interface QFlag {
  level: QFlagLevel;
  label: string;
  detail?: string;
}

/** Effets d'une option : clé mot-clé d'indicateur → delta de score santé. */
type Effects = Record<string, number>;

export interface QOption {
  value: string;
  label: string;
  effects?: Effects;
  flag?: Omit<QFlag, "level"> & { level?: QFlagLevel };
}

export interface Question {
  id: string;
  section: string;
  label: string;
  help?: string;
  type: "single" | "multi" | "text";
  options: QOption[];
  required?: boolean; // single : une option · multi : ≥ 1 · text : jamais requis
  placeholder?: string;
  /** sensible : entouré visuellement (dépigmentation, grossesse…) */
  sensitive?: boolean;
}

export interface QSection {
  id: string;
  label: string;
  description: string;
}

export type QAnswers = Record<string, string | string[]>;

export interface QuestionnaireResult {
  scoreGlobal: number;
  indicateurs: Indicator[];
  flags: QFlag[];
  recommandations: RecommendationSet;
  answered: number;
  total: number;
}

export type ProDiagSource = "questionnaire" | "vlm+questionnaire" | "vlm" | "fallback";

export interface ProDiagnosisResult extends Omit<DiagnosisResult, "source"> {
  source: ProDiagSource;
  questionnaire: {
    score: number; // score du questionnaire seul
    flags: QFlag[];
    answered: number;
    total: number;
    photoUsed: boolean;
  };
}

// ─────────────────────────── Définition du questionnaire ───────────────────────────

export const QUESTIONNAIRE_SECTIONS: QSection[] = [
  { id: "peau", label: "La peau", description: "Type, phototype et inquiétudes déclarées" },
  { id: "routine", label: "Routine actuelle", description: "Habitudes de soin au quotidien" },
  { id: "vie", label: "Mode de vie", description: "Soleil, sommeil, stress, hydratation" },
  { id: "sante", label: "Santé & antécédents", description: "Vigilances avant tout protocole" },
];

export const QUESTIONS: Question[] = [
  // ── La peau ──
  {
    id: "skin_type",
    section: "peau",
    label: "Type de peau",
    help: "Au toucher, 2 h après le nettoyage",
    type: "single",
    required: true,
    options: [
      { value: "grasse", label: "Grasse — brille vite", effects: { sebum: -10, pores: -6, acne: -4, texture: -4 } },
      { value: "seche", label: "Sèche — tire", effects: { secheresse: -14, hydrat: -10, barriere: -6 } },
      { value: "mixte", label: "Mixte — zone T grasse", effects: { sebum: -6, hydrat: -4 } },
      { value: "normale", label: "Normale" },
      { value: "sensible", label: "Sensible — réagit vite", effects: { barriere: -12, rougeur: -8, irrit: -8 } },
    ],
  },
  {
    id: "fitz",
    section: "peau",
    label: "Phototype Fitzpatrick",
    help: "Réaction de la peau au soleil",
    type: "single",
    required: true,
    options: [
      { value: "III", label: "III — clair brun" },
      { value: "IV", label: "IV — brun" },
      { value: "V", label: "V — brun foncé" },
      { value: "VI", label: "VI — très foncé" },
    ],
  },
  {
    id: "age",
    section: "peau",
    label: "Tranche d'âge",
    type: "single",
    required: true,
    options: [
      { value: "18-25", label: "18-25 ans" },
      { value: "26-35", label: "26-35 ans" },
      { value: "36-45", label: "36-45 ans", effects: { elastic: -6, cerne: -4 } },
      { value: "46+", label: "46 ans et +", effects: { elastic: -10, cerne: -6, keratose: -4 } },
    ],
  },
  {
    id: "concerns",
    section: "peau",
    label: "Inquiétudes principales",
    help: "Tout ce qui préoccupe la cliente aujourd'hui",
    type: "multi",
    required: true,
    options: [
      { value: "acne", label: "Acné / boutons", effects: { acne: -13, noirs: -6 } },
      { value: "taches", label: "Taches / pigmentation", effects: { pih: -13, hyperpigment: -8, pigmentaire: -8, melasma: -6 } },
      { value: "secheresse", label: "Sécheresse / tiraillements", effects: { hydrat: -13, secheresse: -10 } },
      { value: "terne", label: "Teint terne", effects: { eclat: -12 } },
      { value: "incarnes", label: "Poils incarnés / folliculite", effects: { incarne: -13, follicul: -10 } },
      { value: "cernes", label: "Cernes / poches", effects: { cerne: -11 } },
      { value: "rides", label: "Rides / perte de fermeté", effects: { elastic: -12 } },
      { value: "rougeurs", label: "Rougeurs / irritations", effects: { rougeur: -12, irrit: -8, barriere: -6 } },
      { value: "pores", label: "Pores dilatés / texture", effects: { pores: -10, texture: -8 } },
      { value: "pellicules", label: "Pellicules / cuir chevelu", effects: { desquamation: -13, irrit: -4 } },
    ],
  },

  // ── Routine actuelle ──
  {
    id: "cleansing",
    section: "routine",
    label: "Nettoyage du visage",
    type: "single",
    required: true,
    options: [
      { value: "2j", label: "2× par jour" },
      { value: "1j", label: "1× par jour", effects: { pores: -4, sebum: -3 } },
      { value: "irregulier", label: "Irrégulier", effects: { pores: -8, sebum: -6, acne: -4 } },
      { value: "jamais", label: "Jamais / eau seule", effects: { pores: -12, noirs: -6, texture: -5 } },
    ],
  },
  {
    id: "moisturize",
    section: "routine",
    label: "Hydratation (crème)",
    type: "single",
    required: true,
    options: [
      { value: "2j", label: "Matin et soir" },
      { value: "1j", label: "1× par jour", effects: { hydrat: -6 } },
      { value: "parfois", label: "Quelquefois", effects: { hydrat: -12, secheresse: -8, barriere: -5 } },
      { value: "jamais", label: "Jamais", effects: { hydrat: -18, secheresse: -12, barriere: -8 } },
    ],
  },
  {
    id: "exfoliation",
    section: "routine",
    label: "Gommage / exfoliation",
    type: "single",
    required: true,
    options: [
      { value: "1s", label: "1× par semaine" },
      { value: "2-3s", label: "2-3× par semaine", effects: { barriere: -5, irrit: -3 } },
      { value: "3plus", label: "Plus de 3× par semaine", effects: { barriere: -12, irrit: -8, rougeur: -6 } },
      { value: "jamais", label: "Jamais", effects: { texture: -5, eclat: -4 } },
    ],
  },
  {
    id: "sun",
    section: "routine",
    label: "Protection solaire",
    help: "Le soleil abîme aussi les peaux mélanodermes (taches, mélasma)",
    type: "single",
    required: true,
    options: [
      { value: "quotidien", label: "Quotidienne (SPF)" },
      { value: "parfois", label: "Parfois", effects: { pih: -5, hyperpigment: -4, pigmentaire: -4 } },
      { value: "occasions", label: "Plage / occasions seulement", effects: { pih: -9, hyperpigment: -7, melasma: -5, pigmentaire: -7 } },
      {
        value: "jamais",
        label: "Jamais",
        effects: { pih: -14, hyperpigment: -11, melasma: -8, pigmentaire: -10, eclat: -5 },
        flag: { label: "Aucune protection solaire", detail: "Premier facteur de taches sur peau mélanoderme — introduire un SPF 50 teinté dès aujourd'hui.", level: "warn" },
      },
    ],
  },
  {
    id: "makeup_removal",
    section: "routine",
    label: "Démaquillage le soir",
    type: "single",
    required: true,
    options: [
      { value: "toujours", label: "Chaque soir" },
      { value: "oublie", label: "Souvent oublié", effects: { pores: -8, noirs: -5, acne: -4, irrit: -3 } },
      { value: "aucun", label: "Pas de maquillage" },
    ],
  },
  {
    id: "lightening",
    section: "routine",
    label: "Produits éclaircissants / dépigérants",
    help: "Crèmes clarifiantes, mixtures maison, corticoïdes topiques — passé ou présent",
    type: "single",
    required: true,
    sensitive: true,
    options: [
      { value: "jamais", label: "Jamais" },
      {
        value: "passe",
        label: "Par le passé, arrêté",
        effects: { pih: -12, hyperpigment: -10, barriere: -8, pigmentaire: -8 },
        flag: { label: "Antécédent de dépigmentation", detail: "Peau fragilisée : protocole réparateur doux obligatoire, jamais d'actifs forts avant réparation de la barrière.", level: "warn" },
      },
      {
        value: "cours",
        label: "En cours",
        effects: { pih: -18, hyperpigment: -15, barriere: -14, irrit: -8, pigmentaire: -12, melasma: -6 },
        flag: { label: "Dépigération active", detail: "Risque dermatologique réel (ochronose, infections, cicatrices). Accompagnement de sevrage progressif + orientation dermatologique recommandée.", level: "danger" },
      },
    ],
  },

  // ── Mode de vie ──
  {
    id: "water",
    section: "vie",
    label: "Eau bue par jour",
    type: "single",
    required: true,
    options: [
      { value: "1l5", label: "1,5 L et plus" },
      { value: "1l", label: "~ 1 L", effects: { hydrat: -7, secheresse: -5, eclat: -3 } },
      { value: "peu", label: "Très peu", effects: { hydrat: -14, secheresse: -9, eclat: -6 } },
    ],
  },
  {
    id: "sleep",
    section: "vie",
    label: "Sommeil",
    type: "single",
    required: true,
    options: [
      { value: "7-8", label: "7-8 h" },
      { value: "5-6", label: "5-6 h", effects: { eclat: -6, cerne: -8, barriere: -4 } },
      { value: "5-", label: "Moins de 5 h", effects: { eclat: -10, cerne: -12, barriere: -6, acne: -4 } },
    ],
  },
  {
    id: "stress",
    section: "vie",
    label: "Stress actuel",
    type: "single",
    required: true,
    options: [
      { value: "faible", label: "Faible" },
      { value: "moyen", label: "Modéré", effects: { acne: -5, rougeur: -4, sebum: -4 } },
      { value: "eleve", label: "Élevé", effects: { acne: -10, rougeur: -8, sebum: -7, elastic: -4 } },
    ],
  },
  {
    id: "sun_exposure",
    section: "vie",
    label: "Exposition au soleil",
    type: "single",
    required: true,
    options: [
      { value: "faible", label: "Faible — intérieur" },
      { value: "moyenne", label: "Modérée — déplacements", effects: { pih: -5, hyperpigment: -4 } },
      { value: "quotidienne", label: "Quotidienne — marché, dehors", effects: { pih: -10, hyperpigment: -8, melasma: -5, pigmentaire: -7 } },
    ],
  },
  {
    id: "tobacco",
    section: "vie",
    label: "Tabac",
    type: "single",
    required: true,
    options: [
      { value: "non", label: "Non" },
      { value: "parfois", label: "Oui, parfois", effects: { eclat: -5, elastic: -4 } },
      { value: "quotidien", label: "Oui, tous les jours", effects: { eclat: -10, elastic: -7, barriere: -5 } },
    ],
  },

  // ── Santé & antécédents ──
  {
    id: "reactions",
    section: "sante",
    label: "Réactions aux produits cosmétiques",
    type: "single",
    required: true,
    options: [
      { value: "jamais", label: "Jamais eu" },
      {
        value: "parfois",
        label: "Parfois — rougeurs, démangeaisons",
        effects: { barriere: -8, rougeur: -7, irrit: -6 },
      },
      {
        value: "souvent",
        label: "Souvent — à chaque nouveau produit",
        effects: { barriere: -14, rougeur: -11, irrit: -10 },
        flag: { label: "Hypersensibilité déclarée", detail: "Tests de tolérance systématiques (plis du coude, 48 h) avant tout nouveau soin en cabine.", level: "warn" },
      },
    ],
  },
  {
    id: "treatment",
    section: "sante",
    label: "Traitement dermatologique en cours",
    help: "Isotrétinoïne, corticoïdes, acides prescrits…",
    type: "single",
    required: true,
    options: [
      { value: "non", label: "Non" },
      {
        value: "oui",
        label: "Oui",
        flag: { label: "Traitement dermatologique en cours", detail: "Vérifier compatibilité avant tout protocole en cabine (pas d'actifs exfoliants ni d'appareils chauffants sans avis prescripteur).", level: "warn" },
      },
    ],
  },
  {
    id: "pregnancy",
    section: "sante",
    label: "Grossesse ou allaitement",
    type: "single",
    required: true,
    sensitive: true,
    options: [
      { value: "non", label: "Non" },
      {
        value: "oui",
        label: "Oui",
        flag: { label: "Grossesse / allaitement", detail: "Contre-indications actifs : pas de rétinoides ni d'acides forts — protocole hydratant et apaisant uniquement.", level: "warn" },
      },
    ],
  },
  {
    id: "allergies",
    section: "sante",
    label: "Allergies connues",
    type: "text",
    options: [],
    placeholder: "Produits, plantes, aliments… (laisser vide si aucune)",
  },
  {
    id: "notes",
    section: "sante",
    label: "Observation de la praticienne",
    type: "text",
    options: [],
    placeholder: "Notes libres de l'entretien (optionnel)",
  },
];

const REQUIRED_QUESTIONS = QUESTIONS.filter((q) => q.required);

/** Réponses vierges pour l'assistant. */
export function defaultAnswers(): QAnswers {
  return {};
}

/** Une question est-elle renseignée ? (texte = jamais requis) */
export function isAnswered(q: Question, answers: QAnswers): boolean {
  const v = answers[q.id];
  if (q.type === "multi") return Array.isArray(v) && v.length > 0;
  if (q.type === "single") return typeof v === "string" && v.length > 0;
  return true;
}

/** Progression 0-1 sur les questions requises. */
export function questionnaireProgress(answers: QAnswers): number {
  const done = REQUIRED_QUESTIONS.filter((q) => isAnswered(q, answers)).length;
  return REQUIRED_QUESTIONS.length === 0 ? 1 : done / REQUIRED_QUESTIONS.length;
}

/** Validation serveur : ids des questions requises manquantes. */
export function missingRequired(answers: QAnswers): string[] {
  return REQUIRED_QUESTIONS.filter((q) => !isAnswered(q, answers)).map((q) => q.id);
}

// ─────────────────────────── Moteur de scoring ───────────────────────────

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const BASE_SCORE = 78;

/** Applique un delta à l'indicateur dont le nom (normalisé) contient la clé. */
function applyEffects(scores: Map<string, number>, effects: Effects | undefined, zoneIndicators: string[]) {
  if (!effects) return;
  for (const [key, delta] of Object.entries(effects)) {
    const k = norm(key);
    for (const name of zoneIndicators) {
      if (norm(name).includes(k)) scores.set(name, (scores.get(name) ?? BASE_SCORE) + delta);
    }
  }
}

const clampScore = (n: number) => Math.max(5, Math.min(98, Math.round(n)));

/** Construit le jeu de recommandations ciblées à partir des indicateurs faibles + drapeaux. */
function buildRecommendations(indicators: Indicator[], flags: QFlag[], zone: BodyZone): RecommendationSet {
  // Indicateurs les plus faibles d'abord (hors zone nævi — pas de conseil questionnaire)
  const weakest = indicators
    .filter((i) => i.pourcentage < 80)
    .sort((a, b) => a.pourcentage - b.pourcentage)
    .slice(0, 4);

  const matin: string[] = [];
  const soir: string[] = [];
  const botaniques: string[] = [];
  const produits: string[] = [];
  const soins: string[] = [];
  const hygiene: string[] = [];

  for (const ind of weakest) {
    const n = norm(ind.nom);
    const has = (...keys: string[]) => keys.some((k) => n.includes(k));
    if (has("hydrat", "secheresse")) {
      matin.push("Brume hydratante aloka avant la crème");
      soir.push("Baume réparateur karité en couche généreuse");
      botaniques.push("Karité", "Aloka");
      produits.push("Baume Nuit Karité", "Sérum Hydratation Aloka");
      soins.push("Soin hydratant profond karité");
    } else if (has("barriere")) {
      matin.push("Nettoyant doux sans savon (pH 5,5)");
      soir.push("Cérat apaisant en fin de routine");
      botaniques.push("Karité");
      produits.push("Cérat Réparateur Kènè");
      soins.push("Soin apaisant barrière");
    } else if (has("pih", "pigment", "melasma")) {
      matin.push("Sérum vitamine C stabilisé");
      soir.push("Sérum niacinamide 5 % sur les taches");
      botaniques.push("Moringa");
      produits.push("Sérum Éclat Moringa", "SPF 50 teinté minéral");
      soins.push("Soin éclat mélanoderme");
    } else if (has("eclat")) {
      matin.push("Sérum éclat vitamine C");
      botaniques.push("Moringa", "Bissap");
      produits.push("Sérum Éclat Moringa");
      soins.push("Gommage éclat doux 1×/semaine");
    } else if (has("sebum", "pores", "texture", "noirs")) {
      matin.push("Nettoyant doux moussant");
      soir.push("Masque argile bissap 2×/semaine");
      botaniques.push("Bissap");
      produits.push("Masque Argile Bissap", "Sérum Niacinamide 5 %");
      soins.push("Soin purifiant matifiant");
    } else if (has("acne")) {
      soir.push("Soin local niacinamide sur les imperfections");
      botaniques.push("Bissap", "Moringa");
      produits.push("Sérum Niacinamide 5 %");
      soins.push("Soin purifiant anti-imperfections");
    } else if (has("rougeur", "irrit", "follicul", "incarne")) {
      matin.push("Brume apaisante aloka");
      soir.push("Gel apaisant sans alcool");
      botaniques.push("Aloka");
      produits.push("Gel Apaisant Aloka");
      soins.push("Soin apaisant anti-rougeurs");
    } else if (has("cerne")) {
      matin.push("Tapotement léger de gel contour froid");
      botaniques.push("Baobab");
      produits.push("Gel Contour des Yeux Baobab");
      soins.push("Massage drainant contour des yeux");
    } else if (has("elastic")) {
      matin.push("Sérum fermeté au baobab");
      soir.push("Massage lifting 3 min (huiles baobab)");
      botaniques.push("Baobab");
      produits.push("Huile Fermeté Baobab");
      soins.push("Soin remodelant visage");
    } else if (has("keratose")) {
      soins.push("Évaluation des lésions par dermo-conseillère");
      produits.push("Écran solaire quotidien");
    } else if (has("desquamation")) {
      soir.push("Lotion cuir chevelu apaisante");
      produits.push("Sérum Cuir Chevelu Bissap");
      soins.push("Soin detox cuir chevelu");
    }
  }

  // Base commune (toujours)
  if (matin.length === 0) matin.push("Nettoyant doux + hydratation légère");
  if (soir.length === 0) soir.push("Nettoyant doux + soin de nuit");
  if (botaniques.length === 0) botaniques.push("Karité", "Moringa");
  if (produits.length === 0) produits.push("Sérum Éclat Moringa");
  if (soins.length === 0) soins.push("Soin signature de l'institut");

  // Drapeaux → conseils dédiés
  for (const f of flags) {
    if (f.label.includes("Dépigération")) hygiene.push("Accompagnement de sevrage : arrêt progressif, jamais brutal, sous suivi");
    if (f.label.includes("protection solaire")) hygiene.push("SPF 50 teinté chaque matin, même en saison des pluies");
    if (f.label.includes("Grossesse")) hygiene.push("Protocole hydratant/apaisant uniquement — actifs proscrits");
    if (f.label.includes("Hypersensibilité")) hygiene.push("Test de tolérance 48 h au pli du coude avant chaque nouveauté");
    if (f.label.includes("Traitement")) hygiene.push("Coordination avec le prescripteur avant protocole cabine");
  }
  if (hygiene.length === 0) hygiene.push("Boire 1,5 L d'eau par jour", "Dormir 7-8 h");

  const uniq = (a: string[]) => Array.from(new Set(a)).slice(0, 6);

  return {
    resume: "",
    routine_matin: uniq(matin),
    routine_soir: uniq(soir),
    botaniques_conseillees: uniq(botaniques),
    produits: uniq(produits),
    soins_conseilles: uniq(soins),
    conseils_hygiene_vie: uniq(hygiene),
  };
}

/** Scoring complet du questionnaire pour une zone. */
export function scoreQuestionnaire(answers: QAnswers, zone: BodyZone): QuestionnaireResult {
  const zoneIndicators = zone === "naevi" ? ZONE_INDICATORS.visage : ZONE_INDICATORS[zone];
  const scores = new Map<string, number>(zoneIndicators.map((n) => [n, BASE_SCORE]));
  const flags: QFlag[] = [];

  let answered = 0;
  for (const q of QUESTIONS) {
    const v = answers[q.id];
    if (q.type === "single" && typeof v === "string" && v.length > 0) {
      answered++;
      const opt = q.options.find((o) => o.value === v);
      if (opt) {
        applyEffects(scores, opt.effects, zoneIndicators);
        if (opt.flag) flags.push({ level: opt.flag.level ?? "warn", label: opt.flag.label, detail: opt.flag.detail });
      }
    } else if (q.type === "multi" && Array.isArray(v) && v.length > 0) {
      answered++;
      for (const sel of v) {
        const opt = q.options.find((o) => o.value === sel);
        if (opt) applyEffects(scores, opt.effects, zoneIndicators);
      }
    }
  }
  const total = REQUIRED_QUESTIONS.length;

  // Allergies déclarées → drapeau info
  const allergies = typeof answers.allergies === "string" ? answers.allergies.trim() : "";
  if (allergies) {
    flags.unshift({ level: "info", label: "Allergies déclarées", detail: allergies.slice(0, 200) });
  }

  // Nævi : le questionnaire ne peut pas évaluer ABCDE — honnêteté clinique
  if (zone === "naevi") {
    flags.push({
      level: "info",
      label: "Nævi : photo indispensable",
      detail: "L'évaluation ABCDE repose sur l'observation — joindre une photo rapprochée pour l'analyse IA (le questionnaire seul ne note pas ces critères).",
    });
  }

  const indicateurs: Indicator[] = zoneIndicators.map((nom) => {
    const pct = clampScore(scores.get(nom) ?? BASE_SCORE);
    return { nom, pourcentage: pct, severite: severityFromPercent(pct) };
  });
  const scoreGlobal = Math.round(indicateurs.reduce((s, i) => s + i.pourcentage, 0) / Math.max(1, indicateurs.length));

  const recommandations = buildRecommendations(indicateurs, flags, zone);
  const verdict =
    scoreGlobal >= 80
      ? "la peau déclarée est équilibrée — consolider les bonnes habitudes"
      : scoreGlobal >= 65
        ? "l'équilibre est correct avec des zones d'attention ciblées"
        : scoreGlobal >= 50
          ? "des déséquilibres identifiés méritent un protocole structuré"
          : "un protocole de fond sur plusieurs semaines est recommandé";
  const worst = indicateurs.slice().sort((a, b) => a.pourcentage - b.pourcentage)[0];
  recommandations.resume = `Entretien mené en institut : ${verdict}${worst ? ` — priorité n°1 : ${worst.nom.toLowerCase()} (${worst.pourcentage}/100)` : ""}.`;

  return { scoreGlobal, indicateurs, flags, recommandations, answered, total };
}

// ─────────────────────────── Fusion questionnaire ± VLM ───────────────────────────

const PHOTO_WEIGHT = 0.62; // l'observation (photo) pèse plus que le déclaratif
const Q_WEIGHT = 0.38;

/** Fusionne le résultat questionnaire avec l'analyse VLM de la photo (si fournie). */
export function mergeResults(qr: QuestionnaireResult, vlm: DiagnosisResult | null, zone: BodyZone, photoUsed: boolean): ProDiagnosisResult {
  if (!vlm) {
    return {
      score_global: qr.scoreGlobal,
      zone,
      indicateurs: qr.indicateurs,
      zones_marquages: [],
      recommandations: qr.recommandations,
      orientation_dermato: qr.flags.some((f) => f.level === "danger"),
      raison_orientation: qr.flags.find((f) => f.level === "danger")?.label,
      avertissement:
        "Évaluation issue de l'entretien (questionnaire) réalisée en institut — ne constitue pas un diagnostic médical. Joindre une photo à un prochain passage pour une analyse visuelle.",
      source: "questionnaire",
      questionnaire: { score: qr.scoreGlobal, flags: qr.flags, answered: qr.answered, total: qr.total, photoUsed },
    };
  }

  // Fusion par indicateur de la zone VLM (les noms font autorité côté photo)
  const merged: Indicator[] = vlm.indicateurs.map((ind) => {
    const q = qr.indicateurs.find((qi) => norm(qi.nom).slice(0, 8) === norm(ind.nom).slice(0, 8));
    const pct = q ? Math.round(ind.pourcentage * PHOTO_WEIGHT + q.pourcentage * Q_WEIGHT) : ind.pourcentage;
    return { ...ind, pourcentage: pct, severite: severityFromPercent(pct) };
  });
  const scoreGlobal = Math.round(vlm.score_global * PHOTO_WEIGHT + qr.scoreGlobal * Q_WEIGHT);

  // Recommandations : base observation VLM + vigilances questionnaire
  const rec: RecommendationSet = {
    ...vlm.recommandations,
    conseils_hygiene_vie: Array.from(
      new Set([...(vlm.recommandations?.conseils_hygiene_vie ?? []), ...qr.recommandations.conseils_hygiene_vie])
    ).slice(0, 6),
    soins_conseilles: Array.from(
      new Set([...(vlm.recommandations?.soins_conseilles ?? []), ...qr.recommandations.soins_conseilles])
    ).slice(0, 6),
  };

  return {
    score_global: scoreGlobal,
    fitzpatrick_estime: vlm.fitzpatrick_estime,
    zone,
    indicateurs: merged,
    zones_marquages: vlm.zones_marquages ?? [],
    recommandations: rec,
    orientation_dermato: vlm.orientation_dermato,
    raison_orientation: vlm.raison_orientation,
    abcde: vlm.abcde,
    avertissement:
      "Diagnostic réalisé en institut (entretien + analyse IA photo) — estimation éducative, ne constitue pas un diagnostic médical. En cas de lésion évolutive, consultez un dermatologue.",
    source: "vlm+questionnaire",
    questionnaire: { score: qr.scoreGlobal, flags: qr.flags, answered: qr.answered, total: qr.total, photoUsed },
  };
}

/** Parse défensif d'un resultJson côté front. */
export function parseProDiagnosis(json: string): ProDiagnosisResult | null {
  try {
    const o = JSON.parse(json) as ProDiagnosisResult;
    if (!o || typeof o.score_global !== "number" || !Array.isArray(o.indicateurs)) return null;
    return o;
  } catch {
    return null;
  }
}
