"use client";

import { useState } from "react";
import { ArrowRight, ShieldCheck, X, LogIn, Sparkles, AlertCircle } from "lucide-react";
import { NsorommaIcon, CauriIcon } from "@/components/kene/icons";
import { useKene, isSavedUser } from "@/store/kene";
import { LinkAccountModal } from "./LinkAccountModal";

export function GuestSaveBanner() {
  const user = useKene((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Détection d'un compte invité non sauvegardé
  const isGuest = Boolean(user && !isSavedUser(user));

  if (!isGuest || dismissed) return null;

  return (
    <>
      <aside
        aria-label="Avertissement mode invité et création de compte gratuit"
        className="relative overflow-hidden rounded-[20px] bg-gradient-to-r from-[#C8951E]/20 via-[#A0522D]/15 to-[#8B1A3B]/15 border-2 border-[#C8951E]/40 p-3.5 sm:p-4 shadow-md mb-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#C8951E]/25 text-[#C8951E] shadow-xs mt-0.5 sm:mt-0">
              <Sparkles size={18} className="animate-pulse" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-wider">
                  <AlertCircle size={11} /> Mode Invité Temporaire
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  (Non enregistré)
                </span>
              </div>
              <p className="text-xs sm:text-[13px] font-bold text-foreground mt-1 leading-snug">
                Vos diagnostics cutanés seront perdus si vous quittez l'application.
              </p>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Créez votre compte gratuit en 10 secondes avec votre numéro WhatsApp pour conserver vos bilans, votre Passeport Peau et vos ordonnances à vie.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("kene:open-login"));
                }
              }}
              className="hidden md:inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background/80 hover:bg-background px-3.5 text-xs font-semibold text-foreground transition-colors"
            >
              <LogIn size={13} className="text-gold-text" />
              <span>Déjà cliente ?</span>
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full k-btn-gold px-4 text-xs font-black text-primary-foreground shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
            >
              <span>Créer mon compte (0 FCFA)</span>
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Fermer ce bandeau temporairement"
              className="grid size-8 place-items-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </aside>

      <LinkAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        reason="Votre compte est 100% gratuit. Entrez votre numéro WhatsApp pour sauvegarder définitivement vos scores de peau, ordonnances et rituels botaniques."
      />
    </>
  );
}
