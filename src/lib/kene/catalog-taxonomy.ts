// Kènè — Taxonomie & Organisation des Soins et des Produits
// Classification unifiée pour les instituts, la caisse POS, les réservations et la boutique.

export interface CategoryMeta {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  tone: "gold" | "terre" | "bissap" | "success" | "blue" | "purple";
}

// ─────────────── 1. TYPES DE SOINS (SERVICES EN INSTITUT) ───────────────

export const SERVICE_CATEGORIES: readonly CategoryMeta[] = [
  {
    id: "soin",
    label: "Soins Visage & Éclat",
    shortLabel: "Visage",
    description: "Rituels hydratants, anti-taches PIH, éclat kinkeliba, hydro-facial et soins purifiants.",
    tone: "gold",
  },
  {
    id: "massage",
    label: "Massages & Rituels Corps",
    shortLabel: "Massages",
    description: "Modelages relaxants au beurre de karité tiède, drainage lymphatique et rituels signature.",
    tone: "terre",
  },
  {
    id: "gommage",
    label: "Gommages & Exfoliations",
    shortLabel: "Gommages",
    description: "Exfoliations corporelles au café de Man, aux sels marins et au bissap tonifiant.",
    tone: "bissap",
  },
  {
    id: "diagnostic",
    label: "Diagnostics & Bilans de Peau",
    shortLabel: "Diagnostics",
    description: "Bilans dermo-botaniques approfondis, analyse caméra et prescriptions de rituels sur mesure.",
    tone: "blue",
  },
  {
    id: "capillaire",
    label: "Soins Capillaires & Cuir Chevelu",
    shortLabel: "Capillaire",
    description: "Bains d'huiles végétales tièdes, protocoles de pousse et revitalisation des cheveux afro et crépus.",
    tone: "success",
  },
  {
    id: "consultation",
    label: "Consultations & Dermo-Conseil",
    shortLabel: "Consultations",
    description: "Entretien personnalisé, ordonnances cosmétiques et suivi d'évolution post-protocole.",
    tone: "purple",
  },
  {
    id: "onglerie",
    label: "Mains, Pieds & Onglerie",
    shortLabel: "Mains & Pieds",
    description: "Soins nourrissants des mains au karité, manucure et pédicure orientale relaxante.",
    tone: "terre",
  },
] as const;

export function getServiceCategoryMeta(id: string): CategoryMeta {
  if (!id) {
    return {
      id: "autre",
      label: "Autre Soin",
      shortLabel: "Autre",
      description: "Prestation personnalisée en institut.",
      tone: "gold",
    };
  }
  const found = SERVICE_CATEGORIES.find((c) => c.id.toLowerCase() === id.toLowerCase());
  if (found) return found;
  const label = id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, " ");
  return {
    id,
    label,
    shortLabel: label,
    description: `Prestation sur mesure : ${label}`,
    tone: "gold",
  };
}

// ─────────────── 2. TYPES DE PRODUITS (HERBORISTERIE & COSMÉTIQUES) ───────────────

export const PRODUCT_CATEGORIES: readonly CategoryMeta[] = [
  {
    id: "serum",
    label: "Sérums & Actifs Concentrés",
    shortLabel: "Sérums",
    description: "Concentrés antioxydants : moringa, kinkeliba, niacinamide et vitamine C.",
    tone: "gold",
  },
  {
    id: "creme",
    label: "Crèmes & Baumes Nourrissants",
    shortLabel: "Crèmes & Baumes",
    description: "Baumes purs au beurre de karité de Korhogo, crèmes fouettées et émulsions protectrices.",
    tone: "terre",
  },
  {
    id: "huile",
    label: "Huiles Végétales Pures",
    shortLabel: "Huiles",
    description: "Huiles de première pression à froid : baobab, neem, souchet, sésame et ricin noir.",
    tone: "gold",
  },
  {
    id: "gommage",
    label: "Gommages & Exfoliants",
    shortLabel: "Gommages",
    description: "Gommages exfoliants au sucre de canne roux, poudre de graines de bissap et café.",
    tone: "bissap",
  },
  {
    id: "masque",
    label: "Masques Botaniques",
    shortLabel: "Masques",
    description: "Masques détoxifiants et régénérants à l'argile aloka, moringa et charbon végétal.",
    tone: "purple",
  },
  {
    id: "savon",
    label: "Savons & Hygiène Douce",
    shortLabel: "Savons",
    description: "Savons noirs artisanaux saponifiés à froid, surgras et gels nettoyants botaniques.",
    tone: "success",
  },
  {
    id: "solaire",
    label: "Solaire & Protection Teint",
    shortLabel: "Solaires",
    description: "Écrans solaires haute protection SPF50 invisibles, sans traces blanches sur peaux brunes et noires.",
    tone: "blue",
  },
  {
    id: "capillaire",
    label: "Soins Capillaires Botaniques",
    shortLabel: "Capillaire",
    description: "Poudres de chébé, leave-in conditionneurs et beurres fortifiants pour les longueurs.",
    tone: "success",
  },
] as const;

export function getProductCategoryMeta(id: string): CategoryMeta {
  if (!id) {
    return {
      id: "autre",
      label: "Autre Produit",
      shortLabel: "Autre",
      description: "Soin cosmétique formulé avec des plantes d'Afrique de l'Ouest.",
      tone: "terre",
    };
  }
  const found = PRODUCT_CATEGORIES.find((c) => c.id.toLowerCase() === id.toLowerCase());
  if (found) return found;
  const label = id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, " ");
  return {
    id,
    label,
    shortLabel: label,
    description: `Produit cosmétique : ${label}`,
    tone: "terre",
  };
}

/** Tonalité de badge Tailwind pour chaque catégorie */
export function getCategoryToneBadgeClass(tone: CategoryMeta["tone"]): string {
  switch (tone) {
    case "gold":
      return "bg-gold/15 text-gold-text border-gold/30";
    case "terre":
      return "bg-terre/15 text-terre border-terre/30";
    case "bissap":
      return "bg-bissap/15 text-destructive border-bissap/30";
    case "success":
      return "bg-success/15 text-success border-success/30";
    case "blue":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "purple":
      return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
