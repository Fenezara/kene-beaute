"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Phone, ArrowRight, ShieldCheck, Loader2, MessageSquareText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/kene/api";
import { useKene } from "@/store/kene";
import { rememberAccount } from "@/lib/kene/last-account";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { BotHoneypot, createHumanPayload } from "@/components/kene/auth/BotHoneypot";
import type { ApiUser } from "@/components/kene/client/types";

interface ChangePhoneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone: string;
}

export function ChangePhoneModal({ open, onOpenChange, currentPhone }: ChangePhoneModalProps) {
  const setUser = useKene((s) => s.setUser);
  const currentUser = useKene((s) => s.user);

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [newPhone, setNewPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const cleanDigits = newPhone.replace(/\D/g, "");
  const isValidPhone = cleanDigits.length >= 8 && cleanDigits.length <= 12;

  const resetModal = () => {
    setStep("phone");
    setNewPhone("");
    setCode("");
    setDevCode("");
    setLoading(false);
    setSending(false);
  };

  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isValidPhone) {
      toast.error("Veuillez saisir un numéro de téléphone valide");
      return;
    }

    setSending(true);
    try {
      haptic(HAPTIC.tap);
      const res = await apiPost<{ ok: boolean; message: string; devCode?: string; smsSent?: boolean }>(
        "/api/auth/change-phone",
        {
          action: "request",
          newPhone: cleanDigits,
          ...createHumanPayload(),
        }
      );

      if (res.ok) {
        setDevCode(res.devCode || "");
        setStep("code");
        if (res.devCode) {
          toast.info("Code de vérification généré ⚡");
        } else {
          toast.success("Code de sécurité envoyé par SMS");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'envoyer le code");
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async (codeToSubmit = code) => {
    if (codeToSubmit.length !== 6) return;

    setLoading(true);
    try {
      haptic(HAPTIC.tap);
      const res = await apiPost<{ ok: boolean; message: string; user: ApiUser }>("/api/auth/change-phone", {
        action: "verify",
        newPhone: cleanDigits,
        code: codeToSubmit,
        ...createHumanPayload(),
      });

      if (res.ok && res.user) {
        setUser(res.user);
        rememberAccount({
          phone: res.user.phone,
          name: res.user.name,
          role: res.user.role || "client",
        });
        toast.success("Numéro mis à jour avec succès !", {
          description: `Votre compte est désormais lié au ${res.user.phone}`,
        });
        resetModal();
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Code invalide");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetModal();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md p-6 rounded-3xl">
        <DialogHeader className="text-left space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center size-10 rounded-2xl bg-primary/10 text-primary">
              <Phone size={20} />
            </span>
            <DialogTitle className="font-heading font-black text-lg text-foreground">
              Changer de numéro de téléphone
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {step === "phone"
              ? "Numéro actuel : "
              : "Saisissez les 6 chiffres envoyés au nouveau numéro : "}
            <strong className="text-foreground font-mono">
              {step === "phone" ? currentPhone : `+225 ${cleanDigits}`}
            </strong>
          </DialogDescription>
        </DialogHeader>

        <BotHoneypot />

        {step === "phone" ? (
          <form onSubmit={handleRequestCode} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label htmlFor="new-phone-input" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nouveau numéro (Orange, MTN, Moov, Wave)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                  +225
                </span>
                <Input
                  id="new-phone-input"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="07 00 00 00 00"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="h-12 pl-16 rounded-xl font-mono text-base"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Toutes vos données (diagnostics, commandes, rendez-vous et solde de fidélité) seront automatiquement transférées sur ce nouveau numéro.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={sending || !isValidPhone}
                className="rounded-xl text-xs font-bold gap-1.5"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                Envoyer le code SMS
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <button
              onClick={() => { setStep("phone"); setCode(""); setDevCode(""); }}
              className="-ml-1 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              ← Modifier le nouveau numéro
            </button>

            <div className="flex justify-center rounded-2xl border border-border/60 bg-muted/30 p-4">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(val) => {
                  setCode(val);
                  if (val.length === 6) void handleVerifyCode(val);
                }}
                autoFocus
                autoComplete="one-time-code"
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {devCode && (
              <div className="rounded-xl border border-dashed border-primary/50 p-2.5 bg-card text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Code de vérification instantané</p>
                <button
                  type="button"
                  onClick={() => {
                    setCode(devCode);
                    setTimeout(() => void handleVerifyCode(devCode), 150);
                  }}
                  className="mt-1 font-mono text-xl font-black tracking-widest text-primary hover:scale-105 transition-transform"
                >
                  {devCode}
                </button>
                <p className="text-[10px] text-muted-foreground">Touche pour insérer automatiquement</p>
              </div>
            )}

            <DialogFooter className="gap-2 flex-col sm:flex-col pt-2">
              <Button
                onClick={() => void handleVerifyCode()}
                disabled={loading || code.length !== 6}
                className="w-full rounded-xl text-xs font-bold gap-1.5 h-11"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Confirmer la bascule
              </Button>
              <Button
                variant="ghost"
                onClick={() => void handleRequestCode()}
                disabled={sending}
                className="w-full text-xs text-muted-foreground gap-1.5"
              >
                <RefreshCw className={`size-3.5 ${sending ? "animate-spin" : ""}`} />
                Renvoyer le code SMS
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
