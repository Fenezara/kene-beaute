"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, CheckCircle2, PenLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TouchSignaturePadProps {
  clientName?: string;
  onSigned: (signatureDataUrl: string | null) => void;
}

export function TouchSignaturePad({ clientName, onSigned }: TouchSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Ajuster la résolution selon le DPR pour un tracé net
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#C8951E"; // Teinte Or Kènè
  }, []);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (signedAt) return; // Déjà validé
    const pos = getPos(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || signedAt) return;
    const pos = getPos(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setSignedAt(null);
    onSigned(null);
  };

  const confirmSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    const dataUrl = canvas.toDataURL("image/png");
    const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    setSignedAt(now);
    onSigned(dataUrl);
  };

  return (
    <div className="space-y-2 rounded-2xl border border-gold/30 bg-gold/5 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PenLine className="size-4 text-gold-text" />
          <span className="text-xs font-bold text-foreground">
            Émargement digital en cabine
          </span>
        </div>
        {signedAt ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/15 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="size-3" />
            Signé à {signedAt}
          </span>
        ) : (
          <span className="text-[10.5px] text-muted-foreground">
            Doigt ou stylet sur l&apos;écran
          </span>
        )}
      </div>

      <div className="relative rounded-xl border border-dashed border-gold/40 bg-background/80 overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={cn(
            "w-full h-24 touch-none cursor-crosshair block",
            signedAt && "pointer-events-none opacity-90"
          )}
          aria-label="Zone d'émargement de la cliente"
        />

        {!hasSignature && !signedAt && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/60">
            Signer ici pour valider l&apos;entretien ({clientName || "Cliente"})
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={clearCanvas}
          disabled={!hasSignature}
          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
        >
          <Eraser className="size-3" />
          Effacer
        </Button>

        {!signedAt ? (
          <Button
            type="button"
            size="sm"
            onClick={confirmSignature}
            disabled={!hasSignature}
            className="h-7 text-xs k-btn-gold text-primary-foreground font-semibold gap-1 px-3"
          >
            <ShieldCheck className="size-3.5" />
            Confirmer l&apos;émargement
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground font-mono">
            Validé juridiquement par l&apos;institut
          </span>
        )}
      </div>
    </div>
  );
}
