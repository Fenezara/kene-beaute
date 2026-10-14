"use client";
// Kènè Cliente — Shell applicatif plein écran, expérience type réseaux sociaux 2026
// (Instagram / TikTok / Facebook):
// • Mobile (<md): header glass (logo · cloche · chat) + flux plein cadre + tab-bar bas
// 5 onglets avec CTA « Scanner » central surélevé.
// • Tablette (md+): rail d'icônes 84 px (façon TikTok iPad / Instagram web compacte)
// + colonne centrée — l'écran large est exploité dès 768 px.
// • Desktop (xl): sidebar complète libellée + feed centré max 640 px + rail droit
// (mini-profil, actions rapides, mentions légales) — zéro espace perdu.
// Le Fil de Kente (intro) et l'onboarding restent plein cadre, hors shell.
// Résilience + code splitting: chaque écran d'onglet vit derrière une
// ScreenBoundary (erreur locale = carte inline, l'app reste vivante) et les écrans
// lourds sont lazy (chunk dédié au premier clic — HomeScreen/Onboarding eager).
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Crown, FolderHeart, Home, Loader2, MessageCircle, Settings, Share2, User, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { BodyZone } from "@/lib/kene/types";
import { HAPTIC, haptic, isOnline, useNetworkOnline } from "@/lib/kene/ux";
import { formatTime } from "@/lib/kene/format";
import { KeneEmblem, KeneEmblemLockup, KeneMark, NeaOnnimIcon, SankofaIcon } from "@/components/kene/icons";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { AuroraBackdrop, IconBadge } from "@/components/kene/ui2026";
import { apiGet } from "@/lib/kene/api";
import { useKene, type ClientTab, type SessionUser, isSavedUser } from "@/store/kene";
import { useChat } from "@/store/chat";
import { replayDiagQueue } from "@/lib/kene/diag-queue";
import { useT } from "@/lib/kene/use-t";
import { WelcomeThreshold } from "./WelcomeThreshold";
import { unlockAudioContext } from "./ttsAudio";
import { ThumbBar } from "./ThumbBar";
import { HomeScreen } from "./HomeScreen";
import { ProfileScreen } from "./ProfileScreen";
import { AgendaScreen } from "./AgendaScreen";
import { ClientSkinDossierView } from "./ClientSkinDossierView";
import { ScreenBoundary } from "./ScreenBoundary";
import { BootSkeleton } from "./BootSkeleton";
import { PaymentReturnHandler } from "./PaymentReturnHandler";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { openWhatsAppAppointmentInquiry } from "@/lib/kene/whatsapp-relay";
import { cn } from "@/lib/utils";

/** Navigation latérale (desktop & tablette) — destinations clés */
const NAV_DESKTOP: { tab: ClientTab; labelKey: string; icon: React.ComponentType<{ className?: string }>; scan?: boolean }[] = [
  { tab: "accueil", labelKey: "tab.home", icon: Home },
  { tab: "dossier", labelKey: "tab.dossier", icon: FolderHeart },
  { tab: "diagnostic", labelKey: "tab.scan", icon: NeaOnnimIcon, scan: true },
  { tab: "agenda", labelKey: "tab.agenda", icon: CalendarDays },
  { tab: "chat", labelKey: "tab.chat", icon: MessageCircle },
  { tab: "profil", labelKey: "tab.profile", icon: User },
];

/** Tab-bar mobile — 5 emplacements équilibrés avec CTA scan surélevé au centre */
const NAV_MOBILE: { tab: ClientTab; labelKey: string; icon: React.ComponentType<{ className?: string }>; scan?: boolean }[] = [
  { tab: "accueil", labelKey: "tab.home", icon: Home },
  { tab: "dossier", labelKey: "tab.dossier", icon: FolderHeart },
  { tab: "diagnostic", labelKey: "tab.scan", icon: NeaOnnimIcon, scan: true },
  { tab: "agenda", labelKey: "tab.agenda", icon: CalendarDays },
  { tab: "profil", labelKey: "tab.profile", icon: User },
];

/** Onglets d'écran — « abonnement » et « legal » sont des écrans
 * CACHÉS façon « parametres »: hors tab-bar, hors balayage, accès
 * depuis Paramètres (cartes Abonnement / Mentions légales). */
type ScreenTab = ClientTab | "abonnement" | "legal";

