"use client";
// Kènè — Le Marché vivant (t. 83-c, vague 3) : le bandeau-marché qui coiffe
// la boutique. Version pleine : 4 échoppes 3D procédurales (scène séparée,
// chargée dynamiquement) — tap sur une échoppe → elle se soulève, le bandeau
// HTML nomme la famille de produits et la sélection glisse vers la grille
// (filtre réel du ShopScreen). Drag horizontal léger = pivot ±10°.
// Clair de Lune / reduced-motion (useLoomMode) : bande illustrée SVG
// (auvents stylisés + guirlande) avec les MÊMES 4 destinations cliquables —
// jamais de canvas, jamais de blocage : le catalogue reste 100 % accessible.
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Hand, Store } from "lucide-react";
import { useLoomMode } from "@/components/kene/loom/useLoomMode";
import { haptic, HAPTIC } from "@/lib/kene/ux";
import { cn } from "@/lib/utils";
import type { MarketRefs, MarketStallDef } from "./MarketScene";

const MarketScene = dynamic(() => import("./MarketScene"), { ssr: false, loading: () => null });

/* ───────────────────────── Les 4 échoppes = 4 filtres RÉELS du ShopScreen ─────────────────────────
   (Sérums / Crèmes / Huiles / Savons — gommages et masques restent dans les
   chips existantes). Les noms disent la famille, le tap pose le filtre exact. */

export const MARKET_STALLS: MarketStallDef[] = [
  { category: "serum", name: "Sérums rituels", color: "#8B1A3B" },
  { category: "creme", name: "Crèmes & soleil", color: "#F8F1E4" },
  { category: "huile", name: "Huiles & beurres", color: "#C8951E" },
  { category: "savon", name: "Savonnerie", color: "#3F7D3F" },
];

const DRAG_RANGE_PX = 140; // largeur de doigt pour parcourir ±10°

/* ───────────────────────── Fallback SVG (Clair de Lune) ───────────────────────── */

/** Auvent stylisé d'une échoppe — petit SVG inline (aucun asset). */
function StallAwning({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true" className="h-[44px] w-[64px]">
      {/* auvent trapèze + liserés */}
      <path d="M6 6 L58 6 L62 20 L2 20 Z" fill={color} opacity="0.92" />
      <path d="M6 6 L58 6 L62 20 L2 20 Z" fill="none" stroke="#241A10" strokeWidth="1" opacity="0.35" />
      { [16, 28, 40, 52].map((x) => (
        <line key={x} x1={x} y1={6} x2={x + 2} y2={20} stroke="#241A10" strokeWidth="2.4" opacity="0.18" />
      ))}
      {/* poteaux */}
      <rect x="8" y="20" width="3" height="22" rx="1" fill="#53341E" />
      <rect x="53" y="20" width="3" height="22" rx="1" fill="#53341E" />
      {/* ballots sur l'étal */}
      <rect x="16" y="32" width="14" height="8" rx="2" fill="#C8951E" opacity="0.85" />
      <rect x="34" y="32" width="14" height="8" rx="2" fill="#8B1A3B" opacity="0.85" />
      <rect x="22" y="24" width="12" height="7" rx="2" fill="#E07A2B" opacity="0.8" />
    </svg>
  );
}

/** La guirlande de lanternes — arc + points chauds (statique, décorative). */
function GarlandSvg() {
  return (
    <svg viewBox="0 0 400 34" preserveAspectRatio="none" aria-hidden="true" className="h-[34px] w-full">
      <path d="M-4 8 C 100 30, 300 30, 404 8" fill="none" stroke="#3A2A1A" strokeWidth="1.4" />
      { [0.1, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.94].map((t, i) => {
        const x = 400 * t;
        // hauteur le long de l'arc (approximation de la Bézier)
        const y = 8 + 22 * (4 * t * (1 - t)) + 3;
        return <circle key={i} cx={x} cy={y} r={3.4} fill={i % 2 ? "#E3B04B" : "#FFAE45"} opacity={0.9} />;
      })}
    </svg>
  );
}

