"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scan,
  Sparkles,
  Layers,
  CheckCircle2,
  Cpu,
  Eye,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoScanAnimationProps {
  photo?: string | null;
  zoneLabel: string;
  analysisMsg?: string;
  clientName?: string;
}

const SCAN_TARGETS = [
  { id: "zone_t", label: "Sébum & Pores Zone T", x: 48, y: 28, delay: 0.2 },
  { id: "cheek_l", label: "Mélanine & Taches PIH", x: 26, y: 52, delay: 0.8 },
  { id: "cheek_r", label: "Film Hydrolipidique", x: 72, y: 50, delay: 1.4 },
  { id: "chin", label: "Barrière & Sensibilité", x: 50, y: 76, delay: 2.0 },
];

const SCAN_PHASES = [
  {
    step: 1,
    title: "Lecture colorimétrique & Phototype",
    desc: "Étalonnage mélanoderme (Fitzpatrick III à VI)",
    icon: Eye,
  },
  {
    step: 2,
    title: "Cartographie multi-spectrale des lésions",
    desc: "Pores, hyperpigmentation, rougeurs & comédons",
    icon: Layers,
  },
  {
    step: 3,
    title: "Fusion déclaratif cabine & observation VLM",
    desc: "Pondération 38 % entretien + 62 % vision IA",
    icon: Cpu,
  },
  {
    step: 4,
    title: "Recommandations botaniques & actifs",
    desc: "Karité de Korhogo, Moringa, Baobab, Kinkéliba",
    icon: Sparkles,
  },
];

