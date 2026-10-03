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

export const SPECTRAL_VIEWS = [
  { id: "standard", label: "Standard", filter: "none" },
  { id: "pigment", label: "Pigmentation profonde", filter: "spectre-pigment" },
  { id: "inflammation", label: "Inflammation", filter: "spectre-inflammation" },
  { id: "acne", label: "Acné", filter: "spectre-acne" },
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

