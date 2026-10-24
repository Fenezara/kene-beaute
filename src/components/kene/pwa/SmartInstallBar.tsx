"use client";
// Kènè — Barre persistante & incitative d'installation PWA 2026.
// Visible tant que l'app n'est pas en standalone (installée) et non mise en veille.
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Download, X, HelpCircle, ChevronRight, Gift } from "lucide-react";
import { toast } from "sonner";
import { KeneEmblem } from "@/components/kene/icons";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useInstallPrompt } from "./use-install";
import { SmartAppInstallModal, isInstallSnoozed, snoozeInstallPrompt } from "./SmartAppInstallModal";

export function SmartInstallBar() {
  const { canInstall, promptInstall, isStandalone, isIOS } = useInstallPrompt();
  const [modalOpen, setModalOpen] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setSnoozed(isInstallSnoozed());
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  // Si déjà en standalone ou installée ou mise en pause temporaire
  if (isStandalone || installed || snoozed) {
    return (
      <SmartAppInstallModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onInstalled={() => setInstalled(true)}
      />
    );
  }

  async function handleQuickAction() {
    haptic(HAPTIC.tap);
    if (canInstall) {
      try {
        const accepted = await promptInstall();
        if (accepted) {
          haptic(HAPTIC.success);
          setInstalled(true);
          toast.success("Kènè installée avec succès ! 💛", {
            description: "+100 Fils d'Or crédités sur votre compte.",
          });
          return;
        }
      } catch {}
    }
    // Si iOS ou prompt natif indisponible, ouvrir le guide interactif
    setModalOpen(true);
  }

  function handleDismiss() {
    haptic(HAPTIC.tap);
    snoozeInstallPrompt(3);
    setSnoozed(true);
    toast.info("Rappel dans 3 jours.", {
      description: "Vous pouvez installer l'application à tout moment dans Paramètres.",
    });
  }

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3 }}
        aria-label="Installation de l'application Kènè"
        className="relative mb-3 overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-r from-card via-gold/10 to-card p-3 sm:p-3.5 shadow-sm"
      >
        {/* Lueur d'ambiance dorée */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-gold/15 blur-2xl" />

        <div className="flex items-center gap-3">
          {/* Logo Kènè */}
          <div className="relative shrink-0">
            <KeneEmblem size={44} />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[8.5px] font-black text-black">
              +
            </span>
          </div>

          {/* Textes incitatifs */}
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setModalOpen(true)}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-gold/20 text-gold-text text-[9.5px] font-black uppercase tracking-wider">
                <Gift size={10} className="text-gold" />
                +100 Fils d&apos;Or
              </span>
              <p className="text-xs sm:text-sm font-extrabold text-foreground truncate">
                Installez Kènè sur votre écran
              </p>
            </div>
            <p className="text-[10.5px] sm:text-[11.5px] text-muted-foreground mt-0.5 line-clamp-1">
              Caméra déverrouillée • Moins de 1 Mo • Accès hors-ligne
            </p>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleQuickAction}
              className="inline-flex items-center justify-center gap-1 rounded-xl bg-gold px-2.5 sm:px-3 py-1.5 text-xs font-black text-black shadow-xs hover:bg-gold/90 active:scale-95 transition-all cursor-pointer"
            >
              <Download size={13} className="shrink-0" />
              <span>{canInstall ? "Installer" : "Guide"}</span>
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center transition-all cursor-pointer"
              title="Masquer pendant 3 jours"
              aria-label="Fermer pour 3 jours"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </motion.section>

      {/* Modal interactif d'installation */}
      <SmartAppInstallModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onInstalled={() => setInstalled(true)}
      />
    </>
  );
}
