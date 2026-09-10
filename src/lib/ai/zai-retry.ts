// Kènè — résilience des appels IA amont (z-ai-web-dev-sdk, backend only).
//
// PROBLÈME MESURÉ (t. 87, stress-test : 4 échecs / 6 requêtes parallèles) :
// le moteur IA partagé renvoie par périodes des 429 « Too many requests »
// (quota machine : chat + VLM + ASR + TTS se partagent la même limite, et
// des agents/audits consomment le même quota). Aucune route ne réessayait →
// l'erreur remontait telle quelle : le chat répondait 500 « Erreur interne
// du serveur » — faux et anxiogène — au lieu d'un simple « réessaie ».
//
// SOLUTION : zaiCall — wrapper unique pour TOUS les appels IA :
//   1. timeout PAR TENTATIVE (withTimeout existant, timer libéré entre deux) ;
//   2. 429 amont → backoff exponentiel + jitter, puis NOUVELLE tentative
//      (2 retries par défaut : la fenêtre de quota se libère en ~1 s) ;
//   3. timeout → AUCUN retry (la cliente attend déjà, on rend la main vite) ;
//   4. 429 persistant après retries → UpstreamBusyError → la route répond
//      502 FR honnête (« très sollicitée, reprends dans quelques secondes »),
//      JAMAIS un 500 « erreur interne » pour un refus temporaire de quota.
//
// Les retries ne concernent QUE le 429 : une vraie erreur applicative
// (validation, format) n'est jamais rejouée — pas de double effet de bord.

import { withTimeout } from "@/lib/kene/with-timeout";

/** Le moteur amont reste saturé après tous les retries → la route oriente
 *  l'utilisatrice en douceur (message + réessai) au lieu d'un 500 faux. */
export class UpstreamBusyError extends Error {
  constructor(label: string, attempts: number) {
    super(`Moteur IA saturé (${label}, ${attempts} tentatives)`);
    this.name = "UpstreamBusyError";
  }
}

/** Détecte un refus de quota amont : le SDK remonte une Error dont le message
 *  embarque status et body (« API request failed with status 429 … Too many
 *  requests ») — pas de code structuré exposé → matching texte, borné. */
export function isUpstreamBusy(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|too many requests/i.test(msg);
}

const jitter = (max: number) => Math.floor(Math.random() * max);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ZaiCallOpts = {
  /** Étiquette de traçabilité (logs, TimeoutError, UpstreamBusyError). */
  label: string;
  /** Timeout par tentative — le timer est libéré entre deux tentatives. */
  timeoutMs: number;
  /** Retries après 429 amont (0 = comportement historique sans retry). */
  busyRetries?: number;
  /** Délai du premier retry (double à chaque retry supplémentaire) + jitter. */
  busyBaseMs?: number;
};

/**
 * Appel IA résilient. `fn` reçoit le numéro de tentative (0-based) — pratique
 * pour resserrer prompt/budget au retry. Après `busyRetries` refus de quota,
 * lève UpstreamBusyError ; sinon, la première erreur non-429 (ou timeout)
 * remonte immédiatement telle quelle.
 */
export async function zaiCall<T>(fn: (attempt: number) => Promise<T>, opts: ZaiCallOpts): Promise<T> {
  const busyRetries = opts.busyRetries ?? 2;
  const busyBaseMs = opts.busyBaseMs ?? 700;
  const totalAttempts = busyRetries + 1;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await withTimeout(fn(attempt), opts.timeoutMs, opts.label);
    } catch (err) {
      if (isUpstreamBusy(err)) {
        if (attempt >= busyRetries) throw new UpstreamBusyError(opts.label, totalAttempts);
        // Backoff : 700 ms → 1,4 s → … + jitter ≤ 250 ms (évite le
        // synchronisme des requêtes parallèles qui repartiraient ensemble).
        await sleep(busyBaseMs * 2 ** attempt + jitter(250));
        continue;
      }
      throw err;
    }
  }
}
