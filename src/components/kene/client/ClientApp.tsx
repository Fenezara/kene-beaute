"use client";
// Kènè Cliente — Shell applicatif plein écran, expérience type réseaux sociaux 2026
// (Instagram / TikTok / Facebook) :
//   • Mobile (<md)  : header glass (logo · cloche · chat) + flux plein cadre + tab-bar bas
//               5 onglets avec CTA « Scanner » central surélevé.
//   • Tablette (md+) : rail d'icônes 84 px (façon TikTok iPad / Instagram web compacte)
//               + colonne centrée — l'écran large est exploité dès 768 px.
//   • Desktop  (xl) : sidebar complète libellée + feed centré max 640 px + rail droit
//               (mini-profil, actions rapides, mentions légales) — zéro espace perdu.
// Le Fil de Kente (intro) et l'onboarding restent plein cadre, hors shell.
// Résilience + code splitting (t. 63-a) : chaque écran d'onglet vit derrière une
// ScreenBoundary (erreur locale = carte inline, l'app reste vivante) et les écrans
// lourds sont lazy (chunk dédié au premier clic — HomeScreen/Onboarding eager).
// Gate d'hydratation : BootSkeleton tant que le store persisté n'est pas relu.

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BriefcaseBusiness, CalendarDays, Home, Loader2, MessageCircle, ShieldCheck, ShoppingBag, User, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { BodyZone } from "@/lib/kene/types";
import { HAPTIC, haptic, isOnline } from "@/lib/kene/ux";
import { formatTime } from "@/lib/kene/format";
import { KeneLogo, NeaOnnimIcon } from "@/components/kene/icons";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { useKene, type ClientTab } from "@/store/kene";
import { useT } from "@/lib/kene/use-t";
import { KenteIntro } from "@/components/kene/intro/KenteIntro";
import { useIntroDone } from "@/components/kene/intro/introState";
import { Onboarding } from "./Onboarding";
import { HomeScreen } from "./HomeScreen";
import { ProfileScreen } from "./ProfileScreen";
import { ScreenBoundary } from "./ScreenBoundary";
import { BootSkeleton } from "./BootSkeleton";
import { cn } from "@/lib/utils";

/** Navigation latérale (desktop) — libellés façon Instagram web.
 *  labelKey = clé i18n (repli français) — t() résout à l'affichage. */
const NAV_DESKTOP: { tab: ClientTab; labelKey: string; icon: React.ComponentType<{ className?: string }>; scan?: boolean }[] = [
  { tab: "accueil", labelKey: "tab.home", icon: Home },
  { tab: "diagnostic", labelKey: "tab.scan", icon: NeaOnnimIcon, scan: true },
  { tab: "boutique", labelKey: "tab.shop", icon: ShoppingBag },
  { tab: "rdv", labelKey: "tab.rdv", icon: CalendarDays },
  { tab: "chat", labelKey: "tab.chat", icon: MessageCircle },
  { tab: "profil", labelKey: "tab.profile", icon: User },
];

/** Tab-bar mobile — 5 emplacements, CTA scan central surélevé (TikTok-like) */
const NAV_MOBILE: { tab: ClientTab; labelKey: string; icon: React.ComponentType<{ className?: string }>; scan?: boolean }[] = [
  { tab: "accueil", labelKey: "tab.home", icon: Home },
  { tab: "boutique", labelKey: "tab.shop.short", icon: ShoppingBag },
  { tab: "diagnostic", labelKey: "tab.scan", icon: NeaOnnimIcon, scan: true },
  { tab: "rdv", labelKey: "tab.rdv.short", icon: CalendarDays },
  { tab: "profil", labelKey: "tab.profile", icon: User },
];

const TITLES: Record<ClientTab, string> = {
  accueil: "title.home",
  diagnostic: "title.diag",
  boutique: "title.shop",
  rdv: "title.rdv",
  chat: "title.chat",
  profil: "title.profile",
};

