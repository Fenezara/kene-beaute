"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, ShieldCheck, X, Loader2, CheckCircle2, KeyRound, LogIn } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/kene/api";
import { useKene, type SessionUser } from "@/store/kene";
import { rememberAccount } from "@/lib/kene/last-account";
import { haptic, HAPTIC } from "@/lib/kene/ux";
import { BotHoneypot, createHumanPayload } from "@/components/kene/auth/BotHoneypot";
import type { ApiUser } from "./types";

interface LinkAccountModalProps {
  open: boolean;
  onClose: () => void;
  reason?: string;
}

export function LinkAccountModal({ open, onClose, reason }: LinkAccountModalProps) {
  const user = useKene((s) => s.user);
  const setUser = useKene((s) => s.setUser);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState(user?.name && user.name !== "Mariam Diallo" && user.name !== "Nouvelle cliente" ? user.name : "");
  const [pin, setPin] = useState("");
  const [withPin, setWithPin] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanDigits = phone.replace(/\D/g, "");
    if (cleanDigits.length < 8) {
      toast.error("Veuillez saisir un numéro de téléphone valide (10 chiffres)");
      return;
    }

    if (withPin && pin.length > 0 && pin.length < 4) {
      toast.error("Le code secret PIN doit comporter 4 chiffres");
      return;
    }

    setLoading(true);
    try {
      haptic(HAPTIC.tap);
      const res = await apiPost<{ ok: boolean; user: ApiUser; message: string }>("/api/auth/link-account", {
        phone: cleanDigits,
        name: name.trim() || undefined,
        pin: withPin && pin ? pin : undefined,
        ...createHumanPayload(),
      });

      if (res.user) {
        rememberAccount({
          phone: res.user.phone,
          name: res.user.name,
          role: "client",
        });

        setUser({
          ...res.user,
          role: "client",
          hasPin: Boolean(withPin && pin),
        } as SessionUser);

        haptic(HAPTIC.success);
        toast.success("Votre profil et vos ordonnances sont sauvegardés ! 🌿");
        onClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la sauvegarde du numéro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-border/80 bg-card p-6 shadow-2xl"
        >
          {/* Bouton fermer */}
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>

          {/* En-tête de la modale */}
          <div className="flex items-start gap-3.5 mb-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MessageCircle size={24} />
            </span>
            <div>
              <h3 className="font-heading text-lg font-black text-foreground">
                Sauvegarder mon Dossier Peau
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {reason || "Enregistrez votre numéro WhatsApp pour conserver vos diagnostics, ordonnances et recevoir vos suivis personnalisés."}
              </p>
            </div>
          </div>

          {/* Formulaire simple 1-2 champs */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <BotHoneypot />
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Votre prénom ou nom
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Mariam, Aïcha, Sarah..."
                className="w-full h-11 px-3.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Numéro WhatsApp / Mobile (10 chiffres)
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs font-bold text-muted-foreground select-none">
                  🇨🇮 +225
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07 01 02 03 04"
                  className="w-full h-11 pl-20 pr-3.5 rounded-xl border border-border bg-background text-sm font-semibold tracking-wide text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all"
                />
              </div>
            </div>

            {/* Option code PIN pour reconnexion instantanée sans SMS */}
            <div className="pt-1">
              {!withPin ? (
                <button
                  type="button"
                  onClick={() => setWithPin(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-text hover:underline"
                >
                  <KeyRound size={13} />
                  Définir un code secret à 4 chiffres (reconnexion rapide)
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <KeyRound size={13} className="text-gold-text" />
                      Code secret PIN (4 chiffres)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setWithPin(false);
                        setPin("");
                      }}
                      className="text-[11px] text-muted-foreground hover:underline"
                    >
                      Annuler
                    </button>
                  </div>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-center text-base tracking-[0.3em] font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Vous permettra de vous reconnecter en 2 secondes sans attendre de SMS.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl k-btn-gold font-bold text-sm text-primary-foreground shadow-md flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Sauvegarde en cours...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Sauvegarder mon compte</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground text-center pt-1">
              <ShieldCheck size={13} className="text-emerald-500" />
              <span>Zéro spam · Vos données de santé restent 100% confidentielles</span>
            </div>

            <div className="pt-2 border-t border-border/50 text-center">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("kene:open-login"));
                  }
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-text hover:underline"
              >
                <LogIn size={13} />
                <span>Vous avez déjà un compte ? Me connecter</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
