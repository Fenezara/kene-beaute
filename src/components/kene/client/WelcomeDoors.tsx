"use client";
// Kènè — Les Portes : la page d'accueil hors session.
//
// DEUX publics, UN écran (t. 73) :
//   • la nouvelle arrivante — elle découvre la promesse (héro arche, titre
//     kente-text-flow, pastilles de confiance) et choisit sa porte ;
//   • celle qui s'est déconnectée et revient — carte « Contente de te
//     revoir » avec le dernier numéro mémorisé sur CET appareil
//     (kene-last-account, clé dédiée qui SURVIT à la déconnexion) →
//     reconnexion en deux gestes (numéro pré-rempli → code SMS).
//
// Les DEUX PORTES (cliente / entreprise) : arche plein-cintre, vantaux
// jumeaux qui s'ouvrent au toucher (lumières + paillettes au-delà de la
// porte, seuil kente), puis l'écran de connexion prend le relais.
// Copie 100 % FR direct (précédent t. 71-c : les écrarts marketing restent
// hors i18n métier). Accessibilité : portes = <button> focusables, cibles
// ≥ 44 px, reduced-motion → ouverture instantanée sans animation.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, BriefcaseBusiness, Loader2, LogIn, MessageCircle, ScanFace, ShieldCheck, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/kene/api";
import {
  firstNameOf, forgetAccount, maskPhone, readLastAccount, type LastAccount,
} from "@/lib/kene/last-account";
import { AuroraBackdrop, Eyebrow, GlassCard, PrimaryCTA, Reveal, RevealItem } from "@/components/kene/ui2026";
import { DuafeIcon, KeneLogo } from "@/components/kene/icons";
import { useKene, type SessionUser } from "@/store/kene";
import { Onboarding } from "./Onboarding";
import { type ApiUser } from "./types";

/* ───────────────────────── Vantaux — recettes visuelles ─────────────────────────
   Chaque porte = lumière au-delà (z-0) + deux vantaux (z-1) + joint central
   (z-2) + contenu ancré (z-3). Les vantaux glissent latéralement à
   l'ouverture ; le joint reste (c'est le cadre). */
type DoorTone = "client" | "pro";

const DOOR_SKIN: Record<DoorTone, {
  panel: string; // fond d'un vantail (dégradé profond)
  panelShadow: string;
  glow: string; // halo extérieur de la porte
  badgeBg: string;
  doorLabel: string; // aria
}> = {
  client: {
    panel: "linear-gradient(204deg, #7A4522 0%, #6B2416 46%, #571434 100%)",
    panelShadow: "inset 0 1px 0 rgba(255,249,236,0.16), inset 0 0 0 1px rgba(26,18,12,0.35)",
    glow: "0 10px 34px -12px rgba(139,26,59,0.55), 0 0 0 1px rgba(200,149,30,0.28)",
    badgeBg: "rgba(26,18,12,0.42)",
    doorLabel: "Porte cliente — connexion pour prendre soin de ma peau",
  },
  pro: {
    panel: "linear-gradient(204deg, #D9A93E 0%, #B57F1C 42%, #8A5A14 100%)",
    panelShadow: "inset 0 1px 0 rgba(255,249,236,0.28), inset 0 0 0 1px rgba(26,18,12,0.32)",
    glow: "0 10px 34px -12px rgba(200,149,30,0.55), 0 0 0 1px rgba(200,149,30,0.35)",
    badgeBg: "rgba(26,18,12,0.34)",
    doorLabel: "Porte entreprise — connexion institut, spa ou dermo-conseillère",
  },
};

/** La lumière au-delà de la porte (cœur chaud, révélé à l'ouverture). */
const LIGHT_BEYOND =
  "radial-gradient(88% 72% at 50% 80%, #FFF6DC 0%, #F3D98A 36%, rgba(243,217,138,0) 74%)";

