"use client";
// Kènè — sécurité renforcée (2FA-lite): re-vérification par code OTP avant
// chaque paiement (boutique + acompte RDV), activable depuis le profil.
// Préférence locale par appareil (localStorage "kene-secure"),
// même pattern que kene-store — pas d'API, pas de DB.
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SecurityState {
 /** true = un code SMS est exigé avant chaque paiement, même téléphone dérobé */
  enabled: boolean;
  setEnabled: (b: boolean) => void;
}

export const useSecurity = create<SecurityState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: "kene-secure",
      partialize: (s) => ({ enabled: s.enabled }),
    }
  )
);
