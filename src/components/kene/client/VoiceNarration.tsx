"use client";
// Kènè — lecture vocale TTS du diagnostic (accès non-lectrices & confort audio).
// Utilise le cache TTS partagé (ttsAudio.ts) + option « lecture lente »
// (speed 0.85) pour l'écoute en français langue seconde.
// Langues : français (complet) + dioula / baoulé / bété (résumé compact,
// traduction IA indicative — Côte d'Ivoire).
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Square, Turtle, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { DiagnosisResult } from "@/lib/kene/types";
import { buildNarration, buildNarrationCompact, NARRATION_LANGS, type NarrationLang } from "@/lib/kene/narration";
import { fetchTtsAudioUrl } from "./ttsAudio";

const SLOW_SPEED = 0.85;

export function VoiceNarration({ result, userName }: { result: DiagnosisResult; userName?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [slow, setSlow] = useState(false);
  const [lang, setLang] = useState<NarrationLang>("fr");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narration = useMemo(
    () => (lang === "fr" ? buildNarration(result, { userName }) : buildNarrationCompact(result, { userName })),
    [result, userName, lang],
  );

  // stop + libération au démontage
  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  // changer de langue pendant une lecture : couper proprement
  function switchLang(next: NarrationLang) {
    if (state === "playing") {
      stopAudio();
      setState("idle");
    }
    setLang(next);
  }

  function stopAudio() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    audioRef.current = null;
  }

  async function toggle() {
    if (state === "playing") {
      stopAudio();
      setState("idle");
      return;
    }
    if (state === "loading") return;
    setState("loading");
    try {
      const url = await fetchTtsAudioUrl(narration, slow ? SLOW_SPEED : 1, lang);
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

  function toggleSlow() {
    // changer la vitesse pendant une lecture : couper proprement avant
    if (state === "playing") {
      stopAudio();
      setState("idle");
    }
    setSlow(!slow);
  }

  const langLabel = NARRATION_LANGS.find((l) => l.code === lang)?.label ?? "Français";

  return (
    <div role="region" aria-label="Lecture vocale du diagnostic" className="mt-4">
      <button
        onClick={toggle}
        disabled={state === "loading"}
        aria-label={
          state === "playing"
            ? `Arrêter la lecture vocale du diagnostic (${langLabel})`
            : `Écouter le résumé vocal du diagnostic (${langLabel})`
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
            {lang === "fr" ? "Préparation de l'audio…" : `Traduction ${langLabel}…`}
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
        <span aria-hidden="true" className="text-muted-foreground/40 text-[10px]">·</span>
        <div
          role="group"
          aria-label="Langue de la lecture vocale"
          className="inline-flex items-center gap-1 rounded-full border border-border px-1 py-0.5"
        >
          {NARRATION_LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => switchLang(l.code)}
              aria-pressed={lang === l.code}
              aria-label={`Lire en ${l.label}`}
              className={`min-h-10 rounded-full px-3 text-[10px] font-bold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${
                lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.code === "fr" ? "FR" : l.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-center text-[10px] text-muted-foreground mt-1">
        {state === "playing"
          ? slow
            ? "Lecture lente en cours…"
            : "Lecture en cours…"
          : lang === "fr"
            ? "Pour écouter plutôt que lire"
            : "Résumé en " + langLabel + " · traduction IA indicative"}
      </p>
    </div>
  );
}
