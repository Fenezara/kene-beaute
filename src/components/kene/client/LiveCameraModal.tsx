"use client";
// Kènè — Mode Caméra Live Biométrique (Photo Instantanée + Balayage Vidéo 360° 5s)
// Guide facial ovale réactif à l'éclairage + capture vidéo guidée multi-angles pour l'analyse VLM.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Lightbulb, Loader2, RotateCcw, Square, SwitchCamera, Video, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import {
  getPersistentCameraStream,
  stopPersistentCameraStream,
  saveHardwarePermGranted,
} from "@/lib/kene/hardware-perm";
import { resizeImage } from "@/lib/kene/api";
import { extractVideoKeyframes, isVideoFile } from "@/lib/kene/video-frames";
import type { ZonePhotoSlot } from "@/lib/kene/types";

interface LiveCameraModalProps {
  zoneLabel: string;
  onCapture: (dataUrl: string, slotId?: string) => void;
  onCaptureMultiple?: (captures: { dataUrl: string; slotId?: string }[]) => void;
  onClose: () => void;
  slots?: ZonePhotoSlot[];
  activeSlotId?: string;
  onSlotChange?: (slotId: string) => void;
  initialMode?: "photo" | "video";
  initialFacingMode?: "user" | "environment";
}

const VIDEO_SWEEP_DURATION_MS = 5000;

