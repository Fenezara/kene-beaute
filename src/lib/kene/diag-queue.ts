// Kènè — file d'attente offline du diagnostic (, innovation).
// Problème: à Abidjan, le réseau tombe souvent AU moment d'envoyer la photo.
// Avant: échec sec → la cliente retape tout le parcours. Maintenant: la
// photo (déjà cadrée, déjà redimensionnée) part en file localStorage; dès le
// retour du réseau (event « online » — la replay vit dans ClientApp), elle
// part TOUTE SEULE vers /api/diagnoses; le résultat arrive ensuite par
// notification / historique, comme toute analyse.
//
// Garde-fous:
// • cap 2 entrées (~2 × 330 Ko base64 max — loin du quota localStorage);
// au-delà, la PLUS ANCIENNE saute (jamais la fraîche);
// • entrée > 24 h = périmée (jamais de POST fantôme du lendemain);
// • doublon détecté par l'image (même dataUrl) → remplacement, pas de double;
// • en replay: succès OU échec définitif (400/403/404/413) → retire;
// 429/5xx/réseau → garde (rejoué plus tard);
// • abonnés notifiés à la main (l'event « storage » ne fire PAS dans l'onglet
// courant — leçon), + « storage » pour les autres onglets.
import { ApiError, apiPost } from "@/lib/kene/api";

export interface QueuedDiag {
  id: string;
  userId: string;
  zone: string;
  image: string; // dataUrl JPEG ≤ 820 px (resizeImage)
  fitzpatrick?: string;
  allergies?: string;
  createdAt: number;
}

const KEY = "kene-diag-queue";
const MAX_ENTRIES = 2;
const MAX_AGE_MS = 24 * 3600_000;

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
 /* un abonné fragile ne casse pas la file */
    }
  }
}

/** Onglets frères: « storage » fire dans les AUTRES onglets seulement. */
if (typeof window !== "undefined") {
  window.addEventListener?.("storage", (e) => {
    if (e.key === KEY || e.key === null) notify();
  });
}

/** Lecture: parse tolérant + purge des entrées périmées (> 24 h). */
export function readDiagQueue(): QueuedDiag[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const entries = parsed.filter(
      (e): e is QueuedDiag =>
        !!e &&
        typeof (e as QueuedDiag).id === "string" &&
        typeof (e as QueuedDiag).image === "string" &&
        typeof (e as QueuedDiag).userId === "string" &&
        now - (e as QueuedDiag).createdAt < MAX_AGE_MS,
    );
    // Périmées purgées → on réécrit proprement (silencieux si rien ne change).
    if (entries.length !== parsed.length) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(entries));
      } catch {
 /* quota: la purge attendra la prochaine écriture */
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function write(entries: QueuedDiag[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Quota dépassé: on ne garde que la plus récente (jamais un throw au
    // moment où la cliente vient de perdre son réseau).
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-1)));
    } catch {
 /* localStorage plein/bloqué: la file est simplement indisponible */
    }
  }
  notify();
}

export function subscribeDiagQueue(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function diagQueueCount(): number {
  return readDiagQueue().length;
}

export function enqueueDiag(entry: Omit<QueuedDiag, "id" | "createdAt">): { ok: boolean } {
  if (typeof window === "undefined") return { ok: false };
  const entries = readDiagQueue().filter((e) => e.image !== entry.image); // pas de doublon
  entries.push({
    ...entry,
    id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  });
  while (entries.length > MAX_ENTRIES) entries.shift(); // la plus ancienne saute
  write(entries);
  return { ok: true };
}

export function removeDiag(id: string) {
  write(readDiagQueue().filter((e) => e.id !== id));
}

/**
 * Rejoue la file: POST chaque photo vers /api/diagnoses.
 * Succès ou échec définitif (400/403/404/413) → entrée retirée;
 * 429 / 5xx / échec réseau → l'entrée RESTE (rejouée plus tard).
 * Retour: nombre de diagnostics effectivement partis.
 */
export async function replayDiagQueue(): Promise<number> {
  if (typeof window === "undefined" || navigator.onLine === false) return 0;
  const entries = readDiagQueue();
  let sent = 0;
  for (const e of entries) {
    try {
      await apiPost("/api/diagnoses", {
        userId: e.userId,
        zone: e.zone,
        image: e.image,
        fitzpatrick: e.fitzpatrick,
        allergies: e.allergies,
      });
      sent += 1;
      removeDiag(e.id);
    } catch (err) {
      // 400 (corps invalide — ex. image corrompue), 403 (quota du mois),
      // 404, 413 (trop volumineux): ça ne passera JAMAIS → on retire.
      if (err instanceof ApiError && [400, 403, 404, 413].includes(err.status)) {
        removeDiag(e.id);
      }
      // 429 / 502 / 503 / 504 / échec réseau: on garde, prochaine replay.
    }
  }
  return sent;
}
