"use client";
// Kènè — hook i18n: t(clé) avec repli français, langue courante + setLang.
// La relecture du localStorage (skipHydration) se déclenche au montage du
// premier composant qui utilise useT: le rendu serveur ET l'hydratation
// passent en français, l'interface adopte la langue choisie juste après —
// sans mismatch d'hydratation (même pattern que introState).
import { useEffect } from "react";
import { translate, type Lang } from "@/lib/kene/i18n";
import { useLang } from "@/store/lang";

export function useT(): {
  t: (key: string) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
} {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);

  // Rehydratation paresseuse et idempotente: le premier montage relit le
  // localStorage persisté, les suivants ne font que confirmer (no-op).
  useEffect(() => {
    void useLang.persist.rehydrate();
  }, []);

  return {
    lang,
    setLang,
    t: (key: string) => translate(lang, key),
  };
}
