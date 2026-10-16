// Kènè — Questionnaire dermatologique « Diagnostic en institut »
// Lib PURE (aucune dépendance React/serveur): définition des questions,
// moteur de scoring par indicateur, drapeaux de vigilance, recommandations
// et fusion questionnaire ± analyse VLM (photo de cabine).
// L'entreprise réalise le diagnostic au sein de sa structure: la praticienne
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

/** Effets d'une option: clé mot-clé d'indicateur → delta de score santé. */
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
  required?: boolean; // single: une option · multi: ≥ 1 · text: jamais requis
  placeholder?: string;
 /** sensible: entouré visuellement (dépigmentation, grossesse…) */
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

const FACE_QUESTIONS: Question[] = [
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
];

// ─────────────────────────── Questions communes (Mode de vie & Santé) ───────────────────────────

const COMMON_LIFESTYLE_QUESTIONS: Question[] = [
  {
    id: "water",
    section: "vie",
    label: "Hydratation (eau bue par jour)",
    type: "single",
    required: true,
    options: [
      { value: "1l5", label: "1,5 L et plus" },
      { value: "1l", label: "~ 1 L", effects: { hydrat: -7, secheresse: -5, eclat: -3 } },
      { value: "peu", label: "Très peu (< 0,5 L)", effects: { hydrat: -14, secheresse: -9, eclat: -6 } },
    ],
  },
  {
    id: "sleep",
    section: "vie",
    label: "Sommeil & Récupération",
    type: "single",
    required: true,
    options: [
      { value: "7-8", label: "7-8 h par nuit" },
      { value: "5-6", label: "5-6 h", effects: { eclat: -6, cerne: -8, barriere: -4 } },
      { value: "5-", label: "Moins de 5 h", effects: { eclat: -10, cerne: -12, barriere: -6, acne: -4 } },
    ],
  },
  {
    id: "stress",
    section: "vie",
    label: "Niveau de stress actuel",
    type: "single",
    required: true,
    options: [
      { value: "faible", label: "Faible / calme" },
      { value: "moyen", label: "Modéré", effects: { acne: -5, rougeur: -4, sebum: -4, irrit: -4 } },
      { value: "eleve", label: "Élevé / surmenage", effects: { acne: -10, rougeur: -8, sebum: -7, elastic: -4, irrit: -8, alopecique: -8 } },
    ],
  },
  {
    id: "tobacco",
    section: "vie",
    label: "Consommation de tabac / chicha",
    type: "single",
    required: true,
    options: [
      { value: "non", label: "Non" },
      { value: "parfois", label: "Oui, occasionnel", effects: { eclat: -5, elastic: -4 } },
      { value: "quotidien", label: "Oui, quotidien", effects: { eclat: -10, elastic: -7, barriere: -5 } },
    ],
  },
];

const COMMON_HEALTH_QUESTIONS: Question[] = [
  {
    id: "reactions",
    section: "sante",
    label: "Réactions aux cosmétiques & soins",
    type: "single",
    required: true,
    options: [
      { value: "jamais", label: "Jamais eu de réaction" },
      {
        value: "parfois",
        label: "Parfois — rougeurs, picotements",
        effects: { barriere: -8, rougeur: -7, irrit: -6 },
      },
      {
        value: "souvent",
        label: "Souvent — réagit très vite",
        effects: { barriere: -14, rougeur: -11, irrit: -10 },
        flag: { label: "Hypersensibilité cutanée", detail: "Tests de tolérance préalables indispensables.", level: "warn" },
      },
    ],
  },
  {
    id: "treatment",
    section: "sante",
    label: "Traitement médical / dermato en cours",
    help: "Isotrétinoïne, corticoïdes, antifongiques, antibiotiques…",
    type: "single",
    required: true,
    options: [
      { value: "non", label: "Non" },
      {
        value: "oui",
        label: "Oui",
        flag: { label: "Traitement médical en cours", detail: "Vérifier compatibilité avant tout protocole.", level: "warn" },
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
        flag: { label: "Grossesse / allaitement", detail: "Pas d'actifs irritants ni d'huiles essentielles fortes — protocoles doux uniquement.", level: "warn" },
      },
    ],
  },
  {
    id: "allergies",
    section: "sante",
    label: "Allergies connues",
    type: "text",
    options: [],
    placeholder: "Produits, plantes, parfums, aliments… (laisser vide si aucune)",
  },
  {
    id: "notes",
    section: "sante",
    label: "Observation de la praticienne",
    type: "text",
    options: [],
    placeholder: "Observations spécifiques de la cabine (optionnel)",
  },
];

// ─────────────────────────── Questions spécifiques par zone ───────────────────────────

