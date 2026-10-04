"use client";
// Kènè — util TTS côté client: fetch /api/tts → blob WAV → objectURL.
// Cache partagé UNIQUE (FIFO 8) pour toute l'app (narration diagnostic,
// définitions du glossaire, future lecture de questions): ré-écouter
// est instantané et gratuit (aucun nouvel appel réseau).
import { fnv1a } from "@/lib/kene/narration";

const BLOB_CACHE_MAX = 8;
const blobCache = new Map<string, string>();

/** Récupère (ou met en cache) l'URL audio d'un texte. speed 0.5-2 (0.85 = lent), lang fr. */
export async function fetchTtsAudioUrl(text: string, speed = 1, lang: "fr" = "fr"): Promise<string> {
  const key = `${lang}|${speed === 1 ? "n" : speed}|${fnv1a(text)}`;
  const hit = blobCache.get(key);
  if (hit) return hit;

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speed, lang }),
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

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("audio")) {
    throw new Error("TTS cloud indisponible (passage au retour vocal navigateur)");
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

// Référence globale pour éviter le garbage collection prématuré dans Chrome/Chromium et mobiles
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let speechHeartbeat: ReturnType<typeof setInterval> | null = null;

export interface SpeechController {
  stop: () => void;
}

/**
 * Joueur vocal universel Kènè :
 * 1. Tente d'abord le streaming audio Cloud haute fidélité (/api/tts).
 * 2. Si le cloud est indisponible ou demande un repli navigateur, bascule IMMÉDIATEMENT
 *    et en toute transparence sur la synthèse vocale intégrée de l'appareil (Web Speech API).
 * -> Zéro coupure de discours, intégrité complète du message garanti.
 */
export async function playSpeech({
  text,
  speed = 1,
  lang = "fr",
  onStart,
  onEnd,
  onError,
}: {
  text: string;
  speed?: number;
  lang?: "fr";
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err?: unknown) => void;
}): Promise<SpeechController> {
  let isStopped = false;

  // Arrête toute synthèse vocale ou son en cours
  stopBrowserVoice();

  // 1. Tente d'abord le Cloud TTS
  try {
    const key = `${lang}|${speed === 1 ? "n" : speed}|${fnv1a(text)}`;
    let audioUrl = blobCache.get(key);

    if (!audioUrl) {
      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), 35_000);

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, speed, lang }),
        signal: controller.signal,
      }).catch((e) => {
        clearTimeout(fetchTimer);
        return null;
      });

      clearTimeout(fetchTimer);

      if (res && res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("audio")) {
          const blob = await res.blob();
          if (blob.size >= 100) {
            audioUrl = URL.createObjectURL(blob);
            blobCache.set(key, audioUrl);
          }
        } else if (contentType.includes("json")) {
          const data = await res.json().catch(() => null);
          if (data?.text) {
            text = data.text;
          }
        }
      }
    }

    if (audioUrl && !isStopped) {
      const audio = new Audio(audioUrl);
      activeAudioElement = audio;
      audio.playbackRate = speed;
      audio.onplay = () => onStart?.();
      audio.onended = () => {
        if (activeAudioElement === audio) {
          activeAudioElement = null;
        }
        onEnd?.();
      };
      audio.onerror = () => {
        if (activeAudioElement === audio) {
          activeAudioElement = null;
        }
        if (!isStopped) {
          fallbackBrowser();
        }
      };
      await audio.play();
      return {
        stop: () => {
          isStopped = true;
          if (activeAudioElement === audio) {
            audio.pause();
            audio.currentTime = 0;
            activeAudioElement = null;
          }
          onEnd?.();
        },
      };
    }
  } catch (err) {
    console.warn("[playSpeech] Cloud TTS indisponible, bascule sur la voix du navigateur:", err);
  }

  if (isStopped) {
    return { stop: () => {} };
  }

  // 2. Bascule transparente sur la synthèse vocale du navigateur (Web Speech API)
  function fallbackBrowser() {
    speakBrowserVoice(text, {
      lang: "fr-FR",
      rate: speed ? Math.max(0.7, Math.min(1.4, speed * 0.95)) : 0.95,
      pitch: 1.02,
      onStart,
      onEnd,
      onError: (err) => {
        onError?.(err);
      },
    });
  }

  fallbackBrowser();

  return {
    stop: () => {
      isStopped = true;
      stopBrowserVoice();
      onEnd?.();
    },
  };
}

