"use client";
// Kènè — ÉCLAT 2026: primitives visuelles partagées (shell + écrans).
// Une seule source de vérité pour l'atmosphère (aurora + grain), les
// surfaces verre translucides, les entrées animées (Reveal), les badges
// d'icônes, les puces animées et l'anneau de score signature.
// Discipline perf: AUCUN backdrop-filter ici (réservé au chrome UI via
//.k-chrome) — les cartes jouent la translucidité + ombres teintées.
// Discipline AA: textes en tokens (jamais de dégradé sous petit texte).

import { type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { scoreColor } from "@/lib/kene/format";

/* ────────────────────────────────────────────────────────────────
 1) Atmosphère — couche fixe derrière TOUT le contenu d'un espace.
 Usage: <AuroraBackdrop /> une seule fois par shell (pointer-events
 none, -z-10). Light: lueurs chaudes sur crème; dark: braises.
 ──────────────────────────────────────────────────────────────── */
export function AuroraBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none fixed inset-0 -z-10 aurora-kene", className)}>
      <div className="absolute inset-0 grain-kene" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 2) Reveal — entrée douce en cascade (children directs animés).
 Respecte prefers-reduced-motion (fade seul, sans translation).
 ──────────────────────────────────────────────────────────────── */
export function Reveal({
  children,
  className,
  delay = 0,
  stagger = 0.06,
  y = 14,
  as: _as,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  y?: number;
  as?: never;
}) {
  const reduce = useReducedMotion();
  const variants: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : y },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } },
  };
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={variants}
      transition={{ staggerChildren: stagger, delayChildren: delay }}
    >
      {children}
    </motion.div>
  );
}

/* Wrapper item: à utiliser DANS un Reveal pour hériter de la cascade.
 (Reveal anime ses motion children via variants propagation.) */
export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: reduce ? 0 : 14 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 26 } } }}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────
 3) GlassCard — surface verre translucide prête à l'emploi.
 hero = lueur interne or/bissap; hover = élévation desktop.
 ──────────────────────────────────────────────────────────────── */
export function GlassCard({
  children,
  className,
  hero = false,
  hover = false,
  grain = false,
  delay,
}: {
  children: ReactNode;
  className?: string;
  hero?: boolean;
  hover?: boolean;
  grain?: boolean;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce || delay === undefined ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 240, damping: 26 }}
      className={cn("relative rounded-[24px] k-card", hero && "k-card-hero", hover && "k-card-hover", grain && "grain-kene", className)}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────
 4) IconBadge — icône dans un « squircle » teinté (12-16 % d'or),
 filet intérieur lumineux. Remplace les cercles muted plats.
 ──────────────────────────────────────────────────────────────── */
export function IconBadge({
  icon,
  className,
  size = "md",
  tone = "gold",
}: {
  icon: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "gold" | "terre" | "bissap" | "success";
}) {
  const tones: Record<string, string> = {
    gold: "from-[#C8951E]/18 to-[#C8951E]/6 text-gold-text ring-[#C8951E]/25",
    terre: "from-[#A0522D]/18 to-[#A0522D]/6 text-terre ring-[#A0522D]/25",
    bissap: "from-[#8B1A3B]/16 to-[#8B1A3B]/6 text-bissap ring-[#8B1A3B]/25",
    success: "from-[#346834]/16 to-[#346834]/6 text-success ring-[#346834]/25",
  };
  const sizes: Record<string, string> = {
    sm: "h-9 w-9 rounded-[12px]",
    md: "h-11 w-11 rounded-[14px]",
    lg: "h-14 w-14 rounded-[18px]",
  };
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center bg-gradient-to-br ring-1 ring-inset", tones[tone], sizes[size], className)}>
      {icon}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────
 5) Eyebrow — micro-titre éditorial au-dessus des sections.
 ──────────────────────────────────────────────────────────────── */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-bold uppercase tracking-[0.15em] text-gold-text", className)}>{children}</p>
  );
}

/* ────────────────────────────────────────────────────────────────
 6) Chip — puce filtre animée (verre → or sélectionné).
 ──────────────────────────────────────────────────────────────── */
export function Chip({
  children,
  selected = false,
  onClick,
  className,
  ariaPressed,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  ariaPressed?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 500, damping: 24 }}
      aria-pressed={ariaPressed ?? (onClick ? selected : undefined)}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        selected ? "k-btn-gold text-primary-foreground" : "k-chip text-foreground/80",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/* ────────────────────────────────────────────────────────────────
 7) PrimaryCTA — bouton signature terre→bissap + halo teinté.
 ──────────────────────────────────────────────────────────────── */
export function PrimaryCTA({
  children,
  onClick,
  className,
  disabled,
  type = "button",
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  ariaLabel?: string;
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.965 }}
      aria-label={ariaLabel}
      className={cn(
        "k-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-bold text-[#FFF9EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/* ────────────────────────────────────────────────────────────────
 8) ScoreRing — anneau de score signature 2026: dégradé sur le
 trait (SVG linearGradient), halo doré, chiffre en mono tabulaire,
 tick de départ doré. stroke color = scoreColor (AA thème).
 ──────────────────────────────────────────────────────────────── */
export function ScoreRing({
  score,
  size = 148,
  stroke = 12,
  label = "Score",
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke * 2) / 2;
  const C = 2 * Math.PI * r;
  const color = scoreColor(score);
  const gid = `ring-${Math.round(score)}-${size}`;
  const scoreFontSize = Math.max(16, Math.round(size * 0.26));
  const labelFontSize = Math.max(8, Math.round(size * 0.075));
  const labelMaxWidth = Math.round(size * 0.76);
  return (
    <div
      className={cn("relative shrink-0 k-ring-glow", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} ${score} sur 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--gold)" />
            <stop offset="55%" stopColor={color} />
            <stop offset="100%" stopColor="var(--bissap)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--foreground) 10%, transparent)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - score / 100) }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          style={{ stroke: `url(#${gid})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center p-1">
        <div className="text-center leading-none flex flex-col items-center justify-center">
          <div
            className="font-mono font-bold tabular-nums"
            style={{ fontSize: `${scoreFontSize}px`, color, lineHeight: 1 }}
          >
            {score}
          </div>
          <div
            className="mt-1 font-bold uppercase tracking-wider text-muted-foreground truncate"
            style={{ fontSize: `${labelFontSize}px`, maxWidth: `${labelMaxWidth}px` }}
            title={label}
          >
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 9) Shimmer — squelettes de chargement vivants (k-shimmer CSS).
 ──────────────────────────────────────────────────────────────── */
export function Shimmer({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("k-shimmer block rounded-xl bg-muted", className)} />;
}

/* Barre de progression fine animée (progression linear-gradient or→terre) */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-[#C8951E] to-[#A0522D]"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      />
    </div>
  );
}
