"use client";
// Kènè — favoris produits (wishlist) côté cliente.
// Persistance locale par appareil (localStorage "kene-favorites"),
// même pattern que le store global kene-store — pas d'API, pas de DB.
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FavoritesState {
 /** ids des produits favoris, dans l'ordre d'ajout */
  favs: string[];
 /** Bascule le favori d'un produit — retourne le NOUVEL état (true = ajouté) */
  toggleFav: (id: string) => boolean;
 /** Lecture ponctuelle (dans un handler) — pour un rendu réactif, préfère
 * useFavorites((s) => s.favs.includes(id)): le sélecteur re-rend quand
 * l'état change, là où isFav est une référence stable. */
  isFav: (id: string) => boolean;
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favs: [],
      toggleFav: (id) => {
        const active = !get().favs.includes(id);
        set((s) => ({ favs: active ? [...s.favs, id] : s.favs.filter((f) => f !== id) }));
        return active;
      },
      isFav: (id) => get().favs.includes(id),
    }),
    {
      name: "kene-favorites",
      partialize: (s) => ({ favs: s.favs }),
    }
  )
);
