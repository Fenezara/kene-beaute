"use client";
// Kènè — Mode Selfie Caméra Live avec guide facial ovale & contrôle d'éclairage
// Permet un cadrage optimal et instantané pour l'analyse cutanée VLM.
import { useEffect, useRef, useState } from "react";
import { Camera, FlipHorizontal, Lightbulb, Loader2, SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import { HAPTIC, haptic } from "@/lib/kene/ux";

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
  const [lighting, setLighting] = useState<"optimal" | "faible" | "forte">("optimal");
  const [flashing, setFlashing] = useState(false);

  // Initialisation du flux caméra
  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        setReady(false);
        setError(null);

        // Arrêter l'ancien flux si existant
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("L'accès à la caméra n'est pas supporté par ce navigateur.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1080 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : "Impossible d'accéder à la caméra";
        setError(msg);
        toast.error("Accès caméra indisponible — vérifie tes autorisations");
      }
    }

    startCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [facingMode]);

  // Analyse périodique de l'éclairage ambiant
  useEffect(() => {
    if (!ready) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = 48;
      canvas.height = 48;
      ctx.drawImage(video, 0, 0, 48, 48);

      try {
        const imgData = ctx.getImageData(0, 0, 48, 48);
        const data = imgData.data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Formule de luminance perçue
          sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }
        const avg = sum / (data.length / 4);

        if (avg < 55) {
          setLighting("faible");
        } else if (avg > 215) {
          setLighting("forte");
        } else {
          setLighting("optimal");
        }
      } catch {
        // pas d'impact
      }
    }, 1200);

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#120E0C] text-[#F8F1E4] select-none animate-in fade-in duration-200">
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

            {/* Guide facial ovale (Masque SVG élégant aux reflets dorés) */}
            {ready && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                {/* Ovale de centrage */}
                <div className="relative w-[75vw] max-w-[290px] aspect-[3/4] rounded-[50%] border-2 border-dashed border-[#C8951E]/80 shadow-[0_0_0_9999px_rgba(18,14,12,0.65)] flex items-center justify-center">
                  <div className="w-full h-full rounded-[50%] border border-[#C8951E]/40" />
                  {/* Croix de centrage discrète */}
                  <div className="absolute inset-x-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-0.5 bg-[#C8951E]/40" />
                  <div className="absolute inset-y-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-[#C8951E]/40" />
                </div>

                {/* Badge d'indication d'éclairage */}
                <div className="mt-4 z-10">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold backdrop-blur-md shadow-lg transition-colors ${
                      lighting === "optimal"
                        ? "bg-[#3F7D3F]/80 text-white"
                        : lighting === "faible"
                          ? "bg-[#C8951E]/85 text-[#120E0C]"
                          : "bg-[#8B1A3B]/80 text-white"
                    }`}
                  >
                    <Lightbulb size={12} />
                    {lighting === "optimal"
                      ? "Éclairage optimal pour l'analyse"
                      : lighting === "faible"
                        ? "Lumière faible — approche-toi d'une fenêtre ☀️"
                        : "Lumière trop vive / contre-jour ⚠️"}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Barre inférieure de déclenchement */}
      <footer className="p-6 pb-8 flex flex-col items-center gap-4 bg-gradient-to-t from-[#120E0C] to-transparent z-20">
        <p className="text-xs text-white/80 text-center font-medium">
          Aligne ton visage dans l&apos;ovale, détends tes traits et capture
        </p>

        <div className="flex items-center justify-center w-full">
          {/* Déclencheur tactile principal */}
          <button
            type="button"
            disabled={!ready || Boolean(error)}
            onClick={takeSnapshot}
            aria-label="Prendre la photo pour l'analyse"
            className="group relative h-20 w-20 rounded-full border-4 border-white/80 p-1 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
          >
            <div className="h-full w-full rounded-full bg-gradient-to-tr from-[#C8951E] to-[#E07A2B] shadow-[0_0_24px_rgba(200,149,30,0.7)] group-hover:scale-95 transition-transform" />
          </button>
        </div>
      </footer>
    </div>
  );
}
