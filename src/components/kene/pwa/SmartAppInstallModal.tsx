"use client";
// Kènè — Modal interactif & immersif d'installation PWA 2026.
// Optimisé pour conversion maximale en Côte d'Ivoire / Sénégal :
// 1. Détection automatique du terminal (iOS Safari vs Android Chrome)
// 2. Guide visuel animé pas-à-pas (icône Partager Safari, 3 points Chrome)
// 3. Leviers de persuasion : +100 Fils d'Or offerts, caméra permanente, <1 Mo, hors-ligne
// 4. Déclenchement natif en 1 clic quand supporté (beforeinstallprompt)
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Smartphone,
  Share,
  PlusSquare,
  CheckCircle2,
  X,
  Camera,
  WifiOff,
  Zap,
  Gift,
  MoreVertical,
  Download,
  ShieldCheck,
  ChevronRight,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { KeneEmblem, NsorommaIcon, NeaOnnimIcon } from "@/components/kene/icons";
import { Button } from "@/components/ui/button";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useInstallPrompt } from "./use-install";


export interface SmartAppInstallModalProps {
  open: boolean;
  onClose: () => void;
  onInstalled?: () => void;
}

export const INSTALL_SNOOZE_KEY = "kene_install_snoozed_until";

export function snoozeInstallPrompt(days = 3) {
  try {
    const expireTime = Date.now() + days * 24 * 60 * 60 * 1000;
    localStorage.setItem(INSTALL_SNOOZE_KEY, expireTime.toString());
  } catch {}
}

export function isInstallSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(INSTALL_SNOOZE_KEY);
    if (!raw) return false;
    const expire = parseInt(raw, 10);
    return Date.now() < expire;
  } catch {
    return false;
  }
}

