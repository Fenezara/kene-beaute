"use client";
// Kènè — écran d'amorçage plein cadre : affiché pendant la relecture du store
// persisté (gate d'hydratation kene-store, t. 63) et comme fallback de
// chargement des espaces Pro/Admin (next/dynamic, t. 63-a).
// min-h-dvh + bg-background : même fond que la racine → l'app qui remplace
// le squelette ne provoque aucun décalage de mise en page.

import { Loader2 } from "lucide-react";

export function BootSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="min-h-dvh bg-background grid place-items-center px-4"
    >
      <div className="flex flex-col items-center gap-4">
        {/* Wordmark — Ojuju via font-heading, or Kènè */}
        <p className="font-heading font-bold text-3xl tracking-wide text-primary">
          Kènè
        </p>
        <Loader2 size={22} className="animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Kènè démarre…</span>
      </div>
    </div>
  );
}
