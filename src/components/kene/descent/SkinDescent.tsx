"use client";
// Kènè — La Descente de Peau (t. 82, vague 2) : « Voyager dans sa peau ».
// Overlay plein cadre ouvert depuis le résultat du diagnostic. Le scroll
// traverse les trois couches cutanées en 3D — épiderme, derme, hypoderme —
// et les zones s'illuminent avec les scores RÉELS de l'analyse (couleur
// scoreColor, intensité pulsée). Rig Intro3D : progression en ref mutable,
// rendu coupé hors écran, DPR clampé, ~10k triangles, tout procédural.
// Mode Clair de Lune : mêmes contenus en sections empilées (zéro canvas).
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ChevronDown, Layers, X } from "lucide-react";
import type { Indicator } from "@/lib/kene/types";
import { scoreColor } from "@/lib/kene/format";
import { useLoomMode } from "@/components/kene/loom/useLoomMode";

const Descent3D = dynamic(() => import("./Descent3D"), { ssr: false, loading: () => null });

type ProgressRef = React.RefObject<number>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** Répartition des indicateurs par couche (les plus « surface » d'abord). */
function layerize(inds: Indicator[]) {
  const sorted = [...inds].sort((a, b) => b.pourcentage - a.pourcentage);
  return {
    epiderme: sorted.slice(0, 3),
    derme: sorted.slice(3, 6),
    hypoderme: sorted.slice(6, 9),
  };
}

/* ───────────────────────── Chips d'indicateurs (scores réels) ───────────────────────── */
function IndicatorChips({ inds }: { inds: Indicator[] }) {
  if (inds.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {inds.map((i) => {
        const c = scoreColor(i.pourcentage);
        return (
          <span key={i.nom} className="inline-flex items-center gap-1.5 rounded-full bg-[#241A10]/80 px-2.5 py-1 text-[11px] font-semibold text-[#F8F1E4] ring-1 ring-[#F8F1E4]/10">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} aria-hidden="true" />
            {i.nom}
            <span className="font-mono tabular-nums" style={{ color: c }}>{i.pourcentage}</span>
          </span>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Légendes par couche ───────────────────────── */
const LAYERS = [
  {
    at: 0.05,
    end: 0.33,
    overline: "Couche 1 · Épiderme",
    title: "La barrière qui veille",
    sub: "C'est ici que se joue l'hydratation et la protection. Tes indicateurs de surface s'y lisent en lumière.",
  },
  {
    at: 0.35,
    end: 0.63,
    overline: "Couche 2 · Derme",
    title: "Le capital collagène",
    sub: "Fibres de collagène et vaisseaux : la profondeur où se forment rides et fermeté. Le temps y laisse ses fils.",
  },
  {
    at: 0.65,
    end: 0.92,
    overline: "Couche 3 · Hypoderme",
    title: "La réserve profonde",
    sub: "Les cellules adipeuses : coussin, réserve et volume. Les soins y arrivent rarement — d'où les gestes ciblés.",
  },
] as const;

export function SkinDescent({
  indicators,
  score,
  zoneLabel,
  onClose,
}: {
  indicators: Indicator[];
  score: number;
  zoneLabel: string;
  onClose: () => void;
}) {
  const mode = useLoomMode();
  const [active, setActive] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<number>(0);
  const captionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hintRef = useRef<HTMLDivElement>(null);

  const layers = useMemo(() => layerize(indicators), [indicators]);

  // Échap ferme — comme les stories et le rituel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Bloque le scroll du document derrière l'overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (mode !== "full") return;
    const section = sectionRef.current;
    if (!section) return;
    const io = new IntersectionObserver((entries) => setActive(entries[0]?.isIntersecting ?? false), { threshold: 0.05 });
    io.observe(section);
    let raf = 0;
    const loop = () => {
      const rect = section.getBoundingClientRect();
      const total = Math.max(rect.height - window.innerHeight, 1);
      const p = Math.min(1, Math.max(0, -rect.top / total));
      progressRef.current = p;
      captionRefs.current.forEach((c) => {
        if (!c) return;
        const from = Number(c.dataset.from);
        const to = Number(c.dataset.to);
        const span = to - from;
        const vis = Math.min(1, Math.max(0, Math.min((p - from) / (span * 0.3), (to - p) / (span * 0.3))));
        c.style.opacity = String(vis);
        c.style.transform = `translate3d(0, ${(1 - vis) * 24}px, 0)`;
        c.style.visibility = vis > 0.02 ? "visible" : "hidden";
      });
      // L'invite s'efface dès les premiers millimètres de descente.
      if (hintRef.current) {
        hintRef.current.style.opacity = String(Math.max(0, 1 - p * 14));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [mode]);

  const title = (
    <div className="relative z-10 px-5 pt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C8951E]">La Descente de Peau</p>
      <h2 className="mt-2 font-heading font-black text-[26px] leading-[1.08] text-[#F8F1E4]">
        {zoneLabel} — sous la surface
      </h2>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[#F8F1E4]/70">
        Score global <span className="font-mono font-bold" style={{ color: scoreColor(score) }}>{score}/100</span> · traverse
        les trois couches de ta peau, éclairées par tes indicateurs réels.
      </p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] bg-[#100C08] text-[#F8F1E4]"
      role="dialog"
      aria-label="Descente de Peau — voyage dans les couches de la peau"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-20 inline-flex h-11 items-center gap-1.5 rounded-full border border-[#F8F1E4]/20 bg-[#F8F1E4]/5 px-4 text-xs text-[#F8F1E4]/85 backdrop-blur transition hover:bg-[#F8F1E4]/15 focus-visible:outline-2 focus-visible:outline-[#C8951E]"
        aria-label="Fermer la Descente de Peau"
      >
        <X size={13} /> Fermer
      </button>

      {mode !== "full" ? (
        /* ── Clair de Lune : sections empilées, mêmes contenus, zéro 3D ── */
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-[560px] pb-10">
            {title}
            {LAYERS.map((L, i) => (
              <section key={L.overline} className="px-5 pt-8">
                <div className="rounded-[24px] bg-gradient-to-b from-[#241A10] to-[#1A1410] p-5 ring-1 ring-[#C8951E]/20">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#C8951E]">{L.overline}</p>
                  <h3 className="mt-2 font-heading text-xl font-black">{L.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#F8F1E4]/70">{L.sub}</p>
                  <div className="mt-3">
                    <IndicatorChips inds={[layers.epiderme, layers.derme, layers.hypoderme][i]} />
                  </div>
                </div>
              </section>
            ))}
            <div className="px-5 pt-8">
              <button onClick={onClose} className="h-12 w-full rounded-2xl bg-[#C8951E] font-heading font-bold text-[15px] text-[#1A1410] focus-visible:outline-2 focus-visible:outline-[#F8F1E4]">
                Remonter à la surface
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Expérience 3D : 3,4 écrans de descente, sticky cinéma ── */
        <div className="h-full overflow-y-auto pretty-scroll">
          <div ref={sectionRef} className="relative h-[340vh]">
            <div className="sticky top-0 h-svh overflow-hidden">
              <div className="pointer-events-none absolute inset-0">
                <Descent3D progressRef={progressRef} indicators={indicators} active={active} />
              </div>

              {/* Vignettes de lisibilité */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#100C08]/85 to-transparent" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#100C08]/90 to-transparent" />

              {title}

              {LAYERS.map((L, i) => (
                <div
                  key={L.overline}
                  ref={(el) => {
                    captionRefs.current[i] = el;
                  }}
                  data-from={L.at}
                  data-to={L.end}
                  className={`pointer-events-none absolute z-10 ${i === 1 ? "right-5 bottom-[16%] text-right sm:right-[8%]" : "left-5 bottom-[16%] text-left sm:left-[8%] sm:max-w-[320px]"}`}
                  style={{ opacity: 0, visibility: "hidden" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C8951E]">{L.overline}</p>
                  <h3 className="mt-2 font-heading font-black text-[24px] leading-[1.1]">{L.title}</h3>
                  <p className="mt-2 max-w-[36ch] text-[12px] leading-relaxed text-[#F8F1E4]/70">{L.sub}</p>
                  <div className="mt-3">
                    <IndicatorChips inds={[layers.epiderme, layers.derme, layers.hypoderme][i]} />
                  </div>
                </div>
              ))}

              {/* Fin de descente : remontée */}
              <div
                ref={(el) => {
                  captionRefs.current[3] = el;
                }}
                data-from={0.93}
                data-to={1.01}
                className="pointer-events-auto absolute inset-x-5 bottom-[18%] z-10 flex flex-col items-center text-center"
                style={{ opacity: 0, visibility: "hidden" }}
              >
                <p className="font-heading text-xl font-black">Fond de peau atteint</p>
                <p className="mt-1.5 text-[12px] text-[#F8F1E4]/70">Tu connais maintenant tes trois étages — remonter ?</p>
                <button onClick={onClose} className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-[#C8951E] px-7 font-heading font-bold text-[15px] text-[#1A1410] shadow-lg shadow-[#C8951E]/30 active:scale-95 focus-visible:outline-2 focus-visible:outline-[#F8F1E4]">
                  <Layers size={16} /> Remonter
                </button>
              </div>

              {/* Invitation au défilement — pilotée par la boucle rAF,
                  s'efface dès le début de la descente */}
              <div
                ref={hintRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1 text-[#F8F1E4]/55"
              >
                <span className="text-[10px] uppercase tracking-[0.2em]">Défile pour descendre</span>
                <motion.span animate={{ y: [0, 5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
                  <ChevronDown size={16} />
                </motion.span>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
