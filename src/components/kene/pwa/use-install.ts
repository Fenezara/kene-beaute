"use client";
// Kènè — hook partagé d'installation PWA (bannière d'accueil + bouton Profil).
// beforeinstallprompt ne peut être capturé qu'une fois par session : l'événement
// est gardé dans un singleton module-level (l'abonnement survit aux
// montage/démontage des écrans), exposé via useSyncExternalStore.
// standalone (media query display-mode) et iOS (userAgent) sont aussi des
// valeurs de systèmes externes → même patron, zéro setState-in-effect.

import { useCallback, useSyncExternalStore } from "react";

/** Événement beforeinstallprompt (non standard, absent de lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const promptListeners = new Set<() => void>();
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listening = false;

function notifyPrompt(): void {
  promptListeners.forEach((listener) => listener());
}

/** Enregistre (une seule fois) les listeners globaux de capture. */
function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyPrompt();
  });

  // Installée : l'événement ne reviendra plus, on purge partout.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyPrompt();
  });
}

/* ─── Store externe : prompt d'installation natif ─── */

function subscribePrompt(callback: () => void): () => void {
  ensureListening();
  promptListeners.add(callback);
  return () => {
    promptListeners.delete(callback);
  };
}

function getPromptSnapshot(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

function getServerPrompt(): BeforeInstallPromptEvent | null {
  return null;
}

/* ─── Store externe : app lancée en standalone ? ─── */

function subscribeStandalone(callback: () => void): () => void {
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/** App déjà lancée depuis l'écran d'accueil (display-mode: standalone) ? */
export function detectStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS historique
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getServerStandalone(): boolean {
  return false;
}

/* ─── Store externe : terminal iOS (constant par session) ─── */

function subscribeNothing(): () => void {
  return () => {};
}

/** iPhone / iPad / iPod — pas de beforeinstallprompt sur iOS, il faut le menu Partager. */
export function detectIOS(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ se masque en « Macintosh » avec touch points.
  const ipadMasked = /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || ipadMasked;
}

function getServerIOS(): boolean {
  return false;
}

export interface InstallPromptApi {
  /** Un prompt natif est prêt à être affiché (Android/Chrome, Edge…). */
  canInstall: boolean;
  /** Déclenche le prompt natif. Résout true si l'utilisateur a accepté. */
  promptInstall: () => Promise<boolean>;
  /** App déjà installée/lançée en standalone. */
  isStandalone: boolean;
  /** Terminal iOS (installation manuelle via Partager). */
  isIOS: boolean;
}

export function useInstallPrompt(): InstallPromptApi {
  const promptEvent = useSyncExternalStore(subscribePrompt, getPromptSnapshot, getServerPrompt);
  const isStandalone = useSyncExternalStore(subscribeStandalone, detectStandalone, getServerStandalone);
  const isIOS = useSyncExternalStore(subscribeNothing, detectIOS, getServerIOS);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const prompt = deferredPrompt ?? promptEvent;
    if (!prompt) return false;
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        // appinstalled arrivera aussi ; on purge tout de suite pour masquer
        // la bannière sans attendre.
        deferredPrompt = null;
        notifyPrompt();
      }
      return outcome === "accepted";
    } catch {
      return false;
    }
  }, [promptEvent]);

  return {
    canInstall: !!promptEvent && !isStandalone,
    promptInstall,
    isStandalone,
    isIOS,
  };
}
