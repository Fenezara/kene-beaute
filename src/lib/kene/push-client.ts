// Kènè — helpers Web Push côté navigateur (t. 60-e).
// Utilisés par la carte « Rappels sur mon téléphone » du NotificationCenter :
// détection de support, état de l'abonnement, (dés)inscription pushManager,
// conversion de la clé VAPID base64url → Uint8Array pour subscribe().
// Tout est défensif : navigateur sans service worker/PushManager (Safari
// ancien, Firefox sans autorisation…), SW non encore actif, permissions —
// chaque helper retourne null/false au lieu de lever.

/** Le navigateur sait-il faire du Web Push ? (appelé côté client uniquement) */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/** État dérivé de la carte : support navigateur + permission + abonnement actif. */
export type PushStatus = "unsupported" | "off" | "on";

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && typeof Notification !== "undefined" && Notification.permission === "granted"
      ? "on"
      : "off";
  } catch {
    return "off"; // SW non actif ou erreur pushManager → désactivé, pas bloquant
  }
}

/** Abonnement push actif du navigateur (null si aucun / non supporté). */
export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Clé publique VAPID base64url → Uint8Array (format exigé par pushManager.subscribe). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  try {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    const output = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  } catch {
    throw new Error("Clé VAPID illisible");
  }
}

/** S'abonne via le service worker prêt + la clé publique VAPID de l'app. */
export async function subscribeToPush(publicKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

/** Clé d'abonnement (ArrayBuffer p256dh/auth) → chaîne base64 stockable en DB. */
export function pushKeyToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}
