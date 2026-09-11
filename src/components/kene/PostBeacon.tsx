"use client";
// Kènè — balise + sonde de transport réseau (t. 91 → t. 92).
//
// Double rôle :
//  1. BALISE (t. 91) : double émission GET + POST vers /api/health/echo avec
//     marqueurs uniques — les marqueurs arrivant en dev.log identifient quelles
//     méthodes traversent réellement la chaîne iframe-de-préview → plateforme
//     → :81 → :3000 chez l'utilisatrice réelle. Silencieuse : aucun toast.
//  2. SONDE TRANSPORT (t. 92) : le résultat du POST beacon alimente la mémoire
//     « POST mort » de src/lib/kene/api.ts. Un POST qui répond (2xx JSON de
//     notre route echo) → markPostAlive() ; un POST rejeté, pendu (borné 5 s)
//     ou répondu par un proxy → markPostDead(). Dès le chargement de page, le
//     client SAIT si les POST traversent — les apiPost suivants vont droit au
//     pont GET au lieu d'attendre le timeout, et se réaniment tout seuls si
//     l'environnement se remet à laisser passer les POST (auto-guérison 45 s).
import { useEffect } from "react";
import { markPostAlive, markPostDead } from "@/lib/kene/api";
import { withTimeout } from "@/lib/kene/with-timeout";

const BEACON_INTERVAL_MS = 45_000;
/** Un POST beacon sain répond en < 1 s — 5 s prouvent le blocage/pendu. */
const PROBE_TIMEOUT_MS = 5_000;

function beacon() {
  const ts = Date.now().toString(36);
  // GET (inchangé) : trace de vie en dev.log + keepalive.
  try {
    void fetch(`/api/health/echo?m=bc-${ts}-G&src=postbeacon`, {
      method: "GET",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* silencieux */
  }
  // POST : balise + sonde transport (t. 92).
  try {
    void withTimeout(
      fetch("/api/health/echo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ m: `bc-${ts}-P`, src: "postbeacon" }),
        keepalive: true,
      }),
      PROBE_TIMEOUT_MS,
      "beacon POST",
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

export function PostBeacon() {
  useEffect(() => {
    beacon();
    const t = setInterval(beacon, BEACON_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);
  return null;
}
