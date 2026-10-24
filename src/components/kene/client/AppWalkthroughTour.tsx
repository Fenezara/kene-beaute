"use client";
// Kènè — Visite guidée immersive de l'application (Tour 2026).
// Présentation pas-à-pas des 4 piliers d'excellence Kènè :
// 1. Diagnostic Visia IA (phototypes IV à VI)
// 2. Routine Botanique & Fil du Retour
// 3. Instituts Partenaires & RDV cabine
// 4. Dr. Kènè à la Voix & Scanner INCI anti-éclaircissants
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanFace,
  Sparkles,
  Leaf,
  CalendarCheck2,
  Mic,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  X,
  CheckCircle2,
  Rocket,
  Compass,
} from "lucide-react";
import { KeneEmblem, NeaOnnimIcon, DuafeIcon, SankofaIcon } from "@/components/kene/icons";
import { Button } from "@/components/ui/button";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useKene } from "@/store/kene";

export const TOUR_STORAGE_KEY = "kene_walkthrough_completed";

export interface AppWalkthroughTourProps {
  open?: boolean;
  onClose?: () => void;
  forceShow?: boolean;
}

interface TourStep {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  pillColor: string;
  hint: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "diagnostic",
    badge: "Étape 1 / 4 • IA Cutanée",
    title: "Diagnostic Visia IA Précis",
    subtitle: "Calibré spécialement pour les peaux mélanodermes (IV à VI)",
    description:
      "Prenez une photo en 30 secondes. Notre intelligence artificielle analyse en profondeur l'hyperpigmentation, les taches résiduelles, le sébum, les pores et la fermeté, sans jamais fausser votre carnation naturelle.",
    icon: <ScanFace className="size-10 sm:size-12 text-primary animate-pulse" />,
    gradient: "from-primary/20 via-primary/5 to-transparent",
    pillColor: "bg-primary/15 text-primary border-primary/30",
    hint: "Accessible via le gros bouton 'Scanner' au centre de votre écran.",
  },
  {
    id: "routine",
    badge: "Étape 2 / 4 • Cosmétique Bio-Active",
    title: "Routine Botanique & Fil du Retour",
    subtitle: "Actifs africains nobles adaptés au climat tropical",
    description:
      "Chaleur humide d'Abidjan ou harmattan sec de Dakar ? Kènè compose votre protocole matin et soir sur-mesure (Karité pur, Huile de Balanites, Néroli, Hibiscus) et suit l'évolution de vos résultats dans le temps.",
    icon: <Leaf className="size-10 sm:size-12 text-emerald-500" />,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    pillColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    hint: "Retrouvez vos ordonnances et votre historique dans 'Mon Dossier'.",
  },
  {
    id: "instituts",
    badge: "Étape 3 / 4 • Soins Professionnels",
    title: "Instituts Certifiés & RDV Cabine",
    subtitle: "Le savoir-faire dermo-esthétique près de chez vous",
    description:
      "Besoin d'un hydro-facial, d'un peeling doux ou d'un massage drainant ? Réservez en 2 clics dans les meilleurs salons et instituts partenaires formés aux protocoles dermo-cosmétiques Kènè.",
    icon: <CalendarCheck2 className="size-10 sm:size-12 text-gold-text" />,
    gradient: "from-gold/20 via-gold/5 to-transparent",
    pillColor: "bg-gold/15 text-gold-text border-gold/30",
    hint: "Consultez l'annuaire des salons partenaires dans l'onglet 'Agenda'.",
  },
  {
    id: "dr-kene",
    badge: "Étape 4 / 4 • Assistance 24/7",
    title: "Dr. Kènè Vocale & Scanner INCI",
    subtitle: "Votre conseillère experte disponible jour et nuit",
    description:
      "Posez toutes vos questions par commande vocale sans les mains. Utilisez aussi notre scanner INCI pour détecter instantanément les substances dangereuses (hydroquinone, dermocorticoïdes, mercure).",
    icon: <ShieldAlert className="size-10 sm:size-12 text-[#9E2045]" />,
    gradient: "from-[#9E2045]/20 via-[#9E2045]/5 to-transparent",
    pillColor: "bg-[#9E2045]/15 text-[#9E2045] dark:text-[#F77698] border-[#9E2045]/30",
    hint: "Touchez le micro pour parler ou le badge 'Scanner INCI' en haut.",
  },
];

