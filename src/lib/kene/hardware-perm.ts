// src/lib/kene/hardware-perm.ts
// Gestion et mémorisation permanente des autorisations matérielles du téléphone (Caméra, Microphone, Localisation)
// RÈGLE : Les autorisations matérielles ne doivent être demandées QU'UNE SEULE FOIS.
// Une fois accordées, l'application mémorise le statut et ne redemande plus rien.

export const HARDWARE_PERM_KEY = "kene-hardware-permission-granted";
export const CAMERA_PERM_KEY = "kene-hardware-camera-granted";
export const MIC_PERM_KEY = "kene-hardware-mic-granted";
export const GEO_PERM_KEY = "kene-hardware-geo-granted";

export type HardwareFeature = "camera" | "mic" | "geo";

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
        : GEO_PERM_KEY;
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
  } catch {}
}

/**
 * Synchronise l'état de l'application avec les permissions effectives du navigateur / système.
 * Si le système indique "granted", l'application enregistre le statut et ne redemande plus rien.
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
    ]);

    let anyGranted = false;
    results.forEach((r, idx) => {
      if (r.status === "fulfilled" && r.value.state === "granted") {
        anyGranted = true;
        saveHardwarePermGranted(idx === 0 ? "mic" : "camera");
      }
    });

    if (anyGranted) {
      saveHardwarePermGranted();
      return true;
    }
  } catch {
    // Les navigateurs qui ne supportent pas le query pour camera/mic gardent le localStorage
  }
  return isHardwarePermGranted();
}
