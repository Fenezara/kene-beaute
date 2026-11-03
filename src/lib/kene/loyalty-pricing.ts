// Kènè — Moteur de tarification fidélité élastique & régression bienveillante
//
// Règles métier :
// 1. Progression fidélité (abonnements consécutifs payés à temps) :
//    - Starter : 10 000 FCFA -> descend de 1 000 FCFA/mois jusqu'à 5 000 FCFA (plancher)
//    - Institut : 20 000 FCFA -> descend de 2 000 FCFA/mois jusqu'à 10 000 FCFA (plancher)
//    - Complexe : 30 000 FCFA -> descend de 2 000 FCFA/mois jusqu'à 20 000 FCFA (plancher)
//    - Kènè+ (Cliente) : 2 500 FCFA (tarif fixe solidaire avec 1er mois 100% offert)
//
// 2. Régression en cas de mois sauté / retard de paiement :
//    - Chaque période de 30 jours non payée après la fin de la période de grâce (+5 jours)
//      fait remonter (régresser) le tarif d'un palier (+1 000 F pour Starter, +2 000 F pour Institut/Complexe)
//      vers le prix initial de départ.
//    - Exemple Starter : Si le salon a atteint 6 000 F (Mois 5) et saute 1 mois d'échéance :
//      au lieu de repartir brutalement à 10 000 F, il remonte à 7 000 F.
//      S'il saute un 2e mois sans payer : il remonte à 8 000 F, puis 9 000 F, puis 10 000 F.
//    - Si le salon continue de ne pas payer après avoir atteint le prix initial de son abonnement
//      (plus de 5 cycles impayés ou délai dépassé) : il bascule automatiquement en mode Gratuit / Freemium
//      ("pro_non_abonne" / plan "trial" ou "gratuit").
//    - Vos données, vos clientes et l'historique de caisse ne sont JAMAIS supprimés.

export interface LoyaltyRegressionState {
  planId: string;
  isTrial: boolean;
  trialDaysLeft: number;
  basePrice: number;
  floorPrice: number;
  stepPrice: number;
  consecutivePaidMonths: number;
  missedMonths: number;
  effectivePrice: number;
  nextRenewalPrice: number;
  effectiveTierMonth: number;
  isGracePeriod: boolean;
  graceDaysLeft: number;
  isRegressing: boolean;
  isFallenToFree: boolean;
  statusLabel: string;
}

export const PLAN_STEP_CONFIG: Record<string, { basePrice: number; floorPrice: number; stepPrice: number }> = {
  pro_starter: { basePrice: 10000, floorPrice: 5000, stepPrice: 1000 },
  pro_institut: { basePrice: 20000, floorPrice: 10000, stepPrice: 2000 },
  pro_essentiel: { basePrice: 20000, floorPrice: 10000, stepPrice: 2000 },
  pro_complexe: { basePrice: 30000, floorPrice: 20000, stepPrice: 2000 },
  kene_plus: { basePrice: 2500, floorPrice: 2500, stepPrice: 0 },
};

/**
 * Calcule le tarif élastique en tenant compte des mois consécutifs gagnés
 * et des mois de retard / sautés (régression progressive).
 */
export function calculateElasticLoyaltyPrice(params: {
  planId: string;
  consecutivePaidMonths: number;
  missedMonths: number;
}): { effectivePrice: number; effectiveTierMonth: number; isFallenToFree: boolean } {
  const { planId, consecutivePaidMonths, missedMonths } = params;
  const cfg = PLAN_STEP_CONFIG[planId] || { basePrice: 10000, floorPrice: 5000, stepPrice: 1000 };

  if (cfg.stepPrice === 0) {
    return {
      effectivePrice: cfg.basePrice,
      effectiveTierMonth: 1,
      isFallenToFree: missedMonths >= 2,
    };
  }

  // 1. Calcul du palier atteint grâce à la fidélité :
  // Mois 1 = 0 mois payé -> basePrice
  // Mois 2 = 1 mois payé -> basePrice - 1 * stepPrice
  // Mois 6+ = 5 mois payés -> floorPrice
  const maxDiscounts = Math.round((cfg.basePrice - cfg.floorPrice) / cfg.stepPrice); // ex: 5 pour Starter (10k -> 5k)
  const earnedDiscounts = Math.min(Math.max(0, consecutivePaidMonths), maxDiscounts);
  
  // 2. Application de la régression progressive selon les mois sautés :
  // Chaque mois manqué fait perdre 1 palier de réduction (+stepPrice vers basePrice)
  const netDiscounts = Math.max(0, earnedDiscounts - missedMonths);

  const effectivePrice = cfg.basePrice - netDiscounts * cfg.stepPrice;
  // Mois correspondant (1 à 6)
  const effectiveTierMonth = Math.min(6, Math.max(1, netDiscounts + 1));

  // 3. Si les impayés dépassent tous les paliers et que le salon reste impayé
  // au-delà du retour au prix initial (par exemple missedMonths >= maxDiscounts + 1)
  // alors il tombe en mode gratuit.
  const isFallenToFree = missedMonths > 0 && netDiscounts === 0 && missedMonths >= 2;

  return {
    effectivePrice,
    effectiveTierMonth,
    isFallenToFree,
  };
}
