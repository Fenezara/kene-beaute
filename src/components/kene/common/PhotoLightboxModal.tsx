"use client";
// Kènè — Visionneuse Plein Écran (Lightbox HD) pour photos de peau & diagnostics
// Permet à la cliente ou à la praticienne d'examiner les détails cutanés (pores, taches, texture)
// en très haute résolution avec zoom tactile, indicateurs cliniques et navigation multi-photos.

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Calendar,
  Sparkles,
  Download,
  Share2,
  ScanFace,
  ShieldCheck,
  Check,
} from "lucide-react";
import { formatDate, formatTime, scoreColor } from "@/lib/kene/format";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface LightboxPhoto {
  id: string;
  url: string;
  date: string;
  zone?: string;
  score?: number | null;
  institut?: string | null;
  practitioner?: string | null;
  indicators?: Array<{ nom: string; pourcentage: number; severite?: number }>;
  notes?: string | null;
}

interface PhotoLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: LightboxPhoto[];
  initialIndex?: number;
  titlePrefix?: string;
}

export function PhotoLightboxModal({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
  titlePrefix = "Cliché Cutané",
}: PhotoLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, photos.length - 1)));
      setZoomLevel(1);
    }
  }, [isOpen, initialIndex, photos.length]);

  const activePhoto = photos[currentIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      haptic(HAPTIC.light);
      setCurrentIndex((prev) => prev + 1);
      setZoomLevel(1);
    }
  }, [currentIndex, photos.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      haptic(HAPTIC.light);
      setCurrentIndex((prev) => prev - 1);
      setZoomLevel(1);
    }
  }, [currentIndex]);

  const zoomIn = () => {
    haptic(HAPTIC.light);
    setZoomLevel((z) => Math.min(z + 0.5, 3));
  };

  const zoomOut = () => {
    haptic(HAPTIC.light);
    setZoomLevel((z) => Math.max(z - 0.5, 1));
  };

  const resetZoom = () => {
    haptic(HAPTIC.light);
    setZoomLevel(1);
  };

  // Raccourcis clavier (Flèches, Echap, Zoom)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") resetZoom();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  // Bloquer le scroll d'arrière-plan
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!mounted || !isOpen || !activePhoto) return null;

  const score = activePhoto.score;
  const scoreCl = score ? scoreColor(score) : "#C8951E";

  const handleDownload = () => {
    haptic(HAPTIC.tap);
    try {
      const a = document.createElement("a");
      a.href = activePhoto.url;
      a.download = `kene-photo-${activePhoto.zone || "peau"}-${activePhoto.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Photo téléchargée en haute définition");
    } catch {
      toast.error("Impossible de télécharger la photo");
    }
  };

  const handleShare = async () => {
    haptic(HAPTIC.tap);
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Mon bilan cutané Kènè",
          text: `Cliché cutané Kènè - Zone ${activePhoto.zone || "Visage"} (${score ? `${score}/100` : ""})`,
          url: window.location.href,
        });
      } catch {
        // Annulé par l'utilisateur
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Lien copié dans le presse-papier");
    }
  };

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visionneuse de photo cutanée plein écran"
      className="fixed inset-0 z-[100] flex flex-col justify-between bg-black/95 text-white backdrop-blur-md select-none"
    >
      {/* ── BARRE SUPÉRIEURE ── */}
      <header className="flex items-center justify-between px-4 py-3 sm:px-6 bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 sm:size-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
            <ScanFace className="size-5 text-[#C8951E]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading font-black text-sm sm:text-base text-white truncate flex items-center gap-2">
              <span>{titlePrefix}</span>
              {activePhoto.zone && (
                <span className="capitalize px-2 py-0.5 rounded-md bg-[#C8951E]/20 text-[#E0B147] text-xs font-semibold">
                  {activePhoto.zone.replace("_", " ")}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-white/70 flex items-center gap-2 mt-0.5">
              <Calendar className="size-3" />
              <span>{formatDate(activePhoto.date, { day: "numeric", month: "long", year: "numeric" })}</span>
              <span>·</span>
              <span>{formatTime(activePhoto.date)}</span>
              {activePhoto.institut && (
                <>
                  <span>·</span>
                  <span className="text-[#E0B147]">Cabine {activePhoto.institut}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Contrôles droits : Score + Outils + Fermer */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {score !== null && score !== undefined && score > 0 && (
            <div
              className="px-3 py-1 rounded-xl font-mono font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-sm"
              style={{ backgroundColor: `${scoreCl}25`, color: scoreCl, border: `1px solid ${scoreCl}50` }}
            >
              <Sparkles className="size-3.5" />
              <span>{score}/100</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Télécharger l'image"
            aria-label="Télécharger"
          >
            <Download className="size-4 sm:size-5" />
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Partager"
            aria-label="Partager"
          >
            <Share2 className="size-4 sm:size-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              haptic(HAPTIC.tap);
              onClose();
            }}
            className="p-2 sm:p-2.5 rounded-xl bg-[#C8951E] hover:bg-[#D4A32D] text-black font-black transition-transform active:scale-95 ml-1"
            title="Fermer la visionneuse"
            aria-label="Fermer"
          >
            <X className="size-5" />
          </button>
        </div>
      </header>

      {/* ── ZONE CENTRALE DE L'IMAGE ── */}
      <div className="relative flex-1 flex items-center justify-center p-2 sm:p-6 overflow-hidden">
        {/* Navigation Précédent */}
        {photos.length > 1 && currentIndex > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 sm:left-6 z-20 size-11 sm:size-14 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center shadow-2xl backdrop-blur-md active:scale-95 transition-all"
            aria-label="Photo précédente"
          >
            <ChevronLeft className="size-6 sm:size-7" />
          </button>
        )}

        {/* L'image zoomable */}
        <div className="relative max-h-full max-w-full flex items-center justify-center overflow-auto pretty-scroll">
          <motion.img
            key={activePhoto.url}
            src={activePhoto.url}
            alt={`Photo de peau ${activePhoto.zone || "analysée"}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: zoomLevel }}
            transition={{ duration: 0.2 }}
            className="max-h-[70vh] sm:max-h-[75vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl border border-white/15"
            style={{ transformOrigin: "center center" }}
          />
        </div>

        {/* Navigation Suivant */}
        {photos.length > 1 && currentIndex < photos.length - 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 sm:right-6 z-20 size-11 sm:size-14 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white flex items-center justify-center shadow-2xl backdrop-blur-md active:scale-95 transition-all"
            aria-label="Photo suivante"
          >
            <ChevronRight className="size-6 sm:size-7" />
          </button>
        )}
      </div>

      {/* ── BARRE INFÉRIEURE : OUTILS DE ZOOM + INDICATEURS + PAGINATION ── */}
      <footer className="p-3 sm:p-5 bg-gradient-to-t from-black/95 via-black/85 to-transparent z-10 space-y-3">
        {/* Indicateurs cutanés du cliché si disponibles */}
        {activePhoto.indicators && activePhoto.indicators.length > 0 && (
          <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-2">
            {activePhoto.indicators.map((ind, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 text-[11px] font-semibold text-white/90"
              >
                <span>{ind.nom} :</span>
                <strong className="font-mono text-[#E0B147]">{ind.pourcentage}%</strong>
              </span>
            ))}
          </div>
        )}

        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          {/* Pagination */}
          <div className="text-xs font-mono font-bold text-white/80 bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
            {currentIndex + 1} / {photos.length}
          </div>

          {/* Contrôles de zoom */}
          <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-2xl border border-white/15">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoomLevel <= 1}
              className="p-1.5 sm:p-2 rounded-xl text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
              title="Dézoomer"
              aria-label="Dézoomer"
            >
              <ZoomOut className="size-4 sm:size-5" />
            </button>
            <span className="font-mono text-xs font-black px-2 min-w-[42px] text-center text-[#E0B147]">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoomLevel >= 3}
              className="p-1.5 sm:p-2 rounded-xl text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
              title="Zoomer"
              aria-label="Zoomer"
            >
              <ZoomIn className="size-4 sm:size-5" />
            </button>
            {zoomLevel > 1 && (
              <button
                type="button"
                onClick={resetZoom}
                className="p-1.5 sm:p-2 rounded-xl text-white/80 hover:bg-white/20 transition-colors ml-1"
                title="Réinitialiser zoom"
                aria-label="Réinitialiser zoom"
              >
                <RotateCcw className="size-4" />
              </button>
            )}
          </div>

          {/* Indication tactile */}
          <div className="hidden sm:block text-[11px] text-white/60">
            Flèches ◀ ▶ pour défiler
          </div>
        </div>
      </footer>
    </div>
  );

  return createPortal(content, document.body);
}
