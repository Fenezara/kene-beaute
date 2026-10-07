"use client";
// Kènè — « Résumé en pictos »: les priorités du diagnostic en grandes tuiles
// icône + 1-2 mots, tapables → lecture vocale. Pensé pour les utilisatrices
// non-lectrices: l'image parle, la voix explique, aucun texte long à décoder.
import { useMemo, useRef, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import {
  Activity, Droplets, Flame, Leaf, Loader2, Moon, Shield, Volume2, Waves, Zap, CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import type { DiagnosisResult, Indicator } from "@/lib/kene/types";
import { scoreColor, scoreVar } from "@/lib/kene/format";
import { numberToFrench } from "@/lib/kene/narration";
import { playSpeech, type SpeechController } from "./ttsAudio";
import { CauriIcon, KeneSunIcon } from "@/components/kene/icons";

/* ── Picto par mot-clé (nom d'indicateur → icône + libellé court) ── */
type Picto = { icon: ComponentType<{ size?: number; className?: string }>; label: string };

const KEYWORD_PICTOS: [string, Picto][] = [
  ["hydrat", { icon: Droplets, label: "Hydrater" }],
  ["sécheresse", { icon: Droplets, label: "Hydrater" }],
  ["barrière", { icon: Shield, label: "Protéger" }],
  ["élasticit", { icon: Activity, label: "Raffermer" }],
  ["fermeté", { icon: Activity, label: "Raffermer" }],
  ["ridule", { icon: Activity, label: "Raffermer" }],
  ["éclat", { icon: KeneSunIcon, label: "Éclat" }],
  ["uniformité", { icon: KeneSunIcon, label: "Uniformité" }],
  ["tache", { icon: CircleDot, label: "Taches" }],
  ["pigment", { icon: CircleDot, label: "Taches" }],
  ["acné", { icon: Zap, label: "Boutons" }],
  ["comédon", { icon: Zap, label: "Boutons" }],
  ["bouton", { icon: Zap, label: "Boutons" }],
  ["poil incarné", { icon: Waves, label: "Poils" }],
  ["folliculite", { icon: Flame, label: "Rougeurs" }],
  ["irritation", { icon: Flame, label: "Rougeurs" }],
  ["rougeur", { icon: Flame, label: "Rougeurs" }],
  ["érythème", { icon: Flame, label: "Rougeurs" }],
  ["inflammation", { icon: Flame, label: "Rougeurs" }],
  ["sébum", { icon: Waves, label: "Sébum" }],
  ["pore", { icon: Waves, label: "Pores" }],
  ["texture", { icon: Waves, label: "Texture" }],
  ["rugosité", { icon: Waves, label: "Texture" }],
  ["keratos", { icon: Waves, label: "Callosités" }],
  ["callosité", { icon: Waves, label: "Callosités" }],
  ["desquamation", { icon: Waves, label: "Pellicules" }],
  ["pellicule", { icon: Waves, label: "Pellicules" }],
  ["cerne", { icon: Moon, label: "Cernes" }],
  ["ongle", { icon: Activity, label: "Ongles" }],
  ["asymétrie", { icon: CircleDot, label: "Forme" }],
  ["bords", { icon: CircleDot, label: "Bords" }],
  ["couleur", { icon: CircleDot, label: "Couleurs" }],
  ["diamètre", { icon: CircleDot, label: "Taille" }],
  ["évolution", { icon: Activity, label: "Évolution" }],
  ["alopeciqu", { icon: Leaf, label: "Cheveux" }],
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function pictoFor(name: string): Picto {
  const n = norm(name);
  for (const [kw, p] of KEYWORD_PICTOS) if (n.includes(norm(kw))) return p;
  return { icon: CauriIcon, label: name.split(/[ /(]/)[0] };
}

/** Verdict très court parlé pour une priorité */
function levelShort(pct: number): string {
  if (pct < 45) return "À surveiller de près.";
  if (pct < 65) return "À améliorer.";
  if (pct < 85) return "Léger.";
  return "Très bien.";
}

export function PictoSummary({ result, zoneLabel }: { result: DiagnosisResult; zoneLabel: string }) {
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const ctrlRef = useRef<SpeechController | null>(null);

  // 6 priorités max (les scores santé les plus bas)
  const tiles = useMemo(
    () =>
      [...result.indicateurs]
        .sort((a, b) => a.pourcentage - b.pourcentage)
        .slice(0, 6)
        .map((ind: Indicator) => {
          const p = pictoFor(ind.nom);
          return {
            key: ind.nom,
            icon: p.icon,
            label: p.label,
            pct: ind.pourcentage,
            phrase: `${p.label}. ${levelShort(ind.pourcentage)}`,
          };
        }),
    [result],
  );

  const stop = () => {
    ctrlRef.current?.stop();
    ctrlRef.current = null;
  };

  async function speak(i: number, phrase: string) {
    if (playingIdx === i) {
      stop();
      setPlayingIdx(null);
      return;
    }
    stop();
    setPlayingIdx(null);
    if (loadingIdx !== null) return;
    setLoadingIdx(i);
    try {
      ctrlRef.current = await playSpeech({
        text: phrase,
        speed: 0.92,
        onStart: () => setPlayingIdx(i),
        onEnd: () => {
          ctrlRef.current = null;
          setPlayingIdx((cur) => (cur === i ? null : cur));
        },
        onError: () => {
          ctrlRef.current = null;
          setPlayingIdx((cur) => (cur === i ? null : cur));
        },
      });
    } catch {
      setPlayingIdx(null);
    } finally {
      setLoadingIdx(null);
    }
  }

  if (tiles.length === 0) return null;

  return (
    <section
      aria-label="Résumé en pictogrammes — tape une tuile pour l'écouter"
      className="rounded-3xl border-2 border-dashed border-primary/40 bg-primary/5 p-4"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="font-heading font-bold text-sm flex items-center gap-2">
          <CauriIcon size={16} className="text-primary" aria-hidden="true" /> Le résumé en pictos
        </p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {zoneLabel} · {numberToFrench(result.score_global)} / cent
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          const active = playingIdx === i;
          const loading = loadingIdx === i;
          const color = scoreColor(t.pct);
          return (
            <motion.button
              key={t.key}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => speak(i, t.phrase)}
              aria-label={`${t.label} — ${t.phrase}`}
              className={`relative flex flex-col items-center gap-1.5 rounded-2xl border-2 bg-card p-3 shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-primary ${
                active ? "border-primary scale-[1.03]" : "border-border"
              } ${loading ? "opacity-70" : ""}`}
            >
              <span
                className="grid place-items-center h-14 w-14 rounded-full"
                style={{ backgroundColor: `${color}22`, color: scoreVar(t.pct) }}
                aria-hidden="true"
              >
                {loading ? <Loader2 size={26} className="animate-spin" /> : <Icon size={26} />}
              </span>
              <span className="text-[11px] font-bold text-center leading-tight">{t.label}</span>
              <span className="font-mono text-[10px] font-bold" style={{ color: scoreVar(t.pct) }}>
                {t.pct}
              </span>
              {active && (
                <span className="absolute -top-1.5 -right-1.5 grid place-items-center h-6 w-6 rounded-full bg-primary text-primary-foreground shadow" aria-hidden="true">
                  <Volume2 size={12} />
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <p className="flex items-center justify-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
        <Volume2 size={11} aria-hidden="true" />
        Tape une tuile — elle se lit à voix haute. Pour qui préfère les images aux textes.
      </p>
    </section>
  );
}
