"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, ShieldCheck, X, LogIn } from "lucide-react";
import { useKene } from "@/store/kene";
import { performLogout } from "@/lib/kene/logout";
import { LinkAccountModal } from "./LinkAccountModal";

export function GuestSaveBanner() {
  const user = useKene((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Détection d'un compte invité (nouveau format +22500... ou Mariam Diallo legacy)
  const isGuest = Boolean(
    user && (
      user.phone?.startsWith("+22500") ||
      user.phone === "+2250701020304" ||
      user.id === "guest" ||
      user.name === "Nouvelle invitée"
    )
  );

  if (!isGuest || dismissed) return null;

  return (
    <>
      <aside
        aria-label="Sauvegarde du compte découverte"
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/15 via-gold/10 to-amber-600/10 border border-amber-500/30 p-3 sm:p-3.5 shadow-xs mb-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-500 dark:text-amber-400">
              <Sparkles size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate">
                Mode Découverte Kènè actif
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                Liez votre WhatsApp pour conserver vos bilans & ordonnances
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                void performLogout({ redirectUrl: "/?mode=client", message: "Connexion à votre compte", toGuest: false });
              }}
              className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-500/30 bg-background/80 hover:bg-background px-3 text-xs font-semibold text-foreground transition-colors"
            >
              <LogIn size={12} className="text-gold-text" />
              <span>Connexion</span>
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full k-btn-gold px-3 text-xs font-bold text-primary-foreground shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span>Sauvegarder</span>
              <ArrowRight size={12} />
            </button>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Fermer ce bandeau"
              className="grid size-7 place-items-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </aside>

      <LinkAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        reason="Associez votre propre numéro pour que votre ordonnance et vos conseils Dermo Kènè vous suivent sur tous vos appareils."
      />
    </>
  );
}
