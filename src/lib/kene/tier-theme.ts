// Kènè — Système d'Ambiance & Palettes de Haute Joaillerie & Botanique Royale Africaine.
// L'expérience de luxe dermo-cosmétique inspirée des trésors minéraux et botaniques des grands royaumes d'Afrique :
// • Découverte (Gratuit) : « Ocre Sacré & Nacre de Karité » (Royaume Tiébélé & Korhogo)
// • Kènè+ Initiée (M1-M3) : « Bissap Pourpre & Rubis du Nil » (Calices impériaux & Éclat solaire)
// • Kènè+ Cercle Royal (M4-M6+) : « Or Pur 24K Akan & Sceau Baoulé » (Le trésor royal Ashanti)
// • Pro Starter : « Bronze du Bénin & Cuivre Solaire » (Atelier des Maîtres Fondeurs d'Ifè)
// • Pro Institut : « Malachite du Katanga & Émeraude Royale » (Botanique clinique & Sandawana)
// • Pro Complexe : « Nuit d'Indigo Mandingue & Platine Céleste » (Cour impériale de Soundiata Keïta)

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
  tagline: string;
  subtitle: string;
  badge: string;
  gemstone: string;
  kingdom: string;
  symbol: "karite" | "bissap" | "baoule" | "bronze" | "moringa" | "indigo";
  audience: "client" | "pro" | "all";
  primaryColor: string;
  accentColor: string;
  glowColor: string;
  heroGradient: string;
  metallicBorder: string;
  description: string;
  rarityTag: string;
}

