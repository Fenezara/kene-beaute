// src/lib/kene/phone-normalize.ts — Normalisation universelle des numéros de téléphone.
// Assure la cohérence stricte entre l'application cliente et l'espace entreprise Kènè.

/**
 * Normalise un numéro en format international E.164 canonique.
 * En Côte d'Ivoire, les numéros mobiles sont à 10 chiffres (préfixes 01, 05, 07).
 * Exemples:
 *   "0708535741"        -> "+2250708535741"
 *   "07 08 53 57 41"    -> "+2250708535741"
 *   "2250708535741"     -> "+2250708535741"
 *   "+225 0708535741"   -> "+2250708535741"
 *   "002250708535741"   -> "+2250708535741"
 */
export function canonicalPhone(raw?: string | null): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\s+/g, "").trim();
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return cleaned;

  // Déjà préfixé par 00225 -> 225
  const withoutLeadingZeroes = digits.startsWith("00225") ? digits.slice(2) : digits;

  // Format international CI avec 225
  if (withoutLeadingZeroes.startsWith("225") && withoutLeadingZeroes.length >= 11) {
    return `+${withoutLeadingZeroes}`;
  }

  // Format local CI à 10 chiffres (commence généralement par 01, 05, 07 ou 20-27)
  if (withoutLeadingZeroes.length === 10 && withoutLeadingZeroes.startsWith("0")) {
    return `+225${withoutLeadingZeroes}`;
  }

  // Format local CI ancien à 8 chiffres (par défaut réseau Orange/MTN 07)
  if (withoutLeadingZeroes.length === 8) {
    return `+22507${withoutLeadingZeroes}`;
  }

  // Si c'est un numéro international valide déjà commencé par '+'
  if (cleaned.startsWith("+")) {
    return `+${withoutLeadingZeroes}`;
  }

  // Fallback 10 chiffres sans indicatif
  if (withoutLeadingZeroes.length === 10) {
    return `+225${withoutLeadingZeroes}`;
  }

  return `+${withoutLeadingZeroes}`;
}

/**
 * Clé de comparaison robuste basée sur la terminaison (10 chiffres CI ou 8 chiffres min).
 */
export function phoneMatchKey(raw?: string | null): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length >= 8 ? digits.slice(-8) : digits;
}

/**
 * Vérifie si deux chaînes téléphoniques désignent la même personne.
 */
export function arePhonesMatching(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const ka = phoneMatchKey(a);
  const kb = phoneMatchKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 8 && kb.length >= 8 && ka.slice(-8) === kb.slice(-8)) return true;
  return false;
}

/**
 * Formatage aéré pour affichage lisible dans l'UI.
 * Ex: "+2250708535741" -> "+225 07 08 53 57 41"
 */
export function formatPhoneDisplay(raw?: string | null): string {
  if (!raw) return "";
  const canon = canonicalPhone(raw);
  if (canon.startsWith("+225") && canon.length === 14) {
    // +225 XX XX XX XX XX
    const local = canon.slice(4);
    return `+225 ${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
  }
  return raw;
}
