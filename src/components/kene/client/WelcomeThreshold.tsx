"use client";
// Kènè — LE SEUIL: la page d'accueil d'avant-portails, refonte totale.
//
// Ce qui change par rapport aux anciennes pages d'entrée (intro forcée +
// portes marketing + connexion classique) — inspirations assumées:
// • Linear / Locomotive (hero éditorial géant, lumière vivante, zéro bruit)
// • Instagram / TikTok (stories OPT-IN « Découvrir en 30 s » — plus aucune
// intro imposée: la découverte accompagne, elle ne retient pas)
// • Cash App / N26 (pavé numérique natif plein cadre — aucune friction OS)
// • Fenty / Glossier (portails image plein cadre, typographie éditoriale)
//
// Architecture: UNE page, TROIS états (landing → keypad → signin). Le
// pavé appelle lui-même /api/auth/otp/request puis monte l'Onboarding
// DIRECTEMENT à l'étape OTP (pont initialStep/initialDevCode — additif).
// La reconnexion express garde la mémoire locale kene-last-account.
// Copie FR directe (précédent 71-c/73: le marketing d'entrée reste hors i18n).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, BriefcaseBusiness, Loader2, LogIn, Play, Sparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet } from "@/lib/kene/api";
import {
  firstNameOf, forgetAccount, maskPhone, readLastAccount, type LastAccount,
} from "@/lib/kene/last-account";
import { AuroraBackdrop, Eyebrow, GlassCard, Reveal, RevealItem } from "@/components/kene/ui2026";
import { DuafeIcon, KeneEmblem, KeneMark } from "@/components/kene/icons";
import { useKene, type SessionUser } from "@/store/kene";
import { LoomSection } from "@/components/kene/loom/LoomSection";
import { Onboarding } from "./Onboarding";
import { PhoneKeypad, otpErrorToast, requestOtp } from "./PhoneKeypad";
import { ThresholdStories } from "./ThresholdStories";
import { type ApiUser } from "./types";

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
      className="group relative block h-[112px] w-full overflow-hidden rounded-[20px] text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary min-[480px]:h-[138px] md:h-[180px]"
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
      <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#140E08]/60 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#FFF9EC] ring-1 ring-[#FFF9EC]/25">
        {icon}
        {kicker}
      </span>

      {/* Titre + CTA */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2.5 p-3 sm:p-4">
        <div className="min-w-0">
          <p className="font-heading text-[15px] font-black leading-tight text-[#FFF9EC] sm:text-[17px] md:text-[19px]">{title}</p>
          <p className="mt-1 hidden text-[10.5px] text-[#FFF9EC]/75 sm:block">
            {mode === "client" ? "Diagnostic IA · Dr. Kènè · Boutique" : "Agenda · Caisse · CRM clientes"}
          </p>
        </div>
        <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full k-btn-gold px-3.5 text-[11px] font-bold text-primary-foreground">
          Entrer
          <ArrowRight size={12} className="transition-transform duration-300 group-hover:translate-x-0.5" />
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
  const [exploring, setExploring] = useState(false);
  const [first, setFirst] = useState(true);
  const enterTimer = useRef<number | null>(null);

  // Première visite? (raccourcit la chorégraphie d'arrivée au retour).
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
      toast.success("Ton code est prêt — saisis-le ci-dessous");
    } catch (e) {
      otpErrorToast(e);
    }
  }

  async function startExploration() {
    if (exploring) return;
    setExploring(true);
    try {
      // — UNE requête GET: l'accès express ne dépend d'AUCUN POST. Chez
      // l'utilisatrice réelle (préview iframe), les POST sortants sont bloqués
      // ou pendus en amont du serveur — ses GET traversent toujours. La route
      // /api/auth/express fait le login complet côté serveur et répond exactement
      // comme otp/verify ({ user, tenant } + cookie de session).
      const v = await apiGet<{ user: ApiUser; tenant: { id: string; name: string } | null }>("/api/auth/express");
      // Mémoire locale — survit à la déconnexion, jamais envoyée.
      try {
        localStorage.setItem("kene-last-account", JSON.stringify({ phone: "+2250701020304", name: v.user.name, role: v.user.role === "pro" || v.user.role === "admin" ? v.user.role : "client" }));
      } catch { /* non bloquant */ }
      setUser(v.user as SessionUser);
      toast.success(`Bienvenue ${v.user.name.split(" ")[0]} 💛`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connexion impossible — réessaie");
    } finally {
      setExploring(false);
    }
  }

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const d = first ? 1 : 0.3; // multiplicateur de délai (retour = plus vif)

  return (
    <div className="relative isolate min-h-dvh w-full overflow-x-clip">
      <AuroraBackdrop />
      <AnimatePresence mode="wait" initial={false}>
        {stage.phase === "landing" && (
          <motion.div key="landing" {...pageSlide} transition={{ duration: 0.3 }} className="flex w-full min-h-dvh flex-col">
            {/* Colonne éditoriale haute: marque + hero.: la
 landing tient sur UNE page — espacements et tailles resserrés. */}
            <div className="mx-auto flex w-full max-w-[560px] flex-col px-5 pt-4 sm:px-6 sm:pt-6">
            {/* ── Marque ── Sceau Kènè: l'art d'or se pose sans
 couture sur le fond de page + wordmark éditorial serré ── */}
            <Reveal y={12}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <KeneEmblem size={56} className="drop-shadow-[0_2px_10px_rgba(200,149,30,0.18)]" />
                  <span className="flex min-w-0 flex-col items-start leading-none">
                    <span className="font-heading text-[21px] font-black leading-[1.05] tracking-[0.02em] text-foreground">
                      Kènè
                    </span>
                    <span className="mt-[7px] text-[8px] font-semibold uppercase tracking-[0.24em] whitespace-nowrap text-muted-foreground">
                      Beauté mélanoderme
                    </span>
                  </span>
                </span>
              </div>
            </Reveal>

            {/* ── Hero éditorial + fils de kente ── */}
            <section className="relative mt-4 sm:mt-5" aria-label="Promesse Kènè">
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
                className="pointer-events-none absolute -right-7 -top-7 text-[140px] opacity-[0.055] sm:text-[190px]"
                animate={{ y: [0, -9, 0], rotate: [0, 1.5, 0] }}
                transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
                style={{ color: "var(--gold-text)" }}
              >
                <KeneMark size={140} />
              </motion.span>

              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * d, duration: 0.5 }}>
                <Eyebrow>
                  {greet} ✨ Bienvenue à Kènè
                </Eyebrow>
              </motion.div>
              <h1 className="mt-2 font-heading text-[30px] font-black leading-[1.04] tracking-tight text-foreground sm:text-[38px]">
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
              <motion.p className="mt-3 max-w-[42ch] text-[12.5px] leading-relaxed text-muted-foreground"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.62 * d }}>
                Diagnostic IA vision, coach Dr. Kènè, boutique botanique et instituts partenaires —
                pensés pour les teints Fitzpatrick&nbsp;IV–VI.
              </motion.p>
              <motion.button
                onClick={() => setStories(true)}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.72 * d }}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full k-chip px-4 text-[12.5px] font-semibold text-foreground/85 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                aria-label="Découvrir Kènè en 30 secondes (stories)"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full k-btn-gold text-primary-foreground" aria-hidden="true">
                  <Play size={11} className="ml-0.5" />
                </span>
                Découvrir Kènè en 30&nbsp;s
                <span className="text-[10px] text-muted-foreground">· facultatif</span>
              </motion.button>
            </section>
            </div>

            {/* ── La Navette d'Or: bande tissée COMPACTE
 pleine largeur (~92-110 px), identique dans les deux modes —
 la landing tient sur UNE seule page. Le chapitre 3D scrollé
 est retiré de la porte d'entrée; le message du
 pagne reste porté par les fils d'or animés. ── */}
            <LoomSection first={first} />

            {/* Colonne éditoriale basse: reconnexion, portails,
 exploration, mentions. flex-1 → les mentions restent au bas
 de LA page unique (pied de page collant, écrans hauts). */}
            <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 pb-4 sm:px-6">

            {/* ── Reconnexion express: rangée compacte (la carte de
 200 px est devenue une ligne « reprendre »; les portails
 ci-dessous offrent déjà « utiliser un autre numéro »). ── */}
            <AnimatePresence initial={false}>
              {last && (
                <RevealItem className="mt-4">
                  <GlassCard hero grain className="rounded-[20px] p-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full k-cta text-[15px] font-heading font-black text-[#FFF9EC]" aria-hidden="true">
                        {firstNameOf(last.name).slice(0, 1).toUpperCase() || "K"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-[13.5px] font-bold leading-tight">
                          {greet}, {firstNameOf(last.name) || "bienvenue"} 👋
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                          {maskPhone(last.phone)} · {last.role === "pro" ? "Espace entreprise" : last.role === "admin" ? "Console Kènè" : "Espace cliente"}
                        </p>
                      </div>
                      <button onClick={() => startReconnect(last)}
                        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full k-btn-gold px-4 text-[11.5px] font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                        <LogIn size={13} />
                        Reprendre
                      </button>
                      <button onClick={() => { forgetAccount(); setLast(null); }}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label="Oublier ce numéro sur cet appareil">
                        <X size={14} />
                      </button>
                    </div>
                  </GlassCard>
                </RevealItem>
              )}
            </AnimatePresence>

            {/* ── LES DEUX PORTAILS ──: côte à côte dès 480 px (la
 page unique a besoin de hauteur), empilés sous 480 (téléphones) */}
            <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
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

            {/* ── Exploration · légal — les puces de confiance sont fondues
 dans la ligne légale — une seule page, zéro redite) ── */}
            {!last && (
              <RevealItem className="mt-3">
                <button
                  onClick={startExploration}
                  disabled={exploring}
                  className="mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-[12px] font-semibold text-foreground/75 underline underline-offset-4 decoration-dotted hover:text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {exploring ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} aria-hidden="true" />}
                  Explorer Kènè — sans inscription
                </button>
              </RevealItem>
            )}
            <p className="mt-auto pt-3 text-center text-[10.5px] leading-relaxed text-muted-foreground">
              Données chiffrées, jamais revendues · En continuant, tu acceptes les conditions Kènè.
            </p>
            </div>
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

