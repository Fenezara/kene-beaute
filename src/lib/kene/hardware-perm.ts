// src/lib/kene/hardware-perm.ts
// Gestion et mémorisation permanente des autorisations matérielles du téléphone (Microphone, Caméra, Localisation)
// Évite les sollicitations répétitives lorsque l'utilisateur a déjà autorisé le matériel.

export const HARDWARE_PERM_KEY = "kene-hardware-permission-granted";

export function isHardwarePermGranted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(HARDWARE_PERM_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveHardwarePermGranted(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HARDWARE_PERM_KEY, "true");
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

    const isAnyGranted = results.some(
      (r) => r.status === "fulfilled" && r.value.state === "granted"
    );

    if (isAnyGranted) {
      saveHardwarePermGranted();
      return true;
    }
  } catch {
    // Les navigateurs qui ne supportent pas le query pour camera/mic gardent le localStorage
  }
  return isHardwarePermGranted();
}
