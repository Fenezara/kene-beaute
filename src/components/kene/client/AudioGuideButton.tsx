"use client";
// Kènè — Guide Audio Oralisé & Bienveillant en français naturel haute fidélité.
// Permet l'écoute vocale des instructions (zone, capture, etc.).
import { useEffect, useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";
import { playSpeech, type SpeechController } from "./ttsAudio";

interface AudioGuideButtonProps {
  text: string;
  label?: string;
  className?: string;
  compact?: boolean;
}

export function AudioGuideButton({
  text,
  label = "Écouter les conseils",
  className = "",
  compact = false,
}: AudioGuideButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const ctrlRef = useRef<SpeechController | null>(null);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      ctrlRef.current?.stop();
      ctrlRef.current = null;
    };
  }, []);

  function stopAudio() {
    ctrlRef.current?.stop();
    ctrlRef.current = null;
    setState("idle");
  }

  async function togglePlay() {
    if (state === "playing") {
      stopAudio();
      return;
    }
    if (state === "loading") return;

    setState("loading");
    try {
      ctrlRef.current = await playSpeech({
        text,
        speed: 1,
        lang: "fr",
        onStart: () => setState("playing"),
        onEnd: () => {
          ctrlRef.current = null;
          setState("idle");
        },
        onError: () => {
          ctrlRef.current = null;
          setState("idle");
        },
      });
    } catch {
      setState("idle");
    }
  }

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {/* Bouton de lecture */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={state === "loading"}
        aria-label={state === "playing" ? "Arrêter le guide audio" : "Écouter les conseils vocaux"}
        className={`inline-flex items-center justify-center gap-2 rounded-full border transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 ${
          state === "playing"
            ? "border-primary bg-primary text-primary-foreground shadow-md animate-pulse"
            : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
        } ${compact ? "h-9 px-3 text-xs" : "h-11 px-4 text-xs font-bold"}`}
      >
        {state === "playing" ? (
          <>
            <Square size={13} className="fill-current" aria-hidden="true" />
            <span>Arrêter</span>
          </>
        ) : state === "loading" ? (
          <>
            <Loader2 size={14} className="animate-spin text-primary" aria-hidden="true" />
            <span>Chargement vocal…</span>
          </>
        ) : (
          <>
            <Volume2 size={15} aria-hidden="true" />
            <span>{label}</span>
          </>
        )}
      </button>
    </div>
  );
}

