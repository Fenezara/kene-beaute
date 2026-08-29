"use client";
// Kènè — store global (espaces, session, panier)
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/lib/kene/types";

export type Space = "client" | "pro" | "admin";
export type ClientTab = "accueil" | "diagnostic" | "boutique" | "rdv" | "chat" | "profil";

export interface SessionUser {
  id: string;
  phone: string;
  name: string;
  role: string;
  city?: string | null;
  skinType?: string | null;
  fitzpatrick?: string | null;
  allergies?: string | null;
  consentHealth?: boolean;
}

interface KeneState {
  space: Space;
  clientTab: ClientTab;
  user: SessionUser | null;
  cart: CartLine[];
  proTenantId: string | null; // tenant courant de l'espace Pro (démo)
  lastDiagnosisId: string | null;
  setSpace: (s: Space) => void;
  setClientTab: (t: ClientTab) => void;
  setUser: (u: SessionUser | null) => void;
  addToCart: (line: CartLine) => void;
  setCartQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  setProTenantId: (id: string) => void;
  setLastDiagnosisId: (id: string | null) => void;
}

export const useKene = create<KeneState>()(
  persist(
    (set) => ({
      space: "client",
      clientTab: "accueil",
      user: null,
      cart: [],
      proTenantId: null,
      lastDiagnosisId: null,
      setSpace: (space) => set({ space }),
      setClientTab: (clientTab) => set({ clientTab }),
      setUser: (user) => set({ user }),
      addToCart: (line) =>
        set((s) => {
          const existing = s.cart.find((l) => l.productId === line.productId);
          if (existing) {
            return {
              cart: s.cart.map((l) =>
                l.productId === line.productId ? { ...l, qty: l.qty + line.qty } : l
              ),
            };
          }
          return { cart: [...s.cart, line] };
        }),
      setCartQty: (productId, qty) =>
        set((s) => ({
          cart: qty <= 0 ? s.cart.filter((l) => l.productId !== productId) : s.cart.map((l) => (l.productId === productId ? { ...l, qty } : l)),
        })),
      clearCart: () => set({ cart: [] }),
      setProTenantId: (proTenantId) => set({ proTenantId }),
      setLastDiagnosisId: (lastDiagnosisId) => set({ lastDiagnosisId }),
    }),
    {
      name: "kene-store",
      partialize: (s) => ({ space: s.space, user: s.user, cart: s.cart, proTenantId: s.proTenantId, clientTab: s.clientTab }),
    }
  )
);