const FACE_QUESTIONS: Question[] = [
  {
    id: "skin_type",
    section: "peau",
    label: "Type de peau du visage",
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
    label: "Inquiétudes principales du visage",
    help: "Tout ce qui préoccupe la cliente aujourd'hui",
    type: "multi",
    required: true,
    options: [
      { value: "acne", label: "Acné / boutons", effects: { acne: -13, noirs: -6 } },
      { value: "taches", label: "Taches / pigmentation", effects: { pih: -13, hyperpigment: -8, pigmentaire: -8, melasma: -6 } },
      { value: "secheresse", label: "Sécheresse / tiraillements", effects: { hydrat: -13, secheresse: -10 } },
      { value: "terne", label: "Teint terne", effects: { eclat: -12 } },
      { value: "cernes", label: "Cernes / poches", effects: { cerne: -11 } },
      { value: "rides", label: "Rides / perte de fermeté", effects: { elastic: -12 } },
      { value: "rougeurs", label: "Rougeurs / irritations", effects: { rougeur: -12, irrit: -8, barriere: -6 } },
      { value: "pores", label: "Pores dilatés / texture", effects: { pores: -10, texture: -8 } },
    ],
  },
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
    label: "Hydratation (crème / émulsion)",
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
    id: "sun",
    section: "routine",
    label: "Protection solaire (SPF)",
    help: "Le soleil est le 1er accélérateur de taches sur peau mélanoderme",
    type: "single",
    required: true,
    options: [
      { value: "quotidien", label: "Quotidienne (SPF 30 ou 50)" },
      { value: "parfois", label: "Parfois", effects: { pih: -5, hyperpigment: -4, pigmentaire: -4 } },
      { value: "occasions", label: "Plage / occasions seulement", effects: { pih: -9, hyperpigment: -7, melasma: -5, pigmentaire: -7 } },
      {
        value: "jamais",
        label: "Jamais",
        effects: { pih: -14, hyperpigment: -11, melasma: -8, pigmentaire: -10, eclat: -5 },
        flag: { label: "Aucune protection solaire", detail: "Premier facteur de taches sur peau mélanoderme — introduire un SPF 50 dès aujourd'hui.", level: "warn" },
      },
    ],
  },
  {
    id: "lightening",
    section: "routine",
    label: "Produits éclaircissants / dépigmentants",
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
        flag: { label: "Antécédent de dépigmentation", detail: "Peau fragilisée : protocole réparateur doux obligatoire.", level: "warn" },
      },
      {
        value: "cours",
        label: "En cours",
        effects: { pih: -18, hyperpigment: -15, barriere: -14, irrit: -8, pigmentaire: -12, melasma: -6 },
        flag: { label: "Dépigmentation active", detail: "Risque dermatologique réel (ochronose, infections). Accompagnement de sevrage progressif recommandé.", level: "danger" },
      },
    ],
  },
];

const SCALP_QUESTIONS: Question[] = [
  {
    id: "scalp_type",
    section: "cuir_chevelu",
    label: "État actuel du cuir chevelu",
    help: "Sensation générale au niveau des racines",
    type: "single",
    required: true,
    options: [
      { value: "sec", label: "Sec / tiraillements fréquents", effects: { secheresse: -14, hydrat: -10 } },
      { value: "gras", label: "Gras / excès de sébum rapide", effects: { sebum: -14, follicul: -8 } },
      { value: "pelliculaire_sec", label: "Pellicules fines et sèches (blanches)", effects: { desquamation: -14 } },
      { value: "pelliculaire_gras", label: "Pellicules grasses / jaunâtres adhérentes", effects: { desquamation: -16, sebum: -10, follicul: -8 } },
      { value: "irrite", label: "Irrité / rougeurs / démangeaisons vives", effects: { irrit: -16, desquamation: -8 } },
      { value: "normal", label: "Sain et confortable" },
    ],
  },
  {
    id: "hair_concerns",
    section: "cuir_chevelu",
    label: "Inquiétudes capillaires déclarées",
    type: "multi",
    required: true,
    options: [
      { value: "pellicules", label: "Pellicules récidivantes", effects: { desquamation: -14 } },
      { value: "demangeaisons", label: "Démangeaisons intenses", effects: { irrit: -14 } },
      { value: "chute_traction", label: "Chute sur les tempes (alopécie de traction)", effects: { alopecique: -18 } },
      { value: "chute_diffuse", label: "Chute diffuse sur toute la tête", effects: { alopecique: -12 } },
      { value: "boutons_cuir", label: "Petits boutons / folliculite du cuir chevelu", effects: { follicul: -18, irrit: -8 } },
      { value: "secheresse_cheveu", label: "Cheveux très secs, rêches et cassants", effects: { secheresse: -10 } },
    ],
  },
  {
    id: "hair_density",
    section: "cuir_chevelu",
    label: "Densité et évolution de la chevelure",
    type: "single",
    required: true,
    options: [
      { value: "dense", label: "Bonne densité générale" },
      { value: "baisse_legere", label: "Légère perte de masse récente", effects: { alopecique: -6 } },
      { value: "recul_ligne", label: "Recul visible de la ligne frontale", effects: { alopecique: -14 } },
      { value: "plaques", label: "Trous / plaques nues bien délimitées", effects: { alopecique: -18 }, flag: { label: "Plaques alopéciques", detail: "Suspicion de pelade ou d'alopécie cicatricielle — consultation dermatologique recommandée.", level: "warn" } },
    ],
  },
  {
    id: "hair_practices",
    section: "routine_capillaire",
    label: "Traitements chimiques & coiffures",
    help: "Pratiques régulières ou récentes",
    type: "multi",
    required: true,
    options: [
      { value: "naturel", label: "Cheveux naturels (sans défrisage ni coloration)" },
      {
        value: "defrisage",
        label: "Défrisage chimique / wave",
        effects: { barriere: -10, secheresse: -8 },
        flag: { label: "Défrisage chimique", detail: "Fragilise la barrière épidermique du cuir chevelu. Espacer impérativement de 10 à 12 semaines.", level: "warn" },
      },
      {
        value: "tresses_serrees",
        label: "Nattes / tresses très serrées ou tissages lourds",
        effects: { alopecique: -12, irrit: -8 },
        flag: { label: "Tension mécanique", detail: "Facteur n°1 d'alopécie de traction chez les femmes afro.", level: "warn" },
      },
      {
        value: "colle_dentelle",
        label: "Perruques avec colle à dentelle (lace glue)",
        effects: { irrit: -10, alopecique: -10 },
        flag: { label: "Colles capillaires", detail: "Risque majeur de dermite de contact et de recul définitif de la ligne frontale.", level: "warn" },
      },
      { value: "chaleur_frequente", label: "Chaleur fréquente (fers à lisser, sèche-cheveux très chaud)", effects: { secheresse: -8 } },
    ],
  },
  {
    id: "hair_wash_freq",
    section: "routine_capillaire",
    label: "Fréquence de lavage du cuir chevelu",
    type: "single",
    required: true,
    options: [
      { value: "1s", label: "1× par semaine (recommandé)" },
      { value: "2s", label: "2× par semaine" },
      { value: "2semaines", label: "Toutes les 2 semaines", effects: { sebum: -6, desquamation: -6 } },
      { value: "mensuel", label: "1× par mois ou moins", effects: { sebum: -14, desquamation: -12, follicul: -10 } },
    ],
  },
  {
    id: "hair_products",
    section: "routine_capillaire",
    label: "Produits appliqués aux racines",
    type: "multi",
    required: true,
    options: [
      { value: "huiles_pures", label: "Huiles végétales pures (Ricin, Baobab, Kinkeliba)" },
      {
        value: "vaseline_minerale",
        label: "Pommade épaisse / vaseline / paraffine",
        effects: { follicul: -12, sebum: -10 },
        flag: { label: "Occlusion minérale", detail: "Les graisses minérales étouffent les follicules pilo-sébacés et nourrissent le champignon Malassezia.", level: "warn" },
      },
      { value: "hydrolats", label: "Hydrolat apaisant (Menthe, Romarin, Thym)" },
      { value: "shampoing_antiseptique", label: "Shampoing clarifiant / antipelliculaire doux" },
      { value: "aucun", label: "Rien sur le cuir chevelu" },
    ],
  },
];

