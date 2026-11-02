// Kènè — « Le Fil du Parrainage »: lib PURE partagée serveur + client (zéro dépendance)
// Zéro argent liquide, zéro produit physique. 100% logiciel & santé de la peau:
// - Filleule: 30 jours de Kènè+ offerts dès l'activation de son compte
// - Marraine: Paliers de mois d'abonnements Kènè+ offerts (Initié à 5 amies = 1 mois, etc.)
import { waLink } from "./followups";

// ─────────────── Paliers de Parrainage Kènè 2026 ───────────────
export interface ReferralTier {
  id: "debutante" | "initie" | "ambassadrice" | "cercle_dor" | "icone";
  name: string;
  minInvitees: number;
  monthsGranted: number;
  perks: string;
}

export const REFERRAL_TIERS: ReferralTier[] = [
  {
    id: "initie",
    name: "Initié",
    minInvitees: 10,
    monthsGranted: 1,
    perks: "1 mois Kènè+ offert (30 jours)",
  },
  {
    id: "ambassadrice",
    name: "Ambassadrice",
    minInvitees: 25,
    monthsGranted: 3,
    perks: "3 mois Kènè+ offerts + Module Évolution Cutanée HD (Time-Lapse)",
  },
  {
    id: "cercle_dor",
    name: "Cercle d'Or",
    minInvitees: 50,
    monthsGranted: 6,
    perks: "6 mois Kènè+ offerts + Accès Bêta IA Prioritaire",
  },
  {
    id: "icone",
    name: "Icône Beauté",
    minInvitees: 100,
    monthsGranted: 12,
    perks: "1 an complet Kènè+ offert (12 mois) + Badge Privilège à vie",
  },
];

/** Calcule le nombre total de mois Kènè+ mérités selon le nombre d'amies actives */
export function calculateGrantedMonths(activeInvitees: number): number {
  if (activeInvitees < 10) return 0;
  if (activeInvitees < 25) return 1;
  if (activeInvitees < 50) return 3;
  if (activeInvitees < 100) return 6;
  // 100 amies = 12 mois (1 an complet). Au-delà, +1 mois tous les 10 amies
  return 12 + Math.floor((activeInvitees - 100) / 10);
}

/** Identifie le palier actuel et le prochain palier à atteindre */
export function getReferralProgress(activeInvitees: number) {
  const currentMonths = calculateGrantedMonths(activeInvitees);
  
  if (activeInvitees < 10) {
    return {
      tierName: "En route vers Initié",
      currentTier: null,
      nextTier: REFERRAL_TIERS[0],
      neededForNext: 10 - activeInvitees,
      progressPct: Math.round((activeInvitees / 10) * 100),
      currentMonths: 0,
    };
  }
  if (activeInvitees < 25) {
    return {
      tierName: "Initié",
      currentTier: REFERRAL_TIERS[0],
      nextTier: REFERRAL_TIERS[1],
      neededForNext: 25 - activeInvitees,
      progressPct: Math.round(((activeInvitees - 10) / (25 - 10)) * 100),
      currentMonths,
    };
  }
  if (activeInvitees < 50) {
    return {
      tierName: "Ambassadrice",
      currentTier: REFERRAL_TIERS[1],
      nextTier: REFERRAL_TIERS[2],
      neededForNext: 50 - activeInvitees,
      progressPct: Math.round(((activeInvitees - 25) / (50 - 25)) * 100),
      currentMonths,
    };
  }
  if (activeInvitees < 100) {
    return {
      tierName: "Cercle d'Or",
      currentTier: REFERRAL_TIERS[2],
      nextTier: REFERRAL_TIERS[3],
      neededForNext: 100 - activeInvitees,
      progressPct: Math.round(((activeInvitees - 50) / (100 - 50)) * 100),
      currentMonths,
    };
  }
  return {
    tierName: "Icône Beauté",
    currentTier: REFERRAL_TIERS[3],
    nextTier: null,
    neededForNext: 0,
    progressPct: 100,
    currentMonths,
  };
}

/** Cadeau de bienvenue pour la filleule (en jours d'abonnement Kènè+) */
export const FILLEUL_GIFT_DAYS = 30;

/** @deprecated Ancien bonus cash conservé pour compatibilité — Kènè est 100% abonnements */
export const FILLEUL_GIFT = 0;
export const PARRAIN_REWARD = 0;

// ─────────────── Partage WhatsApp ───────────────
/** Message de partage du code parrain orienté santé de la peau et mois offerts */
export function referralShareMessage(code: string, firstName: string): string {
  return (
    `Coucou ! 🌿 C'est ${firstName}. J'analyse ma peau avec l'intelligence artificielle de Kènè. ` +
    `Je t'offre 1 mois d'abonnement Kènè+ gratuit pour faire ton diagnostic facial et découvrir ta routine sur-mesure ! ` +
    `Utilise mon code : ${code}`
  );
}

/** Lien WhatsApp pré-rempli pour inviter une ou plusieurs amies */
export function referralWaLink(code: string, firstName: string): string {
  return waLink("", referralShareMessage(code, firstName));
}

// ─────────────── Types du contrat API ───────────────
export interface ReferralInvitee {
  id: string;
  name: string;
  joinedAt: string; // ISO
  hasScanned: boolean; // A fait son diagnostic de peau
}

export interface ReferralSummary {
  code: string;
  referredBy: { id: string; name: string } | null;
  invitees: ReferralInvitee[];
  stats: {
    totalInvitees: number;
    activeInvitees: number; // ont scanné leur peau
    monthsGranted: number; // mois kènè+ débloqués
    nextTierGoal: number; // prochain seuil (5, 15, 30, 50)
    currentTier: string;
    progressPct: number;
  };
}
