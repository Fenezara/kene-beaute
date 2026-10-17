"use client";
// Kènè — Le Seuil: pavé numérique natif (inspiration Cash App / N26).
//
// Pourquoi un keypad maison: sur mobile, le clavier OS qui saute,
// couvre l'écran et force le mode numérique est LE friction n°1 des
// onboarding téléphone. Ici: pavé plein cadre, touches 64 px+, haptique
// visuelle (press scale), retour instantané — ça SENT l'app native dans un
// navigateur. Le préfixe +225 est fixe (mono-opérateur, contrat API actuel).
//
// Contrat: onConfirm(digits, devCode) — l'appel POST /api/auth/otp/request
// est fait ICI (l'écran OTP de l'Onboarding arrive pré-rempli via pont
// initialStep/initialDevCode). Aucune autre logique métier ici.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronLeft, Delete, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { useKene } from "@/store/kene";
import { AuroraBackdrop, Chip } from "@/components/kene/ui2026";
import { KeneEmblemLockup, CauriIcon } from "@/components/kene/icons";
import { BotHoneypot, createHumanPayload } from "@/components/kene/auth/BotHoneypot";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Numéro ivoirien = 10 chiffres (07 01 02 03 04) — 8 = plancher de
 * validité (contrat historique phoneValid), 10 = pleine longueur. */
const MAX_DIGITS = 10;
const MIN_DIGITS = 8;

/** Groupes de 2, respiration: « 07 01 02 03 04 » ou « 07 01 02 03 ». */
function formatDigits(d: string): string {
  return d.replace(/(\d{2})(?=\d)/g, "$1 ");
}

