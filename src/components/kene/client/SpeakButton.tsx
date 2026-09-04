"use client";
// Kènè — bouton « écouter » compact et réutilisable (glossaire, etc.).
// Utilise le cache TTS partagé (ttsAudio.ts) : plusieurs écoutes = 1 seul appel réseau.
import { useEffect, useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { fetchTtsAudioUrl } from "./ttsAudio";

export function SpeakButton({
  text,
  label,
  speed = 1,
  className = "",
}: {
  text: string;
  label?: string;
  speed?: number;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  async function toggle() {
    if (state === "playing") {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      setState("idle");
      return;
    }
    if (state === "loading") return;
    setState("loading");
    try {
      const url = await fetchTtsAudioUrl(text, speed);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => {
        setState("idle");
        toast.error("Lecture impossible");
      };
      await audio.play();
      setState("playing");
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Lecture vocale indisponible");
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={state === "loading"}
      aria-label={state === "playing" ? `Arrêter : ${label ?? text.slice(0, 40)}` : `Écouter : ${label ?? text.slice(0, 40)}`}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-primary/50 text-primary text-[11px] font-bold px-3.5 min-h-11 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 ${className}`}
    >
      {state === "playing" ? (
        <>
          <Square size={12} aria-hidden="true" /> {label ? "Arrêter" : null}
        </>
      ) : state === "loading" ? (
        <>
          <Loader2 size={12} className="animate-spin" aria-hidden="true" /> {label ? "Préparation…" : null}
        </>
      ) : (
        <>
          <Volume2 size={12} aria-hidden="true" /> {label ?? "Écouter"}
        </>
      )}
    </button>
  );
}
