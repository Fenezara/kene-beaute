"use client";
// Kènè — Le fil conducteur d'or (t. 82, vague 1) : le fil qui RELIE les
// sections du fil d'accueil. Entre chaque grand bloc du feed, un diviseur
// tissé : deux courbes (or + terre) qui se dessinent quand elles entrent à
// l'écran (IntersectionObserver + transition stroke-dashoffset — léger, zéro
// rAF permanent), une perle qui se pose au centre, et un libellé narratif.
// prefers-reduced-motion : fil déjà tissé, perle posée, transitions OFF.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const PATH_MAIN = "M2 14 C 70 4, 130 24, 180 12 S 260 16, 298 12";
const PATH_SOIL = "M2 20 C 80 12, 140 28, 200 18 S 265 22, 298 18";

export function WovenDivider({
  label,
  className,
}: {
  /** Libellé narratif du segment (ex. « Ton score se tisse ») — optionnel. */
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // reduced-motion ou très vieux navigateur sans IO : fil déjà tissé.
    if (reduce || typeof IntersectionObserver === "undefined") {
      // rAF (asynchrone) — jamais de setState synchrone dans l'effet.
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          io.disconnect(); // on ne se dessine qu'une fois — le fil reste tendu
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  // Longueur de tracé approximative des courbes (≈ 310–320 unités viewBox)
  const dashOffset = inView ? 0 : 320;
  const draw = reduce ? "none" : "stroke-dashoffset 1.05s cubic-bezier(0.22,1,0.36,1)";

  return (
    <div
      ref={ref}
      aria-hidden={label ? undefined : "true"}
      className={cn("relative mx-1 select-none", className)}
    >
      <svg viewBox="0 0 300 26" preserveAspectRatio="none" className="h-[26px] w-full overflow-visible">
        {/* Fil de terre — l'ombre du fil d'or, dessiné en second */}
        <path
          d={PATH_SOIL}
          fill="none"
          stroke="#A0522D"
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.35}
          style={{ strokeDasharray: 320, strokeDashoffset: dashOffset, transition: draw }}
        />
        {/* Fil d'or — le conducteur */}
        <path
          d={PATH_MAIN}
          fill="none"
          stroke="#C8951E"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.75}
          style={{ strokeDasharray: 320, strokeDashoffset: dashOffset, transition: draw }}
        />
      </svg>
      {/* Perle du nœud — se pose quand le fil est tendu */}
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C8951E] ring-2 ring-background shadow-[0_0_10px_rgba(200,149,30,0.5)]"
        style={{
          width: 7,
          height: 7,
          transition: reduce ? "none" : "transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.9s, opacity 0.4s 0.9s",
          transform: `translate(-50%, -50%) scale(${inView ? 1 : 0})`,
          opacity: inView ? 1 : 0,
        }}
      />
      {label && (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[38px] whitespace-nowrap rounded-full k-chip px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-primary"
          style={{
            transition: reduce ? "none" : "opacity 0.6s 1.05s",
            opacity: inView ? 1 : 0,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
