// Kènè Pro — Cosmétovigilance & Checklist Sécurité Cabine
// Prévention des contre-indications dermato-esthétiques et traçabilité des effets indésirables

export interface SafetyCheckItem {
  id: string;
  label: string;
  category: "grossesse" | "medication" | "allergie" | "soleil" | "lesion" | "cicatrisation";
  criticalFor: string[]; // Services ou types de soins bloquants
  description: string;
}

export const CABIN_SAFETY_CHECKLIST: SafetyCheckItem[] = [
  {
    id: "pregnancy",
    label: "Grossesse en cours ou allaitement",
    category: "grossesse",
    criticalFor: ["peeling", "laser", "microneedling", "retinoides", "huiles_essentielles_puissantes"],
    description: "Contre-indique les peelings aux BHA (acide salicylique), rétinoïdes à haute concentration et technologies invasives.",
  },
  {
    id: "roaccutane",
    label: "Traitement Isotrétinoïne / Roaccutane / Curacné dans les 6 derniers mois",
    category: "medication",
    criticalFor: ["peeling", "microneedling", "dermabrasion"],
    description: "Amincissement extrême de la barrière cutanée : risque sévère de desquamation profonde, brûlure et cicatrices chéloïdes.",
  },
  {
    id: "sun_exposure",
    label: "Exposition solaire intense récente (< 48h) ou coup de soleil actif",
    category: "soleil",
    criticalFor: ["peeling", "laser", "led_intense"],
    description: "Risque majeur de rebond pigmentaire et d'hyperpigmentation post-inflammatoire (HPI) sur peaux mélanodermes.",
  },
  {
    id: "active_infection",
    label: "Infection cutanée active, herpès en poussée ou plaie ouverte sur la zone",
    category: "lesion",
    criticalFor: ["soin_visage", "peeling", "microneedling", "nettoyage_profond"],
    description: "Interdiction formelle de manipulation afin d'éviter la dissémination bactérienne ou virale.",
  },
  {
    id: "cheloid_history",
    label: "Tendance connue aux cicatrices chéloïdes ou HPI marquée",
    category: "cicatrisation",
    criticalFor: ["microneedling", "peeling_moyen", "extraction_forcee"],
    description: "Adapter le protocole : éviter les aiguilles profondes (> 0.5mm) et privilégier des acides doux (acide mandélique, gluconolactone).",
  },
  {
    id: "allergies_known",
    label: "Allergies déclarées aux cosmétiques, parfums, aspirine ou karité",
    category: "allergie",
    criticalFor: ["peeling_salicylique", "soin_aromatique"],
    description: "Vérifier la composition des baumes et sérums avant application.",
  },
];

export interface SafetyEvaluationResult {
  safe: boolean;
  blockers: string[];
  precautions: string[];
}

/**
 * Analyse la compatibilité entre les réponses du questionnaire et le soin envisagé
 */
export function evaluateSafetyChecklist(
  treatmentCategoryOrName: string,
  checkedAnswers: Record<string, boolean>
): SafetyEvaluationResult {
  const normCategory = treatmentCategoryOrName.toLowerCase();
  const blockers: string[] = [];
  const precautions: string[] = [];

  const isPeeling = normCategory.includes("peeling") || normCategory.includes("acide");
  const isMicroneedling = normCategory.includes("needling") || normCategory.includes("roller");

  for (const item of CABIN_SAFETY_CHECKLIST) {
    const isAnswerYes = Boolean(checkedAnswers[item.id]);
    if (!isAnswerYes) continue;

    if (item.id === "roaccutane" && (isPeeling || isMicroneedling)) {
      blockers.push(`CONTRE-INDICATION FORMELLE : Roaccutane < 6 mois interdit les peelings et micro-needling.`);
    } else if (item.id === "active_infection") {
      blockers.push(`CONTRE-INDICATION FORMELLE : Lésion ou herpès actif. Soin reporté jusqu'à guérison complète.`);
    } else if (item.id === "pregnancy" && isPeeling) {
      blockers.push(`CONTRE-INDICATION : Grossesse/allaitement incompatible avec peelings chimiques puissants.`);
    } else if (item.id === "sun_exposure" && isPeeling) {
      blockers.push(`REPORT CONSEILLÉ : Exposition solaire récente (< 48h). Risque élevé d'hyperpigmentation.`);
    } else if (item.id === "cheloid_history" && isMicroneedling) {
      precautions.push(`ATTENTION : Antécédents de chéloïdes — limiter la profondeur à 0.25mm maximum ou reporter.`);
    } else {
      precautions.push(`Précautions requises (${item.label}) : adapter le protocole et faire un patch-test.`);
    }
  }

  return {
    safe: blockers.length === 0,
    blockers,
    precautions,
  };
}

export type ReactionSeverity = "mineure" | "moderee" | "severe";
export type ReactionType =
  | "erytheme_persistant"
  | "brulure_chimique"
  | "oedeme_gonflement"
  | "reaction_allergique"
  | "hyperpigmentation_post_peeling"
  | "desquamation_excessive"
  | "autre";

export interface CosmetovigilanceIncident {
  id: string;
  tenantId: string;
  tenantName?: string;
  clientProfileId?: string;
  clientName: string;
  clientPhone?: string;
  productOrServiceName: string;
  batchNumber?: string; // N° de lot produit si applicable
  reactionType: ReactionType;
  severity: ReactionSeverity;
  symptoms: string;
  actionTaken: string; // Ex: compresse d'eau florale, orientation dermatologue
  reportedBy: string;
  incidentDate: string;
  createdAt: string;
  status: "nouveau" | "en_suivi" | "clos";
}
