"use client";
// Kènè — Le métier à tisser du Seuil (t. 82, vague 1) : wrapper de la Navette
// d'Or. Section collante (~1,9 écran, raccourcie au retour) dans laquelle le
// scroll pilote le tissage 3D + les légendes HTML (accessibles aux lecteurs
// d'écran). Rendu coupé hors écran (IntersectionObserver → frameloop).
// Mode Clair de Lune (reduced-motion / 2G / saveData / pas de WebGL) : la
// bande de fils SVG d'origine (t. 74) reste — élégante, statique, zéro coût.
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useLoomMode } from "./useLoomMode";

const GoldenLoom = dynamic(() => import("./GoldenLoom"), { ssr: false, loading: () => null });

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ───────────────────────── Fils de kente vivants (fallback Clair de Lune) ─────────────────────────
   3 courbes Bézier or/terre/bissap qui se dessinent + perles aux extrémités,
   parallaxe pointeur douce sur desktop (désactivée en reduced-motion).
   t. 115 : les fils courent dans le HAUT de la bande (viewBox 400×150) pour
   laisser le message du chapitre respirer en bas — plus de « 3 traits perdus ». */
const THREADS = [
  { d: "M -20 34 C 110 6, 250 66, 396 26", stroke: "#C8951E", w: 2.4 },
  { d: "M -20 62 C 140 30, 240 96, 396 52", stroke: "#A0522D", w: 2 },
  { d: "M -20 92 C 120 58, 280 118, 396 80", stroke: "#8B1A3B", w: 2 },
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
        el.style.transform = `translate(${nx * 10}px, ${ny * 8}px)`;
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
      <svg viewBox="0 0 400 150" preserveAspectRatio="none" className="h-full w-full">
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
              r={3.6}
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

/* ───────────────────────── Légendes du tissage (vrai HTML) ─────────────────────────
   Opacités/translations pilotées par la même boucle rAF que la 3D — zéro
   re-render React, visibilité hidden quand inactives (lecteurs d'écran et
   focus ne tombent jamais sur du contenu invisible : rien n'est focusable). */

const CAPTIONS = [
  {
    from: 0.04,
    to: 0.34,
    overline: "La Navette d'Or",
    title: "Chaque geste est un fil",
    sub: "Chaque scan, chaque soin, chaque partage tisse ton histoire — un pagne unique, le tien.",
    pos: "left",
  },
  {
    from: 0.38,
    to: 0.66,
    overline: "Le tissage",
    title: "Ton pagne prend forme",
    sub: "La navette croise la trame : les diagnostics posent la chaîne, les rituels tirent les fils d'or.",
    pos: "right",
  },
  {
    from: 0.74,
    to: 0.99,
    overline: "Le sceau",
    title: "Ton médaillon se révèle",
    sub: "Derrière le rideau : le sceau de ton parcours, tissé par tes propres actions.",
    pos: "center",
  },
] as const;

const POS_CLASS: Record<string, string> = {
  left: "left-5 right-5 bottom-[18%] text-left sm:left-[7%] sm:right-auto sm:max-w-[300px]",
  right: "left-5 right-5 bottom-[18%] text-right sm:right-[7%] sm:left-auto sm:max-w-[300px]",
  center: "inset-x-5 bottom-[24%] flex flex-col items-center text-center sm:inset-x-10",
};

export function LoomSection({ first }: { first: boolean }) {
  const mode = useLoomMode();
  const sectionRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<number>(0);
  const captionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hintRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Hauteur du chapitre : première visite = cinéma complet (~1,9 écran) ;
  // au retour on raccourcit (~1,2 écran) — l'entrée reste vive.
  const vh = first ? 190 : 120;

  useEffect(() => {
    if (mode !== "full") return;
    const section = sectionRef.current;
    if (!section) return;

    // Rendu uniquement à l'écran (budget GPU : zéro frame hors viewport)
    const io = new IntersectionObserver((entries) => setActive(entries[0]?.isIntersecting ?? false), { threshold: 0.02 });
    io.observe(section);

    let raf = 0;
    // Haptique de la navette (t. 83-f) : le passage du rideau (p ≈ 0,42) et
    // l'apparition du médaillon (p ≈ 0,85) vibrent doucement (no-op iOS) ;
    // remontée sous 0,3 → les signaux redeviennent armables.
    let lastBeacon = 0;
    const loop = () => {
      const rect = section.getBoundingClientRect();
      const total = Math.max(rect.height - window.innerHeight, 1);
      const p = Math.min(1, Math.max(0, -rect.top / total));
      progressRef.current = p;
      if (p >= 0.42 && lastBeacon < 1) { lastBeacon = 1; haptic(HAPTIC.light); }
      if (p >= 0.85 && lastBeacon < 2) { lastBeacon = 2; haptic(HAPTIC.medium); }
      if (p < 0.3 && lastBeacon > 0) lastBeacon = 0;
      for (const c of captionRefs.current) {
        if (!c) continue;
        const from = Number(c.dataset.from);
        const to = Number(c.dataset.to);
        const span = to - from;
        const vis = Math.min(1, Math.max(0, Math.min((p - from) / (span * 0.42), (to - p) / (span * 0.42))));
        c.style.opacity = String(vis);
        c.style.transform = `translate3d(0, ${(1 - vis) * 26}px, 0)`;
        c.style.visibility = vis > 0.02 ? "visible" : "hidden";
      }
      // L'invite au défilement s'efface dès que la utilisatrice a compris
      // (p > 0.1) — elle ne reste pas affichée sur le médaillon final.
      if (hintRef.current) {
        hintRef.current.style.opacity = String(clamp01(1 - (p - 0.04) * 12));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [mode]);

  // Clair de Lune (et phase « pending » d'hydratation) : la bande tissée
  // t. 115 — même langage que la carte kente de la boutique (fond atelier +
  // armure + fils d'or) PLEIN CADRE, avec le message condensé du chapitre.
  // Fini les « 3 traits perdus » qui faisaient croire à une page cassée : la
  // variante statique raconte aussi l'histoire, élégamment, zéro coût GPU.
  if (mode !== "full") {
    return (
      <section aria-label="Le tissage — chaque geste est un fil" className="relative mt-4">
        <div className="relative mx-4 h-[150px] overflow-hidden rounded-[26px] border border-border shadow-md sm:mx-6 sm:h-[170px]">
          {/* fond mélanine « atelier du tisserand » */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_130%_at_50%_115%,#3A2A1A_0%,#241A10_62%,#1A1410_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_50%_40%,rgba(200,149,30,0.12),transparent_80%)]" />
          {/* trame kente douce */}
          <div className="absolute inset-0 kente-band-soft opacity-90" />
          {/* armure : croisures horizontales or + verticales sombres */}
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
          <div className="absolute left-3 top-2.5 rounded-full border border-[#C8951E]/30 bg-[#1A1410]/75 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#C8951E]">
            La Navette d&apos;Or
          </div>
          {/* message condensé du chapitre (vrai HTML, lisible par tous) */}
          <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
            <p className="font-heading font-black text-[17px] leading-tight text-[#F8F1E4] drop-shadow-[0_2px_8px_rgba(26,20,16,0.85)] sm:text-[19px]">
              Chaque geste est un fil
            </p>
            <p className="mt-1 max-w-[54ch] text-[11px] leading-snug text-[#F8F1E4]/75 drop-shadow-[0_1px_4px_rgba(26,20,16,0.9)]">
              Chaque scan, chaque soin, chaque partage tisse ton histoire — un pagne unique, le tien.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} aria-label="Le tissage — chaque geste est un fil" className="relative mt-4" style={{ height: `${vh}vh` }}>
      <div className="sticky top-0 h-svh overflow-hidden">
        {/* Lueur du métier — fond radial dédié (la toile est transparente) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(64% 52% at 50% 46%, color-mix(in srgb, #C8951E 14%, transparent) 0%, transparent 68%), radial-gradient(46% 40% at 18% 78%, color-mix(in srgb, #A0522D 10%, transparent) 0%, transparent 70%), radial-gradient(40% 36% at 84% 22%, color-mix(in srgb, #8B1A3B 8%, transparent) 0%, transparent 72%)",
          }}
        />

        {/* Couche 3D — décorative, jamais bloquante (pointer-events none) */}
        <div className="pointer-events-none absolute inset-0">
          <GoldenLoom progressRef={progressRef} active={active} />
        </div>

        {/* Légendes tissées — vrai HTML (lecteurs d'écran). (t. 94) voile de
            lecture translucide + blur léger : les fils 3D ne croisent plus
            visuellement le texte (superposition lisibile, mobile compris). */}
        {CAPTIONS.map((c, i) => (
          <div
            key={c.overline}
            ref={(el) => {
              captionRefs.current[i] = el;
            }}
            data-from={c.from}
            data-to={c.to}
            className={`pointer-events-none absolute z-10 ${POS_CLASS[c.pos]}`}
            style={{ opacity: 0, visibility: "hidden" }}
          >
            <div className="relative max-w-[360px] rounded-[20px] bg-background/68 px-4 py-3.5 shadow-[0_10px_32px_-16px_rgba(20,14,8,0.4)] ring-1 ring-foreground/8 backdrop-blur-[3px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C8951E]">{c.overline}</p>
              <h2 className="mt-2 font-heading font-black text-[24px] leading-[1.12] text-foreground sm:text-[28px]">{c.title}</h2>
              <p className="mt-2.5 max-w-[38ch] text-[12.5px] leading-relaxed text-muted-foreground">{c.sub}</p>
            </div>
          </div>
        ))}

        {/* Invitation au défilement (début du chapitre) — pilotée par la
            boucle rAF : s'efface dès les premiers millimètres de scroll */}
        <div
          ref={hintRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1 text-muted-foreground"
        >
          <span className="text-[10px] uppercase tracking-[0.2em]">Défile pour tisser</span>
          <motion.span animate={{ y: [0, 5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
            <ChevronDown size={16} />
          </motion.span>
        </div>
      </div>
    </section>
  );
}
