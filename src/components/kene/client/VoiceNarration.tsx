"use client";
// Kènè — lecture vocale TTS du diagnostic (accès non-lectrices & confort audio).
// Utilise le cache TTS partagé (ttsAudio.ts) + option « lecture lente »
// (speed 0.85) pour l'écoute en français naturel haute fidélité.
// Synthèse vocale naturelle haute fidélité (fr-FR-DeniseNeural).
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Square, Turtle, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { DiagnosisResult } from "@/lib/kene/types";
import { buildNarration } from "@/lib/kene/narration";
import { playSpeech, type SpeechController } from "./ttsAudio";

const SLOW_SPEED = 0.85;

export function VoiceNarration({ result, userName }: { result: DiagnosisResult; userName?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [slow, setSlow] = useState(false);
  const ctrlRef = useRef<SpeechController | null>(null);
  const narration = useMemo(
    () => buildNarration(result, { userName }),
    [result, userName],
  );

  // stop + libération au démontage
  useEffect(
    () => () => {
      ctrlRef.current?.stop();
      ctrlRef.current = null;
    },
    [],
  );

  function stopAudio() {
    ctrlRef.current?.stop();
    ctrlRef.current = null;
    setState("idle");
  }

  async function toggle() {
    if (state === "playing") {
      stopAudio();
      return;
    }
    if (state === "loading") return;
    setState("loading");
    try {
      ctrlRef.current = await playSpeech({
        text: narration,
        speed: slow ? SLOW_SPEED : 1,
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

  function toggleSlow() {
    // changer la vitesse pendant une lecture: couper proprement avant
    if (state === "playing") {
      stopAudio();
      setState("idle");
    }
    setSlow(!slow);
  }

  return (
    <div role="region" aria-label="Lecture vocale du diagnostic" className="mt-4">
      <button
        onClick={toggle}
        disabled={state === "loading"}
        aria-label={
          state === "playing"
            ? "Arrêter la lecture vocale du diagnostic"
            : "Écouter le résumé vocal du diagnostic"
        }
        className="h-12 w-full rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-[0_10px_26px_-12px_rgba(143,102,13,0.6)] flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
      >
        {state === "playing" ? (
          <>
            <span className="flex items-end gap-[3px] h-4" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <motion.span
                  key={i}
                  className="w-[3px] h-4 rounded-full bg-current origin-bottom"
                  animate={{ scaleY: [0.35, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.12, ease: "easeInOut" }}
                />
              ))}
            </span>
            <Square size={14} aria-hidden="true" /> Arrêter la lecture
          </>
        ) : state === "loading" ? (
          <>
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />{" "}
            Préparation de l'audio…
          </>
        ) : (
          <>
            <Volume2 size={17} aria-hidden="true" /> Écouter le résumé
          </>
        )}
      </button>
      <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
        <button
          onClick={toggleSlow}
          aria-pressed={slow}
          aria-label="Lecture lente (pour mieux comprendre à l'écoute)"
          className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 text-[10px] font-bold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${
            slow ? "bg-primary/15 text-primary border border-primary/40" : "text-muted-foreground border border-border"
          }`}
        >
          <Turtle size={11} aria-hidden="true" /> {slow ? "Lecture lente activée" : "Lecture lente"}
        </button>
      </div>
      <p className="text-center text-[10px] text-muted-foreground mt-1">
        {state === "playing"
          ? slow
            ? "Lecture lente en cours…"
            : "Lecture en cours…"
          : "Synthèse vocale naturelle haute fidélité"}
      </p>
    </div>
  );
}