const BACK_QUESTIONS: Question[] = [
  {
    id: "back_concerns",
    section: "dos",
    label: "Préoccupations au niveau du dos & décolleté",
    type: "multi",
    required: true,
    options: [
      { value: "acne_dorsale", label: "Boutons inflammatoires (papules / pustules)", effects: { acne: -16 } },
      { value: "taches_dos", label: "Taches sombres post-boutons (PIH)", effects: { pih: -16 } },
      { value: "sebum_dos", label: "Excès de sébum / dos huileux", effects: { sebum: -14 } },
      { value: "rugosite_dos", label: "Texture rugueuse / petits grains durs (kératose)", effects: { texture: -14, rugosite: -14 } },
      { value: "demangeaisons_dos", label: "Démangeaisons / irritations", effects: { irrit: -12, rougeur: -10 } },
      { value: "secheresse_dos", label: "Peau très sèche qui pèle", effects: { hydrat: -14 } },
    ],
  },
  {
    id: "back_triggers",
    section: "routine_dos",
    label: "Facteurs déclenchants déclarés",
    type: "multi",
    required: true,
    options: [
      { value: "sport_transpi", label: "Transpiration fréquente / séances de sport" },
      {
        value: "synthetique",
        label: "Vêtements synthétiques moulants",
        effects: { acne: -8, irrit: -6 },
        flag: { label: "Occlusion textile", detail: "Favorise l'acné mécanique par macération.", level: "warn" },
      },
      { value: "sac_dos", label: "Port régulier d'un sac à dos lourd (friction)", effects: { acne: -6, texture: -6 } },
      {
        value: "apres_shampoing",
        label: "Rinçage de l'après-shampoing qui coule sur le dos",
        effects: { acne: -8, pores: -6 },
        flag: { label: "Résidus comédogènes", detail: "Les silicones et quats des après-shampoings coulent sur le dos et bouchent les pores.", level: "info" },
      },
      { value: "soleil_dos", label: "Exposition du dos au soleil sans crème", effects: { pih: -12 } },
    ],
  },
  {
    id: "back_hygiene",
    section: "routine_dos",
    label: "Hygiène et nettoyage du dos",
    type: "single",
    required: true,
    options: [
      { value: "gel_doux", label: "Gel lavant doux sans savon chaque jour" },
      { value: "savon_noir", label: "Savon noir végétal / antiseptique doux" },
      { value: "savon_dur", label: "Savon très dur / antibactérien décapant", effects: { barriere: -10, irrit: -8 } },
      { value: "irregulier", label: "Nettoyage irrégulier du dos", effects: { sebum: -8, pores: -8 } },
    ],
  },
];

const BEARD_QUESTIONS: Question[] = [
  {
    id: "beard_concerns",
    section: "barbe",
    label: "Problématiques barbe & cou",
    type: "multi",
    required: true,
    options: [
      { value: "poils_incarnes", label: "Poils incarnés récurrents", effects: { incarne: -18 } },
      { value: "folliculite_barbe", label: "Folliculite (boutons blancs infectés)", effects: { follicul: -18, acne: -10 } },
      { value: "taches_barbe", label: "Taches sombres (PIH) dues aux boutons", effects: { pih: -16 } },
      { value: "sebum_barbe", label: "Excès de sébum / peau grasse sous la barbe", effects: { sebum: -12 } },
      { value: "poil_dru", label: "Poils drus, très secs et difficiles à tailler", effects: { hydrat: -12 } },
    ],
  },
  {
    id: "shaving_tool",
    section: "rasage",
    label: "Outil de rasage / taille",
    type: "single",
    required: true,
    options: [
      { value: "tondeuse", label: "Tondeuse de précision (laisse 1 mm — idéal)" },
      { value: "securite", label: "Rasoir de sécurité (1 seule lame bien affûtée)" },
      {
        value: "multilames",
        label: "Rasoir jetable multilames (2 à 5 lames)",
        effects: { incarne: -14, follicul: -10 },
        flag: { label: "Rasoir multilames", detail: "Tire le poil et coupe sous la peau : cause n°1 des poils incarnés sur poil crépu.", level: "warn" },
      },
      { value: "coupe_chou", label: "Coupe-chou chez le barbier" },
      { value: "pas_de_rasage", label: "Pas de rasage (barbe longue entretenue)" },
    ],
  },
  {
    id: "shaving_frequency",
    section: "rasage",
    label: "Fréquence de rasage / taille",
    type: "single",
    required: true,
    options: [
      { value: "quotidien", label: "Tous les jours", effects: { irrit: -8, barriere: -6 } },
      { value: "2-3j", label: "Tous les 2 à 3 jours" },
      { value: "1s", label: "1 fois par semaine" },
      { value: "rare", label: "Moins d'une fois par mois / barbe fournie" },
    ],
  },
  {
    id: "aftershave_care",
    section: "rasage",
    label: "Soin appliqué après le rasage",
    type: "multi",
    required: true,
    options: [
      {
        value: "alcool",
        label: "Alcool à 70° ou eau de Cologne",
        effects: { irrit: -16, barriere: -14, rougeur: -12 },
        flag: { label: "Alcool après-rasage décapant", detail: "Brûlure thermique et chimique provoquant un rebond d'hyperpigmentation immédiat.", level: "danger" },
      },
      { value: "huile_vegetale", label: "Huile végétale apaisante (Jojoba, Nigelle, Ricin)" },
      { value: "baume_sans_alcool", label: "Baume hydratant sans alcool (Aloe Vera, Karité)" },
      { value: "aucun", label: "Aucun soin après le rasage" },
    ],
  },
];

