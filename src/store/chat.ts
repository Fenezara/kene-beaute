"use client";
// Kènè — conversation Dermo Kènè (chat), persistée par appareil.
// skipHydration: le HTML serveur et l'hydratation passent sur l'état initial
// (fil vide), le localStorage est relu AU PREMIER MONTAGE de ChatScreen
// (pattern use-t.ts / lang.ts) — zéro mismatch d'hydratation.
// Les photos (dataURL base64) ne sont JAMAIS persistées: partialize les
// retire — elles restent en mémoire de session uniquement (quota 5 Mo).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMsg } from "@/components/kene/client/types";

/** Nombre max de messages conservés (les plus vieux glissent hors du fil). */
const MAX_MESSAGES = 60;

/** Message d'accueil et d'engagement direct de Dermo Kènè.
 * Personnalisé avec le prénom et la ville, pose une question concrète pour initier l'échange. */
export function welcomeMsg(userName?: string | null, city?: string | null): ChatMsg {
  const name = userName ? userName.split(" ")[0] : "";
  const salutation = name ? `Bonjour ${name} ! 🌸` : "Bonjour ! 🌸";
  const loc = city || "Abidjan";
  return {
    id: "w1",
    role: "assistant",
    content: `${salutation} Je suis Dermo Kènè, votre conseillère dermo-cosmétique dédiée ici à ${loc}.\n\nJe viens aux nouvelles : comment se porte votre peau aujourd'hui ? Avez-vous remarqué des tiraillements, des taches pigmentaires, un excès de brillance ou souhaitez-vous un conseil routine sur-mesure ?\n\nÉchangez avec moi librement par message, note vocale 🎙️ ou montrez-moi votre peau en photo 📸. Que puis-je faire pour vous ?`,
    kind: "text",
    time: Date.now(),
  };
}

interface ChatState {
  /** Fil de discussion — persisté SANS les photos (voir partialize). */
  messages: ChatMsg[];
  /** Ajoute un message; re-seed WELCOME si le fil est vide; cap mémoire 60 */
  add: (msg: ChatMsg) => void;
  /** Vide le fil et re-sème le message d'accueil personnalisé. */
  reset: (userName?: string | null, city?: string | null) => void;
  /** Garantit que Dermo Kènè a obligatoirement engagé la conversation. */
  ensureEngaged: (userName?: string | null, city?: string | null) => void;
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      add: (msg) =>
        set((s) => {
          const base = s.messages.length > 0 ? s.messages : [welcomeMsg()];
          const next = [...base, msg];
          return { messages: next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next };
        }),
      reset: (userName, city) => set({ messages: [welcomeMsg(userName, city)] }),
      ensureEngaged: (userName, city) => {
        const current = get().messages;
        if (current.length === 0) {
          set({ messages: [welcomeMsg(userName, city)] });
        } else {
          const hasAssistant = current.some((m) => m.role === "assistant");
          if (!hasAssistant) {
            set({ messages: [welcomeMsg(userName, city), ...current] });
          }
        }
      },
    }),
    {
      name: "kene-chat",
      skipHydration: true,
      partialize: (s) => ({ messages: s.messages.map((m) => ({ ...m, photo: undefined, audioUrl: undefined })) }),
    }
  )
);
