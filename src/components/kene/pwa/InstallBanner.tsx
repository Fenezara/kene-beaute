"use client";
// Kènè — bannière d'installation PWA (haut du fil d'accueil).
// Android/Chrome : capture beforeinstallprompt → prompt natif.
// iOS : pas de prompt natif → bouton qui déplie les instructions
// « Partager → Sur l'écran d'accueil » (après ~3 s sans événement natif).
// Fermée → localStorage « kene-install-dismissed », plus jamais réaffichée.
// Masquée si l'app tourne déjà en standalone ou vient d'être installée.

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { Share, X } from "lucide-react";
import { toast } from "sonner";
import { KeneLogo } from "@/components/kene/icons";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "./use-install";

const DISMISS_KEY = "kene-install-dismissed";
/** Délai avant de conclure « pas de prompt natif » (iOS / navigateurs sans support). */
const PROMPT_GRACE_MS = 3000;

/* ─── Store externe : bannière fermée (localStorage) ─── */

function subscribeDismiss(callback: () => void): () => void {
  // L'événement storage couvre la fermeture depuis un autre onglet.
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function serverDismissed(): boolean {
  return false;
}

export function InstallBanner() {
  const { canInstall, promptInstall, isStandalone, isIOS } = useInstallPrompt();

  const storedDismissed = useSyncExternalStore(subscribeDismiss, readDismissed, serverDismissed);
  const [localDismissed, setLocalDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [settled, setSettled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    // iOS : aucun beforeinstallprompt n'arrivera — on attend ~3 s avant de
    // conclure et d'afficher la variante « instructions iPhone ».
    const timer = window.setTimeout(() => setSettled(true), PROMPT_GRACE_MS);
    const onAppInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const showNative = canInstall && !installed;
  const showIOS = isIOS && settled && !canInstall && !installed;
  const visible = !(storedDismissed || localDismissed) && !isStandalone && (showNative || showIOS);

  function dismiss() {
    setLocalDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* mode privé : la fermeture reste valable pour la session */
    }
  }

  async function onInstall() {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) toast.success("Kènè installée sur ton écran d'accueil 💛");
      return;
    }
    // iOS (ou pas de prompt natif) → instructions.
    setHelpOpen((v) => !v);
  }

  if (!visible) return null;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      aria-label="Installer l'application Kènè"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <KeneLogo size={40} withText={false} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">Installe Kènè sur ton téléphone</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Accès en un tap, même hors-ligne</p>
        </div>
        <Button
          size="sm"
          onClick={() => void onInstall()}
          aria-expanded={showIOS ? helpOpen : undefined}
          aria-controls={showIOS ? "kene-ios-help" : undefined}
          className="min-h-10"
        >
          Installer
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Masquer la suggestion d'installation"
          className="grid place-items-center min-h-10 min-w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {showIOS && helpOpen && (
        <motion.div
          id="kene-ios-help"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="mt-3 rounded-xl bg-muted/70 px-3 py-3 flex items-start gap-2.5">
            <Share size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed">
              Sur iPhone : bouton <strong>Partager</strong> <span aria-hidden="true">⬆️</span>
              <span className="sr-only">flèche vers le haut</span> puis «&nbsp;
              <strong>Sur l&apos;écran d&apos;accueil</strong>&nbsp;».
            </p>
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}
