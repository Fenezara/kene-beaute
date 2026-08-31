"use client";
// Kènè — Fil de Kente : la carte « bande tissée » réutilisable.
// Hero WebGL de la boutique (et de toute section qui veut un fil d'identité) :
// la navette tisse la bande à l'entrée, le fil de la catégorie sélectionnée
// s'illumine. Fallback CSS (reduced-motion / WebGL absent / #weave-static),
// rendu coupé hors viewport (IO), a11y : figure + figcaption, canvas aria-hidden.

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { KENTE_THREADS, createWeaveRefs } from "./threads";
import { useWeaveMode } from "./mode";

const KenteWeaveScene = dynamic(() => import("./KenteWeaveScene"), { ssr: false, loading: () => null });

/* ───────────────────────── Fallback CSS statique ───────────────────────── */

function WeaveStatic({ highlightIndex }: { highlightIndex: number }) {
  const t = highlightIndex >= 0 ? KENTE_THREADS[highlightIndex] : null;
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* trame de fond — bandes kente douces */}
      <div className="absolute inset-0 kente-band-soft opacity-90" />
      {/* armure : croisures horizontales or + verticales sombres */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(26,20,16,0.35) 0 2px, transparent 2px 10px), repeating-linear-gradient(90deg, rgba(200,149,30,0.3) 0 2px, transparent 2px 16px)",
        }}
      />
      {t && (
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: `radial-gradient(75% 95% at 50% 55%, ${t.hex}99, ${t.hex}33 55%, transparent 75%)`,
            boxShadow: `inset 0 0 26px ${t.hex}66`,
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Carte principale ───────────────────────── */

export function KenteWeaveCard({
  highlightIndex = -1,
  caption,
  label = "Bande de kente tissée en 3D — chaque catégorie a son fil",
  className,
  weaveKey,
}: {
  /** index du fil mis en avant (−1 = aucun) — cf. threads.ts */
  highlightIndex?: number;
  /** texte de légende sous la bande (accessible) */
  caption?: string;
  /** aria-label de la figure */
  label?: string;
  /** classes additionnelles pour la figure */
  className?: string;
  /** changement → la navette re-tisse la bande */
  weaveKey?: number;
}) {
  const mode = useWeaveMode();
  const refsRef = useRef(createWeaveRefs()); // objet ref — jamais déréférencé au render
  const [active, setActive] = useState(true); // IntersectionObserver → frameloop
  const stageRef = useRef<HTMLDivElement>(null);

  /* le fil à illuminer — écrit dans la ref mutable, lue par la scène (zéro re-render) */
  useEffect(() => {
    refsRef.current.highlight.index = highlightIndex;
  }, [highlightIndex, refsRef]);

  /* rendu coupé quand la carte sort du viewport */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (es) => {
        const vis = es[0].isIntersecting;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => setActive(vis));
      },
      { threshold: 0.02 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const thread = highlightIndex >= 0 ? KENTE_THREADS[highlightIndex] : null;

  return (
    <figure role="figure" aria-label={label} className={className}>
      <div
        ref={stageRef}
        aria-hidden="true"
        className="relative h-[118px] touch-pan-y select-none overflow-hidden rounded-3xl border border-border shadow-md sm:h-[132px]"
      >
        {/* fond mélanine « atelier du tisserand » */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_130%_at_50%_115%,#3A2A1A_0%,#241A10_62%,#1A1410_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_50%_60%,rgba(200,149,30,0.1),transparent_80%)]" />

        {mode === "3d" ? (
          <KenteWeaveScene refs={refsRef} frameloop={active ? "always" : "never"} weaveKey={weaveKey} />
        ) : (
          mode === "static" && <WeaveStatic highlightIndex={highlightIndex} />
        )}

        {/* badge atelier */}
        <div className="absolute left-3 top-2.5 rounded-full border border-[#C8951E]/30 bg-[#1A1410]/75 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#C8951E]">
          Le Fil de Kente
        </div>
      </div>

      <figcaption className="mt-2 flex min-h-[18px] items-center gap-1.5 text-[10.5px] text-muted-foreground">
        {thread && (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full border border-border" style={{ backgroundColor: thread.hex }} aria-hidden="true" />
            <span className="shrink-0 font-semibold" style={{ color: thread.hex }}>
              Fil {thread.name}
            </span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span className="truncate">{caption}</span>
      </figcaption>
    </figure>
  );
}
