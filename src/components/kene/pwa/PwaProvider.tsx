"use client";
// Kènè — enregistrement du service worker (/sw.js) + toast de mise à jour.
// Rend null : ce composant n'a que des effets (monté une fois à la racine de /).
// Nouvelle version détectée (updatefound → "installed" alors qu'un SW contrôle
// déjà la page) → toast avec action « Recharger » → SKIP_WAITING + reload.

import { useEffect } from "react";
import { toast } from "sonner";

export function PwaProvider() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const workerCleanups: Array<() => void> = [];

    /** Toast « mise à jour disponible » pour un worker fraîchement installé. */
    const notifyUpdate = (worker: ServiceWorker) => {
      const maybeToast = () => {
        // Un SW actif contrôle déjà la page → c'est une MAJ, pas la 1re installation.
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          toast.info("Mise à jour de Kènè disponible", {
            description: "Recharge pour profiter de la dernière version.",
            action: {
              label: "Recharger",
              onClick: () => {
                let reloaded = false;
                const doReload = () => {
                  if (reloaded) return;
                  reloaded = true;
                  window.location.reload();
                };
                // Le nouveau SW prend le contrôle puis la page se recharge.
                navigator.serviceWorker.addEventListener("controllerchange", doReload, { once: true });
                worker.postMessage("SKIP_WAITING");
                // Filet de sécurité si controllerchange tarde.
                window.setTimeout(doReload, 1500);
              },
            },
            duration: 8000,
          });
        }
      };
      worker.addEventListener("statechange", maybeToast);
      workerCleanups.push(() => worker.removeEventListener("statechange", maybeToast));
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
      } catch (e) {
        console.debug("[kene-pwa] enregistrement du service worker impossible", e);
      }
    };

    void register();

    return () => {
      disposed = true;
      workerCleanups.forEach((cleanup) => cleanup());
      workerCleanups.length = 0;
    };
  }, []);

  return null;
}