const TITLES: Record<ScreenTab, string> = {
  accueil: "title.home",
  dossier: "title.dossier",
  agenda: "title.agenda",
  instituts: "title.profile",
  diagnostic: "title.diag",
  boutique: "title.home",
  rdv: "title.agenda",
  chat: "title.chat",
  profil: "title.profile",
  parametres: "title.parametres",
  abonnement: "Abonnement",
  legal: "Mentions légales",
};

/** Ordre de balayage mobile (swipe horizontal gauche/droite) */
const SWIPE_ORDER: ClientTab[] = ["accueil", "dossier", "diagnostic", "agenda", "profil"];

// ─── Écrans intégrés (inclus dans le bundle de base pour garantie 100% hors-ligne) ───
import { DiagnosticScreen } from "./DiagnosticScreen";
import { ChatScreen } from "./ChatScreen";
import { SettingsScreen } from "./SettingsScreen";
import { PlanScreen } from "./PlanScreen";
import { LegalScreen } from "./LegalScreen";
import { NotificationCenter } from "./NotificationCenter";
import { GuestSaveBanner } from "./GuestSaveBanner";

/** Squelette d'attente d'onglet — spinner discret pendant le chargement du chunk */
function TabLoading() {
  return (
    <div role="status" aria-busy="true" className="grid place-items-center py-24">
      <span className="flex flex-col items-center gap-3">
        <Loader2 size={22} className="animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Chargement…</span>
      </span>
    </div>
  );
}

/** Cloche en attente — même empreinte (h-11 w-11) que le bouton final: zéro décalage du header */
function BellLoading() {
  return (
    <span role="status" aria-busy="true" className="grid place-items-center h-8 w-8 sm:h-9 sm:w-9 shrink-0">
      <Loader2 size={16} className="animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Chargement…</span>
    </span>
  );
}

