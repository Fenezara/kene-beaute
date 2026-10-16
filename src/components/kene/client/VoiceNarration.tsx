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
    <div role="region" aria-label="Lecture vocale du bilan" className="flex flex-col items-end">
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          disabled={state === "loading"}
          aria-label={
            state === "playing"
              ? "Arrêter la lecture vocale du bilan"
              : "Écouter le résumé vocal du bilan"
          }
          className="h-9 sm:h-10 px-3.5 sm:px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-xs hover:bg-primary/95 flex items-center justify-center gap-2 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 cursor-pointer"
        >
          {state === "playing" ? (
            <>
              <span className="flex items-end gap-[3px] h-3.5" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <motion.span
                    key={i}
                    className="w-[2.5px] h-3.5 rounded-full bg-current origin-bottom"
                    animate={{ scaleY: [0.35, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.12, ease: "easeInOut" }}
                  />
                ))}
              </span>
              <Square size={12} aria-hidden="true" />
              <span>Arrêter</span>
            </>
          ) : state === "loading" ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              <span>Chargement…</span>
            </>
          ) : (
            <>
              <Volume2 size={14} aria-hidden="true" />
              <span>Écouter le bilan</span>
            </>
          )}
        </button>

        <button
          onClick={toggleSlow}
          aria-pressed={slow}
          title={slow ? "Vitesse normale" : "Lecture lente"}
          aria-label="Lecture lente (pour mieux comprendre à l'écoute)"
          className={`inline-flex items-center justify-center size-9 sm:size-10 rounded-xl text-xs font-bold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary cursor-pointer ${
            slow ? "bg-primary/20 text-primary border border-primary/50" : "bg-card text-muted-foreground border border-border/80 hover:text-foreground"
          }`}
        >
          <Turtle size={14} aria-hidden="true" />
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1 text-right">
        {state === "playing"
          ? slow
            ? "Lecture posée en cours…"
            : "Lecture vocale en cours…"
          : "Guide audio personnalisé"}
      </p>
    </div>
  );
}
