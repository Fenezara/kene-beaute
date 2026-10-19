// Kènè — Configuration Globale de Plateforme & Coordonnées Officielles
// Centralise les coordonnées d'assistance, numéros d'urgence et accès administrateur
// pilotables via variables d'environnement (.env).

export const KENE_ADMIN_PHONE =
  process.env.KENE_ADMIN_PHONE ||
  process.env.NEXT_PUBLIC_KENE_ADMIN_PHONE ||
  "+2250748894270";

export const KENE_SUPPORT_PHONE =
  process.env.KENE_SUPPORT_PHONE ||
  process.env.NEXT_PUBLIC_KENE_SUPPORT_PHONE ||
  process.env.NEXT_PUBLIC_KENE_ADMIN_PHONE ||
  KENE_ADMIN_PHONE;

export const KENE_SUPPORT_EMAIL =
  process.env.KENE_SUPPORT_EMAIL ||
  process.env.NEXT_PUBLIC_KENE_SUPPORT_EMAIL ||
  "contact@kene.ci";

/**
 * Formatage d'affichage aéré et lisible pour l'UI (ex: "+225 07 48 89 42 70")
 */
export function formatDisplayPhone(phone: string = KENE_SUPPORT_PHONE): string {
  const clean = phone.replace(/[^\d+]/g, "");
  if (clean.startsWith("+225") && clean.length === 14) {
    return `+225 ${clean.slice(4, 6)} ${clean.slice(6, 8)} ${clean.slice(8, 10)} ${clean.slice(10, 12)} ${clean.slice(12, 14)}`;
  }
  if (clean.startsWith("+221") && clean.length === 13) {
    return `+221 ${clean.slice(4, 6)} ${clean.slice(6, 9)} ${clean.slice(9, 11)} ${clean.slice(11, 13)}`;
  }
  return phone;
}
