"use client";

// Kènè Pro — 🔬 Visualiseur Multi-Spectral 2026 en Cabine
// Analyse optique haute précision dédiée aux phototypes mélanodermes (IV à VI)
// 6 longueurs d'onde optiques + lumière polarisée & corrélation avec la pharmacopée africaine.

import { useMemo, useState } from "react";
import {
  Download,
  Eye,
  Layers,
  ZoomIn,
  ZoomOut,
  Copy,
  Check,
  FlaskConical,
  Info,
  FileText,
  RotateCcw,
  Box,
} from "lucide-react";
import { toast } from "sonner";
import { BissapFlowerIcon, KeneSunIcon } from "@/components/kene/icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SPECTRAL_VIEWS,
  recommend4SpectralViews,
  recommend4SpectralSlots,
  type SpectralViewDefinition,
  type SpectralViewId,
  type SelectedReportSlot,
  type ZoneMark,
} from "@/lib/kene/types";

interface SpectralViewerProps {
  photo: string;
  zoneMarks?: ZoneMark[];
  zoneLabel: string;
  indicators?: Array<{ nom: string; pourcentage: number }>;
  selectedPdfViews?: SpectralViewId[];
  onChangeSelectedPdfViews?: (views: SpectralViewId[]) => void;
  selectedReportSlots?: SelectedReportSlot[];
  onChangeReportSlots?: (slots: SelectedReportSlot[]) => void;
  photoIdx?: number;
  onChangePhotoIdx?: (idx: number) => void;
  onPrintPdf?: () => void;
  onOpen3D?: () => void;
}

type SpectralMode = SpectralViewId;

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

