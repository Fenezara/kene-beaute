"use client";
// Kènè Cliente — SecureVerify: re-vérification par code OTP avant paiement
// (2FA-lite, « Sécurité renforcée » activable depuis le profil).
// Overlay plein écran mobile; l'UX OTP est la COPIE EXACTE de l'étape 2 de
// Onboarding.tsx (6 cases InputOTP + encart pointillé « code de vérification »
// avec devCode cliquable qui auto-remplit puis vérifie).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface SecureVerifyProps {
 /** true = overlay ouvert (un code frais est demandé à chaque ouverture) */
  open: boolean;
  phone: string;
 /** montant du paiement en attente (affiché en rappel, facultatif) */
  amount?: number;
  onVerified: () => void;
  onCancel: () => void;
}

/** Montage/démontage contrôlé par `open` — l'état interne (code, saisie)
 * est remis à zéro à CHAQUE ouverture: jamais de code obsolète. */
export function SecureVerify({ open, phone, amount, onVerified, onCancel }: SecureVerifyProps) {
  return (
    <AnimatePresence>
      {open && (
        <SecureVerifyDialog key="secure-verify" phone={phone} amount={amount} onVerified={onVerified} onCancel={onCancel} />
      )}
    </AnimatePresence>
  );
}

function SecureVerifyDialog({ phone, amount, onVerified, onCancel }: Omit<SecureVerifyProps, "open">) {
  // Une seule issue par ouverture: code confirmé OU annulation — jamais les
  // deux (fenêtre de course: annulation pendant l'auto-vérification).
  const settled = useRef(false);
  const [devCode, setDevCode] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false); // renvoi de code en cours
  const [verifying, setVerifying] = useState(false);
  // Demande initiale: lancée dès le montage, `requesting` part à true →
  // aucun setState synchrone dans l'effet (seuls les.then/.catch écrivent).
  const [requesting, setRequesting] = useState(true);

  useEffect(() => {
    let alive = true;
    apiPost<{ ok: boolean; devCode: string }>("/api/auth/otp/request", { phone })
      .then((r) => {
        if (!alive) return;
        setDevCode(r.devCode);
        setRequesting(false);
        toast.success("Ton code est prêt — saisis-le ci-dessous");
      })
      .catch((e) => {
        if (!alive) return;
        setRequesting(false);
        toast.error(e instanceof Error ? e.message : "Envoi impossible");
      });
    return () => {
      alive = false;
    };
  }, [phone]);

  async function requestCode() {
    setLoading(true);
    try {
      const r = await apiPost<{ ok: boolean; devCode: string }>("/api/auth/otp/request", { phone });
      setDevCode(r.devCode);
      setOtp("");
      toast.success("Nouveau code envoyé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setLoading(false);
    }
  }

  async function verify(code = otp) {
    if (code.length !== 6 || verifying) return;
    setVerifying(true);
    try {
      await apiPost("/api/auth/otp/verify", { phone, code });
      if (settled.current) return;
      settled.current = true;
      toast.success("Identité confirmée 💛");
      onVerified();
    } catch (e) {
      if (!settled.current) {
        toast.error(e instanceof Error ? e.message : "Code invalide");
        setOtp("");
      }
    } finally {
      setVerifying(false);
    }
  }

  function cancel() {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Vérification par code avant paiement"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !verifying) cancel();
      }}
      className="fixed inset-0 z-[80] bg-background overflow-y-auto scrollbar-thin"
    >
      <div className="mx-auto w-full max-w-[420px] min-h-full px-5 pt-5 pb-8 flex flex-col">
        {/* Fermer — annule la vérification, retour au paiement sans rien engager */}
        <button
          onClick={cancel}
          aria-label="Annuler la vérification"
          className="self-end h-10 w-10 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground active:scale-90 transition-all focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X size={18} />
        </button>

        <div className="mt-1 flex flex-col items-center text-center" aria-live="polite">
          <span className="grid place-items-center h-14 w-14 rounded-2xl bg-primary/15 text-primary" aria-hidden="true">
            <ShieldCheck size={26} />
          </span>
          <h1 className="font-heading font-black text-xl mt-4">Confirme que c&apos;est bien toi</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Sécurité renforcée — code envoyé au <span className="font-mono">{phone}</span>
          </p>
          {typeof amount === "number" && (
            <p className="mt-2.5 inline-flex items-center rounded-full bg-muted px-3 py-1 text-[11px] font-mono font-bold">
              Paiement de {xof(amount)}
            </p>
          )}
        </div>

        {/* Saisie du code — pattern identique à Onboarding étape 2 */}
        <div className="mt-8 flex justify-center">
          <div className="flex flex-col items-center gap-2">
            <span id="sv-otp-label" className="sr-only">Code à 6 chiffres reçu par SMS</span>
            <InputOTP maxLength={6} value={otp} onChange={(v) => setOtp(v)} autoFocus autoComplete="one-time-code" aria-labelledby="sv-otp-label">
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>

        <button
          onClick={() => verify()}
          disabled={otp.length !== 6 || verifying || requesting}
          className="mt-8 h-12 w-full rounded-xl bg-primary text-primary-foreground font-semibold shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        >
          {verifying ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          Continuer
        </button>

        {/* Code de vérification (mode essai: le code s'affiche ici, l'envoi
 SMS arrivera avec la passerelle) — copie de l'encart Onboarding */}
        <div className="mt-6 rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-4 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold">Code de vérification</p>
          {requesting ? (
            <div className="mt-2 h-8 grid place-items-center" aria-live="polite">
              <Loader2 size={18} className="animate-spin text-primary" aria-label="Code en cours d'envoi" />
            </div>
          ) : (
            <button
              onClick={() => {
                setOtp(devCode);
                setTimeout(() => void verify(devCode), 250);
              }}
              className="mt-2 font-mono text-2xl font-black tracking-[0.3em] text-primary hover:scale-105 active:scale-95 transition-transform"
              aria-label={`Code reçu ${devCode}, remplir automatiquement`}
            >
              {devCode}
            </button>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">En mode essai, ton code s&apos;affiche ici — touche-le pour le remplir</p>
        </div>

        <button
          onClick={() => void requestCode()}
          disabled={loading || requesting}
          className="mt-4 mx-auto inline-flex items-center min-h-11 px-3 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin mr-1.5" aria-hidden="true" /> : null}
          Renvoyer le code
        </button>
      </div>
    </motion.div>
  );
}
