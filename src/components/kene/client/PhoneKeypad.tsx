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
import { KeneEmblemLockup } from "@/components/kene/icons";

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
}: {
  mode: "client" | "pro";
  initialDigits?: string;
  onConfirm: (digits: string) => Promise<void>;
  onBack: () => void;
  onSwitchSpace: () => void;
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
          onClick={onBack}
          aria-label="Retour à l'accueil"
          className="k-chip inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronLeft size={20} />
        </button>
        <Chip selected className="ml-1">
          {mode === "pro" ? "Espace entreprise" : "Espace cliente"}
        </Chip>
        <button
          onClick={onSwitchSpace}
          className="ml-auto inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground underline underline-offset-4 decoration-dotted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded"
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
        <p className="mt-1.5 text-center text-[13px] text-muted-foreground">
          Le code arrive par SMS — 10 chiffres après l'indicatif.
        </p>
        <div
          ref={displayRef}
          className="mt-6 flex min-h-[64px] w-full max-w-[300px] items-center justify-center gap-2 rounded-[20px] k-card px-5"
          aria-live="polite"
          aria-label={`Numéro saisi : +225 ${formatDigits(digits) || "en attente"}`}
        >
          <span className="font-mono text-[17px] text-muted-foreground">+225</span>
          <span className="font-mono text-[30px] font-bold tracking-[0.06em] text-foreground">
            {formatDigits(digits) || <span className="text-muted-foreground/50">· · · ·</span>}
          </span>
          {/* Caret — pulstation sur la saisie */}
          {digits.length > 0 && digits.length < MAX_DIGITS && (
            <motion.span
              aria-hidden="true"
              className="ml-0.5 h-7 w-[2px] rounded-full bg-primary"
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
            <motion.button
              key={k}
              type="button"
              onClick={() => press(k)}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              disabled={loading}
              aria-label={`Chiffre ${k}`}
              className="k-chip h-[64px] rounded-[20px] font-mono text-[26px] font-bold text-foreground disabled:opacity-50"
            >
              {k}
            </motion.button>
          ))}
          {/* Effacer */}
          <motion.button
            type="button"
            onClick={() => setDigits((d) => d.slice(0, -1))}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            disabled={loading || digits.length === 0}
            aria-label="Effacer le dernier chiffre"
            className="k-chip h-[64px] rounded-[20px] text-foreground/70 disabled:opacity-40"
          >
            <Delete size={24} className="mx-auto" />
          </motion.button>
          <motion.button
            type="button"
            onClick={() => press("0")}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            disabled={loading}
            aria-label="Chiffre 0"
            className="k-chip h-[64px] rounded-[20px] font-mono text-[26px] font-bold text-foreground disabled:opacity-50"
          >
            0
          </motion.button>
          {/* Valider — or, pulse quand prêt */}
          <motion.button
            type="button"
            onClick={() => void confirm()}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            disabled={!ready || loading}
            aria-label={ready ? "Recevoir mon code par SMS" : "Saisis 8 chiffres pour continuer"}
            className={`h-[64px] rounded-[20px] k-btn-gold text-primary-foreground ${ready ? "" : "opacity-40"}`}
          >
            {loading ? (
              <Loader2 size={26} className="mx-auto animate-spin" />
            ) : (
              <ArrowRight size={26} className="mx-auto" />
            )}
          </motion.button>
        </div>
        <AnimatePresence>
          {ready && !loading && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-center text-[12px] text-muted-foreground"
            >
              Prêt — « → » envoie le code à <span className="font-mono text-foreground">+225 {formatDigits(digits)}</span>
            </motion.p>
          )}
        </AnimatePresence>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10.5px] text-muted-foreground/80">
          <ArrowLeft size={12} aria-hidden="true" /> Tu peux aussi taper au clavier
        </p>
      </div>
    </div>
  );
}

/** Requête OTP — appelée par le parent (garde le keypad muet côté métier). */
export async function requestOtp(phoneE164: string): Promise<string> {
  const res = await apiPost<{ ok: boolean; devCode?: string; smsSent?: boolean }>("/api/auth/otp/request", { phone: phoneE164 });
  return res.devCode ?? "";
}

/** Toast standard du Seuil (erreur OTP). */
export function otpErrorToast(e: unknown) {
  toast.error(e instanceof Error ? e.message : "Envoi impossible");
}
