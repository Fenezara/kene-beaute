"use client";
// Kènè — Pavé numérique de code secret PIN (style Wave / Mobile Banking).
// Expérience ultra-fluide :
// - 4 bulles dorées réactives avec retour haptique
// - Validation automatique dès le 4ème chiffre saisi (zéro tap supplémentaire)
// - Animation de secousse (shake) en cas d'erreur
// - Bouton direct « Code secret oublié ? » qui bascule vers le SMS OTP
// - Support clavier desktop (0-9, Backspace)
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Delete, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { AuroraBackdrop, Chip } from "@/components/kene/ui2026";
import { KeneEmblemLockup } from "@/components/kene/icons";
import { haptic, HAPTIC } from "@/lib/kene/ux";
import { maskPhone } from "@/lib/kene/audit";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const PIN_LENGTH = 4;

export function PinKeypad({
  phone,
  name,
  mode,
  isSetup = false,
  onConfirm,
  onBack,
  onForgotPin,
  onOfflineBypass,
}: {
  phone: string;
  name?: string;
  mode: "client" | "pro";
  isSetup?: boolean;
  onConfirm: (pin: string) => Promise<boolean | void>;
  onBack: () => void;
  onForgotPin?: () => void;
  onOfflineBypass?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"initial" | "confirm">(isSetup ? "initial" : "confirm");
  const [loading, setLoading] = useState(false);
  const [errorShake, setErrorShake] = useState(false);

  const activeDigits = isSetup && step === "confirm" ? confirmPin : pin;

  // Saisie au clavier physique pour desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (loading) return;
      if (/^\d$/.test(e.key)) {
        pressDigit(e.key);
      } else if (e.key === "Backspace") {
        deleteDigit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, isSetup, step, pin, confirmPin]);

  function pressDigit(k: string) {
    if (loading) return;
    haptic(HAPTIC.tap);

    if (isSetup) {
      if (step === "initial") {
        if (pin.length < PIN_LENGTH) {
          const next = pin + k;
          setPin(next);
          if (next.length === PIN_LENGTH) {
            // Passe à la confirmation du PIN en mode configuration
            setTimeout(() => {
              setStep("confirm");
              haptic(HAPTIC.light);
            }, 180);
          }
        }
      } else {
        if (confirmPin.length < PIN_LENGTH) {
          const nextConfirm = confirmPin + k;
          setConfirmPin(nextConfirm);
          if (nextConfirm.length === PIN_LENGTH) {
            void handleValidate(pin, nextConfirm);
          }
        }
      }
    } else {
      if (pin.length < PIN_LENGTH) {
        const next = pin + k;
        setPin(next);
        if (next.length === PIN_LENGTH) {
          void handleValidate(next);
        }
      }
    }
  }

  function deleteDigit() {
    if (loading) return;
    haptic(HAPTIC.tap);
    if (isSetup) {
      if (step === "confirm") {
        if (confirmPin.length > 0) {
          setConfirmPin((c) => c.slice(0, -1));
        } else {
          setStep("initial");
          setPin((p) => p.slice(0, -1));
        }
      } else {
        setPin((p) => p.slice(0, -1));
      }
    } else {
      setPin((p) => p.slice(0, -1));
    }
  }

  async function handleValidate(submittedPin: string, confirmed?: string) {
    if (isSetup && confirmed !== undefined) {
      if (submittedPin !== confirmed) {
        triggerError();
        setConfirmPin("");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await onConfirm(submittedPin);
      if (res === false) {
        triggerError();
      } else {
        haptic(HAPTIC.success);
      }
    } catch {
      triggerError();
    } finally {
      setLoading(false);
    }
  }

  function triggerError() {
    haptic(HAPTIC.warning);
    setErrorShake(true);
    setTimeout(() => {
      setErrorShake(false);
      if (isSetup) {
        setConfirmPin("");
      } else {
        setPin("");
      }
    }, 450);
  }

  const title = isSetup
    ? step === "initial"
      ? "Choisis ton code secret"
      : "Confirme ton code secret"
    : name
      ? `Bon retour, ${name.split(" ")[0]} 💛`
      : "Ton code secret";

  const subtitle = isSetup
    ? step === "initial"
      ? "4 chiffres faciles à retenir pour te reconnecter sans SMS"
      : "Retape les 4 chiffres pour valider ton code"
    : "Saisis ton code à 4 chiffres pour entrer";

  return (
    <div className="relative isolate flex min-h-dvh w-full flex-col">
      <AuroraBackdrop />

      {/* ── Contexte : retour + espace ── */}
      <div className="flex items-center gap-2 px-4 pt-5 sm:px-6">
        <button
          onClick={onBack}
          disabled={loading}
          aria-label="Retour"
          className="k-chip inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
        >
          <ChevronLeft size={20} />
        </button>
        <Chip selected className="ml-1">
          {mode === "pro" ? "Espace entreprise" : "Espace cliente"}
        </Chip>
        <span className="ml-auto font-mono text-[12px] text-muted-foreground">
          {maskPhone(phone)}
        </span>
      </div>

      {/* ── En-tête & Titre ── */}
      <div className="flex flex-col items-center px-6 pt-5 sm:pt-7">
        <div className="mb-4">
          <KeneEmblemLockup
            size={48}
            labelSize={24}
            sublabel={mode === "pro" ? "Kènè Pro · Connexion" : "Beauté mélanoderme"}
          />
        </div>
        <h1 className="font-heading text-[24px] sm:text-[26px] font-black leading-tight text-foreground text-center">
          {title}
        </h1>
        <p className="mt-1.5 text-center text-[13px] text-muted-foreground max-w-[320px]">
          {subtitle}
        </p>

        {/* ── Bulles de code PIN (4 pastilles façon Wave / Apple) ── */}
        <motion.div
          animate={errorShake ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="mt-8 flex items-center justify-center gap-4"
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => {
            const filled = i < activeDigits.length;
            return (
              <motion.div
                key={i}
                initial={false}
                animate={{
                  scale: filled ? [0.85, 1.15, 1] : 1,
                }}
                transition={{ duration: 0.2 }}
                className={`h-4 w-4 rounded-full transition-all duration-200 ${
                  filled
                    ? "bg-amber-400 ring-4 ring-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                    : "border-2 border-foreground/25 bg-foreground/5"
                }`}
              />
            );
          })}
        </motion.div>

        {/* Indicateur de chargement discret */}
        <div className="h-6 mt-3 flex items-center justify-center">
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 text-xs text-amber-400"
            >
              <Loader2 size={14} className="animate-spin" />
              <span>Vérification...</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Pavé tactile ── */}
      <div className="mx-auto mt-auto w-full max-w-[340px] px-4 pb-6 pt-2">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {KEYS.map((k) => (
            <motion.button
              key={k}
              type="button"
              onClick={() => pressDigit(k)}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              disabled={loading || activeDigits.length >= PIN_LENGTH}
              aria-label={`Chiffre ${k}`}
              className="k-chip h-[64px] rounded-[20px] font-mono text-[26px] font-bold text-foreground disabled:opacity-50"
            >
              {k}
            </motion.button>
          ))}

          {/* Action alternative (Code oublié) ou vide */}
          <div className="flex items-center justify-center">
            {onForgotPin && !isSetup ? (
              <button
                type="button"
                onClick={onForgotPin}
                disabled={loading}
                aria-label="Code secret oublié"
                className="text-[11px] font-medium text-amber-400 hover:text-amber-300 underline underline-offset-4 text-center px-1 py-2 leading-tight"
              >
                Code oublié ?
              </button>
            ) : null}
          </div>

          <motion.button
            type="button"
            onClick={() => pressDigit("0")}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            disabled={loading || activeDigits.length >= PIN_LENGTH}
            aria-label="Chiffre 0"
            className="k-chip h-[64px] rounded-[20px] font-mono text-[26px] font-bold text-foreground disabled:opacity-50"
          >
            0
          </motion.button>

          {/* Effacer */}
          <motion.button
            type="button"
            onClick={deleteDigit}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            disabled={loading || activeDigits.length === 0}
            aria-label="Effacer le dernier chiffre"
            className="k-chip h-[64px] rounded-[20px] text-foreground/70 disabled:opacity-40"
          >
            <Delete size={24} className="mx-auto" />
          </motion.button>
        </div>

        {/* Aide en bas de pavé */}
        <div className="mt-4 flex flex-col items-center gap-2">
          {onForgotPin && !isSetup && (
            <p className="text-center text-[11px] text-muted-foreground">
              Tu peux aussi te reconnecter par{" "}
              <button
                type="button"
                onClick={onForgotPin}
                className="text-foreground underline underline-offset-2 hover:text-amber-400"
              >
                code SMS
              </button>
            </p>
          )}

          {mode === "pro" && onOfflineBypass && (
            <div className="pt-2 flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={onOfflineBypass}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#C8951E]/40 bg-[#C8951E]/10 hover:bg-[#C8951E]/20 text-xs font-bold text-foreground transition-all shadow-xs active:scale-95"
              >
                <span>📴 Accès Caisse & Institut Hors-ligne</span>
              </button>
              <span className="text-[10px] text-muted-foreground">
                Connexion directe sans réseau · PIN 0000 ou accès immédiat
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
