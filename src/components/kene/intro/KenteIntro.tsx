"use client";
// Kènè — Fil de Kente : l'introduction immersive narrative au défilement.
// 3D = Lenis (défilement fluide) + progression rAF écrite dans une ref mutable
// (zéro re-render React) → canvas Intro3D + overlays HTML + rail de chapitres.
// Fallback statique (préférence reduced-motion ou WebGL indisponible) : mêmes
// chapitres en sections empilées, sans animation — accessibilité d'abord.
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Lenis from "lenis";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { KeneLogo } from "@/components/kene/icons";
import { useKene } from "@/store/kene";
import { CHAPTERS, chapterT, easeOut } from "./chapters";
import { markIntroDone } from "./introState";

const Intro3D = dynamic(() => import("./Intro3D"), { ssr: false, loading: () => null });

const POS_CLASS: Record<string, string> = {
  center: "inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center text-center px-6",
  "left-low": "left-5 right-5 bottom-[16%] text-left md:left-[8%] md:right-auto md:max-w-md md:bottom-[20%]",
  top: "inset-x-0 top-[14%] flex flex-col items-center text-center px-6",
  bottom: "inset-x-0 bottom-[11%] flex flex-col items-center text-center px-6",
  "right-low": "left-5 right-5 bottom-[15%] text-right md:right-[8%] md:left-auto md:max-w-md md:bottom-[20%]",
};

function Cta({ onClick, label = "Commencer mon histoire" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="pointer-events-auto mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#C8951E] px-8 font-heading font-bold text-[15px] text-[#1A1410] shadow-lg shadow-[#C8951E]/30 transition-all hover:brightness-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F8F1E4]"
    >
      <Sparkles size={17} />
      {label}
    </button>
  );
}

/* ───────────────────────── Version immersive 3D ───────────────────────── */