export function ClientApp() {
  const { t } = useT();
  const user = useKene((s) => s.user);
  // Écran courant étendu aux onglets cachés 71-c (cast typé, cf. ScreenTab).
  const tab = useKene((s) => s.clientTab) as ScreenTab;
  const setClientTab = useKene((s) => s.setClientTab);
  // Gate d'hydratation kene-store (contrat): _keneHydrated passe à
  // true quand la relecture localStorage est finie (onRehydrateStorage, même
  // en cas d'erreur — la porte ne se verrouille jamais). Typage tolérant: si
  // 63-b était absent, fallback true = comportement d'avant (zéro régression).
  const hydrated = useKene((s) => (s as { _keneHydrated?: boolean })._keneHydrated ?? true);
  // Badge chat honnête: faux par défaut — seul un message ENTRANT (événement
  // « kene:chat:new » dispatché par ChatScreen) l'allume, voir l'effet plus bas
  const [chatUnread, setChatUnread] = useState(false);
  const [pendingZone, setPendingZone] = useState<BodyZone | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ─── Pull-to-refresh (Instagram / Wave) ───
  const [pull, setPull] = useState(0);          // distance d'étirement (px, résistive)
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const pullStart = useRef<{ y: number; x: number; atTop: boolean } | null>(null);
  const wasRefreshing = useRef(false);

  // ─── Direction de transition (sens de navigation) + connectivité ───
  const [navDir, setNavDir] = useState<1 | -1>(1);
  // Bandeau hors-ligne anti-faux-positifs — résilience réseau façon Wave
  const online = useNetworkOnline();

  // Deep-linking / Raccourcis PWA (shortcuts) : ouverture directe d'un onglet via ?tab=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const targetTab = params.get("tab")?.toLowerCase();
      const VALID_TABS: ClientTab[] = ["accueil", "agenda", "diagnostic", "chat", "profil", "parametres", "abonnement", "legal"];
      if (targetTab && VALID_TABS.includes(targetTab as ClientTab)) {
        setClientTab(targetTab as ClientTab);
      }
    } catch {
      // noop
    }
  }, [setClientTab]);

  // Redirection automatique : boutique vers accueil, rdv vers agenda, instituts vers profil
  useEffect(() => {
    if (tab === "boutique") {
      setClientTab("accueil");
    } else if (tab === "rdv") {
      setClientTab("agenda");
    } else if (tab === "instituts") {
      setClientTab("profil");
    }
  }, [tab, setClientTab]);

  // File d'attente offline du diagnostic: les photos mises en
  // attente partent TOUTES SEULES au retour du réseau — peu importe l'écran
  // courant (la replay vit ici, toujours montée). Au boot: si la file n'est
  // pas vide et qu'on est en ligne, elle part après 2,5 s (reprise d'app).
  useEffect(() => {
    let alive = true;
    const flush = async () => {
      const n = await replayDiagQueue();
      if (!alive || n === 0) return;
      haptic(HAPTIC.success);
      toast.success(
        n === 1 ? "Ta photo est partie — l'analyse suit son cours" : `${n} photos parties — les analyses suivent leur cours`,
        { description: "Le résultat arrivera dans tes notifications." },
      );
    };
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const t = window.setTimeout(() => void flush(), 2500);
    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
      window.clearTimeout(t);
    };
  }, []);

  // Relecture du store persisté (kene-store, skipHydration) — UNE fois
  // au montage, idempotente (le store a aussi son propre filet « load »):
  // c'est ceci qui restaure l'état persisté (space/user/panier/onglet) après
  // le premier rendu client — le BootSkeleton couvre exactement cette fenêtre.
  useEffect(() => {
    void useKene.persist.rehydrate();
  }, []);

  // ── Validation silencieuse de la session au boot ── DÉPLACÉE à la racine
  //: le check vivait ici, or ClientApp n'est PAS monté quand
  // l'espace persisté est pro/admin → une session invalidée n'était pas
  // purgée au retour dans ces espaces. Voir src/components/kene/SessionKeeper.tsx
  // (monté dans page.tsx, couvre les 3 espaces).

  // Badge chat honnête: l'événement « kene:chat:new » (CustomEvent, détail
  // { at } — dispatché par ChatScreen, contrat figé) n'allume le point
  // QUE si tu n'es pas déjà sur l'onglet chat (lecture fraîche via getState,
  // l'effet ne se réabonne jamais). Aller sur l'onglet chat → goTab éteint.
  useEffect(() => {
    const onNewChatMessage = () => {
      if (useKene.getState().clientTab !== "chat") setChatUnread(true);
    };
    window.addEventListener("kene:chat:new", onNewChatMessage);
    return () => window.removeEventListener("kene:chat:new", onNewChatMessage);
  }, []);

  // Remonte en haut du flux à chaque changement d'onglet (le tirage est
  // réinitialisé par les gestionnaires tactiles, jamais par cet effet)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  function goTab(t: ScreenTab) {
    if (t !== tab) {
      // Hors SWIPE_ORDER (écrans cachés) → pas de direction de transition,
      // la motion.div du flux joue son fade par défaut.
      const from = SWIPE_ORDER.indexOf(tab as ClientTab);
      const to = SWIPE_ORDER.indexOf(t as ClientTab);
      if (from >= 0 && to >= 0) setNavDir(to > from ? 1 : -1);
      haptic(HAPTIC.tap);
    }
    if (t === "chat") setChatUnread(false);
    setClientTab(t as ClientTab);
  }

  // ─── Gestes tactiles du conteneur de flux ───
  // Note : Le balayage horizontal (swipe gauche/droite) est désactivé
  // pour empêcher tout changement intempestif de page lors du défilement.
  // Seul le tirage vertical d'actualisation (pull-to-refresh) est conservé.
  const onTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    const t = e.touches[0];
    pullStart.current = { y: t.clientY, x: t.clientX, atTop: !el || el.scrollTop <= 0 };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (refreshing) return;
    const s = pullStart.current;
    if (!s || !s.atTop) return;
    const t = e.touches[0];
    const dy = t.clientY - s.y;
    const dx = t.clientX - s.x;
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) return; // tirage vertical uniquement
    setPull(Math.min(dy / 2.2, 96)); // résistif: l'icône s'alourdit en fin de course
  };

  const onTouchEnd = () => {
    // Fin de tirage → actualisation si seuil franchi
    const dist = pull;
    pullStart.current = null;
    if (dist > 56) {
      haptic(HAPTIC.medium);
      setRefreshing(true);
      setPull(0);
      wasRefreshing.current = true;
      setRefreshKey((k) => k + 1);
    } else {
      setPull(0);
    }
  };

  // Le fil signale la fin de son rechargement (déclenché par refreshKey)
  const onRefreshed = useCallback(() => {
    if (!wasRefreshing.current) return;
    wasRefreshing.current = false;
    setRefreshing(false);
    haptic(HAPTIC.success);
    toast.success("Fil actualisé", { description: `Mis à jour à ${formatTime(new Date())}` });
  }, []);

  const onScanZone = useCallback(
    (z: BodyZone) => {
      setPendingZone(z);
      setClientTab("diagnostic");
    },
    [setClientTab],
  );

  const onZoneConsumed = useCallback(() => setPendingZone(null), []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Détection d'un compte authentifié et sauvegardé (avec un vrai numéro/identifiant)
  const isSaved = isSavedUser(user);

  // État de session exploratoire (actif lorsque l'invité a cliqué sur un portail ou "Nouveau client")
  const [exploring, setExploring] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem("kene_exploring") === "1";
    }
    return false;
  });

  useEffect(() => {
    const handleStartExplore = () => setExploring(true);
    window.addEventListener("kene:start-explore", handleStartExplore);
    return () => window.removeEventListener("kene:start-explore", handleStartExplore);
  }, []);

  // Demande explicite de reconnexion / changement de compte depuis l'intérieur de l'app
  const [explicitLogin, setExplicitLogin] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return p.get("login") === "1" || p.get("auth") === "1" || p.get("signin") === "1";
    }
    return false;
  });

  useEffect(() => {
    const handleOpenLogin = () => setExplicitLogin(true);
    window.addEventListener("kene:open-login", handleOpenLogin);
    return () => window.removeEventListener("kene:open-login", handleOpenLogin);
  }, []);

  // Store persisté en cours de relecture : squelette d'amorçage
  if (!mounted || !hydrated) {
    return <BootSkeleton />;
  }

  // ACCÈS D'ABORD À LA PAGE D'ACCUEIL POUR :
  // 1. Les nouveaux arrivants (!user)
  // 2. Les utilisateurs déconnectés (!user)
  // 3. Les utilisateurs qui n'ont pas encore sauvegardé leur identifiant (!isSaved && !exploring)
  // NOTE : Aucun bouton "Retour" ne permet d'accéder au portail sans respecter ces règles !
  if (!isSaved && (!user || !exploring)) {
    return <WelcomeThreshold />;
  }

  // Demande explicite de connexion depuis l'intérieur de l'application (Settings / Bannière)
  // Dans ce cas spécifique uniquement, l'utilisateur était déjà dans l'app et peut annuler la connexion.
  if (explicitLogin) {
    return (
      <WelcomeThreshold
        onBackToApp={() => {
          setExplicitLogin(false);
          if (typeof window !== "undefined" && (window.location.search.includes("login") || window.location.search.includes("auth") || window.location.search.includes("signin"))) {
            const url = new URL(window.location.href);
            url.searchParams.delete("login");
            url.searchParams.delete("auth");
            url.searchParams.delete("signin");
            window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
          }
        }}
      />
    );
  }

  // Filet de sécurité avant rendu du shell client
  if (!user) {
    return <BootSkeleton />;
  }

  const first = user.name.split(" ")[0];

  return (
    <div className="h-dvh flex overflow-hidden overscroll-none select-none">
      {/* Atmosphère ÉCLAT 2026 — lueurs aurora derrière tout le shell (le fond
 de page vient du body: ce div reste transparent pour laisser passer
 la couche fixe -z-10, light et dark). */}
      <AuroraBackdrop />
      {/* ───────── Rail latéral tablette + desktop (md+) — chrome verre ───────── */}
      <aside
        aria-label="Navigation principale"
        className="hidden md:flex w-[84px] lg:w-[240px] xl:w-[260px] shrink-0 flex-col k-chrome transition-[width] duration-200"
      >
        <div className="h-16 lg:h-18 flex items-center justify-center lg:justify-start px-2 lg:px-5 border-b border-border/60">
          {/* Logo en haut à gauche : icône médaillon sur tablette, lockup complet avec slogan sur grand écran */}
          <div className="hidden lg:block">
            <KeneEmblemLockup size={46} labelSize={23} sublabel="Beauté mélanoderme" />
          </div>
          <div className="lg:hidden" title="Kènè — Beauté mélanoderme">
            <KeneEmblem size={38} />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto pretty-scroll px-2 lg:px-3 py-4 flex flex-col gap-1.5">
          {NAV_DESKTOP.map((n) => {
            const active = tab === n.tab;
            const Icon = n.icon;
            if (n.scan) {
              return (
                <button
                  key={n.tab}
                  onClick={() => goTab(n.tab)}
                  aria-current={active ? "page" : undefined}
                  title={t(n.labelKey)}
                  className={cn(
                    "k-cta flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-3 px-2 lg:px-3 h-14 lg:h-12 rounded-2xl text-[#FFF9EC] focus-visible:outline-2 focus-visible:outline-primary transition-all",
                    active && "outline-2 outline-[#FFF9EC]/80",
                  )}
                >
                  <NeaOnnimIcon size={20} className="shrink-0" />
                  <span className="text-[10.5px] lg:text-sm font-bold tracking-wide truncate max-w-full">{t(n.labelKey)}</span>
                </button>
              );
            }
            return (
              <button
                key={n.tab}
                onClick={() => goTab(n.tab)}
                aria-current={active ? "page" : undefined}
                aria-label={`${t(n.labelKey)}${n.tab === "chat" && chatUnread ? " — 1 nouveau message" : ""}`}
                title={t(n.labelKey)}
                className={cn(
                  "relative flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-3.5 h-14 lg:h-12 px-2 lg:px-3 rounded-2xl transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span className="relative shrink-0">
                  <Icon className={cn("size-[22px]", active && "font-bold")} />
                  {n.tab === "chat" && chatUnread && (
                    <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-[#8B1A3B] ring-2 ring-card" aria-hidden="true" />
                  )}
                </span>
                <span className={cn("text-[10px] lg:text-[14px] xl:text-[15px] truncate max-w-full", active ? "font-bold" : "font-medium")}>{t(n.labelKey)}</span>
                {active && <motion.span layoutId="side-indicator" className="k-rail-line absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        {/* Bas de sidebar: sélecteur d'interface + micro légal */}
        <div className="border-t border-border/60 p-2 lg:p-3 xl:p-4 space-y-2 lg:space-y-3">
          <div className="space-y-1">
            <span className="hidden lg:block text-xs uppercase font-bold text-muted-foreground/80 tracking-wider">Interfaces Kènè</span>
            <div className="lg:hidden flex justify-center">
              <SpaceSwitcher variant="compact" />
            </div>
            <div className="hidden lg:block">
              <SpaceSwitcher variant="pills" className="w-full justify-between" />
            </div>
          </div>
          <p className="hidden lg:block px-1 text-xs leading-relaxed text-muted-foreground/75">
            Kènè — paiements sécurisés Mobile Money & Carte · estimations IA non médicales
          </p>
        </div>
      </aside>

      {/* ───────── Colonne principale ───────── */}
      <div className="relative flex-1 min-w-0 flex flex-col h-full">
        {/* Header unique responsive: mobile = logo + actions; desktop = titre + actions.
 k-chrome = verre blur+saturate (le CSS gère le filet et l'ombre). Safe-area mobile garantie (≥ 36px). */}
        <header className="shrink-0 z-40 k-chrome pt-8 sm:pt-4 md:pt-0 [padding-top:max(env(safe-area-inset-top,0px),2.25rem)] md:[padding-top:env(safe-area-inset-top,0px)]">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-3 px-2 sm:px-5">
            {/* 1. GAUCHE : Logo Kènè & Titre (immunisé contre tout écrasement grâce à shrink-0) */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="md:hidden shrink-0">
                {/* Lockup Sceau officiel compact — le Médaillon Kènè + nom Kènè net et stable */}
                <KeneEmblemLockup size={34} labelSize={17} sublabel={null} />
              </div>
              <div className="hidden md:flex items-baseline gap-2.5 min-w-0 flex-1 overflow-hidden">
                <h1 className="font-heading font-bold tracking-tight text-lg xl:text-xl truncate text-foreground">{t(TITLES[tab])}</h1>
                <p className="text-xs font-semibold text-gold-text dark:text-[#E3B04B] truncate hidden lg:inline">
                  {tab === "accueil" ? "Tableau de bord cutané & soins" : tab === "chat" ? "Éducation cutanée · en ligne" : "Kènè — Beauté mélanoderme"}
                </p>
              </div>
            </div>

            {/* 2. DROITE : Dermo Kènè + Actions rapides (Switcher, Cloche, Réglages, Thème) */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* 👑 BOUTON DERMO KÈNÈ EN HAUT — L'ORBE PARLE EN PREMIER AU CLIC */}
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  unlockAudioContext();
                  useChat.getState().ensureEngaged(user.name, user.city);
                  if (typeof window !== "undefined") {
                    window.sessionStorage.setItem("kene:chat:speak_first", "true");
                    window.dispatchEvent(new CustomEvent("kene:chat:speak_first"));
                  }
                  goTab("chat");
                }}
                aria-label={`${t("nav.chat.aria")}${chatUnread ? " — 1 nouveau message" : ""}`}
                title="Consulter Dermo Kènè (Conseils dermo-cosmétiques & Chat IA 24/7)"
                className={cn(
                  "relative flex items-center gap-1.5 sm:gap-2 h-9 sm:h-11 px-2.5 sm:px-4 rounded-full border-2 transition-all active:scale-95 shadow-xs shrink-0 select-none",
                  tab === "chat"
                    ? "bg-gradient-to-r from-[#D49A24] via-[#F3C35C] to-[#C93B62] text-[#18120C] border-[#FCE8EE] font-black shadow-md ring-2 ring-[#9E2045]/30"
                    : "border-[#D49A24]/70 bg-gradient-to-r from-[#D49A24]/15 via-[#C93B62]/10 to-card/90 hover:from-[#D49A24]/25 hover:to-[#C93B62]/15 text-foreground font-black"
                )}
              >
                <span className="relative grid size-5.5 sm:size-6 place-items-center rounded-full bg-gradient-to-br from-[#D49A24] to-[#C93B62] text-white shadow-xs shrink-0">
                  <MessageCircle size={13} className="text-white sm:hidden" />
                  <MessageCircle size={15} className="text-white hidden sm:block" />
                  <span className="absolute -top-0.5 -right-0.5 size-2 sm:size-2.5 rounded-full bg-emerald-500 ring-1.5 ring-background animate-pulse" />
                </span>
                <span className="text-[12px] sm:text-sm font-black tracking-tight flex items-center gap-1 sm:gap-1.5 text-foreground whitespace-nowrap">
                  <span>Dermo Kènè</span>
                  <span className="text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[#9E2045]/15 text-[#9E2045] dark:text-[#F77698] border border-[#9E2045]/30 uppercase tracking-wider">
                    24/7
                  </span>
                </span>
                {chatUnread && (
                  <span className="size-2 sm:size-2.5 rounded-full bg-[#9E2045] ring-2 ring-background animate-bounce shrink-0" />
                )}
              </button>

              <SpaceSwitcher variant="compact" />

              {/* Cloche notifications: flux temps réel (notify-service) */}
              <Suspense fallback={<BellLoading />}>
                <NotificationCenter userId={user.id} />
              </Suspense>

              {/* Engrenage Paramètres — visible dès tablette sm+ (sur mobile accessible via onglet Profil) */}
              <button
                onClick={() => goTab("parametres")}
                aria-label={t("title.parametres")}
                className="hidden sm:grid place-items-center h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full text-foreground hover:bg-accent/60 active:scale-95 transition focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Settings className="size-4 sm:size-5" />
              </button>

              <ThemeToggle />
            </div>
          </div>
          <div aria-hidden="true" className="kente-band-soft h-[2px] w-full" />
          {/* Bandeau hors-ligne — le contenu affiché reste disponible (façon Wave) */}
          {!online && (
            <div role="status" className="flex items-center justify-center gap-2 bg-gold/15 text-gold-text text-[11px] font-semibold py-1.5 border-b border-gold/30">
              <WifiOff size={13} aria-hidden="true" />
              {t("common.offline")}
            </div>
          )}
        </header>

        {/* Zone de flux — scroll interne (l'app ne scrolle jamais le document)
            Gestes: tirer-actualiser vertical uniquement. Balayage horizontal verrouillé (touch-pan-y, overscroll-x-none). */}
        <div
          ref={scrollRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative flex-1 min-h-0 overflow-y-auto overscroll-y-none overscroll-contain overscroll-x-none touch-pan-y pretty-scroll"
        >
          {/* Indicateur pull-to-refresh (Instagram) — icône qui descend avec le doigt */}
          {(pull > 0 || refreshing) && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 inset-x-0 z-30 flex flex-col items-center pt-2"
              style={{
                transform: `translateY(${refreshing ? 0 : Math.min(Math.max(pull - 44, 0), 52)}px)`,
                transition: pull > 0 ? "none" : "transform .3s ease",
              }}
            >
              <span className="grid place-items-center h-11 w-11 rounded-full k-chrome">
                {refreshing ? (
                  <Loader2 size={20} className="animate-spin text-primary" />
                ) : (
                  <NeaOnnimIcon size={20} className="text-primary" />
                )}
              </span>
            </div>
          )}
          {refreshing && <span role="status" className="sr-only">Actualisation du fil en cours</span>}
          <div className="mx-auto w-full max-w-[640px] px-3 sm:px-5 pt-3 pb-36 md:pb-10">
            {/* Bannière douce de sauvegarde WhatsApp si en mode Découverte */}
            <GuestSaveBanner />

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, x: 16 * navDir, y: 6 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: -12 * navDir, y: -4 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {/* Suspense DANS le motion.div: le squelette d'attente participe
 à la transition d'onglet pendant le chargement du chunk */}
                <Suspense fallback={<TabLoading />}>
                  {tab === "accueil" && (
                    <ScreenBoundary name="Accueil">
                      <HomeScreen onScanZone={onScanZone} refreshKey={refreshKey} onRefreshed={onRefreshed} />
                    </ScreenBoundary>
                  )}
                  {tab === "dossier" && (
                    <ScreenBoundary name="Mon Dossier Peau & Données">
                      <ClientSkinDossierView
                        onStartScan={() => goTab("diagnostic")}
                        onNavigateTab={goTab}
                      />
                    </ScreenBoundary>
                  )}
                  {(tab === "agenda" || (tab as any) === "rdv") && (
                    <ScreenBoundary name="Agenda & Rendez-vous">
                      <AgendaScreen />
                    </ScreenBoundary>
                  )}
                  {tab === "diagnostic" && (
                    <ScreenBoundary name="Diagnostic">
                      <DiagnosticScreen pendingZone={pendingZone} onZoneConsumed={onZoneConsumed} />
                    </ScreenBoundary>
                  )}
                  {tab === "chat" && (
                    <ScreenBoundary name="Chat">
                      <ChatScreen />
                    </ScreenBoundary>
                  )}
                  {tab === "profil" && (
                    <ScreenBoundary name="Profil">
                      <ProfileScreen />
                    </ScreenBoundary>
                  )}
                  {tab === "parametres" && (
                    <ScreenBoundary name="Paramètres">
                      <SettingsScreen />
                    </ScreenBoundary>
                  )}
                  {tab === "abonnement" && (
                    <ScreenBoundary name="Abonnement">
                      <PlanScreen />
                    </ScreenBoundary>
                  )}
                  {tab === "legal" && (
                    <ScreenBoundary name="Mentions légales">
                      <LegalScreen />
                    </ScreenBoundary>
                  )}
                </Suspense>
              </motion.div>
            </AnimatePresence>
            {/* Pouce d'Or — actions primaires de l'écran sous le pouce,
 collées au-dessus de la nav mobile (accueil + profil; la boutique
 a sa propre barre panier, les autres écrans ont leurs CTAs en bas). */}
            <ThumbBar tab={tab} />
          </div>
        </div>

        {/* ───────── Tab-bar mobile flottante — chrome verre 2026 + blob actif ───────── */}
        <nav
          aria-label="Navigation principale mobile"
          className="md:hidden absolute inset-x-0 bottom-0 z-40 pointer-events-none pb-[env(safe-area-inset-bottom,0px)]"
        >
          <div className="pointer-events-auto mx-3 mb-2.5 grid grid-cols-5 h-[64px] rounded-[30px] k-chrome">
            {NAV_MOBILE.map((n) => {
              const active = tab === n.tab;
              const Icon = n.icon;
              if (n.scan) {
                return (
                  <button
                    key={n.tab}
                    onClick={() => goTab(n.tab)}
                    aria-current={active ? "page" : undefined}
                    aria-label={t("nav.scan.aria")}
                    className="relative flex flex-col items-center justify-end pb-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <span
                      className={cn(
                        "grid place-items-center h-[50px] w-[50px] -mt-7 rounded-full border-4 border-background transition-all active:scale-95",
                        "bg-gradient-to-br from-[#A0522D] to-[#8B1A3B] k-glow-gold",
                      )}
                    >
                      <NeaOnnimIcon size={23} />
                    </span>
                    <span className={cn("text-xs font-semibold mt-0.5", active ? "text-primary font-bold" : "text-muted-foreground")}>{t(n.labelKey)}</span>
                  </button>
                );
              }
              return (
                <button
                  key={n.tab}
                  onClick={() => goTab(n.tab)}
                  aria-current={active ? "page" : undefined}
                  aria-label={t(n.labelKey)}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 h-full transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                <span className="relative grid place-items-center rounded-full p-1.5">
                  {/* Blob actif — pastille or translucide qui glisse entre les onglets */}
                  {active && (
                    <motion.span
                      layoutId="nav-blob"
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-primary/18"
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="relative size-[22px]" />
                </span>
                <span className={cn("text-xs tracking-tight", active ? "font-bold text-primary" : "font-semibold")}>{t(n.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>

      {/* ───────── Rail droit desktop (xl+, accueil) — chrome verre + cartes k ───────── */}
      {tab === "accueil" && (
        <aside aria-label="Informations et raccourcis" className="hidden xl:flex w-[320px] shrink-0 flex-col gap-4 k-chrome p-5 overflow-y-auto pretty-scroll">
          {/* Mini-profil */}
          <div className="k-card k-card-hover rounded-[24px] p-4">
            <div className="flex items-center gap-3.5">
              <span className="grid place-items-center h-14 w-14 rounded-full bg-gradient-to-br from-[#A0522D] to-[#8B1A3B] k-glow-gold text-[#FFF9EC] font-heading font-bold text-xl">
                {first.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="font-heading font-bold truncate">{user.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user.phone}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user.city || "Abidjan"} · {user.fitzpatrick ? `Fitzpatrick ${user.fitzpatrick}` : "phototype à définir"}</p>
              </div>
            </div>
            <button
              onClick={() => goTab("profil")}
              className="mt-3.5 h-10 w-full rounded-2xl k-btn-gold text-primary-foreground text-xs font-bold focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t("rail.view.profile")}
            </button>
          </div>

          {/* Actions rapides */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => goTab("diagnostic")} className="k-cta rounded-[24px] text-[#FFF9EC] p-3.5 text-left focus-visible:outline-2 focus-visible:outline-primary" aria-label={t("home.scan.cta")}>
              <NeaOnnimIcon size={20} />
              <p className="text-xs font-bold mt-1.5 leading-tight">Scanner<br />ma peau</p>
            </button>
            <button onClick={() => goTab("chat")} className="k-card k-card-hover rounded-[24px] p-3.5 text-left active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary" aria-label="Dermo Kènè — Dermo-Conseil IA">
              <MessageCircle size={20} className="text-primary" />
              <p className="text-xs font-bold mt-1.5 leading-tight text-foreground/90">Dermo Kènè<br />Conseil IA</p>
            </button>
            <button
              onClick={() =>
                openWhatsAppAppointmentInquiry({
                  serviceCategory: "Soin esthétique",
                  serviceName: "Soin & diagnostic dermo-cosmétique",
                  tenantPhone: user?.selectedTenant?.phone || (user?.selectedTenant as any)?.ownerPhone,
                  instituteName: user?.selectedTenant?.name,
                  country: ((user?.selectedTenant as any)?.country || "CI") as "CI" | "SN",
                })
              }
              className="k-card k-card-hover rounded-[24px] p-3.5 text-left active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary border-primary/20 bg-primary/5"
              aria-label="Secrétaire IA & Rendez-vous"
            >
              <Crown size={20} className="text-gold-text" />
              <p className="text-xs font-bold mt-1.5 leading-tight text-foreground/90">Secrétaire IA<br /><span className="text-gold-text font-bold">Rendez-Vous 💆‍♀️</span></p>
            </button>
            <button
              onClick={() => goTab("profil")}
              className="k-card k-card-hover rounded-[24px] p-3.5 text-left active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary border-primary/20 bg-card"
              aria-label="Partager avec mes instituts"
            >
              <Share2 size={20} className="text-primary" />
              <p className="text-xs font-bold mt-1.5 leading-tight text-foreground/90">Partager<br /><span className="text-primary font-bold">Mes Instituts 🤝</span></p>
            </button>
          </div>

          {/* Mentions légales */}
          <div className="mt-auto k-card rounded-[24px] p-4 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-heading font-bold text-xs text-foreground/80 mb-1.5">Kènè — v1.0</p>
            <p>Paiements sécurisés Mobile Money &amp; Carte · estimations IA non médicales.</p>
            <p className="mt-1">Données personnelles protégées · Soins dermo-cosmétiques certifiés.</p>
            <p className="mt-2 font-heading text-primary">« La beauté mélanoderme, enfin comprise. »</p>
          </div>
        </aside>
      )}

      {/* Célébration & Réconciliation automatique au retour de WiniPayer / Wave */}
      <PaymentReturnHandler />
    </div>
  );
}
