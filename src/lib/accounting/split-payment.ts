// Kènè Pro — Utilitaire de Gestion des Paiements Mixtes / Multi-moyens (Split Payment)
// Permet de combiner plusieurs modes de règlement (Espèces, Wave, Orange Money, MTN MoMo, Moov, Carte)
// pour une même vente ou prestation en caisse.

export type SplitPaymentMethod = "cash" | "wave" | "orange" | "mtn" | "moov" | "card" | "wallet";

export interface SplitPaymentItem {
  method: SplitPaymentMethod;
  amount: number;
}

export const SPLIT_PAYMENT_LABELS: Record<SplitPaymentMethod, string> = {
  cash: "Espèces",
  wave: "Wave Mobile Money",
  orange: "Orange Money",
  mtn: "MTN MoMo",
  moov: "Moov Money",
  card: "Carte bancaire",
  wallet: "Compte Kènè",
};

export const SPLIT_PAYMENT_SHORT_LABELS: Record<SplitPaymentMethod, string> = {
  cash: "Espèces",
  wave: "Wave",
  orange: "Orange",
  mtn: "MTN",
  moov: "Moov",
  card: "Carte",
  wallet: "Wallet",
};

/**
 * Sérialise les ventilations de paiement dans le format standard Kènè
 * Exemple : "[SPLIT:cash=10000;wave=15000]"
 */
export function serializeSplitPayments(splits: SplitPaymentItem[]): string {
  const clean = splits.filter((s) => s.amount > 0);
  if (clean.length === 0) return "";
  const parts = clean.map((s) => `${s.method}=${Math.round(s.amount)}`);
  return `[SPLIT:${parts.join(";")}]`;
}

/**
 * Extrait les composantes d'un paiement combiné depuis une référence de paiement ou chaîne
 */
export function parseSplitPayments(refOrText?: string | null): SplitPaymentItem[] {
  if (!refOrText) return [];
  const match = refOrText.match(/\[SPLIT:([^\]]+)\]/i);
  if (!match) return [];
  const raw = match[1];
  const items: SplitPaymentItem[] = [];

  for (const part of raw.split(/[;,]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [methodRaw, amountStr] = trimmed.split(/[=:]/);
    if (!methodRaw || !amountStr) continue;
    const method = methodRaw.trim().toLowerCase() as SplitPaymentMethod;
    const amount = parseInt(amountStr.replace(/\D/g, ""), 10) || 0;
    if (amount > 0 && isValidSplitMethod(method)) {
      items.push({ method, amount });
    }
  }

  return items;
}

function isValidSplitMethod(method: string): method is SplitPaymentMethod {
  return ["cash", "wave", "orange", "mtn", "moov", "card", "wallet"].includes(method);
}

/**
 * Valide si la ventilation des paiements correspond exactement au total attendu
 */
export function validateSplitPayments(
  splits: SplitPaymentItem[],
  expectedTotal: number
): {
  valid: boolean;
  sum: number;
  remaining: number;
  error?: string;
} {
  const activeSplits = splits.filter((s) => s.amount > 0);
  if (activeSplits.length === 0) {
    return {
      valid: false,
      sum: 0,
      remaining: expectedTotal,
      error: "Aucun montant de règlement saisi",
    };
  }

  const sum = activeSplits.reduce((acc, s) => acc + Math.round(s.amount), 0);
  const remaining = expectedTotal - sum;

  if (sum < expectedTotal) {
    return {
      valid: false,
      sum,
      remaining,
      error: `Il reste ${remaining.toLocaleString("fr-FR")} FCFA à ventiler`,
    };
  }

  if (sum > expectedTotal) {
    return {
      valid: false,
      sum,
      remaining,
      error: `Dépassement de ${Math.abs(remaining).toLocaleString("fr-FR")} FCFA par rapport au total`,
    };
  }

  return {
    valid: true,
    sum,
    remaining: 0,
  };
}

/**
 * Génère un résumé lisible pour l'affichage écran et les tickets
 * Exemple : "Espèces: 10 000 F • Wave: 15 000 F"
 */
export function formatSplitSummary(splits: SplitPaymentItem[]): string {
  const active = splits.filter((s) => s.amount > 0);
  if (active.length === 0) return "";
  return active
    .map((s) => `${SPLIT_PAYMENT_SHORT_LABELS[s.method] || s.method}: ${Math.round(s.amount).toLocaleString("fr-FR")} F`)
    .join(" • ");
}
