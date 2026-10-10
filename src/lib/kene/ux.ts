import { useEffect, useState } from "react";

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

/** État instantané de connectivité réseau — résilience façon Wave */
export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * Hook de détection réseau anti-faux-positifs (debounce 3.5s sur offline, reprise immédiate sur online).
 * Évite les clignotements intempestifs et fausses alertes lors des basculements d'antennes mobiles (4G/3G/WiFi).
 */
export function useNetworkOnline(): boolean {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    setOnline(isOnline());
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      setOnline(true);
    };

    const handleOffline = () => {
      if (timer) clearTimeout(timer);
      // Debounce de 3.5 secondes pour absorber les micro-coupures de cellule mobile
      timer = setTimeout(async () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          // Double vérification active par un HEAD ultra-léger
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const ping = await fetch("/favicon.ico", {
              method: "HEAD",
              cache: "no-store",
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (ping.ok || ping.status === 304 || ping.status === 200) {
              setOnline(true);
              return;
            }
          } catch {
            // Ping échoué confirmé
          }
          setOnline(false);
        }
      }, 3500);
    };

    const handleNetworkAlive = () => handleOnline();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("kene:network:alive", handleNetworkAlive);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("kene:network:alive", handleNetworkAlive);
    };
  }, []);

  return online;
}