const HANDS_QUESTIONS: Question[] = [
  {
    id: "hands_concerns",
    section: "mains",
    label: "État de la peau des mains",
    type: "multi",
    required: true,
    options: [
      { value: "secheresse_mains", label: "Sécheresse intense / tiraillements", effects: { secheresse: -18, hydrat: -14 } },
      { value: "crevasses", label: "Crevasses / gerçures douloureuses", effects: { barriere: -18, irrit: -14 } },
      { value: "callosites", label: "Callosités / peau rugueuse et épaisse", effects: { keratose: -16 } },
      { value: "taches_mains", label: "Taches pigmentaires sombres", effects: { pigmentaire: -16 } },
      { value: "eczema_mains", label: "Démangeaisons / eczéma de contact", effects: { irrit: -16, rougeur: -12 } },
    ],
  },
  {
    id: "nails_status",
    section: "mains",
    label: "État des ongles et cuticules",
    type: "multi",
    required: true,
    options: [
      { value: "ongles_cassants", label: "Ongles cassants, mous ou striés", effects: { ongles: -16 } },
      { value: "ongles_dedoubles", label: "Ongles dédoublés", effects: { ongles: -12 } },
      { value: "cuticules_abimees", label: "Cuticules sèches et douloureuses", effects: { secheresse: -10 } },
      { value: "ongles_sains", label: "Ongles sains et forts" },
    ],
  },
  {
    id: "hands_exposure",
    section: "routine_mains",
    label: "Agressions et sollicitations quotidiennes",
    type: "multi",
    required: true,
    options: [
      { value: "gel_hydro", label: "Gel hydroalcoolique fréquent (> 5× / jour)", effects: { barriere: -10, secheresse: -8 } },
      {
        value: "detergents",
        label: "Contact détergents / vaisselle sans gants",
        effects: { barriere: -14, secheresse: -12, irrit: -10 },
        flag: { label: "Produits ménagers sans protection", detail: "Détruit le film lipidique protecteur des mains.", level: "warn" },
      },
      { value: "eau_frequente", label: "Lavages de mains très répétés" },
      { value: "soleil_mains", label: "Conduite / exposition solaire sans crème protectrice", effects: { pigmentaire: -12 } },
      { value: "creme_reguliere", label: "Application quotidienne de crème pour les mains" },
    ],
  },
];

const NAEVI_QUESTIONS: Question[] = [
  {
    id: "naevi_abcde",
    section: "naevi",
    label: "Règle morphologique ABCDE (Observation)",
    help: "Cochez tout critère suspect observé sur la lésion",
    type: "multi",
    required: true,
    options: [
      {
        value: "asymetrie",
        label: "A — Asymétrie (forme non ronde, 2 moitiés différentes)",
        effects: { asymetrie: -16 },
        flag: { label: "Critère A (Asymétrie)", detail: "Consulter un dermatologue pour examen dermatoscopique.", level: "warn" },
      },
      {
        value: "bords",
        label: "B — Bords irréguliers, dentelés ou flous",
        effects: { bords: -16 },
        flag: { label: "Critère B (Bords irréguliers)", detail: "Consulter un dermatologue pour examen dermatoscopique.", level: "warn" },
      },
      {
        value: "couleurs",
        label: "C — Couleurs multiples (marron, noir, zones dépigmentées)",
        effects: { couleurs: -16 },
        flag: { label: "Critère C (Polychromie)", detail: "Consulter un dermatologue pour examen dermatoscopique.", level: "warn" },
      },
      { value: "diametre", label: "D — Diamètre supérieur à 6 mm", effects: { diametre: -14 } },
      {
        value: "evolution",
        label: "E — Évolution récente (taille, relief, couleur qui changent)",
        effects: { evolution: -18 },
        flag: { label: "Critère E (Évolution rapide)", detail: "Signe clinique prioritaire imposant un avis médical.", level: "danger" },
      },
      { value: "aucun", label: "Aucun de ces signes / naevus stable et régulier" },
    ],
  },
  {
    id: "naevi_alarms",
    section: "naevi",
    label: "Symptômes ou antécédents d'alerte",
    type: "multi",
    required: true,
    options: [
      {
        value: "saignement",
        label: "Saignement spontané ou suintement",
        effects: { evolution: -18 },
        flag: { label: "Lésion qui saigne", detail: "Avis dermatologique impératif en priorité.", level: "danger" },
      },
      { value: "demangeaison", label: "Démangeaison persistante sur le naevus", effects: { evolution: -10 } },
      {
        value: "antecedents_famille",
        label: "Antécédent personnel ou familial de mélanome",
        flag: { label: "Risque familial", detail: "Surveillance annuelle en cabinet de dermatologie recommandée.", level: "warn" },
      },
      { value: "aucun_symptome", label: "Aucun symptôme particulier" },
    ],
  },
];

