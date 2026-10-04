"use client";
// Kènè — langue de l'interface (i18n UI): fr (Français standard).
// Store séparé du store applicatif (kene.ts): la langue est une préférence
// transverse, indépendante de la session et du panier.
// skipHydration: le HTML serveur est rendu en français (état initial), la
// valeur persistée est relue APRÈS montage (voir useT) — zéro mismatch
// d'hydratation, l'interface bascule juste après le premier rendu.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang } from "@/lib/kene/i18n";

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useLang = create<LangState>()(
  persist(
    (set) => ({
      lang: "fr",
      setLang: (lang) => set({ lang }),
    }),
    {
      name: "kene-lang",
      skipHydration: true,
    }
  )
);
