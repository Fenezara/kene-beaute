"use client";
// Kènè — La bande tissée du Seuil: le chapitre « La Navette
// d'Or » vit dans une bande compacte pleine largeur (~92-110 px), identique
// dans les DEUX modes (3D et Clair de Lune) — la landing tient désormais sur
// UNE seule page (demande fondatrice: « la landing page ne tient plus
// sur une seule page »). Les fils d'or animés + le message du chapitre
// racontent toujours le pagne; le métier à tisser 3D scrollé (,
// ~1,9 écran sticky) est retiré de la porte d'entrée — GoldenLoom.tsx reste
// sur disque (inerte, convention projet, comme market/* en).
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

/* ───────────────────────── Fils de kente vivants ─────────────────────────
 3 courbes Bézier or/terre/bissap qui se dessinent + perles aux extrémités,
 parallaxe pointeur douce sur desktop (désactivée en reduced-motion).: tracés aplatis (viewBox 400×96) taillés pour la bande compacte —
 ils courent derrière le message comme la trame derrière le tissage. */
const THREADS = [
  { d: "M -20 24 C 110 4, 250 46, 396 16", stroke: "#C8951E", w: 2.2 },
  { d: "M -20 44 C 140 20, 240 64, 396 36", stroke: "#A0522D", w: 1.8 },
  { d: "M -20 64 C 120 38, 280 78, 396 54", stroke: "#8B1A3B", w: 1.8 },
];

function KenteThreads({ first }: { first: boolean }) {
  const parallax = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return; // pas de parallaxe en mouvement réduit
    const zone = parallax.current?.parentElement;
    if (!zone) return;
    const onMove = (e: MouseEvent) => {
      if (raf.current) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = 0;
        const el = parallax.current;
        if (!el) return;
        const r = zone.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `translate(${nx * 8}px, ${ny * 6}px)`;
      });
    };
    zone.addEventListener("mousemove", onMove);
    return () => {
      zone.removeEventListener("mousemove", onMove);
      if (raf.current) window.cancelAnimationFrame(raf.current);
    };
  }, [reduced]);

  return (
    <div ref={parallax} className="pointer-events-none absolute inset-0 transition-transform duration-500 ease-out" aria-hidden="true">
      <svg viewBox="0 0 400 96" preserveAspectRatio="none" className="h-full w-full">
        {THREADS.map((t, i) => (
          <motion.path
            key={i}
            d={t.d}
            fill="none"
            stroke={t.stroke}
            strokeWidth={t.w}
            strokeLinecap="round"
            opacity={0.55}
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: first ? 1.1 : 0.5, delay: (first ? 0.15 : 0) + i * 0.16, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        {THREADS.map((t, i) => {
          const m = / ([\d.]+) ([\d.]+)$/.exec(t.d);
          if (!m) return null;
          return (
            <motion.circle
              key={`n${i}`}
              cx={parseFloat(m[1])}
              cy={parseFloat(m[2])}
              r={3.4}
              fill={t.stroke}
              initial={{ opacity: reduced ? 0.9 : 0, scale: reduced ? 1 : 0 }}
              animate={{ opacity: 0.9, scale: 1 }}
              transition={{ delay: (first ? 1 : 0.4) + i * 0.16, type: "spring", stiffness: 300, damping: 18 }}
            />
          );
        })}
      </svg>
    </div>
  );
}

/* ───────────────────────── La bande tissée compacte ─────────────────────────
 Même langage visuel que la carte kente de la boutique (fond atelier +
 armure + fils d'or) — l'a validée au VLM, la rend compacte:
 badge chapitre en haut, message du chapitre en bas, fils vivants derrière. */
export function LoomSection({ first }: { first: boolean }) {
  return (
    <section aria-label="Le tissage — chaque geste est un fil" className="relative mt-3">
      <div className="relative mx-4 h-[92px] overflow-hidden rounded-[22px] border border-border shadow-md sm:mx-6 sm:h-[104px]">
        {/* fond mélanine « atelier du tisserand » */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_130%_at_50%_115%,#3A2A1A_0%,#241A10_62%,#1A1410_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_50%_40%,rgba(200,149,30,0.12),transparent_80%)]" />
        {/* trame kente douce */}
        <div className="absolute inset-0 kente-band-soft opacity-90" />
        {/* armure: croisures horizontales or + verticales sombres */}
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(26,20,16,0.35) 0 2px, transparent 2px 10px), repeating-linear-gradient(90deg, rgba(200,149,30,0.26) 0 2px, transparent 2px 18px)",
          }}
        />
        {/* les fils d'or vivants + perles */}
        <KenteThreads first={first} />
        {/* badge chapitre */}
        <div className="absolute left-3 top-2 rounded-full border border-[#C8951E]/30 bg-[#1A1410]/75 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#C8951E]">
          La Navette d&apos;Or
        </div>
        {/* message du chapitre (vrai HTML, lisible par tous) */}
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-3.5">
          <p className="font-heading font-black text-[14px] leading-tight text-[#F8F1E4] drop-shadow-[0_2px_8px_rgba(26,20,16,0.85)] sm:text-[15.5px]">
            Chaque geste est un fil
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-[#F8F1E4]/75 drop-shadow-[0_1px_4px_rgba(26,20,16,0.9)] sm:text-[10.5px]">
            Chaque scan, chaque soin, chaque partage tisse ton histoire — un pagne unique, le tien.
          </p>
        </div>
      </div>
    </section>
  );
}
