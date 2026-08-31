"use client";
// Kènè — état partagé de l'introduction (Fil de Kente).
// Pattern useSyncExternalStore : lecture localStorage SANS mismatch d'hydratation
// (snapshot serveur = false → l'intro est rendue puis corrigée après hydratation),
// notification même onglet via événement custom + multi-onglets via "storage".
import { useSyncExternalStore } from "react";

export const INTRO_KEY = "kene-intro-done";
const INTRO_EVENT = "kene:intro-done";

export function markIntroDone() {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    /* stockage indisponible — l'événement suffit pour la session courante */
  }
  window.dispatchEvent(new Event(INTRO_EVENT));
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === INTRO_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(INTRO_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(INTRO_EVENT, callback);
  };
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return true;
  }
}

/** true = introduction déjà vue → onboarding direct. */
export function useIntroDone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
