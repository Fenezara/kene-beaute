// Kènè — types et outils partagés des Fils d'Or.
export interface GoldThreadItem {
  kind: "scan" | "order" | "visit" | "review" | "referral";
  label: string;
  count: number;
}

export interface GoldThreads {
  threads: number;
  rank: string;
  items: GoldThreadItem[];
  seed: number;
  milestone: { next: number; remaining: number; progress: number };
}

/** Graine déterministe du kente identitaire (FNV-1a → PRNG).
 * Même userId = même pagne, pour toujours — partagée par /api/gold-threads
 * (vue privée) et /api/passport (vue publique) pour un motif IDENTIQUE. */
export function seedOf(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}
