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
  ArrowRight, BriefcaseBusiness, Building2, Check, CheckCircle2, ChevronDown, ChevronUp, Clock, Crown, Loader2, LogIn, Play, ShieldCheck, X,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { cn } from "@/lib/utils";
import {
  firstNameOf, forgetAccount, maskPhone, readLastAccount, rememberAccount, type LastAccount,
} from "@/lib/kene/last-account";
import { AuroraBackdrop, Eyebrow, GlassCard, Reveal, RevealItem } from "@/components/kene/ui2026";
import { DuafeIcon, KeneEmblem, KeneEmblemLockup, KeneMark, CauriIcon } from "@/components/kene/icons";
import { useKene, type SessionUser } from "@/store/kene";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { isOnline } from "@/lib/kene/ux";
import { DEFAULT_FALLBACK_TENANT_ID } from "@/lib/kene/fallback-catalog";
import { Onboarding } from "./Onboarding";
import { PinKeypad } from "./PinKeypad";
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
            {mode === "client" ? "Bilan Dermo · Dermo Kènè · Boutique" : "Agenda · Caisse · CRM clientes"}
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
  | { phase: "pin"; mode: "client" | "pro"; phone: string; name?: string }
  | { phase: "signin"; mode: "client" | "pro"; phone: string; devCode: string; isResetPin?: boolean };

const SEEN_KEY = "kene-seen";
const pageSlide = {
  initial: { x: 44, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -44, opacity: 0 },
};

