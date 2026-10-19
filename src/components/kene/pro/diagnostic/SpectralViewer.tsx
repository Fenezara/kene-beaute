"use client";

// Kènè Pro — 🔬 Visualiseur Multi-Spectral 2026 en Cabine
// Analyse optique haute précision dédiée aux phototypes mélanodermes (IV à VI)
// 6 longueurs d'onde optiques + lumière polarisée & corrélation avec la pharmacopée africaine.

import { useMemo, useState } from "react";
import { Download, Eye, Layers, ZoomIn, ZoomOut, Copy, Check, FlaskConical, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { BissapFlowerIcon, KeneSunIcon } from "@/components/kene/icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SPECTRAL_VIEWS, type SpectralViewDefinition, type ZoneMark } from "@/lib/kene/types";

interface SpectralViewerProps {
  photo: string;
  zoneMarks?: ZoneMark[];
  zoneLabel: string;
}

type SpectralMode = (typeof SPECTRAL_VIEWS)[number]["id"];

const SPECTRAL_METAS: Record<
  SpectralMode,
  {
    filter: string;
    tone: string;
    badgeCls: string;
    zoneSpecificAdvice: (zone: string) => string;
  }
> = {
  standard: {
    filter: "none",
    tone: "bg-muted text-foreground border-border",
    badgeCls: "bg-muted text-muted-foreground border-border",
    zoneSpecificAdvice: (z) => `Observation de la surface en lumière naturelle du jour pour la zone ${z}.`,
  },
  uv365: {
    filter: "invert(0.82) hue-rotate(215deg) contrast(1.75) saturate(1.85) brightness(0.92)",
    tone: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40",
    badgeCls: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
    zoneSpecificAdvice: (z) => {
      const l = z.toLowerCase();
      if (l.includes("dos") || l.includes("torse")) {
        return "Différenciation de la folliculite à Malassezia (fluorescence jaune-vert) de l'acné dorsale rétentionnelle.";
      }
      if (l.includes("cuir")) {
        return "Évaluation des desquamations microbiennes et colonisation fongique du cuir chevelu.";
      }
      return "Cartographie de l'autofluorescence des porphyrines bactériennes (C. acnes en rouge corail) et délimitation du mélasma profond.";
    },
  },
  blue405: {
    filter: "invert(0.68) hue-rotate(185deg) contrast(1.8) saturate(1.6)",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
    badgeCls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    zoneSpecificAdvice: (z) => {
      const l = z.toLowerCase();
      if (l.includes("barbe")) {
        return "Surveillance de la pseudofolliculite de barbe (PFB) : détection des micro-foyers d'engorgement à la racine des poils incarnés.";
      }
      if (l.includes("dos")) {
        return "Révélation des comédons fermés du haut du dos avant formation de papules inflammatoires.";
      }
      return "Révélation des micro-comédons, de l'oxydation lipidique des pores et de l'hyperséborrhée centro-faciale.";
    },
  },
  green540: {
    filter: "contrast(1.65) hue-rotate(135deg) saturate(2.3) brightness(0.95)",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    badgeCls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    zoneSpecificAdvice: (z) => {
      const l = z.toLowerCase();
      if (l.includes("cuir")) {
        return "Détection de l'érythème périfolliculaire masqué, signe précurseur critique d'alopécie de traction.";
      }
      if (l.includes("barbe")) {
        return "Mise en évidence de l'échauffement vasculaire sous-épidermique post-rasage.";
      }
      return "Isolement de l'Érythème Post-Inflammatoire (EPI) et des télangiectasies masqués sous l'eumélanine dense.";
    },
  },
  amber585: {
    filter: "contrast(1.45) saturate(1.85) hue-rotate(-15deg) brightness(0.9)",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    badgeCls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    zoneSpecificAdvice: (z) => {
      const l = z.toLowerCase();
      if (l.includes("main")) {
        return "Indice mélanique des lentigos solaires et hyperpigmentation des jointures (knuckles).";
      }
      return "Mesure sélective de la densité des mélanosomes : cartographie des taches HPI sans contamination vasculaire.";
    },
  },
  red660: {
    filter: "sepia(0.3) hue-rotate(330deg) saturate(2.1) contrast(1.3) brightness(1.05)",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40",
    badgeCls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
    zoneSpecificAdvice: (z) => {
      const l = z.toLowerCase();
      if (l.includes("dos") || l.includes("barbe") || l.includes("nuque")) {
        return "Surveillance du risque chéloïdien et de l'épaississement anormal des faisceaux de collagène après boutons.";
      }
      return "Évaluation de la compaction du derme moyen, de la fermeté cutanée et de la micro-diffusion matricielle.";
    },
  },
  nir850: {
    filter: "grayscale(1) invert(0.12) contrast(1.6) brightness(1.12)",
    tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40",
    badgeCls: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30",
    zoneSpecificAdvice: (z) => {
      const l = z.toLowerCase();
      if (l.includes("cuir")) {
        return "Transparence totale de la mélanine : visualisation de la profondeur des bulbes et de la vascularisation hypodermique.";
      }
      return "Fenêtre optique proche infrarouge : exploration du derme profond sans obstruction optique par l'eumélanine.";
    },
  },
  polarized: {
    filter: "contrast(1.75) brightness(1.12) saturate(0.65)",
    tone: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/40",
    badgeCls: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
    zoneSpecificAdvice: (z) => {
      const l = z.toLowerCase();
      if (l.includes("main") || l.includes("pied") || l.includes("corps")) {
        return "Observation du micro-relief de déshydratation aiguë et des squames grisâtres de xérose cutanée.";
      }
      return "Analyse de la cohésion de la couche cornée, de l'état lipidique de surface et de l'aspect rêche des pores.";
    },
  },
};

export function SpectralViewer({ photo, zoneMarks = [], zoneLabel }: SpectralViewerProps) {
  const [activeMode, setActiveMode] = useState<SpectralMode>("standard");
  const [showMarks, setShowMarks] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const currentView = useMemo<SpectralViewDefinition>(() => {
    return SPECTRAL_VIEWS.find((v) => v.id === activeMode) ?? SPECTRAL_VIEWS[0];
  }, [activeMode]);

  const currentMeta = SPECTRAL_METAS[activeMode] ?? SPECTRAL_METAS.standard;

  function handleCopyPrescription() {
    const text = `[RECOMMANDATION SPECTRE ${currentView.wavelength.toUpperCase()} — ZONE ${zoneLabel.toUpperCase()}]
• Cible biophysique observée : ${currentView.opticalTarget}
• Constat clinique : ${currentView.clinicalSignificance}
• Actifs pharmacopée recommandés : ${currentView.botanicals.join(", ")}
• Formule magistrale suggérée : ${currentView.recommendedFormula}`;

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Prescription spectrale copiée !", {
        description: "Vous pouvez coller cette formulation directement dans le Cahier de Formulation du dossier cutané.",
      });
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <div className="space-y-3.5 rounded-2xl border border-border bg-card p-3.5 sm:p-4 shadow-xs">
      {/* ── En-tête du Visualiseur Multi-Spectral ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center size-8 rounded-xl bg-gold/15 text-gold-text">
            <Layers className="size-4.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-heading font-black text-sm text-foreground">
                Analyse Multi-Spectrale 2026 en Cabine
              </h4>
              <Badge variant="outline" className="bg-gold/10 text-gold-text border-gold/30 text-[10px] font-bold">
                Phototypes IV-VI
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Observation optique avancée de la zone <strong className="text-foreground capitalize">{zoneLabel}</strong> sous 6 longueurs d&apos;onde + polarisation
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
                "px-2.5 py-1 rounded-lg text-[10.5px] font-semibold border transition-colors flex items-center gap-1",
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
            className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-muted hover:bg-muted/80 border border-border text-foreground flex items-center gap-1 transition-colors"
          >
            {zoom ? <ZoomOut className="size-3" /> : <ZoomIn className="size-3" />}
            <span>{zoom ? "Aperçu" : "Zoom cabine"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activePhoto) return;
              const a = document.createElement("a");
              a.href = activePhoto;
              const cleanZone = zoneLabel.replace(/\s+/g, "-");
              a.download = `kene-cabine-${cleanZone}-${activeMode}.jpg`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              toast.success("Photo cutanée téléchargée 📸");
            }}
            className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-muted hover:bg-muted/80 border border-border text-foreground flex items-center gap-1 transition-colors"
            title="Télécharger la photo originale"
          >
            <Download className="size-3" />
            <span>Télécharger</span>
          </button>
        </div>
      </div>

      {/* ── Sélecteur de Longueurs d'Onde Optiques 2026 ── */}
      <div className="space-y-1.5">
        <span className="text-[9.5px] uppercase font-bold tracking-wider text-muted-foreground">
          Longueurs d&apos;onde dermo-optiques (Sélectionner pour observer) :
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {SPECTRAL_VIEWS.map((v) => {
            const isSelected = activeMode === v.id;
            const meta = SPECTRAL_METAS[v.id as SpectralMode] ?? SPECTRAL_METAS.standard;

            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveMode(v.id as SpectralMode)}
                className={cn(
                  "p-2 rounded-xl text-left border transition-all text-xs flex flex-col justify-between min-h-[58px]",
                  isSelected
                    ? "shadow-xs ring-1 ring-primary/40 font-bold " + meta.tone
                    : "bg-muted/40 hover:bg-muted/70 border-border/70 text-muted-foreground"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-heading text-[11px] leading-tight truncate">{v.shortLabel}</span>
                  <span className="text-[9px] font-mono opacity-70 shrink-0">{v.wavelength}</span>
                </div>
                <span className="text-[9.5px] font-normal opacity-85 line-clamp-1 mt-0.5">
                  {v.opticalTarget}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Zone visuelle avec filtre optique instantané ── */}
      <div className="relative rounded-2xl overflow-hidden border border-border bg-black/95 aspect-square sm:aspect-[4/3] flex items-center justify-center shadow-inner">
        <img
          src={activePhoto}
          alt={`Observation multi-spectrale ${currentView.label} de la zone ${zoneLabel}`}
          style={{ filter: currentMeta.filter }}
          className={cn(
            "w-full h-full object-cover transition-all duration-300",
            zoom && "scale-150 cursor-zoom-out"
          )}
          onClick={() => setZoom(!zoom)}
        />

        {/* Sélecteur d'angle si multi-photos cabine */}
        {photoList.length > 1 && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/85 backdrop-blur-md p-1.5 rounded-xl border border-white/15 z-10">
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

        {/* Badge descriptif du spectre actif en surimpression */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-black/85 backdrop-blur-md rounded-xl p-2.5 border border-white/15 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <KeneSunIcon className="size-4 text-gold-text shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                <span className="text-gold">{currentView.label}</span>
                <span className="text-[10px] text-white/70 font-mono">({currentView.wavelength})</span>
              </p>
              <p className="text-[11px] text-white/80 leading-snug line-clamp-2">
                {currentView.clinicalSignificance}
              </p>
            </div>
          </div>

          <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px] shrink-0 self-start sm:self-center">
            {currentView.opticalTarget}
          </Badge>
        </div>
      </div>

      {/* ── Cartouche Clinique & Recommandation Pharmacopée 2026 ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-6 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <FlaskConical className="size-3.5" />
            </span>
            <div>
              <h5 className="font-heading text-xs font-bold text-foreground">
                Recommandation Magistrale &amp; Actifs Pharmacopée Associés
              </h5>
              <p className="text-[10.5px] text-muted-foreground">
                Actifs botaniques africains couplés à l&apos;observation optique sous {currentView.wavelength}
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyPrescription}
            className="h-7 text-[10.5px] gap-1 px-2.5 border-gold/30 text-gold-text hover:bg-gold/10 shrink-0"
          >
            {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
            <span>{copied ? "Copié !" : "Copier pour le dossier cutané"}</span>
          </Button>
        </div>

        {/* Conseils spécifiques à la zone corporelle examinée */}
        <div className="p-2.5 rounded-lg bg-card border border-border/60 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-gold-text font-semibold text-[11px]">
            <Info className="size-3.5" />
            <span>Spécificité zone {zoneLabel} :</span>
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/90">
            {currentMeta.zoneSpecificAdvice(zoneLabel)}
          </p>
        </div>

        {/* Actifs pharmacopée et formule magistrale */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/50 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Actifs botaniques ciblés :
            </span>
            <div className="flex flex-wrap gap-1">
              {currentView.botanicals.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[10.5px] font-medium"
                >
                  <BissapFlowerIcon className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                  {b}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Protocole d&apos;application suggéré :
            </span>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {currentView.recommendedFormula}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
