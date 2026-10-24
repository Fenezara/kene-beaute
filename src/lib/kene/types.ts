// Kènè — Types partagés (diagnostic IA, paie, compta, boutique)

export type BodyZone = "visage" | "dos" | "cuir_chevelu" | "mains" | "barbe" | "naevi";

export const BODY_ZONES: { id: BodyZone; label: string; hint: string; weight: number }[] = [
  { id: "visage", label: "Visage", hint: "Front, joues, nez, menton, tempes", weight: 0.4 },
  { id: "dos", label: "Dos & Épaules", hint: "Haut et bas du dos, omoplates, reins", weight: 0.15 },
  { id: "cuir_chevelu", label: "Cuir chevelu", hint: "Lisière frontale, tempes, golfes, vertex", weight: 0.1 },
  { id: "mains", label: "Mains & Pieds", hint: "Extrémités : paumes, plantes, talons, callosités et ongles", weight: 0.1 },
  { id: "barbe", label: "Barbe & Cou", hint: "Zone pilo-sébacée, menton, mâchoire, cou", weight: 0.05 },
  { id: "naevi", label: "Corps (Bras, Jambes, Torse) & Lésions", hint: "Bras, jambes, torse, ventre, cuisses, taches et grains de beauté", weight: 0.2 },
];

export interface ZoneMark {
  label: string;
  x: number; // 0-100 %
  y: number;
  w: number;
  h: number;
  severite: number; // 0-3
}

export interface Indicator {
  nom: string;
  severite: number; // 0 (aucun) → 3 (sévère)
  pourcentage: number; // score santé 0-100
  note?: string;
}

export interface AbcdeCriteria {
  critere: string; // A..E
  intitule: string;
  alerte: boolean;
  detail: string;
}

export interface RecommendationSet {
  resume: string;
  routine_matin: string[];
  routine_soir: string[];
  botaniques_conseillees: string[];
  produits: string[];
  soins_conseilles: string[];
  conseils_hygiene_vie: string[];
}

/** Niveau de conduite Kènè pour une affection de l'atlas africain:
 * educatif → conseils doux possibles; institut → dermo-conseillère partenaire;
 * dermato → avis médical; urgence → consultation immédiate. */
export type AtlasLevel = "educatif" | "institut" | "dermato" | "urgence";

/** Affection suspectée par le VLM après validation anti-hallucination
 * (id EXACT de l'atlas + zone cohérente + confiance ≥ 25). Jamais un
 * diagnostic formel: une hypothèse éducative à faire confirmer. */
export interface SuspectedCondition {
  id: string;
  nom: string;
 /** Label lisible de la famille (ex. « Infections parasitaires »). */
  categorie: string;
 /** 0-100, confiance du modèle de vision. */
  confiance: number;
  niveau: AtlasLevel;
 /** Comment ça se présente sur peau noire — la clé de la reconnaissance. */
  surPeauNoire: string;
 /** Conduite de Kènè en une phrase. */
  action: string;
 /** Signe d'alerte éventuel. */
  drapeau?: string;
}

export interface DiagnosisResult {
  score_global: number; // 0-100 santé de peau
  fitzpatrick_estime?: string;
  zone: BodyZone;
  indicateurs: Indicator[];
  zones_marquages: ZoneMark[];
  recommandations: RecommendationSet;
  orientation_dermato: boolean;
  raison_orientation?: string;
  abcde?: AbcdeCriteria[];
 /** Hypothèses éducatives de l'atlas africain — renvoyées par le
 * VLM uniquement (jamais en mode secours), max 2, validées côté serveur
 * (id exact + zone cohérente + confiance ≥ 25). */
  hypotheses?: SuspectedCondition[];
  avertissement: string;
  source: "vlm" | "fallback";
 /** Fiabilité affichée: "haute" = analyse IA vision (VLM),
 * "indicative" = fallback déterministe (mode secours). Optionnel: les
 * anciens resultJson ne l'ont pas → le front le dérive de `source`. */
  confidence?: "haute" | "indicative";
}

