"use client";

import { useMemo, useState } from "react";
import { Eye, Layers, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPECTRAL_VIEWS, type ZoneMark } from "@/lib/kene/types";

interface SpectralViewerProps {
  photo: string;
  zoneMarks?: ZoneMark[];
  zoneLabel: string;
}

type SpectralMode = (typeof SPECTRAL_VIEWS)[number]["id"];

const SPECTRAL_STYLES: Record<SpectralMode, { filter: string; label: string; desc: string; tone: string }> = {
  standard: {
    filter: "none",
    label: "Lumière Standard",
    desc: "Aspect visuel de surface en lumière naturelle.",
    tone: "bg-muted text-muted-foreground",
  },
  pigment: {
    filter: "contrast(1.4) saturate(1.8) hue-rotate(-15deg) brightness(0.92)",
    label: "Pigmentation & Mélanine",
    desc: "Révélation des taches PIH, amas de mélanine et melasma profond.",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  inflammation: {
    filter: "contrast(1.6) hue-rotate(140deg) saturate(2.2)",
    label: "Inflammation & Réactivité",
    desc: "Mise en évidence de l'érythème, chaleur vasculaire et irritations.",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  acne: {
    filter: "invert(0.85) hue-rotate(190deg) contrast(1.7) saturate(1.5)",
    label: "Porphyrines & Sébum",
    desc: "Cartographie des zones comédogènes, pores dilatés et film sébacé.",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
};

export function SpectralViewer({ photo, zoneMarks = [], zoneLabel }: SpectralViewerProps) {
  const [activeMode, setActiveMode] = useState<SpectralMode>("standard");
  const [showMarks, setShowMarks] = useState(true);
  const [zoom, setZoom] = useState(false);

  const photoList = useMemo(() => {
    if (!photo) return [];
    if (photo.startsWith("[")) {
      try {
        const parsed = JSON.parse(photo);
        if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
      } catch {
        // ignore
      }
    }
    return [photo];
  }, [photo]);

  const [photoIdx, setPhotoIdx] = useState(0);
  const activePhoto = photoList[photoIdx] || photoList[0] || photo;

  const currentDef = SPECTRAL_STYLES[activeMode];

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-3.5 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center size-7 rounded-xl bg-gold/15 text-gold-text">
            <Layers className="size-4" />
          </span>
          <div>
            <h4 className="font-heading font-bold text-sm text-foreground">
              Analyse Multi-Spectrale en Cabine
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Observation clinique de la zone {zoneLabel} sous 4 longueurs d&apos;onde optiques
            </p>
          </div>
        </div>

        {/* Commandes zoom & affichage repères */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {zoneMarks.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMarks(!showMarks)}
              className={cn(
                "px-2 py-1 rounded-lg text-[10.5px] font-semibold border transition-colors flex items-center gap-1",
                showMarks
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted border-border text-muted-foreground"
              )}
            >
              <Eye className="size-3" />
              <span>{showMarks ? "Repères ON" : "Repères OFF"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setZoom(!zoom)}
            className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-muted hover:bg-muted/80 border border-border text-foreground flex items-center gap-1 transition-colors"
          >
            {zoom ? <ZoomOut className="size-3" /> : <ZoomIn className="size-3" />}
            <span>{zoom ? "Aperçu" : "Zoom cabine"}</span>
          </button>
        </div>
      </div>

      {/* Boutons sélecteurs de filtre spectral */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {SPECTRAL_VIEWS.map((v) => {
          const isSelected = activeMode === v.id;
          const def = SPECTRAL_STYLES[v.id];

          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveMode(v.id)}
              className={cn(
                "p-2 rounded-xl text-left border transition-all text-xs font-semibold flex flex-col justify-between min-h-[54px]",
                isSelected
                  ? "border-primary shadow-sm ring-1 ring-primary/30 " + def.tone
                  : "bg-muted/40 hover:bg-muted/70 border-border/80 text-muted-foreground"
              )}
            >
              <span className="leading-tight font-heading">{v.label}</span>
              <span className="text-[9.5px] font-normal opacity-80 line-clamp-1">
                {v.id === "standard" ? "Visuel neutre" : v.id === "pigment" ? "Mélanine profonde" : v.id === "inflammation" ? "Flux vasculaire" : "Film lipidique"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Zone visuelle avec filtre CSS optique instantané */}
      <div className="relative rounded-2xl overflow-hidden border border-border bg-black/90 aspect-square sm:aspect-[4/3] flex items-center justify-center">
        <img
          src={activePhoto}
          alt={`Observation multi-spectrale de la zone ${zoneLabel}`}
          style={{ filter: currentDef.filter }}
          className={cn(
            "w-full h-full object-cover transition-all duration-300",
            zoom && "scale-150 cursor-zoom-out"
          )}
          onClick={() => setZoom(!zoom)}
        />

        {/* Sélecteur d'angle si multi-photos cabine */}
        {photoList.length > 1 && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/85 backdrop-blur-md p-1.5 rounded-xl border border-white/10 z-10">
            <span className="text-[10px] font-bold text-gold px-1">360° :</span>
            {photoList.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoIdx(idx);
                }}
                className={cn(
                  "relative size-8 rounded-lg overflow-hidden border transition-all",
                  photoIdx === idx ? "border-gold ring-1 ring-gold scale-105" : "border-white/20 opacity-60 hover:opacity-100"
                )}
                aria-label={`Angle ${idx + 1}`}
              >
                <img src={p} alt={`Angle ${idx + 1}`} className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Marquages des zones de vigilance / lésions si activés */}
        {showMarks &&
          zoneMarks.map((m, idx) => (
            <div
              key={idx}
              style={{
                left: `${m.x}%`,
                top: `${m.y}%`,
                width: `${m.w}%`,
                height: `${m.h}%`,
              }}
              className="absolute pointer-events-none rounded-lg border-2 border-gold shadow-[0_0_8px_rgba(200,149,30,0.8)] flex items-start justify-start p-1"
            >
              <span className="bg-black/85 text-gold-text text-[9px] font-bold px-1 rounded border border-gold/40 truncate">
                {m.label}
              </span>
            </div>
          ))}

        {/* Badge descriptif du spectre actif en bas */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-black/80 backdrop-blur-md rounded-xl p-2 border border-white/10 text-white flex items-center gap-2">
          <Sparkles className="size-3.5 text-gold shrink-0" />
          <p className="text-[11px] leading-tight text-white/90">
            <strong className="text-gold">{currentDef.label} :</strong> {currentDef.desc}
          </p>
        </div>
      </div>
    </div>
  );
}
