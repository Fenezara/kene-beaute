"use client";

import { MessageCircle, Phone, Mail, Clock, HelpCircle, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { KeneEmblem } from "@/components/kene/icons";

interface ContactKeneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName?: string;
}

export function ContactKeneModal({ open, onOpenChange, userName }: ContactKeneModalProps) {
  const KENE_SUPPORT_PHONE = "+2250748894270";
  const KENE_SUPPORT_EMAIL = "contact@kene.ci";

  const handleWhatsApp = () => {
    haptic(HAPTIC.tap);
    const msg = `Bonjour l'équipe Kènè ! 🌿 Je suis ${userName || "une cliente"}. J'ai une question concernant l'utilisation de l'application Kènè.`;
    openWhatsApp(KENE_SUPPORT_PHONE, msg, "CI");
  };

  const handleCall = () => {
    haptic(HAPTIC.tap);
    window.location.href = `tel:${KENE_SUPPORT_PHONE}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 overflow-hidden rounded-3xl">
        <DialogHeader className="text-left space-y-2">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center size-12 rounded-2xl bg-primary/10 text-primary">
              <KeneEmblem size={28} />
            </span>
            <div>
              <DialogTitle className="font-heading font-black text-lg text-foreground">
                Contactez l&apos;équipe Kènè
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Assistance technique, questions sur l&apos;application &amp; partenariats
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Option 1 : WhatsApp direct (recommandé) */}
          <div className="rounded-2xl border-2 border-[#25D366]/40 bg-[#25D366]/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white shadow-sm mt-0.5">
                <MessageCircle size={20} />
              </span>
              <div>
                <p className="font-heading font-bold text-sm text-foreground">Support officiel sur WhatsApp</p>
                <p className="text-xs text-muted-foreground leading-snug">
                  Réponse rapide par notre équipe support (+225 07 48 89 42 70)
                </p>
              </div>
            </div>
            <Button
              onClick={handleWhatsApp}
              className="bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs shrink-0 rounded-xl gap-1.5 shadow-sm active:scale-95"
            >
              <MessageCircle size={15} /> Discuter
            </Button>
          </div>

          {/* Option 2 : Appel téléphonique */}
          <div className="rounded-2xl border bg-card p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Phone size={17} />
              </span>
              <div>
                <p className="font-semibold text-xs text-foreground">Assistance téléphonique</p>
                <p className="font-mono text-xs text-muted-foreground">+225 07 48 89 42 70</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCall}
              className="text-xs font-semibold rounded-xl"
            >
              Appeler
            </Button>
          </div>

          {/* Option 3 : Email */}
          <div className="rounded-2xl border bg-card p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Mail size={17} />
              </span>
              <div>
                <p className="font-semibold text-xs text-foreground">Courriel officiel</p>
                <p className="font-mono text-xs text-muted-foreground">{KENE_SUPPORT_EMAIL}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { window.location.href = `mailto:${KENE_SUPPORT_EMAIL}`; }}
              className="text-xs font-semibold rounded-xl"
            >
              Écrire
            </Button>
          </div>

          {/* Horaires et précision d'orientation */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock size={13} className="text-primary shrink-0" />
              <span>Horaires de permanence : Lundi au Samedi · 08h00 - 20h00 GMT</span>
            </div>
            <div className="rounded-xl bg-muted/60 p-2.5 text-[10.5px] text-muted-foreground leading-relaxed flex items-start gap-2">
              <ShieldCheck size={14} className="text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Précision soins &amp; cabine :</strong> Pour toute question sur vos diagnostics, soins en cabine ou ordonnance de produits, contactez directement la responsable de votre institut partenaire depuis votre accueil.
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
