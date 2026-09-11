"use client";
// Kènè — enregistrement du service worker (/sw.js) + MISE À JOUR AUTO-GUÉRISSONNE
// (t. 90 — incident « La Demo ne passe pas / je ne vois pas le nom de l'app »).
//
// Diagnostic de l'incident : l'ancien flux posait un toast « Mise à jour
// disponible » de 8 s ; si l'utilisatrice ne cliquait pas « Recharger » dans
// cette fenêtre, le nouveau SW restait à JAMAIS à l'état « waiting » — le
// navigateur continuait de servir l'ANCIEN bundle (pré-wordmark, pré-correctifs
// démo), même après des dizaines de rechargements. Une cliente du preview ne
// voyait donc jamais les correctifs : « la démo ne passe pas », « je ne vois
// pas le nom de l'application ».
//
// Nouveau contrat :
//   • AU BOOT : registration.update() immédiat ; un worker déjà « waiting »
//     (l'état piégé de l'incident) est activé SANS intervention — SKIP_WAITING
//     puis reload sur controllerchange. Garde anti-boucle par sessionStorage
//     (une seule auto-guérison par chargement, jamais deux de suite).
//   • EN SESSION : vérification toutes les 60 s (l'iframe de préview reste
//     ouverte des heures — les updates arrivent sans navigation) ; si un
//     worker attend → toast informant + activation automatique REPORTÉE tant
//     que l'utilisatrice interagit (événements pointer/clavier < 30 s) — on
//     recharge dès qu'elle est calme, jamais au milieu d'une saisie.
//   • Toast conservé mais NON bloquant : l'action « Recharger » force
//     l'application immédiate ; sans clic, l'auto-guérison s'en charge.

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** sessionStorage : horodatage de la dernière auto-guérison (garde anti-boucle). */
const LAST_HEAL_KEY = "kene-sw-healed-at";
/** Délai minimum entre deux auto-reloads (ms) — deux guérisons à moins de
 *  10 s l'une de l'autre = boucle, on refuse la seconde. */
const HEAL_MIN_INTERVAL_MS = 10_000;
/** Période de vérification d'update en session (ms). */
const UPDATE_POLL_MS = 60_000;
/** Activité récente = on repousse l'activation (ms). */
const RECENT_ACTIVITY_MS = 30_000;
/** Repos prolongé = activation auto même sans interaction (ms). */
const IDLE_FORCE_MS = 5 * 60_000;

export function PwaProvider() {
  const lastActivityRef = useRef<number>(Date.now());
  const bootAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let pollTimer: number | undefined;
    const cleanups: Array<() => void> = [];

    // ── Suivi d'activité : pointer/clavier/scroll rafraîchissent l'horodatage.
    //    Une utilisatrice active ne doit JAMAIS être rechargée sous les doigts.
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    for (const type of ["pointerdown", "keydown", "wheel", "touchstart"] as const) {
      window.addEventListener(type, markActivity, { passive: true });
      cleanups.push(() => window.removeEventListener(type, markActivity));
    }

    /** True si un auto-reload a déjà eu lieu récemment (garde anti-boucle). */
    function healedRecently(): boolean {
      try {
        const v = Number(sessionStorage.getItem(LAST_HEAL_KEY));
        return Number.isFinite(v) && Date.now() - v < HEAL_MIN_INTERVAL_MS;
      } catch {
        return false; // storage indisponible → on autorise (mieux vaut rafraîchir)
      }
    }

    /** Active le worker en attente : SKIP_WAITING + reload sur controllerchange. */
    function activateWorker(worker: ServiceWorker, why: "boot" | "idle" | "toast") {
      if (disposed) return;
      let reloaded = false;
      const doReload = () => {
        if (reloaded || disposed) return;
        reloaded = true;
        try {
          sessionStorage.setItem(LAST_HEAL_KEY, String(Date.now()));
        } catch { /* non bloquant */ }
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", doReload, { once: true });
      worker.postMessage("SKIP_WAITING");
      // Filet de sécurité si controllerchange tarde.
      window.setTimeout(doReload, 2000);
      if (why !== "toast") {
        console.info("[kene-pwa] nouvelle version activée (" + why + ") — rechargement");
      }
    }

    /** Décision d'activation pour un worker « waiting » trouvé EN SESSION :
     *  toast + activation différée tant que l'utilisatrice est active. */
    function handleWaiting(worker: ServiceWorker) {
      if (disposed) return;
      // Guérison immédiate au boot : la page vient de charger, rien à perdre.
      const sinceBoot = Date.now() - bootAtRef.current;
      if (sinceBoot < 15_000 && !healedRecently()) {
        activateWorker(worker, "boot");
        return;
      }
      // En session : on informe puis on attend le calme (jamais sous les doigts).
      toast.info("Mise à jour de Kènè disponible", {
        description: "Elle s'appliquera automatiquement dans un instant.",
        action: {
          label: "Appliquer",
          onClick: () => activateWorker(worker, "toast"),
        },
        duration: 10_000,
      });
      const waitIdle = () => {
        if (disposed) return;
        const idleFor = Date.now() - lastActivityRef.current;
        if (idleFor > RECENT_ACTIVITY_MS || Date.now() - bootAtRef.current > IDLE_FORCE_MS) {
          if (!healedRecently()) activateWorker(worker, "idle");
          return;
        }
        window.setTimeout(waitIdle, 5_000);
      };
      window.setTimeout(waitIdle, 5_000);
    }

    /** Inspecte l'état d'un registration : worker « waiting » → décision. */
    function inspectRegistration() {
      if (!registration || disposed) return;
      const waiting = registration.waiting ?? registration.installing ?? undefined;
      // installing/waiting ne peuvent être activés que s'ils passent en
      // « installed » ; on n'agit ici que sur un worker installé en attente.
      if (registration.waiting) {
        handleWaiting(registration.waiting);
        return;
      }
      void registration.update().catch(() => undefined);
    }

    /** Toast legacy « updatefound » — conservé : couvre le cas d'un update qui
     *  arrive entre deux polls (le poll suivant l'activera de toute façon). */
    const notifyUpdate = (worker: ServiceWorker) => {
      const maybeToast = () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          handleWaiting(worker);
        }
      };
      worker.addEventListener("statechange", maybeToast);
      cleanups.push(() => worker.removeEventListener("statechange", maybeToast));
      maybeToast();
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (disposed) return;
        registration.addEventListener("updatefound", () => {
          const incoming = registration?.installing;
          if (incoming) notifyUpdate(incoming);
        });
        // AU BOOT : guérison immédiate d'un worker piégé en « waiting »
        // (l'état exact de l'incident t. 90) + check d'update sans navigation.
        inspectRegistration();
        // EN SESSION : l'iframe de préview vit des heures sans navigation —
        // le navigateur ne re-checke sw.js qu'à la navigation ou toutes les
        // 24 h par défaut ; on poll nous-mêmes.
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