export function WelcomeThreshold() {
  const setUser = useKene((s) => s.setUser);
  const setProTenantId = useKene((s) => s.setProTenantId);
  const setSpace = useKene((s) => s.setSpace);
  const [stage, setStage] = useState<Stage>({ phase: "landing" });
  const [keypadMode, setKeypadMode] = useState<"client" | "pro">("client");
  const [keypadDigits, setKeypadDigits] = useState("");
  const [entering, setEntering] = useState<"client" | "pro" | null>(null);
  const [stories, setStories] = useState(false);
  const [last, setLast] = useState<LastAccount | null>(null);
  const [exploring, setExploring] = useState(false);
  const [first, setFirst] = useState(true);
  const [pricingTab, setPricingTab] = useState<"pro" | "client">("pro");
  const [showFullMatrix, setShowFullMatrix] = useState(false);
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

    // Si on arrive depuis la page /pin ou avec un numéro pré-rempli
    try {
      const p = new URLSearchParams(window.location.search);
      const queryPhone = p.get("phone");
      const targetMode = (p.get("mode") as "client" | "pro") || "client";
      if (p.get("resetPin") === "1" && queryPhone) {
        setKeypadMode(targetMode);
        void requestOtp(queryPhone).then((devCode) => {
          setStage({ phase: "signin", mode: targetMode, phone: queryPhone, devCode, isResetPin: true });
        });
      } else if (queryPhone) {
        setKeypadMode(targetMode);
        void requestOtp(queryPhone).then((devCode) => {
          setStage({ phase: "signin", mode: targetMode, phone: queryPhone, devCode });
        });
      }
    } catch {
      /* ignore */
    }

    return () => {
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
    };
  }, []);

  function activateOfflineProSession(phoneNum?: string) {
    const offlineUser: SessionUser = {
      id: "pro_offline_manager",
      name: last?.name || "Déborah (Gérante - Hors-ligne)",
      phone: phoneNum || last?.phone || "+2250504195071",
      role: "pro",
      employeeRole: "manager",
      tenantId: DEFAULT_FALLBACK_TENANT_ID,
    };
    setUser(offlineUser);
    setProTenantId(DEFAULT_FALLBACK_TENANT_ID);
    setSpace("pro");
    toast.success("Mode Hors-ligne activé : Espace Institut & Caisse POS ouverts 📴");
  }

  function enterPortal(mode: "client" | "pro") {
    if (entering) return;
    if (mode === "pro" && !isOnline()) {
      activateOfflineProSession();
      return;
    }
    setEntering(mode);
    enterTimer.current = window.setTimeout(() => {
      setEntering(null);
      setKeypadMode(mode);
      setStage({ phase: "keypad", mode });
    }, 320);
  }

  async function startReconnect(acc: LastAccount) {
    if (acc.role === "admin") {
      window.location.href = "/console";
      return;
    }
    const phone = acc.phone.startsWith("+") ? acc.phone : `+225${acc.phone.replace(/\D/g, "")}`;
    const mode = acc.role === "pro" ? "pro" : "client";

    // Vérifie si le compte possède un code secret configuré
    try {
      const check = await apiPost<{ ok: boolean; exists: boolean; hasPin: boolean; name?: string; role?: string; isEmployee?: boolean }>(
        "/api/auth/check-phone",
        { phone }
      );
      const effectiveMode = check.role === "pro" || check.isEmployee || mode === "pro" ? "pro" : "client";
      if (check.exists && check.hasPin) {
        // Bascule directe in-place vers la saisie du PIN (zéro rechargement ni redirection)
        setStage({ phase: "pin", mode: effectiveMode, phone, name: check.name ?? acc.name });
        return;
      }
    } catch {
      // Repli sur le flux normal
    }

    const d = acc.phone.replace(/\D/g, "").replace(/^225/, "").slice(0, 10);
    setKeypadDigits(d);
    setKeypadMode(mode);
    setStage({ phase: "keypad", mode });
  }

  async function onKeypadConfirm(digits: string) {
    const phone = `+225${digits}`;
    try {
      // 1) Vérifie si le compte existe et a un code secret PIN
      const check = await apiPost<{
        ok: boolean;
        exists: boolean;
        hasPin: boolean;
        name?: string;
        isPinLocked?: boolean;
        role?: string;
        isEmployee?: boolean;
        employeeRole?: string;
        tenant?: { id: string; name: string };
      }>("/api/auth/check-phone", { phone });

      // Auto-détection du mode : si le numéro appartient à un compte pro ou employé, basculer AUTOMATIQUEMENT en mode "pro" !
      const effectiveMode: "client" | "pro" =
        check.role === "pro" || check.isEmployee || keypadMode === "pro" ? "pro" : "client";

      if (check.exists && check.hasPin) {
        // Compte avec code PIN -> bascule in-place directe vers la saisie du PIN
        setStage({ phase: "pin", mode: effectiveMode, phone, name: check.name });
        return;
      }

      // 2) Nouveau compte ou compte sans code secret -> envoi SMS OTP pour création / initialisation
      const devCode = await requestOtp(phone);
      setStage({ phase: "signin", mode: effectiveMode, phone, devCode });
      if (devCode) {
        toast.info("Code instantané affiché à l'écran");
      } else {
        toast.success("Code envoyé par SMS");
      }
    } catch (e) {
      const isNetwork = !isOnline() || (e instanceof Error && /network|fetch|offline|hors-ligne/i.test(e.message));
      if (isNetwork && keypadMode === "pro") {
        activateOfflineProSession(phone);
        return;
      }
      otpErrorToast(e);
    }
  }

  async function handlePinConfirm(pin: string, phone: string, mode: "client" | "pro"): Promise<boolean> {
    try {
      const res = await apiPost<{
        ok: boolean;
        user: ApiUser;
        tenant: { id: string; name: string } | null;
        employeeRole?: string | null;
      }>("/api/auth/login", { phone, pin });

      const isPro = res.user.role === "pro" || Boolean(res.employeeRole) || Boolean(res.tenant?.id);
      const targetRole = res.user.role === "admin" ? "admin" : isPro ? "pro" : "client";

      rememberAccount({
        phone,
        name: res.user.name,
        role: targetRole,
      });

      const sessionUser: SessionUser = {
        ...res.user,
        role: targetRole,
        employeeRole: res.employeeRole ?? null,
      };

      setUser(sessionUser);
      if (res.tenant?.id) {
        setProTenantId(res.tenant.id);
      }
      const targetSpace = targetRole === "admin" ? "admin" : isPro ? "pro" : "client";
      setSpace(targetSpace);

      toast.success(
        res.employeeRole
          ? `Bienvenue ${res.user.name.split(" ")[0]} — « ${res.tenant?.name ?? "Espace Pro"} » t'attend`
          : `Bienvenue ${res.user.name.split(" ")[0]} 💛`
      );
      return true;
    } catch (e) {
      const isNetwork = !isOnline() || (e instanceof Error && /network|fetch|offline|hors-ligne/i.test(e.message));
      if (isNetwork && (mode === "pro" || keypadMode === "pro")) {
        activateOfflineProSession(phone);
        return true;
      }
      toast.error(e instanceof Error ? e.message : "Code secret incorrect");
      return false;
    }
  }

  async function handleForgotPin(phone: string, mode: "client" | "pro") {
    try {
      toast.info("Envoi d'un code de vérification SMS...");
      const devCode = await requestOtp(phone);
      setStage({ phase: "signin", mode, phone, devCode, isResetPin: true });
      if (devCode) {
        toast.info("Code instantané affiché à l'écran");
      } else {
        toast.success("Code de vérification envoyé par SMS");
      }
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
            {/* Conteneur principal responsive multi-mode :
                - Mobile (< 768px) : max-w-[560px], flux vertical optimisé
                - Tablette (768px - 1023px) : max-w-3xl, 2 cols pour portails, 3 cols pour tarifs
                - PC / Bureau (>= 1024px) : max-w-6xl / 7xl, split-screen majestueux (Hero à gauche, Portails à droite), Navette médiane, 3 cols pour tarifs
            */}
            <div className="mx-auto flex w-full max-w-[560px] md:max-w-3xl lg:max-w-6xl xl:max-w-7xl flex-1 flex-col px-4 sm:px-6 lg:px-8 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:pt-6 pb-6">

              {/* ── En-tête / Marque & Sélecteur d'interfaces ── */}
              <Reveal y={12}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <KeneEmblemLockup size={56} labelSize={28} sublabel="Beauté mélanoderme" />

                  {/* Sélecteur d'interfaces & Actions rapides */}
                  <div className="flex items-center gap-2">
                    <SpaceSwitcher variant="compact" />
                    <button
                      onClick={() => setStories(true)}
                      className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-full k-chip px-3.5 text-[11.5px] font-semibold text-foreground/85 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      aria-label="Découvrir Kènè en 30 secondes (stories)"
                    >
                      <Play size={11} className="ml-0.5 text-gold-text" />
                      Découvrir en 30&nbsp;s
                    </button>
                    {!last && (
                      <button
                        onClick={startExploration}
                        disabled={exploring}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary/60 hover:bg-secondary px-3.5 text-[11.5px] font-medium text-foreground transition-colors"
                      >
                        {exploring ? <Loader2 size={12} className="animate-spin" /> : <CauriIcon size={12} className="text-gold-text" />}
                        <span className="hidden xs:inline">Explorer sans inscription</span>
                        <span className="xs:hidden">Démo</span>
                      </button>
                    )}
                  </div>
                </div>
              </Reveal>

              {/* ── ZONE HAUTE : Hero & Portails (Adaptatif selon mode) ──
                  - Mobile : Hero puis Portails l'un sous l'autre
                  - Tablette : Hero centré puis Portails en 2 colonnes en dessous
                  - PC : Split Screen 2 Colonnes côte à côte (Hero 7 cols / Portails 5 cols)
              */}
              <div className="mt-4 sm:mt-6 lg:mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center">
                {/* Bloc Hero (Gauche sur PC) */}
                <section className="relative lg:col-span-7 flex flex-col justify-center" aria-label="Promesse Kènè">
                  {/* Lumière dorée localisée */}
                  <div
                    className="pointer-events-none absolute -inset-x-5 -top-6 h-[130%]"
                    style={{
                      backgroundImage:
                        "radial-gradient(58% 52% at 16% 10%, color-mix(in srgb, #C8951E 20%, transparent) 0%, transparent 70%), radial-gradient(46% 42% at 92% 26%, color-mix(in srgb, #A0522D 15%, transparent) 0%, transparent 66%), radial-gradient(64% 55% at 55% 112%, color-mix(in srgb, #8B1A3B 11%, transparent) 0%, transparent 72%)",
                    }}
                    aria-hidden="true"
                  />
                  {/* Filigrane Duafe */}
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-7 -top-7 text-[140px] opacity-[0.055] sm:text-[190px] lg:text-[230px]"
                    animate={{ y: [0, -9, 0], rotate: [0, 1.5, 0] }}
                    transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
                    style={{ color: "var(--gold-text)" }}
                  >
                    <KeneMark size={160} />
                  </motion.span>

                  <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * d, duration: 0.5 }}>
                    <Eyebrow>
                      Akwaba · {greet} à Kènè
                    </Eyebrow>
                  </motion.div>
                  <h1 className="mt-2 font-heading text-[30px] font-black leading-[1.04] tracking-tight text-foreground sm:text-[38px] lg:text-[46px] xl:text-[50px]">
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
                  <motion.p className="mt-3 max-w-[48ch] text-[12.5px] sm:text-[13.5px] lg:text-[14px] leading-relaxed text-muted-foreground"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.62 * d }}>
                    Bilan dermo-biométrique, coach Dermo Kènè, boutique botanique et instituts partenaires —
                    pensés pour les teints Fitzpatrick&nbsp;IV–VI.
                  </motion.p>
                  <div className="flex sm:hidden items-center gap-2 mt-4">
                    <motion.button
                      onClick={() => setStories(true)}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.72 * d }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full k-chip px-4 text-[12.5px] font-semibold text-foreground/85 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      aria-label="Découvrir Kènè en 30 secondes (stories)"
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-full k-btn-gold text-primary-foreground" aria-hidden="true">
                        <Play size={11} className="ml-0.5" />
                      </span>
                      Découvrir Kènè en 30&nbsp;s
                    </motion.button>
                  </div>

                  {/* Reconnexion express sur grand écran si présente */}
                  <AnimatePresence initial={false}>
                    {last && (
                      <div className="mt-4 hidden lg:block">
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
                              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full k-btn-gold px-4 text-[11.5px] font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                              <LogIn size={13} />
                              Reprendre
                            </button>
                            <button onClick={() => { forgetAccount(); setLast(null); }}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                              aria-label="Oublier ce numéro sur cet appareil">
                              <X size={14} />
                            </button>
                          </div>
                        </GlassCard>
                      </div>
                    )}
                  </AnimatePresence>
                </section>

                {/* Bloc Portails (Droite sur PC, au-dessous du Hero sur mobile/tablette) */}
                <div className="lg:col-span-5 flex flex-col gap-3 sm:gap-4">
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
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
                </div>
              </div>

              {/* ── Reconnexion express sur Mobile & Tablette ── */}
              <AnimatePresence initial={false}>
                {last && (
                  <div className="mt-4 lg:hidden">
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
                          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full k-btn-gold px-3.5 text-[11.5px] font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                          <LogIn size={13} />
                          Reprendre
                        </button>
                        <button onClick={() => { forgetAccount(); setLast(null); }}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                          aria-label="Oublier ce numéro sur cet appareil">
                          <X size={14} />
                        </button>
                      </div>
                    </GlassCard>
                  </div>
                )}
              </AnimatePresence>



              {/* ── Les Tarifs & Abonnements Kènè (Section Éditoriale Complète) ── */}
              <div className="mt-6 sm:mt-8 lg:mt-10 w-full">
                <section aria-label="Formules et abonnements Kènè">
                  <GlassCard grain className="rounded-[24px] p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5">
                    {/* En-tête des tarifs avec sélecteur d'audience */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <Eyebrow>Transparence & Tarifs Kènè</Eyebrow>
                        <h2 className="font-heading text-lg sm:text-xl font-black text-foreground mt-0.5">
                          Des formules adaptées, sans engagement
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Règlement direct Mobile Money (Wave, Orange Money, MTN) · Zéro prélèvement bancaire automatique
                        </p>
                      </div>

                      {/* Onglets Pro vs Client */}
                      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/50 border border-border/60 self-start sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => setPricingTab("pro")}
                          className={cn(
                            "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
                            pricingTab === "pro"
                              ? "k-btn-gold text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          🏢 Pour les Instituts (30j offerts)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPricingTab("client")}
                          className={cn(
                            "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
                            pricingTab === "client"
                              ? "k-btn-gold text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          🌸 Pour les Clientes
                        </button>
                      </div>
                    </div>

                    {/* Contenu selon l'onglet choisi */}
                    {pricingTab === "pro" ? (
                      <div className="space-y-4">
                        {/* Bannière Pass Découverte 30 jours */}
                        <div className="rounded-2xl border-l-4 border-l-gold bg-gold/10 p-3.5 sm:p-4 text-xs space-y-1.5">
                          <div className="flex items-center gap-2.5">
                            <span className="grid place-items-center h-7 w-7 rounded-lg bg-gold/20 text-gold-text shrink-0">
                              <Clock size={16} />
                            </span>
                            <p className="font-heading font-bold text-foreground text-sm">
                              30 jours offerts pour tout nouvel établissement
                            </p>
                          </div>
                          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                            Le plan <strong>Essentiel (15 000 FCFA)</strong> est offert d&apos;office pendant 30 jours. Vous configurez votre institut, testez la caisse enregistreuse, la prise de rendez-vous en ligne, le stock et les fiches clientes sans carte bancaire et sans aucun prélèvement surprise.
                          </p>
                        </div>

                        {/* Grille des 2 offres Entreprise : Essentiel & Complexe */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Carte Essentiel */}
                          <div className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5 flex flex-col justify-between space-y-4">
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[16px] sm:text-[17px] font-bold">Pro Essentiel</span>
                                <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[10px] font-bold text-gold-text">
                                  30 jours offerts
                                </span>
                              </div>
                              <p className="text-[11.5px] text-muted-foreground leading-snug">
                                Idéal pour les salons indépendants, esthéticiennes installées et instituts de quartier (1 établissement).
                              </p>
                              <div className="flex items-baseline gap-1.5 pt-1">
                                <span className="font-mono text-2xl font-black text-gold-text">15 000</span>
                                <span className="text-xs text-muted-foreground font-semibold">FCFA / mois après les 30 jours offerts</span>
                              </div>
                              <ul className="space-y-2 text-xs pt-2">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Agenda en ligne 24/7</strong> : Prise de rendez-vous autonome par vos clientes</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Caisse POS tactile</strong> : Ventes, encaissements et tickets Bluetooth</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>CRM Clientes 360°</strong> : Fiches, historique de soin et relances</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Stock séparé</strong> : Distinction nette Revente Boutique vs Cabine</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Diagnostics IA en cabine</strong> : Analyses assistées par le Dr Kènè</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => enterPortal("pro")}
                              className="w-full h-11 rounded-xl k-chip hover:bg-muted text-xs font-bold flex items-center justify-center gap-2 transition-all"
                            >
                              <span>Démarrer le Pass Pro (30j offerts)</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>

                          {/* Carte Complexe */}
                          <div className="rounded-2xl border border-gold/50 bg-gold/10 p-4 sm:p-5 flex flex-col justify-between space-y-4 relative">
                            <span className="absolute -top-2.5 right-4 rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-bold shadow">
                              Recommandé structures & réseaux
                            </span>
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[16px] sm:text-[17px] font-bold">Pro Complexe</span>
                              </div>
                              <p className="text-[11.5px] text-muted-foreground leading-snug">
                                Pour les établissements avec personnel déclaré, cliniques dermo, spas ou réseaux multi-succursales.
                              </p>
                              <div className="flex items-baseline gap-1.5 pt-1">
                                <span className="font-mono text-2xl font-black text-gold-text">45 000</span>
                                <span className="text-xs text-muted-foreground font-semibold">FCFA / mois</span>
                              </div>
                              <ul className="space-y-2 text-xs pt-2">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Tout le plan Essentiel</strong> inclus</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Paie sociale déclarative</strong> : CNPS (Côte d&apos;Ivoire) / IPRES & IPM (Sénégal)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Comptabilité SYSCOHADA</strong> : Plan de comptes OHADA, Journal, Bilan</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Multi-établissements</strong> : Pilotez plusieurs succursales depuis un seul compte</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => enterPortal("pro")}
                              className="w-full h-11 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold flex items-center justify-center gap-2"
                            >
                              <Crown size={14} />
                              <span>Découvrir l&apos;espace Pro</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Onglet Clientes : Gratuit vs Kènè+ */
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Carte Gratuit */}
                          <div className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5 flex flex-col justify-between space-y-4">
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[16px] sm:text-[17px] font-bold">Compte Gratuit</span>
                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                                  Inclus à vie
                                </span>
                              </div>
                              <p className="text-[11.5px] text-muted-foreground leading-snug">
                                Pour toutes celles qui souhaitent prendre soin de leur peau et réserver leurs soins en salon.
                              </p>
                              <div className="flex items-baseline gap-1.5 pt-1">
                                <span className="font-mono text-2xl font-black text-foreground">0</span>
                                <span className="text-xs text-muted-foreground font-semibold">FCFA · Gratuit pour toujours</span>
                              </div>
                              <ul className="space-y-2 text-xs pt-2">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>1 Bilan dermo-biométrique complet par mois</strong> (score, type et zone)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Conseils bienveillants Dermo Kènè</strong> (phytothérapie ouest-africaine)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Prise de RDV instantanée</strong> dans les instituts partenaires</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Boutique de cosmétiques botaniques</strong> (karité de Korhogo, moringa, baobab)</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => enterPortal("client")}
                              className="w-full h-11 rounded-xl k-chip hover:bg-muted text-xs font-bold flex items-center justify-center gap-2 transition-all"
                            >
                              <span>Accéder gratuitement</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>

                          {/* Carte Kènè+ */}
                          <div className="rounded-2xl border border-gold/50 bg-gold/10 p-4 sm:p-5 flex flex-col justify-between space-y-4 relative">
                            <span className="absolute -top-2.5 right-4 rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-bold shadow">
                              Pass Dermo Privilège
                            </span>
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[16px] sm:text-[17px] font-bold">Pass Kènè+</span>
                              </div>
                              <p className="text-[11.5px] text-muted-foreground leading-snug">
                                Pour celles qui traitent des taches pigmentaires, de l&apos;acné ou souhaitent un suivi dermo intensif.
                              </p>
                              <div className="flex items-baseline gap-1.5 pt-1">
                                <span className="font-mono text-2xl font-black text-gold-text">2 500</span>
                                <span className="text-xs text-muted-foreground font-semibold">FCFA / mois</span>
                              </div>
                              <ul className="space-y-2 text-xs pt-2">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Diagnostics IA illimités</strong> : Scannez vos zones sans aucune restriction</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Courbe d&apos;évolution & avant/après</strong> pour mesurer vos progrès</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Dermo Kènè prioritaire</strong> avec rituels beauté personnalisés</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-success mt-0.5 shrink-0" />
                                  <span><strong>Passeport de Peau 360°</strong> partagé avec votre esthéticienne en cabine</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => enterPortal("client")}
                              className="w-full h-11 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold flex items-center justify-center gap-2"
                            >
                              <Crown size={14} />
                              <span>Rejoindre Kènè+</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bouton pour afficher/masquer le tableau comparatif complet */}
                    <div className="pt-2 border-t border-border/40 text-center">
                      <button
                        type="button"
                        onClick={() => setShowFullMatrix(!showFullMatrix)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline underline-offset-4"
                      >
                        <span>{showFullMatrix ? "Masquer la matrice comparative" : "Voir le tableau comparatif détaillé de toutes les formules"}</span>
                        {showFullMatrix ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>

                    {/* Matrice comparative détaillée */}
                    {showFullMatrix && (
                      <div className="pt-2 overflow-x-auto">
                        {pricingTab === "client" ? (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-border/60">
                                <th className="py-2.5 px-3 font-bold text-muted-foreground">Privilèges Beauté &amp; Soins</th>
                                <th className="py-2.5 px-2 font-bold text-center w-28 text-muted-foreground">Compte Gratuit</th>
                                <th className="py-2.5 px-2 font-bold text-center w-32 text-gold-text">Pass Kènè+</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Bilan de peau par IA photo</td>
                                <td className="py-2.5 px-2 text-center text-muted-foreground">1 / mois</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">⭐ Illimité</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Dermo Kènè IA (Conseils dermo-botaniques)</td>
                                <td className="py-2.5 px-2 text-center text-muted-foreground">Standard</td>
                                <td className="py-2.5 px-2 text-center text-gold-text font-bold">⭐ Prioritaire &amp; Illimité</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Réservation de soins &amp; Acompte en ligne</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Boutique cosmétiques des instituts</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Suivi d&apos;évolution &amp; Progrès cutanés</td>
                                <td className="py-2.5 px-2 text-center text-muted-foreground">Dernier bilan</td>
                                <td className="py-2.5 px-2 text-center text-gold-text font-bold">⭐ Historique J+14, J+30, J+60</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Passeport de Peau &amp; Pass Cabine QR</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-border/60">
                                <th className="py-2.5 px-3 font-bold text-muted-foreground">Outils de Gestion Institut</th>
                                <th className="py-2.5 px-2 font-bold text-center w-32 text-terre">Pro Essentiel</th>
                                <th className="py-2.5 px-2 font-bold text-center w-32 text-gold-text">Pro Complexe</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Agenda en ligne &amp; Réservations 24/7</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Caisse tactile &amp; Tickets de caisse</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Diagnostics IA en cabine &amp; Fiches clientes</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Cabine illimité</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Cabine illimité</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Gestion du stock (Revente vs Cabine)</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Commissions praticiennes &amp; Clôture Rapport Z</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-success font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Paie sociale déclarative (CNPS CI / IPRES SN)</td>
                                <td className="py-2.5 px-2 text-center text-muted-foreground">— Non inclus</td>
                                <td className="py-2.5 px-2 text-center text-gold-text font-bold">⭐ Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Comptabilité financière (SYSCOHADA)</td>
                                <td className="py-2.5 px-2 text-center text-muted-foreground">— Non inclus</td>
                                <td className="py-2.5 px-2 text-center text-gold-text font-bold">⭐ Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Multi-établissements &amp; Succursales</td>
                                <td className="py-2.5 px-2 text-center text-muted-foreground">1 établissement</td>
                                <td className="py-2.5 px-2 text-center text-gold-text font-bold">⭐ Multi-succursales</td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* Garantie de réassurance sous les tarifs */}
                    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground pt-1">
                      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                      <span>
                        <strong>Garantie sans engagement :</strong> Tous les paiements s&apos;effectuent par Mobile Money direct (Wave, Orange Money, MTN MoMo). Aucun numéro de carte bancaire n&apos;est enregistré et aucun débit automatique n&apos;est effectué sans votre confirmation expresse.
                      </span>
                    </p>
                  </GlassCard>
                </section>
              </div>

              {/* ── Exploration (mobile) & Mentions Légales ── */}
              <div className="mt-auto pt-4 sm:pt-6 flex flex-col items-center gap-2 text-center">
                {!last && (
                  <button
                    onClick={startExploration}
                    disabled={exploring}
                    className="sm:hidden flex min-h-11 items-center gap-2 rounded-full px-4 text-[12px] font-semibold text-foreground/75 underline underline-offset-4 decoration-dotted hover:text-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {exploring ? <Loader2 size={14} className="animate-spin" /> : <CauriIcon size={14} aria-hidden="true" />}
                    Explorer Kènè — sans inscription
                  </button>
                )}
                <p className="text-[10.5px] sm:text-[11.5px] leading-relaxed text-muted-foreground">
                  Données chiffrées, jamais revendues · En continuant, tu acceptes les conditions Kènè.
                </p>
              </div>

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
              onOfflineBypass={() => activateOfflineProSession(keypadDigits ? `+225${keypadDigits}` : undefined)}
            />
          </motion.div>
        )}

        {stage.phase === "pin" && (
          <motion.div key="pin" {...pageSlide} transition={{ duration: 0.3 }}>
            <PinKeypad
              phone={stage.phone}
              name={stage.name}
              mode={stage.mode}
              onConfirm={(pin) => handlePinConfirm(pin, stage.phone, stage.mode)}
              onBack={() => setStage({ phase: "keypad", mode: stage.mode })}
              onForgotPin={() => handleForgotPin(stage.phone, stage.mode)}
              onOfflineBypass={() => activateOfflineProSession(stage.phone)}
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
              isResetPin={stage.isResetPin}
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

