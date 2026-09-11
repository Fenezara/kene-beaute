"use client";
// Kènè — Le métier à tisser du Seuil (t. 82, vague 1) : wrapper de la Navette
// d'Or. Section collante (~1,9 écran, raccourcie au retour) dans laquelle le
// scroll pilote le tissage 3D + les légendes HTML (accessibles aux lecteurs
// d'écran). Rendu coupé hors écran (IntersectionObserver → frameloop).
// Mode Clair de Lune (reduced-motion / 2G / saveData / pas de WebGL) : la
// bande de fils SVG d'origine (t. 74) reste — élégante, statique, zéro coût.
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useLoomMode } from "./useLoomMode";

const GoldenLoom = dynamic(() => import("./GoldenLoom"), { ssr: false, loading: () => null });

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ───────────────────────── Fils de kente vivants (fallback Clair de Lune) ─────────────────────────
   Repris tels quels de t. 74 : 3 courbes Bézier qui se dessinent, respirent,
   parallaxe pointeur douce sur desktop. */
const THREADS = [
  { d: "M -20 62 C 120 18, 260 108, 430 66", stroke: "#C8951E", w: 2 },
  { d: "M -20 132 C 140 92, 250 168, 430 122", stroke: "#A0522D", w: 1.6 },
  { d: "M -20 202 C 110 162, 280 228, 430 188", stroke: "#8B1A3B", w: 1.6 },
];

function KenteThreads({ first }: { first: boolean }) {
  const parallax = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => {
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
  }, []);

  return (
    <div ref={parallax} className="pointer-events-none absolute inset-0 transition-transform duration-500 ease-out" aria-hidden="true">
      <svg viewBox="0 0 400 240" preserveAspectRatio="none" className="h-full w-full">
        {THREADS.map((t, i) => (
          <motion.path
            key={i}
            d={t.d}
            fill="none"
            stroke={t.stroke}
            strokeWidth={t.w}
            strokeLinecap="round"
            opacity={0.45}
            initial={{ pathLength: 0 }}
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
              r={3.2}
              fill={t.stroke}
              initial={{ opacity: 0, scale: 0 }}
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

  // Clair de Lune (et phase « pending » d'hydratation) : la bande SVG t. 74.
  if (mode !== "full") {
    return (
      <div className="relative mt-5 h-[56px] sm:h-[64px]" aria-hidden="true">
        <KenteThreads first={first} />
      </div>
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