// ─────────────────────────── Sélecteurs dynamiques par zone ───────────────────────────

export function getSectionsForZone(zone: BodyZone = "visage"): QSection[] {
  switch (zone) {
    case "cuir_chevelu":
      return [
        { id: "cuir_chevelu", label: "Cuir chevelu & Cheveux", description: "État du cuir chevelu, pellicules, chute & densité" },
        { id: "routine_capillaire", label: "Pratiques & Routine", description: "Lavage, défrisage, tresses, huiles & chaleur" },
        { id: "vie", label: "Mode de vie", description: "Stress, alimentation, sommeil" },
        { id: "sante", label: "Santé & antécédents", description: "Vigilances avant tout protocole" },
      ];
    case "dos":
      return [
        { id: "dos", label: "Dos & Décolleté", description: "Acné dorsale, taches PIH, texture & pores" },
        { id: "routine_dos", label: "Hygiène & Habitudes", description: "Transpiration, sport, vêtements & rinçage" },
        { id: "vie", label: "Mode de vie", description: "Hydratation & hygiène de vie" },
        { id: "sante", label: "Santé & antécédents", description: "Vigilances & sensibilités" },
      ];
    case "barbe":
      return [
        { id: "barbe", label: "Barbe & Menton", description: "Poils incarnés, folliculite & taches" },
        { id: "rasage", label: "Rasage & Entretien", description: "Outils, fréquence & soins après-rasage" },
        { id: "vie", label: "Mode de vie", description: "Stress & habitudes" },
        { id: "sante", label: "Santé & antécédents", description: "Allergies & réactions" },
      ];
    case "mains":
      return [
        { id: "mains", label: "Mains & Ongles", description: "Sécheresse, crevasses, taches & ongles" },
        { id: "routine_mains", label: "Exposition & Protection", description: "Lavages, détergents & soleil" },
        { id: "vie", label: "Mode de vie", description: "Hydratation au quotidien" },
        { id: "sante", label: "Santé & antécédents", description: "Allergies de contact" },
      ];
    case "naevi":
      return [
        { id: "naevi", label: "Critères ABCDE", description: "Surveillance morphologique des grains de beauté" },
        { id: "vie", label: "Mode de vie", description: "Exposition solaire globale" },
        { id: "sante", label: "Santé & antécédents", description: "Antécédents dermatologiques" },
      ];
    case "visage":
    default:
      return [
        { id: "peau", label: "La peau", description: "Type, phototype et inquiétudes déclarées" },
        { id: "routine", label: "Routine actuelle", description: "Habitudes de soin au quotidien" },
        { id: "vie", label: "Mode de vie", description: "Soleil, sommeil, stress, hydratation" },
        { id: "sante", label: "Santé & antécédents", description: "Vigilances avant tout protocole" },
      ];
  }
}

export function getQuestionsForZone(zone: BodyZone = "visage"): Question[] {
  let specific: Question[] = [];
  switch (zone) {
    case "cuir_chevelu":
      specific = SCALP_QUESTIONS;
      break;
    case "dos":
      specific = BACK_QUESTIONS;
      break;
    case "barbe":
      specific = BEARD_QUESTIONS;
      break;
    case "mains":
      specific = HANDS_QUESTIONS;
      break;
    case "naevi":
      specific = NAEVI_QUESTIONS;
      break;
    case "visage":
    default:
      specific = FACE_QUESTIONS;
      break;
  }
  return [...specific, ...COMMON_LIFESTYLE_QUESTIONS, ...COMMON_HEALTH_QUESTIONS];
}

/** Tableau global par défaut pour la compatibilité historique (visage). */
export const QUESTIONS: Question[] = getQuestionsForZone("visage");

const REQUIRED_QUESTIONS = QUESTIONS.filter((q) => q.required);

/** Réponses vierges pour l'assistant. */
export function defaultAnswers(): QAnswers {
  return {};
}

/** Une question est-elle renseignée? (texte = jamais requis) */
export function isAnswered(q: Question, answers: QAnswers): boolean {
  const v = answers[q.id];
  if (q.type === "multi") return Array.isArray(v) && v.length > 0;
  if (q.type === "single") return typeof v === "string" && v.length > 0;
  return true;
}

/** Progression 0-1 sur les questions requises d'une zone. */
export function questionnaireProgress(answers: QAnswers, zone: BodyZone = "visage"): number {
  const reqs = getQuestionsForZone(zone).filter((q) => q.required);
  const done = reqs.filter((q) => isAnswered(q, answers)).length;
  return reqs.length === 0 ? 1 : done / reqs.length;
}

