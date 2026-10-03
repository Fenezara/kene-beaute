"use client";
// Kènè — service worker (/sw.js): enregistrement + mise à jour auto-guérissone.
//
// HISTORIQUE DE L'INCIDENT (résolu, garde-fous permanents):
// • Un SW périmé pouvait servir un ancien bundle (toast de MAJ manqué → SW
// « waiting » piégé à vie). Correctif: auto-activation au boot.
// • Dans l'iframe de préview, sessionStorage EST BLOQUÉ (comme
// les cookies — preuve: requêtes « sans cookie (legacy) »). La garde
// anti-boucle sessionstorage échouait silencieusement + le filet de
// sécurité rechargeait la page 2 s après CHAQUE tentative même si
// l'activation n'avait PAS eu lieu → boucle de rechargement ~2 s: la page
// se réinitialisait avant toute connexion (« impossible de se connecter
// en tant que client et entreprise »).
//
// CONTRAT CORRIGÉ (garanties formelles):
// 1. UNE SEULE tentative d'auto-guérison PAR PAGE — sentinelle dans l'URL
// (`kene-sw-heal=1`), SURVIT à tout blocage de localStorage/sessionStorage
// (partition iframe, navigation privée…): la page rechargée porte la
// sentinelle → plus JAMAIS d'auto-guérison dans cet onglet. La sentinelle
// est retirée de l'URL (history.replaceState) juste après lecture.
// 2. UN RECHARGEMENT NE SE PRODUIT QUE SI L'ACTIVATION EST PROUVÉE:
// controllerchange, OU filet qui compare le contrôleur AVANT/APRÈS
// (scriptURL) — si le nouveau SW ne prend pas le contrôle, AUCUN
// rechargement (le toast manuel reste le seul recours). Plus aucun
// rechargement « au cas où ».
// 3. Détection continue (poll 60 s — l'iframe ne navigue jamais) → toast
// « Appliquer » manuel: un clic = consentement, activation + rechargement
// intentionnel unique.

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Sentinelle URL: cette page a DÉJÀ tenté une auto-guérison. */
const HEAL_PARAM = "kene-sw-heal";
/** Période de vérification d'update en session (ms). */
const UPDATE_POLL_MS = 60_000;

export function PwaProvider() {
  const initialControllerRef = useRef<string | null>(null);
  const healAttemptedRef = useRef(false);
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let pollTimer: number | undefined;
    const cleanups: Array<() => void> = [];

    // ── Garde 1: sentinelle URL. Un onglet qui vient d'être auto-guéri (ou a
    // tenté) ne refera JAMAIS de tentative automatique — la boucle est
    // impossible même si tous les storages sont bloqués.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(HEAL_PARAM)) {
        healAttemptedRef.current = true;
        url.searchParams.delete(HEAL_PARAM);
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
 /* URL imparsable: comportement par défaut (guérison autorisée) */
    }

    // ── Contrôleur initial: la PREUVE d'activation se fait par comparaison.
    initialControllerRef.current = navigator.serviceWorker.controller?.scriptURL ?? null;

 /** Rechargement unique: navigue vers la même URL + sentinelle. */
    function healNavigate() {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set(HEAL_PARAM, "1");
        window.location.replace(url.toString());
      } catch {
        window.location.reload();
      }
    }

 /** Garde 2: un rechargement seulement si le contrôleur a VRAIMENT changé
 * (controllerchange) — et le filet compare les scriptURL avant de juger. */
    function armActivationWatch(worker: ServiceWorker) {
      if (disposed) return;
      let navigated = false;
      const go = () => {
        if (navigated || disposed) return;
        navigated = true;
        healNavigate();
      };
      navigator.serviceWorker.addEventListener("controllerchange", go, { once: true });
      // Filet de preuve (3 s): rechargement SEULEMENT si le contrôleur actuel
      // n'est plus celui du montage — si l'activation a échoué, on ne recharge
      // PAS (l'ancien comportement rechargeait quand même → boucle).
      window.setTimeout(() => {
        if (navigated || disposed) return;
        const nowController = navigator.serviceWorker.controller?.scriptURL ?? null;
        if (nowController !== initialControllerRef.current) go();
      }, 3000);
      void worker;
    }

 /** Tentative d'activation automatique — UNE fois par page (garde 1). */
    function attemptAutoHeal(worker: ServiceWorker): boolean {
      if (disposed || healAttemptedRef.current) return false;
      healAttemptedRef.current = true; // une seule tentative, réussie ou non
      armActivationWatch(worker);
      worker.postMessage("SKIP_WAITING");
      return true;
    }

 /** Worker en attente détecté: auto-guérison (1×/page) sinon toast manuel. */
    function handleWaiting(worker: ServiceWorker) {
      if (disposed) return;
      if (attemptAutoHeal(worker)) {
        console.info("[kene-pwa] nouvelle version détectée — activation automatique");
        return;
      }
      // Déjà tenté dans cette page (sentinelle): la décision appartient à
      // l'utilisatrice — action manuelle, jamais de rechargement spontané.
      // Garde anti-spam: le poll 60 s peut re-détecter le worker en attente,
      // un SEUL toast par page suffit.
      if (toastShownRef.current) return;
      toastShownRef.current = true;
      toast.info("Mise à jour de Kènè disponible", {
        description: "Recharge la page pour l'appliquer.",
        action: {
          label: "Appliquer",
          onClick: () => {
            armActivationWatch(worker);
            worker.postMessage("SKIP_WAITING");
          },
        },
        duration: 10_000,
      });
    }

 /** Inspecte le registration: worker « waiting » → décision; sinon check. */
    function inspectRegistration() {
      if (!registration || disposed) return;
      if (registration.waiting) {
        handleWaiting(registration.waiting);
        return;
      }
      void registration.update().catch(() => undefined);
    }

 /** updatefound → quand le worker fraîchement téléchargé passe en
 * « installed » (état « waiting ») → même décision. */
    const notifyUpdate = (worker: ServiceWorker) => {
      const maybeInstall = () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          handleWaiting(worker);
        }
      };
      worker.addEventListener("statechange", maybeInstall);
      cleanups.push(() => worker.removeEventListener("statechange", maybeInstall));
      maybeInstall();
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (disposed) return;
        registration.addEventListener("updatefound", () => {
          const incoming = registration?.installing;
          if (incoming) notifyUpdate(incoming);
        });
        // AU BOOT: guérison d'un worker piégé en « waiting » (incident)
        // — UNE tentative, preuve d'activation exigée.
        inspectRegistration();
        // EN SESSION: l'iframe de préview vit des heures sans navigation —
        // on re-vérifie nous-mêmes (détection → toast manuel seulement).
        pollTimer = window.setInterval(inspectRegistration, UPDATE_POLL_MS);
      } catch (e) {
        console.debug("[kene-pwa] enregistrement du service worker impossible", e);
      }
    };

    void register();

    return () => {
      disposed = true;
      if (pollTimer) window.clearInterval(pollTimer);
      cleanups.forEach((cleanup) => cleanup());
      cleanups.length = 0;
    };
  }, []);

  return null;
}
