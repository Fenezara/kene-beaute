// Kènè — Extraction locale haute précision d'angles clés depuis une vidéo cutanée (.mp4, .mov, .webm)
// Zéro upload lourd sur réseau mobile 3G/4G : la vidéo (15–60 Mo) est décodée localement sur l'appareil
// en 3 vues nettes calibrées 1024px (~95 Ko/vue) avec sélection "Best-of-Burst" anti-flou et télémétrie CIE L*a*b*.

import {
  computeOpticalMetricsFromRgba,
  injectOpticalTelemetryIntoJpegDataUrl,
} from "@/lib/kene/optical-biometrics";

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|3gp|mkv|avi)$/i;

/** Détecte si un fichier sélectionné est une vidéo supportée sur iOS / Android / Desktop. */
export function isVideoFile(file: File | null | undefined): boolean {
  if (!file) return false;
  if (file.type && file.type.toLowerCase().startsWith("video/")) return true;
  return VIDEO_EXT_RE.test(file.name || "");
}

export interface ExtractedVideoResult {
  frames: string[];
  durationSec: number;
}

/**
 * Extrait `maxFrames` clichés haute netteté répartis sur la durée utile de la vidéo
 * (ex: 18 %, 52 %, 84 % → Face, Profil gauche, Profil droit) avec découpe/redimensionnement optimisé VLM.
 */
export async function extractVideoKeyframes(
  file: File,
  maxFrames = 3,
  maxSide = 1024,
): Promise<ExtractedVideoResult> {
  if (typeof document === "undefined") {
    throw new Error("Extraction vidéo disponible uniquement dans le navigateur");
  }

  // Garde-fou mémoire locale (150 Mo max en lecture locale sans envoi réseau)
  const MAX_LOCAL_BYTES = 150 * 1024 * 1024;
  if (file.size > MAX_LOCAL_BYTES) {
    throw new Error("Vidéo trop volumineuse (maximum 150 Mo). Choisis une séquence courte de 3 à 15 secondes.");
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  const cleanup = () => {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {}
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {}
  };

  try {
    // 1. Chargement des métadonnées vidéo
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Délai dépassé lors de la lecture de la vidéo")), 9000);
      const onLoaded = () => {
        clearTimeout(timer);
        resolve();
      };
      const onErr = () => {
        clearTimeout(timer);
        reject(new Error("Format vidéo non reconnu sur cet appareil (privilégie MP4 ou MOV)"));
      };
      video.addEventListener("loadeddata", onLoaded, { once: true });
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onErr, { once: true });
      video.src = objectUrl;
      video.load();
    });

    // 2. Résolution fiable de la durée (correctif WebM Android où duration === Infinity au départ)
    let duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1800);
        const onTime = () => {
          clearTimeout(timer);
          resolve();
        };
        video.addEventListener("timeupdate", onTime, { once: true });
        video.addEventListener("durationchange", onTime, { once: true });
        try {
          video.currentTime = 1e6;
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
      duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 4.5;
    }

    // Fenêtre d'analyse utile : les 10 premières secondes max, en évitant les 0.2s initiales (auto-exposition caméra)
    const usableDuration = Math.max(0.6, Math.min(duration, 12));
    const count = Math.max(1, Math.min(maxFrames, duration < 1.2 ? 1 : duration < 2.4 ? 2 : maxFrames));

    const ratios =
      count === 1
        ? [0.5]
        : count === 2
        ? [0.25, 0.75]
        : count === 3
        ? [0.18, 0.52, 0.84]
        : Array.from({ length: count }, (_, i) => 0.15 + (0.72 * i) / (count - 1));

    const timestamps = ratios.map((r) =>
      Math.min(Math.max(0.15, usableDuration * r), Math.max(0.15, duration - 0.12)),
    );

    const frames: string[] = [];

    // 3. Extraction séquentielle image par image avec sélection Best-of-Burst (netteté Laplacien maximale)
    for (const targetTime of timestamps) {
      const candidateTimes = [
        targetTime,
        Math.min(Math.max(0.15, duration - 0.1), targetTime + 0.14),
      ];
      let bestFrameUrl: string | null = null;
      let bestSharpness = -1;

      for (const candidateTime of candidateTimes) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 2500);
          const onSeeked = () => {
            clearTimeout(timer);
            setTimeout(resolve, 40);
          };
          video.addEventListener("seeked", onSeeked, { once: true });
          try {
            video.currentTime = candidateTime;
          } catch {
            clearTimeout(timer);
            resolve();
          }
        });

        const vw = video.videoWidth || 720;
        const vh = video.videoHeight || 720;
        if (vw === 0 || vh === 0) continue;

        const minDim = Math.min(vw, vh);
        const sx = Math.round((vw - minDim) / 2);
        const sy = Math.round((vh - minDim) / 2);
        const targetSide = Math.min(maxSide, minDim);

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, targetSide);
        canvas.height = Math.max(1, targetSide);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) continue;

        ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, canvas.width, canvas.height);
        const rawUrl = canvas.toDataURL("image/jpeg", 0.88);
        if (!rawUrl || !rawUrl.startsWith("data:image/")) continue;

        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const metrics = computeOpticalMetricsFromRgba(imgData.data, canvas.width, canvas.height);
          const enrichedUrl = injectOpticalTelemetryIntoJpegDataUrl(rawUrl, metrics);
          if (metrics.sharpnessScore > bestSharpness) {
            bestSharpness = metrics.sharpnessScore;
            bestFrameUrl = enrichedUrl;
          }
          // Si le premier cliché est déjà très net, inutile de tester le second candidat du burst
          if (metrics.sharpnessScore >= 68) break;
        } catch {
          if (!bestFrameUrl) bestFrameUrl = rawUrl;
        }
      }

      if (bestFrameUrl) {
        frames.push(bestFrameUrl);
      }
    }

    if (frames.length === 0) {
      throw new Error("Aucune image nette n'a pu être extraite de cette vidéo");
    }

    return {
      frames,
      durationSec: Math.round(duration * 10) / 10,
    };
  } finally {
    cleanup();
  }
}
