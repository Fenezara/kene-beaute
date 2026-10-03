"use client";

// Kènè — Curseur Comparatif Interactif Avant / Après (Split-Slider)
// Permet de superposer et comparer deux diagnostics dans le temps (J0 vs J30/J60)
// avec un séparateur tactile fluide et bascule multi-spectrale (Porphyrines & Sébum).

import { useState, useRef, useCallback, useEffect } from "react";
import { Sparkles, Eye, Columns, Split, ArrowLeftRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { scoreVar } from "@/lib/kene/format";

export interface DiagFrameInfo {
  imageUrl: string;
  label?: string;
  date?: string;
  score?: number;
}

export interface BeforeAfterSliderProps {
  /** Mode objet structuré */
  before?: DiagFrameInfo;
  after?: DiagFrameInfo;
  showSpectralUvToggle?: boolean;

  /** Mode attributs directs (rétrocompatibilité) */
  beforePhoto?: string;
  afterPhoto?: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeScore?: number;
  afterScore?: number;
  beforeDate?: string;
  afterDate?: string;
  zoneLabel?: string;
  className?: string;
}

export function BeforeAfterSlider({
  before,
  after,
  showSpectralUvToggle = true,
  beforePhoto: flatBeforePhoto,
  afterPhoto: flatAfterPhoto,
  beforeLabel: flatBeforeLabel,
  afterLabel: flatAfterLabel,
  beforeScore: flatBeforeScore,
  afterScore: flatAfterScore,
  beforeDate: flatBeforeDate,
  afterDate: flatAfterDate,
  zoneLabel,
  className,
}: BeforeAfterSliderProps) {
  const beforePhoto = before?.imageUrl ?? flatBeforePhoto ?? "";
  const afterPhoto = after?.imageUrl ?? flatAfterPhoto ?? "";
  const beforeLabel = before?.label ?? flatBeforeLabel ?? "Avant (J0)";
  const afterLabel = after?.label ?? flatAfterLabel ?? "Après (J30)";
  const beforeScore = before?.score ?? flatBeforeScore;
  const afterScore = after?.score ?? flatAfterScore;
  const beforeDate = before?.date ?? flatBeforeDate;
  const afterDate = after?.date ?? flatAfterDate;
  const [sliderPos, setSliderPos] = useState(50); // Pourcentage 0..100
  const [isDragging, setIsDragging] = useState(false);
  const [spectralMode, setSpectralMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"slider" | "side">("slider");
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX);
    }
  }, [handleMove]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleMove(e.clientX);
      }
    };
    const onMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, handleMove]);

  const scoreDiff = afterScore && beforeScore ? afterScore - beforeScore : null;
  const spectralFilter = "invert(0.85) hue-rotate(190deg) contrast(1.7) saturate(1.5)";

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3", className)}>
      {/* En-tête des contrôles */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center size-7 rounded-xl bg-gold/15 text-gold-text">
            <ArrowLeftRight className="size-4" />
          </span>
          <div>
            <h4 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
              Comparatif Évolutif Avant / Après
              {zoneLabel && <span className="text-xs font-normal text-muted-foreground capitalize">({zoneLabel})</span>}
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Glissez le curseur pour apprécier l&apos;atténuation des imperfections
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {scoreDiff !== null && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-mono font-bold px-2 py-0.5",
                scoreDiff >= 0
                  ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/30"
              )}
            >
              <TrendingUp className="size-3 mr-1 inline" />
              {scoreDiff >= 0 ? `+${scoreDiff} pts` : `${scoreDiff} pts`}
            </Badge>
          )}

          {showSpectralUvToggle && (
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "h-8 px-2 text-xs gap-1 rounded-lg",
                spectralMode && "bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold"
              )}
              onClick={() => setSpectralMode(!spectralMode)}
              title="Activer la fluorescence UV (Porphyrines & Sébum)"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden sm:inline">Vue UV</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs gap-1 rounded-lg"
            onClick={() => setLayoutMode(layoutMode === "slider" ? "side" : "slider")}
            title="Basculer entre le curseur glissant et la vue côte à côte"
          >
            {layoutMode === "slider" ? <Columns className="size-3.5" /> : <Split className="size-3.5" />}
            <span className="hidden sm:inline">{layoutMode === "slider" ? "Côte à côte" : "Curseur"}</span>
          </Button>
        </div>
      </div>

      {/* Rendu Mode Curseur (Split-Slider) */}
      {layoutMode === "slider" ? (
        <div
          ref={containerRef}
          onMouseDown={() => setIsDragging(true)}
          onTouchMove={onTouchMove}
          className="relative aspect-square sm:aspect-[4/3] w-full max-h-[460px] overflow-hidden rounded-xl border border-border select-none cursor-ew-resize bg-black/95 shadow-inner"
        >
          {/* Image « Après » (en fond, à droite) */}
          <div className="absolute inset-0 size-full">
            <img
              src={afterPhoto}
              alt={afterLabel}
              style={{ filter: spectralMode ? spectralFilter : "none" }}
              className="size-full object-cover"
            />
            {/* Badge flottant Après */}
            <div className="absolute top-3 right-3 rounded-lg bg-black/75 backdrop-blur-md px-2.5 py-1 text-right border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/90 block">
                {afterLabel}
              </span>
              <div className="flex items-center justify-end gap-1.5">
                {afterDate && <span className="text-[9px] text-white/60 font-mono">{afterDate}</span>}
                {afterScore !== undefined && (
                  <span className="text-xs font-bold font-mono" style={{ color: scoreVar(afterScore) }}>
                    {afterScore}/100
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Image « Avant » (au-dessus, découpée à gauche) */}
          <div
            className="absolute inset-0 size-full overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <img
              src={beforePhoto}
              alt={beforeLabel}
              style={{ filter: spectralMode ? spectralFilter : "none" }}
              className="absolute inset-0 size-full object-cover"
            />
            {/* Badge flottant Avant */}
            <div className="absolute top-3 left-3 rounded-lg bg-black/75 backdrop-blur-md px-2.5 py-1 text-left border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/90 block">
                {beforeLabel}
              </span>
              <div className="flex items-center gap-1.5">
                {beforeScore !== undefined && (
                  <span className="text-xs font-bold font-mono" style={{ color: scoreVar(beforeScore) }}>
                    {beforeScore}/100
                  </span>
                )}
                {beforeDate && <span className="text-[9px] text-white/60 font-mono">{beforeDate}</span>}
              </div>
            </div>
          </div>

          {/* Ligne séparatrice et curseur de contrôle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.85)] z-20 pointer-events-none"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-9 rounded-full bg-white text-black shadow-xl flex items-center justify-center border-2 border-primary ring-4 ring-black/40 pointer-events-auto cursor-ew-resize active:scale-110 transition-transform">
              <ArrowLeftRight className="size-4 text-foreground" />
            </div>
          </div>

          {/* Indicateur de fluorescence si actif */}
          {spectralMode && (
            <div className="absolute bottom-3 inset-x-3 rounded-lg bg-black/85 backdrop-blur-md p-2 border border-blue-500/30 flex items-center justify-between text-[11px] text-blue-300 pointer-events-none z-10">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="size-2 rounded-full bg-blue-400 animate-pulse" />
                Mode Fluorométrie UV 405nm
              </span>
              <span className="text-[10px] text-muted-foreground">Porphyrines C. acnes & Film sébacé</span>
            </div>
          )}
        </div>
      ) : (
        /* Rendu Mode Côte à Côte */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative aspect-square rounded-xl overflow-hidden border border-border bg-black/90">
            <img
              src={beforePhoto}
              alt={beforeLabel}
              style={{ filter: spectralMode ? spectralFilter : "none" }}
              className="size-full object-cover"
            />
            <div className="absolute top-2 left-2 rounded-lg bg-black/75 px-2.5 py-1 text-left border border-white/10">
              <p className="text-[10px] font-bold text-white uppercase">{beforeLabel}</p>
              {beforeScore !== undefined && (
                <p className="text-xs font-mono font-bold" style={{ color: scoreVar(beforeScore) }}>
                  Score: {beforeScore}/100
                </p>
              )}
            </div>
          </div>

          <div className="relative aspect-square rounded-xl overflow-hidden border border-border bg-black/90">
            <img
              src={afterPhoto}
              alt={afterLabel}
              style={{ filter: spectralMode ? spectralFilter : "none" }}
              className="size-full object-cover"
            />
            <div className="absolute top-2 right-2 rounded-lg bg-black/75 px-2.5 py-1 text-right border border-white/10">
              <p className="text-[10px] font-bold text-white uppercase">{afterLabel}</p>
              {afterScore !== undefined && (
                <p className="text-xs font-mono font-bold" style={{ color: scoreVar(afterScore) }}>
                  Score: {afterScore}/100
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