/** Validation serveur: ids des questions requises manquantes pour une zone. */
export function missingRequired(answers: QAnswers, zone: BodyZone = "visage"): string[] {
  const reqs = getQuestionsForZone(zone).filter((q) => q.required);
  return reqs.filter((q) => !isAnswered(q, answers)).map((q) => q.id);
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

/** Construit le jeu de recommandations ciblées par zone à partir des indicateurs faibles + drapeaux. */
function buildRecommendations(indicators: Indicator[], flags: QFlag[], zone: BodyZone): RecommendationSet {
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

  switch (zone) {
    case "cuir_chevelu": {
      const has = (...keys: string[]) => weakest.some((ind) => keys.some((k) => norm(ind.nom).includes(k)));

      matin.push("Brume tonique hydratante aloka & menthe sur les racines");
      matin.push("Massage doux circulaire du cuir chevelu 2 min (micro-circulation)");

      if (has("desquamation", "pellicul")) {
        matin.push("Sérum purifiant cuir chevelu au bissap & zinc");
        soir.push("Lotion assainissante apaisante cuir chevelu");
        botaniques.push("Bissap", "Arbre à thé", "Zinc PCA");
        produits.push("Sérum Anti-Pelliculaire Purifiant au Bissap", "Lotion Apaisante Cuir Chevelu Moringa & Aloka");
        soins.push("Soin détoxifiant & assainissant cuir chevelu");
      }

      if (has("alopeci", "traction", "chute")) {
        matin.push("Sérum stimulant racines au ricin noir & baobab sur les bordures");
        soir.push("Massage nocturne fortifiant des tempes et golfes");
        botaniques.push("Ricin noir", "Baobab");
        produits.push("Sérum Fortifiant Cuir Chevelu Ricin Noir & Baobab", "Huile Végétale Pure de Ricin Pressée à Froid");
        soins.push("Modelage crânien stimulant & revitalisant aux huiles chaudes");
        hygiene.push("Bannir impérativement les tresses, tissages ou perruques collées trop serrés");
      }

      if (has("sebum", "gras")) {
        soir.push("Shampoing doux clarifiant sans sulfates 1x/semaine");
        botaniques.push("Moringa", "Bissap");
        produits.push("Shampoing Doux Équilibrant Sans Sulfates");
        soins.push("Bain purifiant cuir chevelu");
      }

      if (has("secheresse", "sec")) {
        soir.push("Bain d'huile nourrissant pré-shampoing au baobab et karité fondu");
        botaniques.push("Karité brut", "Baobab");
        produits.push("Huile Végétale Pure de Baobab", "Baume Réparateur Pointes & Longueurs");
        soins.push("Soin profond hydro-nutritif capillaire");
      }

      if (has("irrit", "follicul")) {
        soir.push("Gelée apaisante dermo-calmante sans alcool à l'aloka");
        botaniques.push("Aloka");
        produits.push("Gelée Apaisante Cuir Chevelu Aloka & Calendula");
        soins.push("Protocole apaisant anti-inflammatoire cuir chevelu");
      }

      if (soir.length === 0) {
        soir.push("Sérum stimulant fortifiant racines", "Port d'un bonnet ou taie en satin pour la nuit");
      }
      if (botaniques.length === 0) botaniques.push("Ricin noir", "Baobab", "Moringa");
      if (produits.length === 0) produits.push("Sérum Fortifiant Cuir Chevelu Ricin Noir & Baobab", "Shampoing Doux Sans Sulfates");
      if (soins.length === 0) soins.push("Soin revitalisant cuir chevelu en salon");
      hygiene.push("Privilégier le satin ou la soie pour la nuit afin d'éviter la déshydratation et la casse");
      hygiene.push("Espacer les lavages (1x par semaine) et éviter l'eau brûlante");
      hygiene.push("Éviter l'occlusion des pores par des beurres ou vaselines trop lourds appliqués directement sur le crâne");
      break;
    }

    case "dos": {
      const has = (...keys: string[]) => weakest.some((ind) => keys.some((k) => norm(ind.nom).includes(k)));

      matin.push("Douche avec gel nettoyant purifiant sans savon au zinc et moringa");
      matin.push("Séchage soigneux du dos par tapotement avec serviette propre dédiée");

      if (has("acne", "bouton", "sebum")) {
        soir.push("Spray purifiant ciblé aux AHA de bissap et acide salicylique doux");
        botaniques.push("Bissap", "Moringa", "Zinc PCA");
        produits.push("Gel Nettoyant Purifiant Corps Moringa & Zinc", "Spray Anti-Imperfections Dos aux AHA de Bissap");
        soins.push("Soin purifiant désincrustant du dos en cabine");
      }

      if (has("pih", "tache", "pigment")) {
        soir.push("Émulsion unifiante anti-taches niacinamide 10% sur les marques du dos");
        botaniques.push("Moringa", "Bissap");
        produits.push("Lotion Unifiante Anti-Taches Dos & Corps");
        soins.push("Gommage doux corps aux AHA et enveloppement éclaircissant");
      }

      if (has("irrit", "rougeur")) {
        soir.push("Émulsion apaisante dermo-réparatrice à l'aloka");
        botaniques.push("Aloka", "Karité purifié");
        produits.push("Gelée Apaisante Corps Aloka");
        soins.push("Enveloppement calmant et hydratant du dos");
      }

      if (soir.length === 0) {
        soir.push("Lotion purifiante douce dos", "Vêtements amples en coton respirant");
      }
      if (botaniques.length === 0) botaniques.push("Moringa", "Bissap", "Zinc PCA");
      if (produits.length === 0) produits.push("Gel Nettoyant Purifiant Corps Moringa & Zinc", "Fluide Hydratant Léger Non-Comédogène");
      if (soins.length === 0) soins.push("Soin assainissant du dos en institut");
      hygiene.push("Rincer systématiquement les après-shampoings et masques capillaires la tête penchée en avant (résidus gras comédogènes sur le dos)");
      hygiene.push("Changer de t-shirt immédiatement après le sport ou une forte transpiration");
      hygiene.push("Privilégier des vêtements amples en fibres naturelles (coton, lin) pour limiter les frottements");
      break;
    }

    case "barbe": {
      const has = (...keys: string[]) => weakest.some((ind) => keys.some((k) => norm(ind.nom).includes(k)));

      matin.push("Nettoyage de la barbe à l'eau tiède avec nettoyant doux physiologique");
      matin.push("Quelques gouttes d'huile à barbe nourrissante moringa & ricin");

      if (has("incarne", "poil", "follicul")) {
        matin.push("Sérum anti-poils incarnés à l'acide salicylique doux et aloka");
        soir.push("Application d'une compresse tiède 2 min pour assouplir le poil avant soin");
        soir.push("Soin local antibactérien et apaisant sur les boutons de rasage");
        botaniques.push("Aloka", "Arbre à thé", "Moringa");
        produits.push("Sérum Anti-Poils Incarnés & Folliculite Barbe", "Gelée Apaisante Post-Rasage Aloka");
        soins.push("Soin barbier purifiant & assainissant haute-fréquence");
      }

      if (has("pih", "tache", "pigment")) {
        soir.push("Sérum unifiant niacinamide 5 % sur les taches post-rasage");
        botaniques.push("Moringa", "Bissap");
        produits.push("Sérum Unifiant Anti-Taches Barbe & Menton");
        soins.push("Soin unifiant anti-taches zone de rasage");
      }

      if (has("secheresse", "hydrat")) {
        soir.push("Baume nourrissant barbe et peau sous-jacente au karité et baobab");
        botaniques.push("Karité brut", "Baobab");
        produits.push("Baume Nourrissant Barbe au Karité & Baobab");
        soins.push("Soin d'hydratation profonde barbe & visage");
      }

      if (soir.length === 0) {
        soir.push("Brossage doux de la barbe dans le sens du poil", "Baume apaisant après-rasage sans alcool");
      }
      if (botaniques.length === 0) botaniques.push("Aloka", "Moringa", "Ricin noir");
      if (produits.length === 0) produits.push("Huile à Barbe Protectrice Moringa & Ricin", "Baume Après-Rasage Apaisant Sans Alcool");
      if (soins.length === 0) soins.push("Soin barbier dermo-protecteur cabine");
      hygiene.push("Raser toujours dans le sens de pousse du poil, jamais à rebrousse-poil");
      hygiene.push("Privilégier la tondeuse de précision ou un rasoir 1 lame (bannir les rasoirs multi-lames qui provoquent des poils incarnés)");
      hygiene.push("Bannir les après-rasages alcoolisés qui brûlent la barrière et favorisent l'hyperpigmentation");
      break;
    }

    case "mains": {
      const has = (...keys: string[]) => weakest.some((ind) => keys.some((k) => norm(ind.nom).includes(k)));

      matin.push("Lavage doux au savon surgras végétal sans sulfates");
      matin.push("Application d'une crème mains relipidante karité & cacao");
      matin.push("Protection solaire fluide sur le dos des mains avant toute sortie ou conduite");

      if (has("secheresse", "rugos", "crevasse", "callos")) {
        soir.push("Baume SOS ultra-réparateur karité brut en couche généreuse");
        soir.push("Port de gants en coton doux pendant la nuit (effet masque occlusif)");
        botaniques.push("Karité brut", "Cacao", "Baobab");
        produits.push("Crème Mains Relipidante Karité & Cacao", "Baume SOS Réparateur Crevasses Karité Brut");
        soins.push("Soin manucure traitante régénérante au karité chaud");
      }

      if (has("ongle")) {
        soir.push("Massage des ongles et cuticules à l'huile pure de baobab et ricin");
        botaniques.push("Baobab", "Ricin");
        produits.push("Huile Fortifiante Ongles & Cuticules Baobab & Ricin");
        soins.push("Soin fortifiant et nourrissant de la tablette unguéale");
      }

      if (has("tache", "pigment")) {
        soir.push("Sérum unifiant vitamine C et niacinamide sur le dos des mains et articulations");
        botaniques.push("Moringa", "Bissap");
        produits.push("Crème Mains Anti-Taches & Unifiante SPF 30");
        soins.push("Peeling doux végétal éclaircissant des mains");
      }

      if (soir.length === 0) {
        soir.push("Baume nourrissant mains et ongles", "Application avant le coucher");
      }
      if (botaniques.length === 0) botaniques.push("Karité brut", "Cacao", "Baobab");
      if (produits.length === 0) produits.push("Crème Mains & Ongles Haute Nutrition", "Huile Fortifiante Cuticules");
      if (soins.length === 0) soins.push("Manucure traitante réparatrice en institut");
      hygiene.push("Porter impérativement des gants de ménage pour la vaisselle et la manipulation de détergents");
      hygiene.push("Réappliquer la crème après chaque lavage des mains sur peau encore légèrement humide");
      hygiene.push("Ne jamais couper les cuticules trop court pour éviter les infections périunguéales");
      break;
    }

    case "naevi": {
      matin.push("Protection solaire minérale SPF 50+ invisible impérative sur toutes les zones exposées");
      matin.push("Renouvellement de l'application toutes les 2 heures en cas d'exposition solaire directe");
      matin.push("Nettoyage extrêmement doux sans frotter la lésion");

      soir.push("Hydratation neutre hypoallergénique sans parfum ni acides exfoliants");
      soir.push("Auto-surveillance visuelle mensuelle selon la règle ABCDE");

      botaniques.push("Aloka (apaisant)", "Karité purifié");
      produits.push("Fluide Minéral Solaire SPF 50+ Haute Tolérance", "Crème Réparatrice Neutre Haute Tolérance");
      soins.push("Consultation annuelle de contrôle chez un médecin dermatologue");

      hygiene.push("Consulter en urgence un dermatologue en cas de modification de taille, relief, contours, couleur ou saignement");
      hygiene.push("Bannir rigoureusement tout gommage, frottement agressif ou tentative de retrait artisanal sur la lésion");
      hygiene.push("Éviter les frottements répétés des vêtements, bretelles ou bijoux sur les grains de beauté en relief");
      break;
    }

    case "visage":
    default: {
      const has = (...keys: string[]) => weakest.some((ind) => keys.some((k) => norm(ind.nom).includes(k)));

      if (has("hydrat", "secheresse")) {
        matin.push("Brume hydratante aloka avant la crème");
        soir.push("Baume réparateur karité en couche généreuse");
        botaniques.push("Karité", "Aloka");
        produits.push("Baume Nuit Karité", "Sérum Hydratation Aloka");
        soins.push("Soin hydratant profond karité");
      }
      if (has("barriere")) {
        matin.push("Nettoyant doux sans savon (pH 5,5)");
        soir.push("Cérat apaisant en fin de routine");
        botaniques.push("Karité");
        produits.push("Cérat Réparateur Kènè");
        soins.push("Soin apaisant barrière");
      }
      if (has("pih", "pigment", "melasma")) {
        matin.push("Sérum vitamine C stabilisé");
        soir.push("Sérum niacinamide 5 % sur les taches");
        botaniques.push("Moringa");
        produits.push("Sérum Éclat Moringa", "SPF 50 teinté minéral");
        soins.push("Soin éclat mélanoderme");
      }
      if (has("eclat")) {
        matin.push("Sérum éclat vitamine C");
        botaniques.push("Moringa", "Bissap");
        produits.push("Sérum Éclat Moringa");
        soins.push("Gommage éclat doux 1×/semaine");
      }
      if (has("sebum", "pores", "texture", "noirs")) {
        matin.push("Nettoyant doux moussant");
        soir.push("Masque argile bissap 2×/semaine");
        botaniques.push("Bissap");
        produits.push("Masque Argile Bissap", "Sérum Niacinamide 5 %");
        soins.push("Soin purifiant matifiant");
      }
      if (has("acne")) {
        soir.push("Soin local niacinamide sur les imperfections");
        botaniques.push("Bissap", "Moringa");
        produits.push("Sérum Niacinamide 5 %");
        soins.push("Soin purifiant anti-imperfections");
      }
      if (has("rougeur", "irrit")) {
        matin.push("Brume apaisante aloka");
        soir.push("Gel apaisant sans alcool");
        botaniques.push("Aloka");
        produits.push("Gel Apaisant Aloka");
        soins.push("Soin apaisant anti-rougeurs");
      }
      if (has("cerne")) {
        matin.push("Tapotement léger de gel contour froid");
        botaniques.push("Baobab");
        produits.push("Gel Contour des Yeux Baobab");
        soins.push("Massage drainant contour des yeux");
      }
      if (has("elastic")) {
        matin.push("Sérum fermeté au baobab");
        soir.push("Massage lifting 3 min (huiles baobab)");
        botaniques.push("Baobab");
        produits.push("Huile Fermeté Baobab");
        soins.push("Soin remodelant visage");
      }
      if (has("keratose")) {
        soins.push("Évaluation des lésions par dermo-conseillère");
        produits.push("Écran solaire quotidien");
      }

      if (matin.length === 0) matin.push("Nettoyant doux + hydratation légère");
      if (soir.length === 0) soir.push("Nettoyant doux + soin de nuit");
      if (botaniques.length === 0) botaniques.push("Karité", "Moringa");
      if (produits.length === 0) produits.push("Sérum Éclat Moringa");
      if (soins.length === 0) soins.push("Soin signature de l'institut");
      break;
    }
  }

  // Drapeaux cliniques -> vigilances dédiées
  for (const f of flags) {
    if (f.label.includes("Dépigmentation") || f.label.includes("Dépigération")) {
      hygiene.push("Accompagnement de sevrage : arrêt progressif, jamais brutal, sous suivi dermo-cosmétique");
    }
    if (f.label.includes("protection solaire")) {
      hygiene.push("Protection solaire SPF 50 quotidienne indispensable sur peau mélanoderme");
    }
    if (f.label.includes("Grossesse")) {
      hygiene.push("Grossesse / allaitement : protocoles doux d'hydratation pure — rétinoïdes et actifs décapants proscrits");
    }
    if (f.label.includes("Hypersensibilité")) {
      hygiene.push("Test de tolérance 48 h au pli du coude avant tout nouveau cosmétique");
    }
    if (f.label.includes("Traitement")) {
      hygiene.push("Coordination avec le médecin prescripteur avant tout protocole cabine");
    }
    if (f.label.includes("Tension mécanique")) {
      hygiene.push("Stopper immédiatement les coiffures à forte traction pour prévenir l'alopécie définitive");
    }
  }

  if (hygiene.length === 0) {
    hygiene.push("Boire 1,5 L d'eau par jour pour soutenir l'hydratation cutanée", "Dormir 7 à 8 h pour favoriser le renouvellement cellulaire");
  }

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
  const zoneIndicators = ZONE_INDICATORS[zone];
  const scores = new Map<string, number>(zoneIndicators.map((n) => [n, BASE_SCORE]));
  const flags: QFlag[] = [];
  const qList = getQuestionsForZone(zone);
  const reqList = qList.filter((q) => q.required);

  let answered = 0;
  for (const q of qList) {
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
  const total = reqList.length;

  // Allergies déclarées → drapeau info
  const allergies = typeof answers.allergies === "string" ? answers.allergies.trim() : "";
  if (allergies) {
    flags.unshift({ level: "info", label: "Allergies déclarées", detail: allergies.slice(0, 200) });
  }

  // Nævi: le questionnaire ne peut pas évaluer ABCDE — honnêteté clinique
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

  // Recommandations: fusion équilibrée observation VLM + déclaratif questionnaire
  const rec: RecommendationSet = {
    resume: vlm.recommandations?.resume || qr.recommandations.resume,
    routine_matin: vlm.recommandations?.routine_matin?.length ? vlm.recommandations.routine_matin : qr.recommandations.routine_matin,
    routine_soir: vlm.recommandations?.routine_soir?.length ? vlm.recommandations.routine_soir : qr.recommandations.routine_soir,
    botaniques_conseillees: Array.from(
      new Set([...(vlm.recommandations?.botaniques_conseillees ?? []), ...qr.recommandations.botaniques_conseillees])
    ).slice(0, 6),
    produits: Array.from(
      new Set([...(vlm.recommandations?.produits ?? []), ...qr.recommandations.produits])
    ).slice(0, 6),
    soins_conseilles: Array.from(
      new Set([...(vlm.recommandations?.soins_conseilles ?? []), ...qr.recommandations.soins_conseilles])
    ).slice(0, 6),
    conseils_hygiene_vie: Array.from(
      new Set([...(vlm.recommandations?.conseils_hygiene_vie ?? []), ...qr.recommandations.conseils_hygiene_vie])
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
