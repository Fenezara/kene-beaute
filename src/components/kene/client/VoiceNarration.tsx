"use client";
// Kènè — lecture vocale TTS du diagnostic (accès non-lectrices & confort audio).
// POST /api/tts → blob WAV → <Audio> ; cache objectURL par hash de narration
// (module-level, FIFO 8) pour ré-écouter sans re-consommer de quota TTS.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { DiagnosisResult } from "@/lib/kene/types";
import { buildNarration, fnv1a } from "@/lib/kene/narration";

const BLOB_CACHE_MAX = 8;
const blobCache = new Map<string, string>();

export function VoiceNarration({ result, userName }: { result: DiagnosisResult; userName?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narration = useMemo(() => buildNarration(result, { userName }), [result, userName]);
  const key = useMemo(() => fnv1a(narration), [narration]);

  // stop + libération au démontage
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
      let url = blobCache.get(key);
      if (!url) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: narration }),
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
        url = URL.createObjectURL(blob);
        blobCache.set(key, url);
        while (blobCache.size > BLOB_CACHE_MAX) {
          const first = blobCache.keys().next().value;
          if (first === undefined) break;
          const u = blobCache.get(first);
          blobCache.delete(first);
          if (u && first !== key) URL.revokeObjectURL(u);
        }
      }
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
    <div role="region" aria-label="Lecture vocale du diagnostic" className="mt-4">
      <button
        onClick={toggle}
        disabled={state === "loading"}
        aria-label={
          state === "playing"
            ? "Arrêter la lecture vocale du diagnostic"
            : "Écouter le résumé vocal du diagnostic"
        }
        className="h-12 w-full rounded-2xl bg-primary text-primary-foreground font-heading font-bold text-sm shadow-md flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
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
            <Loader2 size={17} className="animate-spin" aria-hidden="true" /> Préparation de l&apos;audio…
          </>
        ) : (
          <>
            <Volume2 size={17} aria-hidden="true" /> Écouter le résumé
          </>
        )}
      </button>
      <p className="text-center text-[10px] text-muted-foreground mt-1.5">
        {state === "playing" ? "Lecture en cours…" : "Pour écouter plutôt que lire"}
      </p>
    </div>
  );
}