export function SmartAppInstallModal({
  open,
  onClose,
  onInstalled,
}: SmartAppInstallModalProps) {
  const { canInstall, promptInstall, isStandalone, isIOS } = useInstallPrompt();
  const [activeTab, setActiveTab] = useState<"ios" | "android">(isIOS ? "ios" : "android");
  const [installing, setInstalling] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (isIOS) setActiveTab("ios");
    else setActiveTab("android");
  }, [isIOS]);

  if (!open) return null;

  async function handleNativeInstall() {
    haptic(HAPTIC.tap);
    setInstalling(true);
    try {
      const accepted = await promptInstall();
      if (accepted) {
        haptic(HAPTIC.success);
        setCompleted(true);
        toast.success("Application Kènè installée avec succès ! 💛", {
          description: "+100 Fils d'Or crédités sur votre compte.",
        });
        onInstalled?.();
        setTimeout(() => {
          onClose();
        }, 2200);
      }
    } catch {
      toast.error("Impossible de lancer l'installation automatique.");
    } finally {
      setInstalling(false);
    }
  }

  function handleManualConfirm() {
    haptic(HAPTIC.success);
    setCompleted(true);
    toast.success("Bienvenue dans l'application Kènè VIP ! ✨", {
      description: "Profitez de votre expérience fluide et sécurisée.",
    });
    snoozeInstallPrompt(30);
    onInstalled?.();
    setTimeout(() => {
      onClose();
    }, 1800);
  }

  function handleSnooze() {
    haptic(HAPTIC.tap);
    snoozeInstallPrompt(3);
    toast.info("Rappel dans 3 jours.", {
      description: "Vous pouvez toujours installer l'application depuis les Paramètres.",
    });
    onClose();
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="relative w-full max-w-lg bg-card border border-border/80 rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        >
          {/* Header bannière dorée */}
          <div className="relative px-5 pt-6 pb-4 bg-gradient-to-b from-primary/15 via-gold/10 to-transparent border-b border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 h-9 w-9 rounded-full bg-background/80 hover:bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-xs"
              aria-label="Fermer"
            >
              <X size={17} />
            </button>

            <div className="flex items-center gap-3.5">
              <div className="relative">
                <KeneEmblem size={52} />
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[9px] font-black text-black ring-2 ring-background">
                  VIP
                </span>
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold-text text-[10px] font-bold tracking-wide uppercase">
                  <Sparkles size={11} className="animate-spin text-gold" />
                  Installation Recommandée
                </div>
                <h2 className="text-base sm:text-lg font-black text-foreground mt-0.5 tracking-tight">
                  Installez Kènè sur votre écran
                </h2>
                <p className="text-xs text-muted-foreground">
                  Moins de 1 Mo • S'ouvre comme une vraie appli
                </p>
              </div>
            </div>
          </div>

          {/* Corps défilable */}
          <div className="p-5 overflow-y-auto space-y-4 pretty-scroll">
            {/* Boîte des avantages clés (Leviers psychologiques) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl bg-gold/10 border border-gold/30 flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-gold/20 flex items-center justify-center shrink-0 text-gold-text">
                  <Gift size={16} />
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-foreground leading-tight">
                    +100 Fils d&apos;Or
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Crédités dès l&apos;installation
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                  <Camera size={16} />
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-foreground leading-tight">
                    Caméra Permanente
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Zéro popup répétitive
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-background border border-border/80 flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0 text-foreground">
                  <Zap size={16} />
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-foreground leading-tight">
                    Ultra Léger &lt; 1 Mo
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Ne sature pas la mémoire
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-background border border-border/80 flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0 text-foreground">
                  <WifiOff size={16} />
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-foreground leading-tight">
                    100% Hors-ligne
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Routines &amp; bilans accessibles
                  </p>
                </div>
              </div>
            </div>

            {/* Sélecteur OS si l'utilisateur veut basculer */}
            <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-xl border border-border text-xs">
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  setActiveTab("ios");
                }}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-center transition-all ${
                  activeTab === "ios"
                    ? "bg-card text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🍏 iPhone / iPad (Safari)
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  setActiveTab("android");
                }}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-center transition-all ${
                  activeTab === "android"
                    ? "bg-card text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🤖 Android / Chrome
              </button>
            </div>

            {/* Guide interactif selon l'OS */}
            {activeTab === "ios" ? (
              <div className="space-y-3 bg-muted/30 p-4 rounded-2xl border border-border/60">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <Smartphone size={14} className="text-primary" />
                    Installation sur iPhone en 3 gestes :
                  </p>
                  <span className="text-[10px] font-mono text-muted-foreground">Safari iOS</span>
                </div>

                <div className="space-y-2.5">
                  {/* Étape 1 */}
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-card border border-border/70 shadow-xs">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black shrink-0">
                      1
                    </span>
                    <div className="flex-1 text-xs">
                      <p className="font-bold text-foreground">
                        Touchez le bouton <span className="text-primary font-black underline decoration-primary/50">Partager</span> dans la barre Safari
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        L&apos;icône avec le carré et la flèche vers le haut <span className="inline-flex items-center px-1 py-0.5 rounded bg-muted font-bold text-foreground mx-1"><Share size={11} className="mr-0.5" /> Partager</span> en bas de votre écran.
                      </p>
                    </div>
                  </div>

                  {/* Étape 2 */}
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-card border border-border/70 shadow-xs">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black shrink-0">
                      2
                    </span>
                    <div className="flex-1 text-xs">
                      <p className="font-bold text-foreground">
                        Faites défiler vers le bas et touchez
                      </p>
                      <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg bg-gold/15 border border-gold/40 text-gold-text font-bold text-[11px]">
                        <PlusSquare size={13} />
                        « Sur l&apos;écran d&apos;accueil »
                      </div>
                    </div>
                  </div>

                  {/* Étape 3 */}
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-card border border-border/70 shadow-xs">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black shrink-0">
                      3
                    </span>
                    <div className="flex-1 text-xs">
                      <p className="font-bold text-foreground">
                        Touchez <span className="font-black text-primary">« Ajouter »</span> en haut à droite
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        L&apos;icône Kènè apparaîtra instantanément avec vos autres applications.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Validation manuelle iPhone */}
                <Button
                  onClick={handleManualConfirm}
                  className="w-full h-11 rounded-xl bg-gold text-black font-extrabold text-xs shadow-md hover:bg-gold/90 transition-all flex items-center justify-center gap-2 mt-2"
                >
                  <CheckCircle2 size={16} />
                  J&apos;ai ajouté Kènè sur mon écran d&apos;accueil
                </Button>
              </div>
            ) : (
              <div className="space-y-3 bg-muted/30 p-4 rounded-2xl border border-border/60">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <Smartphone size={14} className="text-primary" />
                    Installation Android &amp; Chrome :
                  </p>
                  <span className="text-[10px] font-mono text-muted-foreground">Chrome / Samsung</span>
                </div>

                {canInstall ? (
                  <div className="p-3 bg-card rounded-xl border border-primary/30 space-y-2 text-center">
                    <p className="text-xs font-bold text-foreground">
                      Votre navigateur est 100% compatible avec l&apos;installation directe !
                    </p>
                    <Button
                      onClick={handleNativeInstall}
                      disabled={installing}
                      className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black text-sm shadow-lg hover:bg-primary/95 transition-all flex items-center justify-center gap-2"
                    >
                      <Download size={17} />
                      {installing ? "Installation en cours..." : "📲 Installer en 1 Clic Maintenant"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Étape 1 Android */}
                    <div className="flex items-start gap-3 p-2.5 rounded-xl bg-card border border-border/70 shadow-xs">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black shrink-0">
                        1
                      </span>
                      <div className="flex-1 text-xs">
                        <p className="font-bold text-foreground">
                          Touchez les <span className="text-primary font-black">3 petits points</span> en haut à droite
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Menu <MoreVertical size={13} className="inline text-foreground" /> de Google Chrome ou Samsung Internet.
                        </p>
                      </div>
                    </div>

                    {/* Étape 2 Android */}
                    <div className="flex items-start gap-3 p-2.5 rounded-xl bg-card border border-border/70 shadow-xs">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-black shrink-0">
                        2
                      </span>
                      <div className="flex-1 text-xs">
                        <p className="font-bold text-foreground">
                          Sélectionnez dans la liste
                        </p>
                        <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg bg-gold/15 border border-gold/40 text-gold-text font-bold text-[11px]">
                          <Download size={13} />
                          « Installer l&apos;application » ou « Ajouter à l&apos;écran d&apos;accueil »
                        </div>
                      </div>
                    </div>

                    {/* Bouton de confirmation Android */}
                    <Button
                      onClick={handleManualConfirm}
                      className="w-full h-11 rounded-xl bg-gold text-black font-extrabold text-xs shadow-md hover:bg-gold/90 transition-all flex items-center justify-center gap-2 mt-2"
                    >
                      <CheckCircle2 size={16} />
                      C&apos;est fait, l&apos;application est installée !
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer avec rappel et fermeture souple */}
          <div className="p-4 bg-muted/40 border-t border-border/60 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={handleSnooze}
              className="text-muted-foreground hover:text-foreground text-[11px] underline underline-offset-4 cursor-pointer"
            >
              Me rappeler dans 3 jours
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs h-8 text-foreground"
            >
              Fermer
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
