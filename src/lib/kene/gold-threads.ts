// Kènè — types et outils partagés des Fils d'Or.
export interface GoldThreadItem {
  kind: "scan" | "order" | "visit" | "review" | "referral";
  label: string;
  count: number;
}

export interface GoldBenefit {
  tier: number;
  rankTitle: string;
  reward: string;
  description: string;
  unlocked: boolean;
}

export const GOLD_TIERS: Array<{
  tier: number;
  rankTitle: string;
  reward: string;
  description: string;
}> = [
  {
    tier: 1,
    rankTitle: "Initié Kènè",
    reward: "+500 FCFA de bienvenue",
    description: "Remise immédiate de bienvenue dès le premier scan ou commande.",
  },
  {
    tier: 5,
    rankTitle: "Tisseuse d'Or",
    reward: "-10% sur votre soin cabine",
    description: "Valable dans tous les instituts partenaires d'Abidjan et Dakar.",
  },
  {
    tier: 10,
    rankTitle: "Ambassadrice Kènè",
    reward: "Livraison urbaine offerte permanente",
    description: "Frais de coursier offerts sur toutes vos commandes cosmétiques.",
  },
  {
    tier: 20,
    rankTitle: "Maîtresse du Métier",
    reward: "Soin Signature Annuel Offert",
    description: "Un rituel dermo-botanique complet offert chaque année en institut.",
  },
];

export function computeBenefits(threads: number): GoldBenefit[] {
  return GOLD_TIERS.map((t) => ({
    ...t,
    unlocked: threads >= t.tier,
  }));
}

export interface GoldThreads {
  threads: number;
  rank: string;
  items: GoldThreadItem[];
  seed: number;
  milestone: { next: number; remaining: number; progress: number };
  benefits?: GoldBenefit[];
  nextReward?: string;
}

/** Graine déterministe du kente identitaire (FNV-1a → PRNG).
 * Même userId = même pagne, pour toujours — partagée par /api/gold-threads
 * (vue privée) et /api/passport (vue publique) pour un motif IDENTIQUE. */
export function seedOf(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}
