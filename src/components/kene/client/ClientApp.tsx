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

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BriefcaseBusiness, CalendarDays, Home, MessageCircle, ShieldCheck, ShoppingBag, User } from "lucide-react";
import type { BodyZone } from "@/lib/kene/types";
import { KeneLogo, NeaOnnimIcon } from "@/components/kene/icons";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { useKene, type ClientTab } from "@/store/kene";
import { KenteIntro } from "@/components/kene/intro/KenteIntro";
import { useIntroDone } from "@/components/kene/intro/introState";
import { Onboarding } from "./Onboarding";
import { HomeScreen } from "./HomeScreen";
import { DiagnosticScreen } from "./DiagnosticScreen";
import { ShopScreen } from "./ShopScreen";
import { BookingScreen } from "./BookingScreen";
import { ChatScreen } from "./ChatScreen";
import { ProfileScreen } from "./ProfileScreen";
import { NotificationCenter } from "./NotificationCenter";
import { cn } from "@/lib/utils";

/** Navigation latérale (desktop) — libellés façon Instagram web */
const NAV_DESKTOP: { tab: ClientTab; label: string; icon: React.ComponentType<{ className?: string }>; scan?: boolean }[] = [
  { tab: "accueil", label: "Accueil", icon: Home },
  { tab: "diagnostic", label: "Scanner", icon: NeaOnnimIcon, scan: true },
  { tab: "boutique", label: "Boutique", icon: ShoppingBag },
  { tab: "rdv", label: "Rendez-vous", icon: CalendarDays },
  { tab: "chat", label: "Messages", icon: MessageCircle },
  { tab: "profil", label: "Profil", icon: User },
];

/** Tab-bar mobile — 5 emplacements, CTA scan central surélevé (TikTok-like) */
const NAV_MOBILE: { tab: ClientTab; label: string; icon: React.ComponentType<{ className?: string }>; scan?: boolean }[] = [
  { tab: "accueil", label: "Accueil", icon: Home },
  { tab: "boutique", label: "Boutik", icon: ShoppingBag },
  { tab: "diagnostic", label: "Scanner", icon: NeaOnnimIcon, scan: true },
  { tab: "rdv", label: "RDV", icon: CalendarDays },
  { tab: "profil", label: "Profil", icon: User },
];

const TITLES: Record<ClientTab, string> = {
  accueil: "Accueil",
  diagnostic: "Diagnostic IA",
  boutique: "Boutique",
  rdv: "Rendez-vous",
  chat: "Dr. Kènè",
  profil: "Mon profil",
};

