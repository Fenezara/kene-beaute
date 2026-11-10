"use client";

import { useEffect, useRef } from "react";

/**
 * Gestionnaire universel du bouton Retour Android / Navigateur mobile pour Kènè.
 * 
 * Problème résolu :
 * Sur Android (bouton retour physique, gestuel ou barre de navigation à 3 boutons),
 * l'appui sur « Retour » quitte l'application ou rafraîchit la page car l'historique
 * du navigateur est vide (SPA sans pushState).
 * 
 * Solution :
 * 1. Maintient en permanence un état virtuel dans l'historique (`history.pushState`).
 * 2. Intercepte l'événement `popstate`.
 * 3. Permet aux modales, feuilles (Sheets), wizards et sous-écrans de s'enregistrer
 *    en pile LIFO (Dernier ouvert = Premier fermé).
 * 4. Si une modale ou un sous-écran est ouvert : l'événement Retour le ferme proprement !
 * 5. Si aucun sous-écran n'est ouvert : l'événement Retour revient à l'écran/section précédent(e).
 * 6. Si on est déjà à l'accueil : un double-retour rapide (dans les 2 secondes) permet de quitter.
 */

type BackHandler = () => boolean; // renvoie true si l'action a été consommée

// Pile globale des gestionnaires de retour
const backHandlersStack: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler): () => void {
  backHandlersStack.push(handler);
  return () => {
    const idx = backHandlersStack.lastIndexOf(handler);
    if (idx !== -1) {
      backHandlersStack.splice(idx, 1);
    }
  };
}

export function useHardwareBack(handler: BackHandler, active: boolean = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    const unregister = registerBackHandler(() => handlerRef.current());
    return unregister;
  }, [active]);
}

/** Hook racine monté au niveau de l'application (dans Page ou PwaProvider) */
export function HardwareBackController() {
  const lastBackToastRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Assurer qu'il y a toujours un état dans l'historique pour capturer popstate
    try {
      window.history.pushState({ keneApp: true, depth: 1 }, "");
    } catch {
      // ignore
    }

    const onPopState = (e: PopStateEvent) => {
      // 1. D'abord vérifier si une modale Radix/dialogue ouverte dans le DOM peut être fermée
      // (ex: bouton de fermeture ou touche Escape)
      const openDialogCloseBtn = document.querySelector<HTMLButtonElement>(
        '[data-slot="dialog-close"], [data-slot="sheet-close"], [data-slot="alert-dialog-cancel"]'
      );

      // 2. Vérifier notre pile de handlers personnalisés (Sheets, Wizards, onglets)
      if (backHandlersStack.length > 0) {
        // Exécuter le dernier handler enregistré
        const topHandler = backHandlersStack[backHandlersStack.length - 1];
        try {
          const handled = topHandler();
          if (handled) {
            // Repousser un état pour continuer à intercepter les retours suivants
            window.history.pushState({ keneApp: true, depth: 1 }, "");
            return;
          }
        } catch {
          // ignore
        }
      }

      // 3. Si un dialogue Radix est présent, simuler la fermeture propre
      const activeDialogOverlay = document.querySelector('[data-slot="dialog-overlay"], [data-slot="sheet-overlay"]');
      if (activeDialogOverlay) {
        const escEvent = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
        document.dispatchEvent(escEvent);
        window.history.pushState({ keneApp: true, depth: 1 }, "");
        return;
      }

      // 4. Si nous sommes sur l'accueil racine et qu'il n'y a plus rien à dépiler
      // Donner une confirmation avant de quitter pour éviter de fermer l'app par erreur
      const now = Date.now();
      if (now - lastBackToastRef.current < 2000) {
        // Deuxième appui rapide : laisser le navigateur faire son retour normal (quitter ou fermer l'onglet)
        return;
      }

      lastBackToastRef.current = now;
      // Repousser l'état pour bloquer la fermeture accidentelle et avertir
      window.history.pushState({ keneApp: true, depth: 1 }, "");
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return null;
}
