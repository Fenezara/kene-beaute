"use client";
// Kènè — La Route de l'Or : bande de kente tissée procéduralement (canvas 2D)
// Chaque station du rituel ajoute une rangée ; la navette tisse sous les yeux
// de la cliente pendant l'animation d'entrée (2 s, easeOut, reduced-motion respecté).
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { CREME, GOLD, MELANINE, shade } from "./ritual";

export interface BandRow {
  color: string;
  label: string;
}

/* ─────────── petits utilitaires dessin ─────────── */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** PRNG déterministe — étincelles stables entre les redraws */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** famille de police heading résolue (next/font → nom réel) */
async function resolveHeadingFont(): Promise<string> {
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 350))]);
    const el = document.querySelector("h1, h2, .font-heading") ?? document.body;
    const fam = getComputedStyle(el).fontFamily;
    return fam && !fam.includes("var(") ? fam : "ui-serif, Georgia, serif";
  } catch {
    return "ui-serif, Georgia, serif";
  }
}

/* ─────────── tissage procédural (pur, exported pour tests) ─────────── */

const LAYOUT = { sel: 7, sigH: 34, padX: 16, cellW: 22 };

export function drawBand(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  rows: BandRow[],
  p: number,
  name: string,
  score: number,
  date: string,
  headingFont = "ui-serif, Georgia, serif"
) {
  const { sel, sigH, padX, cellW } = LAYOUT;
  // fond mélanine
  ctx.fillStyle = MELANINE;
  ctx.fillRect(0, 0, W, H);

  // étincelles or (seedées → stables)
  const rnd = mulberry32(97 + rows.length * 13 + Math.round(score));
  ctx.fillStyle = "rgba(200,149,30,.5)";
  for (let i = 0; i < 16; i++) {
    const x = 6 + rnd() * (W - 12);
    const y = 6 + rnd() * (H - 12);
    if (y > H - sel - sigH - 6 && y < H - 6) continue; // pas dans la signature
    const r = 0.6 + rnd() * 1.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const n = Math.max(1, rows.length);
  const bandTop = sel + 5;
  const bandBot = H - sel - sigH - 5;
  const bandX = padX;
  const bandW = W - padX * 2;
  const rowH = (bandBot - bandTop) / n;

  // rangées tissées — la progression révèle chaque rangée l'une après l'autre
  for (let i = 0; i < rows.length; i++) {
    const t0 = i / n;
    if (p <= t0) break;
    const local = Math.min(1, (p - t0) / (1 / n));
    const y = bandTop + i * rowH;
    const h = rowH - 3;
    drawWeaveRow(ctx, bandX, y, bandW, h, rows[i].color, local, i, cellW);
    if (local < 1) drawShuttle(ctx, bandX, y, bandW, h, local);
  }

  // liserés or (zigzag)
  drawSelvedge(ctx, W, 0, sel);
  drawSelvedge(ctx, W, H - sel, sel);

  // franges
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4;
  for (const side of [0, 1]) {
    const x = side ? W - 9 : 9;
    for (let i = 0; i < 5; i++) {
      const fy = bandTop + 4 + (i * (bandBot - bandTop - 8)) / 4;
      ctx.beginPath();
      ctx.moveTo(x, fy);
      ctx.quadraticCurveTo(x + (side ? 7 : -7), fy + 5, x + (side ? 3 : -3), fy + 13);
      ctx.stroke();
    }
  }

  // bandeau signature
  const sy = H - sel - sigH;
  ctx.fillStyle = shade(MELANINE, 0.09);
  ctx.fillRect(10, sy, W - 20, sigH);
  ctx.strokeStyle = "rgba(200,149,30,.55)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(15.5, sy + 4.5, W - 31, sigH - 9);
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = CREME;
  ctx.font = `700 13px ${headingFont}`;
  ctx.fillText(name.toUpperCase(), W / 2, sy + 13);
  ctx.fillStyle = GOLD;
  ctx.font = "600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`SCORE ${score} / 100 · KÈNÈ · ${date}`, W / 2, sy + 25);
  // diamants adinkra latéraux
  for (const side of [0, 1]) {
    const dx = side ? W - 30 : 30;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(dx, sy + 8);
    ctx.lineTo(dx + 4, sy + 17);
    ctx.lineTo(dx, sy + 26);
    ctx.lineTo(dx - 4, sy + 17);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWeaveRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  local: number,
  idx: number,
  cellW: number
) {
  // le tissage avance de gauche à droite — clip à la frontière
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, Math.max(0.1, w * local), h);
  ctx.clip();
  // fond de rangée (trame sombre)
  ctx.fillStyle = shade(color, -0.38);
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  // brique arrondies (armure toile)
  const cells = Math.ceil(w / cellW);
  for (let c = 0; c <= cells; c++) {
    const cx = x + c * cellW - (idx % 2 ? cellW / 2 : 0);
    const wave = Math.sin((c + idx * 2) * 0.9) * 1.2;
    const cw = cellW - 4;
    ctx.fillStyle = c % 4 === 3 ? GOLD : color; // accent or régulier
    roundRect(ctx, cx + 2, y + 1 + wave, cw, h - 2, 3);
    ctx.fill();
    // reflet de dessus
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    roundRect(ctx, cx + 2, y + 1 + wave, cw, (h - 2) * 0.42, 3);
    ctx.fill();
    // fils de trame horizontaux (effet over-under)
    ctx.strokeStyle = "rgba(0,0,0,0.32)";
    ctx.lineWidth = 1;
    for (let f = 1; f < 3; f++) {
      const fy = y + 1 + wave + ((h - 2) * f) / 3;
      ctx.beginPath();
      ctx.moveTo(cx + 2, fy);
      ctx.lineTo(cx + 2 + cw, fy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawShuttle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, local: number) {
  const sx = x + w * local;
  const cy = y + h / 2;
  // fil de traîne
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(sx - 15, cy);
  ctx.quadraticCurveTo(sx - 8, cy - 5, sx, cy);
  ctx.stroke();
  // navette — losange crème liseré or
  ctx.fillStyle = "#FFF9EC";
  ctx.beginPath();
  ctx.moveTo(sx, cy - 6);
  ctx.lineTo(sx + 5, cy);
  ctx.lineTo(sx, cy + 6);
  ctx.lineTo(sx - 5, cy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawSelvedge(ctx: CanvasRenderingContext2D, W: number, y: number, h: number) {
  ctx.fillStyle = shade(GOLD, -0.12);
  ctx.fillRect(0, y, W, h);
  // chevrons sombres réguliers
  ctx.strokeStyle = MELANINE;
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, y + h + 1);
    ctx.lineTo(x + 4, y - 1);
    ctx.stroke();
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + 0.5);
  ctx.lineTo(W, y + 0.5);
  ctx.stroke();
}

/* ─────────── composant ─────────── */

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function WovenBand({
  rows,
  name,
  score,
  date,
  fileName = "kene-rituel.png",
  height = 210,
}: {
  rows: BandRow[];
  name: string;
  score: number;
  date: string;
  fileName?: string;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let raf = 0;
    let font = "ui-serif, Georgia, serif";
    let disposed = false;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (progress: number) => {
      const W = wrap.clientWidth;
      if (W < 40) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBand(ctx, W, height, rows, progress, name, score, date, font);
    };

    const start = async () => {
      font = await resolveHeadingFont();
      if (disposed) return;
      const dur = reduced ? 0 : 2100;
      const t0 = performance.now();
      const frame = (now: number) => {
        const t = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
        draw(easeOut(t));
        if (t >= 1) {
          setReady(true);
          return;
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    start();

    const ro = new ResizeObserver(() => draw(1)); // resize → rendu final net
    ro.observe(wrap);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [rows, name, score, date, height]);

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      toast.success("Tissage enregistré — à partager fièrement 💛");
    } catch {
      toast.error("Enregistrement impossible sur ce navigateur");
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Tissage kente du rituel de ${name} : ${rows.length} stations ${rows.map((r) => r.label).join(", ")} — score ${score} sur 100`}
        className="w-full rounded-2xl shadow-lg"
      />
      <button
        onClick={save}
        disabled={!ready}
        aria-label="Enregistrer mon tissage en image"
        className="absolute bottom-2.5 right-2.5 h-10 w-10 grid place-items-center rounded-full bg-[#1A1410]/75 text-[#C8951E] backdrop-blur border border-[#C8951E]/40 active:scale-90 transition-transform focus-visible:outline-2 focus-visible:outline-[#C8951E] disabled:opacity-40"
      >
        <Download size={17} />
      </button>
    </div>
  );
}
