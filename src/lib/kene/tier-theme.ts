// Kènè — Système d'Ambiance & Palettes de Couleurs par Statut d'Abonnement.
// Chaque palier d'abonnement débloque une identité chromatique noble d'Afrique :
// • Découverte (Gratuit) : Karité Brut & Tiébélé (Terracotta & crème karité)
// • Kènè+ Initiée (M1-M3) : Bissap Royal & Nectar (Rouge bissap velours & hibiscus)
// • Kènè+ Cercle Royal (M4-M6+) : L'Étoffe d'Or Impériale (Or Akan solaire & ambre)
// • Pro Starter : Atelier Argile & Cuivre (Terracotta & cuivre sablé)
// • Pro Institut : Émeraude Kinkeliba & Or (Botanique clinique & prestige vert)
// • Pro Complexe : Indigo Impérial Mandingue (Bleu nuit de haute direction & platine)

import type { SessionUser } from "@/store/kene";

export type TierThemeId =
  | "karite_tiebele"
  | "bissap_royal"
  | "or_imperial"
  | "argile_cuivre"
  | "emeraude_kinkeliba"
  | "indigo_mandingue";

export interface TierThemeDef {
  id: TierThemeId;
  name: string;
  subtitle: string;
  badge: string;
  audience: "client" | "pro" | "all";
  primaryColor: string;
  accentColor: string;
  glowColor: string;
  previewGradient: string;
  description: string;
  tag: string;
}

export const TIER_THEMES: readonly TierThemeDef[] = [
  {
    id: "karite_tiebele",
    name: "Karité Brut & Tiébélé",
    subtitle: "Terre cuite, crème karité et argile ancestrale",
    badge: "Découverte",
    audience: "all",
    primaryColor: "#B25A38",
    accentColor: "#F7EAE3",
    glowColor: "rgba(178, 90, 56, 0.25)",
    previewGradient: "from-[#B25A38] to-[#FAF5EB]",
    description: "Ambiance organique et chaleureuse inspirée des poteries de Tiébélé et du beurre de karité brut.",
    tag: "Essentiel",
  },
  {
    id: "bissap_royal",
    name: "Bissap Royal & Nectar",
    subtitle: "Fleur d'hibiscus veloutée & or Akan solaire",
    badge: "Kènè+ Initiée",
    audience: "client",
    primaryColor: "#9E2045",
    accentColor: "#FDE8EE",
    glowColor: "rgba(158, 32, 69, 0.25)",
    previewGradient: "from-[#9E2045] via-[#C93B62] to-[#D49A24]",
    description: "Signature dermo-beauté féminine, éclatante et vivifiante, infusée de calice d'hibiscus rouge.",
    tag: "Kènè+",
  },
  {
    id: "or_imperial",
    name: "L'Étoffe d'Or Impériale",
    subtitle: "Or Akan pur, ambre chaud & ébène nacré",
    badge: "Cercle Royal 👑",
    audience: "client",
    primaryColor: "#C58A18",
    accentColor: "#FDF4E3",
    glowColor: "rgba(212, 154, 36, 0.30)",
    previewGradient: "from-[#D49A24] via-[#E5A93C] to-[#18120C]",
    description: "Prestige absolu et distinction royale réservés aux membres les plus fidèles du Cercle Kènè.",
    tag: "Prestige",
  },
  {
    id: "argile_cuivre",
    name: "Atelier Argile & Cuivre",
    subtitle: "Terracotta solaire & cuivre naturel",
    badge: "Pro Starter",
    audience: "pro",
    primaryColor: "#B55828",
    accentColor: "#F8EBE4",
    glowColor: "rgba(181, 88, 40, 0.25)",
    previewGradient: "from-[#B55828] to-[#E8D8BF]",
    description: "Énergie artisanale et intime conçue pour la praticienne solo et le dermo-conseil indépendant.",
    tag: "Starter",
  },
  {
    id: "emeraude_kinkeliba",
    name: "Émeraude Kinkeliba & Or",
    subtitle: "Botanique ancestrale & rigueur clinique",
    badge: "Pro Institut ✨",
    audience: "pro",
    primaryColor: "#246B39",
    accentColor: "#E6F5EC",
    glowColor: "rgba(36, 107, 57, 0.25)",
    previewGradient: "from-[#246B39] via-[#2E6F40] to-[#D49A24]",
    description: "L'élégance de la pharmacopée africaine, alliance de rigueur dermo-clinique et de sérénité végétale.",
    tag: "Institut",
  },
  {
    id: "indigo_mandingue",
    name: "Indigo Impérial Mandingue",
    subtitle: "Bleu nuit royal, platine & haute gouvernance",
    badge: "Pro Complexe 🏛️",
    audience: "pro",
    primaryColor: "#1C355E",
    accentColor: "#E6EEFA",
    glowColor: "rgba(28, 53, 94, 0.28)",
    previewGradient: "from-[#1C355E] via-[#2A4A7F] to-[#C59B27]",
    description: "Prestige institutionnel des grands spas, cliniques dermo et complexes multi-établissements.",
    tag: "Complexe",
  },
];

