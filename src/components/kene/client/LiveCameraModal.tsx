"use client";
// Kènè — Mode Selfie Caméra Live avec guide facial ovale & contrôle d'éclairage
// Permet un cadrage optimal et instantané pour l'analyse cutanée VLM.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, FlipHorizontal, Lightbulb, Loader2, RotateCcw, SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import {
  getPersistentCameraStream,
  stopPersistentCameraStream,
  saveHardwarePermGranted,
} from "@/lib/kene/hardware-perm";
import { resizeImage } from "@/lib/kene/api";
import type { ZonePhotoSlot } from "@/lib/kene/types";

interface LiveCameraModalProps {
  zoneLabel: string;
  onCapture: (dataUrl: string, slotId?: string) => void;
  onClose: () => void;
  slots?: ZonePhotoSlot[];
  activeSlotId?: string;
  onSlotChange?: (slotId: string) => void;
}

export function LiveCameraModal({
  zoneLabel,
  onCapture,
  onClose,
  slots,
  activeSlotId,
  onSlotChange,
}: LiveCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);

  const [currentSlotId, setCurrentSlotId] = useState<string>(
    activeSlotId || (slots?.[0]?.id ?? "main")
  );
  const currentSlot = slots?.find((s) => s.id === currentSlotId) ?? (slots?.[0] || null);
  const currentSlotIndex = slots && currentSlot ? slots.findIndex((s) => s.id === currentSlot.id) : 0;

  const [capturedCount, setCapturedCount] = useState<number>(0);
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
        const msg = isPermDenied
          ? "Accès caméra bloqué par le navigateur."
          : err instanceof Error
          ? err.message
          : "Impossible d'accéder à la caméra.";
        setError(msg);
        if (isPermDenied) {
          toast.error("Accès caméra bloqué — Débloque via le cadenas 🔒 de ton navigateur");
        } else {
          toast.error("Caméra indisponible — Utilise l'appareil photo du téléphone");
        }
      }
    }

    startCamera();

    return () => {
      active = false;
      // Libération propre du capteur matériel Android / iOS pour éviter tout verrouillage physique
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((t) => t.stop());
        } catch {}
        streamRef.current = null;
      }
      stopPersistentCameraStream();
    };
  }, [facingMode]);

  async function handleNativeCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      haptic(HAPTIC.success);
      const dataUrl = await resizeImage(file);
      onCapture(dataUrl);
      onClose();
    } catch {
      toast.error("Photo non reconnue. Réessaie.");
    } finally {
      e.target.value = "";
    }
  }

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
    setCapturedCount((c) => c + 1);

    // Multi-angles continu : on garde le flux actif pour le slot suivant sans redemander la caméra !
    if (slots && slots.length > 1) {
      onCapture(dataUrl, currentSlotId);
      const nextIndex = currentSlotIndex + 1;
      if (nextIndex < slots.length) {
        const nextSlot = slots[nextIndex];
        toast.success(`Angle « ${currentSlot?.label ?? "Photo"} » capturé !`, {
          description: `Passez maintenant à « ${nextSlot.label} » (${nextSlot.hint}).`,
        });
        setCurrentSlotId(nextSlot.id);
        onSlotChange?.(nextSlot.id);
        setTimeout(() => setFlashing(false), 200);
        return;
      }
    }

    // Coupure immédiate du capteur physique dès la capture finale
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    stopPersistentCameraStream();

    setTimeout(() => {
      onCapture(dataUrl, currentSlotId);
      onClose();
    }, 100);
  }

  function handleClose() {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    stopPersistentCameraStream();
    onClose();
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
          onClick={handleClose}
          className="h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white"
          aria-label="Fermer la caméra"
        >
          <X size={20} />
        </button>

        <div className="text-center">
          <p className="font-heading font-black text-sm tracking-wide">
            {slots && slots.length > 1
              ? `Angle ${currentSlotIndex + 1}/${slots.length} : ${currentSlot?.label || zoneLabel}`
              : "Scanner de Peau Kènè"}
          </p>
          <p className="text-[11px] text-white/70">
            {currentSlot?.hint || `Zone : ${zoneLabel}`}
          </p>
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
          <div className="p-5 text-center max-w-sm mx-auto flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center">
              <Camera size={30} />
            </div>

            <div>
              <p className="text-base font-bold text-white mb-1">Caméra non disponible</p>
              <p className="text-xs text-white/70">{error}</p>
            </div>

            {/* Guide pas-à-pas pour débloquer l'autorisation dans le navigateur */}
            <div className="w-full text-left bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-2 text-xs">
              <p className="font-semibold text-white/90 flex items-center gap-1.5">
                <span>🔒</span> Pour débloquer l&apos;accès caméra :
              </p>
              <ol className="list-decimal list-inside text-white/75 space-y-1 text-[11px] leading-relaxed">
                <li>Touche le <strong>cadenas 🔒</strong> ou l&apos;icône réglages à gauche de l&apos;adresse du site</li>
                <li>Sélectionne <strong>« Autorisations »</strong> ou <strong>« Paramètres du site »</strong></li>
                <li>Active <strong>« Appareil photo »</strong> puis rafraîchis la page</li>
              </ol>
            </div>

            {/* Action immédiate : capture native sans blocage WebRTC */}
            <div className="w-full flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => nativeInputRef.current?.click()}
                className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-primary/20"
              >
                <Camera size={16} /> Prendre la photo avec l&apos;appareil photo
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setReady(false);
                    getPersistentCameraStream(facingMode)
                      .then((stream) => {
                        streamRef.current = stream;
                        if (videoRef.current) {
                          videoRef.current.srcObject = stream;
                          videoRef.current.play().catch(() => {});
                        }
                        setReady(true);
                      })
                      .catch((e) => {
                        setError(e instanceof Error ? e.message : "Échec");
                      });
                  }}
                  className="flex-1 h-11 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-medium text-xs flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <RotateCcw size={14} /> Réessayer
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-11 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 font-medium text-xs flex items-center justify-center active:scale-95"
                >
                  Fermer
                </button>
              </div>
            </div>

            <input
              ref={nativeInputRef}
              type="file"
              accept="image/*"
              capture={facingMode === "user" ? "user" : "environment"}
              className="sr-only"
              onChange={handleNativeCapture}
            />
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

        <div className="flex items-center justify-center gap-4 w-full pb-3">
          {capturedCount > 0 && slots && slots.length > 1 && (
            <button
              type="button"
              onClick={handleClose}
              className="h-11 px-4 rounded-full bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs backdrop-blur-md active:scale-95 transition-all"
            >
              Terminer ({capturedCount}/{slots.length}) ✔
            </button>
          )}

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
