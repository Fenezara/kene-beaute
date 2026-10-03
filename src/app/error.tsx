"use client";
// Kènè — Error Boundary racine (App Router): attrape les erreurs de rendu de
// la page et remplace l'écran blanc par un fallback brandé, rassurant et
// actionnable. Aucune fuite technique (message/stack jamais affichés —
// l'erreur est logguée en console pour le débogage, le reste reste sobre).
// Note: les erreurs du root layout lui-même relèvent de global-error.tsx
// (non nécessaire ici — le layout ne contient que ThemeProvider + polices).

import { useEffect } from "react";
import { HeartHandshake, RefreshCw, RotateCcw } from "lucide-react";
import { KeneEmblemLockup } from "@/components/kene/icons";

export default function KeneError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Diagnostique en console (jamais dans l'UI — pas de fuite technique)
  useEffect(() => {
    console.error("[kene:error] erreur de rendu interceptée", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="min-h-dvh bg-background text-foreground grid place-items-center px-4 py-10"
    >
      <div className="w-full max-w-md flex flex-col items-center text-center gap-5">
        {/* Sceau officiel Kènè */}
        <KeneEmblemLockup size={52} sublabel="Beauté mélanoderme" />

        <span
          aria-hidden="true"
          className="grid place-items-center h-14 w-14 rounded-full bg-primary/10 text-primary"
        >
          <HeartHandshake size={26} />
        </span>

        <div className="space-y-2">
          <h1 className="sr-only">Une erreur est survenue</h1>
          <p className="font-heading font-bold text-xl sm:text-2xl">
            Oups — une erreur inattendue est survenue
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ce n&apos;est pas de ta faute. Tes données restent enregistrées sur
            ton téléphone — essaie de réafficher l&apos;écran, ou recharge la
            page si besoin.
          </p>
        </div>

        <div className="w-full flex flex-col sm:flex-row gap-3 sm:justify-center">
          <button
            type="button"
            onClick={reset}
            autoFocus
            className="h-12 px-6 inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground text-sm font-bold active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <RotateCcw size={18} aria-hidden="true" />
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-12 px-6 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card text-foreground text-sm font-bold hover:bg-accent active:scale-[0.98] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <RefreshCw size={18} aria-hidden="true" />
            Recharger la page
          </button>
        </div>
      </div>
    </div>
  );
}