const STORAGE_KEY = "kene_user_tier_theme";

/** Vérifie si un thème donné est débloqué pour l'utilisateur */
export function isTierUnlocked(
  themeId: TierThemeId,
  context: {
    user: SessionUser | null;
    planId?: string | null;
    monthsPaid?: number;
    currentMonth?: number;
  }
): boolean {
  const { user, planId, monthsPaid = 0, currentMonth = 0 } = context;

  // 1. Thème par défaut toujours débloqué pour tous
  if (themeId === "karite_tiebele") return true;

  // 2. Administrateur : accès à toutes les palettes pour tests & aperçus
  if (user?.role === "admin") return true;

  const isPro = user?.role === "pro";
  const effectiveMonth = Math.max(monthsPaid, currentMonth);

  // 3. Palettes Entreprise Pro
  if (themeId === "indigo_mandingue") {
    return isPro && planId === "pro_complexe";
  }
  if (themeId === "emeraude_kinkeliba") {
    return isPro && (planId === "pro_complexe" || planId === "pro_institut");
  }
  if (themeId === "argile_cuivre") {
    return isPro && (planId === "pro_complexe" || planId === "pro_institut" || planId === "pro_starter" || !planId);
  }

  // 4. Palettes Cliente Kènè+
  if (themeId === "or_imperial") {
    // Débloqué à partir du mois 4 de fidélité Kènè+, ou avantage gérante/employée
    return (
      (planId === "kene_plus" && effectiveMonth >= 4) ||
      user?.role === "pro" // Les collaboratrices ont le pass prestige Kènè+
    );
  }

  if (themeId === "bissap_royal") {
    // Débloqué dès l'activation de Kènè+ (mois 0 ou plus) ou avantage collaboratrice
    return planId === "kene_plus" || user?.role === "pro";
  }

  return false;
}

/** Calcule le thème par défaut lié à l'abonnement actif */
export function resolveDefaultTierTheme(context: {
  user: SessionUser | null;
  planId?: string | null;
  monthsPaid?: number;
  currentMonth?: number;
}): TierThemeId {
  const { user, planId, monthsPaid = 0, currentMonth = 0 } = context;

  // Profil Pro
  if (user?.role === "pro") {
    if (planId === "pro_complexe") return "indigo_mandingue";
    if (planId === "pro_institut") return "emeraude_kinkeliba";
    if (planId === "pro_starter") return "argile_cuivre";
    return "emeraude_kinkeliba"; // Par défaut élégant en entreprise
  }

  // Profil Client
  const effectiveMonth = Math.max(monthsPaid, currentMonth);
  if (planId === "kene_plus") {
    if (effectiveMonth >= 4) return "or_imperial";
    return "bissap_royal";
  }

  return "karite_tiebele";
}

/** Récupère la préférence utilisateur sauvegardée (ou null si mode automatique) */
export function getSavedTierTheme(): TierThemeId | null {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val && TIER_THEMES.some((t) => t.id === val)) {
      return val as TierThemeId;
    }
  } catch {}
  return null;
}

/** Sauvegarde le choix de l'utilisateur (ou réinitialise au mode automatique si null) */
export function saveTierTheme(themeId: TierThemeId | null): void {
  if (typeof window === "undefined") return;
  try {
    if (themeId) {
      localStorage.setItem(STORAGE_KEY, themeId);
      applyTierThemeToDom(themeId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

/** Applique l'attribut data-tier directement sur document.documentElement */
export function applyTierThemeToDom(themeId: TierThemeId): void {
  if (typeof document === "undefined") return;
  const current = document.documentElement.getAttribute("data-tier");
  if (current !== themeId) {
    document.documentElement.setAttribute("data-tier", themeId);
  }
}

/** Hook / Fonction d'initialisation et synchronisation du thème d'abonnement */
export function syncActiveTierTheme(context: {
  user: SessionUser | null;
  planId?: string | null;
  monthsPaid?: number;
  currentMonth?: number;
}): TierThemeId {
  const saved = getSavedTierTheme();
  if (saved && isTierUnlocked(saved, context)) {
    applyTierThemeToDom(saved);
    return saved;
  }

  const def = resolveDefaultTierTheme(context);
  applyTierThemeToDom(def);
  return def;
}
