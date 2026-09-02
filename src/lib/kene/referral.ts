// Kènè — « Le Fil du Parrainage » : lib PURE partagée serveur + client (zéro dépendance)
// Le fil qui relie les amies : la filleule échange un code, le parrain est récompensé
// à la première commande PAYÉE de sa filleule (boucle de croissance honnête).
import { waLink } from "./followups";

// ─────────────── Constantes métier (source unique) ───────────────
/** Cadeau de bienvenue crédité immédiatement à la filleule qui valide un code */
export const FILLEUL_GIFT = 2_000;
/** Bonus crédité au parrain à la première commande PAYÉE de sa filleule */
export const PARRAIN_REWARD = 2_500;

// ─────────────── Clés de déduplication (WalletTransaction.refId) ───────────────
/** refId du bonus parrain — une seule récompense par filleule */
export function parrainRewardRefId(filleulId: string): string {
  return `parrain:${filleulId}`;
}
/** refId du cadeau filleule */
export function filleulGiftRefId(filleulId: string): string {
  return `gift:${filleulId}`;
}

// ─────────────── Partage WhatsApp ───────────────
/** Message de partage du code parrain (≤ 300 caractères, ton Kènè chaleureux) */
export function referralShareMessage(code: string, firstName: string, giftAmount: number): string {
  const gift = `${giftAmount.toLocaleString("fr-FR")} FCFA`;
  return (
    `Salut ! 🧡 C'est ${firstName} — je t'invite sur Kènè, l'app de soins pensée pour nos peaux. ` +
    `Scanne ton visage, reçois ta routine botanique et ${gift} de bienvenue ` +
    `avec mon code : ${code}`
  );
}

/** Lien WhatsApp pré-rempli pour partager son code (sans numéro = choisir le contact) */
export function referralWaLink(code: string, firstName: string, giftAmount: number): string {
  return waLink("", referralShareMessage(code, firstName, giftAmount));
}

// ─────────────── Types du contrat API ───────────────
export interface ReferralInvitee {
  id: string;
  name: string;
  joinedAt: string; // ISO
  firstOrderAt: string | null; // ISO — première commande PAYÉE
  rewarded: boolean; // parrain a touché son bonus grâce à elle
}

export interface ReferralSummary {
  code: string;
  /** Filleul : son parrain (null si pas encore parrainée) */
  referredBy: { id: string; name: string; rewarded: boolean } | null;
  invitees: ReferralInvitee[];
  stats: { invitees: number; rewarded: number; earnings: number }; // gains = bonus parrains cumulés
}

// ─────────────── Labels UI (partagés) ───────────────
export const REFERRAL_LABELS = {
  gift: (amount: number) => `Cadeau de bienvenue +${amount.toLocaleString("fr-FR")} FCFA`,
  reward: (amount: number) => `Bonus parrain +${amount.toLocaleString("fr-FR")} FCFA`,
} as const;