function ScrollIntro({ onDone }: { onDone: () => void }) {
  const containerRef = useRef<HTMLElement>(null);
  const progressRef = useRef<number>(0);
  const overlayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const lenis = new Lenis({ duration: 1.25, smoothWheel: true });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const total = Math.max(el.offsetHeight - window.innerHeight, 1);
        const p = Math.min(1, Math.max(0, -rect.top / total));
        progressRef.current = p;

        for (const o of overlayRefs.current) {
          if (!o) continue;
          const from = Number(o.dataset.from);
          const to = Number(o.dataset.to);
          const fi = Number(o.dataset.fadein ?? 0.3);
          const fo = Number(o.dataset.fadeout ?? 0.3);
          const t = chapterT(p, from, to, fi, fo);
          const visible = t.vis > 0.01;
          o.style.opacity = String(t.vis);
          o.style.transform = `translate3d(0, ${(1 - easeOut(t.inT)) * 42}px, 0)`;
          o.style.visibility = visible ? "visible" : "hidden";
        }
        CHAPTERS.forEach((ch, i) => {
          const d = dotRefs.current[i];
          if (!d) return;
          const active = p >= ch.from && p < ch.to + (i === CHAPTERS.length - 1 ? 0.2 : 0);
          d.style.backgroundColor = active ? "#C8951E" : "rgba(248,241,228,0.22)";
          d.style.transform = `scale(${active ? 1.6 : 1})`;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return (
    <section ref={containerRef} aria-label="Introduction immersive Kènè — six chapitres" className="relative h-[640vh]">
      <div className="sticky top-0 h-svh overflow-hidden bg-[#1A1410]">
        {/* Couche 3D (pointer-events none — le récit se défile, il ne se clique pas) */}
        <div className="absolute inset-0 pointer-events-none">
          <Intro3D progressRef={progressRef} />
        </div>

        {/* Vignettes de lisibilité */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#1A1410]/80 to-transparent pointer-events-none" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#1A1410]/85 to-transparent pointer-events-none" />

        {/* Passer l'introduction */}
        <button
          onClick={onDone}
          className="absolute right-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-[#F8F1E4]/20 bg-[#F8F1E4]/5 px-4 py-2 text-xs text-[#F8F1E4]/80 backdrop-blur transition-colors hover:bg-[#F8F1E4]/15 hover:text-[#F8F1E4] focus-visible:outline-2 focus-visible:outline-[#C8951E]"
        >
          <X size={13} /> Passer
        </button>

        {/* Rail de chapitres */}
        <nav aria-label="Chapitres de l'introduction" className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2.5">
          {CHAPTERS.map((ch, i) => (
            <button
              key={ch.id}
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              aria-label={ch.overline}
              title={ch.overline}
              onClick={onDone}
              className="h-1.5 w-1.5 rounded-full bg-[#F8F1E4]/22 transition-transform duration-300"
            />
          ))}
        </nav>

        {/* Overlays narratifs — vrai HTML (lecteurs d'écran, SEO) */}
        {CHAPTERS.map((ch, i) => (
          <div
            key={ch.id}
            ref={(el) => {
              overlayRefs.current[i] = el;
            }}
            data-from={ch.from}
            data-to={ch.to}
            data-fadein={i === 0 ? 0 : i === CHAPTERS.length - 1 ? 0.35 : 0.3}
            data-fadeout={i === CHAPTERS.length - 1 ? 0 : 0.3}
            className={`absolute z-10 pointer-events-none ${POS_CLASS[ch.pos]}`}
            style={{ opacity: 0, visibility: "hidden" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C8951E]">{ch.overline}</p>
            <h2 className="mt-3 font-heading font-black text-[28px] leading-[1.12] text-[#F8F1E4] sm:text-4xl">{ch.title}</h2>
            <p className="mt-3.5 max-w-md text-[13.5px] leading-relaxed text-[#F8F1E4]/72 sm:text-sm">{ch.sub}</p>

            {ch.id === "prologue" && (
              <>
                <div className="mt-6 opacity-90">
                  <KeneLogo size={46} withText />
                </div>
                <div className="mt-10 flex flex-col items-center gap-1.5 text-[#F8F1E4]/55">
                  <span className="text-[10.5px] uppercase tracking-[0.18em]">Défile pour tisser</span>
                  <ChevronDown size={17} className="animate-bounce" aria-hidden />
                </div>
              </>
            )}

            {ch.id === "jardin" && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[
                  ["Baobab", "force"],
                  ["Moringa", "éclat"],
                  ["Karité", "nutrition"],
                ].map(([n, v]) => (
                  <span key={n} className="rounded-full border border-[#F8F1E4]/18 bg-[#F8F1E4]/6 px-3.5 py-1.5 text-[12px] text-[#F8F1E4]/85">
                    {n} <span className="text-[#C8951E]">· {v}</span>
                  </span>
                ))}
              </div>
            )}

            {ch.id === "kente" && <Cta onClick={onDone} />}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── Version statique (reduced-motion / pas de WebGL) ───────────────────────── */

function StaticIntro({ onDone }: { onDone: () => void }) {
  return (
    <div className="bg-[#1A1410] text-[#F8F1E4]">
      <div className="mx-auto flex max-w-2xl flex-col">
        {CHAPTERS.map((ch) => (
          <section key={ch.id} className="flex min-h-svh flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C8951E]">{ch.overline}</p>
            <h2 className="mt-3 font-heading font-black text-3xl leading-tight">{ch.title}</h2>
            <p className="mt-4 text-sm leading-relaxed text-[#F8F1E4]/70">{ch.sub}</p>
            {ch.id === "prologue" && (
              <div className="mt-6">
                <KeneLogo size={52} withText />
              </div>
            )}
            {ch.id === "jardin" && (
              <div className="mt-5 flex flex-wrap justify-center gap-2 text-[12px]">
                <span className="rounded-full border border-[#F8F1E4]/18 px-3.5 py-1.5">Baobab · force</span>
                <span className="rounded-full border border-[#F8F1E4]/18 px-3.5 py-1.5">Moringa · éclat</span>
                <span className="rounded-full border border-[#F8F1E4]/18 px-3.5 py-1.5">Karité · nutrition</span>
              </div>
            )}
            {ch.id === "kente" && (
              <>
                <div aria-hidden className="kente-band-soft mt-6 h-2 w-40 rounded-full" />
                <Cta onClick={onDone} />
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Racine ───────────────────────── */

type IntroMode = "pending" | "3d" | "static";

let cachedMode: "3d" | "static" | null = null;

function computeMode(): "3d" | "static" {
  if (typeof window === "undefined") return "static"; // sécurité — jamais appelé côté serveur via getSnapshot
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static";
  if (window.location.hash === "#intro-static") return "static"; // QA : forcer le fallback statique
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return "static";
  } catch {
    return "static";
  }
  return "3d";
}

const getModeSnapshot = (): "3d" | "static" => {
  if (cachedMode === null) cachedMode = computeMode();
  return cachedMode;
};

const noopSubscribe = () => () => {};

export function KenteIntro() {
  // Décision client-only SANS setState dans un effet : useSyncExternalStore
  // (snapshot serveur « pending » → hydratation cohérente, correction post-hydratation).
  const mode = useSyncExternalStore<IntroMode>(noopSubscribe, getModeSnapshot, () => "pending");

  const finish = useCallback(() => {
    window.scrollTo(0, 0);
    markIntroDone();
  }, []);

  useEffect(() => {
    useKene.getState().setIntroActive(true);
    window.scrollTo(0, 0);
    return () => {
      useKene.getState().setIntroActive(false);
    };
  }, []);

  if (mode === "pending") return <div className="h-svh bg-[#1A1410]" aria-hidden />;
  if (mode === "static") return <StaticIntro onDone={finish} />;
  return <ScrollIntro onDone={finish} />;
}
