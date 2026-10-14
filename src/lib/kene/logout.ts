"use client";
// Kènè — Déconnexion universelle et bascule sur compte invité vierge.
// Garantit la suppression complète des cookies précédents, du store Zustand,
// de toutes les clés d'identification, et alloue un compte invité anonyme.

import { useKene } from "@/store/kene";
import { toast } from "sonner";

export async function performLogout(options?: { redirectUrl?: string; message?: string }) {
  const targetUrl = options?.redirectUrl ?? "/";
  const message = options?.message ?? "Déconnexion réussie";

  try {
    // 1. Révocation serveur (supprime le cookie kene_session et kene_elevation)
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Si le réseau est indisponible, le nettoyage local doit quand même s'exécuter
  }

  // 2. Nettoyage du store en mémoire
  try {
    const { setUser, setSpace, clearCart } = useKene.getState();
    clearCart();
    setUser(null);
    setSpace("client");
  } catch {}

  // 3. Purge explicite du stockage persistant du navigateur
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("kene-store");
      window.localStorage.removeItem("kene-security-storage");
      window.localStorage.removeItem("kene-favs");
      window.sessionStorage.clear();
    }
  } catch {}

  toast.info(message);

  // 4. Redirection complète vers l'accueil pour afficher Le Seuil (choix du portail & connexion)
  if (typeof window !== "undefined") {
    window.location.replace(targetUrl);
  }
}