function PortalDoor({
  tone,
  icon,
  kicker,
  title,
  hint,
  opening,
  dimmed,
  onEnter,
  delay,
}: {
  tone: DoorTone;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  hint: string;
  opening: boolean;
  dimmed: boolean;
  onEnter: () => void;
  delay: number;
}) {
  const skin = DOOR_SKIN[tone];
  const [hovered, setHovered] = useState(false);
  const open = opening;
  // Vantaux : repos → survol (léger écart) → ouverture (glissade franche).
  const panelVariants = {
    rest: { x: "0%" },
    hover: { x: tone === "client" ? "-3.5%" : "3.5%" },
    open: { x: tone === "client" ? "-92%" : "92%" },
  };
  const panelTransition = open
    ? { type: "spring" as const, stiffness: 210, damping: 30 }
    : { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const };
  const panelState = open ? "open" : hovered ? "hover" : "rest";

  return (
    <motion.button
      type="button"
      onClick={onEnter}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={skin.doorLabel}
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: dimmed && !open ? 0.45 : 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 220, damping: 26 }}
      className="group relative min-w-0 flex-1 cursor-pointer rounded-[28px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      {/* Arche plein-cintre — cadre + halo signature */}
      <div
        className="relative aspect-[10/15.2] w-full overflow-hidden rounded-t-[999px] rounded-b-[26px]"
        style={{ boxShadow: skin.glow }}
      >
        {/* 0 · Lumière au-delà (voilée fermée, rayonnante ouverte) */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: LIGHT_BEYOND }}
          initial={false}
          animate={{ opacity: open ? 1 : 0.16 }}
          transition={{ duration: open ? 0.45 : 0.3 }}
        />
        {open && (
          <>
            <motion.span aria-hidden="true" className="absolute left-[24%] top-[30%] text-[#C8951E]"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: [0, 1, 0.7], y: [8, -6, 2] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse" }}>
              <Sparkles size={15} />
            </motion.span>
            <motion.span aria-hidden="true" className="absolute right-[22%] top-[46%] text-[#A0522D]"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: [0, 0.9, 0.5], y: [-6, 6, -2] }}
              transition={{ duration: 1.9, repeat: Infinity, repeatType: "reverse", delay: 0.25 }}>
              <Sparkles size={12} />
            </motion.span>
          </>
        )}

        {/* 1 · Vantaux jumeaux (texture bogolan + seuil kente + poignées laiton) */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1/2"
          style={{ background: skin.panel, boxShadow: skin.panelShadow }}
          initial={false}
          variants={panelVariants}
          animate={panelState}
          transition={panelTransition}
        >
          <div className="bogolan-dots absolute inset-0 opacity-40" />
          <span className="absolute right-3 top-[45%] h-10 w-[5px] rounded-full bg-[#F3D98A]/85 shadow-[0_1px_4px_rgba(26,18,12,0.4)]" />
          <span className="kente-band absolute inset-x-0 bottom-0 h-[7px]" />
        </motion.div>
        <motion.div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1/2"
          style={{ background: skin.panel, boxShadow: skin.panelShadow }}
          initial={false}
          variants={panelVariants}
          animate={panelState}
          transition={panelTransition}
        >
          <div className="bogolan-dots absolute inset-0 opacity-40" />
          <span className="absolute left-3 top-[45%] h-10 w-[5px] rounded-full bg-[#F3D98A]/85 shadow-[0_1px_4px_rgba(26,18,12,0.4)]" />
          <span className="kente-band absolute inset-x-0 bottom-0 h-[7px]" />
        </motion.div>

        {/* 2 · Joint central — limité à la partie haute (il ne doit JAMAIS
            traverser le bloc de texte : la lecture passe avant la déco) ;
            il s'estompe avant le contenu. */}
        <span aria-hidden="true"
          className="absolute left-1/2 top-0 z-[2] h-[44%] w-[2px] -translate-x-1/2 bg-gradient-to-b from-[#F3D98A]/60 via-[#C8951E]/30 to-transparent" />

        {/* 2bis · Voile de lisibilité — dégradé sombre sur la moitié basse
            (contraste du contenu sur les deux tons de porte, WCAG-friendly) */}
        <span aria-hidden="true"
          className="absolute inset-x-0 bottom-0 z-[2] h-[58%] bg-gradient-to-t from-black/45 via-black/15 to-transparent" />

        {/* 3 · Contenu ancré (au-dessus des vantaux, s'estompe à l'ouverture) */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 z-[3] flex flex-col items-center px-3 pb-5 text-center"
          initial={false}
          animate={{ opacity: open ? 0 : 1, y: open ? -8 : 0 }}
          transition={{ duration: 0.28 }}
        >
          <span
            className="grid h-12 w-12 place-items-center rounded-full ring-1 ring-[#FFF9EC]/25"
            style={{ background: skin.badgeBg }}
          >
            {icon}
          </span>
          <p className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#FFF9EC]/90">{kicker}</p>
          <p className="mt-1 font-heading text-[15px] font-black leading-[1.2] text-[#FFF9EC]">{title.split("\n").map((line, i) => (<span key={i} className="block">{line}</span>))}</p>
          <p className="mt-1.5 max-w-[17ch] text-[10.5px] leading-snug text-[#FFF9EC]/80">{hint}</p>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-black/25 px-3.5 py-1.5 text-[11px] font-bold text-[#FFF9EC] ring-1 ring-[#FFF9EC]/25">
            Entrer
            <ArrowRight size={12} className="transition-transform duration-300 group-hover:translate-x-0.5" />
          </span>
        </motion.div>
      </div>
    </motion.button>
  );
}

/* ───────────────────────── Écran — les Portes de Kènè ───────────────────────── */

type Stage =
  | { phase: "doors" }
  | { phase: "signin"; mode: "client" | "pro"; phone?: string };

const pageSlide = {
  initial: { x: 44, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -44, opacity: 0 },
};

export function WelcomeDoors() {
  const setUser = useKene((s) => s.setUser);
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>({ phase: "doors" });
  const [opening, setOpening] = useState<DoorTone | null>(null);
  const [last, setLast] = useState<LastAccount | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const openTimer = useRef<number | null>(null);

  // Dernier compte : lu APRÈS montage (jamais pendant le rendu — zéro
  // mismatch d'hydratation). Clé dédiée : survit à la déconnexion.
  useEffect(() => {
    setLast(readLastAccount());
  }, []);

  // Sécurité : au démontage (connexion réussie…), aucun timer perdu.
  useEffect(() => {
    return () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
    };
  }, []);

  function enterDoor(mode: DoorTone) {
    if (opening) return; // double-tap pendant l'animation → ignoré
    if (reduce) {
      setStage({ phase: "signin", mode });
      return;
    }
    setOpening(mode);
    openTimer.current = window.setTimeout(() => {
      setOpening(null);
      setStage({ phase: "signin", mode });
    }, 520);
  }

  async function startDemo() {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      const res = await apiPost<{ ok: boolean; devCode: string }>("/api/auth/otp/request", { phone: "+2250701020304" });
      const v = await apiPost<{ user: ApiUser }>("/api/auth/otp/verify", { phone: "+2250701020304", code: res.devCode });
      setUser(v.user as SessionUser);
      toast.success(`Bienvenue ${v.user.name.split(" ")[0]} — compte démo riche chargé`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Démo indisponible");
    } finally {
      setDemoLoading(false);
    }
  }

  const roleLabel = last
    ? last.role === "pro"
      ? "Espace entreprise"
      : last.role === "admin"
        ? "Console Kènè"
        : "Espace cliente"
    : "";

  return (
    <div className="relative isolate min-h-dvh w-full">
      <AuroraBackdrop />
      <AnimatePresence mode="wait" initial={false}>
        {stage.phase === "doors" ? (
          <motion.div key="doors" {...pageSlide} transition={{ duration: 0.32 }}
            className="mx-auto flex w-full max-w-[430px] flex-col px-4 pb-6 pt-7 sm:max-w-[540px] sm:px-6 sm:pt-10">
            {/* ── En-tête : wordmark + POC ── */}
            <Reveal y={14}>
              <div className="flex items-center justify-center gap-3">
                <KeneLogo size={44} withText />
                <span className="rounded-full bg-[#6B2416]/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FFF9EC]">
                  POC démo
                </span>
              </div>
            </Reveal>

            {/* ── Héro : portrait en arche (écho des portes) + promesse ── */}
            <Reveal y={16} className="mt-5">
              <div className="mx-auto w-[104px] overflow-hidden rounded-t-[999px] rounded-b-[22px] ring-1 ring-[#C8951E]/30 sm:w-[118px]"
                style={{ boxShadow: "0 12px 32px -14px rgba(200,149,30,0.45)" }}>
                <img src="/hero/hero-client.webp" alt="Portrait d'une femme africaine au teint lumineux"
                  className="aspect-[10/13] h-full w-full object-cover" />
                <span className="kente-band block h-[6px]" aria-hidden="true" />
              </div>
              <div className="mt-5 text-center">
                <Eyebrow className="text-center">Bienvenue à Kènè</Eyebrow>
                <h1 className="kente-text-flow mt-2 font-heading text-[24px] font-black leading-[1.15] sm:text-[27px]">
                  Ta peau mélanoderme,<br />enfin comprise.
                </h1>
                <p className="mx-auto mt-3 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">
                  Diagnostic IA vision, coach Dr. Kènè et boutique botanique — pensés pour les teints
                  Fitzpatrick&nbsp;IV–VI.
                </p>
              </div>
            </Reveal>

            {/* ── Reconnexion express (dernier compte de cet appareil) ── */}
            <AnimatePresence initial={false}>
              {last && (
                <RevealItem className="mt-5">
                  <GlassCard hero grain className="rounded-[26px] p-5">
                    <div className="flex items-center gap-3.5">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full k-cta text-[17px] font-heading font-black text-[#FFF9EC]"
                        aria-hidden="true">
                        {firstNameOf(last.name).slice(0, 1).toUpperCase() || "K"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-heading text-[15px] font-bold leading-tight">
                          Contente de te revoir{firstNameOf(last.name) ? `, ${firstNameOf(last.name)}` : ""} 👋
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {maskPhone(last.phone)} · {roleLabel}
                        </p>
                      </div>
                    </div>
                    <PrimaryCTA
                      className="mt-4 w-full"
                      onClick={() => setStage({ phase: "signin", mode: last.role === "pro" ? "pro" : "client", phone: last.phone })}
                    >
                      <LogIn size={17} />
                      Reprendre ma session
                    </PrimaryCTA>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setStage({ phase: "signin", mode: "client" })}
                        className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground underline underline-offset-4 decoration-dotted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded"
                      >
                        Utiliser un autre numéro
                      </button>
                      <button
                        onClick={() => { forgetAccount(); setLast(null); }}
                        className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded"
                        aria-label="Oublier ce numéro sur cet appareil"
                      >
                        Oublier
                      </button>
                    </div>
                  </GlassCard>
                </RevealItem>
              )}
            </AnimatePresence>

            {/* ── LES DEUX PORTES ── */}
            <Reveal y={20} className="mt-7">
              <div className="text-center">
                <Eyebrow className="text-center">Choisis ta porte</Eyebrow>
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                  Deux espaces, deux mondes — une seule application.
                </p>
              </div>
              <div className="mt-4 flex items-end gap-3 sm:gap-4">
                <PortalDoor
                  tone="client"
                  icon={<DuafeIcon size={24} className="text-[#F3D98A]" />}
                  kicker="Espace cliente"
                  title={"Prendre soin\nde ma peau"}
                  hint="Diagnostic IA · Dr. Kènè · Boutique"
                  opening={opening === "client"}
                  dimmed={opening === "pro"}
                  onEnter={() => enterDoor("client")}
                  delay={0.06}
                />
                <PortalDoor
                  tone="pro"
                  icon={<BriefcaseBusiness size={22} className="text-[#FFF9EC]" />}
                  kicker="Espace entreprise"
                  title={"Gérer mon\ninstitut"}
                  hint="Agenda · Caisse · CRM"
                  opening={opening === "pro"}
                  dimmed={opening === "client"}
                  onEnter={() => enterDoor("pro")}
                  delay={0.14}
                />
              </div>
              {/* Les portes posent directement sur leur kente-band interne —
                  pas de seuil séparé (il doublait la bande des vantaux). */}
            </Reveal>

            {/* ── Confiance + découverte + légal ── */}
            <RevealItem className="mt-6">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="k-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold text-foreground/80">
                  <ScanFace size={13} className="text-gold-text" aria-hidden="true" /> IA peaux foncées
                </span>
                <span className="k-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold text-foreground/80">
                  <MessageCircle size={13} className="text-gold-text" aria-hidden="true" /> Dr. Kènè 7j/7
                </span>
                <span className="k-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold text-foreground/80">
                  <ShieldCheck size={13} className="text-gold-text" aria-hidden="true" /> Données chiffrées
                </span>
              </div>
            </RevealItem>
            {!last && (
              <RevealItem className="mt-4">
                <button
                  onClick={startDemo}
                  disabled={demoLoading}
                  className="mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-[12px] font-semibold text-muted-foreground underline underline-offset-4 decoration-dotted hover:text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {demoLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} aria-hidden="true" />}
                  Découvrir la démo — entrer comme Mariam
                </button>
              </RevealItem>
            )}
            <p className="mt-auto pt-7 text-center text-[11px] leading-relaxed text-muted-foreground">
              En continuant, tu acceptes les conditions Kènè. Données santé chiffrées, jamais revendues.
            </p>
          </motion.div>
        ) : (
          <motion.div key="signin" {...pageSlide} transition={{ duration: 0.32 }}>
            <Onboarding
              initialMode={stage.mode}
              initialPhone={stage.phone}
              onBack={() => setStage({ phase: "doors" })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
