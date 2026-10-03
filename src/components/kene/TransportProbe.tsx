"use client";
// Kènè — sonde de transport réseau.
//
// Rôle unique : sonder si les POST sortants traversent l'environnement de
// navigation (certaines intégrations iframe bloquent les POST en amont du
// serveur alors que les GET passent). Le résultat alimente la mémoire
// « POST mort » de src/lib/kene/api.ts : un POST qui répond (2xx JSON de
// notre route santé) → markPostAlive ; un POST rejeté, pendu (borné 5 s)
// ou répondu par un proxy → markPostDead. Les apiPost suivants vont alors
// droit au pont GET au lieu d'attendre le timeout, et se réaniment tout
// seuls si l'environnement se remet à laisser passer les POST (sonde
// périodique silencieuse). Aucun rendu, aucun toast, aucune donnée
// personnelle — juste un battement réseau vers la route santé.
import { useEffect } from "react";
import { markPostAlive, markPostDead } from "@/lib/kene/api";
import { withTimeout } from "@/lib/kene/with-timeout";

/** Ré-animation périodique de la mémoire transport (silencieuse). */
const PROBE_INTERVAL_MS = 45_000;
/** Une sonde saine répond en < 1 s — 5 s prouvent le blocage/pendu. */
const PROBE_TIMEOUT_MS = 5_000;

function probe() {
  try {
    void withTimeout(
      fetch("/api/health/echo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probe: true }),
        keepalive: true,
      }),
      PROBE_TIMEOUT_MS,
      "sonde POST",
    ).then(
      (res) => {
        if (res.ok) markPostAlive();
        else markPostDead(); // réponse non-2xx : proxy ou erreur réseau déguisée
      },
      () => {
        markPostDead(); // rejet réseau ou POST muet (pendu)
      },
    );
  } catch {
    /* silencieux */
  }
}

export function TransportProbe() {
  useEffect(() => {
    probe();
    const t = setInterval(probe, PROBE_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);
  return null;
}
