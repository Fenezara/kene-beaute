"use client";
// Kènè — Fil de Kente: choix du mode de rendu de la bande tissée
// (3D interactive ou fallback CSS statique). Même pattern que
// skintwin/mode.ts (useSyncExternalStore, décision unique côté client).
import { useSyncExternalStore } from "react";

export type WeaveMode = "pending" | "3d" | "static";

let cachedMode: "3d" | "static" | null = null;

function computeWeaveMode(): "3d" | "static" {
  if (typeof window === "undefined") return "static"; // sécurité — jamais appelé côté serveur
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static";
  const h = window.location.hash;
  if (h === "#weave-static" || h === "#twin-static") return "static"; // QA: forcer le fallback
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return "static";
  } catch {
    return "static";
  }
  return "3d";
}

const getModeSnapshot = (): "3d" | "static" => {
  if (cachedMode === null) cachedMode = computeWeaveMode();
  return cachedMode;
};

const noopSubscribe = () => () => {};

export function useWeaveMode(): WeaveMode {
  return useSyncExternalStore<WeaveMode>(noopSubscribe, getModeSnapshot, () => "pending");
}
