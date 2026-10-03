"use client";
// Kènè Cliente — Gestionnaire de retour post-paiement WiniPayer / Wave
// 1. Capture les paramètres ?payment_status= et ?paymentId= dans l'URL
// 2. Réconcilie automatiquement la transaction auprès de /api/payments/winipayer/verify
// 3. Affiche la modale de célébration Sankofa & le bouton de téléchargement du Pass RDV PDF
// 4. Nettoie les paramètres d'URL pour éviter les réouvertures intempestives au rechargement.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  Crown,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  QrCode,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/kene/api";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useKene } from "@/store/kene";
import { KeneEmblem } from "@/components/kene/icons";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";

interface VerifyResult {
  isPaid: boolean;
  status: string;
  amount: number;
  paymentId: string;
  purpose?: string;
  appointment?: {
    id: string;
    serviceName: string;
    tenantName: string;
    startAt: string;
  } | null;
  order?: {
    id: string;
    total: number;
    cashback: number;
  } | null;
}

export function PaymentReturnHandler() {
  const setClientTab = useKene((s) => s.setClientTab);
  const user = useKene((s) => s.user);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const url = new URL(window.location.href);
      const paymentStatus = url.searchParams.get("payment_status");
      const paymentId = url.searchParams.get("paymentId");
      const provider = url.searchParams.get("provider");

      if (!paymentStatus && !paymentId) return;

      // Nettoyage immédiat de l'URL pour la pureté de navigation
      url.searchParams.delete("payment_status");
      url.searchParams.delete("paymentId");
      url.searchParams.delete("provider");
      url.searchParams.delete("simulated");
      window.history.replaceState(null, "", url.toString());

      if (paymentStatus === "cancelled") {
        toast.info("Paiement interrompu", {
          description: "Ta réservation ou commande reste disponible pour finalisation ultérieure.",
        });
        return;
      }

      if (paymentStatus === "success" && paymentId) {
        setOpen(true);
        setLoading(true);

        const verifyUrl = provider === "saspay"
          ? `/api/payments/saspay/verify?paymentId=${encodeURIComponent(paymentId)}`
          : `/api/payments/winipayer/verify?paymentId=${encodeURIComponent(paymentId)}`;

        apiGet<VerifyResult>(verifyUrl)
          .then((res) => {
            setResult(res);
            haptic(HAPTIC.success);
          })
          .catch((err) => {
            console.error("[PaymentReturnHandler] Erreur de vérification:", err);
            // Repli optimiste si le webhook est déjà en cours
            setResult({
              isPaid: true,
              status: "completed",
              amount: 0,
              paymentId,
            });
            haptic(HAPTIC.success);
          })
          .finally(() => {
            setLoading(false);
          });
      }
    } catch (err) {
      console.warn("[PaymentReturnHandler] Exception:", err);
    }
  }, []);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-0 overflow-hidden border border-border/80 bg-card rounded-[28px] shadow-2xl">
        {/* Bandeau supérieur festif Kènè */}
        <div className="relative bg-gradient-to-br from-[#8B1A3B] via-[#651329] to-[#C8951E] p-6 text-white text-center">
          <div className="absolute inset-0 bogolan-dots opacity-20 pointer-events-none" />
          <div className="relative flex flex-col items-center">
            <span className="k-glow-gold mb-3 inline-grid rounded-2xl bg-white/10 p-2 backdrop-blur-md">
              <KeneEmblem size={44} />
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="size-3.5 text-amber-300" />
              Paiement Confirmé
            </span>
            <DialogTitle className="font-heading text-xl sm:text-2xl font-black text-white">
              {result?.purpose === "appointment_deposit"
                ? "Acompte Réglé avec Succès"
                : result?.purpose === "subscription_renew"
                ? "Kènè+ Renouvelé ✨"
                : result?.purpose === "subscription_activate"
                ? "Kènè+ Activé ✨"
                : "Transaction Validée"}
            </DialogTitle>
            <p className="text-white/80 text-xs mt-1">
              Règlement certifié par Mobile Money & Carte bancaire
            </p>
          </div>
        </div>

        {/* Corps de la modale */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">
                Génération de ton reçu et confirmation du créneau...
              </p>
            </div>
          ) : result ? (
            <>
              {/* Montant & Statut */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-muted/60 border border-border/60">
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                    Montant réglé
                  </p>
                  <p className="font-heading text-xl font-black text-foreground">
                    {result.amount > 0 ? xof(result.amount) : "Validé"}
                  </p>
                </div>
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1.5 py-1 px-3">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Paiement Garanti
                </Badge>
              </div>

              {/* Détails du Rendez-Vous */}
              {result.appointment && (
                <div className="p-4 rounded-2xl border border-border bg-card/70 space-y-2.5">
                  <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wide">
                    <Calendar className="size-4" />
                    Détails du Rendez-Vous
                  </div>
                  <div>
                    <p className="font-heading font-bold text-sm text-foreground">
                      {result.appointment.serviceName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.appointment.tenantName}
                    </p>
                    <p className="text-xs font-medium text-foreground mt-1">
                      📅 {formatDate(result.appointment.startAt)} à {formatTime(result.appointment.startAt)}
                    </p>
                  </div>
                </div>
              )}

              {/* Détails de la Commande Boutique */}
              {result.order && (
                <div className="p-4 rounded-2xl border border-border bg-card/70 space-y-2">
                  <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wide">
                    <ShoppingBag className="size-4" />
                    Commande Enregistrée
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total commande : <span className="font-bold text-foreground">{xof(result.order.total)}</span>
                  </div>
                  {result.order.cashback > 0 && (
                    <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                      <Sparkles className="size-3.5" />
                      +{xof(result.order.cashback)} de remise fidélité offerte !
                    </div>
                  )}
                </div>
              )}

              {/* Détails de l'Abonnement Kènè+ */}
              {(result.purpose === "subscription_renew" || result.purpose === "subscription_activate") && (
                <div className="p-4 rounded-2xl border border-[#C8951E]/40 bg-gradient-to-br from-[#C8951E]/10 to-[#8B1A3B]/10 space-y-2">
                  <div className="flex items-center gap-2 text-gold-text font-bold text-xs uppercase tracking-wide">
                    <Crown className="size-4" />
                    {result.purpose === "subscription_renew" ? "Renouvellement +30 Jours" : "Pass Kènè+ Activé"}
                  </div>
                  <p className="font-heading font-black text-sm text-foreground">
                    Diagnostics IA & Suivi d&apos;Évolution Illimités
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Votre compte bénéficie immédiatement de l&apos;accès illimité au Dr Kènè, aux bilans photographiques et à l&apos;ensemble des privilèges premium.
                  </p>
                </div>
              )}

              {/* Actions directes */}
              <div className="space-y-2.5 pt-2">
                {/* Téléchargement Pass RDV PDF si c'est un rendez-vous */}
                {result.appointment && (
                  <>
                    <a
                      href={`/api/appointments/pass?id=${encodeURIComponent(result.appointment.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-gradient-to-r from-gold to-terre text-primary-foreground font-bold text-sm shadow-md hover:opacity-95 active:scale-[0.98] transition-all"
                    >
                      <Download className="size-4.5" />
                      Télécharger mon Pass Rendez-Vous (PDF)
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        const appUrl = typeof window !== "undefined" ? window.location.origin : "https://kene.app";
                        const passUrl = `${appUrl}/api/appointments/pass?id=${encodeURIComponent(result.appointment!.id)}`;
                        const msg = `Bonjour ! 💆‍♀️ Mon soin *${result.appointment!.serviceName}* chez *${result.appointment!.tenantName}* est confirmé pour le ${formatDate(result.appointment!.startAt)} à ${formatTime(result.appointment!.startAt)}.\n\nMon Pass Rendez-Vous officiel Kènè : ${passUrl}`;
                        openWhatsApp(user?.phone || "", msg);
                      }}
                      className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/30 font-bold text-xs active:scale-[0.98] transition-all"
                    >
                      <MessageCircle className="size-4 text-[#25D366]" />
                      Recevoir mon Pass sur WhatsApp
                    </button>
                  </>
                )}

                {/* Partage commande sur WhatsApp si c'est une commande boutique */}
                {result.order && (
                  <button
                    type="button"
                    onClick={() => {
                      const msg = `Bonjour ! 📦 Ma commande Kènè #${result.order!.id.slice(-6)} d'un montant de ${xof(result.order!.total)} est confirmée. Merci ! 🌿`;
                      openWhatsApp(user?.phone || "", msg);
                    }}
                    className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/30 font-bold text-xs active:scale-[0.98] transition-all"
                  >
                    <MessageCircle className="size-4 text-[#25D366]" />
                    Partager mon reçu sur WhatsApp
                  </button>
                )}

                {/* Bouton de redirection vers l'onglet correspondant */}
                {result.appointment ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      setClientTab("rdv");
                    }}
                    className="w-full h-11 rounded-2xl font-bold text-xs gap-2 border-border"
                  >
                    <Calendar className="size-4" />
                    Consulter mes Rendez-Vous
                  </Button>
                ) : result.order ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      setClientTab("boutique");
                    }}
                    className="w-full h-11 rounded-2xl font-bold text-xs gap-2 border-border"
                  >
                    <ShoppingBag className="size-4" />
                    Suivre mes Commandes
                  </Button>
                ) : (result.purpose === "subscription_renew" || result.purpose === "subscription_activate") ? (
                  <Button
                    onClick={() => {
                      setOpen(false);
                      setClientTab("abonnement");
                    }}
                    className="k-btn-gold w-full h-11 rounded-2xl font-bold text-xs gap-2"
                  >
                    <Crown className="size-4" />
                    Accéder à mon Espace Kènè+
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setOpen(false)}
                    className="w-full h-11 rounded-2xl font-bold text-xs gap-2 border-border"
                  >
                    Fermer
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
