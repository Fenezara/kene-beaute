"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { KeyRound, ShieldCheck, Loader2, ArrowRight, RefreshCw, MessageSquareText, Check } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/kene/api";
import { useKene } from "@/store/kene";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { requestOtp, otpErrorToast } from "@/components/kene/client/PhoneKeypad";
import { createHumanPayload } from "@/components/kene/auth/BotHoneypot";
import type { ApiUser } from "@/components/kene/client/types";

interface ChangePinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone: string;
  hasPin?: boolean;
}

type Step = "old_pin" | "otp" | "new_pin" | "confirm_pin";

export function ChangePinModal({ open, onOpenChange, currentPhone, hasPin = true }: ChangePinModalProps) {
  const setUser = useKene((s) => s.setUser);
  const currentUser = useKene((s) => s.user);

  const initialStep: Step = hasPin ? "old_pin" : "new_pin";
  const [step, setStep] = useState<Step>(initialStep);

  const [oldPin, setOldPin] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [devCode, setDevCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const resetModal = () => {
    setStep(hasPin ? "old_pin" : "new_pin");
    setOldPin("");
    setOtpCode("");
    setNewPin("");
    setConfirmPin("");
    setDevCode("");
    setLoading(false);
    setSendingOtp(false);
  };

  const handleClose = () => {
    resetModal();
    onOpenChange(false);
  };

  // 1. Passage de l'ancien code vers le nouveau code
  const handleOldPinSubmit = () => {
    if (oldPin.length !== 4) {
      toast.error("Veuillez saisir les 4 chiffres de votre code actuel");
      return;
    }
    haptic(HAPTIC.tap);
    setStep("new_pin");
  };

  // 2. Demande d'OTP si code oublié
  const handleRequestOtp = async () => {
    setSendingOtp(true);
    try {
      haptic(HAPTIC.tap);
      const res = await requestOtp(currentPhone);
      if (res.ok) {
        if (res.devCode) {
          setDevCode(res.devCode);
          toast.info("Code de secours généré ⚡");
        } else {
          toast.success("Code de vérification envoyé par SMS");
        }
        setStep("otp");
      }
    } catch (err) {
      otpErrorToast(err);
    } finally {
      setSendingOtp(false);
    }
  };

  // 3. Validation de l'OTP
  const handleOtpSubmit = (val = otpCode) => {
    if (val.length !== 6) return;
    haptic(HAPTIC.tap);
    setStep("new_pin");
  };

  // 4. Passage du nouveau code vers confirmation
  const handleNewPinSubmit = () => {
    if (newPin.length !== 4) {
      toast.error("Le nouveau code doit comporter 4 chiffres");
      return;
    }
    if (hasPin && oldPin && newPin === oldPin) {
      toast.error("Le nouveau code doit être différent de l'ancien");
      return;
    }
    haptic(HAPTIC.tap);
    setStep("confirm_pin");
  };

  // 5. Enregistrement final du nouveau code PIN
  const handleConfirmPinSubmit = async (val = confirmPin) => {
    if (val.length !== 4) return;
    if (val !== newPin) {
      haptic(HAPTIC.error);
      toast.error("Les codes ne correspondent pas. Recommencez la confirmation.");
      setConfirmPin("");
      return;
    }

    setLoading(true);
    try {
      haptic(HAPTIC.tap);
      const res = await apiPost<{ ok: boolean; user?: ApiUser; hasPin?: boolean }>("/api/auth/pin", {
        phone: currentPhone,
        pin: newPin,
        oldPin: oldPin || undefined,
        otpCode: otpCode || undefined,
        ...createHumanPayload(),
      });

      if (res.ok) {
        haptic(HAPTIC.success);
        toast.success("Mot de passe / Code secret mis à jour avec succès 🔒");

        if (currentUser) {
          setUser({
            ...currentUser,
            hasPin: true,
            ...(res.user ? res.user : {}),
          });
        }

        handleClose();
      }
    } catch (err) {
      haptic(HAPTIC.error);
      toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour du code");
      if (step === "confirm_pin") {
        setStep("old_pin");
        setOldPin("");
        setNewPin("");
        setConfirmPin("");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-md rounded-[24px] border-border bg-card p-6 shadow-2xl">
        <DialogHeader className="text-left space-y-2">
          <div className="size-11 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-1">
            <KeyRound size={22} className="text-gold-text" />
          </div>
          <DialogTitle className="text-lg font-bold">
            {step === "old_pin" && "Code secret actuel"}
            {step === "otp" && "Vérification SMS de sécurité"}
            {step === "new_pin" && "Nouveau code secret (PIN)"}
            {step === "confirm_pin" && "Confirme ton code secret"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {step === "old_pin" && "Saisis tes 4 chiffres secrets actuels pour autoriser la modification."}
            {step === "otp" && `Un code SMS à 6 chiffres a été transmis à ton numéro ${currentPhone}.`}
            {step === "new_pin" && "Choisis 4 chiffres faciles à retenir pour tes prochaines connexions rapides."}
            {step === "confirm_pin" && "Tape à nouveau les 4 chiffres pour être certaine de ne pas faire d'erreur."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* ÉTAPE 1 : ANCIEN CODE PIN */}
          {step === "old_pin" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-3 pt-2">
                <InputOTP
                  maxLength={4}
                  value={oldPin}
                  onChange={(val) => {
                    const clean = val.replace(/\D/g, "");
                    setOldPin(clean);
                    if (clean.length === 4) {
                      haptic(HAPTIC.tap);
                    }
                  }}
                  autoFocus
                >
                  <InputOTPGroup className="gap-2.5">
                    <InputOTPSlot index={0} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={1} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={2} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={3} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={sendingOtp}
                  className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1.5"
                >
                  {sendingOtp ? <Loader2 size={13} className="animate-spin" /> : <MessageSquareText size={13} />}
                  Code secret oublié ? Recevoir un code SMS
                </button>
              </div>
            </div>
          )}

          {/* ÉTAPE 1-BIS : SMS OTP (SI CODE OUBLIÉ) */}
          {step === "otp" && (
            <div className="space-y-4">
              {devCode && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-primary block">Code instantané de secours :</span>
                    <span className="font-mono text-base font-bold tracking-widest text-foreground">{devCode}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    onClick={() => {
                      setOtpCode(devCode);
                      handleOtpSubmit(devCode);
                    }}
                  >
                    Utiliser
                  </Button>
                </div>
              )}

              <div className="flex flex-col items-center justify-center gap-3 pt-2">
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={(val) => {
                    const clean = val.replace(/\D/g, "");
                    setOtpCode(clean);
                    if (clean.length === 6) {
                      handleOtpSubmit(clean);
                    }
                  }}
                  autoFocus
                >
                  <InputOTPGroup className="gap-2">
                    <InputOTPSlot index={0} className="size-11 rounded-xl text-base font-bold border-border/80" />
                    <InputOTPSlot index={1} className="size-11 rounded-xl text-base font-bold border-border/80" />
                    <InputOTPSlot index={2} className="size-11 rounded-xl text-base font-bold border-border/80" />
                    <InputOTPSlot index={3} className="size-11 rounded-xl text-base font-bold border-border/80" />
                    <InputOTPSlot index={4} className="size-11 rounded-xl text-base font-bold border-border/80" />
                    <InputOTPSlot index={5} className="size-11 rounded-xl text-base font-bold border-border/80" />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={sendingOtp}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                >
                  <RefreshCw size={12} className={sendingOtp ? "animate-spin" : ""} />
                  Renvoyer un nouveau code SMS
                </button>
              </div>
            </div>
          )}

          {/* ÉTAPE 2 : NOUVEAU CODE PIN */}
          {step === "new_pin" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-3 pt-2">
                <InputOTP
                  maxLength={4}
                  value={newPin}
                  onChange={(val) => {
                    const clean = val.replace(/\D/g, "");
                    setNewPin(clean);
                    if (clean.length === 4) {
                      haptic(HAPTIC.tap);
                    }
                  }}
                  autoFocus
                >
                  <InputOTPGroup className="gap-2.5">
                    <InputOTPSlot index={0} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={1} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={2} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={3} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          )}

          {/* ÉTAPE 3 : CONFIRMATION DU NOUVEAU CODE PIN */}
          {step === "confirm_pin" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-3 pt-2">
                <InputOTP
                  maxLength={4}
                  value={confirmPin}
                  onChange={(val) => {
                    const clean = val.replace(/\D/g, "");
                    setConfirmPin(clean);
                    if (clean.length === 4) {
                      void handleConfirmPinSubmit(clean);
                    }
                  }}
                  autoFocus
                >
                  <InputOTPGroup className="gap-2.5">
                    <InputOTPSlot index={0} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={1} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={2} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                    <InputOTPSlot index={3} className="size-12 rounded-xl text-lg font-bold border-2 border-border/80 focus:border-primary" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="w-full sm:w-auto rounded-xl text-xs"
            disabled={loading}
          >
            Annuler
          </Button>

          {step === "old_pin" && (
            <Button
              type="button"
              onClick={handleOldPinSubmit}
              disabled={oldPin.length !== 4}
              className="k-btn-gold w-full sm:w-auto rounded-xl text-xs font-bold gap-2"
            >
              Suivant <ArrowRight size={14} />
            </Button>
          )}

          {step === "otp" && (
            <Button
              type="button"
              onClick={() => handleOtpSubmit(otpCode)}
              disabled={otpCode.length !== 6}
              className="k-btn-gold w-full sm:w-auto rounded-xl text-xs font-bold gap-2"
            >
              Valider le code SMS <ArrowRight size={14} />
            </Button>
          )}

          {step === "new_pin" && (
            <Button
              type="button"
              onClick={handleNewPinSubmit}
              disabled={newPin.length !== 4}
              className="k-btn-gold w-full sm:w-auto rounded-xl text-xs font-bold gap-2"
            >
              Confirmer les 4 chiffres <ArrowRight size={14} />
            </Button>
          )}

          {step === "confirm_pin" && (
            <Button
              type="button"
              onClick={() => handleConfirmPinSubmit(confirmPin)}
              disabled={confirmPin.length !== 4 || loading}
              className="k-btn-gold w-full sm:w-auto rounded-xl text-xs font-bold gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Enregistrer le mot de passe
            </Button>
          )}
        </DialogFooter>

        <div className="pt-2 border-t border-border/40 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck size={12} className="text-success" />
          Chiffrement scrypt avec sel aléatoire · Zéro stockage en clair
        </div>
      </DialogContent>
    </Dialog>
  );
}
