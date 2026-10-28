// Kènè — Système d'Ambiance & Parures Royales Spas & Instituts 2026.
// Collections universelles d'exception plébiscitées par les plus grands spas,
// medispas et sanctuaires de beauté dans le monde entier (Paris, Tokyo, Marrakech, Abidjan, Dubai, Bali) :
// • Travertin Minéral & Sable Chaud (Minimalisme Minéral & Sérénité Spa)
// • Sauge Botanique & Eucalyptus Spa (Hydrothérapie Biophilique & Végétale)
// • Terracotta d'Atlas & Argile Solaire (Rituels Hammam & Chaleur Désertique)
// • Quartz Rose & Fleur de Soie (Facialiste Dermo-Esthétique & Glow Poudré)
// • Or Solaire 24K & Nacre Impériale (Haute Joaillerie & Spas Palaces 7★)
// • Nuit d'Indigo & Lapis Céleste (Night Spa, Luminothérapie & Bains Nocturnes)

import type { SessionUser } from "@/store/kene";
import { useKene } from "@/store/kene";
import { apiPatch } from "@/lib/kene/api";

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
    name: "Travertin Minéral & Sable Chaud",
    tagline: "Le minimalisme minéral et la sérénité des spas contemporains",
    subtitle: "Travertin calcaire adouci, crème de karité fouetté, ambre sablé & lin écru",
    badge: "Sérénité Minérale Spa",
    gemstone: "Travertin & Karité Blanc",
    kingdom: "Sanctuaires Minéraux & Korhogo",
    symbol: "karite",
    audience: "all",
    primaryColor: "#BA5B30",
    accentColor: "#FAF2EB",
    glowColor: "rgba(186, 91, 48, 0.35)",
    heroGradient: "linear-gradient(135deg, #B5582D 0%, #D87B4C 45%, #F4CFB7 100%)",
    metallicBorder: "rgba(216, 123, 76, 0.45)",
    description: "Inspirée des spas d'hôtels et sanctuaires de sérénité les plus prisés au monde en 2026 (Aman, Six Senses, Cheval Blanc) : pureté du travertin, crème de karité fouettée et lumière solaire douce.",
    rarityTag: "Tendance Spa 2026",
  },
  {
    id: "emeraude_kinkeliba",
    name: "Sauge Botanique & Eucalyptus Spa",
    tagline: "L'écrin biophilique d'hydrothérapie et de dermo-clinique végétale",
    subtitle: "Vert sauge poudré, vapeurs d'eucalyptus frais, kinkeliba sauvage & or mat",
    badge: "Hydrothérapie & Botanique",
    gemstone: "Émeraude Brute & Feuilles d'Eucalyptus",
    kingdom: "Sanctuaires Botaniques & Forêts Sacrées",
    symbol: "moringa",
    audience: "all",
    primaryColor: "#1A6B44",
    accentColor: "#EBF8F0",
    glowColor: "rgba(26, 107, 68, 0.40)",
    heroGradient: "linear-gradient(135deg, #0B3D23 0%, #1A6B44 45%, #2FA867 80%, #E2AB3E 100%)",
    metallicBorder: "rgba(47, 168, 103, 0.50)",
    description: "L'ambiance star des spas holistiques mondiaux en 2026 : respiration vivifiante d'eucalyptus, vert sauge apaisant et phytothérapie d'élite pour la régénération cellulaire.",
    rarityTag: "Tendance Spa 2026",
  },
  {
    id: "argile_cuivre",
    name: "Terracotta d'Atlas & Argile Solaire",
    tagline: "La chaleur tellurique des rituels hammam et spas du désert",
    subtitle: "Terre cuite satinée, cuivre rouge incandescent, miel d'acacia & ocre chaud",
    badge: "Rituels Hammam & Chaleur",
    gemstone: "Cuivre Rouge Brossé & Argile Ocre",
    kingdom: "Rituels Sahéliens & Cités d'Ifè",
    symbol: "bronze",
    audience: "all",
    primaryColor: "#C45222",
    accentColor: "#FDF1EB",
    glowColor: "rgba(196, 82, 34, 0.38)",
    heroGradient: "linear-gradient(135deg, #963810 0%, #C45222 50%, #EC9735 100%)",
    metallicBorder: "rgba(200, 90, 36, 0.45)",
    description: "Inspirée des grands hammams de palace (Marrakech, Dubai, Palm Springs) : un écrin sensoriel vibrant qui magnifie la carnation et insuffle une énergie bienfaisante.",
    rarityTag: "Tendance Spa 2026",
  },
  {
    id: "bissap_royal",
    name: "Quartz Rose & Fleur de Soie",
    tagline: "L'esthétique glamour et poudrée des facial bars & studios dermo-esthétiques",
    subtitle: "Velours de bissap rubis, quartz rose translucide, pétales de pivoine & or rosé",
    badge: "Facialiste & Éclat Glamour",
    gemstone: "Quartz Rose Givré & Rubis du Nil",
    kingdom: "Haute Dermo-Esthétique & Nil Solaire",
    symbol: "bissap",
    audience: "all",
    primaryColor: "#9E163B",
    accentColor: "#FDEAF0",
    glowColor: "rgba(158, 22, 59, 0.40)",
    heroGradient: "linear-gradient(135deg, #7A0A28 0%, #B81845 45%, #E33E6E 75%, #E5A93C 100%)",
    metallicBorder: "rgba(227, 62, 110, 0.48)",
    description: "Plébiscitée par les facialistes d'élite de Paris, Tokyo et New York : une atmosphère poudrée subtile, associant l'énergie bienfaisante du quartz rose au rubis impérial.",
    rarityTag: "Tendance Spa 2026",
  },
  {
    id: "or_imperial",
    name: "Or Solaire 24K & Nacre Impériale",
    tagline: "Le grand luxe palace et haute joaillerie des spas 7 étoiles",
    subtitle: "Or pur Akan 24 carats poli miroir, nacre nacrée lustrée & ambre doré",
    badge: "Haute Joaillerie & Palace 7★",
    gemstone: "Lingot d'Or 24K & Nacre Solaire",
    kingdom: "Trésor Royal Akan & Cités d'Or",
    symbol: "baoule",
    audience: "all",
    primaryColor: "#BD7E10",
    accentColor: "#FFF9EC",
    glowColor: "rgba(214, 153, 28, 0.45)",
    heroGradient: "linear-gradient(135deg, #FAD67B 0%, #D49A24 35%, #9B6606 70%, #F5CE7A 100%)",
    metallicBorder: "rgba(245, 206, 122, 0.70)",
    description: "L'opulence royale sans compromis : le faste des suites impériales et des cérémonies de beauté Akan baignées d'or pur, apportant un éclat prestigieux à l'institut.",
    rarityTag: "Tendance Spa 2026",
  },
  {
    id: "indigo_mandingue",
    name: "Nuit d'Indigo & Lapis Céleste",
    tagline: "L'ambiance signature Night Spa, luminothérapie et soins profonds",
    subtitle: "Bleu nuit impérial mandingue, poudre de lapis-lazuli & platine d'apparat",
    badge: "Night Spa & Haute Institution",
    gemstone: "Lapis-Lazuli Céleste & Platine Pur",
    kingdom: "Empire Mandingue & Nuées Célestes",
    symbol: "indigo",
    audience: "all",
    primaryColor: "#153063",
    accentColor: "#EFF4FC",
    glowColor: "rgba(21, 48, 99, 0.42)",
    heroGradient: "linear-gradient(135deg, #0A1938 0%, #15326A 45%, #2A54A4 80%, #F5D37E 100%)",
    metallicBorder: "rgba(42, 84, 164, 0.55)",
    description: "L'élégance suprême des cliniques dermo et spas nocturnes : une immersion feutrée d'indigo impérial et de reflets platine invitant à un lâcher-prise total.",
    rarityTag: "Tendance Spa 2026",
  },
];

