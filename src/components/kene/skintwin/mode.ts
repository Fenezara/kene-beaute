"use client";
// Kènè — Skin Twin : choix du mode de rendu (3D interactive ou fallback SVG statique).
// Pattern useSyncExternalStore (aucun setState dans un effet) : snapshot serveur
// « pending » → hydratation cohérente, décision prise une seule fois côté client.
import { useSyncExternalStore } from "react";

export type TwinMode = "pending" | "3d" | "static";

let cachedMode: "3d" | "static" | null = null;

function computeTwinMode(): "3d" | "static" {
  if (typeof window === "undefined") return "static"; // sécurité — jamais appelé côté serveur
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "static";
  if (window.location.hash === "#twin-static") return "static"; // QA : forcer le fallback
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return "static";
  } catch {
    return "static";
  }
  return "3d";
}

const getModeSnapshot = (): "3d" | "static" => {
  if (cachedMode === null) cachedMode = computeTwinMode();
  return cachedMode;
};

const noopSubscribe = () => () => {};

export function useTwinMode(): TwinMode {
  return useSyncExternalStore<TwinMode>(noopSubscribe, getModeSnapshot, () => "pending");
}