export function PhotoScanAnimation({
  photo,
  zoneLabel,
  analysisMsg,
  clientName,
}: PhotoScanAnimationProps) {
  const [activePhase, setActivePhase] = useState(0);
  const [progress, setProgress] = useState(12);
  const [activeImgIdx, setActiveImgIdx] = useState(0);

  const photoList = useMemo(() => {
    if (!photo) return [];
    if (typeof photo === "string" && photo.startsWith("[")) {
      try {
        const parsed = JSON.parse(photo);
        if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === "string" && Boolean(p));
      } catch {
        // fallback
      }
    }
    return photo ? [photo] : [];
  }, [photo]);

  // Si multi-photos, rotation fluide des angles pendant le scan
  useEffect(() => {
    if (photoList.length <= 1) return;
    const t = setInterval(() => {
      setActiveImgIdx((prev) => (prev + 1) % photoList.length);
    }, 2200);
    return () => clearInterval(t);
  }, [photoList.length]);

  const currentPhoto = photoList[activeImgIdx] ?? photoList[0] ?? null;

  // Progression organique fluide simulant l'analyse dermo en direct
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        const add = Math.floor(Math.random() * 8) + 3;
        return Math.min(95, prev + add);
      });
    }, 1200);

    return () => clearInterval(timer);
  }, []);

  // Défilement des 4 phases de diagnostic
  useEffect(() => {
    const phaseTimer = setInterval(() => {
      setActivePhase((prev) => (prev + 1) % SCAN_PHASES.length);
    }, 3800);

    return () => clearInterval(phaseTimer);
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto py-4 sm:py-6 space-y-6">
      {/* En-tête statut & progression */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold-text text-xs font-bold shadow-sm">
          <Scan className="size-3.5 animate-pulse" />
          <span>Analyse Dermo-Optique en Cabine</span>
          <span className="text-[10px] font-mono opacity-80">({zoneLabel})</span>
        </div>

        <h3 className="font-heading font-black text-xl sm:text-2xl text-foreground">
          {clientName ? `Bilan de ${clientName.split(" ")[0]}` : "Diagnostic en cours…"}
        </h3>

        <AnimatePresence mode="wait">
          <motion.p
            key={analysisMsg || activePhase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="text-xs sm:text-sm text-gold-text font-medium min-h-[20px]"
          >
            {analysisMsg || SCAN_PHASES[activePhase].title}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Cadre de Numérisation Haute Définition avec Balayage Laser */}
      <div className="relative mx-auto w-64 sm:w-72 aspect-square rounded-3xl overflow-hidden border-2 border-gold/60 shadow-[0_0_35px_rgba(200,149,30,0.25)] bg-[#120B06]">
        {/* Photo ou silhouette */}
        {currentPhoto ? (
          <div className="relative w-full h-full">
            <img
              src={currentPhoto}
              alt={`Zone ${zoneLabel}`}
              className="w-full h-full object-cover filter contrast-105 brightness-95 transition-opacity duration-300"
            />
            {photoList.length > 1 && (
              <div className="absolute top-2.5 left-2.5 z-10 bg-black/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-gold/40 text-[10px] font-mono font-bold text-gold shadow-sm">
                Vue {activeImgIdx + 1}/{photoList.length}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full grid place-items-center bg-gradient-to-b from-[#241A10] to-[#120B06] text-gold/40">
            <div className="relative grid place-items-center">
              <Stethoscope className="size-20 stroke-[1.2] text-gold/30 animate-pulse" />
              <span className="mt-3 font-mono text-[11px] uppercase tracking-widest text-gold/60">
                Cartographie {zoneLabel}
              </span>
            </div>
          </div>
        )}

        {/* Grille holographique en surimpression */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,#C8951E_1px,transparent_1px),linear-gradient(to_bottom,#C8951E_1px,transparent_1px)] bg-[size:18px_18px]"
          aria-hidden="true"
        />

        {/* Faisceau de balayage laser doré (Scan Beam) */}
        <motion.div
          className="absolute left-0 right-0 h-16 pointer-events-none"
          animate={{
            top: ["-10%", "85%", "-10%"],
          }}
          transition={{
            duration: 3.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div className="w-full h-full bg-gradient-to-b from-transparent via-gold/45 to-transparent relative">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FFF4D0] to-transparent shadow-[0_0_12px_#FFF9EC]" />
          </div>
        </motion.div>

        {/* Cibles holographiques (Biomarker Reticles) */}
        {SCAN_TARGETS.map((t) => (
          <motion.div
            key={t.id}
            style={{ left: `${t.x}%`, top: `${t.y}%` }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0.9, 1.15, 0.9],
              opacity: [0.7, 1, 0.7],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              delay: t.delay,
              ease: "easeInOut",
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center"
          >
            {/* Réticule circulaire tournant */}
            <div className="relative size-7 rounded-full border border-gold shadow-[0_0_8px_rgba(200,149,30,0.8)] grid place-items-center">
              <div className="size-1.5 rounded-full bg-gold animate-ping" />
              <div className="absolute inset-[-3px] rounded-full border border-dashed border-gold/40 animate-spin-slow" />
            </div>
            <span className="mt-1 font-mono text-[8px] font-bold text-black bg-gold/90 px-1 py-0.5 rounded tracking-tight backdrop-blur-sm whitespace-nowrap shadow">
              {t.label}
            </span>
          </motion.div>
        ))}

        {/* Coins de ciblage dermo optique (Corner brackets) */}
        <div className="absolute top-2 left-2 size-5 border-t-2 border-l-2 border-gold rounded-tl-lg pointer-events-none" />
        <div className="absolute top-2 right-2 size-5 border-t-2 border-r-2 border-gold rounded-tr-lg pointer-events-none" />
        <div className="absolute bottom-2 left-2 size-5 border-b-2 border-l-2 border-gold rounded-bl-lg pointer-events-none" />
        <div className="absolute bottom-2 right-2 size-5 border-b-2 border-r-2 border-gold rounded-br-lg pointer-events-none" />

        {/* Badge pourcentage dans le coin */}
        <div className="absolute bottom-2.5 right-2.5 bg-black/80 backdrop-blur-md rounded-lg px-2 py-0.5 border border-gold/30 text-gold-text font-mono text-[10.5px] font-bold">
          {progress} %
        </div>
      </div>

      {/* Barre de progression globale */}
      <div className="space-y-1.5 px-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-gold" />
            <span>Moteur dermo-botanique Kènè VLM</span>
          </span>
          <span className="font-mono font-bold text-foreground">{progress} %</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden border border-border">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-gold via-amber-400 to-terre"
            style={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: 0.4 }}
          />
        </div>
      </div>

      {/* Cartes des 4 phases avec validation en direct */}
      <div className="grid grid-cols-1 gap-2 pt-1">
        {SCAN_PHASES.map((p, idx) => {
          const isDone = idx < activePhase;
          const isCurrent = idx === activePhase;
          const Icon = p.icon;

          return (
            <div
              key={p.step}
              className={cn(
                "p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3",
                isCurrent
                  ? "border-gold/50 bg-gold/10 shadow-sm"
                  : isDone
                  ? "border-border/60 bg-card/60 opacity-85"
                  : "border-border/40 bg-muted/20 opacity-50"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={cn(
                    "grid place-items-center size-7 rounded-lg shrink-0 text-xs font-bold",
                    isCurrent
                      ? "bg-gold text-primary-foreground shadow"
                      : isDone
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isDone ? <CheckCircle2 className="size-4" /> : <Icon className="size-3.5" />}
                </span>
                <div className="min-w-0">
                  <p className="font-heading font-bold text-xs truncate text-foreground">
                    {p.title}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground truncate">
                    {p.desc}
                  </p>
                </div>
              </div>

              <div className="shrink-0 font-mono text-[10px] font-semibold">
                {isDone ? (
                  <span className="text-success">OK</span>
                ) : isCurrent ? (
                  <span className="text-gold-text animate-pulse">En cours…</span>
                ) : (
                  <span className="text-muted-foreground/60">Attente</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
        Ce scan de cabine fusionne les déclarations de l&apos;entretien avec la lecture de la photo pour générer le protocole de soin et la modélisation 3D de la peau.
      </p>
    </div>
  );
}
