"use client";
// Kènè — Le Seuil : stories « Découvrir en 30 s ».
//
// Remplace l'ancienne intro NARRATIVE FORCÉE (Fil de Kente, scroll long) par
// un pattern que la génération TikTok/Instagram connaît par cœur : 3 cartes
// plein cadre, barres de progression, tap droite/gauche, croix pour sortir.
// L'intro devient OPT-IN (pilule sur la page d'accueil) — la découverte ne
// ralentit plus l'entrée, elle l'accompagne.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

interface StoryCard {
  img: string;
  imgAlt: string;
  num: string;
  title: string;
  sub: string;
}

const STORIES: StoryCard[] = [
  {
    img: "/skin/demo-visage-1.webp",
    imgAlt: "Analyse de peau par l'intelligence artificielle",
    num: "01",
    title: "Ton visage, écouté",
    sub: "Diagnostic IA vision, zone par zone — pensé pour les teints Fitzpatrick IV–VI.",
  },
  {
    img: "/products/serum-moringa.webp",
    imgAlt: "Sérum botanique Kènè",
    num: "02",
    title: "Dr. Kènè, ta coach",
    sub: "Elle répond à tes questions beauté, 7j/7 — et tu peux lui parler à la voix.",
  },
  {
    img: "/instituts/institut-baobab.webp",
    imgAlt: "Institut partenaire Kènè",
    num: "03",
    title: "Boutique & instituts",
    sub: "Routines botaniques, rendez-vous en deux gestes — Abidjan & Dakar.",
  },
];

const DURATION_MS = 4600;

export function ThresholdStories({ onClose }: { onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const reduce = useReducedMotion();
  const timer = useRef<number | null>(null);
  const card = STORIES[idx];
  const last = idx === STORIES.length - 1;

  const next = useCallback(() => {
    setIdx((i) => (i < STORIES.length - 1 ? i + 1 : i));
  }, []);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  // Auto-avance (désactivé en reduced-motion — lecture à son rythme)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (reduce || last) return;
    timer.current = window.setTimeout(next, DURATION_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [idx, reduce, last, next]);

  // Échap = fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Découvrir Kènè en 30 secondes"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[70] flex flex-col bg-[#140E08]"
    >
      {/* Image de fond (plein cadre, voile profond) */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={idx}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <img src={card.img} alt={card.imgAlt} className="h-full w-full object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#140E08] via-[#140E08]/55 to-[#140E08]/25" />
        </motion.div>
      </AnimatePresence>

      {/* Barres de progression */}
      <div className="relative z-10 flex gap-1.5 px-4 pt-4" role="progressbar" aria-label={`Étape ${idx + 1} sur ${STORIES.length}`}>
        {STORIES.map((_, i) => (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#FFF9EC]/25">
            <motion.div
              className="h-full rounded-full bg-[#F3D98A]"
              initial={false}
              animate={{ scaleX: i < idx ? 1 : i === idx ? 1 : 0 }}
              style={{ transformOrigin: "left" }}
              transition={i === idx ? { duration: reduce ? 0 : DURATION_MS / 1000, ease: "linear" } : { duration: 0.2 }}
              // barre courante : remplie progressivement ; les suivantes vides.
              onUpdate={() => undefined}
            />
          </div>
        ))}
      </div>
      <div className="relative z-10 flex items-center justify-between px-4 pt-2">
        <span className="font-heading text-[13px] font-bold tracking-[0.14em] text-[#FFF9EC]/85">KÈNÈ · 30 SECONDES</span>
        <button
          onClick={onClose}
          aria-label="Fermer la découverte"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-[#FFF9EC] ring-1 ring-[#FFF9EC]/20 hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-[#F3D98A]"
        >
          <X size={20} />
        </button>
      </div>

      {/* Contenu + zones tap gauche/droite */}
      <div className="relative z-10 flex flex-1 flex-col justify-end overflow-hidden px-6 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[560px]"
          >
            <p className="font-mono text-[13px] font-bold tracking-[0.3em] text-[#F3D98A]">{card.num}</p>
            <h2 className="mt-2 font-heading text-[34px] font-black leading-[1.02] text-[#FFF9EC] sm:text-[42px]">
              {card.title}
            </h2>
            <p className="mt-3 max-w-[38ch] text-[14px] leading-relaxed text-[#FFF9EC]/80">{card.sub}</p>
            {last && (
              <motion.button
                onClick={onClose}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 inline-flex h-12 items-center gap-2 rounded-full k-btn-gold px-7 font-heading text-[15px] font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-[#F3D98A]"
              >
                Choisir ma porte
                <ArrowRight size={17} />
              </motion.button>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Zones tactiles : gauche = précédent, droite = suivant */}
        <div className="absolute inset-0 flex" aria-hidden="true">
          <button className="h-full w-[34%]" onClick={prev} tabIndex={-1} aria-hidden="true" />
          <button className="h-full flex-1" onClick={next} tabIndex={-1} aria-hidden="true" />
        </div>
      </div>
    </motion.div>
  );
}
