// src/lib/kene/hardware-perm.ts
// Gestionnaire unifié et singleton des autorisations et flux matériels du téléphone
// RÈGLE FONDAMENTALE : Les autorisations matérielles (Caméra, Microphone, Localisation, Notifications)
// ne doivent être demandées QU'UNE SEULE FOIS pour toute l'application.
// Une fois accordées, l'application réutilise les flux et statuts persistants
// pour qu'AUCUNE boîte de dialogue système ne soit redemandée à l'utilisateur.

export const HARDWARE_PERM_KEY = "kene-hardware-permission-granted";
export const CAMERA_PERM_KEY = "kene-hardware-camera-granted";
export const MIC_PERM_KEY = "kene-hardware-mic-granted";
export const GEO_PERM_KEY = "kene-hardware-geo-granted";
export const NOTIF_PERM_KEY = "kene-hardware-notif-granted";

export const GEO_CACHED_LAT_KEY = "kene-geo-cached-lat";
export const GEO_CACHED_LNG_KEY = "kene-geo-cached-lng";
export const GEO_CACHED_AT_KEY = "kene-geo-cached-at";

export type HardwareFeature = "camera" | "mic" | "geo" | "notifications";
export type PermState = "granted" | "prompt" | "denied" | "unsupported";

const listeners = new Set<() => void>();

export function subscribeHardwarePerm(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined") {
    window.addEventListener("focus", cb);
    document.addEventListener("visibilitychange", cb);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", cb);
      document.removeEventListener("visibilitychange", cb);
    }
  };
}

export function notifyHardwareListeners(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {}
  });
}

export function isIOSDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isAndroidDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function isPWAInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
}

/* ───────────────────────── 1. Mémorisation Persistante ───────────────────────── */

export function isHardwarePermGranted(feature?: HardwareFeature): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!feature) {
      return (
        localStorage.getItem(HARDWARE_PERM_KEY) === "true" ||
        localStorage.getItem(CAMERA_PERM_KEY) === "true" ||
        localStorage.getItem(MIC_PERM_KEY) === "true"
      );
    }
    const key =
      feature === "camera"
        ? CAMERA_PERM_KEY
        : feature === "mic"
        ? MIC_PERM_KEY
        : feature === "geo"
        ? GEO_PERM_KEY
        : NOTIF_PERM_KEY;
    return (
      localStorage.getItem(key) === "true" ||
      localStorage.getItem(HARDWARE_PERM_KEY) === "true"
    );
  } catch {
    return false;
  }
}

export function saveHardwarePermGranted(feature?: HardwareFeature): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HARDWARE_PERM_KEY, "true");
    if (feature === "camera") localStorage.setItem(CAMERA_PERM_KEY, "true");
    if (feature === "mic") localStorage.setItem(MIC_PERM_KEY, "true");
    if (feature === "geo") localStorage.setItem(GEO_PERM_KEY, "true");
    if (feature === "notifications") localStorage.setItem(NOTIF_PERM_KEY, "true");
  } catch {}
  notifyHardwareListeners();
}

/**
 * Lit l'état de permission en direct auprès de l'API Permissions du navigateur.
 */
export async function queryFeaturePermission(feature: HardwareFeature): Promise<PermState> {
  if (typeof window === "undefined") return "unsupported";

  if (feature === "notifications") {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission as PermState;
  }

  if (!navigator.permissions?.query) {
    return isHardwarePermGranted(feature) ? "granted" : "prompt";
  }

  try {
    const permName =
      feature === "camera"
        ? ("camera" as PermissionName)
        : feature === "mic"
        ? ("microphone" as PermissionName)
        : ("geolocation" as PermissionName);
    const res = await navigator.permissions.query({ name: permName });
    if (res.state === "granted") {
      saveHardwarePermGranted(feature);
    }
    return res.state as PermState;
  } catch {
    return isHardwarePermGranted(feature) ? "granted" : "prompt";
  }
}

/**
 * Synchronise l'état de l'application avec les permissions effectives du navigateur / système.
 */
export async function syncHardwarePermissions(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!navigator.permissions?.query) {
    return isHardwarePermGranted();
  }
  try {
    const results = await Promise.allSettled([
      navigator.permissions.query({ name: "microphone" as PermissionName }),
      navigator.permissions.query({ name: "camera" as PermissionName }),
      navigator.permissions.query({ name: "geolocation" as PermissionName }),
      navigator.permissions.query({ name: "notifications" as PermissionName }),
    ]);

    let anyGranted = false;
    results.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value.state === "granted") {
        anyGranted = true;
        const feat: HardwareFeature =
          idx === 0 ? "mic" : idx === 1 ? "camera" : idx === 2 ? "geo" : "notifications";
        saveHardwarePermGranted(feat);
      }
    });

    if (anyGranted) {
      saveHardwarePermGranted();
      return true;
    }
  } catch {
    // Navigateurs ne supportant pas tous les noms de permissions
  }
  return isHardwarePermGranted();
}

/* ───────────────────────── 2. Singleton Flux Caméra (Zéro re-prompt) ───────────────────────── */

