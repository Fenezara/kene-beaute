"use client";
// Kènè — Déconnexion universelle et centralisée.
// Garantit la suppression complète des cookies côté serveur, du store Zustand,
// de toutes les clés localStorage / sessionStorage, et une redirection nette sans résidu.

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

  // 3. Purge explicite et intégrale du stockage persistant du navigateur
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("kene-store");
      window.localStorage.removeItem("kene-last-account");
      window.localStorage.removeItem("kene-security-storage");
      window.localStorage.removeItem("kene-favs");
      window.sessionStorage.clear();
    }
  } catch {}

  toast.info(message);

  // 4. Redirection complète avec rechargement de page pour purger tout état résiduel
  if (typeof window !== "undefined") {
    setTimeout(() => {
      window.location.replace(targetUrl);
    }, 150);
  }
}