export const FACE_INDICATORS = [
  "Hydratation",
  "Barrière cutanée",
  "Élasticité / Fermeté",
  "Éclat / Uniformité du teint",
  "Texture / Pores dilatés",
  "Points noirs & microkystes",
  "Acné active (papules / pustules)",
  "Taches PIH post-inflammatoires",
  "Mélasma",
  "Hyperpigmentation globale",
  "Rougeurs / Inflammation",
  "Excès de sébum",
  "Cernes & poches",
  "DPN / Kératoses",
] as const;

export const ZONE_INDICATORS: Record<BodyZone, string[]> = {
  visage: [...FACE_INDICATORS],
  dos: ["Acné dorsale", "Taches PIH du dos", "Excès de sébum", "Texture / Rugosité", "Irritation / Rougeurs", "Hydratation du dos"],
  cuir_chevelu: ["Desquamation (pellicules)", "Excès de sébum", "Irritation du cuir chevelu", "Folliculite", "Sécheresse", "Taches alopeciques"],
  mains: ["Sécheresse cutanée", "Kératose / Callosités", "Taches pigmentaires", "État des ongles", "Irritation / Eczéma"],
  barbe: ["Poils incarnés", "Folliculite de barbe", "Taches PIH barbe", "Excès de sébum", "Hydratation de la zone"],
  naevi: ["Asymétrie (A)", "Bords irréguliers (B)", "Couleurs multiples (C)", "Diamètre > 6 mm (D)", "Évolution (E)"],
};

export interface SpectralViewDefinition {
  id: string;
  label: string;
  shortLabel: string;
  wavelength: string;
  filter: string;
  opticalTarget: string;
  clinicalSignificance: string;
  botanicals: readonly string[] | string[];
  recommendedFormula: string;
}

export const SPECTRAL_VIEWS = [
  {
    id: "standard",
    label: "Lumière Blanche Naturelle",
    shortLabel: "Standard",
    wavelength: "400-700 nm",
    filter: "spectre-standard",
    opticalTarget: "Surface épidermique visible",
    clinicalSignificance: "Aspect visuel en lumière du jour, carnation naturelle et texture de surface.",
    botanicals: ["Hydrolat de Rose", "Gel d'Aloe Vera natif"],
    recommendedFormula: "Maintien de l'hydratation quotidienne et protection de barrière.",
  },
  {
    id: "uv365",
    label: "UV-A 365 nm (Wood Digital)",
    shortLabel: "365 nm UV",
    wavelength: "365 nm",
    filter: "spectre-uv365",
    opticalTarget: "Autofluorescence des porphyrines & champignons",
    clinicalSignificance: "Fluorescence corail C. acnes, détection Malassezia et profondeur du mélasma.",
    botanicals: ["Huile de Balanites", "Savon Noir au Miel"],
    recommendedFormula: "Nettoyage purifiant non comédogène et régulation du microbiome.",
  },
  {
    id: "blue405",
    label: "Bleu Soret 405 nm",
    shortLabel: "405 nm Bleu",
    wavelength: "405 nm",
    filter: "spectre-blue405",
    opticalTarget: "Micro-comédons & Sébum folliculaire",
    clinicalSignificance: "Cartographie pré-lésionnelle, pores engorgés et folliculite de barbe.",
    botanicals: ["Extrait de Moringa", "Huile de Neem", "Zinc PCA"],
    recommendedFormula: "Sérum purifiant sébo-régulateur aux polyphénols de Moringa.",
  },
  {
    id: "green540",
    label: "Vert Oxyhémoglobine 540 nm",
    shortLabel: "540 nm Vert",
    wavelength: "540 nm",
    filter: "spectre-green540",
    opticalTarget: "Érythème & Vascularisation masquée",
    clinicalSignificance: "Révélation des rougeurs et de l'EPI masqués par l'eumélanine sur peau noire.",
    botanicals: ["Macérât de Kinkeliba", "Eau de Camomille", "Allantoïne"],
    recommendedFormula: "Complexe apaisant anti-échauffement et protecteur capillaire.",
  },
  {
    id: "amber585",
    label: "Ambre 585 nm (Indice Mélanine)",
    shortLabel: "585 nm Ambre",
    wavelength: "585 nm",
    filter: "spectre-amber585",
    opticalTarget: "Mélanosomes & Hyperpigmentation HPI",
    clinicalSignificance: "Cartographie pure des taches sans confusion avec l'érythème vasculaire.",
    botanicals: ["Fleur d'Hibiscus (Bissap)", "Niacinamide 5%", "Acide Azélaïque 10%"],
    recommendedFormula: "Sérum unifiant éclaircissant anti-HPI aux acides doux de Bissap.",
  },
  {
    id: "red660",
    label: "Rouge Profond 660 nm",
    shortLabel: "660 nm Rouge",
    wavelength: "660 nm",
    filter: "spectre-red660",
    opticalTarget: "Collagène, Fermeté & Derme moyen",
    clinicalSignificance: "Densité matricielle, risque chéloïdien cicatriciel et micro-relief élastique.",
    botanicals: ["Huile pure de Baobab", "Centella Asiatica", "Beurre de Karité brut"],
    recommendedFormula: "Baume régénérant stimulant la synthèse de collagène.",
  },
  {
    id: "nir850",
    label: "Proche Infrarouge 850 nm",
    shortLabel: "850 nm NIR",
    wavelength: "850 nm",
    filter: "spectre-nir850",
    opticalTarget: "Derme profond sous transparence mélanique",
    clinicalSignificance: "Transparence totale de la mélanine, plexus vasculaire profond et bulbes pilaires.",
    botanicals: ["Huile de Ricin noir", "Beurre de Karité Grand Cru", "Huile de Marula"],
    recommendedFormula: "Émulsion nutritive profonde réparatrice des tissus sous-cutanés.",
  },
  {
    id: "polarized",
    label: "Lumière Polarisée 0° (Micro-relief)",
    shortLabel: "Polarisé",
    wavelength: "Lumière polarisée 0°",
    filter: "spectre-polarized",
    opticalTarget: "Couche cornée, Squames & Lipides de surface",
    clinicalSignificance: "Évaluation de la xérose, déshydratation aiguë et desquamation grisâtre.",
    botanicals: ["Beurre de Karité sauvage", "Cérat végétal au Cacao"],
    recommendedFormula: "Baume relipidant scellant de barrière cutanée.",
  },
] as const;

