"use client";
// Kènè Cliente — Orchestrateur : onboarding / écrans + nav bas sticky (mobile-first ≤430px)
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Home, MessageCircle, ShoppingBag } from "lucide-react";
import type { BodyZone } from "@/lib/kene/types";
import { NeaOnnimIcon, SankofaIcon } from "@/components/kene/icons";
import { useKene, type ClientTab } from "@/store/kene";
import { Onboarding } from "./Onboarding";
import { HomeScreen } from "./HomeScreen";
import { DiagnosticScreen } from "./DiagnosticScreen";
import { ShopScreen } from "./ShopScreen";
import { BookingScreen } from "./BookingScreen";
import { ChatScreen } from "./ChatScreen";
import { ProfileScreen } from "./ProfileScreen";

const NAV: { tab: ClientTab; label: string }[] = [
  { tab: "accueil", label: "Accueil" },
  { tab: "diagnostic", label: "Diagnostic" },
  { tab: "boutique", label: "Boutique" },
  { tab: "rdv", label: "RDV" },
  { tab: "chat", label: "Chat" },
];

export function ClientApp() {
  const user = useKene((s) => s.user);
  const tab = useKene((s) => s.clientTab);
  const setClientTab = useKene((s) => s.setClientTab);
  const cartCount = useKene((s) => s.cart.reduce((n, l) => n + l.qty, 0));
  const [chatUnread, setChatUnread] = useState(true);
  const [pendingZone, setPendingZone] = useState<BodyZone | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  function goTab(t: ClientTab) {
    if (t === "chat") setChatUnread(false);
    setClientTab(t);
  }

  const onScanZone = useCallback((z: BodyZone) => {
    setPendingZone(z);
    setClientTab("diagnostic");
  }, [setClientTab]);

  const onZoneConsumed = useCallback(() => setPendingZone(null), []);

  if (!user) return <Onboarding />;

  return (
    <div className="relative mx-auto w-full max-w-[430px] min-h-[70vh] flex flex-col bg-background">
      <div className="flex-1 px-4 pb-28">
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

      {/* Nav bas sticky */}
      <nav aria-label="Navigation principale" className="sticky bottom-0 z-30 glass-kene border-t border-border/70 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-[72px]">
          {NAV.map((n) => {
            const active = tab === n.tab;
            const isDiag = n.tab === "diagnostic";
            const Icon = n.tab === "accueil" ? Home : n.tab === "diagnostic" ? NeaOnnimIcon : n.tab === "boutique" ? ShoppingBag : n.tab === "rdv" ? SankofaIcon : MessageCircle;
            return (
              <button
                key={n.tab}
                onClick={() => goTab(n.tab)}
                aria-current={active ? "page" : undefined}
                aria-label={`${n.label}${n.tab === "chat" && chatUnread ? " — 1 nouveau message" : ""}`}
                className={`relative flex flex-col items-center justify-center gap-1 h-full transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {isDiag ? (
                  <span className={`grid place-items-center h-12 w-12 rounded-full shadow-lg -mt-5 border-4 border-background transition-all ${active ? "bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC]" : "bg-primary text-primary-foreground"}`}>
                    <NeaOnnimIcon size={22} />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                    {n.tab === "chat" && chatUnread && (
                      <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-[#8B1A3B] ring-2 ring-background" aria-hidden="true" />
                    )}
                    {n.tab === "boutique" && cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black grid place-items-center ring-2 ring-background" aria-hidden="true">
                        {cartCount}
                      </span>
                    )}
                  </span>
                )}
                <span className={`text-[10px] font-semibold ${isDiag ? "mt-0" : ""}`}>{n.label}</span>
                {active && <motion.span layoutId="nav-dot" className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