/** Arrête toute synthèse vocale et tout audio en cours */
export function stopBrowserVoice() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  if (speechHeartbeat) {
    clearInterval(speechHeartbeat);
    speechHeartbeat = null;
  }
  activeUtterance = null;
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {}
    activeAudioElement = null;
  }
}

/**
 * Synthèse vocale de secours via l'API Web Speech du navigateur.
 * Résilient aux lenteurs de chargement des voix et au bug de GC Chromium.
 */
export function speakBrowserVoice(
  text: string,
  options?: {
    lang?: string;
    rate?: number;
    pitch?: number;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err?: unknown) => void;
  }
): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    options?.onError?.(new Error("speechSynthesis non supporté"));
    return false;
  }

  try {
    window.speechSynthesis.cancel();

    // Délai de 50ms pour laisser le thread audio libérer la file d'attente
    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        activeUtterance = utterance; // Conserve la référence
        utterance.lang = options?.lang || "fr-FR";
        utterance.rate = options?.rate ?? 0.95;
        utterance.pitch = options?.pitch ?? 1.02;

        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(
          (v) => (v.lang.startsWith("fr") || v.lang.includes("FR")) &&
            (v.name.toLowerCase().includes("natural") ||
             v.name.toLowerCase().includes("online") ||
             v.name.toLowerCase().includes("google") ||
             v.name.toLowerCase().includes("denise") ||
             v.name.toLowerCase().includes("vivienne") ||
             v.name.toLowerCase().includes("eloise") ||
             v.name.toLowerCase().includes("amelie") ||
             v.name.toLowerCase().includes("marie") ||
             v.name.toLowerCase().includes("celine") ||
             v.name.toLowerCase().includes("julie"))
        ) || voices.find(
          (v) => (v.lang.startsWith("fr") || v.lang.includes("FR")) && !v.name.toLowerCase().includes("desktop")
        ) || voices.find((v) => v.lang.startsWith("fr")) || null;

        if (preferred) utterance.voice = preferred;

        const cleanup = () => {
          if (speechHeartbeat) {
            clearInterval(speechHeartbeat);
            speechHeartbeat = null;
          }
          activeUtterance = null;
        };

        utterance.onstart = () => {
          options?.onStart?.();
          // Heartbeat anti-coupure Chromium (résout le bug où le navigateur coupe au bout de 15s)
          if (speechHeartbeat) clearInterval(speechHeartbeat);
          speechHeartbeat = setInterval(() => {
            if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking) {
              window.speechSynthesis.pause();
              window.speechSynthesis.resume();
            } else {
              cleanup();
            }
          }, 10_000);
        };

        utterance.onend = () => {
          cleanup();
          options?.onEnd?.();
        };

        utterance.onerror = (e) => {
          cleanup();
          // 'canceled' ou 'interrupted' = arrêt volontaire
          if (e.error === "canceled" || e.error === "interrupted") {
            options?.onEnd?.();
            return;
          }
          console.warn("[speechSynthesis] non-blocking error:", e.error);
          options?.onEnd?.();
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        if (speechHeartbeat) {
          clearInterval(speechHeartbeat);
          speechHeartbeat = null;
        }
        activeUtterance = null;
        options?.onError?.(err);
      }
    }, 50);

    return true;
  } catch (err) {
    activeUtterance = null;
    options?.onError?.(err);
    return false;
  }
}