export type SpectralViewId =
  | "standard"
  | "uv365"
  | "blue405"
  | "green540"
  | "amber585"
  | "red660"
  | "nir850"
  | "polarized";

export const ALL_SPECTRAL_VIEW_IDS: SpectralViewId[] = [
  "standard",
  "uv365",
  "blue405",
  "green540",
  "amber585",
  "red660",
  "nir850",
  "polarized",
];

/**
 * Pré-sélectionne intelligemment les 4 vues cliniques les plus pertinentes parmi les 8
 * selon les biomarqueurs les plus faibles du diagnostic (avec "standard" en référence).
 */
export function recommend4SpectralViews(
  indicators?: Array<{ nom: string; pourcentage: number }>
): [SpectralViewId, SpectralViewId, SpectralViewId, SpectralViewId] {
  const defaultQuad: [SpectralViewId, SpectralViewId, SpectralViewId, SpectralViewId] = [
    "standard",
    "amber585",
    "green540",
    "blue405",
  ];
  if (!indicators || indicators.length === 0) return defaultQuad;

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const minScoreFor = (...keywords: string[]): number => {
    let min = 100;
    for (const ind of indicators) {
      const n = norm(ind.nom);
      if (keywords.some((k) => n.includes(k))) {
        if (ind.pourcentage < min) min = ind.pourcentage;
      }
    }
    return min;
  };

  // Plus le score santé d'un axe est bas, plus la vue spectrale correspondante est prioritaire
  const candidates: Array<{ id: SpectralViewId; score: number }> = [
    { id: "amber585", score: minScoreFor("pih", "tache", "hyperpigment", "melasma", "eclat", "couleur") - 2 },
    { id: "green540", score: minScoreFor("rougeur", "inflamm", "irrit", "follicul", "sensib") - 1 },
    { id: "blue405", score: minScoreFor("sebum", "pore", "noir", "microkyst", "incarn") - 1 },
    { id: "uv365", score: minScoreFor("acne", "melasma", "pellicul", "champign") },
    { id: "polarized", score: minScoreFor("hydrat", "barriere", "secheresse", "desquam", "keratose", "callos") },
    { id: "red660", score: minScoreFor("elastic", "fermet", "ride", "cicatric", "rugos", "texture") },
    { id: "nir850", score: minScoreFor("alopec", "cerne", "poche", "profond", "diametre", "evolution") },
  ];

  candidates.sort((a, b) => a.score - b.score);
  const picked: SpectralViewId[] = ["standard"];
  for (const c of candidates) {
    if (picked.length >= 4) break;
    if (!picked.includes(c.id)) picked.push(c.id);
  }
  while (picked.length < 4) {
    for (const d of defaultQuad) {
      if (!picked.includes(d)) {
        picked.push(d);
        break;
      }
    }
  }
  return [picked[0], picked[1], picked[2], picked[3]];
}

