"use client";
// Kènè — LE SEUIL : la page d'accueil d'avant-portails, refonte totale (t. 74).
//
// Ce qui change par rapport aux anciennes pages d'entrée (intro forcée +
// portes marketing + connexion classique) — inspirations assumées :
//   • Linear / Locomotive (hero éditorial géant, lumière vivante, zéro bruit)
//   • Instagram / TikTok (stories OPT-IN « Découvrir en 30 s » — plus aucune
//     intro imposée : la découverte accompagne, elle ne retient pas)
//   • Cash App / N26 (pavé numérique natif plein cadre — aucune friction OS)
//   • Fenty / Glossier (portails image plein cadre, typographie éditoriale)
//
// Architecture : UNE page, TROIS états (landing → keypad → signin). Le
// pavé appelle lui-même /api/auth/otp/request puis monte l'Onboarding
// DIRECTEMENT à l'étape OTP (pont initialStep/initialDevCode — additif).
// La reconnexion express garde la mémoire locale kene-last-account (t. 73).
// Copie FR directe (précédent 71-c/73 : le marketing d'entrée reste hors i18n).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, BriefcaseBusiness, Loader2, LogIn, Play, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/kene/api";
import {
  firstNameOf, forgetAccount, maskPhone, readLastAccount, type LastAccount,
} from "@/lib/kene/last-account";
import { AuroraBackdrop, Eyebrow, GlassCard, PrimaryCTA, Reveal, RevealItem } from "@/components/kene/ui2026";
import { DuafeIcon, KeneLogo, KeneMark } from "@/components/kene/icons";
import { useKene, type SessionUser } from "@/store/kene";
import { Onboarding } from "./Onboarding";
import { PhoneKeypad, otpErrorToast, requestOtp } from "./PhoneKeypad";
import { ThresholdStories } from "./ThresholdStories";
import { type ApiUser } from "./types";

/* ───────────────────────── Fils de kente vivants (hero) ─────────────────────────
   3 courbes Bézier or/terre/bissap qui se DESSINENT à l'arrivée (pathLength),
   puis respirent (dérive lente). Parallaxe pointeur douce sur desktop. */
const THREADS = [
  { d: "M -20 62 C 120 18, 260 108, 430 66", stroke: "#C8951E", w: 2 },
  { d: "M -20 132 C 140 92, 250 168, 430 122", stroke: "#A0522D", w: 1.6 },
  { d: "M -20 202 C 110 162, 280 228, 430 188", stroke: "#8B1A3B", w: 1.6 },
];

function KenteThreads({ first }: { first: boolean }) {
  const parallax = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const zone = parallax.current?.parentElement;
    if (!zone) return;
    const onMove = (e: MouseEvent) => {
      if (raf.current) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = 0;
        const el = parallax.current;
        if (!el) return;
        const r = zone.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `translate(${nx * 10}px, ${ny * 8}px)`;
      });
    };
    zone.addEventListener("mousemove", onMove);
    return () => {
      zone.removeEventListener("mousemove", onMove);
      if (raf.current) window.cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={parallax} className="pointer-events-none absolute inset-0 transition-transform duration-500 ease-out" aria-hidden="true">
      <svg viewBox="0 0 400 240" preserveAspectRatio="none" className="h-full w-full">
        {THREADS.map((t, i) => (
          <motion.path
            key={i}
            d={t.d}
            fill="none"
            stroke={t.stroke}
            strokeWidth={t.w}
            strokeLinecap="round"
            opacity={0.45}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: first ? 1.1 : 0.5, delay: (first ? 0.15 : 0) + i * 0.16, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        {/* Nœuds — perles aux extrémités des fils */}
        {THREADS.map((t, i) => {
          const m = / ([\d.]+) ([\d.]+)$/.exec(t.d);
          if (!m) return null;
          return (
            <motion.circle
              key={`n${i}`}
              cx={parseFloat(m[1])}
              cy={parseFloat(m[2])}
              r={3.2}
              fill={t.stroke}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 0.9, scale: 1 }}
              transition={{ delay: (first ? 1 : 0.4) + i * 0.16, type: "spring", stiffness: 300, damping: 18 }}
            />
          );
        })}
      </svg>
    </div>
  );
}

