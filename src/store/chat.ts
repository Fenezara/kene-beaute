"use client";
// Kènè — conversation Dr. Kènè (chat), persistée par appareil.
// skipHydration : le HTML serveur et l'hydratation passent sur l'état initial
// (fil vide), le localStorage est relu AU PREMIER MONTAGE de ChatScreen
// (pattern use-t.ts / lang.ts) — zéro mismatch d'hydratation.
// Les photos (dataURL base64) ne sont JAMAIS persistées : partialize les
// retire — elles restent en mémoire de session uniquement (quota 5 Mo).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMsg } from "@/components/kene/client/types";

/** Nombre max de messages conservés (les plus vieux glissent hors du fil). */
const MAX_MESSAGES = 60;

/** Message d'accueil de Dr. Kènè — seed du fil (et re-seed après reset).
 *  L'horodatage est posé au moment du seed (heure réelle de début de fil) ;
 *  une fois persisté, le w1 conserve son heure d'origine. */
function welcomeMsg(): ChatMsg {
  return {
    id: "w1",
    role: "assistant",
    content:
      "Bonjour ! Je suis Dr. Kènè, ton éducatrice cutanée. Pose-moi tes questions sur les peaux mélanodermes — taches, acné, hydratation, cheveux — ou envoie-moi une photo pour un premier avis orienté.",
    kind: "text",
    time: Date.now(),
  };
}

interface ChatState {
  /** Fil de discussion — persisté SANS les photos (voir partialize). */
  messages: ChatMsg[];
  /** Ajoute un message ; re-seed WELCOME si le fil est vide ; cap mémoire 60
   *  (les plus vieux glissent). La photo reste en mémoire de session. */
  add: (msg: ChatMsg) => void;
  /** Vide le fil et re-sème le message d'accueil. */
  reset: () => void;
}

export const useChat = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      add: (msg) =>
        set((s) => {
          const base = s.messages.length > 0 ? s.messages : [welcomeMsg()];
          const next = [...base, msg];
          return { messages: next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next };
        }),
      reset: () => set({ messages: [welcomeMsg()] }),
    }),
    {
      name: "kene-chat",
      skipHydration: true,
      // Messages SANS photo : la clé `photo` repasse à undefined → JSON.stringify
      // l'omet → jamais un octet de base64 dans localStorage.
      partialize: (s) => ({ messages: s.messages.map((m) => ({ ...m, photo: undefined })) }),
    }
  )
);