export function LiveCameraModal({
  zoneLabel,
  onCapture,
  onCaptureMultiple,
  onClose,
  slots,
  activeSlotId,
  onSlotChange,
  initialMode = "photo",
  initialFacingMode = "user",
}: LiveCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);
  const nativeVideoInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<"photo" | "video">(initialMode);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0); // 0..100
  const [recordStepIdx, setRecordStepIdx] = useState(0); // 0, 1, 2
  const [processingNativeVideo, setProcessingNativeVideo] = useState(false);

  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recFramesRef = useRef<{ dataUrl: string; slotId?: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const [currentSlotId, setCurrentSlotId] = useState<string>(
    activeSlotId || (slots?.[0]?.id ?? "main"),
  );
  const currentSlot = slots?.find((s) => s.id === currentSlotId) ?? (slots?.[0] || null);
  const currentSlotIndex = slots && currentSlot ? slots.findIndex((s) => s.id === currentSlot.id) : 0;

  const [capturedCount, setCapturedCount] = useState<number>(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(initialFacingMode);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lighting, setLighting] = useState<"optimal" | "faible" | "forte" | "contre_jour">("optimal");
  const [lightScore, setLightScore] = useState<number>(88);
  const [flashing, setFlashing] = useState(false);

  // Guide Interactif temporaire : donne les directives 4s puis disparaît de l'interface
  const [guideVisible, setGuideVisible] = useState(true);
  const guideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function triggerGuideTemporarily(durationMs = 3500) {
    setGuideVisible(true);
    if (guideTimerRef.current) clearTimeout(guideTimerRef.current);
    guideTimerRef.current = setTimeout(() => {
      setGuideVisible(false);
    }, durationMs);
  }

  useEffect(() => {
    if (!ready) return;
    triggerGuideTemporarily(4000);
    return () => {
      if (guideTimerRef.current) clearTimeout(guideTimerRef.current);
    };
  }, [ready, currentSlotId, mode]);

  function stopCameraHardware() {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
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
  }

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
          toast.error("Caméra indisponible — Utilise l'appareil photo ou vidéo du téléphone");
        }
      }
    }

    startCamera();

    return () => {
      active = false;
      stopCameraHardware();
    };
  }, []);

  async function handleNativeCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      haptic(HAPTIC.success);
      if (isVideoFile(file)) {
        setProcessingNativeVideo(true);
        const targetCount = slots && slots.length > 1 ? Math.min(slots.length, 3) : 3;
        const { frames } = await extractVideoKeyframes(file, targetCount);
        const mapped = frames.map((dataUrl, i) => ({
          dataUrl,
          slotId: slots?.[i]?.id ?? (i === 0 ? currentSlotId : undefined),
        }));
        if (onCaptureMultiple) {
          onCaptureMultiple(mapped);
        } else {
          mapped.forEach((m) => onCapture(m.dataUrl, m.slotId));
        }
        toast.success(`Vidéo analysée : ${mapped.length} angles extraits en haute netteté !`);
        onClose();
        return;
      }
      const dataUrl = await resizeImage(file);
      onCapture(dataUrl, currentSlotId);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fichier non reconnu. Réessaie.");
    } finally {
      setProcessingNativeVideo(false);
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

  async function flipCamera(e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (recording || isSwitchingCamera) return;

    haptic(HAPTIC.light);
    const nextFacing = facingMode === "user" ? "environment" : "user";
    setIsSwitchingCamera(true);

    try {
      // 1. Déconnecter l'ancien flux de l'élément vidéo
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((t) => t.stop());
        } catch {}
        streamRef.current = null;
      }
      stopPersistentCameraStream();

      // 2. Temporisation minimale (80ms) pour libérer le capteur physique sur mobile
      await new Promise((r) => setTimeout(r, 80));

      // 3. Acquérir le nouveau flux
      const newStream = await getPersistentCameraStream(nextFacing);
      streamRef.current = newStream;

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play().catch(() => {});
      }

      setFacingMode(nextFacing);
      setError(null);
      setReady(true);
      toast.success(
        nextFacing === "user" ? "Caméra avant (Selfie) activée" : "Caméra arrière activée",
        { duration: 1500 }
      );
    } catch (err) {
      console.warn("Basculement caméra impossible, maintien du flux existant :", err);
      // Repli doux : si la caméra cible n'est pas supportée, rétablir la précédente sans quitter le diagnostic
      try {
        const fallbackStream = await getPersistentCameraStream(facingMode);
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
        toast.info(
          nextFacing === "environment"
            ? "Caméra arrière indisponible sur cet appareil (maintien selfie)"
            : "Caméra avant indisponible (maintien caméra arrière)"
        );
      } catch {
        setError("Impossible d'accéder à la caméra demandée.");
      }
    } finally {
      setIsSwitchingCamera(false);
    }
  }

  /** Capture instantanée d'une frame carrée 820px depuis le flux vidéo actif */
  function grabVideoFrame(): string | null {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement("canvas");
    const targetSize = 820;
    canvas.width = targetSize;
    canvas.height = targetSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const minDim = Math.min(video.videoWidth, video.videoHeight);
    const startX = (video.videoWidth - minDim) / 2;
    const startY = (video.videoHeight - minDim) / 2;

    if (facingMode === "user") {
      ctx.translate(targetSize, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, targetSize, targetSize);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  function takeSnapshot() {
    const dataUrl = grabVideoFrame();
    if (!dataUrl) return;

    haptic(HAPTIC.success);
    setFlashing(true);
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

    stopCameraHardware();

    setTimeout(() => {
      onCapture(dataUrl, currentSlotId);
      onClose();
    }, 100);
  }

  /** Démarre ou finalise le balayage vidéo guidé de 5 secondes (3 angles extraits automatiquement) */
  function finishVideoSweep() {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }

    // S'assurer qu'au moins une frame finale est capturée si arrêt anticipé
    if (recFramesRef.current.length === 0) {
      const fallbackFrame = grabVideoFrame();
      if (fallbackFrame) {
        recFramesRef.current.push({ dataUrl: fallbackFrame, slotId: slots?.[0]?.id ?? currentSlotId });
      }
    }

    const captured = [...recFramesRef.current];
    setRecording(false);
    setFlashing(true);
    haptic(HAPTIC.success);

    stopCameraHardware();

    setTimeout(() => {
      if (onCaptureMultiple) {
        onCaptureMultiple(captured);
      } else {
        captured.forEach((c) => onCapture(c.dataUrl, c.slotId));
      }
      toast.success(`Scan vidéo 360° terminé (${captured.length} angle${captured.length > 1 ? "s" : ""} HD capturé${captured.length > 1 ? "s" : ""}) !`);
      onClose();
    }, 140);
  }

  function toggleVideoSweep() {
    if (recording) {
      // Autoriser l'arrêt manuel après au moins 1.2s
      if (recordProgress >= 24) {
        finishVideoSweep();
      }
      return;
    }

    if (!videoRef.current || videoRef.current.videoWidth === 0) return;

    haptic(HAPTIC.medium);
    recFramesRef.current = [];
    setRecordProgress(0);
    setRecordStepIdx(0);
    setRecording(true);

    // Activation optionnelle de MediaRecorder pour flux vidéo matériel natif
    if (streamRef.current && typeof MediaRecorder !== "undefined") {
      try {
        const mr = new MediaRecorder(streamRef.current);
        mr.start();
        mediaRecorderRef.current = mr;
      } catch {
        // Certaines WebViews iOS n'exposent pas MediaRecorder sans codec explicite : l'échantillonnage Canvas prend le relais
      }
    }

    const totalTargets = slots && slots.length > 1 ? Math.min(slots.length, 3) : 3;
    const capturePercents = totalTargets === 1 ? [50] : totalTargets === 2 ? [30, 78] : [22, 56, 88];
    const capturedFlags = capturePercents.map(() => false);

    const t0 = Date.now();
    recTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - t0;
      const pct = Math.min(100, Math.round((elapsed / VIDEO_SWEEP_DURATION_MS) * 100));
      setRecordProgress(pct);

      const step = pct < 35 ? 0 : pct < 70 ? Math.min(1, totalTargets - 1) : Math.min(2, totalTargets - 1);
      setRecordStepIdx(step);

      capturePercents.forEach((threshold, idx) => {
        if (!capturedFlags[idx] && pct >= threshold) {
          capturedFlags[idx] = true;
          const frame = grabVideoFrame();
          if (frame) {
            const targetSlotId = slots?.[idx]?.id ?? (idx === 0 ? currentSlotId : undefined);
            recFramesRef.current.push({ dataUrl: frame, slotId: targetSlotId });
            haptic(HAPTIC.light);
          }
        }
      });

      if (elapsed >= VIDEO_SWEEP_DURATION_MS) {
        finishVideoSweep();
      }
    }, 80);
  }

  function handleClose() {
    stopCameraHardware();
    onClose();
  }

  // Instructions dynamiques pendant le balayage vidéo 5s
  const videoStepPrompt = (() => {
    if (slots && slots.length >= 3) {
      const s = slots[recordStepIdx] ?? slots[0];
      return `Étape ${recordStepIdx + 1}/3 · ${s.label} — ${s.hint}`;
    }
    if (recordStepIdx === 0) return "1/3 · Regarde bien en face dans l'ovale";
    if (recordStepIdx === 1) return "2/3 · Tourne doucement la tête vers la gauche ↰";
    return "3/3 · Tourne doucement la tête vers la droite ↱";
  })();

  const remainingSec = Math.max(1, Math.ceil(((100 - recordProgress) / 100) * (VIDEO_SWEEP_DURATION_MS / 1000)));
  const ringCircumference = 2 * Math.PI * 38;
  const ringDashOffset = ringCircumference * (1 - recordProgress / 100);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[9999] flex flex-col bg-[#120E0C] text-[#F8F1E4] select-none animate-in fade-in duration-200"
    >
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
          {recording ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#9E2045]/90 border border-[#FF85A6]/40 text-white text-xs font-black tracking-wider shadow-lg">
              <span className="size-2 rounded-full bg-white animate-ping" />
              <span>REC · 00:0{remainingSec}</span>
            </div>
          ) : (
            <>
              <p className="font-heading font-black text-sm tracking-wide">
                {mode === "video"
                  ? "Scan Vidéo 360° Kènè (5s)"
                  : slots && slots.length > 1
                  ? `Angle ${currentSlotIndex + 1}/${slots.length} : ${currentSlot?.label || zoneLabel}`
                  : "Scanner de Peau Kènè"}
              </p>
              <p className="text-[11px] text-white/70">
                {mode === "video"
                  ? "Balayage multi-angles continu en 5 secondes"
                  : currentSlot?.hint || `Zone : ${zoneLabel}`}
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void flipCamera(e);
          }}
          disabled={recording || isSwitchingCamera}
          className="h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 active:scale-95 transition-all text-white"
          aria-label={facingMode === "user" ? "Basculer vers la caméra arrière" : "Basculer vers la caméra avant (selfie)"}
          title={facingMode === "user" ? "Passer à la caméra arrière" : "Passer à la caméra selfie"}
        >
          {isSwitchingCamera ? (
            <Loader2 size={18} className="animate-spin text-[#F5D37E]" />
          ) : (
            <SwitchCamera size={20} />
          )}
        </button>
      </header>

      {/* Zone de prévisualisation vidéo */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="p-5 text-center max-w-sm mx-auto flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center">
              {mode === "video" ? <Video size={30} /> : <Camera size={30} />}
            </div>

            <div>
              <p className="text-base font-bold text-white mb-1">Caméra en direct bloquée</p>
              <p className="text-xs text-white/70">{error}</p>
            </div>

            <div className="w-full text-left bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-2 text-xs">
              <p className="font-semibold text-white/90 flex items-center gap-1.5">
                <span>🔒</span> Tu peux utiliser directement ton appareil mobile :
              </p>
              <p className="text-white/75 text-[11px] leading-relaxed">
                Filme une courte vidéo de 5 secondes ou prends une photo avec la caméra native de ton téléphone.
              </p>
            </div>

            {/* Actions immédiates : vidéo native ou photo native sans blocage WebRTC */}
            <div className="w-full flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={processingNativeVideo}
                onClick={() => nativeVideoInputRef.current?.click()}
                className="w-full h-12 rounded-2xl k-btn-gold text-[#18120C] font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg"
              >
                {processingNativeVideo ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Extraction des angles vidéo…</span>
                  </>
                ) : (
                  <>
                    <Video size={16} />
                    <span>Filmer une vidéo 5s (Caméra téléphone)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={processingNativeVideo}
                onClick={() => nativeInputRef.current?.click()}
                className="w-full h-11 rounded-2xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md"
              >
                <Camera size={16} /> Prendre une photo simple
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
                  onClick={handleClose}
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
            <input
              ref={nativeVideoInputRef}
              type="file"
              accept="video/*"
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
              onClick={() => triggerGuideTemporarily(3500)}
              className={`w-full h-full object-cover cursor-pointer ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
            />

            {!ready && (
              <div className="absolute inset-0 grid place-items-center bg-[#120E0C]">
                <div className="flex flex-col items-center gap-2 text-primary">
                  <Loader2 size={36} className="animate-spin" />
                  <p className="text-xs font-semibold">Activation du capteur…</p>
                </div>
              </div>
            )}

            {/* Guide facial interactif réactif — Temporaire : disparaît quand les indications sont finies */}
            {ready && (
              <div
                className={cn(
                  "absolute inset-0 pointer-events-none flex flex-col items-center justify-center transition-all duration-700 ease-out",
                  recording || guideVisible
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-95 pointer-events-none",
                )}
              >
                <div
                  className={cn(
                    "relative w-[75vw] max-w-[290px] aspect-[3/4] rounded-[50%] border-2 transition-all duration-300 shadow-[0_0_0_9999px_rgba(18,14,12,0.68)] flex items-center justify-center",
                    recording
                      ? "border-[#F5D37E] border-solid shadow-[0_0_0_9999px_rgba(18,14,12,0.72),0_0_36px_rgba(245,211,126,0.65)]"
                      : lighting === "optimal"
                      ? "border-[#3F7D3F] border-solid shadow-[0_0_0_9999px_rgba(18,14,12,0.68),0_0_28px_rgba(63,125,63,0.5)]"
                      : lighting === "faible"
                      ? "border-[#C8951E]/90 border-dashed shadow-[0_0_0_9999px_rgba(18,14,12,0.68),0_0_20px_rgba(200,149,30,0.35)]"
                      : "border-[#C93B62] border-dashed shadow-[0_0_0_9999px_rgba(18,14,12,0.68),0_0_24px_rgba(201,59,98,0.4)]",
                  )}
                >
                  <div
                    className={cn(
                      "w-full h-full rounded-[50%] border transition-colors",
                      recording ? "border-[#F5D37E]/60" : lighting === "optimal" ? "border-[#3F7D3F]/40" : "border-[#C8951E]/30",
                    )}
                  />
                  {/* Croix de centrage discrète */}
                  <div className="absolute inset-x-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-0.5 bg-[#C8951E]/40" />
                  <div className="absolute inset-y-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 bg-[#C8951E]/40" />
                </div>

                {/* Badges temps réel (Instruction de balayage vidéo OU éclairage) */}
                <div className="mt-4 z-10 flex flex-col items-center gap-1.5 px-4 text-center">
                  {recording ? (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black bg-[#18120C]/90 text-[#FFF9EC] border border-[#F5D37E]/60 shadow-xl backdrop-blur-md">
                      <span className="size-2 rounded-full bg-[#F5D37E] animate-ping" />
                      <span>{videoStepPrompt}</span>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md shadow-lg transition-all",
                        lighting === "optimal"
                          ? "bg-[#3F7D3F]/90 text-white ring-1 ring-white/20"
                          : lighting === "faible"
                          ? "bg-[#C8951E]/90 text-[#120E0C] ring-1 ring-[#C8951E]/30"
                          : "bg-[#C93B62]/90 text-white ring-1 ring-white/20",
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
                  )}

                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-semibold bg-black/75 text-white/90 border border-white/15 backdrop-blur-md">
                    {mode === "video"
                      ? "🎬 5s de balayage fluide = 3 angles HD extraits automatiquement"
                      : "💄 Peau démaquillée & visage centré = Bilan biométrique précis"}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Barre inférieure : Sélecteur Photo / Vidéo 360° + Déclencheur */}
      <footer className="p-5 pb-[max(env(safe-area-inset-bottom,0px),2.8rem)] flex flex-col items-center gap-3.5 bg-gradient-to-t from-[#120E0C] via-[#120E0C]/92 to-transparent z-20">
        {/* Sélecteur de mode Photo / Vidéo 360° */}
        {!recording && !error && (
          <div className="inline-flex items-center p-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                setMode("photo");
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
                mode === "photo" ? "bg-[#FFF9EC] text-[#18120C] shadow-sm" : "text-white/75 hover:text-white",
              )}
            >
              <Camera size={13} />
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                setMode("video");
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
                mode === "video"
                  ? "bg-gradient-to-r from-[#E5A93C] to-[#C8951E] text-[#18120C] shadow-sm"
                  : "text-white/75 hover:text-white",
              )}
            >
              <Video size={13} />
              <span>Vidéo 360° (5s)</span>
            </button>
          </div>
        )}

        <p
          className={cn(
            "text-xs text-white/80 text-center font-medium transition-all duration-500",
            recording || guideVisible ? "opacity-100 max-h-10" : "opacity-0 pointer-events-none max-h-0 my-0 overflow-hidden",
          )}
        >
          {recording
            ? "Garde le visage dans l'ovale et suis le mouvement indiqué…"
            : mode === "video"
            ? "Touche pour filmer 5s (Face → Gauche → Droite)"
            : "Aligne ton visage dans l'ovale, détends tes traits et capture"}
        </p>

        <div className="flex items-center justify-center gap-4 w-full pb-2">
          {!recording && capturedCount > 0 && slots && slots.length > 1 && mode === "photo" && (
            <button
              type="button"
              onClick={handleClose}
              className="h-11 px-4 rounded-full bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs backdrop-blur-md active:scale-95 transition-all"
            >
              Terminer ({capturedCount}/{slots.length}) ✔
            </button>
          )}

          {/* Déclencheur tactile Photo OU Vidéo 360° avec anneau de progression SVG */}
          {mode === "video" ? (
            <button
              type="button"
              disabled={!ready || Boolean(error)}
              onClick={toggleVideoSweep}
              aria-label={recording ? "Arrêter le balayage vidéo" : "Démarrer le scan vidéo 360° de 5 secondes"}
              className="group relative h-22 w-22 grid place-items-center active:scale-95 transition-transform disabled:opacity-40 cursor-pointer"
            >
              <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
                <circle cx="44" cy="44" r="38" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="4.5" />
                {recording && (
                  <circle
                    cx="44"
                    cy="44"
                    r="38"
                    fill="none"
                    stroke="#F5D37E"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringDashOffset}
                    className="transition-[stroke-dashoffset] duration-100 ease-linear"
                  />
                )}
              </svg>
              <div
                className={cn(
                  "grid place-items-center transition-all duration-200 shadow-xl",
                  recording
                    ? "size-11 rounded-xl bg-[#D9385A] text-white shadow-[0_0_24px_rgba(217,56,90,0.7)]"
                    : "size-16 rounded-full bg-gradient-to-tr from-[#9E2045] via-[#D9385A] to-[#E5A93C] text-white shadow-[0_0_26px_rgba(217,56,90,0.65)] group-hover:scale-95",
                )}
              >
                {recording ? <Square size={18} fill="currentColor" /> : <Video size={24} />}
              </div>
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready || Boolean(error)}
              onClick={takeSnapshot}
              aria-label="Prendre la photo pour l'analyse"
              className="group relative h-20 w-20 rounded-full border-4 border-white/80 p-1 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shadow-xl cursor-pointer"
            >
              <div className="h-full w-full rounded-full bg-gradient-to-tr from-[#C8951E] to-[#E07A2B] shadow-[0_0_24px_rgba(200,149,30,0.7)] group-hover:scale-95 transition-transform" />
            </button>
          )}
        </div>
      </footer>
    </div>,
    document.body,
  );
}
