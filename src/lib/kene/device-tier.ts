// Kènè — Détection Matérielle & Performance Adaptative ("Afro-Fast Tiering")
// Détecte automatiquement la puissance du téléphone (CPU, RAM, GPU, batterie, réseau)
// pour basculer en toute transparence entre :
// • tier "low" : Mode Vitesse Pure (Tecno, Infinix, Itel, Samsung A, etc. - zéro freeze, zéro lag)
// • tier "high" : Mode Sanctuaire 3D Total (Three.js WebGL 60/120 FPS, shaders de mélanine, particules d'or)

export type PerformanceTier = "low" | "mid" | "high";

export interface DevicePerformanceProfile {
  tier: PerformanceTier;
  isLowEnd: boolean;
  isHighEnd: boolean;
  hasWebGL: boolean;
  deviceMemory: number | null; // Go de RAM (si supporté par le navigateur)
  hardwareConcurrency: number; // Nombre de cœurs CPU
  prefersReducedMotion: boolean;
}

let cachedProfile: DevicePerformanceProfile | null = null;

export function detectDevicePerformance(): DevicePerformanceProfile {
  if (typeof window === "undefined") {
    return {
      tier: "mid",
      isLowEnd: false,
      isHighEnd: false,
      hasWebGL: true,
      deviceMemory: null,
      hardwareConcurrency: 4,
      prefersReducedMotion: false,
    };
  }

  if (cachedProfile) return cachedProfile;

  const nav = window.navigator as unknown as {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    userAgent?: string;
  };

  const ram = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 4;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Détection du support et de la performance WebGL basique
  let hasWebGL = false;
  let isGlLowTier = false;

  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl) {
      hasWebGL = true;
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)?.toLowerCase() || "";
        // GPU typiques des mobiles entrée de gamme Afrique de l'Ouest
        if (
          renderer.includes("powervr") ||
          renderer.includes("mali-400") ||
          renderer.includes("mali-t") ||
          renderer.includes("mali-g52") ||
          renderer.includes("mali-g31") ||
          renderer.includes("adreno 3") ||
          renderer.includes("adreno 505") ||
          renderer.includes("adreno 506") ||
          renderer.includes("swiftshader")
        ) {
          isGlLowTier = true;
        }
      }
    }
  } catch {
    hasWebGL = false;
  }

  // Critères d'entrée de gamme stricte
  // RAM <= 3 Go OU cœurs <= 4 sur GPU modeste OU prefersReducedMotion
  let tier: PerformanceTier = "mid";

  if (prefersReduced || !hasWebGL || (ram !== null && ram <= 3) || (cores <= 4 && isGlLowTier)) {
    tier = "low";
  } else if ((ram !== null && ram >= 6) || cores >= 8) {
    tier = "high";
  } else {
    tier = "mid";
  }

  cachedProfile = {
    tier,
    isLowEnd: tier === "low",
    isHighEnd: tier === "high",
    hasWebGL,
    deviceMemory: ram,
    hardwareConcurrency: cores,
    prefersReducedMotion: prefersReduced,
  };

  // Marquage de la classe HTML pour optimiser le CSS au scroll
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.classList.remove("kene-tier-low", "kene-tier-mid", "kene-tier-high");
    document.documentElement.classList.add(`kene-tier-${tier}`);
  }

  return cachedProfile;
}
