"use client";

import { Mail, Clock, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { KeneEmblem } from "@/components/kene/icons";
import { KENE_SUPPORT_EMAIL } from "@/lib/kene/config";

interface ContactKeneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName?: string;
}

export function ContactKeneModal({ open, onOpenChange, userName }: ContactKeneModalProps) {
  const handleWriteEmail = () => {
    haptic(HAPTIC.tap);
    const subject = encodeURIComponent(`Contact Kènè — Message de ${userName || "Utilisateur"}`);
    window.location.href = `mailto:${KENE_SUPPORT_EMAIL}?subject=${subject}`;
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
                Contacter la Direction Kènè
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Assistance technique, questions &amp; partenariats officiels
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-3">
          {/* Canal unique : Courriel officiel */}
          <div className="rounded-2xl border-2 border-gold/40 bg-gold/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold text-primary-foreground shadow-sm mt-0.5">
                <Mail size={22} />
              </span>
              <div>
                <p className="font-heading font-bold text-sm text-foreground">Courriel Officiel Direction</p>
                <p className="font-mono text-xs font-semibold text-gold-text tracking-wide mt-0.5">
                  {KENE_SUPPORT_EMAIL}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Canal direct et prioritaire pour toute correspondance avec les responsables Kènè.
                </p>
              </div>
            </div>
            <Button
              onClick={handleWriteEmail}
              className="k-btn-gold text-primary-foreground font-bold text-xs shrink-0 rounded-xl gap-1.5 shadow-sm active:scale-95 px-5 h-9"
            >
              <Mail size={15} /> Écrire un e-mail
            </Button>
          </div>

          {/* Horaires et précision d'orientation */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock size={13} className="text-gold-text shrink-0" />
              <span>Délai de réponse moyen : Moins de 24 heures ouvrées</span>
            </div>
            <div className="rounded-xl bg-muted/60 p-3 text-[10.5px] text-muted-foreground leading-relaxed flex items-start gap-2">
              <ShieldCheck size={14} className="text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Précision soins &amp; rendez-vous :</strong> Pour toute question sur les prestations en cabine, diagnostics cutanés ou produits cosmétiques vendus en salon, merci de contacter directement votre institut partenaire.
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
