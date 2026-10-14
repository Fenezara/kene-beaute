"use client";
// Kènè — Primitives Motion Design & Micro-Interactions Awwwards
// Conçues selon les standards internationaux de créativité web (Awwwards, FWA, Webby).
// 60-120 fps, respect de prefers-reduced-motion, zéro saccade.

import { useRef, useState, useEffect, type ReactNode } from "react";
import { motion, useReducedMotion, useSpring, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────
 1) CountUp — Compteur de chiffres à accélération fluide (Easing)
 Idéal pour scores, pourcentages, phototypes et montants FCFA.
 ──────────────────────────────────────────────────────────────── */
export function CountUp({
  value,
  duration = 1.4,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    let start = 0;
    const end = value;
    if (start === end) {
      setDisplay(end);
      return;
    }
    const startTime = performance.now();
    const durationMs = duration * 1000;

    let rafId: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Easing quintique out : accélération initiale puis freinage soyeux
      const ease = 1 - Math.pow(1 - progress, 5);
      const current = Math.round(start + (end - start) * ease);
      setDisplay(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration, reduce]);

  return (
    <span className={cn("tabular-nums font-mono", className)}>
      {prefix}
      {display.toLocaleString("fr-FR")}
      {suffix}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────
 2) Magnetic — Effet magnétique au survol (Desktop)
 Le bouton suit subtilement la course de la souris avec rappel ressort.
 ──────────────────────────────────────────────────────────────── */
export function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const springConfig = { damping: 18, stiffness: 220, mass: 0.1 };
  const x = useSpring(0, springConfig);
  const y = useSpring(0, springConfig);

  useEffect(() => {
    x.set(position.x);
    y.set(position.y);
  }, [position, x, y]);

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const { clientX, clientY } = e;
    const { height, width, left, top } = ref.current.getBoundingClientRect();
    const middleX = clientX - (left + width / 2);
    const middleY = clientY - (top + height / 2);
    setPosition({ x: middleX * strength, y: middleY * strength });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x, y }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────
 3) TiltCard — Carte 3D à perspective tactile et lueur spéculaire
 Réagit à l'angle du curseur pour créer une sensation de profondeur physique.
 ──────────────────────────────────────────────────────────────── */
export function TiltCard({
  children,
  className,
  maxTilt = 7,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || reduce) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotX = ((y - centerY) / centerY) * -maxTilt;
    const rotY = ((x - centerX) / centerX) * maxTilt;

    setRotateX(rotX);
    setRotateY(rotY);

    if (glare) {
      setGlarePos({
        x: (x / rect.width) * 100,
        y: (y / rect.height) * 100,
        opacity: 0.18,
      });
    }
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setGlarePos((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ rotateX, rotateY }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      style={{ transformStyle: "preserve-3d" }}
      className={cn("relative overflow-hidden transition-shadow duration-300", className)}
    >
      {children}
      {glare && !reduce && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: glarePos.opacity,
            background: `radial-gradient(circle 280px at ${glarePos.x}% ${glarePos.y}%, rgba(200, 149, 30, 0.4), transparent 80%)`,
          }}
        />
      )}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────
 4) TextShimmer — Balayage de lumière dorée sur typographie de luxe
 ──────────────────────────────────────────────────────────────── */
export function TextShimmer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block bg-gradient-to-r from-foreground via-gold-text to-foreground bg-[length:200%_auto] bg-clip-text text-transparent animate-kene-shimmer",
        className,
      )}
    >
      {children}
    </span>
  );
}
