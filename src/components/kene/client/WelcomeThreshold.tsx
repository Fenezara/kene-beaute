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
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, Camera, Check, CheckCircle2, ChevronDown, ChevronUp, Clock, Crown, Droplets, Heart, Leaf, Loader2, LogIn, Play, ShieldCheck, Sparkles, Star, UserCheck, X,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { cn } from "@/lib/utils";
import {
  firstNameOf, forgetAccount, maskPhone, readLastAccount, rememberAccount, type LastAccount,
} from "@/lib/kene/last-account";
import { AuroraBackdrop, Eyebrow, GlassCard, Reveal, RevealItem } from "@/components/kene/ui2026";
import { DuafeIcon, KeneEmblem, KeneEmblemLockup, KeneMark, CauriIcon, NsorommaIcon, KeneSunIcon, BissapFlowerIcon } from "@/components/kene/icons";
import { useKene, type SessionUser, type ClientTab } from "@/store/kene";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { isOnline } from "@/lib/kene/ux";
import { DEFAULT_FALLBACK_TENANT_ID } from "@/lib/kene/fallback-catalog";
import { Onboarding } from "./Onboarding";
import { PinKeypad } from "./PinKeypad";
import { PhoneKeypad, otpErrorToast, requestOtp } from "./PhoneKeypad";
import { ThresholdStories } from "./ThresholdStories";
import { type ApiUser } from "./types";
import { createHumanPayload } from "@/components/kene/auth/BotHoneypot";
import { BeforeAfterSlider } from "@/components/kene/evolution/BeforeAfterSlider";
import { SmartInstallBar } from "@/components/kene/pwa/SmartInstallBar";

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
      className="group relative block h-[112px] w-full overflow-hidden rounded-[22px] text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary min-[480px]:h-[138px] md:h-[180px]"
      style={{
        boxShadow: mode === "pro"
          ? "inset 0 2px 3px rgba(255,255,255,0.45), inset 0 -2px 5px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(212,154,36,0.55), 0 20px 48px -16px rgba(200,149,30,0.40)"
          : "inset 0 2px 3px rgba(255,255,255,0.45), inset 0 -2px 5px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(212,154,36,0.42), 0 20px 48px -16px rgba(26,18,12,0.65)",
      }}
    >
      {/* Image plein cadre + voile dégradé Afro-Luxe (lisibilité et profondeur) */}
      <img
        src={img}
        alt={imgAlt}
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#100C08]/92 via-[#100C08]/42 to-[#100C08]/15" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#100C08]/60 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-inset ring-white/20 group-hover:ring-gold/60 transition-all" />

      {/* Badge espace — Signature royale or & nacre */}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#140E08]/80 backdrop-blur-md px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-text border border-gold/40 shadow-sm">
        {icon}
        {kicker}
      </span>

      {/* Titre + CTA */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3.5 sm:p-4.5">
        <div className="min-w-0">
          <p className="font-heading text-[16px] font-black leading-tight text-[#FFF9EC] sm:text-[18px] md:text-[20px] drop-shadow-sm">{title}</p>
          <p className="mt-1 hidden text-[11px] font-medium text-[#FFF9EC]/80 sm:block">
            {mode === "client" ? "Dermo Kènè · Bilan cutané · Ordonnance & RDV" : "Caisse POS · Agenda cabine · CRM & SYSCOHADA"}
          </p>
        </div>
        <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full k-btn-gold px-4 text-[11.5px] font-black text-primary-foreground shadow-md transition-transform duration-200 group-hover:scale-105 active:scale-95 cursor-pointer">
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
  | { phase: "pin"; mode: "client" | "pro"; phone: string; name?: string; isSetup?: boolean }
  | { phase: "signin"; mode: "client" | "pro"; phone: string; devCode: string; isResetPin?: boolean };

const SEEN_KEY = "kene-seen";
const pageSlide = {
  initial: { x: 44, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -44, opacity: 0 },
};

export function WelcomeThreshold({ onBackToApp }: { onBackToApp?: () => void } = {}) {
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
  const [pricingTab, setPricingTab] = useState<"client" | "pro">("client");
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
      name: last?.name || "Gérante (Hors-ligne)",
      phone: phoneNum || last?.phone || "+2250100000000",
      role: "pro",
      employeeRole: "manager",
      tenantId: DEFAULT_FALLBACK_TENANT_ID,
    };
    rememberAccount({
      phone: offlineUser.phone,
      name: offlineUser.name,
      role: "pro",
    });
    try {
      localStorage.setItem("kene-store", JSON.stringify({
        state: {
          space: "pro",
          user: offlineUser,
          proTenantId: DEFAULT_FALLBACK_TENANT_ID,
          clientTab: "accueil",
          cart: [],
        },
        version: 1,
      }));
    } catch {}
    setUser(offlineUser);
    setProTenantId(DEFAULT_FALLBACK_TENANT_ID);
    setSpace("pro");
    toast.success("Mode Hors-ligne activé : Espace Institut & Caisse POS ouverts 📴");
  }

  function activateOfflineClientSession() {
    const offlineClient: SessionUser = {
      id: last?.phone ? `client_${last.phone.replace(/\D/g, "")}` : "guest_offline",
      name: last?.name || "Invitée Kènè (Hors-ligne)",
      phone: last?.phone || "",
      role: "client",
    };
    setUser(offlineClient);
    setSpace("client");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("kene:start-explore"));
    }
    toast.success("Mode Hors-ligne activé : Espace Beauté & Scanner ouverts 🌸");
  }

  function enterPortal(mode: "client" | "pro") {
    if (entering) return;
    if (mode === "pro" && !isOnline()) {
      activateOfflineProSession();
      return;
    }
    if (mode === "client" && !isOnline()) {
      activateOfflineClientSession();
      return;
    }
    setEntering(mode);
    enterTimer.current = window.setTimeout(() => {
      setEntering(null);
      setKeypadMode(mode);
      setStage({ phase: "keypad", mode });
    }, 320);
  }

  async function startReconnect(acc: LastAccount, explicitTargetMode?: "client" | "pro") {
    if (acc.role === "admin") {
      window.location.href = "/console";
      return;
    }
    const phone = acc.phone.startsWith("+") ? acc.phone : `+225${acc.phone.replace(/\D/g, "")}`;
    const mode = explicitTargetMode ?? (acc.role === "pro" ? "pro" : "client");
    setKeypadMode(mode);

    // Vérifie si le compte possède un code secret configuré
    try {
      const check = await apiPost<{ ok: boolean; exists: boolean; hasPin: boolean; name?: string; role?: string; isEmployee?: boolean }>(
        "/api/auth/check-phone",
        { phone }
      );
      // Respecte l'espace explicitement choisi ou demandé
      const effectiveMode: "client" | "pro" = explicitTargetMode ?? mode;
      if (check.hasPin !== false) {
        setStage({ phase: "pin", mode: effectiveMode, phone, name: check.name ?? acc.name });
        return;
      }
    } catch {
      setStage({ phase: "pin", mode, phone, name: acc.name });
      return;
    }

    setStage({ phase: "pin", mode, phone, name: acc.name });
  }

  async function onKeypadConfirm(digits: string) {
    const phone = `+225${digits}`;
    try {
      // 1) Vérifie le compte et bascule directement vers le code secret PIN 4 chiffres
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

      // Respecte strictement le portail choisi par l'utilisateur (keypadMode)
      const effectiveMode: "client" | "pro" = keypadMode === "client" ? "client" : "pro";

      const isSetup = !check.exists || check.hasPin === false || (check as { needsPinSetup?: boolean }).needsPinSetup === true;
      setStage({ phase: "pin", mode: effectiveMode, phone, name: check.name, isSetup });
      return;
    } catch (e) {
      const isNetwork = !isOnline() || (e instanceof Error && /network|fetch|offline|hors-ligne/i.test(e.message));
      if (isNetwork && keypadMode === "pro") {
        activateOfflineProSession(phone);
        return;
      }
      // Même en cas d'erreur de pré-vérification, on ouvre le pavé PIN pour permettre la connexion directe
      setStage({ phase: "pin", mode: keypadMode, phone, isSetup: false });
    }
  }

  async function handlePinConfirm(pin: string, phone: string, mode: "client" | "pro"): Promise<boolean> {
    try {
      const res = await apiPost<{
        ok: boolean;
        user: ApiUser;
        tenant: { id: string; name: string } | null;
        employeeRole?: string | null;
        employeePermissions?: string[] | null;
        employeeName?: string | null;
      }>("/api/auth/login", { phone, pin, mode, ...createHumanPayload() });

      const isPro = res.user.role === "pro" || Boolean(res.employeeRole) || Boolean(res.tenant?.id);
      const targetRole = res.user.role === "admin" ? "admin" : isPro ? "pro" : "client";

      rememberAccount({
        phone,
        name: res.user.name,
        role: targetRole === "admin" ? "pro" : targetRole,
      });

      const sessionUser: SessionUser = {
        ...res.user,
        role: targetRole,
        employeeRole: res.employeeRole ?? res.user.employeeRole ?? null,
        employeePermissions: res.employeePermissions ?? res.user.employeePermissions ?? null,
        employeeName: res.employeeName ?? (res.user as { employeeName?: string | null }).employeeName ?? null,
        tenantId: res.tenant?.id ?? undefined,
      };

      setUser(sessionUser);
      if (res.tenant?.id) {
        setProTenantId(res.tenant.id);
      }
      // Respecte STRICTEMENT l'interface choisie par l'utilisateur !
      // Un employé ou une gérante peut tout à fait se connecter directement dans son "Espace Beauté" personnel !
      const targetSpace: "client" | "pro" | "admin" =
        mode === "client"
          ? "client"
          : mode === "pro" && (isPro || targetRole === "admin")
            ? "pro"
            : isPro
              ? "pro"
              : "client";
      setSpace(targetSpace);

      toast.success(
        targetSpace === "client"
          ? `Bienvenue ${res.user.name.split(" ")[0]} dans ton Espace Beauté personnel 🌸`
          : `Bienvenue ${res.user.name.split(" ")[0]} — « ${res.tenant?.name ?? "Espace Entreprise"} » est ouvert 💼`
      );
      if (onBackToApp) onBackToApp();
      return true;
    } catch (e) {
      const isNetwork = !isOnline() || (e instanceof Error && /network|fetch|offline|hors-ligne/i.test(e.message));
      if (isNetwork && (mode === "pro" || keypadMode === "pro")) {
        activateOfflineProSession(phone);
        if (onBackToApp) onBackToApp();
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

  async function startExploration(targetTab: ClientTab = "diagnostic") {
    if (exploring) return;
    setExploring(true);
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("kene:start-explore"));
      }
      // — UNE requête GET: l'accès express ne dépend d'AUCUN POST.
      const v = await apiGet<{ user: ApiUser; tenant: { id: string; name: string } | null }>("/api/auth/express?newGuest=1");
      setUser(v.user as SessionUser);
      useKene.getState().setClientTab(targetTab);
      toast.success(v.user.name && v.user.name !== "Nouvelle invitée" ? `Bienvenue ${v.user.name.split(" ")[0]} 💛` : "Bienvenue sur Kènè 💛");
      if (onBackToApp) onBackToApp();
    } catch {
      // Repli invité hors-ligne immédiat
      const fallbackGuest: SessionUser = {
        id: `guest_${Date.now()}`,
        name: "Nouvelle invitée",
        phone: `+22500${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`,
        role: "client",
      };
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("kene:start-explore"));
      }
      setUser(fallbackGuest);
      useKene.getState().setClientTab(targetTab);
      toast.success("Bienvenue sur Kènè 💛");
      if (onBackToApp) onBackToApp();
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
                  <KeneEmblemLockup size={44} labelSize={22} sublabel="Beauté mélanoderme" hideSublabelOnMobile={true} />

                  {/* Sélecteur d'interfaces & Actions rapides */}
                  <div className="flex items-center gap-2">
                    {onBackToApp && (
                      <button
                        type="button"
                        onClick={onBackToApp}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gold/40 bg-secondary/80 hover:bg-secondary px-3.5 text-[11.5px] font-semibold text-foreground transition-colors shadow-xs"
                      >
                        <X size={13} className="text-gold-text" />
                        <span>Fermer la connexion</span>
                      </button>
                    )}
                    <SpaceSwitcher variant="compact" />
                    <Link
                      href="/case-study"
                      className="hidden md:inline-flex h-9 items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 hover:bg-gold/20 px-3.5 text-[11.5px] font-bold text-gold-text transition-all hover:scale-105 active:scale-95 shadow-xs"
                      title="Découvrir l'Étude de Cas Awwwards, le design system et la 3D WebGL"
                    >
                      <NsorommaIcon size={12} className="text-gold-text animate-pulse" />
                      <span>Case Study 3D</span>
                    </Link>
                    <button
                      onClick={() => setStories(true)}
                      className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-full k-chip px-3.5 text-[11.5px] font-semibold text-foreground/85 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary cursor-pointer"
                      aria-label="Découvrir Kènè en 30 secondes (stories)"
                    >
                      <Play size={11} className="ml-0.5 text-gold-text" />
                      Découvrir en 30&nbsp;s
                    </button>
                    {/* Accès discret mais prestigieux pour les gérantes d'instituts */}
                    <button
                      type="button"
                      onClick={() => enterPortal("pro")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 hover:bg-gold/20 px-3 sm:px-3.5 text-[11.5px] font-bold text-gold-text transition-all hover:scale-105 active:scale-95 shadow-xs cursor-pointer"
                      title="Espace réservé aux gérantes d'instituts, spas et dermo-praticiennes"
                    >
                      <BriefcaseBusiness size={13} className="text-gold-text shrink-0" />
                      <span className="hidden sm:inline">Espace Pro &amp; Salons</span>
                      <span className="sm:hidden">Pro</span>
                      <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
              </Reveal>

              {/* ── BANNIÈRE INCITATIVE PWA (Installation 1-Clic sur PC / Mobile / Tablette) ── */}
              <div className="mt-3 sm:mt-4">
                <SmartInstallBar />
              </div>

              {/* ── ZONE HAUTE : Hero de Conversion & Démonstration en Direct ── */}
              <div className="mt-4 sm:mt-6 lg:mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
                {/* Bloc Hero (Gauche sur PC) — Focalisé 100% sur le désir cutané et l'action */}
                <section className="relative lg:col-span-7 flex flex-col justify-center" aria-label="Promesse Kènè">
                  {/* Halo organique doré diffus */}
                  <div
                    className="pointer-events-none absolute -inset-8 rounded-full blur-3xl opacity-55"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 25% 25%, rgba(212, 154, 36, 0.22) 0%, transparent 65%), radial-gradient(circle at 80% 40%, rgba(201, 59, 98, 0.14) 0%, transparent 60%)",
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

                  {/* Badge d'autorité IA & Carnations */}
                  <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * d, duration: 0.5 }}>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 border border-gold/40 px-3.5 py-1 text-[11px] font-black uppercase tracking-wider text-gold-text shadow-xs">
                      <Sparkles size={13} className="animate-pulse text-gold-text shrink-0" />
                      <span>1er Scanner Dermo-IA calibré pour carnations africaines (Albinos à Ébène)</span>
                    </span>
                  </motion.div>

                  {/* Titre choc orienté résultat & éthique */}
                  <h1 className="mt-3.5 font-heading text-[32px] sm:text-[42px] lg:text-[46px] xl:text-[52px] font-black leading-[1.05] tracking-tight text-foreground">
                    Révèle l&apos;éclat pur de ta peau.
                    <span className="kente-text-flow block italic mt-1 sm:mt-1.5">Sans dépigmentation.</span>
                    <span className="block mt-1 sm:mt-1.5">Sans fausses promesses.</span>
                  </h1>

                  {/* Sous-titre répondant directement aux peurs & douleurs de la cliente */}
                  <motion.p
                    className="mt-3.5 max-w-[50ch] text-[13px] sm:text-[14.5px] leading-relaxed text-muted-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 * d }}
                  >
                    Taches d&apos;acné, hyperpigmentation, teint terne ou excès de sébum ? Scanne ton visage en <strong>30 secondes chrono</strong>. Obtiens ton score de santé cutanée, ton <strong>ordonnance personnalisée</strong> aux trésors botaniques africains purs (Karité brut de Korhogo, Balanites, Moringa) et ton <strong>Pass Cabine offert</strong>.
                  </motion.p>

                  {/* LE GRAND BOUTON D'ACTION MAGNÉTIQUE (0 friction, 0 FCFA) */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-5 sm:mt-6">
                    <motion.button
                      onClick={() => startExploration("diagnostic")}
                      disabled={exploring}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.45 * d }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="inline-flex min-h-12 sm:min-h-13 items-center justify-center gap-2.5 rounded-full k-btn-gold px-6 sm:px-7 text-[13.5px] sm:text-[14.5px] font-black text-primary-foreground shadow-xl shadow-gold/20 hover:shadow-gold/30 transition-all cursor-pointer"
                    >
                      {exploring ? <Loader2 size={18} className="animate-spin text-primary-foreground" /> : <Camera size={19} />}
                      <span>Analyser ma peau gratuitement (0 FCFA)</span>
                      <ArrowRight size={16} />
                    </motion.button>

                    <motion.button
                      type="button"
                      onClick={() => enterPortal("client")}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 * d }}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full k-chip px-4.5 text-[12.5px] font-bold text-foreground/90 hover:text-foreground cursor-pointer"
                    >
                      <LogIn size={15} className="text-gold-text" />
                      <span>Déjà cliente ? Me connecter</span>
                    </motion.button>
                  </div>

                  {/* Micro-réassurances indispensables pour lever les doutes */}
                  <motion.div
                    className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-[11px] sm:text-[11.5px] text-muted-foreground mt-3.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.55 * d }}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                      <span>100% Gratuit à vie</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <Check size={13} className="text-gold-text shrink-0" />
                      <span>Sans carte bancaire</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <Check size={13} className="text-gold-text shrink-0" />
                      <span>0% Hydroquinone &amp; Corticoïdes</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <Check size={13} className="text-gold-text shrink-0" />
                      <span>Ordonnance WhatsApp</span>
                    </span>
                  </motion.div>

                  {/* Reconnexion express si compte déjà mémorisé */}
                  <AnimatePresence initial={false}>
                    {last && (
                      <div className="mt-4">
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
                                {maskPhone(last.phone)} · {last.role === "pro" ? "Compte Pro & Personnel" : last.role === "admin" ? "Console Kènè" : "Espace cliente"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {last.role === "pro" ? (
                                <>
                                  <button onClick={() => startReconnect(last, "client")}
                                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full k-btn-gold px-3 text-[11px] font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary cursor-pointer hover:scale-105 active:scale-95 transition-all"
                                    title="Accéder directement à mon Espace Beauté personnel">
                                    <span>🌸 Beauté</span>
                                  </button>
                                  <button onClick={() => startReconnect(last, "pro")}
                                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full k-chip px-3 text-[11px] font-bold text-foreground hover:border-gold/60 transition-all cursor-pointer hover:scale-105 active:scale-95"
                                    title="Accéder à l'Espace Entreprise (Institut & Caisse)">
                                    <span>💼 Pro</span>
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => startReconnect(last)}
                                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full k-btn-gold px-4 text-[11.5px] font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer">
                                  <LogIn size={13} />
                                  Reprendre
                                </button>
                              )}
                              <button onClick={() => { forgetAccount(); setLast(null); }}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary cursor-pointer"
                                aria-label="Oublier ce numéro sur cet appareil">
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        </GlassCard>
                      </div>
                    )}
                  </AnimatePresence>
                </section>

                {/* Bloc Simulateur en Direct (Droite sur PC) — Preuve Visuelle Irrésistible */}
                <div className="lg:col-span-5 flex flex-col gap-3">
                  <div className="relative overflow-hidden rounded-[26px] border-2 border-gold/50 bg-gradient-to-b from-[#1C140E]/95 via-[#18110B]/90 to-[#100C08]/95 p-4 sm:p-5 text-[#FFF9EC] shadow-2xl shadow-gold/15 backdrop-blur-xl">
                    {/* Badge en-tête du simulateur */}
                    <div className="flex items-center justify-between gap-2 border-b border-gold/25 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-gold/20 text-gold-text">
                          <Camera size={14} />
                        </span>
                        <div>
                          <p className="text-[12px] font-black uppercase tracking-wider text-gold-text">Aperçu Bilan &amp; Ordonnance</p>
                          <p className="text-[10px] text-[#FFF9EC]/70">Exemple réel généré en 30 secondes</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        IA Active
                      </span>
                    </div>

                    {/* Visuel du visage avec ciblage biométrique */}
                    <div className="relative mt-3.5 h-[160px] sm:h-[180px] w-full overflow-hidden rounded-2xl border border-white/10">
                      <img
                        src="/hero/hero-client.webp"
                        alt="Visage analysé par l'IA Kènè"
                        className="h-full w-full object-cover object-center"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#100C08]/90 via-transparent to-[#100C08]/30" />

                      {/* Repères biométriques HUD */}
                      <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="rounded-md bg-black/60 backdrop-blur-md px-2 py-0.5 text-[9.5px] font-mono text-gold-text border border-gold/30">
                            23 zones cartographiées
                          </span>
                          <span className="rounded-md bg-black/60 backdrop-blur-md px-2 py-0.5 text-[9.5px] font-mono text-emerald-400 border border-emerald-500/30">
                            Phototype V (Brun cuivré)
                          </span>
                        </div>

                        {/* Réticule d'analyse centré */}
                        <div className="self-center flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-[#FFF9EC] border border-white/20">
                          <Sparkles size={11} className="text-gold-text animate-pulse" />
                          <span>Score Global : 78 / 100</span>
                        </div>

                        <div className="flex items-center justify-between text-[9.5px] text-[#FFF9EC]/80 font-mono">
                          <span>Mélanine : 100% préservée</span>
                          <span>HPI : Réversible</span>
                        </div>
                      </div>
                    </div>

                    {/* 3 Indicateurs clés mesurés */}
                    <div className="mt-3.5 space-y-2 text-xs">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-[#FFF9EC]/90">Taches d&apos;acné &amp; Hyperpigmentation (HPI)</span>
                          <span className="text-gold-text font-mono">32% · Atténuation douce</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-gold to-amber-500 w-[68%]" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className="text-[#FFF9EC]/90">Barrière lipidique &amp; Hydratation</span>
                          <span className="text-emerald-400 font-mono">84% · Optimale</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 w-[84%]" />
                        </div>
                      </div>
                    </div>

                    {/* Routine botanique prescrite sur l'ordonnance */}
                    <div className="mt-3.5 rounded-xl border border-gold/30 bg-gold/10 p-2.5 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-[11px] text-gold-text flex items-center gap-1">
                          <Leaf size={12} /> Ordonnance de soins recommandée :
                        </p>
                        <span className="text-[9.5px] text-muted-foreground">Matin &amp; Soir</span>
                      </div>
                      <p className="text-[11px] leading-tight text-[#FFF9EC]/90">
                        • <strong>Matin :</strong> Savon noir doux surgras &amp; Extrait pur de Moringa<br />
                        • <strong>Soir :</strong> Huile de Balanites (Dattier) &amp; Karité brut de Korhogo
                      </p>
                      <p className="text-[10px] text-gold-text/80 pt-1 border-t border-gold/20 flex items-center gap-1">
                        <Building2 size={11} /> Prescrit &amp; disponible chez « Cabinet LA DERMO » (Abidjan)
                      </p>
                    </div>

                    {/* Bouton d'action directe depuis le simulateur */}
                    <button
                      type="button"
                      onClick={() => startExploration("diagnostic")}
                      disabled={exploring}
                      className="mt-3.5 w-full h-11 rounded-xl k-btn-gold text-primary-foreground font-black text-xs flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                    >
                      {exploring ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                      <span>Tester gratuitement sur mon propre visage →</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── SECTION 2 : La Preuve Clinique Avant / Après en 30 Jours ── */}
              <div className="mt-10 sm:mt-14 w-full">
                <section aria-label="Résultats cliniques avant après">
                  <GlassCard grain className="rounded-[26px] p-5 sm:p-7 space-y-5">
                    <div className="max-w-2xl">
                      <Eyebrow>Preuve Clinique &amp; Résultats Visibles</Eyebrow>
                      <h2 className="font-heading text-xl sm:text-2xl font-black text-foreground mt-1">
                        Mesurer les progrès en 30 jours, sans décapage
                      </h2>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        Glisse le curseur pour observer l&apos;atténuation naturelle de l&apos;hyperpigmentation et l&apos;unification du teint avec des actifs de la pharmacopée ouest-africaine.
                      </p>
                    </div>

                    {/* Le comparateur interactif tactile BeforeAfterSlider */}
                    <div className="pt-2">
                      <BeforeAfterSlider
                        beforePhoto="/skin/clinical-before.jpg"
                        afterPhoto="/skin/clinical-after.jpg"
                        beforeLabel="J0 : Taches HPI & Sébum"
                        afterLabel="J+30 : Teint unifié & apaisé"
                        beforeScore={52}
                        afterScore={84}
                        zoneLabel="Visage & Pommettes · Suivi Dermo Kènè"
                        defaultLayoutMode="slider"
                      />
                    </div>

                    {/* Chiffres d'impact réels */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div className="rounded-2xl border border-border/80 bg-card/60 p-3.5 text-center space-y-1">
                        <p className="font-mono text-2xl font-black text-gold-text">-35%</p>
                        <p className="text-xs font-bold text-foreground">Taches d&apos;acné visibles</p>
                        <p className="text-[10.5px] text-muted-foreground">Atténuation sans éclaircissement de la peau saine</p>
                      </div>
                      <div className="rounded-2xl border border-border/80 bg-card/60 p-3.5 text-center space-y-1">
                        <p className="font-mono text-2xl font-black text-emerald-500">+45%</p>
                        <p className="text-xs font-bold text-foreground">Hydratation profonde</p>
                        <p className="text-[10.5px] text-muted-foreground">Barrière lipidique renforcée au Karité brut</p>
                      </div>
                      <div className="rounded-2xl border border-border/80 bg-card/60 p-3.5 text-center space-y-1">
                        <p className="font-mono text-2xl font-black text-primary">100%</p>
                        <p className="text-xs font-bold text-foreground">Respect de la mélanine</p>
                        <p className="text-[10.5px] text-muted-foreground">Zéro hydroquinone, zéro corticoïde, zéro brûlure</p>
                      </div>
                    </div>
                  </GlassCard>
                </section>
              </div>

              {/* ── SECTION 3 : Comment ça marche (3 Étapes Limpides) ── */}
              <div className="mt-8 sm:mt-12 w-full">
                <section aria-label="Comment fonctionne Kènè">
                  <div className="text-center max-w-xl mx-auto mb-6 sm:mb-8 space-y-1.5">
                    <Eyebrow>Simple · Rapide · Scientifique</Eyebrow>
                    <h2 className="font-heading text-xl sm:text-2xl font-black text-foreground">
                      Ton diagnostic et ton ordonnance en 3 étapes
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Conçu pour s&apos;adapter à ton quotidien, directement depuis ton smartphone.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Étape 1 */}
                    <div className="rounded-[22px] border border-border/80 bg-card/75 p-5 space-y-3 relative hover:border-gold/50 transition-all">
                      <span className="grid size-10 place-items-center rounded-2xl bg-gold/15 text-gold-text font-mono font-black text-sm">
                        01
                      </span>
                      <h3 className="font-heading text-base font-black text-foreground">
                        Prends 1 selfie en 10 secondes
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Notre IA vision calibrée sur peaux noires et métissées cartographie 23 zones de ton visage et mesure 14 biomarqueurs (sébum, taches, barrière cutanée).
                      </p>
                    </div>

                    {/* Étape 2 */}
                    <div className="rounded-[22px] border border-gold/40 bg-gradient-to-b from-gold/10 to-card/75 p-5 space-y-3 relative hover:border-gold/60 transition-all shadow-xs">
                      <span className="grid size-10 place-items-center rounded-2xl bg-gold text-primary-foreground font-mono font-black text-sm shadow-xs">
                        02
                      </span>
                      <h3 className="font-heading text-base font-black text-foreground">
                        Reçois ton ordonnance sur-mesure
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Une routine claire (Matin &amp; Soir) formulée avec les trésors purs de notre pharmacopée (Karité bio de Korhogo, Balanites, Moringa) et sans actifs décapants.
                      </p>
                    </div>

                    {/* Étape 3 */}
                    <div className="rounded-[22px] border border-border/80 bg-card/75 p-5 space-y-3 relative hover:border-gold/50 transition-all">
                      <span className="grid size-10 place-items-center rounded-2xl bg-gold/15 text-gold-text font-mono font-black text-sm">
                        03
                      </span>
                      <h3 className="font-heading text-base font-black text-foreground">
                        Soins en cabine ou chez toi
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Commande tes soins pour livraison à domicile ou réserve ton soin cabine en 1 clic chez nos instituts certifiés comme <strong>Cabinet LA DERMO</strong>.
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              {/* ── SECTION 4 : Notre Charte d'Engagement Éthique & Médicale ── */}
              <div className="mt-8 sm:mt-12 w-full">
                <section aria-label="Charte éthique et dermatologique">
                  <div className="rounded-[26px] border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card/90 to-card p-5 sm:p-7 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck size={20} />
                        </span>
                        <div>
                          <h3 className="font-heading text-base sm:text-lg font-black text-foreground">
                            Notre Charte Médicale &amp; Dermo-Éthique
                          </h3>
                          <p className="text-xs text-muted-foreground">Une dermatologie bienveillante, fière de chaque mélanine</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-500/30 w-fit">
                        100% Sans Hydroquinone
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
                      <div className="space-y-1.5">
                        <p className="font-bold text-foreground flex items-center gap-1.5">
                          🚫 Tolérance Zéro Décapage
                        </p>
                        <p className="text-muted-foreground leading-relaxed">
                          Refus strict de l&apos;hydroquinone, des dermocorticoïdes, du mercure et des acides agressifs responsables de l&apos;ochronose et du vieillissement prématuré.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <p className="font-bold text-foreground flex items-center gap-1.5">
                          🌍 Toutes les Nuances d&apos;Afrique
                        </p>
                        <p className="text-muted-foreground leading-relaxed">
                          De la peau albinos (OCA) aux Afro-rousses, Chabines, teints Caramel, Chocolat et Ébène intense : chaque carnation a son protocole de lumière respectueux.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <p className="font-bold text-foreground flex items-center gap-1.5">
                          👩🏾‍⚕️ Validation par Dermo-Conseillères
                        </p>
                        <p className="text-muted-foreground leading-relaxed">
                          Vos fiches de soins et prescriptions sont supervisées par des professionnelles qualifiées en cabine, avec traçabilité et historique conservé à vie.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ── SECTION 5 : Avis Clientes & Témoignages Vérifiés ── */}
              <div className="mt-8 sm:mt-12 w-full">
                <section aria-label="Témoignages clientes">
                  <div className="text-center max-w-xl mx-auto mb-6 space-y-1">
                    <Eyebrow>Elles ont retrouvé leur éclat naturel</Eyebrow>
                    <h2 className="font-heading text-xl sm:text-2xl font-black text-foreground">
                      Témoignages de nos clientes à Abidjan &amp; Dakar
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-[22px] border border-border/80 bg-card/70 p-4.5 space-y-2.5">
                      <div className="flex items-center gap-1 text-gold-text">
                        {[...Array(5)].map((_, i) => <Star key={i} size={13} fill="currentColor" />)}
                      </div>
                      <p className="text-xs text-foreground/90 italic leading-relaxed">
                        &laquo; J&apos;avais des taches noires tenaces après chaque bouton. En 4 semaines avec le protocole Balanites &amp; Niacinamide, mon teint s&apos;est unifié sans aucune décoloration agressive. &raquo;
                      </p>
                      <div className="pt-2 border-t border-border/40 text-[11px]">
                        <p className="font-bold text-foreground">Aïcha M. · 26 ans</p>
                        <p className="text-muted-foreground">Abidjan Cocody · Phototype V (Chocolat)</p>
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-border/80 bg-card/70 p-4.5 space-y-2.5">
                      <div className="flex items-center gap-1 text-gold-text">
                        {[...Array(5)].map((_, i) => <Star key={i} size={13} fill="currentColor" />)}
                      </div>
                      <p className="text-xs text-foreground/90 italic leading-relaxed">
                        &laquo; Le premier diagnostic qui comprend vraiment la peau noire profonde sans nous proposer de produits blanchissants. L&apos;ordonnance reçue sur WhatsApp est limpide. &raquo;
                      </p>
                      <div className="pt-2 border-t border-border/40 text-[11px]">
                        <p className="font-bold text-foreground">Aminata D. · 32 ans</p>
                        <p className="text-muted-foreground">Dakar Almadies · Phototype VI (Ébène intense)</p>
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-border/80 bg-card/70 p-4.5 space-y-2.5">
                      <div className="flex items-center gap-1 text-gold-text">
                        {[...Array(5)].map((_, i) => <Star key={i} size={13} fill="currentColor" />)}
                      </div>
                      <p className="text-xs text-foreground/90 italic leading-relaxed">
                        &laquo; Je suis allée chez Cabinet LA DERMO avec mon Pass Cabine Kènè : la praticienne avait déjà tout mon bilan sur sa tablette. Soin incroyable, zéro perte de temps ! &raquo;
                      </p>
                      <div className="pt-2 border-t border-border/40 text-[11px]">
                        <p className="font-bold text-foreground">Grace K. · 29 ans</p>
                        <p className="text-muted-foreground">Abidjan Marcory · Phototype IV (Caramel)</p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* ── SECTION 6 : Les Tarifs & Abonnements Kènè (Transparence Absolue) ── */}
              <div className="mt-8 sm:mt-12 w-full">
                <section aria-label="Formules et abonnements Kènè">
                  <GlassCard grain className="rounded-[24px] p-4 sm:p-6 lg:p-7 space-y-4 sm:space-y-5">
                    {/* En-tête des tarifs avec sélecteur d'audience */}
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="min-w-0">
                        <Eyebrow>Transparence &amp; Tarifs Kènè</Eyebrow>
                        <h2 className="font-heading text-lg sm:text-xl font-black text-foreground mt-0.5">
                          Des formules adaptées, sans engagement
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Règlement direct Mobile Money (Wave, Orange Money, MTN) · Zéro prélèvement bancaire automatique
                        </p>
                      </div>

                      {/* Onglets Client vs Pro */}
                      <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 p-1 rounded-2xl bg-muted/50 border border-border/60 w-full sm:w-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => setPricingTab("client")}
                          className={cn(
                            "px-3 sm:px-4 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5",
                            pricingTab === "client"
                              ? "k-btn-gold text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span>🌸</span>
                          <span className="truncate">Pour les Clientes</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPricingTab("pro")}
                          className={cn(
                            "px-3 sm:px-4 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5",
                            pricingTab === "pro"
                              ? "k-btn-gold text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span>🏢</span>
                          <span className="truncate">Instituts</span>
                          <span className="text-[10px] font-medium opacity-90 px-1.5 py-0.5 rounded-full bg-black/10 dark:bg-white/10 shrink-0">
                            30j offerts
                          </span>
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
                              30 jours offerts pour tout nouvel établissement (100% débloqué)
                            </p>
                          </div>
                          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                            Le <strong>Pass Découverte 30 jours (0 FCFA)</strong> débloque l&apos;intégralité des fonctionnalités Pro (Caisse POS tactile, Agenda 24/7, Stock, CRM, SYSCOHADA, Paie CNPS) sans carte bancaire et sans aucun prélèvement surprise.
                          </p>
                        </div>

                        {/* Grille des 3 offres Entreprise : Starter, Institut & Complexe */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* 1. Pro Starter */}
                          <div className="rounded-[22px] border border-border/80 bg-card/85 backdrop-blur-md p-5 flex flex-col justify-between space-y-4 hover:border-gold/50 transition-all shadow-sm">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[17px] font-black text-foreground">Pro Starter</span>
                                <span className="rounded-full bg-secondary border border-border/80 px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                                  Solo &amp; Cabine
                                </span>
                              </div>
                              <p className="text-[11.5px] text-muted-foreground leading-snug">
                                Praticienne solo, dermo-conseil indépendant &amp; cabine dédiée.
                              </p>
                              <div className="pt-1.5 border-t border-border/40">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-mono text-2xl font-black text-gold-text">10 000</span>
                                  <span className="text-[11px] text-muted-foreground font-semibold">FCFA / mois</span>
                                </div>
                                <p className="text-[10px] text-gold-text/90 font-medium mt-0.5">
                                  Descend à <strong>5 000 F/mois à vie</strong> après fidélité
                                </p>
                              </div>
                              <ul className="space-y-2 text-xs pt-1">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]"><strong>Agenda en ligne 24/7</strong></span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]">Acomptes Mobile Money anti no-show</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]">Fiches clientes &amp; historique cutané</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]">Relances WhatsApp automatisées</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => enterPortal("pro")}
                              className="w-full h-10.5 rounded-xl k-chip hover:bg-muted text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                              <span>Choisir Starter</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>

                          {/* 2. Pro Institut */}
                          <div className="rounded-[22px] border-2 border-gold/60 bg-gradient-to-b from-gold/15 via-gold/5 to-card/90 backdrop-blur-md p-5 flex flex-col justify-between space-y-4 relative shadow-lg shadow-gold/10">
                            <span className="absolute -top-3 right-4 rounded-full bg-gradient-to-r from-gold to-terre text-primary-foreground px-3 py-0.5 text-[10px] font-black uppercase tracking-wider shadow">
                              ⭐ Recommandé Salons
                            </span>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[17px] font-black text-foreground">Pro Institut</span>
                                <span className="rounded-full bg-gold/20 border border-gold/40 px-2.5 py-0.5 text-[10px] font-black text-gold-text">
                                  Établissement
                                </span>
                              </div>
                              <p className="text-[11.5px] text-muted-foreground leading-snug">
                                Le cœur de gestion des salons &amp; instituts (jusqu&apos;à 6 praticiennes).
                              </p>
                              <div className="pt-1.5 border-t border-gold/30">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-mono text-2xl font-black text-gold-text">20 000</span>
                                  <span className="text-[11px] text-muted-foreground font-semibold">FCFA / mois</span>
                                </div>
                                <p className="text-[10px] text-gold-text/90 font-medium mt-0.5">
                                  Descend à <strong>10 000 F/mois à vie</strong> après fidélité
                                </p>
                              </div>
                              <ul className="space-y-2 text-xs pt-1">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-[11.5px] font-bold">Tout Pro Starter inclus</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]"><strong>Caisse POS tactile</strong> Wave, OM &amp; Espèces</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]">Stocks Revente vs Cabine</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]">CRM &amp; segmentation fidélité</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => enterPortal("pro")}
                              className="w-full h-10.5 rounded-xl k-btn-gold text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                            >
                              <span>Choisir Institut</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>

                          {/* 3. Pro Complexe */}
                          <div className="rounded-[22px] k-obsidian-luxury p-5 flex flex-col justify-between space-y-4 transition-all shadow-lg">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[17px] font-black text-[#FFF9EC]">Pro Complexe</span>
                                <span className="rounded-full bg-[#D49A24]/25 border border-[#D49A24]/50 text-[#F3D98A] px-2.5 py-0.5 text-[10px] font-bold">
                                  👑 Excellence
                                </span>
                              </div>
                              <p className="text-[11.5px] text-[#E6D5B8]/80 leading-snug">
                                Spas, cliniques dermo, multi-succursales &amp; personnel déclaré.
                              </p>
                              <div className="pt-1.5 border-t border-[#D49A24]/25">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-heading text-2xl font-black text-[#F3D98A] tabular-nums">30 000</span>
                                  <span className="text-[11px] text-[#E6D5B8]/75 font-semibold">FCFA / mois</span>
                                </div>
                                <p className="text-[10px] text-[#F3D98A] font-medium mt-0.5">
                                  Descend à <strong>20 000 F/mois à vie</strong>
                                </p>
                              </div>
                              <ul className="space-y-2 text-xs pt-1 text-[#FFF9EC]/90">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-[#F3D98A] mt-0.5 shrink-0" />
                                  <span className="text-[11.5px] font-bold">Tout Pro Institut inclus</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-[#F3D98A] mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]"><strong>Paie CNPS / IPRES</strong> déclarative</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-[#F3D98A] mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]"><strong>Comptabilité SYSCOHADA</strong></span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-[#F3D98A] mt-0.5 shrink-0" />
                                  <span className="text-[11.5px]">Multi-établissements illimité</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => enterPortal("pro")}
                              className="w-full h-10.5 rounded-xl bg-[#D49A24]/20 hover:bg-[#D49A24]/35 border border-[#D49A24]/45 text-[#FFF9EC] text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                              <span>Choisir Complexe</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Onglet Clientes : Gratuit vs Kènè+ */
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Carte Gratuit */}
                          <div className="rounded-[22px] border border-border/80 bg-card/85 backdrop-blur-md p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-gold/40 transition-all">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[18px] font-black text-foreground">Compte Gratuit</span>
                                <span className="rounded-full bg-secondary border border-border/80 px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                                  Inclus à vie (0 FCFA)
                                </span>
                              </div>
                              <p className="text-[12px] text-muted-foreground leading-snug">
                                Pour toutes celles qui souhaitent comprendre leur peau, obtenir leur ordonnance et réserver en salon.
                              </p>
                              <div className="pt-1.5 border-t border-border/40">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-mono text-3xl font-black text-foreground">0</span>
                                  <span className="text-xs text-muted-foreground font-semibold">FCFA · 100% Gratuit pour toujours</span>
                                </div>
                              </div>
                              <ul className="space-y-2 text-xs pt-1">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span><strong>Bilan dermo-biométrique complet</strong> (score de peau, type et zones)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span><strong>Ordonnance dermo-cosmétique</strong> (phytothérapie ouest-africaine)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span><strong>Prise de RDV instantanée</strong> dans les instituts partenaires</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span><strong>Boutique cosmétique</strong> (Karité de Korhogo, moringa, baobab)</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => startExploration("diagnostic")}
                              className="w-full h-11 rounded-xl k-chip hover:bg-muted text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                            >
                              <span>Accéder gratuitement</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>

                          {/* Carte Kènè+ */}
                          <div className="rounded-[22px] border-2 border-gold/60 bg-gradient-to-b from-gold/15 via-gold/5 to-card/90 backdrop-blur-md p-5 flex flex-col justify-between space-y-4 relative shadow-lg shadow-gold/10">
                            <span className="absolute -top-3 right-4 rounded-full bg-gradient-to-r from-gold to-terre text-primary-foreground px-3 py-0.5 text-[10px] font-black uppercase tracking-wider shadow">
                              ✨ 30j offerts (0 FCFA)
                            </span>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-heading text-[18px] font-black text-foreground">Pass Kènè+</span>
                                <span className="rounded-full bg-gold/20 border border-gold/40 px-2.5 py-0.5 text-[10px] font-black text-gold-text">
                                  👑 Membre Privilège
                                </span>
                              </div>
                              <p className="text-[12px] text-muted-foreground leading-snug">
                                Bilans dermo-biométriques illimités, suivi d&apos;évolution &amp; privilèges boutique.
                              </p>
                              <div className="pt-1.5 border-t border-gold/30">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-mono text-3xl font-black text-gold-text">2 500</span>
                                  <span className="text-xs text-muted-foreground font-semibold">FCFA / mois</span>
                                </div>
                                <p className="text-[10.5px] text-gold-text/90 font-medium mt-0.5">
                                  <strong>1er mois 100% offert (Pass Découverte 30j, 0 FCFA)</strong>, puis 2 500 F/mois sans engagement !
                                </p>
                              </div>
                              <ul className="space-y-2 text-xs pt-1">
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span><strong>Bilans dermo illimités</strong> : Scannez vos zones sans aucune restriction</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span><strong>Courbe d&apos;évolution &amp; avant/après</strong> tactile pour mesurer vos progrès</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span><strong>Dermo Kènè prioritaire 24/7</strong> avec rituels botaniques personnalisés</span>
                                </li>
                                <li className="flex items-start gap-2">
                                  <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                  <span><strong>Dossier de Peau 360°</strong> &amp; remises VIP sur la Boutique</span>
                                </li>
                              </ul>
                            </div>
                            <button
                              type="button"
                              onClick={() => enterPortal("client")}
                              className="w-full h-11 rounded-xl k-btn-gold text-primary-foreground text-xs font-black flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                            >
                              <span>Activer mon Pass Kènè+ (30j offerts)</span>
                              <ArrowRight size={13} />
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
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline underline-offset-4 cursor-pointer"
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
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">⭐ Illimité</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Dermo Kènè IA (Conseils dermo-cosmétiques)</td>
                                <td className="py-2.5 px-2 text-center text-muted-foreground">Standard</td>
                                <td className="py-2.5 px-2 text-center text-gold-text font-bold">⭐ Prioritaire &amp; Illimité</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Réservation de soins &amp; Acompte en ligne</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Boutique cosmétiques des instituts</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Suivi d&apos;évolution &amp; Progrès cutanés</td>
                                <td className="py-2.5 px-2 text-center text-muted-foreground">Dernier bilan</td>
                                <td className="py-2.5 px-2 text-center text-gold-text font-bold">⭐ Historique J+14, J+30, J+60</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Dossier de Peau &amp; Pass Cabine QR</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-border/60">
                                <th className="py-2.5 px-3 font-bold text-muted-foreground">Outils de Gestion Institut</th>
                                <th className="py-2.5 px-2 font-bold text-center w-32 text-terre">Pro Starter</th>
                                <th className="py-2.5 px-2 font-bold text-center w-32 text-gold-text">Pro Complexe</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Agenda en ligne &amp; Réservations 24/7</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Caisse tactile &amp; Tickets de caisse</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Diagnostics IA en cabine &amp; Fiches clientes</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Cabine illimité</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Cabine illimité</td>
                              </tr>
                              <tr>
                                <td className="py-2.5 px-3 font-medium">Gestion du stock (Revente vs Cabine)</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
                                <td className="py-2.5 px-2 text-center text-emerald-500 font-bold">Inclus</td>
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
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* Garantie de réassurance sous les tarifs */}
                    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground pt-1">
                      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
                      <span>
                        <strong>Garantie sans engagement :</strong> Tous les paiements s&apos;effectuent par Mobile Money direct (Wave, Orange Money, MTN MoMo). Aucun numéro de carte bancaire n&apos;est enregistré et aucun débit automatique n&apos;est effectué sans votre confirmation expresse.
                      </span>
                    </p>
                  </GlassCard>
                </section>
              </div>

              {/* ── SECTION 7 : Bannière Dédiée Instituts Partenaires (B2B) ── */}
              <div className="mt-8 sm:mt-10 w-full">
                <div className="rounded-[24px] border border-gold/40 bg-gradient-to-r from-card via-[#1A120B]/40 to-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gold-text flex items-center gap-1.5">
                      <Building2 size={13} /> Espace Entreprise &amp; Salons de Beauté
                    </span>
                    <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
                      Vous gérez un salon, spa ou institut dermo-esthétique ?
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-xl">
                      Rejoignez le réseau officiel Kènè : caisse tactile conforme SYSCOHADA, agenda cabine 24/7, fiches de consultation et fidélisation cliente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => enterPortal("pro")}
                    className="shrink-0 px-5 py-2.5 rounded-full k-btn-gold text-primary-foreground font-black text-xs flex items-center justify-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <BriefcaseBusiness size={14} />
                    <span>Découvrir Kènè Pro (30j offerts)</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>

              {/* ── SECTION 8 : CTA Final Géant de Pied de Page & Mentions Légales ── */}
              <div className="mt-10 pt-6 pb-4 flex flex-col items-center gap-3.5 text-center">
                <motion.button
                  type="button"
                  onClick={() => startExploration("diagnostic")}
                  disabled={exploring}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex min-h-12 items-center gap-2.5 rounded-full px-7 py-3 k-btn-gold text-[13.5px] font-black text-primary-foreground shadow-xl shadow-gold/25 cursor-pointer"
                >
                  {exploring ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  <span>Démarrer mon bilan cutané gratuit (30s chrono)</span>
                  <ArrowRight size={15} />
                </motion.button>
                <p className="text-[10.5px] sm:text-[11.5px] leading-relaxed text-muted-foreground">
                  Données médicales chiffrées &amp; protégées · En continuant, vous acceptez les conditions Kènè.
                </p>
                <Link
                  href="/case-study"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gold-text hover:text-gold transition-colors hover:underline"
                >
                  <NsorommaIcon size={11} />
                  <span>Candidature Awwwards · Lire l&apos;Étude de Cas &amp; Laboratoire 3D</span>
                </Link>
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
              onNewClient={startExploration}
            />
          </motion.div>
        )}

        {stage.phase === "pin" && (
          <motion.div key="pin" {...pageSlide} transition={{ duration: 0.3 }}>
            <PinKeypad
              phone={stage.phone}
              name={stage.name}
              mode={stage.mode}
              isSetup={stage.isSetup ?? false}
              onConfirm={(pin) => handlePinConfirm(pin, stage.phone, stage.mode)}
              onBack={() => setStage({ phase: "keypad", mode: stage.mode })}
              onForgotPin={() => handleForgotPin(stage.phone, stage.mode)}
              onOfflineBypass={() => activateOfflineProSession(stage.phone)}
              onNewClient={startExploration}
              onSwitchAccount={() => setStage({ phase: "keypad", mode: stage.mode })}
              onSwitchSpace={() => setStage((prev) => prev.phase === "pin" ? { ...prev, mode: prev.mode === "pro" ? "client" : "pro" } : prev)}
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

