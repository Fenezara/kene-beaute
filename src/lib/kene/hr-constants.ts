// Kènè Pro — Référentiel RH : Postes, Contrats et Rôles métiers
// Prédéfinis et extensibles (postes personnalisés et types de contrats sur-mesure)

export interface HrRoleOption {
  value: string;
  label: string;
  hint: string;
}

export const PREDEFINED_ROLES: HrRoleOption[] = [
  { value: "estheticienne", label: "Esthéticienne", hint: "Agenda et Diagnostics en cabine" },
  { value: "dermo_conseillere", label: "Dermo-conseillère", hint: "Agenda, Diagnostics, CRM et Relances" },
  { value: "coiffeuse", label: "Coiffeuse / Coloriste", hint: "Agenda, Diagnostics capillaires et Soins" },
  { value: "prothesiste_ongulaire", label: "Prothésiste ongulaire", hint: "Agenda, Prestations ongles & soins des mains" },
  { value: "masseuse", label: "Masseuse / Praticienne Spa", hint: "Agenda, Soins corps et massages relaxants" },
  { value: "caissiere", label: "Caissière", hint: "Caisse POS, Catalogue, Ventes et Encaissements" },
  { value: "receptionniste", label: "Réceptionniste / Accueil", hint: "Accueil clientes, Agenda, CRM et Caisse" },
  { value: "responsable_stock", label: "Responsable Stock", hint: "Gestion des produits, entrées/sorties et alertes" },
  { value: "manager", label: "Manager", hint: "Toute la gestion opérationnelle du salon" },
  { value: "apprentie", label: "Apprentie / Stagiaire", hint: "Assistance cabine, apprentissage et accueil" },
];

export const ROLE_LABELS: Record<string, string> = {
  estheticienne: "Esthéticienne",
  dermo_conseillere: "Dermo-conseillère",
  coiffeuse: "Coiffeuse / Coloriste",
  prothesiste_ongulaire: "Prothésiste ongulaire",
  masseuse: "Masseuse / Spa",
  caissiere: "Caissière",
  receptionniste: "Réceptionniste / Accueil",
  responsable_stock: "Responsable Stock",
  manager: "Manager",
  apprentie: "Apprentie",
};

export interface HrContractOption {
  value: string;
  label: string;
  desc: string;
}

export const PREDEFINED_CONTRACTS: HrContractOption[] = [
  { value: "CDI", label: "CDI", desc: "Contrat à Durée Indéterminée (permanent)" },
  { value: "CDD", label: "CDD", desc: "Contrat à Durée Déterminée (terme fixé)" },
  { value: "Stage", label: "Stage", desc: "Stage d'école ou d'immersion professionnelle" },
  { value: "Prestation", label: "Prestation / Freelance", desc: "Rémunération à la prestation ou commission" },
  { value: "Apprentissage", label: "Apprentissage", desc: "Formation pratique et certificat métier" },
  { value: "Extra", label: "Extra / Journalier", desc: "Renfort ponctuel à la journée ou vacation" },
  { value: "Essai", label: "Période d'essai", desc: "Phase probatoire avant titularisation" },
];

export const CONTRACT_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  Stage: "Stage",
  Prestation: "Prestation / Freelance",
  Apprentissage: "Apprentissage",
  Extra: "Extra / Journalier",
  Essai: "Période d'essai",
};

