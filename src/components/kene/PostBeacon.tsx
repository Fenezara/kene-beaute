"use client";
// Kènè — balise de diagnostic réseau (t. 91, TEMPORAIRE).
// Double emission GET + POST vers /api/health/echo avec marqueurs uniques.
// Les marqueurs arrivant en dev.log identifient quelles méthodes traversent
// réellement la chaîne iframe-de-préview → plateforme → :81 → :3000 chez
// l'utilisatrice réelle. Silencieux : aucun toast, aucun UI, échec ignoré.
import { useEffect } from "react";

const BEACON_INTERVAL_MS = 45_000;

function beacon() {
  const ts = Date.now().toString(36);
  // keepalive : la requête traverse même si la page se ferme juste après.
  try {
    void fetch(`/api/health/echo?m=bc-${ts}-G&src=postbeacon`, {
      method: "GET",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* silencieux */
  }
  try {
    void fetch("/api/health/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ m: `bc-${ts}-P`, src: "postbeacon" }),
      keepalive: true,
    }).catch(() => {});
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
