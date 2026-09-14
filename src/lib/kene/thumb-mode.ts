// Kènè — Pouce d'Or: préférence « mode une main ».
// Les actions primaires de chaque écran descendent dans la zone du pouce
// (barre collante au-dessus de la nav mobile). Préférence LOCALE par appareil
// (localStorage « kene-thumb ») — pas dans le store persisté utilisateur:
// c'est une ergonomie de l'appareil, pas un choix de compte.
// Défaut intelligent: activé sur pointeur grossier (téléphone), éteinte
// ailleurs. Leçon: l'event « storage » ne fire PAS dans l'onglet
// courant → les abonnés sont notifiés à la main.

const KEY = "kene-thumb";

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
 /* un abonné fragile ne bloque pas la préférence */
    }
  }
}

/** Défaut: pointeur grossier (téléphone) → activé; souris → éteint. */
export function thumbModeDefault(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
  } catch {
    return false;
  }
}

/** Snapshot synchrone (useSyncExternalStore). */
export function getThumbMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
 /* localStorage bloqué → défaut */
  }
  return thumbModeDefault();
}

export function setThumbMode(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
 /* bloqué: la barre suivra simplement le défaut */
  }
  notify();
}

export function subscribeThumbMode(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