const STORAGE_KEY = "kene_user_tier_theme";
const TENANT_STORAGE_PREFIX = "kene_tenant_tier_theme_";

/** Récupère la parure officielle configurée pour un institut */
export function getTenantTierTheme(tenantId?: string | null): TierThemeId | null {
  if (!tenantId) return null;
  if (typeof window !== "undefined") {
    try {
      const val = localStorage.getItem(`${TENANT_STORAGE_PREFIX}${tenantId}`);
      if (val && TIER_THEMES.some((t) => t.id === val)) {
        return val as TierThemeId;
      }
    } catch {}
  }
  // Fallback direct sur l'utilisateur connecté dans le store global
  try {
    const user = useKene.getState().user;
    if (user?.tenantThemeTier && TIER_THEMES.some((t) => t.id === user.tenantThemeTier)) {
      return user.tenantThemeTier as TierThemeId;
    }
  } catch {}
  return null;
}

/** Sauvegarde la parure officielle de l'institut (choisie par la gérante) */
export function saveTenantTierTheme(tenantId: string, themeId: TierThemeId | null): void {
  if (!tenantId) return;
  if (typeof window !== "undefined") {
    try {
      if (themeId) {
        localStorage.setItem(`${TENANT_STORAGE_PREFIX}${tenantId}`, themeId);
        applyTierThemeToDom(themeId);
      } else {
        localStorage.removeItem(`${TENANT_STORAGE_PREFIX}${tenantId}`);
      }
      window.dispatchEvent(
        new CustomEvent("kene:tenant-tier-theme-changed", { detail: { tenantId, themeId } })
      );
    } catch {}
  }

  // Synchronisation dans le store Zustand
  try {
    const curr = useKene.getState().user;
    if (curr) {
      useKene.getState().setUser({ ...curr, tenantThemeTier: themeId });
    }
  } catch {}

  // Persistance en base de données pour tout l'établissement (accessible par tous les employés)
  apiPatch("/api/pro/tenants", { tenantId, themeTier: themeId }).catch(() => null);
}

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

  // 1. Les instituts, spas et professionnels ont accès libre à l'ensemble des 6 collections mondiales 2026
  // afin d'harmoniser parfaitement l'ambiance des écrans avec le décor et l'atmosphère physique de leur établissement.
  if (user?.role === "pro" || user?.role === "admin") return true;

  // 2. Travertin Minéral & Sable Chaud débloqué pour toutes les clientes (Origine & Sérénité)
  if (themeId === "karite_tiebele") return true;

  // 3. Palettes Clientes Kènè+ (Privilège Ascendant selon fidélité)
  const effectiveMonth = Math.max(monthsPaid, currentMonth);
  if (themeId === "or_imperial") {
    return planId === "kene_plus" && effectiveMonth >= 4;
  }
  if (themeId === "indigo_mandingue") {
    return planId === "kene_plus" && effectiveMonth >= 6;
  }
  if (themeId === "bissap_royal" || themeId === "emeraude_kinkeliba" || themeId === "argile_cuivre") {
    return planId === "kene_plus";
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
  tenantId?: string | null;
}): TierThemeId {
  const { user, tenantId } = context;

  // Si c'est un employé d'institut en session Pro, la parure officielle du salon prévaut obligatoirement
  if (user?.role === "pro" && user?.employeeRole && tenantId) {
    const tenantTheme = getTenantTierTheme(tenantId) ?? (user?.tenantThemeTier as TierThemeId | null);
    if (tenantTheme) {
      applyTierThemeToDom(tenantTheme);
      return tenantTheme;
    }
    const def = resolveDefaultTierTheme(context);
    applyTierThemeToDom(def);
    return def;
  }

  // Pour un propriétaire de salon avec tenantId
  if (user?.role === "pro" && tenantId) {
    const tenantTheme = getTenantTierTheme(tenantId) ?? (user?.tenantThemeTier as TierThemeId | null);
    if (tenantTheme && isTierUnlocked(tenantTheme, context)) {
      applyTierThemeToDom(tenantTheme);
      return tenantTheme;
    }
  }

  const saved = getSavedTierTheme();
  if (saved && isTierUnlocked(saved, context)) {
    applyTierThemeToDom(saved);
    return saved;
  }

  const def = resolveDefaultTierTheme(context);
  applyTierThemeToDom(def);
  return def;
}
