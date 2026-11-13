import { useEffect, useState } from "react";

/** Patterns haptiques (ms) — calibrés façon apps natives 2026 */
export const HAPTIC = {
  tap: 8,          // sélection d'onglet, tap story
  light: 15,       // ajout au panier, activation
  medium: 25,      // déclenchement pull-to-refresh
  success: [18, 60, 24] as number[],  // paiement réussi, commande confirmée
  warning: [40] as number[],   // erreur, solde insuffisant
  teamMessage: [180, 90, 220] as number[], // double vibration franche message d'équipe
  urgentBeep: [300, 100, 300, 100, 450] as number[], // triple vibration intense Bip Cabine / Caisse
};

/** Retour tactile Android (no-op silencieux ailleurs) */
export function haptic(pattern: number | number[] = HAPTIC.tap): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // SSR ou API indisponible — ignoré
  }
}

let sharedAlertCtx: AudioContext | null = null;

function getAlertAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAlertCtx || sharedAlertCtx.state === "closed") {
      sharedAlertCtx = new Ctx();
    }
    if (sharedAlertCtx.state === "suspended") {
      void sharedAlertCtx.resume();
    }
    return sharedAlertCtx;
  } catch {
    return null;
  }
}

/**
 * Déverrouille le contexte Web Audio au premier toucher (requis sur iOS/Android
 * pour autoriser les sonneries asynchrones lorsque les messages d'équipe arrivent).
 */
export function unlockTeamAudio(): void {
  const ctx = getAlertAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // ignoré
  }
}

/**
 * Déclenche une notification système native sur Android/iOS/Desktop (avec vibreur matériel)
 * via le Service Worker actif.
 */
export async function triggerNativeTeamNotification(
  title: string,
  body: string,
  urgent = false
): Promise<void> {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const vibratePattern = urgent ? [300, 100, 300, 100, 450] : [200, 90, 220];
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: `kene-team-${Date.now()}`,
          renotify: true,
          requireInteraction: urgent,
          vibrate: vibratePattern,
          data: { url: "/?space=pro" },
        } as NotificationOptions);
        return;
      }
    }
    new Notification(title, {
      body,
      icon: "/icons/icon-192.png",
      tag: `kene-team-${Date.now()}`,
    });
  } catch {
    // silencieux si bloqué par l'OS
  }
}

/**
 * Déclenche une sonnerie cristalline + vibration immédiate pour alerter l'équipe Kènè
 * lors d'un nouveau message interne, d'un Bip Cabine ou d'une Sortie de Cabine → Caisse.
 */
export function playTeamAlertSound(
  kind: "message" | "client_arrived" | "need_product" | "handoff_pos" | "stock_alert" = "message"
): void {
  // 1. Vibreur matériel immédiat (Android / mobile)
  const isUrgent = kind !== "message";
  haptic(isUrgent ? HAPTIC.urgentBeep : HAPTIC.teamMessage);

  // 2. Sonnerie synthétisée haute clarté via Web Audio API (zéro fichier externe requis)
  const ctx = getAlertAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    // Séquence de notes selon l'urgence :
    // - message standard : carillon 3 notes ascendantes (Sol5 -> Si5 -> Ré6 -> Sol6)
    // - bip métier urgent (cliente arrivée / sortie caisse / stock) : double carillon d'alerte cristallin
    const notes = isUrgent
      ? [
          { freq: 880, start: 0, dur: 0.14 },
          { freq: 1174.66, start: 0.15, dur: 0.14 },
          { freq: 1318.51, start: 0.30, dur: 0.22 },
          { freq: 880, start: 0.62, dur: 0.14 },
          { freq: 1174.66, start: 0.77, dur: 0.14 },
          { freq: 1760, start: 0.92, dur: 0.38 },
        ]
      : [
          { freq: 783.99, start: 0, dur: 0.13 },
          { freq: 987.77, start: 0.14, dur: 0.13 },
          { freq: 1174.66, start: 0.28, dur: 0.16 },
          { freq: 1567.98, start: 0.45, dur: 0.32 },
        ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isUrgent ? "triangle" : "sine";
      osc.frequency.setValueAtTime(n.freq, now + n.start);

      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.38, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
    }
  } catch {
    // ignoré si l'OS bloque l'audio avant interaction
  }
}

/** État instantané de connectivité réseau — résilience façon Wave */
export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * Hook de détection réseau anti-faux-positifs (debounce 3.5s sur offline, reprise immédiate sur online).
 * Évite les clignotements intempestifs et fausses alertes lors des basculements d'antennes mobiles (4G/3G/WiFi).
 */
export function useNetworkOnline(): boolean {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    setOnline(isOnline());
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      setOnline(true);
    };

    const handleOffline = () => {
      if (timer) clearTimeout(timer);
      // Debounce de 3.5 secondes pour absorber les micro-coupures de cellule mobile
      timer = setTimeout(async () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          // Double vérification active par un HEAD ultra-léger
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const ping = await fetch("/favicon.ico", {
              method: "HEAD",
              cache: "no-store",
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (ping.ok || ping.status === 304 || ping.status === 200) {
              setOnline(true);
              return;
            }
          } catch {
            // Ping échoué confirmé
          }
          setOnline(false);
        }
      }, 3500);
    };

    const handleNetworkAlive = () => handleOnline();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("kene:network:alive", handleNetworkAlive);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("kene:network:alive", handleNetworkAlive);
    };
  }, []);

  return online;
}