/** Ordre de balayage mobile (swipe horizontal gauche/droite — TikTok-like) */
const SWIPE_ORDER: ClientTab[] = ["accueil", "boutique", "diagnostic", "rdv", "profil"];

// ─── Code splitting par onglet (t. 63-a) ───
// Les écrans lourds rejoignent le bundle uniquement à la demande : le premier
// clic Diagnostic / Boutique / RDV / Chat télécharge le chunk dédié (visible
// dans l'onglet Network du navigateur). HomeScreen et Onboarding restent
// eager (premier rendu complet). Exports nommés → default attendu par lazy.
const DiagnosticScreen = lazy(() => import("./DiagnosticScreen").then((m) => ({ default: m.DiagnosticScreen })));
const ShopScreen = lazy(() => import("./ShopScreen").then((m) => ({ default: m.ShopScreen })));
const BookingScreen = lazy(() => import("./BookingScreen").then((m) => ({ default: m.BookingScreen })));
const ChatScreen = lazy(() => import("./ChatScreen").then((m) => ({ default: m.ChatScreen })));
// Cloche + Sheet notifications : lazy aussi (socket.io du header sort du premier rendu)
const NotificationCenter = lazy(() => import("./NotificationCenter").then((m) => ({ default: m.NotificationCenter })));

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

/** Cloche en attente — même empreinte (h-11 w-11) que le bouton final : zéro décalage du header */
function BellLoading() {
  return (
    <span role="status" aria-busy="true" className="grid place-items-center h-11 w-11">
      <Loader2 size={20} className="animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Chargement…</span>
    </span>
  );
}