/**
 * Sélection d'Élite 2026 pour l'Espace Cliente (4 Vues Multi-Spectrales Clés)
 * 1. Lumière Naturelle (400-700 nm) : Référence de surface et carnation visible
 * 2. Ambre (585 nm) : Cartographie pure de la mélanine & taches d'hyperpigmentation HPI
 * 3. Vert (540 nm) : Révélation de l'inflammation et des rougeurs masquées par l'eumélanine
 * 4. Bleu (405 nm) : Pores, comédons, excès de sébum & zones pré-lésionnelles
 */
export const CLIENT_SPECTRAL_VIEWS = [
  SPECTRAL_VIEWS[0], // standard
  SPECTRAL_VIEWS[4], // amber585
  SPECTRAL_VIEWS[3], // green540
  SPECTRAL_VIEWS[2], // blue405
] as const;

export const RFM_SEGMENTS = ["Champions", "Fidèles", "Potentiels", "À risque", "Perdus", "Nouveaux"] as const;

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
  image: string;
}

export interface ZonePhotoSlot {
  id: string;
  label: string;
  hint: string;
  required?: boolean;
}

export const ZONE_PHOTO_SLOTS: Record<BodyZone, ZonePhotoSlot[]> = {
  visage: [
    { id: "face", label: "Face frontale", hint: "De face, regard droit, lumière naturelle", required: true },
    { id: "profil_gauche", label: "Profil gauche", hint: "Joue et tempe gauche à 45°" },
    { id: "profil_droit", label: "Profil droit", hint: "Joue et tempe droite à 45°" },
  ],
  dos: [
    { id: "haut_dos", label: "Haut du dos & Épaules", hint: "Omoplates et haut du dos dégagés", required: true },
    { id: "bas_dos", label: "Bas du dos & Reins", hint: "Milieu et bas du dos" },
  ],
  cuir_chevelu: [
    { id: "ligne_frontale", label: "Ligne frontale & Golfes", hint: "Racines et lisière des cheveux", required: true },
    { id: "vertex", label: "Vertex & Sommet", hint: "Vue plongeante du dessus du crâne" },
  ],
  mains: [
    { id: "dessus_mains", label: "Dessus (Mains / Pieds & Ongles)", hint: "Dos des mains ou dessus des pieds et ongles", required: true },
    { id: "paumes", label: "Plantes, Talons ou Paumes", hint: "Plantes des pieds, talons crevassés ou paumes ouvertes" },
  ],
  barbe: [
    { id: "menton_cou", label: "Menton & Cou", hint: "Zone sous-mandibulaire et gorge", required: true },
    { id: "machoires", label: "Joues & Mâchoires", hint: "Profil de barbe et angle maxillaire" },
  ],
  naevi: [
    { id: "vue_ensemble", label: "Vue d'ensemble", hint: "Vue générale avec repère anatomique (~30 cm)", required: true },
    { id: "macro", label: "Macro rapprochée", hint: "Gros plan net et bien éclairé sur la lésion" },
  ],
};