/** Formate l'intitulé d'un poste (standard ou personnalisé) */
export function formatRole(role: string | null | undefined): string {
  if (!role) return "Collaboratrice";
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  if (role.startsWith("custom:")) return role.replace(/^custom:/, "");
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Formate l'intitulé d'un contrat (standard ou personnalisé) */
export function formatContract(contract: string | null | undefined): string {
  if (!contract) return "CDI";
  if (CONTRACT_LABELS[contract]) return CONTRACT_LABELS[contract];
  if (contract.startsWith("custom:")) return contract.replace(/^custom:/, "");
  return contract;
}

export interface ModulableModule {
  id: string;
  label: string;
  shortLabel: string;
  category: "clinique" | "commerce" | "relation" | "pilotage" | "gestion";
  categoryLabel: string;
  emoji: string;
  description: string;
}

export const MODULABLE_MODULES: ModulableModule[] = [
  // Cabine & Soins
  {
    id: "diagnostic",
    label: "Diagnostic Peau & IA",
    shortLabel: "Diagnostic",
    category: "clinique",
    categoryLabel: "Cabine & Clinique Dermo",
    emoji: "📸",
    description: "Scan facial, biomarqueurs cutanés et ordonnance de soins.",
  },
  {
    id: "dossiers_peau",
    label: "Dossiers Cutanés",
    shortLabel: "Dossiers",
    category: "clinique",
    categoryLabel: "Cabine & Clinique Dermo",
    emoji: "🔬",
    description: "Historique d'évolution, photos HD et suivi cabine.",
  },
  {
    id: "agenda",
    label: "Agenda & Soins",
    shortLabel: "Agenda",
    category: "clinique",
    categoryLabel: "Cabine & Clinique Dermo",
    emoji: "📅",
    description: "Planning des cabines, réservations et rendez-vous du jour.",
  },
  // Caisse, Stock & Commerce
  {
    id: "caisse",
    label: "Ventes & Caisse POS",
    shortLabel: "Caisse",
    category: "commerce",
    categoryLabel: "Caisse, Stock & Offre",
    emoji: "💳",
    description: "Encaissement en espèces, Wave, Orange Money et reçus.",
  },
  {
    id: "stock",
    label: "Inventaire du Stock",
    shortLabel: "Stock",
    category: "commerce",
    categoryLabel: "Caisse, Stock & Offre",
    emoji: "📦",
    description: "Stock cabine & revente, alertes de rupture, réassort et entrées/sorties.",
  },
  {
    id: "catalogue",
    label: "Catalogue des Soins",
    shortLabel: "Catalogue Soins",
    category: "commerce",
    categoryLabel: "Caisse, Stock & Offre",
    emoji: "🛍️",
    description: "Cartes des prestations, tarifs et soins praticables en institut.",
  },
  // Relation & IA
  {
    id: "crm",
    label: "CRM Clientes & Fidélité",
    shortLabel: "CRM Clientes",
    category: "relation",
    categoryLabel: "Relation & Fidélité",
    emoji: "👥",
    description: "Coordonnées des clientes, historique d'achats et notes de cabine.",
  },
  {
    id: "relances",
    label: "Relances Automatiques",
    shortLabel: "Relances",
    category: "relation",
    categoryLabel: "Relation & Fidélité",
    emoji: "🔔",
    description: "Suivi post-soin et rappels WhatsApp ciblés.",
  },
  {
    id: "assistant",
    label: "Secrétaire IA (Maman)",
    shortLabel: "Secrétaire IA",
    category: "relation",
    categoryLabel: "Relation & Fidélité",
    emoji: "👑",
    description: "Rappels WhatsApp 24/7 et débriefing vocal intelligent.",
  },
  // Pilotage & RH
  {
    id: "dashboard",
    label: "Tableau de Bord & KPIs",
    shortLabel: "Dashboard",
    category: "pilotage",
    categoryLabel: "Pilotage & Activité",
    emoji: "📊",
    description: "Chiffre d'affaires en temps réel, fréquentation et analyses.",
  },
  {
    id: "equipe",
    label: "Équipe & Pointage",
    shortLabel: "Pointage Équipe",
    category: "gestion",
    categoryLabel: "Gestion Opérationnelle",
    emoji: "⏰",
    description: "Pointage des arrivées/départs et planning du personnel.",
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  estheticienne: ["dossiers_peau", "diagnostic", "agenda", "assistant"],
  dermo_conseillere: ["dossiers_peau", "diagnostic", "crm", "agenda", "relances", "assistant"],
  coiffeuse: ["agenda", "diagnostic", "assistant"],
  prothesiste_ongulaire: ["agenda", "diagnostic", "assistant"],
  masseuse: ["agenda", "diagnostic", "assistant"],
  caissiere: ["caisse", "catalogue", "stock", "assistant"],
  receptionniste: ["agenda", "caisse", "crm", "relances", "assistant"],
  responsable_stock: ["stock", "catalogue", "assistant"],
  manager: ["dashboard", "dossiers_peau", "diagnostic", "assistant", "agenda", "caisse", "crm", "relances", "equipe", "catalogue", "stock"],
  apprentie: ["dossiers_peau", "diagnostic", "agenda", "assistant"],
};

export function getDefaultPermissionsForRole(role: string): string[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? ["agenda", "diagnostic", "assistant"];
}