function MarketStatic({ onStallTap }: { onStallTap: (index: number) => void }) {
  return (
    <div className="absolute inset-0">
      {/* ciel de fin d'après-midi */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_130%_at_50%_115%,#3A2A1A_0%,#241A10_62%,#1A1410_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_50%_60%,rgba(200,149,30,0.12),transparent_80%)]" />
      {/* guirlande tendue en haut du bandeau */}
      <div className="absolute inset-x-0 top-1 px-2">
        <GarlandSvg />
      </div>
      {/* les 4 échoppes cliquables */}
      <div className="absolute inset-x-3 top-[52px] grid grid-cols-4 gap-1.5">
        {MARKET_STALLS.map((s, i) => (
          <button
            key={s.category}
            type="button"
            onClick={() => onStallTap(i)}
            aria-label={`Visiter l'échoppe ${s.name} — voir les produits`}
            className="group flex flex-col items-center rounded-2xl border border-[#C8951E]/20 bg-[#1A1410]/60 px-1 pt-2 pb-1.5 text-center transition-colors hover:border-[#C8951E]/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C8951E]"
          >
            <StallAwning color={s.color} />
            <span className="mt-1.5 text-[9.5px] font-bold leading-tight text-[#F8F1E4]">{s.name}</span>
          </button>
        ))}
      </div>
      {/* sol de terre battue */}
      <div className="absolute inset-x-0 bottom-0 h-[38px] bg-gradient-to-b from-[#8D5524]/70 to-[#53341E]/80" />
    </div>
  );
}

/* ───────────────────────── Le bandeau Marché vivant ───────────────────────── */

export function MarcheVivant({ onSelectCategory }: { onSelectCategory: (category: string) => void }) {
  const mode = useLoomMode();
  const full = mode === "full";

  const [active, setActive] = useState(true); // IntersectionObserver → frameloop
  const [selected, setSelected] = useState<number | null>(null); // bandeau HTML
  const refs = useRef<MarketRefs>({ drag: { target: 0 }, selected: { index: -1 } });
  const stageRef = useRef<HTMLDivElement>(null);
  const dragInfo = useRef({ startX: 0, base: 0, dragging: false, moved: false });

  /* Rendu coupé hors écran (pattern LoomSection / KenteWeaveCard). */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => setActive(es[0]?.isIntersecting ?? false), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const handleStallTap = (index: number) => {
    if (dragInfo.current.moved) return; // c'était un drag, pas un tap
    refs.current.selected.index = index;
    setSelected(index >= 0 ? index : null);
    if (index >= 0) {
      haptic(HAPTIC.tap);
      onSelectCategory(MARKET_STALLS[index].category);
    }
  };

  /* Drag horizontal léger : ±10° — désactivé hors mode plein. Le scroll
     vertical reste au page (touch-action: pan-y). */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!full) return;
    dragInfo.current = { startX: e.clientX, base: refs.current.drag.target, dragging: true, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!full || !dragInfo.current.dragging) return;
    const dx = e.clientX - dragInfo.current.startX;
    if (Math.abs(dx) > 8) dragInfo.current.moved = true;
    const w = stageRef.current?.clientWidth || DRAG_RANGE_PX;
    const unit = Math.max(w / 3, DRAG_RANGE_PX);
    refs.current.drag.target = Math.min(1, Math.max(-1, dragInfo.current.base + dx / unit));
  };
  const onPointerUp = () => {
    dragInfo.current.dragging = false;
    window.setTimeout(() => {
      dragInfo.current.moved = false; // le flag ne survit qu'au geste en cours
    }, 60);
  };

  const sel = selected != null ? MARKET_STALLS[selected] : null;

  return (
    <section aria-label="Le Marché vivant — choisis une échoppe pour découvrir une famille de soins" className="relative mt-4">
      <div
        ref={stageRef}
        className={cn(
          "relative h-[280px] overflow-hidden rounded-[26px] border border-border shadow-md select-none sm:h-[300px]",
          full && "touch-pan-y cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {full ? <MarketScene stalls={MARKET_STALLS} refs={refs} onStallTap={handleStallTap} active={active} /> : <MarketStatic onStallTap={handleStallTap} />}

        {/* Titre HTML superposé (au-dessus du canvas, jamais bloqué par lui) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4">
          <div className="inline-flex flex-col rounded-2xl">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#E3B04B]">La boutique Kènè</p>
            <h2 className="font-heading font-black text-[20px] leading-tight text-[#F8F1E4] drop-shadow-[0_2px_8px_rgba(26,20,16,0.8)]">
              Le Marché vivant
            </h2>
            <p className="mt-0.5 text-[11px] font-medium text-[#F8F1E4]/80 drop-shadow-[0_1px_4px_rgba(26,20,16,0.9)]">
              Touche une échoppe {full ? "· glisse pour pivoter" : ""}
            </p>
          </div>
        </div>

        {/* Affordance drag (plein mode seulement, discret) */}
        {full && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-[#F8F1E4]/15 bg-[#1A1410]/70 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F8F1E4]/70">
            <Hand size={11} aria-hidden="true" /> Glisser
          </div>
        )}

        {/* Bandeau du bas : la famille de produits sélectionnée (ou l'invite) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={sel ? sel.category : "invite"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto flex max-w-[380px] items-center gap-2.5 rounded-2xl border border-[#C8951E]/30 bg-[#1A1410]/85 px-3.5 py-2.5 backdrop-blur-[2px]"
            >
              {sel ? (
                <>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#C8951E]/15 text-[#E3B04B]">
                    <Store size={15} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[#F8F1E4]">{sel.name}</span>
                    <span className="block text-[10px] text-[#F8F1E4]/65">La sélection descend vers toi…</span>
                  </span>
                  <ChevronDown size={16} className="shrink-0 text-[#E3B04B]" aria-hidden="true" />
                </>
              ) : (
                <span className="flex w-full items-center justify-center gap-1.5 text-[10.5px] font-medium text-[#F8F1E4]/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E3B04B]" aria-hidden="true" />
                  Quatre échoppes t&apos;attendent — touche la tienne
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