export function SpectralViewer({
  photo,
  zoneMarks = [],
  zoneLabel,
  indicators = [],
  selectedPdfViews: propSelectedPdfViews,
  onChangeSelectedPdfViews,
  selectedReportSlots: propReportSlots,
  onChangeReportSlots,
  photoIdx: propPhotoIdx,
  onChangePhotoIdx,
  onPrintPdf,
  onOpen3D,
}: SpectralViewerProps) {
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

  const [localPhotoIdx, setLocalPhotoIdx] = useState(0);
  const photoIdx = propPhotoIdx !== undefined ? propPhotoIdx : localPhotoIdx;
  const setPhotoIdx = (idx: number) => {
    if (onChangePhotoIdx) onChangePhotoIdx(idx);
    else setLocalPhotoIdx(idx);
  };
  const activePhoto = photoList[photoIdx] || photoList[0] || photo;

  // Initialisation des 4 slots
  const initialSlots = useMemo<SelectedReportSlot[]>(() => {
    if (propReportSlots && propReportSlots.length > 0) return propReportSlots;
    if (propSelectedPdfViews && propSelectedPdfViews.length > 0) {
      return propSelectedPdfViews.map((vid, idx) => ({
        viewId: vid,
        photoIdx: Math.min(idx, Math.max(0, photoList.length - 1)),
      }));
    }
    const rec = recommend4SpectralSlots(indicators, photoList.length);
    return rec;
  }, [propReportSlots, propSelectedPdfViews, indicators, photoList.length]);

  const [localSlots, setLocalSlots] = useState<SelectedReportSlot[]>(initialSlots);
  const reportSlots = propReportSlots ?? localSlots;

  const setSlots = (updater: SelectedReportSlot[] | ((prev: SelectedReportSlot[]) => SelectedReportSlot[])) => {
    const next = typeof updater === "function" ? updater(reportSlots) : updater;
    if (onChangeReportSlots) {
      onChangeReportSlots(next);
    } else {
      setLocalSlots(next);
    }
    if (onChangeSelectedPdfViews) {
      onChangeSelectedPdfViews(next.map((s) => s.viewId));
    }
  };

  // Bascule l'inclusion d'une longueur d'onde pour la photo EN COURS DE VISIONNAGE
  const toggleSlotView = (id: SpectralViewId, targetPhotoIdx = photoIdx) => {
    const existingIndex = reportSlots.findIndex(
      (s) => s.viewId === id && s.photoIdx === targetPhotoIdx
    );
    const viewName = SPECTRAL_VIEWS.find((v) => v.id === id)?.shortLabel || id;
    const photoLabel = photoList.length > 1 ? ` (Photo #${targetPhotoIdx + 1})` : "";

    if (existingIndex !== -1) {
      if (reportSlots.length <= 1) {
        toast.error("Au moins 1 vue clinique doit être conservée pour le rapport PDF.");
        return;
      }
      const next = reportSlots.filter((_, idx) => idx !== existingIndex);
      setSlots(next);
      toast.info(`Vue ${viewName}${photoLabel} retirée du PDF (${next.length}/4).`);
    } else {
      if (reportSlots.length < 4) {
        const next = [...reportSlots, { viewId: id, photoIdx: targetPhotoIdx }];
        setSlots(next);
        toast.success(`Vue ${viewName}${photoLabel} ajoutée au PDF (${next.length}/4) !`);
      } else {
        // Déjà 4 slots : remplace le 4ème slot (ou le 1er si on préfère)
        const replaceIdx = 3;
        const replacedSlot = reportSlots[replaceIdx];
        const replacedName = SPECTRAL_VIEWS.find((v) => v.id === replacedSlot.viewId)?.shortLabel || replacedSlot.viewId;
        const next = [...reportSlots];
        next[replaceIdx] = { viewId: id, photoIdx: targetPhotoIdx };
        setSlots(next);
        toast.success(`Vue ${viewName}${photoLabel} sélectionnée (remplace ${replacedName} en position 4).`);
      }
    }
  };

  const removeSlot = (slotIdx: number) => {
    if (reportSlots.length <= 1) {
      toast.error("Au moins 1 vue clinique doit être conservée pour le rapport PDF.");
      return;
    }
    const next = reportSlots.filter((_, i) => i !== slotIdx);
    setSlots(next);
  };

  const resetToAiQuad = () => {
    const next = recommend4SpectralSlots(indicators, photoList.length);
    setSlots(next);
    toast.success("4 vues cliniques réinitialisées selon la recommandation IA !");
  };

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
                Imagerie Multi-Spectrale Cabine (8 Vues)
              </h4>
              <Badge variant="outline" className="bg-gold/10 text-gold-text border-gold/30 text-[10px] font-bold">
                Phototypes IV-VI
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sélectionnez au toucher les <strong>4 vues cliniques</strong> qui figureront sur le compte-rendu PDF
            </p>
          </div>
        </div>

        {/* Commandes rapides 3D, Zoom & Téléchargement */}
        <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-auto">
          {onOpen3D && (
            <button
              type="button"
              onClick={onOpen3D}
              className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1 shadow-xs"
              title="Ouvrir la cartographie dermo-optique 3D"
            >
              <Box className="size-3" />
              <span>Explorer en 3D</span>
            </button>
          )}

          {onPrintPdf && (
            <button
              type="button"
              onClick={onPrintPdf}
              className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-gold/15 hover:bg-gold/25 border border-gold/40 text-gold-text transition-colors flex items-center gap-1"
              title="Générer immédiatement le PDF avec les 4 vues choisies"
            >
              <FileText className="size-3" />
              <span>PDF ({reportSlots.length}/4)</span>
            </button>
          )}

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

      {/* ── BARRE TACTILE : LES 4 VUES SÉLECTIONNÉES POUR LE RAPPORT PDF ── */}
      <div className="rounded-xl border border-gold/35 bg-gold/5 p-2.5 sm:p-3 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <span className="size-2 rounded-full bg-gold animate-pulse" />
            <span className="font-heading uppercase tracking-wide text-[11px] text-gold-text">
              Les 4 vues retenues pour le Compte-rendu PDF :
            </span>
            <Badge variant="outline" className="bg-gold/15 text-gold-text border-gold/30 text-[10px] font-mono">
              {reportSlots.length} / 4
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={resetToAiQuad}
              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-muted/60 transition-colors"
              title="Réinitialiser avec les 4 vues recommandées par l'IA selon les biomarqueurs du diagnostic"
            >
              <RotateCcw className="size-2.5" />
              <span>Conseil IA</span>
            </button>
            {onPrintPdf && (
              <Button
                size="sm"
                variant="default"
                onClick={onPrintPdf}
                className="h-6 text-[10px] font-bold gap-1 px-2 bg-gold hover:bg-gold-dark text-black shadow-xs"
              >
                <FileText className="size-2.5" />
                <span>Imprimer / PDF</span>
              </Button>
            )}
          </div>
        </div>

        {/* 4 Slots de sélection tactile directe */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((slotIdx) => {
            const slot = reportSlots[slotIdx];
            const viewId = slot?.viewId;
            const targetPIdx = slot?.photoIdx ?? 0;
            const viewDef = viewId ? SPECTRAL_VIEWS.find((v) => v.id === viewId) : null;
            const meta = viewId ? SPECTRAL_METAS[viewId] : null;
            const slotPhotoThumb = photoList[targetPIdx] || photoList[0];

            if (slot && viewDef && meta) {
              const isActive = activeMode === viewId && photoIdx === targetPIdx;
              return (
                <div
                  key={slotIdx}
                  className={cn(
                    "p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer",
                    isActive ? "ring-1 ring-gold border-gold/60 bg-gold/15" : "bg-card border-border/70 hover:border-gold/50"
                  )}
                  onClick={() => {
                    setActiveMode(viewId);
                    setPhotoIdx(targetPIdx);
                  }}
                  title={`Cliquer pour afficher la vue ${viewDef.shortLabel} sur la photo #${targetPIdx + 1}`}
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    {slotPhotoThumb ? (
                      <div className="relative size-6 rounded-md overflow-hidden border border-gold/40 shrink-0">
                        <img src={slotPhotoThumb} alt={`Photo #${targetPIdx + 1}`} className="size-full object-cover" />
                        <span className="absolute bottom-0 right-0 bg-black/80 text-[7.5px] font-mono text-gold px-0.5 leading-none font-bold">
                          #{targetPIdx + 1}
                        </span>
                      </div>
                    ) : (
                      <span className="size-4 rounded-full grid place-items-center bg-gold/20 text-gold-text text-[9px] font-mono font-bold shrink-0">
                        {slotIdx + 1}
                      </span>
                    )}
                    <div className="truncate">
                      <p className="text-[10.5px] font-bold leading-tight truncate text-foreground">
                        {viewDef.shortLabel}
                      </p>
                      <p className="text-[8.5px] font-mono text-muted-foreground truncate">
                        {photoList.length > 1 ? `Photo #${targetPIdx + 1} · ` : ""}{viewDef.wavelength}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSlot(slotIdx);
                    }}
                    className="size-5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 grid place-items-center text-xs transition-colors shrink-0"
                    title={`Retirer ${viewDef.shortLabel} (Photo #${targetPIdx + 1}) du PDF`}
                    aria-label={`Retirer ${viewDef.shortLabel}`}
                  >
                    ✕
                  </button>
                </div>
              );
            }

            return (
              <div
                key={slotIdx}
                className="p-1.5 rounded-lg border border-dashed border-border/80 bg-muted/20 flex items-center justify-center gap-1 text-muted-foreground text-[10px]"
              >
                <span>Slot #{slotIdx + 1} libre</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sélecteur des 8 Longueurs d'Onde Optiques (avec badges tactiles PDF) ── */}
      <div className="space-y-1.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[9.5px] uppercase font-bold tracking-wider text-muted-foreground gap-1">
          <span>
            Longueurs d&apos;onde pour la photo en cours ({photoList.length > 1 ? `Photo #${photoIdx + 1} sur ${photoList.length}` : "Photo unique"}) :
          </span>
          <span className="text-[9px] font-normal normal-case opacity-80">
            Toucher <strong>+ PDF</strong> pour ajouter cette longueur d&apos;onde sur la photo active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {SPECTRAL_VIEWS.map((v) => {
            const isPreviewActive = activeMode === v.id;
            const slotIndex = reportSlots.findIndex(
              (s) => s.viewId === v.id && s.photoIdx === photoIdx
            );
            const isSelectedForCurrentPhoto = slotIndex !== -1;
            const meta = SPECTRAL_METAS[v.id as SpectralMode] ?? SPECTRAL_METAS.standard;

            return (
              <div
                key={v.id}
                onClick={() => setActiveMode(v.id as SpectralMode)}
                className={cn(
                  "p-2 rounded-xl text-left border transition-all text-xs flex flex-col justify-between min-h-[66px] cursor-pointer relative group",
                  isPreviewActive
                    ? "shadow-xs ring-2 ring-primary/60 font-bold " + meta.tone
                    : isSelectedForCurrentPhoto
                    ? "bg-gold/5 border-gold/40 text-foreground"
                    : "bg-muted/40 hover:bg-muted/70 border-border/70 text-muted-foreground"
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 pr-1">
                    <span className="font-heading text-[11px] leading-tight truncate block text-foreground">
                      {v.shortLabel}
                    </span>
                    <span className="text-[9px] font-mono opacity-70 block">{v.wavelength}</span>
                  </div>

                  {/* Bouton tactile PDF : 1 tap pour l'ajouter/retirer pour la photo active */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSlotView(v.id as SpectralViewId, photoIdx);
                    }}
                    className={cn(
                      "px-1.5 py-0.5 rounded-md text-[9.5px] font-bold tracking-tight border transition-all shrink-0 flex items-center gap-0.5 shadow-2xs",
                      isSelectedForCurrentPhoto
                        ? "bg-gold text-black border-gold-dark ring-1 ring-gold"
                        : "bg-background/80 hover:bg-gold/20 text-muted-foreground hover:text-gold-text border-border"
                    )}
                    title={
                      isSelectedForCurrentPhoto
                        ? `Vue #${slotIndex + 1} du PDF pour cette photo (toucher pour retirer)`
                        : `Toucher pour inclure ${v.shortLabel} sur cette photo #${photoIdx + 1} dans le PDF`
                    }
                  >
                    {isSelectedForCurrentPhoto ? (
                      <>
                        <Check className="size-2.5 stroke-[3]" />
                        <span>PDF #{slotIndex + 1}</span>
                      </>
                    ) : (
                      <span>+ PDF</span>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-1 mt-1">
                  <span className="text-[9.5px] font-normal opacity-85 line-clamp-1">
                    {v.opticalTarget}
                  </span>
                  {isPreviewActive && (
                    <span className="text-[8.5px] font-bold px-1 rounded bg-primary/20 text-primary shrink-0">
                      Vue active
                    </span>
                  )}
                </div>
              </div>
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

          <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
            {(() => {
              const currentSlotIndex = reportSlots.findIndex(
                (s) => s.viewId === activeMode && s.photoIdx === photoIdx
              );
              const isRetained = currentSlotIndex !== -1;
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSlotView(activeMode, photoIdx);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all flex items-center gap-1 shadow-xs",
                    isRetained
                      ? "bg-gold text-black border-gold-dark ring-1 ring-gold"
                      : "bg-white/15 hover:bg-white/25 text-white border-white/30"
                  )}
                >
                  {isRetained ? (
                    <>
                      <Check className="size-3 stroke-[3]" />
                      <span>Retenu au PDF (#{currentSlotIndex + 1})</span>
                    </>
                  ) : (
                    <>
                      <span>+ Retenir pour le PDF ({photoList.length > 1 ? `Photo #${photoIdx + 1}` : "cette vue"})</span>
                    </>
                  )}
                </button>
              );
            })()}
            <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px]">
              {currentView.opticalTarget}
            </Badge>
          </div>
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
