"use client";
// Kènè — Page Case Study & Laboratoire Créatif Awwwards
// Conçue pour le jury international Awwwards (SOTD, Mobile Excellence, Developer Award).
// Bilingue (FR / EN), immersive, mettant en valeur la 3D WebGL, le Design System et l'Architecture.

import { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Cpu,
  Globe2,
  Layers,
  Maximize2,
  Mic,
  Palette,
  Play,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  Smartphone,
  Volume2,
  Zap,
} from "lucide-react";
import { AuroraBackdrop, Eyebrow, GlassCard } from "@/components/kene/ui2026";
import {
  CauriIcon,
  DuafeIcon,
  KeneEmblem,
  KeneEmblemLockup,
  NeaOnnimIcon,
  SankofaIcon,
  BaouleIcon,
  NkonsonkonsonIcon,
} from "@/components/kene/icons";
import { CountUp, Magnetic, TiltCard, TextShimmer } from "@/components/kene/motion-awwwards";
import type { OrbState } from "@/components/kene/pro/MamanOrb3D";

// Chargement différé du composant 3D pour zéro impact sur le LCP
const MamanOrb3D = dynamic(
  () => import("@/components/kene/pro/MamanOrb3D").then((m) => ({ default: m.MamanOrb3D })),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-64 w-full place-items-center rounded-3xl bg-black/40">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
          <span className="text-xs text-muted-foreground font-mono">Chargement du Cauri WebGL…</span>
        </div>
      </div>
    ),
  }
);

