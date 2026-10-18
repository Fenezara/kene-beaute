"use client";
// Kènè — Mode Selfie Caméra Live avec guide facial ovale & contrôle d'éclairage
// Permet un cadrage optimal et instantané pour l'analyse cutanée VLM.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, FlipHorizontal, Lightbulb, Loader2, SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import {
  getPersistentCameraStream,
  pausePersistentCameraStream,
  saveHardwarePermGranted,
} from "@/lib/kene/hardware-perm";

interface LiveCameraModalProps {
  zoneLabel: string;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function LiveCameraModal({ zoneLabel, onCapture, onClose }: LiveCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lighting, setLighting] = useState<"optimal" | "faible" | "forte" | "contre_jour">("optimal");
  const [lightScore, setLightScore] = useState<number>(88);
  const [flashing, setFlashing] = useState(false);

  // Initialisation du flux caméra persistant (Zéro re-prompt système)
  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        setReady(false);
        setError(null);

        const stream = await getPersistentCameraStream(facingMode);

        if (!active) return;

        streamRef.current = stream;
        saveHardwarePermGranted("camera");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (err: any) {
        if (!active) return;
        const isPermDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        const msg = err instanceof Error ? err.message : "Impossible d'accéder à la caméra";
        setError(msg);
        if (isPermDenied) {
          toast.error("Accès caméra refusé — autorise l'appareil photo dans les paramètres");
        } else {
          toast.error("Initialisation de la caméra… réessaie dans un instant");
        }
      }
    }

    startCamera();

    return () => {
      active = false;
      // Met en pause la caméra sans détruire la session d'autorisation (0 re-prompt lors de la prochaine utilisation)
      pausePersistentCameraStream();
    };
  }, [facingMode]);

  // Analyse périodique de l'éclairage ambiant (Visage vs Arrière-plan & Contre-jour)
  useEffect(() => {
    if (!ready) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const size = 64;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(video, 0, 0, size, size);

      try {
        const imgData = ctx.getImageData(0, 0, size, size);
        const data = imgData.data;
        let centerSum = 0;
        let centerCount = 0;
        let bgSum = 0;
        let bgCount = 0;

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;

            // Zone centrale ovale correspondant au visage
            const dx = (x - size / 2) / 16;
            const dy = (y - size / 2) / 22;
            if (dx * dx + dy * dy <= 1) {
              centerSum += lum;
              centerCount++;
            } else {
              bgSum += lum;
              bgCount++;
            }
          }
        }

        const avgCenter = centerCount > 0 ? centerSum / centerCount : 128;
        const avgBg = bgCount > 0 ? bgSum / bgCount : 128;

        let calculatedScore = 100 - Math.min(60, Math.abs(avgCenter - 130) * 0.7);

        if (avgBg - avgCenter > 50 && avgCenter < 110) {
          // Contre-jour violent
          setLighting("contre_jour");
          calculatedScore = Math.max(30, calculatedScore - 35);
        } else if (avgCenter < 65) {
          setLighting("faible");
          calculatedScore = Math.max(25, Math.round((avgCenter / 65) * 55));
        } else if (avgCenter > 220) {
          setLighting("forte");
          calculatedScore = Math.max(35, Math.round(100 - (avgCenter - 220) * 1.5));
        } else {
          setLighting("optimal");
          calculatedScore = Math.min(100, Math.max(80, Math.round(calculatedScore)));
        }

        setLightScore(Math.round(calculatedScore));
      } catch {
        // pas d'impact
      }
    }, 800);

    return () => clearInterval(interval);
  }, [ready]);

  function flipCamera() {
    haptic(HAPTIC.light);
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }

  function takeSnapshot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    haptic(HAPTIC.success);
    setFlashing(true);

    const canvas = document.createElement("canvas");
    // Résolution équilibrée pour analyse VLM (~820px)
    const targetSize = 820;
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Découpe carrée centrée
    const minDim = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - minDim) / 2;
    const startY = (video.videoHeight - minDim) / 2;

    // Miroir horizontal si caméra selfie
    if (facingMode === "user") {
      ctx.translate(targetSize, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);

    setTimeout(() => {
      onCapture(dataUrl);
      onClose();
    }, 250);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#120E0C] text-[#F8F1E4] select-none animate-in fade-in duration-200">
      {/* Hidden canvas pour analyse de luminosité */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Flash visuel lors de la capture */}
      {flashing && (
        <div className="absolute inset-0 z-50 bg-white opacity-80 pointer-events-none transition-opacity duration-300" />
      )}

      {/* Barre supérieure */}
      <header className="flex items-center justify-between p-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] z-20">
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
          aria-label="Fermer la caméra"
        >
          <X size={20} />
        </button>

        <div className="text-center">
          <p className="font-heading font-black text-sm tracking-wide">Scanner de Peau Kènè</p>
          <p className="text-[11px] text-white/70">Zone : {zoneLabel}</p>
        </div>

        <button
          type="button"
          onClick={flipCamera}
          className="h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
          aria-label="Retourner la caméra"
        >
          <SwitchCamera size={20} />
        </button>
      </header>

      {/* Zone de prévisualisation vidéo */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="p-6 text-center max-w-xs">
            <Camera size={48} className="mx-auto text-primary mb-3 opacity-60" />
            <p className="text-sm font-bold text-white mb-1">Caméra inaccessible</p>
            <p className="text-xs text-white/60 mb-4">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-6 rounded-2xl bg-primary text-primary-foreground font-bold text-xs"
            >
              Retour à l&apos;import de fichier
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
            />

            {!ready && (
              <div className="absolute inset-0 grid place-items-center bg-[#120E0C]">
                <div className="flex flex-col items-center gap-2 text-primary">
                  <Loader2 size={36} className="animate-spin" />
                  <p className="text-xs font-semibold">Activation du capteur…</p>
                </div>
              </div>
            )}

            {/* Guide facial ovale (Masque SVG élégant avec anneau réactif à la lumière) */}
            {ready && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                {/* Ovale de centrage avec anneau réactif */}
                <div
                  className={cn(
                    "relative w-[75vw] max-w-[290px] aspect-[3/4] rounded-[50%] border-2 transition-all duration-300 shadow-[0_0_0_9999px_rgba(18,14,12,0.68)] flex items-center justify-center",
                    lighting === "optimal"
                      ? "border-[#3F7D3F] border-solid shadow-[0_0_28px_rgba(63,125,63,0.5)]"
                      : lighting === "faible"
                        ? "border-[#C8951E]/90 border-dashed shadow-[0_0_20px_rgba(200,149,30,0.35)]"
                        : "border-[#C93B62] border-dashed shadow-[0_0_24px_rgba(201,59,98,0.4)]"
                  )}
                >
                  <div
                    className={cn(
                      "w-full h-full rounded-[50%] border transition-colors",
                      lighting === "optimal" ? "border-[#3F7D3F]/40" : "border-[#C8951E]/30"
                    )}
                  />
                  {/* Croix de centrage discrète */}
                  <div className="absolute inset-x-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-0.5 bg-[#C8951E]/40" />
                  <div className="absolute inset-y-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-[#C8951E]/40" />
                </div>

                {/* Badge d'indication d'éclairage et qualité en temps réel */}
                <div className="mt-4 z-10 flex flex-col items-center gap-1.5 px-4 text-center">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md shadow-lg transition-all",
                      lighting === "optimal"
                        ? "bg-[#3F7D3F]/90 text-white ring-1 ring-white/20"
                        : lighting === "faible"
                          ? "bg-[#C8951E]/90 text-[#120E0C] ring-1 ring-[#C8951E]/30"
                          : "bg-[#C93B62]/90 text-white ring-1 ring-white/20"
                    )}
                  >
                    <Lightbulb size={13} className="shrink-0" />
                    <span>
                      {lighting === "optimal"
                        ? `Lumière idéale (${lightScore}%) · Prêt pour le scan ✨`
                        : lighting === "faible"
                          ? `Lumière faible (${lightScore}%) — approche-toi d'une fenêtre ☀️`
                          : lighting === "contre_jour"
                            ? `Contre-jour (${lightScore}%) — tourne le dos à la lumière ⚠️`
                            : `Lumière trop vive (${lightScore}%) — atténue le reflet ⚠️`}
                    </span>
                  </span>

                  {/* Conseil Peau nue & cadrage */}
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-semibold bg-black/75 text-white/90 border border-white/15 backdrop-blur-md">
                    💄 Peau démaquillée &amp; visage centré = Bilan biométrique 100% précis
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Barre inférieure de déclenchement — surélevée pour libérer le bouton sous tous les écrans */}
      <footer className="p-6 pb-[max(env(safe-area-inset-bottom,0px),3.5rem)] flex flex-col items-center gap-4 bg-gradient-to-t from-[#120E0C] via-[#120E0C]/90 to-transparent z-20">
        <p className="text-xs text-white/80 text-center font-medium">
          Aligne ton visage dans l&apos;ovale, détends tes traits et capture
        </p>

        <div className="flex items-center justify-center w-full pb-3">
          {/* Déclencheur tactile principal */}
          <button
            type="button"
            disabled={!ready || Boolean(error)}
            onClick={takeSnapshot}
            aria-label="Prendre la photo pour l'analyse"
            className="group relative h-20 w-20 rounded-full border-4 border-white/80 p-1 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shadow-xl"
          >
            <div className="h-full w-full rounded-full bg-gradient-to-tr from-[#C8951E] to-[#E07A2B] shadow-[0_0_24px_rgba(200,149,30,0.7)] group-hover:scale-95 transition-transform" />
          </button>
        </div>
      </footer>
    </div>,
    document.body
  );
}