export function ClientApp() {
  const user = useKene((s) => s.user);
  const tab = useKene((s) => s.clientTab);
  const setClientTab = useKene((s) => s.setClientTab);
  const setSpace = useKene((s) => s.setSpace);
  const cartCount = useKene((s) => s.cart.reduce((n, l) => n + l.qty, 0));
  const [chatUnread, setChatUnread] = useState(true);
  const [pendingZone, setPendingZone] = useState<BodyZone | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Fil de Kente : l'introduction immersive ne se montre qu'une fois
  // (useSyncExternalStore sur localStorage — sans mismatch d'hydratation)
  const introDone = useIntroDone();

  // Remonte en haut du flux à chaque changement d'onglet (scroll interne au shell)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  function goTab(t: ClientTab) {
    if (t === "chat") setChatUnread(false);
    setClientTab(t);
  }

  const onScanZone = useCallback(
    (z: BodyZone) => {
      setPendingZone(z);
      setClientTab("diagnostic");
    },
    [setClientTab],
  );

  const onZoneConsumed = useCallback(() => setPendingZone(null), []);

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
                    "xl:flex xl:flex-row xl:items-center xl:justify-start xl:gap-3 xl:px-3 xl:h-12 xl:bg-gradient-to-r xl:from-[#C8951E] xl:to-[#A0522D] xl:text-[#FFF9EC] xl:shadow-md xl:hover:shadow-lg",
                    "flex flex-col items-center gap-1 py-2.5",
                    active && "ring-2 ring-[#C8951E]/40 xl:ring-[#FFF9EC]/60",
                  )}
                >
                  <span className="grid place-items-center h-11 w-11 xl:h-6 xl:w-6 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] xl:bg-transparent xl:shadow-none shadow-md group-hover:scale-105 transition-transform">
                    <NeaOnnimIcon size={22} className="xl:hidden" />
                    <NeaOnnimIcon size={19} className="hidden xl:block" />
                  </span>
                  <span className={cn("text-[10px] xl:text-sm font-semibold xl:font-bold tracking-wide", active ? "text-primary xl:text-inherit" : "text-muted-foreground xl:text-inherit")}>
                    {n.label}
                  </span>
                </button>
              );
            }
            return (
              <button
                key={n.tab}
                onClick={() => goTab(n.tab)}
                aria-current={active ? "page" : undefined}
                aria-label={`${n.label}${n.tab === "chat" && chatUnread ? " — 1 nouveau message" : ""}${n.tab === "boutique" && cartCount > 0 ? ` — ${cartCount} article${cartCount > 1 ? "s" : ""} au panier` : ""}`}
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
                    <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black grid place-items-center ring-2 ring-card" aria-hidden="true">
                      {cartCount}
                    </span>
                  )}
                </span>
                <span className={cn("text-[10px] xl:text-[15px]", active ? "font-bold" : "font-medium")}>{n.label}</span>
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
            <span className="text-[9px] xl:text-[13px] font-medium">Espace Pro</span>
          </button>
          <button
            onClick={() => setSpace("admin")}
            className="flex flex-col xl:flex-row items-center justify-center xl:justify-start gap-1 xl:gap-3.5 py-2.5 xl:py-0 xl:h-11 xl:px-3 rounded-2xl text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ShieldCheck className="size-[18px]" />
            <span className="text-[9px] xl:text-[13px] font-medium">Console Admin</span>
          </button>
          <p className="hidden xl:block px-3 pt-2 text-[10px] leading-relaxed text-muted-foreground/70">
            Kènè POC — paiements simulés · estimations IA non médicales
          </p>
        </div>
      </aside>

      {/* ───────── Colonne principale ───────── */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        {/* Header unique responsive : mobile = logo + actions ; desktop = titre + actions */}
        <header className="shrink-0 z-40 glass-kene border-b border-border/70">
          <div className="h-14 sm:h-16 flex items-center justify-between gap-2 px-3 sm:px-5">
            <div className="md:hidden">
              <KeneLogo size={32} withText />
            </div>
            <div className="hidden md:flex items-baseline gap-2.5 min-w-0">
              <h1 className="font-heading font-bold text-lg xl:text-xl truncate">{TITLES[tab]}</h1>
              <p className="text-[11px] text-muted-foreground truncate hidden xl:block">
                {tab === "accueil" ? `Bonjour ${first} ✨` : tab === "chat" ? "Éducation cutanée · en ligne" : "Kènè — la beauté mélanoderme"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {/* Cloche notifications : flux temps réel (notify-service) */}
              <NotificationCenter userId={user.id} />
              <button
                onClick={() => goTab("chat")}
                aria-label={`Dr. Kènè — chat${chatUnread ? " — 1 nouveau message" : ""}`}
                className="md:hidden relative grid place-items-center h-11 w-11 rounded-full text-foreground hover:bg-accent/60 active:scale-95 transition focus-visible:outline-2 focus-visible:outline-primary"
              >
                <MessageCircle size={21} />
                {chatUnread && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-[#8B1A3B] ring-2 ring-background" aria-hidden="true" />}
              </button>
              <ThemeToggle />
            </div>
          </div>
          <div aria-hidden="true" className="kente-band-soft h-[3px] w-full" />
        </header>

        {/* Zone de flux — scroll interne (l'app ne scrolle jamais le document) */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain pretty-scroll">
          <div className="mx-auto w-full max-w-[640px] px-3 sm:px-5 pt-3 pb-28 md:pb-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {tab === "accueil" && <HomeScreen onScanZone={onScanZone} />}
                {tab === "diagnostic" && <DiagnosticScreen pendingZone={pendingZone} onZoneConsumed={onZoneConsumed} />}
                {tab === "boutique" && <ShopScreen />}
                {tab === "rdv" && <BookingScreen />}
                {tab === "chat" && <ChatScreen />}
                {tab === "profil" && <ProfileScreen />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ───────── Tab-bar mobile (CTA scan central surélevé) ───────── */}
        <nav
          aria-label="Navigation principale mobile"
          className="md:hidden shrink-0 z-40 glass-kene border-t border-border/70 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-5 h-[68px]">
            {NAV_MOBILE.map((n) => {
              const active = tab === n.tab;
              const Icon = n.icon;
              if (n.scan) {
                return (
                  <button
                    key={n.tab}
                    onClick={() => goTab(n.tab)}
                    aria-current={active ? "page" : undefined}
                    aria-label="Scanner ma peau — diagnostic IA"
                    className="relative flex flex-col items-center justify-end pb-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  >
                    <span
                      className={cn(
                        "grid place-items-center h-[52px] w-[52px] -mt-6 rounded-full border-4 border-background shadow-lg transition-all active:scale-95",
                        active ? "bg-gradient-to-br from-[#C8951E] to-[#8B1A3B]" : "bg-gradient-to-br from-[#C8951E] to-[#A0522D]",
                      )}
                    >
                      <NeaOnnimIcon size={24} />
                    </span>
                    <span className={cn("text-[10px] font-semibold mt-0.5", active ? "text-primary" : "text-muted-foreground")}>Scanner</span>
                  </button>
                );
              }
              return (
                <button
                  key={n.tab}
                  onClick={() => goTab(n.tab)}
                  aria-current={active ? "page" : undefined}
                  aria-label={n.label + (n.tab === "boutique" && cartCount > 0 ? ` — ${cartCount} article${cartCount > 1 ? "s" : ""} au panier` : "")}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 h-full transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className="relative">
                    <Icon className={active ? "size-[23px] font-bold" : "size-[23px]"} />
                    {n.tab === "boutique" && cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black grid place-items-center ring-2 ring-background" aria-hidden="true">
                        {cartCount}
                      </span>
                    )}
                  </span>
                  <span className={cn("text-[10px]", active ? "font-bold" : "font-semibold")}>{n.label}</span>
                  {active && <motion.span layoutId="tab-dot" className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
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
              <span className="grid place-items-center h-14 w-14 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] font-heading font-bold text-xl shadow">
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
              Voir mon profil
            </button>
          </div>

          {/* Actions rapides */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => goTab("diagnostic")} className="rounded-2xl bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] p-3.5 text-left shadow-md active:scale-[0.97] transition-transform focus-visible:outline-2 focus-visible:outline-primary" aria-label="Scanner ma peau">
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
