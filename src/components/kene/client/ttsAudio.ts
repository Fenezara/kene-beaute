"use client";
// Kènè — util TTS côté client : fetch /api/tts → blob WAV → objectURL.
// Cache partagé UNIQUE (FIFO 8) pour toute l'app (narration diagnostic,
// définitions du glossaire, future lecture de questions) : ré-écouter
// est instantané et gratuit (aucun nouvel appel réseau).
import { fnv1a } from "@/lib/kene/narration";

const BLOB_CACHE_MAX = 8;
const blobCache = new Map<string, string>();

/** Récupère (ou met en cache) l'URL audio d'un texte. speed 0.5-2 (0.85 = lent). */
export async function fetchTtsAudioUrl(text: string, speed = 1): Promise<string> {
  const key = `${speed === 1 ? "n" : speed}|${fnv1a(text)}`;
  const hit = blobCache.get(key);
  if (hit) return hit;

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed }),
  });
  if (!res.ok) {
    let msg = "Synthèse vocale indisponible";
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* réponse non-JSON */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  if (blob.size < 100) throw new Error("Audio vide");
  const url = URL.createObjectURL(blob);
  blobCache.set(key, url);
  while (blobCache.size > BLOB_CACHE_MAX) {
    const first = blobCache.keys().next().value;
    if (first === undefined) break;
    const u = blobCache.get(first);
    blobCache.delete(first);
    if (u && first !== key) URL.revokeObjectURL(u);
  }
  return url;
}