let cachedCameraStream: MediaStream | null = null;
let cachedCameraFacing: "user" | "environment" = "user";

/**
 * Acquiert le flux de la caméra avec cascade de repli (progressive fallback) :
 * 1. 720p idéal pour smartphone
 * 2. orientation seule sans contraintes de dimensions
 * 3. { video: true } universel
 */
async function acquireCameraWithFallback(facingMode: "user" | "environment"): Promise<MediaStream> {
  // Tentative 1 : Résolution mobile standard (720p)
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (err1) {
    if (err1 instanceof DOMException && (err1.name === "NotAllowedError" || err1.name === "PermissionDeniedError")) {
      throw err1;
    }
  }

  // Tentative 2 : Orientation seule (aucun blocage de dimensions)
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
      },
      audio: false,
    });
  } catch (err2) {
    if (err2 instanceof DOMException && (err2.name === "NotAllowedError" || err2.name === "PermissionDeniedError")) {
      throw err2;
    }
  }

  // Tentative 3 : Repli universel absolu
  return await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
}

/**
 * Retourne le flux vidéo de la caméra.
 * Libère toujours proprement tout flux antérieur pour éviter les conflits matériels Android (Device in use / NotReadableError).
 */
export async function getPersistentCameraStream(
  facingMode: "user" | "environment" = "user"
): Promise<MediaStream> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("L'accès à la caméra n'est pas supporté par ce navigateur.");
  }

  // Toujours libérer les anciennes pistes physiques avant d'en ouvrir une nouvelle
  // (Évite les conflits matériels sur Android lors du changement de caméra avant/arrière)
  stopPersistentCameraStream();

  const stream = await acquireCameraWithFallback(facingMode);

  cachedCameraStream = stream;
  cachedCameraFacing = facingMode;
  saveHardwarePermGranted("camera");

  return stream;
}

/**
 * Met en pause / libère la caméra sans perdre l'autorisation du navigateur.
 * Sur Android et iOS, l'arrêt complet des pistes libère immédiatement le capteur physique
 * et empêche les blocages 'Device in use' ou les écrans noirs lors de la réouverture.
 */
export function pausePersistentCameraStream(): void {
  stopPersistentCameraStream();
}

/**
 * Arrêt complet de la caméra et libération du capteur matériel.
 */
export function stopPersistentCameraStream(): void {
  if (cachedCameraStream) {
    try {
      cachedCameraStream.getTracks().forEach((track) => {
        track.stop();
      });
    } catch {}
    cachedCameraStream = null;
  }
}

/* ───────────────────────── 3. Singleton Flux Microphone (Zéro re-prompt) ───────────────────────── */

let cachedAudioStream: MediaStream | null = null;

/**
 * Retourne le flux audio du microphone de façon persistante.
 * Une fois autorisé, il est réutilisé sur toute l'application (Secrétaire IA, Chat, Débriefing).
 */
export async function getPersistentAudioStream(): Promise<MediaStream> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("L'accès au microphone n'est pas supporté par ce navigateur.");
  }

  // Libère toute ancienne piste audio pour éviter le voyant vert permanent
  stopPersistentAudioStream();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  cachedAudioStream = stream;
  saveHardwarePermGranted("mic");
  return stream;
}

/**
 * Libère le microphone pour couper le voyant vert de surveillance système Android / iOS.
 */
export function pausePersistentAudioStream(): void {
  stopPersistentAudioStream();
}

/**
 * Arrêt complet du microphone et libération du capteur audio.
 */
export function stopPersistentAudioStream(): void {
  if (cachedAudioStream) {
    try {
      cachedAudioStream.getTracks().forEach((track) => track.stop());
    } catch {}
    cachedAudioStream = null;
  }
}

/* ───────────────────────── 4. Singleton Géolocalisation (Zéro re-prompt) ───────────────────────── */

export interface CachedCoords {
  latitude: number;
  longitude: number;
}

/**
 * Retourne la position géographique persistante.
 * Si une position a déjà été accordée et date de moins de 2 heures, elle est retournée immédiatement
 * et rafraîchie en tâche de fond pour une expérience instantanée sans re-prompt.
 */
