"use client";
// Kènè — écran d'amorçage plein cadre : affiché pendant la relecture du store
// persisté (gate d'hydratation kene-store, t. 63) et comme fallback de
// chargement des espaces Pro/Admin (next/dynamic, t. 63-a).
// min-h-dvh + bg-background : même fond que la racine → l'app qui remplace
// le squelette ne provoque aucun décalage de mise en page.
// ÉCLAT 2026 : flash volontairement sobre — depuis t. 75, le Sceau Kènè
// (emblème visage-ligne d'or, fond calé sur le token de page → sans couture)
// ouvre la session, complété du wordmark resserré et de la barre Shimmer
// vivante (aucune durée ni logique modifiées, aucun blur).

import { KeneEmblem } from "@/components/kene/icons";
import { Shimmer } from "@/components/kene/ui2026";

export function BootSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="min-h-dvh bg-background grid place-items-center px-4"
    >
      <div className="flex flex-col items-center gap-3.5">
        {/* Sceau de marque — le lockup complet attend l'app montée */}
        <KeneEmblem size={84} />
        {/* Wordmark éditorial — écho de la devise du KeneLogo (11px, très espacé) */}
        <p className="font-heading font-bold text-[11px] tracking-[0.24em] text-muted-foreground">
          Kènè
        </p>
        {/* Indicateur de chargement — remplace le spinner plat, même rôle */}
        <Shimmer className="h-1.5 w-24 rounded-full" />
        <span className="sr-only">Kènè démarre…</span>
      </div>
    </div>
  );
}
