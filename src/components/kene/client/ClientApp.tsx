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
import { CalendarDays, Crown, FolderHeart, Home, Loader2, MessageCircle, Settings, Share2, ShieldAlert, Sparkles, User, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { BodyZone } from "@/lib/kene/types";
import { HAPTIC, haptic, isOnline, useNetworkOnline } from "@/lib/kene/ux";
import { formatTime } from "@/lib/kene/format";
import { KeneEmblem, KeneEmblemLockup, KeneMark, NeaOnnimIcon, NsorommaIcon, SankofaIcon } from "@/components/kene/icons";
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
import { ProfileScreen } from "./ProfileScreen";
import { AgendaScreen } from "./AgendaScreen";
import { ClientSkinDossierView } from "./ClientSkinDossierView";
import { ClientInciScannerModal } from "./ClientInciScannerModal";
import { LinkAccountModal } from "./LinkAccountModal";
import { ScreenBoundary } from "./ScreenBoundary";
import { BootSkeleton } from "./BootSkeleton";
import { PaymentReturnHandler } from "./PaymentReturnHandler";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { openWhatsAppAppointmentInquiry } from "@/lib/kene/whatsapp-relay";
import { cn } from "@/lib/utils";

/** Navigation latérale (desktop & tablette) — destinations clés */
const NAV_DESKTOP: { tab: ClientTab; labelKey: string; icon: React.ComponentType<{ className?: string }>; scan?: boolean }[] = [
  { tab: "accueil", labelKey: "tab.home", icon: NsorommaIcon },
  { tab: "dossier", labelKey: "tab.dossier", icon: FolderHeart },
  { tab: "diagnostic", labelKey: "tab.scan", icon: NeaOnnimIcon, scan: true },
  { tab: "agenda", labelKey: "tab.agenda", icon: CalendarDays },
  { tab: "profil", labelKey: "tab.profile", icon: User },
];

/** Tab-bar mobile — 5 emplacements équilibrés avec CTA scan surélevé au centre */
const NAV_MOBILE: { tab: ClientTab; labelKey: string; icon: React.ComponentType<{ className?: string }>; scan?: boolean }[] = [
  { tab: "accueil", labelKey: "tab.home", icon: NsorommaIcon },
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
  accueil: "title.chat",
  dossier: "title.dossier",
  agenda: "title.agenda",
  instituts: "title.institutes",
  diagnostic: "title.diag",
  boutique: "title.shop",
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
import { HomeScreen } from "./HomeScreen";
import { DiagnosticScreen } from "./DiagnosticScreen";
import { ChatScreen } from "./ChatScreen";
import { ShopScreen } from "./ShopScreen";
import { SettingsScreen } from "./SettingsScreen";
import { PlanScreen } from "./PlanScreen";
import { LegalScreen } from "./LegalScreen";
import { NotificationCenter } from "./NotificationCenter";
import { GuestSaveBanner } from "./GuestSaveBanner";
import { SmartInstallBar } from "@/components/kene/pwa/SmartInstallBar";
import { SmartAppInstallModal } from "@/components/kene/pwa/SmartAppInstallModal";
import { AppWalkthroughTour } from "./AppWalkthroughTour";

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
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
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
      const VALID_TABS: ClientTab[] = ["accueil", "dossier", "diagnostic", "agenda", "rdv", "boutique", "chat", "profil", "parametres", "abonnement", "legal"];
      if (targetTab && VALID_TABS.includes(targetTab as ClientTab)) {
        setClientTab((targetTab === "rdv" ? "agenda" : targetTab) as ClientTab);
      } else {
        // Atterrissage automatique sur le Scanner dès l'ouverture de l'application
        setClientTab("diagnostic");
      }
    } catch {
      // noop
    }
  }, [setClientTab]);

  // Redirection automatique des alias legacy : rdv vers agenda, instituts vers profil
  useEffect(() => {
    if (tab === "rdv") {
      setClientTab("agenda");
    } else if (tab === "instituts") {
      setClientTab("profil");
    }
  }, [tab, setClientTab]);

  // Capture et affiliation immédiate de l'institut scanné par QR Code (?ref=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const p = new URLSearchParams(window.location.search);
      const refTenantId = p.get("ref");
      const salonParam = p.get("salon");
      if (refTenantId) {
        apiGet<{ tenant?: { id: string; name: string; city: string; phone?: string | null } }>(
          `/api/institutes/${encodeURIComponent(refTenantId)}`
        )
          .then((res) => {
            const inst = res?.tenant;
            if (inst) {
              const curUser = useKene.getState().user;
              if (curUser) {
                useKene.getState().setUser({
                  ...curUser,
                  selectedTenantId: inst.id,
                  selectedTenant: {
                    id: inst.id,
                    name: inst.name,
                    city: inst.city,
                    phone: inst.phone,
                  },
                });
              }
              toast.success(`Institut partenaire rattaché : ${inst.name} ✨`, {
                description: "Votre diagnostic de peau offert et votre ordonnance personnalisée sont prêts !",
                duration: 6000,
              });
            } else if (salonParam) {
              toast.success(`Bienvenue chez ${decodeURIComponent(salonParam)} ✨`, {
                description: "Votre diagnostic de peau offert et vos avantages exclusifs sont activés !",
                duration: 6000,
              });
            }
          })
          .catch(() => {
            if (salonParam) {
              toast.success(`Bienvenue chez ${decodeURIComponent(salonParam)} ✨`, { duration: 6000 });
            }
          });
      }
    } catch {
      // noop
    }
  }, []);

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
  // QUE si tu n'es pas déjà sur l'onglet chat ou accueil (lecture fraîche via getState,
  // l'effet ne se réabonne jamais). Aller sur l'onglet chat/accueil → goTab éteint.
  useEffect(() => {
    const onNewChatMessage = () => {
      const current = useKene.getState().clientTab;
      if (current !== "chat" && current !== "accueil") setChatUnread(true);
    };
    window.addEventListener("kene:chat:new", onNewChatMessage);
    return () => window.removeEventListener("kene:chat:new", onNewChatMessage);
  }, []);

  // Déclencheurs globaux pour la visite guidée et le guide d'installation PWA
  useEffect(() => {
    const onOpenWalkthrough = () => setWalkthroughOpen(true);
    const onOpenInstall = () => setInstallModalOpen(true);
    window.addEventListener("kene:open-walkthrough", onOpenWalkthrough);
    window.addEventListener("kene:open-install", onOpenInstall);
    return () => {
      window.removeEventListener("kene:open-walkthrough", onOpenWalkthrough);
      window.removeEventListener("kene:open-install", onOpenInstall);
    };
  }, []);

  // Remonte en haut du flux à chaque changement d'onglet
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      document.body.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
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
    if (t === "chat" || t === "accueil") setChatUnread(false);
    setClientTab(t as ClientTab);
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
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
    setPull(Math.min(dy / 2.5, 48)); // résistif et contenu: ne crée pas de décalage excessif
  };

  const onTouchEnd = () => {
    // Fin de tirage → actualisation instantanée si seuil franchi
    const dist = pull;
    pullStart.current = null;
    if (dist > 38) {
      haptic(HAPTIC.medium);
      setRefreshing(true);
      setPull(0);
      wasRefreshing.current = true;
      setRefreshKey((k) => k + 1);
      // Actualisation ultra-réactive quasi-instantanée (220ms)
      setTimeout(() => {
        if (wasRefreshing.current) {
          wasRefreshing.current = false;
          setRefreshing(false);
          haptic(HAPTIC.success);
          toast.success("Actualisé", { description: `Mis à jour à ${formatTime(new Date())}` });
        }
      }, 220);
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

  const [mounted, setMounted] = useState(() => typeof window !== "undefined");
  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronisation active lors du rétablissement du réseau
  useEffect(() => {
    const handleNetworkRestored = () => {
      void replayDiagQueue();
    };
    window.addEventListener("kene:network-restored", handleNetworkRestored);
    return () => window.removeEventListener("kene:network-restored", handleNetworkRestored);
  }, []);

  // Détection d'un compte authentifié et sauvegardé (avec un vrai numéro/identifiant)
  const isSaved = isSavedUser(user);

  // État de session exploratoire (actif uniquement lors d'une session en cours après avoir cliqué sur un portail)
  // RÈGLE : L'exploration n'est JAMAIS persistée lors de l'actualisation de la page (F5/reload)
  // ni lors de la fermeture/réouverture de l'application. Tout utilisateur non connecté qui actualise
  // ou rouvre l'application revoit TOUJOURS la page d'accueil d'abord !
  const [exploring, setExploring] = useState<boolean>(false);

  useEffect(() => {
    try {
      sessionStorage.removeItem("kene_exploring");
    } catch {}
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

  // Modal autonome du Scanner Produit INCI (découplé du chat/orbe)
  const [inciScannerOpen, setInciScannerOpen] = useState(false);

  useEffect(() => {
    const handleOpenInci = () => setInciScannerOpen(true);
    window.addEventListener("kene:open-inci-scanner", handleOpenInci);
    return () => window.removeEventListener("kene:open-inci-scanner", handleOpenInci);
  }, []);

  // Modal autonome de liaison de compte / création de compte gratuit
  const [linkAccountOpen, setLinkAccountOpen] = useState(false);

  useEffect(() => {
    const handleOpenLink = () => setLinkAccountOpen(true);
    window.addEventListener("kene:open-link-account", handleOpenLink);
    return () => window.removeEventListener("kene:open-link-account", handleOpenLink);
  }, []);

  // Store persisté en cours de relecture : squelette d'amorçage
  // Côté navigateur, l'amorçage est garanti immédiat (zéro blocage infini sur BootSkeleton)
  if (!mounted && typeof window === "undefined") {
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

  // Session cliente active ou repli invité/hors-ligne garanti (zéro blocage infini sur BootSkeleton)
  const effectiveUser: SessionUser = user || {
    id: "guest_offline",
    name: "Invitée Kènè",
    phone: "",
    role: "client",
  };

  const first = (effectiveUser.name || "Invitée").split(" ")[0];

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
                  <span className="text-[10px] lg:hidden font-bold tracking-tight">Scanner</span>
                  <span className="hidden lg:inline text-sm font-bold tracking-wide truncate max-w-full">{t(n.labelKey)}</span>
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
                  "relative flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-3.5 h-14 lg:h-12 px-1 lg:px-3 rounded-2xl transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span className="relative shrink-0">
                  <Icon className={cn("size-[22px]", active && "font-bold")} />
                  {n.tab === "chat" && chatUnread && (
                    <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-[#8B1A3B] ring-2 ring-card" aria-hidden="true" />
                  )}
                </span>
                <span className={cn("text-[9.5px] lg:text-[14px] xl:text-[15px] truncate max-w-full leading-none", active ? "font-bold" : "font-medium")}>
                  {n.tab === "accueil" ? (
                    <>
                      <span className="lg:hidden">Accueil</span>
                      <span className="hidden lg:inline">{t(n.labelKey)}</span>
                    </>
                  ) : n.tab === "dossier" ? (
                    <>
                      <span className="lg:hidden">Dossier</span>
                      <span className="hidden lg:inline">{t(n.labelKey)}</span>
                    </>
                  ) : n.tab === "agenda" ? (
                    <>
                      <span className="lg:hidden">Agenda</span>
                      <span className="hidden lg:inline">{t(n.labelKey)}</span>
                    </>
                  ) : n.tab === "profil" ? (
                    <>
                      <span className="lg:hidden">Profil</span>
                      <span className="hidden lg:inline">{t(n.labelKey)}</span>
                    </>
                  ) : (
                    t(n.labelKey)
                  )}
                </span>
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
            k-chrome = verre blur+saturate (le CSS gère le filet et l'ombre). Calage direct sur la barre d'état du téléphone. */}
        <header className="shrink-0 z-40 k-chrome [padding-top:env(safe-area-inset-top,0px)]">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-1 sm:gap-3 px-2 sm:px-5 max-w-full overflow-hidden">
            {/* 1. GAUCHE : Logo Kènè & Titre (compact sur petits écrans Android 320-360px) */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <div className="md:hidden shrink-0">
                <div className="hidden min-[375px]:block">
                  <KeneEmblemLockup size={32} labelSize={16} sublabel={null} />
                </div>
                <div className="min-[375px]:hidden">
                  <KeneEmblemLockup size={28} labelSize={14} sublabel={null} />
                </div>
              </div>
              <div className="hidden md:flex items-baseline gap-2.5 min-w-0 flex-1 overflow-hidden">
                <h1 className="font-heading font-bold tracking-tight text-lg xl:text-xl truncate text-foreground">{t(TITLES[tab])}</h1>
                <p className="text-xs font-semibold text-gold-text dark:text-[#E3B04B] truncate hidden lg:inline">
                  {tab === "accueil" || tab === "chat" ? "Conseils dermo-experts & Orbe IA 24/7" : "Kènè — Beauté mélanoderme"}
                </p>
              </div>
            </div>

            {/* 2. DROITE : Dermo Kènè + Actions rapides (Switcher, Cloche, Réglages, Thème) — 100% visibles même sur 320px */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 pr-1">
              {/* 👑 BOUTON DERMO KÈNÈ EN HAUT — Accès instantané à l'experte IA 24/7 (masqué sur l'onglet Dermo Kènè) */}
              {tab !== "chat" && tab !== "accueil" && (
                <button
                  type="button"
                  onClick={() => {
                    haptic(HAPTIC.tap);
                    unlockAudioContext();
                    useChat.getState().ensureEngaged(user?.name || "Cliente", user?.city);
                    if (typeof window !== "undefined") {
                      window.sessionStorage.setItem("kene:chat:speak_first", "true");
                      window.dispatchEvent(new CustomEvent("kene:chat:speak_first"));
                    }
                    goTab("accueil");
                  }}
                  aria-label={`${t("nav.chat.aria")}${chatUnread ? " — 1 nouveau message" : ""}`}
                  title="Consulter Dermo Kènè (Conseils dermo-cosmétiques & Chat IA 24/7)"
                  className="relative flex items-center gap-1 sm:gap-2 h-8 sm:h-11 px-2.5 sm:px-4 rounded-full border border-gold/60 bg-gradient-to-r from-gold/20 via-primary/15 to-card/90 hover:from-gold/30 hover:to-primary/25 text-foreground font-black transition-all active:scale-95 shadow-xs shrink-0 select-none cursor-pointer"
                >
                  <span className="relative grid size-5 sm:size-6 place-items-center rounded-full bg-gradient-to-br from-[#D49A24] to-[#C93B62] text-white shadow-xs shrink-0">
                    <MessageCircle size={12} className="text-white sm:hidden" />
                    <MessageCircle size={15} className="text-white hidden sm:block" />
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 sm:size-2.5 rounded-full bg-emerald-500 ring-1 ring-background animate-pulse" />
                  </span>
                  <span className="text-[11px] sm:text-sm font-black tracking-tight flex items-center gap-1 sm:gap-1.5 text-foreground whitespace-nowrap">
                    <span>Dermo Kènè</span>
                    <span className="hidden min-[410px]:inline-block text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[#9E2045]/15 text-[#9E2045] dark:text-[#F77698] border border-[#9E2045]/30 uppercase tracking-wider">
                      24/7
                    </span>
                  </span>
                  {chatUnread && (
                    <span className="size-2 sm:size-2.5 rounded-full bg-[#9E2045] ring-2 ring-background animate-bounce shrink-0" />
                  )}
                </button>
              )}

              {/* 🧴 Bouton direct Scanner INCI (visible tablette/desktop, accessible via Scanner et Dermo Kènè sur mobile) */}
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  setInciScannerOpen(true);
                }}
                title="Scanner un produit cosmétique (Détection Hydroquinone, Corticoïdes & Allergènes)"
                className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-gold/40 bg-gold/10 hover:bg-gold/20 text-gold-text text-xs font-bold active:scale-95 transition-all shadow-xs shrink-0 select-none cursor-pointer"
              >
                <ShieldAlert size={14} className="text-gold-text shrink-0" />
                <span>Scanner INCI</span>
              </button>

              {/* ✨ Badge Invité avec CTA direct vers compte gratuit (0 FCFA) */}
              {!isSaved && (
                <button
                  type="button"
                  onClick={() => {
                    haptic(HAPTIC.tap);
                    setLinkAccountOpen(true);
                  }}
                  title="Créer mon compte gratuit (0 FCFA) pour sauvegarder mes bilans à vie"
                  className="inline-flex items-center gap-1 sm:gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-[11px] sm:text-xs font-bold active:scale-95 transition-all shadow-2xs shrink-0 cursor-pointer"
                >
                  <Sparkles size={13} className="animate-pulse" />
                  <span className="hidden sm:inline">Créer mon compte (0 F)</span>
                  <span className="sm:hidden">Compte (0 F)</span>
                </button>
              )}

              {/* Sélecteur d'espace — Uniquement pour les professionnels ou administrateurs */}
              {(effectiveUser?.role === "pro" || effectiveUser?.role === "admin") && (
                <SpaceSwitcher variant="compact" />
              )}

              {/* Cloche notifications: flux temps réel + navigation en 1 tap */}
              <Suspense fallback={<BellLoading />}>
                <NotificationCenter
                  userId={effectiveUser.id}
                  onNavigate={(targetTab, zone) => {
                    if (zone) setPendingZone(zone);
                    goTab(targetTab);
                  }}
                />
              </Suspense>

              {/* Engrenage Paramètres — visible dès tablette sm+ (sur mobile accessible via onglet Profil) */}
              <button
                onClick={() => goTab("parametres")}
                aria-label={t("title.parametres")}
                className="hidden sm:grid place-items-center h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full text-foreground hover:bg-accent/60 active:scale-95 transition focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Settings className="size-4 sm:size-5" />
              </button>

              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
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
          {/* Indicateur pull-to-refresh (Instagram) — icône compacte et discrète */}
          {(pull > 0 || refreshing) && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 inset-x-0 z-30 flex flex-col items-center pt-1.5"
              style={{
                transform: `translateY(${refreshing ? 6 : Math.min(Math.max(pull - 16, 0), 28)}px)`,
                transition: pull > 0 ? "none" : "transform .2s ease",
              }}
            >
              <span className="grid place-items-center h-8 w-8 rounded-full k-chrome shadow-md border border-primary/20">
                {refreshing ? (
                  <Loader2 size={15} className="animate-spin text-primary" />
                ) : (
                  <NeaOnnimIcon size={15} className="text-primary" />
                )}
              </span>
            </div>
          )}
          {refreshing && <span role="status" className="sr-only">Actualisation du fil en cours</span>}
          <div className="mx-auto w-full max-w-[640px] px-2.5 sm:px-5 pt-2.5 sm:pt-3 pb-[calc(84px+env(safe-area-inset-bottom,0px))] md:pb-8">
            {/* Bannière incitative d'installation PWA si sur navigateur smartphone */}
            <SmartInstallBar />

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
                  {(tab === "accueil" || tab === "chat") && (
                    <ScreenBoundary name="Dermo Kènè">
                      <ChatScreen />
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
                  {tab === "boutique" && (
                    <ScreenBoundary name="Boutique & Produits">
                      <ShopScreen onBack={() => goTab("agenda")} />
                    </ScreenBoundary>
                  )}
                  {tab === "diagnostic" && (
                    <ScreenBoundary name="Diagnostic">
                      <DiagnosticScreen pendingZone={pendingZone} onZoneConsumed={onZoneConsumed} />
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

        {/* ───────── Tab-bar mobile flottante — calibrée pour Android 320px-360px (1 ligne stricte, zéro débordement) ───────── */}
        <nav
          aria-label="Navigation principale mobile"
          className="md:hidden absolute inset-x-0 bottom-0 z-40 pointer-events-none pb-[env(safe-area-inset-bottom,0px)]"
        >
          <div className="pointer-events-auto mx-2 sm:mx-3 mb-2 px-1 grid grid-cols-5 h-[64px] items-center rounded-[28px] bg-card/90 backdrop-blur-2xl border border-gold/40 shadow-xl shadow-black/15 relative overflow-hidden before:absolute before:inset-0 before:rounded-[28px] before:pointer-events-none before:border before:border-white/20 dark:before:border-white/5">
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
                    className="relative flex flex-col items-center justify-end h-full pb-1.5 min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <span
                      className={cn(
                        "grid place-items-center h-[46px] w-[46px] -mt-6 rounded-full border-4 border-background transition-all active:scale-95 shrink-0 shadow-lg shadow-gold/25 ring-2 ring-gold/50",
                        "bg-gradient-to-br from-gold via-primary to-bissap text-white",
                      )}
                    >
                      <NeaOnnimIcon size={21} />
                    </span>
                    <span className={cn("text-[10px] sm:text-[11px] leading-none whitespace-nowrap truncate max-w-full px-0.5 mt-1", active ? "text-primary font-bold" : "text-muted-foreground font-semibold")}>
                      {t(n.labelKey)}
                    </span>
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
                    "relative flex flex-col items-center justify-center gap-0.5 h-full min-w-0 px-0.5 overflow-hidden transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className="relative grid place-items-center rounded-full p-1 shrink-0">
                    {/* Blob actif — pastille or translucide qui glisse entre les onglets */}
                    {active && (
                      <motion.span
                        layoutId="nav-blob"
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-full bg-primary/18"
                        aria-hidden="true"
                      />
                    )}
                    <Icon className="relative size-[20px] sm:size-[22px]" />
                  </span>
                  <span className={cn("text-[10px] sm:text-[11px] leading-none tracking-tight whitespace-nowrap truncate w-full text-center", active ? "font-bold text-primary" : "font-semibold")}>
                    {t(n.labelKey)}
                  </span>
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
                <p className="font-heading font-bold truncate">{effectiveUser.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{effectiveUser.phone || "Mode Invité / Hors-ligne"}</p>
                <p className="text-[11px] text-muted-foreground truncate">{effectiveUser.city || "Abidjan"} · {effectiveUser.fitzpatrick ? `Fitzpatrick ${effectiveUser.fitzpatrick}` : "phototype à définir"}</p>
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
              onClick={() => goTab("agenda")}
              className="k-card k-card-hover rounded-[24px] p-3.5 text-left active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary border-primary/20 bg-primary/5"
              aria-label="Mon Agenda & Tous mes Rendez-vous"
            >
              <CalendarDays size={20} className="text-gold-text" />
              <p className="text-xs font-bold mt-1.5 leading-tight text-foreground/90">Mon Agenda<br /><span className="text-gold-text font-bold">Tous mes RDV 📅</span></p>
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

      {/* Modal dédié Scanner Cosmétique & INCI Kènè (autonome sans redirection vers l'orbe) */}
      <ClientInciScannerModal open={inciScannerOpen} onOpenChange={setInciScannerOpen} />

      {/* Modal de création de compte gratuit (0 FCFA) / sauvegarde permanente */}
      <LinkAccountModal open={linkAccountOpen} onClose={() => setLinkAccountOpen(false)} />

      {/* Visite guidée immersive de l'application Kènè (4 piliers) */}
      <AppWalkthroughTour
        open={walkthroughOpen}
        onClose={() => setWalkthroughOpen(false)}
      />

      {/* Guide visuel animé d'installation PWA (déclenché depuis les paramètres ou le rail) */}
      <SmartAppInstallModal
        open={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
      />
    </div>
  );
}
