"use client";
// Kènè — Visionneuse Photo Plein Écran Haute Définition (Lightbox HD)
// Permet d'examiner en détail les photos cutanées prises par la cliente ou en cabine :
// Zoom interactif, métriques de santé au moment du cliché, date, zone, navigation avant/après.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
  Download,
  Share2,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import { NsorommaIcon } from "@/components/kene/icons";
import { formatDate, formatTime, scoreColor } from "@/lib/kene/format";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { toast } from "sonner";

export interface LightboxPhoto {
  id: string;
  url: string;
  date: string;
  zone?: string;
  score?: number | null;
  institut?: string | null;
  practitioner?: string | null;
  indicators?: Array<{ nom: string; pourcentage: number }>;
}

interface PhotoLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: LightboxPhoto[];
  initialIndex?: number;
}

export function PhotoLightboxModal({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
}: PhotoLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState<1 | 1.5 | 2.2>(1);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, photos.length - 1)));
      setZoomLevel(1);
    }
  }, [isOpen, initialIndex, photos.length]);

  // Clavier (Escape pour fermer, flèches pour naviguer)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, photos.length]);

  if (!isOpen || photos.length === 0) return null;

  const current = photos[currentIndex] || photos[0];
  const hasMultiple = photos.length > 1;

  const handlePrev = () => {
    if (!hasMultiple) return;
    haptic(HAPTIC.light);
    setZoomLevel(1);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNext = () => {
    if (!hasMultiple) return;
    haptic(HAPTIC.light);
    setZoomLevel(1);
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  const toggleZoom = () => {
    haptic(HAPTIC.light);
    setZoomLevel((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2.2 : 1));
  };

  const handleDownload = () => {
    if (!current?.url) return;
    haptic(HAPTIC.light);
    const a = document.createElement("a");
    a.href = current.url;
    const cleanDate = current.date ? new Date(current.date).toISOString().slice(0, 10) : "date";
    const cleanZone = (current.zone || "peau").replace(/\s+/g, "-");
    a.download = `kene-photo-${cleanZone}-${cleanDate}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Photo téléchargée avec succès 📸");
  };

  const score = current.score ?? null;
  const scoreCl = score !== null ? scoreColor(score) : "#C8951E";

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-md select-none touch-none animate-in fade-in duration-200">
        {/* ───── BARRE SUPÉRIEURE ───── */}
        <header className="flex items-center justify-between px-4 py-3 sm:px-6 bg-black/50 border-b border-white/10 z-10 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid place-items-center size-9 rounded-xl bg-white/10 text-gold shrink-0">
              <ScanFace size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-sm sm:text-base capitalize truncate text-white">
                  {current.zone ? `Zone ${current.zone.replace("_", " ")}` : "Cliché Cutané"}
                </h3>
                {score !== null && (
                  <span
                    className="font-mono font-black text-xs px-2.5 py-0.5 rounded-full"
                    style={{ backgroundColor: `${scoreCl}25`, color: scoreCl }}
                  >
                    {score}/100
                  </span>
                )}
              </div>
              <p className="text-xs text-white/70 flex items-center gap-1.5 mt-0.5 font-sans">
                <Calendar size={12} className="shrink-0 text-white/60" />
                <span>{formatDate(current.date)} à {formatTime(current.date)}</span>
                {current.institut && <span>· Cabine {current.institut}</span>}
              </p>
            </div>
          </div>

          {/* Actions : Télécharger, Zoom & Fermer */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="size-10 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white grid place-items-center transition-all cursor-pointer border border-white/10"
              title="Télécharger la photo HD"
              aria-label="Télécharger la photo"
            >
              <Download size={18} />
            </button>

            <button
              type="button"
              onClick={toggleZoom}
              className="size-10 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white grid place-items-center transition-all cursor-pointer border border-white/10"
              title={zoomLevel > 1 ? "Réduire le zoom" : "Agrandir l'image"}
              aria-label="Contrôle du zoom"
            >
              {zoomLevel > 1 ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
            </button>

            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                onClose();
              }}
              className="size-10 rounded-xl bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40 text-red-300 border border-red-500/30 grid place-items-center transition-all cursor-pointer"
              title="Fermer la visionneuse"
              aria-label="Fermer"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* ───── ZONE CENTRALE : AFFICHAGE DE LA PHOTO ───── */}
        <main className="relative flex-1 flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          {/* Flèche précédente */}
          {hasMultiple && (
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-3 sm:left-6 z-20 size-12 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-white grid place-items-center transition-all cursor-pointer border border-white/20 shadow-lg"
              aria-label="Photo précédente"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Photo avec transformation de zoom */}
          <motion.div
            key={current.id || current.url}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: zoomLevel }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="max-h-full max-w-full flex items-center justify-center cursor-zoom-in"
            onClick={toggleZoom}
          >
            <img
              src={current.url}
              alt={current.zone || "Cliché cutané"}
              className="max-h-[72vh] sm:max-h-[76vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
              loading="eager"
            />
          </motion.div>

          {/* Flèche suivante */}
          {hasMultiple && (
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-3 sm:right-6 z-20 size-12 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-white grid place-items-center transition-all cursor-pointer border border-white/20 shadow-lg"
              aria-label="Photo suivante"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </main>

        {/* ───── BARRE INFÉRIEURE : DÉTAILS & PAGINATION ───── */}
        <footer className="px-4 py-3 sm:px-6 bg-black/60 border-t border-white/10 text-white z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {hasMultiple && (
              <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/10 text-white/90">
                {currentIndex + 1} / {photos.length}
              </span>
            )}
            <span className="text-xs text-white/70">
              {zoomLevel > 1 ? `Zoom ${zoomLevel}x actif · Touche l'image pour réinitialiser` : "Haute définition biométrique Kènè"}
            </span>
          </div>

          {/* Indicateurs ou recommandations */}
          {current.indicators && current.indicators.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 max-w-md">
              {current.indicators.slice(0, 3).map((ind, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white/90 border border-white/5"
                >
                  <NsorommaIcon size={11} className="text-gold" />
                  {ind.nom} : <strong>{ind.pourcentage}%</strong>
                </span>
              ))}
            </div>
          )}
        </footer>
      </div>
    </AnimatePresence>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}