export default function CaseStudyPage() {
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [orbState, setOrbState] = useState<OrbState>("speaking");
  const [activeAdinkra, setActiveAdinkra] = useState<number>(0);

  const t = {
    fr: {
      badge: "Candidature Officielle Awwwards 2026",
      backToApp: "Accéder à l'Application Live",
      title1: "Kènè",
      title2: "L'intelligence dermo-cosmétique mélanoderme.",
      subtitle:
        "Une étude de cas sur l'alliance inédite entre la science biométrique des peaux foncées, la symbolique royale Akan et une ingénierie web offline-first ultra-rapide.",
      stats: [
        { val: 100, suffix: "%", label: "Procédural WebGL", sub: "Zéro asset 3D lourd" },
        { val: 60, suffix: " fps", label: "Motion Framer", sub: "Ressorts physiques & haptique" },
        { val: 0, suffix: " CLS", label: "Stabilité Visuelle", sub: "Score Lighthouse d'élite" },
        { val: 12000, prefix: "+", label: "Lignes de code Pro", sub: "Console Institut & PWA" },
      ],
      missionTitle: "La Mission",
      missionHeading: "Résoudre le biais historique des algorithmes dermatologiques.",
      missionP1:
        "Historiquement, plus de 85 % des banques d'images médicales et des dermatoscopes IA ont été entraînés sur des peaux claires (Fitzpatrick I à III). Résultat : les diagnostics d'hyperpigmentation post-inflammatoire (PIH), d'alopécie de traction ou de dérèglement sébacé sont régulièrement faussés sur les teints riches en mélanine.",
      missionP2:
        "Kènè a été calibrée spécifiquement pour les phototypes IV à VI, en fusionnant un modèle VLM avec la pharmacopée traditionnelle d'Afrique de l'Ouest (Moringa, Kinkeliba, Beurre de Karité de Korhogo, fleurs de Bissap).",
      labTitle: "Laboratoire 3D Interactif",
      labHeading: "L'Orbe Sacré Cauri en WebGL Procédural",
      labDesc:
        "Inspiré des parures royales Ashanti et du cauri sacré (symbole de prospérité et de verbe fécond), cet orbe 3D réagit en temps réel à l'audio, au tactile et aux états cognitifs de la Secrétaire IA.",
      designTitle: "Système de Design Culturel",
      designHeading: "L'Art ancestral Adinkra sublimé par le Web 2026",
      designDesc:
        "Chaque fonctionnalité fondamentale de Kènè est incarnée par un idéogramme philosophique Akan, forgé dans une palette d'Or impérial, d'Ébène et de Terre cuite.",
      techTitle: "Architecture & Performance",
      techHeading: "Une ingénierie Zero-Failure pensée pour le terrain",
      techP1:
        "En Afrique subsaharienne, l'instabilité des réseaux mobiles 4G exige une discipline absolue. Kènè fonctionne en mode Offline-First grâce à un Service Worker résilient, une synchronisation de caisse POS locale et une file d'attente intelligente des photos de diagnostic.",
      techFeatures: [
        "Next.js 16 App Router avec Turbopack & React Server Components",
        "PWA installable avec support complet hors-ligne (Caisse & Agenda)",
        "Passkey biométrique WebAuthn / FIDO2 sans mot de passe",
        "Ponts Mobile Money natifs (Wave, Orange Money, MTN, SasPay)",
        "Comptabilité normalisée SYSCOHADA & Paie certifiée CNPS/IPRES",
      ],
      ctaTitle: "Prêt à explorer l'expérience Kènè ?",
      ctaButton: "Ouvrir l'application en direct",
    },
    en: {
      badge: "Official Awwwards Submission 2026",
      backToApp: "Launch Live Experience",
      title1: "Kènè",
      title2: "The Melanodermic Skin Intelligence.",
      subtitle:
        "A case study on the union of deep biometric science for rich melanin skin, Akan royal philosophy, and blazing offline-first web performance.",
      stats: [
        { val: 100, suffix: "%", label: "Procedural WebGL", sub: "Zero heavy 3D assets" },
        { val: 60, suffix: " fps", label: "Spring Physics", sub: "Motion design & haptics" },
        { val: 0, suffix: " CLS", label: "Cumulative Shift", sub: "Elite Lighthouse grade" },
        { val: 12000, prefix: "+", label: "Lines of Pro Code", sub: "Salon POS & PWA core" },
      ],
      missionTitle: "The Core Mission",
      missionHeading: "Bridging the historic gap in dermatological AI.",
      missionP1:
        "Historically, over 85% of clinical imagery datasets were trained on fair skin types (Fitzpatrick I–III). This led to frequent misclassifications in post-inflammatory hyperpigmentation (PIH), traction alopecia, and sebum balance on deeply pigmented complexions.",
      missionP2:
        "Kènè is specifically calibrated for Fitzpatrick IV–VI skin tones, merging a custom multimodal VLM with centuries of West African botanical pharmacology (Moringa, Kinkeliba, Korhogo Shea Butter, Hibiscus/Bissap).",
      labTitle: "Interactive 3D Lab",
      labHeading: "The Sacred Cowrie Orb in Procedural WebGL",
      labDesc:
        "Inspired by Ashanti gold regalia and the sacred cowrie shell (ancient currency and emblem of fertile speech), this 3D sphere reacts in real time to audio frequencies, tactile gestures, and AI cognitive states.",
      designTitle: "Cultural Design System",
      designHeading: "Ancestral Adinkra Symbols Reimagined for 2026",
      designDesc:
        "Every core capability in Kènè is anchored in an Akan philosophical ideogram, sculpted with imperial gold, obsidian ebony, and warm terracotta hues.",
      techTitle: "Architecture & Performance",
      techHeading: "Zero-Failure Engineering built for real-world networks",
      techP1:
        "In emerging digital markets, network fluctuations demand unforgiving engineering discipline. Kènè delivers an Offline-First PWA architecture with automated background queues, local SQLite/IndexedDB point-of-sale resilience, and instant reconnection.",
      techFeatures: [
        "Next.js 16 App Router powered by Turbopack & RSC",
        "Installable PWA with full offline salon cash register & CRM",
        "FIDO2 / WebAuthn Biometric Passkey authentication",
        "Native Mobile Money infrastructure (Wave, Orange, MTN, SasPay)",
        "SYSCOHADA African GAAP accounting & CNPS/IPRES payroll engines",
      ],
      ctaTitle: "Experience Kènè in action",
      ctaButton: "Open Live Platform",
    },
  }[lang];

  const ADINKRA_SYMBOLS = [
    {
      icon: NeaOnnimIcon,
      name: "Nea Onnim",
      meaning: lang === "fr" ? "« Celui qui apprend » · IA & Savoir biométrique" : "“He who learns” · AI & Biometric Knowledge",
      desc:
        lang === "fr"
          ? "Symbole de la quête continue du savoir. Incarne le moteur de diagnostic cutané."
          : "Symbol of lifelong learning. Embodies the skin diagnosis engine.",
    },
    {
      icon: SankofaIcon,
      name: "Sankofa",
      meaning: lang === "fr" ? "« Retourner à la source » · Agenda & Soins rituels" : "“Return to roots” · Ritual Booking & Care",
      desc:
        lang === "fr"
          ? "Un oiseau qui regarde en arrière pour bâtir l'avenir. Anime les rituels de prise de rendez-vous."
          : "A mythical bird looking back to take what is good into the future. Powers appointment rituals.",
    },
    {
      icon: BaouleIcon,
      name: "Baoulé Poids d'Or",
      meaning: lang === "fr" ? "« Équilibre & Justice » · Compta SYSCOHADA" : "“Balance & Justice” · SYSCOHADA Accounting",
      desc:
        lang === "fr"
          ? "Les poids à peser l'or Akan. Préside aux calculs de caisse, TVA et clôtures financières sans faille."
          : "The ancient goldweights of the Akan. Governs exact accounting and compliant ledgers.",
    },
    {
      icon: DuafeIcon,
      name: "Duafe",
      meaning: lang === "fr" ? "« Le Peigne de Bois » · Beauté & Soin de soi" : "“The Wooden Comb” · Beauty & Hygiene",
      desc:
        lang === "fr"
          ? "Symbole féminin de pureté, de coiffure et d'amour-propre. Inspire le catalogue et les routines."
          : "Feminine symbol of cleanliness, grooming, and self-worth. Inspires regimens and botanicals.",
    },
    {
      icon: CauriIcon,
      name: "Cauri Sacré",
      meaning: lang === "fr" ? "« Prospérité & Parole » · Secrétaire IA de Direction" : "“Prosperity & Voice” · AI Executive Assistant",
      desc:
        lang === "fr"
          ? "L'ancienne monnaie royale africaine. Donne corps à l'Orbe 3D et aux conversations audio."
          : "Ancient currency and mystical conduit of voice. Gives physical form to the 3D Voice Assistant.",
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#0D0906] text-[#FFF9EC] selection:bg-gold selection:text-black">
      <AuroraBackdrop />

      {/* ── BARRE DE NAVIGATION SUPÉRIEURE ÉTUDE DE CAS ── */}
      <header className="sticky top-0 z-50 border-b border-gold/15 bg-[#0D0906]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="grid size-9 place-items-center rounded-xl bg-gold/15 border border-gold/30 text-gold-text group-hover:scale-105 transition-transform">
                <KeneEmblem size={24} />
              </span>
              <span className="font-heading text-lg font-bold tracking-tight text-white">Kènè</span>
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-gold/10 border border-gold/25 px-2.5 py-0.5 text-[10.5px] font-semibold text-gold-text">
              <Award size={12} />
              {t.badge}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Basculeur de langue FR / EN */}
            <div className="flex items-center rounded-full bg-white/5 border border-white/10 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setLang("fr")}
                className={`rounded-full px-2.5 py-1 font-bold transition-all ${
                  lang === "fr" ? "bg-gold text-black shadow-xs" : "text-white/70 hover:text-white"
                }`}
              >
                FR
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`rounded-full px-2.5 py-1 font-bold transition-all ${
                  lang === "en" ? "bg-gold text-black shadow-xs" : "text-white/70 hover:text-white"
                }`}
              >
                EN
              </button>
            </div>

            <Magnetic strength={0.25}>
              <Link
                href="/"
                className="inline-flex h-9 items-center gap-1.5 rounded-full k-btn-gold px-4 text-xs font-bold text-black shadow-sm hover:scale-[1.02] active:scale-95 transition-all"
              >
                <span>{t.backToApp}</span>
                <ArrowRight size={13} />
              </Link>
            </Magnetic>
          </div>
        </div>
      </header>

      {/* ── HERO HEADER SCROLLYTELLING ── */}
      <section className="relative overflow-hidden pt-16 sm:pt-24 pb-16 lg:pb-24">
        {/* Glow atmosphérique */}
        <div
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[550px] w-full max-w-5xl opacity-40 blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(200, 149, 30, 0.45) 0%, rgba(139, 26, 59, 0.25) 50%, transparent 80%)",
          }}
          aria-hidden="true"
        />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Eyebrow className="text-gold-text tracking-[0.25em]">
              Design &amp; Creative Engineering Case Study
            </Eyebrow>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="mt-4 font-heading text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.06]"
          >
            <span className="block">{t.title1}</span>
            <TextShimmer className="italic">{t.title2}</TextShimmer>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-[#FFF9EC]/80 leading-relaxed font-light"
          >
            {t.subtitle}
          </motion.p>

          {/* Grille de KPIs techniques d'élite Awwwards */}
          <div className="mt-12 sm:mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {t.stats.map((s, idx) => (
              <TiltCard key={s.label} maxTilt={6}>
                <div className="rounded-2xl border border-gold/20 bg-white/[0.03] p-4 text-center backdrop-blur-sm">
                  <div className="font-heading text-2xl sm:text-3xl font-black text-gold-text">
                    <CountUp value={s.val} prefix={s.prefix} suffix={s.suffix} duration={1.6 + idx * 0.2} />
                  </div>
                  <div className="mt-1 text-xs font-bold text-white">{s.label}</div>
                  <div className="text-[10px] text-white/50">{s.sub}</div>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 1 : LA MISSION & LE DÉFI CLINIQUE ── */}
      <section className="border-t border-gold/15 py-16 lg:py-24 bg-black/20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
            <div className="lg:col-span-6 space-y-5">
              <Eyebrow>{t.missionTitle}</Eyebrow>
              <h2 className="font-heading text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                {t.missionHeading}
              </h2>
              <p className="text-sm sm:text-base text-white/75 leading-relaxed">{t.missionP1}</p>
              <p className="text-sm sm:text-base text-white/75 leading-relaxed">{t.missionP2}</p>
            </div>

            <div className="lg:col-span-6">
              <TiltCard maxTilt={8} className="rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/10 via-transparent to-bissap/15 p-6 sm:p-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gold-text">
                      Phototypes Fitzpatrick IV à VI
                    </span>
                    <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-mono text-gold-text">
                      Calibré VLM
                    </span>
                  </div>

                  <div className="space-y-3 pt-2">
                    {[
                      { label: "Hyperpigmentation Post-Inflammatoire (PIH)", score: 94, color: "bg-[#C8951E]" },
                      { label: "Régulation Sébacée en climat humide / chaud", score: 89, color: "bg-[#A0522D]" },
                      { label: "Protection Barrière & Lipides épidermiques", score: 96, color: "bg-[#3F7D3F]" },
                      { label: "Densité folliculaire & Alopécie de traction", score: 91, color: "bg-[#8B1A3B]" },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-white/80">{item.label}</span>
                          <span className="font-mono font-bold text-gold-text">{item.score}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${item.score}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className={`h-full rounded-full ${item.color}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 text-[11px] text-white/50 italic border-t border-white/10">
                    Calibration cutanée enrichie par les analyses cliniques et la pharmacopée africaine.
                  </div>
                </div>
              </TiltCard>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2 : LABORATOIRE 3D INTERACTIF WEBGL ── */}
      <section className="border-t border-gold/15 py-16 lg:py-24 relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <Eyebrow>{t.labTitle}</Eyebrow>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {t.labHeading}
            </h2>
            <p className="text-sm sm:text-base text-white/70">{t.labDesc}</p>
          </div>

          {/* Scène WebGL 3D Interactive du Cauri */}
          <div className="mt-10 rounded-3xl border border-gold/30 bg-black/60 p-4 sm:p-8 backdrop-blur-xl relative">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-mono text-white/80">WebGL Procedural Cowrie Shader</span>
              </div>

              {/* Contrôles interactifs d'état pour les jurés */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(["idle", "listening", "analyzing", "speaking", "success"] as OrbState[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setOrbState(st)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-mono capitalize transition-all ${
                      orbState === st
                        ? "bg-gold text-black font-bold shadow-xs"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-72 sm:h-96 w-full relative grid place-items-center">
              <MamanOrb3D
                state={orbState}
                size={280}
                interactive={true}
                audioLevel={orbState === "speaking" ? 0.75 : orbState === "listening" ? 0.45 : 0.15}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-white/50 border-t border-white/10 pt-3 font-mono">
              <span>Rendu Three.js @ 60fps · DPR borné à 1.5</span>
              <span>Astrolabe Ashanti &amp; Anneaux gravitationnels dorés</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3 : SYSTÈME DE DESIGN & ADINKRA ── */}
      <section className="border-t border-gold/15 py-16 lg:py-24 bg-black/20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-12">
            <Eyebrow>{t.designTitle}</Eyebrow>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {t.designHeading}
            </h2>
            <p className="text-sm sm:text-base text-white/70">{t.designDesc}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
            {ADINKRA_SYMBOLS.map((sym, idx) => {
              const Icon = sym.icon;
              const isActive = activeAdinkra === idx;
              return (
                <div
                  key={sym.name}
                  onClick={() => setActiveAdinkra(idx)}
                  className={`cursor-pointer rounded-2xl border p-4 sm:p-5 transition-all text-left flex flex-col justify-between ${
                    isActive
                      ? "border-gold bg-gold/15 shadow-lg shadow-gold/10 scale-[1.02]"
                      : "border-white/10 bg-white/[0.02] hover:border-gold/40 hover:bg-white/[0.04]"
                  }`}
                >
                  <div>
                    <div className="grid size-12 place-items-center rounded-xl bg-gold/20 text-gold-text mb-3">
                      <Icon size={26} />
                    </div>
                    <h3 className="font-heading text-base font-bold text-white">{sym.name}</h3>
                    <p className="text-xs text-gold-text font-medium mt-1">{sym.meaning}</p>
                  </div>
                  <p className="text-[11px] text-white/60 leading-relaxed mt-4 pt-3 border-t border-white/10">
                    {sym.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Palette Royale Chromatique */}
          <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-gold-text mb-3">
              Palette Chromatique Royale Kènè
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { name: "Or Impérial", hex: "#C8951E", role: "Lumière & Statut" },
                { name: "Ébène Profond", hex: "#0D0906", role: "Fondation & Nuit" },
                { name: "Fleur de Bissap", hex: "#8B1A3B", role: "Accent & Passion" },
                { name: "Feuille Kinkeliba", hex: "#3F7D3F", role: "Santé & Botanique" },
                { name: "Terre de Sienne", hex: "#A0522D", role: "Argile & Ancrage" },
              ].map((c) => (
                <div key={c.name} className="flex items-center gap-3">
                  <div className="size-9 rounded-xl border border-white/20 shrink-0" style={{ backgroundColor: c.hex }} />
                  <div>
                    <div className="text-xs font-bold text-white">{c.name}</div>
                    <div className="text-[10px] font-mono text-white/50">{c.hex} · {c.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 4 : INGÉNIERIE & DEVELOPER AWARD ── */}
      <section className="border-t border-gold/15 py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
            <div className="lg:col-span-6 space-y-5">
              <Eyebrow>{t.techTitle}</Eyebrow>
              <h2 className="font-heading text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                {t.techHeading}
              </h2>
              <p className="text-sm sm:text-base text-white/75 leading-relaxed">{t.techP1}</p>
              <ul className="space-y-2.5 pt-2">
                {t.techFeatures.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-xs sm:text-sm text-white/80">
                    <CheckCircle2 size={16} className="text-gold-text shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-6">
              <TiltCard maxTilt={6}>
                <div className="rounded-3xl border border-gold/30 bg-[#140E08] p-6 sm:p-8 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3 font-mono text-xs text-gold-text">
                    <div className="flex items-center gap-2">
                      <Cpu size={15} />
                      <span>kene-core-architecture.ts</span>
                    </div>
                    <span>Lighthouse 98/100</span>
                  </div>

                  <div className="space-y-2 font-mono text-[11px] sm:text-xs text-white/70">
                    <p><span className="text-gold-text">const</span> architecture = &#123;</p>
                    <p className="pl-4">framework: <span className="text-emerald-400">&quot;Next.js 16 (Turbopack)&quot;</span>,</p>
                    <p className="pl-4">pwa_offline: <span className="text-emerald-400">&quot;Service Worker + Queue Replay&quot;</span>,</p>
                    <p className="pl-4">rendering_fps: <span className="text-amber-400">60</span>,</p>
                    <p className="pl-4">cls_score: <span className="text-amber-400">0.00</span>,</p>
                    <p className="pl-4">payment_gateways: [<span className="text-emerald-400">&quot;Wave&quot;</span>, <span className="text-emerald-400">&quot;Orange&quot;</span>, <span className="text-emerald-400">&quot;SasPay&quot;</span>],</p>
                    <p className="pl-4">compliance: <span className="text-emerald-400">&quot;SYSCOHADA + CNPS&quot;</span>,</p>
                    <p>&#125;;</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center">
                    <div className="rounded-xl bg-white/5 p-2">
                      <div className="text-base font-bold text-emerald-400 font-mono">98</div>
                      <div className="text-[9px] text-white/50 uppercase">Performance</div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-2">
                      <div className="text-base font-bold text-emerald-400 font-mono">100</div>
                      <div className="text-[9px] text-white/50 uppercase">Accessibilité</div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-2">
                      <div className="text-base font-bold text-emerald-400 font-mono">100</div>
                      <div className="text-[9px] text-white/50 uppercase">Best Practices</div>
                    </div>
                  </div>
                </div>
              </TiltCard>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 5 : CALL TO ACTION / ENTRÉE DIRECTE ── */}
      <section className="border-t border-gold/20 py-20 bg-gradient-to-b from-transparent to-[#140E08]/80 text-center">
        <div className="mx-auto max-w-3xl px-4">
          <Eyebrow className="text-gold-text">Live Platform</Eyebrow>
          <h2 className="mt-3 font-heading text-3xl sm:text-5xl font-black text-white">
            {t.ctaTitle}
          </h2>
          <div className="mt-8 flex justify-center">
            <Magnetic strength={0.35}>
              <Link
                href="/"
                className="inline-flex h-12 items-center gap-2 rounded-full k-btn-gold px-8 text-sm font-bold text-black shadow-lg shadow-gold/25 hover:scale-105 active:scale-95 transition-all"
              >
                <span>{t.ctaButton}</span>
                <ArrowRight size={16} />
              </Link>
            </Magnetic>
          </div>
        </div>
      </section>
    </div>
  );
}
