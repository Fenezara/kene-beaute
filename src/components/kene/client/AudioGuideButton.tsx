"use client";
// Kènè — Guide Audio Oralisé & Bienveillant en langues africaines
// Permet l'écoute vocale des instructions (zone, capture, etc.) en Français, Dioula, Baoulé, Bété et Wolof.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe, Loader2, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { NARRATION_LANGS, type NarrationLang } from "@/lib/kene/narration";
import { playSpeech, type SpeechController } from "./ttsAudio";

const LANG_STORAGE_KEY = "kene_audio_guide_lang";

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
  const [lang, setLang] = useState<NarrationLang>("fr");
  const [menuOpen, setMenuOpen] = useState(false);
  const ctrlRef = useRef<SpeechController | null>(null);

  // Charger la langue préférée depuis localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY) as NarrationLang | null;
      if (saved && NARRATION_LANGS.some((l) => l.code === saved)) {
        setLang(saved);
      }
    } catch {
      // Ignorer si localStorage n'est pas accessible
    }
  }, []);

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
        lang,
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

  function handleSelectLang(nextLang: NarrationLang) {
    if (state === "playing") {
      stopAudio();
    }
    setLang(nextLang);
    setMenuOpen(false);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    } catch {
      // no-op
    }
    const l = NARRATION_LANGS.find((item) => item.code === nextLang);
    toast.success(`Guide audio en ${l?.label ?? nextLang}`);
  }

  const activeLangDef = NARRATION_LANGS.find((l) => l.code === lang) ?? NARRATION_LANGS[0];

  return (
    <div className={`relative inline-flex items-center gap-1.5 ${className}`}>
      {/* Bouton de lecture */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={state === "loading"}
        aria-label={state === "playing" ? `Arrêter le guide audio (${activeLangDef.label})` : `Écouter les instructions en ${activeLangDef.label}`}
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

      {/* Sélecteur de langue */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={`Changer la langue du guide vocal (actuellement ${activeLangDef.label})`}
          className="inline-flex items-center gap-1 h-9 px-2.5 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground text-[11px] font-bold active:scale-95 transition-all"
        >
          <Globe size={12} className="text-primary" aria-hidden="true" />
          <span>{activeLangDef.code.toUpperCase()}</span>
          <ChevronDown size={11} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[150px] rounded-2xl border border-border bg-card p-1.5 shadow-xl animate-in fade-in zoom-in-95">
              <p className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Langue orale
              </p>
              {NARRATION_LANGS.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleSelectLang(item.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                    lang === item.code
                      ? "bg-primary text-primary-foreground font-bold"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span>{item.label}</span>
                  {lang === item.code && <span className="text-[10px]">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
