"use client";
// Kènè — SessionKeeper: validation silencieuse de la session au boot, montée
// à la RACINE (page.tsx) pour couvrir les 3 espaces (Cliente / Pro / Admin).
// Raison d'être: le check vivait dans ClientApp — jamais monté quand
// l'espace persisté est « pro »/« admin », la session invalidée n'était donc
// pas purgée au retour dans ces espaces.
//
// Contrat:
// • Après hydratation du store (gate _keneHydrated), SI une session existe:
// UNE requête GET /api/auth/session?userId=.
// • 200 → profil rafraîchi (setUser) — jamais déconnecter sur réponse inattendue.
// Isolation des comptes: setUser fait suivre l'espace au rôle
// frais du serveur (clamp store) — un rôle changé côté base est suivi ici.
// • 404 → session révolue: déconnexion douce (setUser(null) + clearCart +
// toast « Session expirée — reconnecte-toi », pas d'alerte) + retour à
// l'espace cliente (l'onboarding/login y vit).
// • 502/503/504/réseau → SILENCIEUX: hors-ligne ou redémarrage transitoire
// ne doit JAMAIS déconnecter (c'est tout le point du « rester connectée »).
// • Anti-boucle: le ref mémorise le dernier userId validé; l'effet ne se
// re-déclenche QUE si userId change (le setUser d'un 200 conserve l'id).
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { apiGet, ApiError } from "@/lib/kene/api";
import { rememberAccount } from "@/lib/kene/last-account";
import { useKene, type SessionUser } from "@/store/kene";
import { readSession } from "@/components/kene/client/types";

export function SessionKeeper() {
  const user = useKene((s) => s.user);
  const hydrated = useKene((s) => (s as { _keneHydrated?: boolean })._keneHydrated ?? true);
  const setUser = useKene((s) => s.setUser);
  const setSpace = useKene((s) => s.setSpace);
  const setProTenantId = useKene((s) => s.setProTenantId);
  const clearCart = useKene((s) => s.clearCart);
  const validatedUserIdRef = useRef<string | null>(null);
  const checkedCookieRef = useRef(false);
  const userId = user?.id;

  useEffect(() => {
    if (!hydrated) return;
    if (userId && validatedUserIdRef.current === userId) return;
    if (!userId && checkedCookieRef.current) return;

    if (userId) validatedUserIdRef.current = userId;
    else checkedCookieRef.current = true;

    let cancelled = false;
    // Lire l'id courant depuis le store au cas où la réhydratation vient tout juste de se terminer
    const effectiveUserId = userId || useKene.getState().user?.id;
    apiGet<unknown>(effectiveUserId ? `/api/auth/session?userId=${encodeURIComponent(effectiveUserId)}` : "/api/auth/session")
      .then((payload) => {
        if (cancelled) return;
        const s = readSession(payload);
        // 200: profil frais si la réponse est lisible; sinon on garde la
        // session locale (ne jamais déconnecter sur une réponse inattendue).
        if (s.user) {
          setUser({
            ...s.user,
            employeeRole: s.employeeRole,
            employeePermissions: s.employeePermissions,
            employeeName: s.employeeName,
            tenantId: s.tenantId,
          } as SessionUser);
          if (s.user.role === "pro" && s.tenantId) {
            setProTenantId(s.tenantId);
          }
          rememberAccount({
            phone: s.user.phone,
            name: s.user.name,
            role: s.user.role === "pro" || s.user.role === "admin" ? s.user.role : "client",
          });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Ne déconnecter QUE si un compte précis a été vérifié (effectiveUserId) ET que le serveur
        // confirme explicitement qu'il n'existe plus ou est verrouillé en base (404).
        // Une erreur 401 sur un check sans cookie ou transitoire ne doit JAMAIS déconnecter un utilisateur déjà connecté.
        if (effectiveUserId && e instanceof ApiError && e.status === 404) {
          clearCart();
          setUser(null);
          setSpace("client");
          toast.error("Session expirée — reconnecte-toi");
        }
        // 401/502/503/504/réseau: silencieux — la session locale reste valable.
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, userId, setUser, setSpace, setProTenantId, clearCart]);

  return null;
}
