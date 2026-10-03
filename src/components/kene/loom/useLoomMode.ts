"use client";
// Kènè — Mode Clair de Lune: le régulateur qualité PARTAGÉ de toutes
// les scènes 3D de l'app. Une seule question: cette connexion / cette
// appareille / cette utilisatrice peut-elle tisser en mouvement?
// • full → l'expérience 3D complète (Navette d'Or, Descente de Peau…)
// • moonlight → la variante statique élégante: mêmes contenus, mêmes
// informations, zéro animation — jamais un mur blanc.
// Déclencheurs Clair de Lune: prefers-reduced-motion, Save-Data, réseau
// 2G/3G (Network Information API), deviceMemory ≤ 2 Go, WebGL indisponible.
// #moonlight dans l'URL force le mode (QA E2E, même pattern que #intro-static).
//
// Décision client-only SANS setState dans un effet: useSyncExternalStore
// (snapshot serveur « pending » → hydratation cohérente). Le mode est calculé
// UNE fois puis mémoïsé — les conditions réseau ne sont pas re-sondées en
// cours de session (une visite en 2G ne bascule pas à mi-parcours).
import { useSyncExternalStore } from "react";

export type LoomMode = "pending" | "full" | "moonlight";

type Connish = { effectiveType?: string; saveData?: boolean };
type Navish = Navigator & { connection?: Connish; deviceMemory?: number };

let cached: "full" | "moonlight" | null = null;

function computeLoomMode(): "full" | "moonlight" {
  if (typeof window === "undefined") return "moonlight"; // sécurité getSnapshot serveur
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "moonlight";
  if (window.location.hash === "#moonlight") return "moonlight"; // QA
  const nav = navigator as Navish;
  const conn = nav.connection;
  if (conn?.saveData) return "moonlight"; // data-saver du navigateur
  const et = conn?.effectiveType ?? "";
  if (et === "slow-2g" || et === "2g" || et === "3g") return "moonlight"; // réseau contraint
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return "moonlight";
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return "moonlight";
  } catch {
    return "moonlight";
  }
  return "full";
}

const snapshot = (): "full" | "moonlight" => {
  if (cached === null) cached = computeLoomMode();
  return cached;
};

const subscribe = () => () => {};

/** Mode qualité partagé — à consommer dans les wrappers de scènes 3D. */
export function useLoomMode(): LoomMode {
  return useSyncExternalStore<LoomMode>(subscribe, snapshot, () => "pending");
}
