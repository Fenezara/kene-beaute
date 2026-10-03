/**
 * Gestion et distinction des comptes de Démonstration / Essai vs Comptes Réels.
 *
 * Les comptes créés lors du développement ou des tests initiaux (ex: Mariam Diallo,
 * Éclat d'Abidjan, Institut Baobab, dsfdsdf) sont des comptes de démonstration.
 *
 * TOUS les comptes créés par les utilisateurs réels eux-mêmes (clients ou gérantes d'instituts)
 * sont des VÉRITABLES comptes utilisateurs et professionnels.
 */

export const DEMO_PHONES = new Set([
  "+2250701020304", // Mariam Diallo — Compte Exploration Démo cliente (seed initial)
  "+2250709080706", // Fatou Koné / Éclat d'Abidjan — Démo Pro CI (seed initial)
  "+221770000101",  // Ndeye Sow / Institut Baobab — Démo Pro SN (seed initial)
  "+2250706070709", // Bintou Cissé — Compte seed démo
  "+2250705060708", // Awa Traoré — Compte seed démo
  "+2250700000000", // Console Kènè — Compte seed système
  "+2250703324674", // Test initial — dsfdsdf
]);

/**
 * Détermine si un numéro de téléphone appartient à un compte de démonstration / essai initial.
 */
export function isDemoAccount(phone?: string | null): boolean {
  if (!phone) return false;
  return DEMO_PHONES.has(phone.trim());
}