export function ClientApp() {
  const { t } = useT();
  const user = useKene((s) => s.user);
  const tab = useKene((s) => s.clientTab);
  const setClientTab = useKene((s) => s.setClientTab);
  const setSpace = useKene((s) => s.setSpace);
  const cartCount = useKene((s) => s.cart.reduce((n, l) => n + l.qty, 0));
  // Gate d'hydratation kene-store (contrat t. 63-b) : _keneHydrated passe à
  // true quand la relecture localStorage est finie (onRehydrateStorage, même
  // en cas d'erreur — la porte ne se verrouille jamais). Typage tolérant : si
  // 63-b était absent, fallback true = comportement d'avant (zéro régression).
  const hydrated = useKene((s) => (s as { _keneHydrated?: boolean })._keneHydrated ?? true);
  // Badge chat honnête : faux par défaut — seul un message ENTRANT (événement
  // « kene:chat:new » dispatché par ChatScreen) l'allume, voir l'effet plus bas
  const [chatUnread, setChatUnread] = useState(false);
  const [pendingZone, setPendingZone] = useState<BodyZone | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Fil de Kente : l'introduction immersive ne se montre qu'une fois
  // (useSyncExternalStore sur localStorage — sans mismatch d'hydratation)
  const introDone = useIntroDone();

  // ─── Pull-to-refresh (Instagram / Wave) ───
  const [pull, setPull] = useState(0);          // distance d'étirement (px, résistive)
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const pullStart = useRef<{ y: number; x: number; atTop: boolean } | null>(null);
  const wasRefreshing = useRef(false);

  // ─── Swipe horizontal entre onglets (TikTok) ───
  const swipeStart = useRef<{ x: number; y: number; ok: boolean } | null>(null);

  // ─── Direction de transition (sens de navigation) + connectivité ───
  const [navDir, setNavDir] = useState<1 | -1>(1);
  const [online, setOnline] = useState(true);

  // Bandeau hors-ligne — résilience réseau façon Wave
  useEffect(() => {
    const update = () => setOnline(isOnline());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Relecture du store persisté (kene-store, skipHydration t. 63-b) — UNE fois
  // au montage, idempotente (le store a aussi son propre filet « load ») :
  // c'est ceci qui restaure l'état persisté (space/user/panier/onglet) après
  // le premier rendu client — le BootSkeleton couvre exactement cette fenêtre.
  useEffect(() => {
    void useKene.persist.rehydrate();
  }, []);

  // Badge chat honnête : l'événement « kene:chat:new » (CustomEvent, détail
  // { at } — dispatché par ChatScreen, contrat figé t. 63) n'allume le point
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

  function goTab(t: ClientTab) {
    if (t !== tab) {
      const from = SWIPE_ORDER.indexOf(tab);
      const to = SWIPE_ORDER.indexOf(t);
      if (from >= 0 && to >= 0) setNavDir(to > from ? 1 : -1);
      haptic(HAPTIC.tap);
    }
    if (t === "chat") setChatUnread(false);
    setClientTab(t);
  }

  // ─── Gestes tactiles du conteneur de flux ───
  const onTouchStart = (e: React.TouchEvent) => {
    const el = scrollRef.current;
    const t = e.touches[0];
    pullStart.current = { y: t.clientY, x: t.clientX, atTop: !el || el.scrollTop <= 0 };
    // le swipe est ignoré s'il démarre dans une rangée horizontale scrollable
    const target = e.target as HTMLElement;
    const inScrollRow = !!target.closest("[data-scroll-row]");
    swipeStart.current = { x: t.clientX, y: t.clientY, ok: !inScrollRow };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (refreshing) return;
    const s = pullStart.current;
    if (!s || !s.atTop) return;
    const t = e.touches[0];
    const dy = t.clientY - s.y;
    const dx = t.clientX - s.x;
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) return; // tirage vertical uniquement
    setPull(Math.min(dy / 2.2, 96)); // résistif : l'icône s'alourdit en fin de course
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    // 1) fin de tirage → actualisation si seuil franchi
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
    // 2) swipe horizontal → onglet voisin
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s || !s.ok || refreshing) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const idx = SWIPE_ORDER.indexOf(tab);
    if (idx < 0) return;
    const next = dx < 0 ? SWIPE_ORDER[idx + 1] : SWIPE_ORDER[idx - 1];
    if (next) {
      setNavDir(dx < 0 ? 1 : -1);
      haptic(HAPTIC.tap);
      setClientTab(next);
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

  // Store persisté pas encore relu → squelette d'amorçage (évite le flash
  // d'onboarding avant la restauration de la session — t. 63)
  if (!hydrated) return <BootSkeleton />;

  if (!user) {
    if (!introDone) return <KenteIntro />;
    return <Onboarding />;
  }

  const first = user.name.split(" ")[0];

  return (
    <div className="h-dvh flex overflow-hidden bg-background">
      {/* ───────── Rail latéral tablette + desktop (md+) ───────── */}
      <aside
        aria-label="Navigation principale"
        className="hidden md:flex w-[84px] xl:w-[248px] shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur"
      >
        <div className="h-16 flex items-center px-4 xl:px-5 border-b border-border/60">
          <span className="hidden xl:block">
            <KeneLogo size={34} withText />
          </span>
          <span className="xl:hidden mx-auto">
            <KeneLogo size={34} />
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto pretty-scroll px-2.5 xl:px-4 py-4 flex flex-col gap-1.5">
          {NAV_DESKTOP.map((n) => {
            const active = tab === n.tab;
            const Icon = n.icon;
            if (n.scan) {
              return (
                <button
                  key={n.tab}
                  onClick={() => goTab(n.tab)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group rounded-2xl transition-all focus-visible:outline-2 focus-visible:outline-primary",
                    "xl:flex xl:flex-row xl:items-center xl:justify-start xl:gap-3 xl:px-3 xl:h-12 xl:bg-gradient-to-r xl:from-[#A0522D] xl:to-[#8B1A3B] xl:text-[#FFF9EC] xl:shadow-md xl:hover:shadow-lg",
                    "flex flex-col items-center gap-1 py-2.5",
                    active && "ring-2 ring-[#C8951E]/40 xl:ring-[#FFF9EC]/60",
                  )}
                >
                  <span className="grid place-items-center h-11 w-11 xl:h-6 xl:w-6 rounded-full bg-gradient-to-br from-[#A0522D] to-[#8B1A3B] text-[#FFF9EC] xl:bg-transparent xl:shadow-none shadow-md group-hover:scale-105 transition-transform">
                    <NeaOnnimIcon size={22} className="xl:hidden" />
                    <NeaOnnimIcon size={19} className="hidden xl:block" />
                  </span>
                  <span className={cn("text-[10px] xl:text-sm font-semibold xl:font-bold tracking-wide", active ? "text-primary xl:text-inherit" : "text-muted-foreground xl:text-inherit")}>
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
                aria-label={`${t(n.labelKey)}${n.tab === "chat" && chatUnread ? " — 1 nouveau message" : ""}${n.tab === "boutique" && cartCount > 0 ? ` — ${cartCount} article${cartCount > 1 ? "s" : ""} au panier` : ""}`}
                className={cn(
                  "relative flex flex-col xl:flex-row items-center justify-center xl:justify-start gap-1 xl:gap-3.5 py-2.5 xl:py-0 xl:h-12 xl:px-3 rounded-2xl transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className={active ? "size-[22px] font-bold" : "size-[22px]"} />
                  {n.tab === "chat" && chatUnread && (
                    <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-[#8B1A3B] ring-2 ring-card" aria-hidden="true" />
                  )}
                  {n.tab === "boutique" && cartCount > 0 && (
                    <motion.span
                      key={cartCount}
                      initial={{ scale: 0.4 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 18 }}
                      className="absolute -top-1.5 -right-2 h-4 min-w-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black grid place-items-center ring-2 ring-card" aria-hidden="true"
                    >
                      {cartCount}
                    </motion.span>
                  )}
                </span>
                <span className={cn("text-[10px] xl:text-[15px]", active ? "font-bold" : "font-medium")}>{t(n.labelKey)}</span>
                {active && <motion.span layoutId="side-indicator" className="hidden xl:block absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        {/* Bas de sidebar : bascule d'espaces + micro légal */}
        <div className="border-t border-border/60 p-2.5 xl:p-4 flex flex-col gap-1.5">
          <button
            onClick={() => setSpace("pro")}
            className="flex flex-col xl:flex-row items-center justify-center xl:justify-start gap-1 xl:gap-3.5 py-2.5 xl:py-0 xl:h-11 xl:px-3 rounded-2xl text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          >
            <BriefcaseBusiness className="size-[18px]" />
            <span className="text-[9px] xl:text-[13px] font-medium">{t("space.pro")}</span>
          </button>
          <button
            onClick={() => setSpace("admin")}
            className="flex flex-col xl:flex-row items-center justify-center xl:justify-start gap-1 xl:gap-3.5 py-2.5 xl:py-0 xl:h-11 xl:px-3 rounded-2xl text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ShieldCheck className="size-[18px]" />
            <span className="text-[9px] xl:text-[13px] font-medium">{t("space.admin")}</span>
          </button>
          <p className="hidden xl:block px-3 pt-2 text-[10px] leading-relaxed text-muted-foreground/70">
            Kènè POC — paiements simulés · estimations IA non médicales
          </p>
        </div>
      </aside>

      {/* ───────── Colonne principale ───────── */}
      <div className="relative flex-1 min-w-0 flex flex-col h-full">
        {/* Header unique responsive : mobile = logo + actions ; desktop = titre + actions */}
        <header className="shrink-0 z-40 glass-kene backdrop-blur-[16px] border-b border-border/70">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-2 px-3 sm:px-5">
            <div className="md:hidden">
              <KeneLogo size={32} withText />
            </div>
            {/* h1 de vue : présent pour les lecteurs d'écran à TOUS les formats
                (sr-only mobile, visible md+ — un seul h1 par vue) */}
            <div className="flex items-baseline gap-2.5 min-w-0">
              <h1 className="sr-only md:not-sr-only md:font-heading md:font-bold md:text-lg xl:text-xl truncate">{t(TITLES[tab])}</h1>
              <p className="hidden xl:block text-[11px] text-muted-foreground truncate">
                {tab === "accueil" ? `${t("home.greeting")} ${first} ✨` : tab === "chat" ? "Éducation cutanée · en ligne" : "Kènè — la beauté mélanoderme"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {/* Cloche notifications : flux temps réel (notify-service) —
                  lazy : socket.io + Sheet chargés dans leur propre chunk */}
              <Suspense fallback={<BellLoading />}>
                <NotificationCenter userId={user.id} />
              </Suspense>
              <button
                onClick={() => goTab("chat")}
                aria-label={`${t("nav.chat.aria")}${chatUnread ? " — 1 nouveau message" : ""}`}
                className="md:hidden relative grid place-items-center h-11 w-11 rounded-full text-foreground hover:bg-accent/60 active:scale-95 transition focus-visible:outline-2 focus-visible:outline-primary"
              >
                <MessageCircle size={21} />
                {chatUnread && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-[#8B1A3B] ring-2 ring-background" aria-hidden="true" />}
              </button>
              <ThemeToggle />
            </div>
          </div>
          <div aria-hidden="true" className="kente-band-soft h-[3px] w-full" />
          {/* Bandeau hors-ligne — le contenu affiché reste disponible (façon Wave) */}
          {!online && (
            <div role="status" className="flex items-center justify-center gap-2 bg-gold/15 text-gold-text text-[11px] font-semibold py-1.5 border-b border-gold/30">
              <WifiOff size={13} aria-hidden="true" />
              {t("common.offline")}
            </div>
          )}
        </header>

        {/* Zone de flux — scroll interne (l'app ne scrolle jamais le document)
            Gestes : tirer-actualiser + balayage horizontal entre onglets (tactile) */}
        <div
          ref={scrollRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain pretty-scroll"
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
              <span className="grid place-items-center h-11 w-11 rounded-full glass-kene backdrop-blur-[16px] border border-border shadow-md">
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, x: 16 * navDir, y: 6 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: -12 * navDir, y: -4 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {/* Suspense DANS le motion.div : le squelette d'attente participe
                    à la transition d'onglet pendant le chargement du chunk */}
                <Suspense fallback={<TabLoading />}>
                  {tab === "accueil" && (
                    <ScreenBoundary name="Accueil">
                      <HomeScreen onScanZone={onScanZone} refreshKey={refreshKey} onRefreshed={onRefreshed} />
                    </ScreenBoundary>
                  )}
                  {tab === "diagnostic" && (
                    <ScreenBoundary name="Diagnostic">
                      <DiagnosticScreen pendingZone={pendingZone} onZoneConsumed={onZoneConsumed} />
                    </ScreenBoundary>
                  )}
                  {tab === "boutique" && (
                    <ScreenBoundary name="Boutique">
                      <ShopScreen />
                    </ScreenBoundary>
                  )}
                  {tab === "rdv" && (
                    <ScreenBoundary name="Rendez-vous">
                      <BookingScreen />
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
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ───────── Tab-bar mobile flottante — pilule de verre 2026 (façon Instagram/TikTok) ───────── */}
        <nav
          aria-label="Navigation principale mobile"
          className="md:hidden absolute inset-x-0 bottom-0 z-40 pointer-events-none pb-[env(safe-area-inset-bottom)]"
        >
          <div className="pointer-events-auto mx-3 mb-2.5 grid grid-cols-5 h-[64px] rounded-[26px] glass-kene backdrop-blur-[16px] border border-border/60 shadow-[0_14px_38px_-10px_rgba(28,17,9,0.42)]">
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
                        "grid place-items-center h-[50px] w-[50px] -mt-7 rounded-full border-4 border-background shadow-lg transition-all active:scale-95",
                        "bg-gradient-to-br from-[#A0522D] to-[#8B1A3B]",
                      )}
                    >
                      <NeaOnnimIcon size={23} />
                    </span>
                    <span className={cn("text-[10px] font-semibold mt-0.5", active ? "text-primary" : "text-muted-foreground")}>{t(n.labelKey)}</span>
                  </button>
                );
              }
              return (
                <button
                  key={n.tab}
                  onClick={() => goTab(n.tab)}
                  aria-current={active ? "page" : undefined}
                  aria-label={t(n.labelKey) + (n.tab === "boutique" && cartCount > 0 ? ` — ${cartCount} article${cartCount > 1 ? "s" : ""} au panier` : "")}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 h-full transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <motion.span
                    animate={active ? { scale: 1.12 } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    className={cn("relative grid place-items-center rounded-full p-1.5 transition-colors", active && "bg-primary/15")}
                  >
                    <Icon className="size-[22px]" />
                    {n.tab === "boutique" && cartCount > 0 && (
                      <motion.span
                        key={cartCount}
                        initial={{ scale: 0.4 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 18 }}
                        className="absolute -top-1 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black grid place-items-center ring-2 ring-background" aria-hidden="true"
                      >
                        {cartCount}
                      </motion.span>
                    )}
                  </motion.span>
                  <span className={cn("text-[10px]", active ? "font-bold" : "font-semibold")}>{t(n.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* ───────── Rail droit desktop (xl+, accueil) — façon Instagram web ───────── */}
      {tab === "accueil" && (
        <aside aria-label="Informations et raccourcis" className="hidden xl:flex w-[320px] shrink-0 flex-col gap-4 border-l border-border bg-card/40 backdrop-blur p-5 overflow-y-auto pretty-scroll">
          {/* Mini-profil */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <span className="grid place-items-center h-14 w-14 rounded-full bg-gradient-to-br from-[#A0522D] to-[#8B1A3B] text-[#FFF9EC] font-heading font-bold text-xl shadow">
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
              className="mt-3.5 h-10 w-full rounded-xl border border-primary/40 bg-primary/10 text-primary text-xs font-bold active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              {t("rail.view.profile")}
            </button>
          </div>

          {/* Actions rapides */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => goTab("diagnostic")} className="rounded-2xl bg-gradient-to-br from-[#A0522D] to-[#8B1A3B] text-[#FFF9EC] p-3.5 text-left shadow-md active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary" aria-label={t("home.scan.cta")}>
              <NeaOnnimIcon size={20} />
              <p className="text-xs font-bold mt-1.5 leading-tight">Scanner<br />ma peau</p>
            </button>
            <button onClick={() => goTab("boutique")} className="rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary" aria-label="Boutique">
              <ShoppingBag size={20} className="text-primary" />
              <p className="text-xs font-bold mt-1.5 leading-tight text-foreground/90">Boutique<br />botaniques</p>
            </button>
            <button onClick={() => goTab("rdv")} className="rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary" aria-label="Rendez-vous">
              <CalendarDays size={20} className="text-primary" />
              <p className="text-xs font-bold mt-1.5 leading-tight text-foreground/90">Prendre<br />RDV</p>
            </button>
            <button onClick={() => goTab("chat")} className="rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary" aria-label="Dr. Kènè — chat">
              <MessageCircle size={20} className="text-primary" />
              <p className="text-xs font-bold mt-1.5 leading-tight text-foreground/90">Dr. Kènè<br />chat IA</p>
            </button>
          </div>

          {/* Mentions légales */}
          <div className="mt-auto rounded-2xl border border-dashed border-border bg-card/60 p-4 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-heading font-bold text-xs text-foreground/80 mb-1.5">Kènè — POC</p>
            <p>Paiements Wave / Orange Money simulés · estimations IA non médicales.</p>
            <p className="mt-1">Conforme CNPS CI / IPM SN / SYSCOHADA.</p>
            <p className="mt-2 font-heading text-primary">« La beauté mélanoderme, de A à Z. »</p>
          </div>
        </aside>
      )}
    </div>
  );
}
