"use client";
// Kènè — Kente identitaire (t. 82, vague 1) : le pagne UNIQUE de chaque
// cliente, rendu en canvas 2D procédural. La graine (dérivée de l'userId
// côté API) fixe le motif — bandeaux, symétries, accents ; le nombre de
// Fils d'Or (actions réelles) fixe combien de rayures DORÉES brillent dans
// la trame. Zéro asset, DPI net, ~1 ms de rendu.
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** PRNG mulberry32 — même graine = même pagne, pour toujours. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ["#C8951E", "#A0522D", "#8B1A3B", "#3F7D3F", "#E07A2B", "#241A10", "#F8F1E4"];
const GOLD = "#C8951E";
const GOLD_BRIGHT = "#E3B04B";

export function KenteIdentity({
  seed,
  threads,
  compact = false,
  className,
  height,
}: {
  /** Graine déterministe (dérivée de l'userId par l'API). */
  seed: number;
  /** Nombre de Fils d'Or — autant de rayures dorées allumées. */
  threads: number;
  /** Variante slim (carte accueil) vs complète (profil). */
  compact?: boolean;
  className?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = Math.max(parent?.clientWidth ?? 300, 120);
    const h = height ?? (compact ? 44 : 118);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const rnd = mulberry32(seed + 7);
    const rows = compact ? 3 : 7;
    const rowH = h / rows;
    const goldRows = Math.min(threads, rows * 2); // cap visuel — au-delà, tout brille
    let goldPlaced = 0;

    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      // bandeau de fond : 2–4 segments par rangée
      const segs = 2 + Math.floor(rnd() * 3);
      let x = 0;
      while (x < w) {
        const segW = (w / segs) * (0.6 + rnd() * 0.9);
        const isGold = goldPlaced < goldRows && rnd() < 0.45;
        if (isGold) goldPlaced++;
        const base = isGold ? GOLD : PALETTE[Math.floor(rnd() * PALETTE.length)];
        ctx.fillStyle = base;
        ctx.fillRect(x, y, Math.min(segW, w - x) - 1.5, rowH - 1.5);
        // trame tissée : tirets clairs/sombres en quinconce
        ctx.fillStyle = isGold ? GOLD_BRIGHT : "rgba(248,241,228,0.16)";
        const step = 9;
        const phase = (r % 2) * (step / 2);
        for (let dx = phase; dx < Math.min(segW, w - x); dx += step) {
          ctx.fillRect(x + dx, y + rowH * 0.22, 3.5, rowH * 0.2);
          ctx.fillRect(x + dx + step / 2, y + rowH * 0.62, 3.5, rowH * 0.2);
        }
        if (isGold) {
          ctx.fillStyle = "rgba(227,176,75,0.28)";
          ctx.fillRect(x, y, Math.min(segW, w - x) - 1.5, rowH - 1.5);
        }
        x += segW;
      }
      // liseré sombre entre rangées (croisure de trame)
      if (!compact || r === rows - 1) {
        ctx.fillStyle = "rgba(20,14,8,0.35)";
        ctx.fillRect(0, y + rowH - 1.5, w, 1.5);
      }
    }

    // bord : filet or hairline (cadre du pagne)
    ctx.strokeStyle = "rgba(200,149,30,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }, [seed, threads, compact, height]);

  return (
    <span className={cn("block w-full overflow-hidden rounded-[10px]", className)}>
      <canvas ref={canvasRef} role="img" aria-label={`Kente identitaire — ${threads} fils d'or tissés`} />
    </span>
  );
}
