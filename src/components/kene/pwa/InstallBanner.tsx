"use client";
// Kènè — bannière d'installation PWA (haut du fil d'accueil).
// Android/Chrome: capture beforeinstallprompt → prompt natif.
// iOS: pas de prompt natif → bouton qui déplie les instructions
// « Partager → Sur l'écran d'accueil » (après ~3 s sans événement natif).
// Fermée → localStorage « kene-install-dismissed », plus jamais réaffichée.
// Masquée si l'app tourne déjà en standalone ou vient d'être installée.

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { Download, Share, X } from "lucide-react";
import { toast } from "sonner";
import { KeneEmblem } from "@/components/kene/icons";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "./use-install";

const DISMISS_KEY = "kene-install-dismissed";

/* ─── Store externe: bannière fermée (localStorage / sessionStorage) ─── */

function subscribeDismiss(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readDismissed(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return true;
    const val = window.localStorage.getItem(DISMISS_KEY);
    if (!val) return false;
    const ts = parseInt(val, 10);
    if (!isNaN(ts)) {
      // Masquage temporaire de 24h au maximum après avoir cliqué sur la croix
      return Date.now() - ts < 24 * 60 * 60 * 1000;
    }
    // Ancienne valeur statique "1" : on la purge pour permettre le réaffichage
    window.localStorage.removeItem(DISMISS_KEY);
    return false;
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
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onAppInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // Visible si l'app n'est pas encore installée (non-standalone), non fermée
  const visible = !isStandalone && !installed && !(storedDismissed || localDismissed);

  function dismiss() {
    setLocalDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
      window.localStorage.setItem(DISMISS_KEY, Date.now().toString());
      window.dispatchEvent(new Event("storage"));
    } catch {
      /* mode privé */
    }
  }

  async function onInstall() {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) toast.success("Kènè installée sur ton écran d'accueil 💛");
      return;
    }
    // Si pas de prompt natif immédiat (iOS, Firefox, webview...) → afficher les instructions
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
        {/* Sceau 2026 — le Médaillon Kènè sur la carte d'installation */}
        <KeneEmblem size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">Installe Kènè sur ton téléphone</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Accès en un tap, même hors-ligne</p>
        </div>
        <Button
          size="sm"
          onClick={() => void onInstall()}
          aria-expanded={helpOpen}
          aria-controls="kene-install-help"
          className="min-h-10 font-bold"
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

      {helpOpen && (
        <motion.div
          id="kene-install-help"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="mt-3 rounded-xl bg-muted/70 px-3 py-3 flex items-start gap-2.5">
            {isIOS ? (
              <>
                <Share size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-[11px] leading-relaxed">
                  Sur iPhone : appuyez sur le bouton <strong>Partager</strong> <span aria-hidden="true">⬆️</span>
                  <span className="sr-only">flèche vers le haut</span> puis sur «&nbsp;
                  <strong>Sur l&apos;écran d&apos;accueil</strong>&nbsp;».
                </p>
              </>
            ) : (
              <>
                <Download size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-[11px] leading-relaxed">
                  Dans le navigateur : appuyez sur le menu (les 3 points <strong>⋮</strong> ou Partager) puis sur «&nbsp;
                  <strong>Installer l&apos;application</strong>&nbsp;» ou «&nbsp;
                  <strong>Ajouter à l&apos;écran d&apos;accueil</strong>&nbsp;».
                </p>
              </>
            )}
          </div>
        </motion.div>
      )}
    </motion.section>
  );
}