export function AppWalkthroughTour({
  open: controlledOpen,
  onClose,
  forceShow = false,
}: AppWalkthroughTourProps) {
  const setClientTab = useKene((s) => s.setClientTab);
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (controlledOpen !== undefined) {
      setIsOpen(controlledOpen);
      return;
    }

    if (forceShow) {
      setIsOpen(true);
      return;
    }

    // Affichage doux au premier lancement (si pas déjà complété)
    try {
      const completed = localStorage.getItem(TOUR_STORAGE_KEY);
      if (!completed) {
        // Petit délai pour laisser l'interface charger sereinement
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 1200);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, [controlledOpen, forceShow]);

  function handleClose() {
    haptic(HAPTIC.tap);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {}
    setIsOpen(false);
    onClose?.();
  }

  function handleNext() {
    haptic(HAPTIC.tap);
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleCompleteAndScan();
    }
  }

  function handlePrev() {
    haptic(HAPTIC.tap);
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  function handleCompleteAndScan() {
    haptic(HAPTIC.success);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {}
    setIsOpen(false);
    onClose?.();
    setClientTab("diagnostic");
  }

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="relative w-full max-w-lg bg-card border border-border/80 rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Lueur d'ambiance dynamique */}
          <div
            className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-gradient-to-b ${step.gradient} blur-3xl opacity-70 transition-all duration-500`}
          />

          {/* Barre supérieure : Logo, étape & fermeture */}
          <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-2">
            <div className="flex items-center gap-2.5">
              <KeneEmblem size={38} />
              <div>
                <span className="text-xs font-black tracking-tight text-foreground block">
                  Visite Guidée Kènè
                </span>
                <span className="text-[10.5px] text-muted-foreground block font-mono">
                  Étape {currentStep + 1} sur {TOUR_STEPS.length}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="h-8 w-8 rounded-full bg-muted/60 hover:bg-muted border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              aria-label="Passer la visite"
              title="Passer la visite"
            >
              <X size={15} />
            </button>
          </div>

          {/* Barres de progression */}
          <div className="relative z-10 flex items-center gap-1.5 px-6 pt-2 pb-4">
            {TOUR_STEPS.map((_, idx) => (
              <div
                key={idx}
                onClick={() => {
                  haptic(HAPTIC.tap);
                  setCurrentStep(idx);
                }}
                className={`h-1.5 flex-1 rounded-full cursor-pointer transition-all duration-300 ${
                  idx === currentStep
                    ? "bg-gold shadow-xs"
                    : idx < currentStep
                    ? "bg-gold/40"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Contenu principal animé selon l'étape */}
          <div className="relative z-10 px-6 py-2 overflow-hidden min-h-[290px] sm:min-h-[310px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.24 }}
                className="space-y-4"
              >
                {/* Icône & badge de l'étape */}
                <div className="flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center shrink-0">
                    {step.icon}
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${step.pillColor}`}
                    >
                      {step.badge}
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-foreground mt-1 tracking-tight leading-snug">
                      {step.title}
                    </h3>
                  </div>
                </div>

                {/* Sous-titre & description */}
                <div>
                  <p className="text-xs font-bold text-gold-text">
                    {step.subtitle}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Astuce d'action concrète */}
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-[11px] text-foreground font-semibold flex items-center gap-2">
                  <Compass size={14} className="text-gold shrink-0" />
                  <span>{step.hint}</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer commandes de navigation */}
          <div className="relative z-10 p-6 pt-3 bg-card border-t border-border/50 flex items-center justify-between gap-3">
            {currentStep > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                className="rounded-xl h-10 px-3.5 text-xs font-bold gap-1.5"
              >
                <ArrowLeft size={14} />
                Précédent
              </Button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 font-medium"
              >
                Passer la visite
              </button>
            )}

            {currentStep < TOUR_STEPS.length - 1 ? (
              <Button
                size="sm"
                onClick={handleNext}
                className="rounded-xl h-10 px-5 text-xs font-black bg-foreground text-background hover:bg-foreground/90 gap-1.5 shadow-sm"
              >
                Suivant
                <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleCompleteAndScan}
                className="rounded-xl h-11 px-5 text-xs font-black bg-gold text-black hover:bg-gold/90 gap-2 shadow-md"
              >
                <Rocket size={15} />
                Commencer mon Diagnostic
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