/* ───────────────────────── Portail image plein cadre ───────────────────────── */
function PortalCard({
  mode,
  img,
  imgAlt,
  icon,
  kicker,
  title,
  entering,
  dimmed,
  onEnter,
  delay,
}: {
  mode: "client" | "pro";
  img: string;
  imgAlt: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  entering: boolean;
  dimmed: boolean;
  onEnter: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onEnter}
      aria-label={`${kicker} — ${title}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: dimmed && !entering ? 0.35 : 1, y: 0, scale: entering ? 1.045 : 1 }}
      transition={{ delay, type: "spring", stiffness: 210, damping: 24 }}
      whileTap={{ scale: 0.97 }}
      className="group relative block h-[128px] w-full overflow-hidden rounded-[24px] text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:h-[168px] md:h-[272px]"
      style={{
        boxShadow: mode === "pro"
          ? "0 0 0 1px rgba(200,149,30,0.4), 0 16px 40px -16px rgba(200,149,30,0.5)"
          : "0 0 0 1px rgba(139,26,59,0.4), 0 16px 40px -16px rgba(26,18,12,0.55)",
      }}
    >
      {/* Image plein cadre + voile dégradé (lisibilité garantie) */}
      <img src={img} alt={imgAlt} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#140E08]/85 via-[#140E08]/30 to-[#140E08]/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#140E08]/45 to-transparent" />

      {/* Badge espace — opacité montée (lisibilité sur zones claires des photos) */}
      <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#140E08]/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFF9EC] ring-1 ring-[#FFF9EC]/25">
        {icon}
        {kicker}
      </span>

      {/* Titre + CTA */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="font-heading text-[18px] font-black leading-tight text-[#FFF9EC] sm:text-[22px]">{title}</p>
          <p className="mt-1 hidden text-[11.5px] text-[#FFF9EC]/75 sm:block">
            {mode === "client" ? "Diagnostic IA · Dr. Kènè · Boutique" : "Agenda · Caisse · CRM clientes"}
          </p>
        </div>
        <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full k-btn-gold px-4 text-[12px] font-bold text-primary-foreground">
          Entrer
          <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </motion.button>
  );
}

/* ───────────────────────── Écran — Le Seuil ───────────────────────── */

type Stage =
  | { phase: "landing" }
  | { phase: "keypad"; mode: "client" | "pro" }
  | { phase: "signin"; mode: "client" | "pro"; phone: string; devCode: string };

const SEEN_KEY = "kene-seen";
const pageSlide = {
  initial: { x: 44, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -44, opacity: 0 },
};

export function WelcomeThreshold() {
  const setUser = useKene((s) => s.setUser);
  const [stage, setStage] = useState<Stage>({ phase: "landing" });
  const [keypadMode, setKeypadMode] = useState<"client" | "pro">("client");
  const [keypadDigits, setKeypadDigits] = useState("");
  const [entering, setEntering] = useState<"client" | "pro" | null>(null);
  const [stories, setStories] = useState(false);
  const [last, setLast] = useState<LastAccount | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [first, setFirst] = useState(true);
  const enterTimer = useRef<number | null>(null);

  // Première visite ? (raccourcit la chorégraphie d'arrivée au retour).
  // Lecture localStorage en rendu client uniquement — le composant n'est
  // monté qu'APRÈS la porte d'hydratation de ClientApp (BootSkeleton avant).
  useEffect(() => {
    try {
      setFirst(localStorage.getItem(SEEN_KEY) !== "1");
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* stockage indisponible — comportement première visite */
    }
    setLast(readLastAccount());
    return () => {
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
    };
  }, []);

  function enterPortal(mode: "client" | "pro") {
    if (entering) return;
    setEntering(mode);
    enterTimer.current = window.setTimeout(() => {
      setEntering(null);
      setKeypadMode(mode);
      setStage({ phase: "keypad", mode });
    }, 320);
  }

  function startReconnect(acc: LastAccount) {
    const d = acc.phone.replace(/\D/g, "").replace(/^225/, "").slice(0, 10);
    setKeypadDigits(d);
    const mode = acc.role === "pro" ? "pro" : "client";
    setKeypadMode(mode);
    setStage({ phase: "keypad", mode });
  }

  async function onKeypadConfirm(digits: string) {
    const phone = `+225${digits}`;
    try {
      const devCode = await requestOtp(phone);
      setStage({ phase: "signin", mode: keypadMode, phone, devCode });
      toast.success("Code envoyé par SMS (simulé)");
    } catch (e) {
      otpErrorToast(e);
    }
  }

  async function startDemo() {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      const res = await apiPost<{ ok: boolean; devCode: string }>("/api/auth/otp/request", { phone: "+2250701020304" });
      const v = await apiPost<{ user: ApiUser }>("/api/auth/otp/verify", { phone: "+2250701020304", code: res.devCode });
      // Mémoire locale (t. 73) — survit à la déconnexion, jamais envoyée.
      try {
        localStorage.setItem("kene-last-account", JSON.stringify({ phone: "+2250701020304", name: v.user.name, role: v.user.role === "pro" || v.user.role === "admin" ? v.user.role : "client" }));
      } catch { /* non bloquant */ }
      setUser(v.user as SessionUser);
      toast.success(`Bienvenue ${v.user.name.split(" ")[0]} — compte démo riche chargé`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Démo indisponible");
    } finally {
      setDemoLoading(false);
    }
  }

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const d = first ? 1 : 0.3; // multiplicateur de délai (retour = plus vif)

  return (
    <div className="relative isolate min-h-dvh w-full">
      <AuroraBackdrop />
      <AnimatePresence mode="wait" initial={false}>
        {stage.phase === "landing" && (
          <motion.div key="landing" {...pageSlide} transition={{ duration: 0.3 }}
            className="mx-auto flex w-full max-w-[560px] flex-col px-5 pb-6 pt-6 sm:px-6 sm:pt-9">
            {/* ── Marque ── */}
            <Reveal y={12}>
              <div className="flex items-center justify-between">
                <KeneLogo size={40} withText />
                <span className="rounded-full bg-[#6B2416]/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FFF9EC]">
                  POC démo
                </span>
              </div>
            </Reveal>

            {/* ── Hero éditorial + fils de kente ── */}
            <section className="relative mt-6 sm:mt-8" aria-label="Promesse Kènè">
              {/* Lumière dorée localisée (plus riche que l'aurora globale) */}
              <div
                className="pointer-events-none absolute -inset-x-5 -top-6 h-[130%]"
                style={{
                  backgroundImage:
                    "radial-gradient(58% 52% at 16% 10%, color-mix(in srgb, #C8951E 20%, transparent) 0%, transparent 70%), radial-gradient(46% 42% at 92% 26%, color-mix(in srgb, #A0522D 15%, transparent) 0%, transparent 66%), radial-gradient(64% 55% at 55% 112%, color-mix(in srgb, #8B1A3B 11%, transparent) 0%, transparent 72%)",
                }}
                aria-hidden="true"
              />
              {/* Filigrane Duafe — géant, discret, flotte lentement */}
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute -right-7 -top-9 text-[160px] opacity-[0.055] sm:text-[210px]"
                animate={{ y: [0, -9, 0], rotate: [0, 1.5, 0] }}
                transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
                style={{ color: "var(--gold-text)" }}
              >
                <KeneMark size={160} />
              </motion.span>

              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * d, duration: 0.5 }}>
                <Eyebrow>
                  {greet} ✨ Bienvenue à Kènè
                </Eyebrow>
              </motion.div>
              <h1 className="mt-3 font-heading text-[38px] font-black leading-[1.02] tracking-tight text-foreground sm:text-[50px]">
                {["Ta peau,", "mélanoderme,"].map((line, i) =>
                  i === 1 ? (
                    <motion.span key={line} className="kente-text-flow block italic"
                      initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (0.28 + i * 0.13) * d, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                      {line}
                    </motion.span>
                  ) : (
                    <motion.span key={line} className="block"
                      initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (0.28 + i * 0.13) * d, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                      {line}
                    </motion.span>
                  ),
                )}
                <motion.span className="block"
                  initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (0.28 + 2 * 0.13) * d, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                  enfin comprise.
                </motion.span>
              </h1>
              <motion.p className="mt-5 max-w-[42ch] text-[13.5px] leading-relaxed text-muted-foreground"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.62 * d }}>
                Diagnostic IA vision, coach Dr. Kènè, boutique botanique et instituts partenaires —
                pensés pour les teints Fitzpatrick&nbsp;IV–VI.
              </motion.p>
              <motion.button
                onClick={() => setStories(true)}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.72 * d }}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full k-chip px-4 text-[12.5px] font-semibold text-foreground/85 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                aria-label="Découvrir Kènè en 30 secondes (stories)"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full k-btn-gold text-primary-foreground" aria-hidden="true">
                  <Play size={11} className="ml-0.5" />
                </span>
                Découvrir Kènè en 30&nbsp;s
                <span className="text-[10px] text-muted-foreground">· facultatif</span>
              </motion.button>
            </section>

            {/* ── Tissage séparateur — les fils vivent ICI, dans leur propre
                bande (jamais derrière un texte : la promesse au-dessus, le
                choix en dessous — croisement impossible par construction) ── */}
            <div className="relative mt-5 h-[56px] sm:h-[64px]" aria-hidden="true">
              <KenteThreads first={first} />
            </div>

            {/* ── Reconnexion express ── */}
            <AnimatePresence initial={false}>
              {last && (
                <RevealItem className="mt-6">
                  <GlassCard hero grain className="rounded-[24px] p-4.5 sm:p-5">
                    <div className="flex items-center gap-3.5">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full k-cta text-[17px] font-heading font-black text-[#FFF9EC]" aria-hidden="true">
                        {firstNameOf(last.name).slice(0, 1).toUpperCase() || "K"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-heading text-[15px] font-bold leading-tight">
                          {greet}, {firstNameOf(last.name) || "bienvenue"} 👋
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {maskPhone(last.phone)} · {last.role === "pro" ? "Espace entreprise" : last.role === "admin" ? "Console Kènè" : "Espace cliente"}
                        </p>
                      </div>
                    </div>
                    <PrimaryCTA className="mt-4 w-full" onClick={() => startReconnect(last)}>
                      <LogIn size={17} />
                      Reprendre ma session
                    </PrimaryCTA>
                    <div className="mt-2 flex items-center justify-between">
                      <button onClick={() => { setKeypadDigits(""); setKeypadMode("client"); setStage({ phase: "keypad", mode: "client" }); }}
                        className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground underline underline-offset-4 decoration-dotted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded">
                        Utiliser un autre numéro
                      </button>
                      <button onClick={() => { forgetAccount(); setLast(null); }}
                        className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded"
                        aria-label="Oublier ce numéro sur cet appareil">
                        Oublier
                      </button>
                    </div>
                  </GlassCard>
                </RevealItem>
              )}
            </AnimatePresence>

            {/* ── LES DEUX PORTAILS ── */}
            <div className="mt-8 flex flex-col gap-3.5 sm:mt-9 md:grid md:grid-cols-2 md:gap-4">
              <PortalCard
                mode="client"
                img="/hero/hero-client.webp"
                imgAlt="Femme au teint lumineux, porte de l'espace cliente"
                icon={<DuafeIcon size={13} className="text-[#F3D98A]" />}
                kicker="Espace cliente"
                title="Prendre soin de ma peau"
                entering={entering === "client"}
                dimmed={entering === "pro"}
                onEnter={() => enterPortal("client")}
                delay={0.06}
              />
              <PortalCard
                mode="pro"
                img="/instituts/eclat-d-abidjan.webp"
                imgAlt="Institut partenaire, porte de l'espace entreprise"
                icon={<BriefcaseBusiness size={13} className="text-[#FFF9EC]" />}
                kicker="Espace entreprise"
                title="Gérer mon institut"
                entering={entering === "pro"}
                dimmed={entering === "client"}
                onEnter={() => enterPortal("pro")}
                delay={0.16}
              />
            </div>

            {/* ── Confiance · démo · légal ── */}
            <RevealItem className="mt-5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="k-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold text-foreground/80">
                  <Sparkles size={12} className="text-gold-text" aria-hidden="true" /> Zéro friction — 2 gestes pour entrer
                </span>
                <span className="k-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-semibold text-foreground/80">
                  Données chiffrées, jamais revendues
                </span>
              </div>
            </RevealItem>
            {!last && (
              <RevealItem className="mt-4">
                <button
                  onClick={startDemo}
                  disabled={demoLoading}
                  className="mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-[12px] font-semibold text-foreground/75 underline underline-offset-4 decoration-dotted hover:text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {demoLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} aria-hidden="true" />}
                  Découvrir la démo — entrer comme Mariam
                </button>
              </RevealItem>
            )}
            <p className="mt-auto pt-7 text-center text-[11px] leading-relaxed text-muted-foreground">
              En continuant, tu acceptes les conditions Kènè.
            </p>
          </motion.div>
        )}

        {stage.phase === "keypad" && (
          <motion.div key="keypad" {...pageSlide} transition={{ duration: 0.3 }}>
            <PhoneKeypad
              mode={stage.mode}
              initialDigits={keypadDigits}
              onConfirm={onKeypadConfirm}
              onBack={() => setStage({ phase: "landing" })}
              onSwitchSpace={() => setStage({ phase: "landing" })}
            />
          </motion.div>
        )}

        {stage.phase === "signin" && (
          <motion.div key="signin" {...pageSlide} transition={{ duration: 0.3 }}>
            <Onboarding
              initialMode={stage.mode}
              initialPhone={stage.phone}
              initialDevCode={stage.devCode}
              initialStep={1}
              onBack={() => setStage({ phase: "keypad", mode: stage.mode })}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stories — par-dessus tout, opt-in */}
      <AnimatePresence>
        {stories && <ThresholdStories onClose={() => setStories(false)} />}
      </AnimatePresence>
    </div>
  );
}
