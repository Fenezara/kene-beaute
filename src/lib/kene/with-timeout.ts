// Kènè — garde-fou temporel pour les appels IA (z-ai-web-dev-sdk, backend only).
// Un SDK qui hang ne doit JAMAIS hangé la requête cliente indéfiniment :
// withTimeout encapsule la promesse dans un Promise.race ; au bout de `ms`,
// elle rejette une TimeoutError labelisée → l'appelant branche son CHEMIN DE
// FALLBACK EXISTANT (fallbackResult « Mode secours », triage jaune, 502 FR…).
// Aucun crash, aucun état pending éternel.
// Note : la promesse d'origine continue en arrière-plan (le SDK n'expose pas
// d'AbortSignal) — son éventuel résultat est simplement ignoré.

/** Erreur typée : permet aux catch de distinguer timeout vs erreur SDK. */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Délai dépassé (${label}, ${Math.round(ms / 1000)} s)`);
    this.name = "TimeoutError";
  }
}

/** Race : résout `p`, ou rejette TimeoutError après `ms` millisecondes. */
export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    // Le timer ne doit pas survivre au vainqueur de la course (sinon il
    // maintient un handle actif pour rien jusqu'à son expiration).
    if (timer) clearTimeout(timer);
  }
}
