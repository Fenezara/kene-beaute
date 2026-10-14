// Kènè — Télémétrie et Remontée d'Erreurs Client en Temps Réel (Crash & Incident Reporting)
// Permet à l'équipe et à la fondatrice d'être informées en direct des erreurs
// rencontrées par les utilisatrices sur leur téléphone, tablette ou ordinateur.

let lastErrorTimestamp = 0;
const THROTTLE_MS = 3500; // Anti-flood: max 1 rapport d'erreur / 3.5s par client

export interface ClientErrorReport {
  scope: string;
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  componentStack?: string;
}

/** Remonte une erreur applicative au serveur en arrière-plan sans bloquer l'interface */
export function reportClientError(data: ClientErrorReport): void {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastErrorTimestamp < THROTTLE_MS) return;
  lastErrorTimestamp = now;

  try {
    const payload = {
      scope: (data.scope || "app").slice(0, 100),
      message: (data.message || "Erreur client non spécifiée").slice(0, 500),
      stack: (data.stack || data.componentStack || "").slice(0, 2000),
      url: window.location.href.slice(0, 300),
      userAgent: navigator.userAgent.slice(0, 300),
    };

    // Utilisation prioritaire de sendBeacon pour garantir l'envoi même si l'onglet se ferme ou se recharge
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/telemetry/error", blob);
      if (sent) return;
    }

    // Fallback fetch avec keepalive
    void fetch("/api/telemetry/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => null);
  } catch {
    // Les erreurs dans le reporter de télémétrie sont silencieuses
  }
}