export async function getPersistentGeolocation(): Promise<CachedCoords> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    throw new Error("La géolocalisation n'est pas supportée sur cet appareil.");
  }

  // 1. Vérification du cache récent (< 2 heures)
  try {
    const cachedLat = localStorage.getItem(GEO_CACHED_LAT_KEY);
    const cachedLng = localStorage.getItem(GEO_CACHED_LNG_KEY);
    const cachedAt = localStorage.getItem(GEO_CACHED_AT_KEY);

    if (cachedLat && cachedLng && cachedAt) {
      const ageMs = Date.now() - Number(cachedAt);
      if (ageMs < 2 * 60 * 60 * 1000) {
        // Rafraîchir silencieusement en tâche de fond
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            saveHardwareCoords(pos.coords.latitude, pos.coords.longitude);
            saveHardwarePermGranted("geo");
          },
          () => {},
          { maximumAge: 3600000, timeout: 8000, enableHighAccuracy: false }
        );

        return {
          latitude: parseFloat(cachedLat),
          longitude: parseFloat(cachedLng),
        };
      }
    }
  } catch {}

  // 2. Requête système unique avec mémorisation
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        saveHardwareCoords(latitude, longitude);
        saveHardwarePermGranted("geo");
        resolve({ latitude, longitude });
      },
      (err) => {
        // En cas d'erreur mais avec un cache existant, repli sur le cache
        try {
          const cachedLat = localStorage.getItem(GEO_CACHED_LAT_KEY);
          const cachedLng = localStorage.getItem(GEO_CACHED_LNG_KEY);
          if (cachedLat && cachedLng) {
            resolve({
              latitude: parseFloat(cachedLat),
              longitude: parseFloat(cachedLng),
            });
            return;
          }
        } catch {}
        reject(err);
      },
      {
        maximumAge: 600000,
        timeout: 12000,
        enableHighAccuracy: true,
      }
    );
  });
}

function saveHardwareCoords(lat: number, lng: number): void {
  try {
    localStorage.setItem(GEO_CACHED_LAT_KEY, String(lat));
    localStorage.setItem(GEO_CACHED_LNG_KEY, String(lng));
    localStorage.setItem(GEO_CACHED_AT_KEY, String(Date.now()));
  } catch {}
}

/* ───────────────────────── 5. Singleton Notifications ───────────────────────── */

export async function requestPersistentNotification(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission === "granted") {
    saveHardwarePermGranted("notifications");
    return "granted";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  try {
    const res = await Notification.requestPermission();
    if (res === "granted") {
      saveHardwarePermGranted("notifications");
    }
    return res;
  } catch {
    return "denied";
  }
}

/* ───────────────────────── 6. Autorisation Globale en 1 Fois ───────────────────────── */

/**
 * Enregistre les consentements matériels auprès de l'API /api/auth/consent (non-bloquant).
 */
export async function syncHardwareConsentsWithServer(userId?: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const targetUserId =
      userId ||
      (() => {
        try {
          const raw = localStorage.getItem("kene-user");
          return raw ? JSON.parse(raw)?.id : null;
        } catch {
          return null;
        }
      })();

    if (!targetUserId) return;

    const grantedTypes: string[] = [];
    if (isHardwarePermGranted("camera")) grantedTypes.push("camera_access");
    if (isHardwarePermGranted("mic")) grantedTypes.push("mic_access");
    if (isHardwarePermGranted("geo")) grantedTypes.push("geo_access");
    if (isHardwarePermGranted("notifications")) grantedTypes.push("notifications_access");

    if (grantedTypes.length > 0) {
      void fetch("/api/auth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, types: grantedTypes }),
      }).catch(() => null);
    }
  } catch {}
}

/**
 * Permet d'amorcer en 1 seule étape les autorisations matérielles requises
 * pour garantir que plus aucun matériel ne redemande de permission ensuite.
 * IMPORTANT : Commence immédiatement par Caméra + Micro pour consommer le geste utilisateur direct.
 */
export async function requestAllHardwarePermissionsOnce(userId?: string | null): Promise<{
  camera: boolean;
  mic: boolean;
  geo: boolean;
  notifications: boolean;
}> {
  const status = {
    camera: isHardwarePermGranted("camera"),
    mic: isHardwarePermGranted("mic"),
    geo: isHardwarePermGranted("geo"),
    notifications: isHardwarePermGranted("notifications"),
  };

  // 1. Priorité absolue : Caméra & Microphone sous le geste utilisateur actif
  if (!status.camera && !status.mic && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
    try {
      const combined = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      combined.getTracks().forEach((t) => t.stop());
      status.camera = true;
      status.mic = true;
      saveHardwarePermGranted("camera");
      saveHardwarePermGranted("mic");
    } catch {
      // Si la demande groupée échoue, repli individuel immédiat
      if (!status.camera) {
        try {
          const cam = await getPersistentCameraStream("user");
          pausePersistentCameraStream();
          status.camera = true;
        } catch {}
      }
      if (!status.mic) {
        try {
          const mic = await getPersistentAudioStream();
          pausePersistentAudioStream();
          status.mic = true;
        } catch {}
      }
    }
  } else {
    if (!status.camera) {
      try {
        const cam = await getPersistentCameraStream("user");
        pausePersistentCameraStream();
        status.camera = true;
      } catch {}
    }
    if (!status.mic) {
      try {
        const mic = await getPersistentAudioStream();
        pausePersistentAudioStream();
        status.mic = true;
      } catch {}
    }
  }

  // 2. Géolocalisation
  if (!status.geo) {
    try {
      await getPersistentGeolocation();
      status.geo = true;
    } catch {}
  }

  // 3. Notifications Push
  if (!status.notifications) {
    try {
      const notif = await requestPersistentNotification();
      status.notifications = notif === "granted";
    } catch {}
  }

  saveHardwarePermGranted();
  void syncHardwareConsentsWithServer(userId);
  notifyHardwareListeners();

  return status;
}
