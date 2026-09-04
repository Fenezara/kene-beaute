// Kènè — utilitaires d'expérience tactile et réseau (patterns Wave/Instagram)
// Côté client uniquement. Dégradation gracieuse : iOS Safari ne supporte pas
// l'API Vibration — aucun appel ne plante, simplement pas de retour tactile.

/** Patterns haptiques (ms) — calibrés façon apps natives 2026 */
export const HAPTIC = {
  tap: 8,          // sélection d'onglet, tap story
  light: 15,       // ajout au panier, activation
  medium: 25,      // déclenchement pull-to-refresh
  success: [18, 60, 24] as number[],  // paiement réussi, commande confirmée
  warning: [40] as number[],   // erreur, solde insuffisant
};

/** Retour tactile Android (no-op silencieux ailleurs) */
export function haptic(pattern: number | number[] = HAPTIC.tap): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // SSR ou API indisponible — ignoré
  }
}

/** État de connectivité réseau — résilience façon Wave (réseau instable) */
export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