export const TIER_THEMES: readonly TierThemeDef[] = [
  {
    id: "karite_tiebele",
    name: "Ocre Sacré & Nacre Karité",
    tagline: "L'argile royale de Tiébélé et la nacre de Korhogo",
    subtitle: "Terre cuite satinée, crème de karité fouetté & ambre sablé",
    badge: "Initiation & Découverte",
    gemstone: "Argile Noble & Nacre",
    kingdom: "Royaume Kasséna · Tiébélé",
    symbol: "karite",
    audience: "all",
    primaryColor: "#B8532B",
    accentColor: "#FBF3ED",
    glowColor: "rgba(184, 83, 43, 0.32)",
    heroGradient: "linear-gradient(135deg, #B8532B 0%, #D46E45 50%, #F5CEB5 100%)",
    metallicBorder: "rgba(212, 110, 69, 0.4)",
    description: "Inspirée des fresques royales géométriques de Tiébélé et de la crème de karité ancestral battue à la main sous le soleil de Korhogo.",
    rarityTag: "Origine",
  },
  {
    id: "bissap_royal",
    name: "Bissap Pourpre & Rubis du Nil",
    tagline: "L'élixir des reines et l'éclat rubis de la vallée du Rift",
    subtitle: "Rouge rubis velours, nectar d'hibiscus impérial & liserés d'or",
    badge: "Kènè+ Initiée",
    gemstone: "Rubis Impérial & Fleur de Bissap",
    kingdom: "Empire de Koush · Nubie",
    symbol: "bissap",
    audience: "client",
    primaryColor: "#991438",
    accentColor: "#FDE8EE",
    glowColor: "rgba(184, 24, 69, 0.38)",
    heroGradient: "linear-gradient(135deg, #7A0A28 0%, #B81845 45%, #E03565 75%, #D49A24 100%)",
    metallicBorder: "rgba(224, 53, 101, 0.45)",
    description: "Une infusion opulente de calices de Bissap pourpre velouté et de rubis lumineux, signature suprême de la beauté mélanoderme rayonnante.",
    rarityTag: "Kènè+ Éclat",
  },
  {
    id: "or_imperial",
    name: "Or Pur 24K Akan & Sceau Baoulé",
    tagline: "Le trésor royal Ashanti et la majesté de l'or ciselé",
    subtitle: "Lingot d'or Akan 24 carats, ambre impérial & onyx ébène",
    badge: "Le Cercle Royal 👑",
    gemstone: "Or 24K Solaire & Ambre de Zanzibar",
    kingdom: "Royaume Ashanti & Baoulé",
    symbol: "baoule",
    audience: "client",
    primaryColor: "#C58A18",
    accentColor: "#FFF8E7",
    glowColor: "rgba(216, 154, 30, 0.45)",
    heroGradient: "linear-gradient(135deg, #F9D87E 0%, #D49A24 35%, #9E6B08 70%, #F5CE7A 100%)",
    metallicBorder: "rgba(245, 206, 122, 0.65)",
    description: "Le sacrement de la reine. Inspiré des parures sacrées et des masques d'or pur des souverains Akan. Chaque écran s'illumine d'un halo solaire d'or précieux.",
    rarityTag: "Souveraineté",
  },
  {
    id: "argile_cuivre",
    name: "Bronze du Bénin & Cuivre Solaire",
    tagline: "Le feu des maîtres fondeurs et le cuivre incandescent",
    subtitle: "Cuivre rouge brossé, patine de bronze d'Ifè & miel d'acacia",
    badge: "Pro Starter · Atelier d'Art",
    gemstone: "Bronze Antique & Cuivre Rouge",
    kingdom: "Royaume du Bénin · Ifè",
    symbol: "bronze",
    audience: "pro",
    primaryColor: "#C65322",
    accentColor: "#FCEFE8",
    glowColor: "rgba(198, 83, 34, 0.35)",
    heroGradient: "linear-gradient(135deg, #9C3D12 0%, #C85A24 50%, #EDA33E 100%)",
    metallicBorder: "rgba(200, 90, 36, 0.45)",
    description: "L'énergie magistrale des bronziers d'Ifè et du Royaume du Bénin. Un écrin de caractère pour la praticienne solo et le dermo-conseil d'élite.",
    rarityTag: "Atelier Solo",
  },
  {
    id: "emeraude_kinkeliba",
    name: "Malachite du Katanga & Émeraude",
    tagline: "La gemme de guérison sacrée et la pharmacopée d'apparat",
    subtitle: "Vert malachite joaillerie, feuillage de moringa & or Akan",
    badge: "Pro Institut ✨ · Excellence",
    gemstone: "Malachite du Congo & Émeraude de Sandawana",
    kingdom: "Empire Luba · Katanga",
    symbol: "moringa",
    audience: "pro",
    primaryColor: "#186638",
    accentColor: "#EBF8F0",
    glowColor: "rgba(24, 102, 56, 0.40)",
    heroGradient: "linear-gradient(135deg, #0A3B1D 0%, #156B36 45%, #2AA85B 80%, #E5A93C 100%)",
    metallicBorder: "rgba(42, 168, 91, 0.5)",
    description: "L'alliance majestueuse de la malachite verte et des feuilles fraîches de moringa et kinkeliba. Calibré pour les salons établis respirant l'autorité dermo-clinique.",
    rarityTag: "Prestige Institut",
  },
  {
    id: "indigo_mandingue",
    name: "Nuit d'Indigo Mandingue & Platine",
    tagline: "La parure d'apparat des empereurs sous la voûte céleste",
    subtitle: "Bleu nuit impérial, lapis-lazuli céleste & platine royal",
    badge: "Pro Complexe 🏛️ · Haute Direction",
    gemstone: "Lapis-Lazuli & Platine Céleste",
    kingdom: "Empire du Mali · Soundiata Keïta",
    symbol: "indigo",
    audience: "pro",
    primaryColor: "#142B58",
    accentColor: "#EEF3FC",
    glowColor: "rgba(20, 43, 88, 0.42)",
    heroGradient: "linear-gradient(135deg, #0A1938 0%, #15326A 45%, #2A54A4 80%, #F5D37E 100%)",
    metallicBorder: "rgba(42, 84, 164, 0.55)",
    description: "Le prestige suprême des grands spas et cliniques dermo d'envergure internationale. Tissé de reflets d'indigo royal mandingue et d'étoiles de platine étincelant.",
    rarityTag: "Haute Institution",
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

  // 1. Ocre Sacré & Nacre de Karité débloqué pour tous
  if (themeId === "karite_tiebele") return true;

  // 2. Administrateur : accès à toutes les créations sans restriction
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
    return (
      (planId === "kene_plus" && effectiveMonth >= 4) ||
      user?.role === "pro" // Les collaboratrices ont le pass prestige Kènè+
    );
  }

  if (themeId === "bissap_royal") {
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

  if (user?.role === "pro") {
    if (planId === "pro_complexe") return "indigo_mandingue";
    if (planId === "pro_institut") return "emeraude_kinkeliba";
    if (planId === "pro_starter") return "argile_cuivre";
    return "emeraude_kinkeliba";
  }

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
