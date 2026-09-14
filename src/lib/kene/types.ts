// Kènè — Types partagés (diagnostic IA, paie, compta, boutique)

export type BodyZone = "visage" | "dos" | "cuir_chevelu" | "mains" | "barbe" | "naevi";

export const BODY_ZONES: { id: BodyZone; label: string; hint: string; weight: number }[] = [
  { id: "visage", label: "Visage", hint: "De face, lumière naturelle", weight: 0.4 },
  { id: "dos", label: "Dos", hint: "Dos nu, miroir ou aide d'une proche", weight: 0.15 },
  { id: "cuir_chevelu", label: "Cuir chevelu", hint: "Écarter les cheveux, photographier la racine", weight: 0.1 },
  { id: "mains", label: "Mains", hint: "Paumes et dessus de mains", weight: 0.1 },
  { id: "barbe", label: "Barbe", hint: "Zone pilo-sébacée, poils courts", weight: 0.05 },
  { id: "naevi", label: "Nævi / grains de beauté", hint: "Chaque lésion pigmentée suspecte, cadre rapproché", weight: 0.2 },
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

