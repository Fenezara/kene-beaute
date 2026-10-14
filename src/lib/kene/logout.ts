"use client";
// Kènè — Déconnexion universelle et bascule sur compte invité vierge.
// Garantit la suppression complète des cookies précédents, du store Zustand,
// de toutes les clés d'identification, et alloue un compte invité anonyme.

import { useKene } from "@/store/kene";
import { toast } from "sonner";

export async function performLogout(options?: { redirectUrl?: string; message?: string; toGuest?: boolean }) {
  const targetUrl = options?.redirectUrl ?? "/";
  const message = options?.message ?? "Déconnexion réussie";
  const toGuest = options?.toGuest ?? true;

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

  // 4. Attribution d'un compte invité vierge pour que l'utilisateur atterrisse sur un compte découverte isolé
  if (toGuest) {
    try {
      const guestRes = await fetch("/api/auth/express?newGuest=1", { method: "GET" });
      if (guestRes.ok) {
        const data = await guestRes.json();
        if (data?.user) {
          useKene.getState().setUser(data.user);
          try {
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                "kene-store",
                JSON.stringify({
                  state: {
                    user: data.user,
                    space: "client",
                    clientTab: "accueil",
                    cart: [],
                    proTenantId: null,
                    introActive: false,
                    _keneHydrated: true,
                  },
                  version: 0,
                })
              );
            }
          } catch {}
        }
      }
    } catch {
      // Tolérance réseau
    }
  }

  toast.info(message);

  // 5. Redirection complète avec rechargement de page pour purger tout état résiduel
  if (typeof window !== "undefined") {
    setTimeout(() => {
      window.location.replace(targetUrl);
    }, 150);
  }
}