export function PhoneKeypad({
  mode,
  initialDigits = "",
  onConfirm,
  onBack,
  onSwitchSpace,
  onOfflineBypass,
  onNewClient,
}: {
  mode: "client" | "pro";
  initialDigits?: string;
  onConfirm: (digits: string) => Promise<void>;
  onBack: () => void;
  onSwitchSpace: () => void;
  onOfflineBypass?: () => void;
  onNewClient?: () => void;
}) {
  const [digits, setDigits] = useState(initialDigits.slice(0, MAX_DIGITS));
  const [loading, setLoading] = useState(false);
  const ready = digits.length >= MIN_DIGITS;
  const displayRef = useRef<HTMLDivElement>(null);

  // Chiffres supplémentaires: reste au clavier physique (desktop) —
  // le pavé tactile reste la voie principale (mobile-first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (/^\d$/.test(e.key)) {
        setDigits((d) => (d.length < MAX_DIGITS ? d + e.key : d));
      } else if (e.key === "Backspace") {
        setDigits((d) => d.slice(0, -1));
      } else if (e.key === "Enter" && ready) {
        void confirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, loading, digits]);

  async function confirm() {
    if (!ready || loading) return;
    setLoading(true);
    try {
      await onConfirm(digits);
    } finally {
      setLoading(false);
    }
  }

  function press(k: string) {
    if (loading) return;
    setDigits((d) => (d.length < MAX_DIGITS ? d + k : d));
  }

  return (
    <div className="relative isolate flex min-h-dvh w-full flex-col overflow-y-auto">
      <AuroraBackdrop />
      {/* ── Contexte: retour + espace choisi + bascule ── */}
      <div className="flex items-center gap-2 px-4 pt-5 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour à l'accueil"
          className="k-chip cursor-pointer inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 hover:text-foreground active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={onSwitchSpace}
          className="k-chip cursor-pointer ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-foreground/80 hover:text-foreground active:scale-95 transition-all"
          title="Changer d'espace"
        >
          {mode === "pro" ? "Espace entreprise" : "Espace cliente"}
        </button>
        <button
          type="button"
          onClick={onSwitchSpace}
          className="ml-auto cursor-pointer inline-flex min-h-11 items-center px-3 text-xs text-muted-foreground underline underline-offset-4 decoration-dotted hover:text-foreground active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary rounded"
        >
          Changer d'espace
        </button>
      </div>

      {/* ── Affichage du numéro ── */}
      <div className="flex flex-col items-center px-6 pt-5 sm:pt-7">
        <div className="mb-4">
          <KeneEmblemLockup size={48} labelSize={24} sublabel={mode === "pro" ? "Kènè Pro · Espace institut" : "Beauté mélanoderme"} />
        </div>
        <h1 className="font-heading text-[24px] sm:text-[26px] font-black leading-tight text-foreground">
          Ton numéro
        </h1>
        <p className="mt-1.5 text-center text-[13px] text-muted-foreground max-w-[340px]">
          Saisis ton numéro pour te connecter avec ton code secret à 4 chiffres (ex: 1234).
        </p>
        <div
          ref={displayRef}
          className="mt-6 flex flex-nowrap min-h-[64px] w-full max-w-[360px] sm:max-w-[400px] items-center justify-center gap-2 rounded-[20px] k-card px-4 py-2.5 whitespace-nowrap shadow-xs"
          aria-live="polite"
          aria-label={`Numéro saisi : +225 ${formatDigits(digits) || "en attente"}`}
        >
          <span className="font-mono text-[16px] sm:text-[18px] font-bold text-muted-foreground shrink-0 select-none">
            +225
          </span>
          <span
            className={cn(
              "font-mono font-bold tracking-[0.05em] text-foreground whitespace-nowrap shrink-0 transition-all",
              digits.length >= 8
                ? "text-[19px] sm:text-[22px]"
                : digits.length >= 5
                ? "text-[22px] sm:text-[25px]"
                : "text-[25px] sm:text-[28px]"
            )}
          >
            {formatDigits(digits) || <span className="text-muted-foreground/40 font-normal tracking-[0.2em]">· · · ·</span>}
          </span>
          {/* Caret — pulsation sur la saisie */}
          {digits.length > 0 && digits.length < MAX_DIGITS && (
            <motion.span
              aria-hidden="true"
              className="ml-0.5 h-6 sm:h-7 w-[2px] rounded-full bg-primary shrink-0"
              animate={{ opacity: [1, 0.15, 1] }}
              transition={{ duration: 1.1, repeat: Infinity }}
            />
          )}
        </div>
      </div>

      {/* ── Pavé tactile ── */}
      <div className="mx-auto mt-auto w-full max-w-[340px] px-4 pb-8 pt-6">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              disabled={loading}
              aria-label={`Chiffre ${k}`}
              className="k-chip cursor-pointer select-none active:scale-95 transition-transform h-[64px] rounded-[20px] font-mono text-[26px] font-bold text-foreground disabled:opacity-40 flex items-center justify-center"
            >
              {k}
            </button>
          ))}
          {/* Effacer */}
          <button
            type="button"
            onClick={() => setDigits((d) => d.slice(0, -1))}
            disabled={loading || digits.length === 0}
            aria-label="Effacer le dernier chiffre"
            className="k-chip cursor-pointer select-none active:scale-95 transition-transform h-[64px] rounded-[20px] text-foreground/70 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
          >
            <Delete size={24} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => press("0")}
            disabled={loading}
            aria-label="Chiffre 0"
            className="k-chip cursor-pointer select-none active:scale-95 transition-transform h-[64px] rounded-[20px] font-mono text-[26px] font-bold text-foreground disabled:opacity-40 flex items-center justify-center"
          >
            0
          </button>
          {/* Valider — or, pulse quand prêt */}
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!ready || loading}
            aria-label={ready ? "Recevoir mon code par SMS" : "Saisis 8 chiffres pour continuer"}
            className={cn(
              "cursor-pointer select-none active:scale-95 transition-all h-[64px] rounded-[20px] k-btn-gold text-primary-foreground flex items-center justify-center",
              ready ? "shadow-md hover:brightness-105" : "opacity-40 cursor-not-allowed"
            )}
          >
            {loading ? (
              <Loader2 size={26} className="mx-auto animate-spin" />
            ) : (
              <ArrowRight size={26} className="mx-auto" />
            )}
          </button>
        </div>
        <AnimatePresence>
          {ready && !loading && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-center text-[12px] text-muted-foreground"
            >
              Prêt — « → » envoie le code à <span className="font-mono text-foreground font-semibold whitespace-nowrap">+225 {formatDigits(digits)}</span>
            </motion.p>
          )}
        </AnimatePresence>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10.5px] text-muted-foreground/80">
          <ArrowLeft size={12} aria-hidden="true" /> Tu peux aussi taper au clavier
        </p>

        {onNewClient && (
          <div className="mt-4 pt-3 border-t border-border/40 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onNewClient}
              className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/40 bg-gold/15 hover:bg-gold/25 text-xs font-bold text-foreground transition-all shadow-xs active:scale-95"
            >
              <CauriIcon size={14} className="text-gold-text" />
              <span>Nouveau client ? Découvrir sans compte</span>
            </button>
          </div>
        )}

        {mode === "pro" && onOfflineBypass && (
          <div className="mt-4 pt-3 border-t border-border/40 flex flex-col items-center gap-2 w-full">
            <button
              type="button"
              onClick={onOfflineBypass}
              className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-muted bg-muted/40 hover:bg-muted/70 text-[11px] font-medium text-muted-foreground transition-all active:scale-95"
            >
              <span>📴 Mode Caisse &amp; Cabine Hors-ligne</span>
            </button>
          </div>
        )}

        <BotHoneypot />
      </div>
    </div>
  );
}

/** Requête OTP — appelée par le parent (garde le keypad muet côté métier). */
export async function requestOtp(phoneE164: string): Promise<string> {
  const res = await apiPost<{ ok: boolean; devCode?: string; smsSent?: boolean }>("/api/auth/otp/request", {
    phone: phoneE164,
    ...createHumanPayload(),
  });
  return res.devCode ?? "";
}

/** Toast standard du Seuil (erreur OTP). */
export function otpErrorToast(e: unknown) {
  toast.error(e instanceof Error ? e.message : "Envoi impossible");
}
