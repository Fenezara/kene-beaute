"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList, FileDown, Layers, Printer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { cn } from "@/lib/utils";

interface ConsultationSheetButtonProps {
  tenantId: string;
  /** Si renseigné (CRM / Dossiers Peau), génère une fiche pré-remplie pour cette personne */
  clientId?: string;
  clientName?: string;
  /** Indique si la personne possède déjà au moins un bilan enregistré (affiche l'option auto « Dernier bilan ») */
  hasPriorDiagnosis?: boolean;
  label?: string;
  size?: "default" | "sm";
  variant?: "outline" | "default";
  icon?: "printer" | "download";
  className?: string;
}

/**
 * Bouton unifié « Fiche de consultation / Fiche vierge » :
 * propose à la fois la Fiche Universelle Complète (toutes zones & contre-indications),
 * les fiches ciblées par zone et le composeur Multi-Zones sur mesure.
 */
export function ConsultationSheetButton({
  tenantId,
  clientId,
  clientName,
  hasPriorDiagnosis = false,
  label,
  size = "default",
  variant = "outline",
  icon = "printer",
  className,
}: ConsultationSheetButtonProps) {
  const [multiOpen, setMultiOpen] = useState(false);
  const [multiZones, setMultiZones] = useState<BodyZone[]>(["visage", "cuir_chevelu"]);

  const isPrefilled = Boolean(clientId);
  const displayLabel = label ?? (isPrefilled ? "Fiche de consultation (PDF)" : "Fiche vierge");
  const IconComp = icon === "download" ? FileDown : Printer;
  const aria = isPrefilled
    ? `Télécharger la fiche de consultation pré-remplie${clientName ? ` de ${clientName}` : ""}`
    : "Télécharger une fiche de consultation vierge (Universelle ou ciblée par zone)";

  const openSheet = (opts: { mode?: "universelle"; zone?: BodyZone; zones?: BodyZone[] } = {}) => {
    const qs = new URLSearchParams({ tenantId, _t: String(Date.now()) });
    if (clientId) qs.set("clientId", clientId);
    if (opts.mode) qs.set("mode", opts.mode);
    if (opts.zone) qs.set("zone", opts.zone);
    if (opts.zones && opts.zones.length > 0) qs.set("zones", opts.zones.join(","));
    window.open(`/api/pro/consultation-sheet?${qs.toString()}`, "_blank");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className={cn("gap-1.5", className)} aria-label={aria}>
            <IconComp className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden="true" />
            <span>{displayLabel}</span>
            <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {isPrefilled ? "Fiche pré-remplie du dossier" : "Support papier de consultation"}
          </DropdownMenuLabel>

          {isPrefilled && hasPriorDiagnosis && (
            <DropdownMenuItem
              onClick={() => openSheet()}
              className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                <Sparkles className="size-3.5 text-bissap" />
                Fiche du dernier bilan (auto)
              </span>
              <span className="text-[11px] text-muted-foreground leading-tight">
                Reprend automatiquement la zone et les réponses du dernier diagnostic
              </span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => openSheet({ mode: "universelle" })}
            className="flex flex-col items-start gap-0.5 py-2 cursor-pointer bg-gold/10 focus:bg-gold/20"
          >
            <span className="flex items-center gap-1.5 font-bold text-xs text-foreground">
              <ClipboardList className="size-3.5 text-gold-text" />
              {isPrefilled ? "Fiche Universelle Pré-remplie" : "Fiche Universelle Complète"}
            </span>
            <span className="text-[11px] text-muted-foreground leading-tight">
              Toutes zones, tous profils (H/F/Mineur) &amp; contre-indications
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {isPrefilled ? "Cibler une zone précise (nouveau besoin)" : "Fiches ciblées par zone (1 zone)"}
          </DropdownMenuLabel>
          {BODY_ZONES.map((z) => (
            <DropdownMenuItem
              key={z.id}
              onClick={() => openSheet({ zone: z.id })}
              className="flex flex-col items-start gap-0.5 py-1.5 cursor-pointer"
            >
              <span className="text-xs font-semibold text-foreground">{z.label}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{z.hint}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setMultiOpen(true)}
            className="gap-2 py-2 cursor-pointer font-semibold text-xs text-bissap"
          >
            <Layers className="size-3.5" />
            Composer une fiche Multi-Zones...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={multiOpen} onOpenChange={setMultiOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-base flex items-center gap-2">
              <Layers className="size-4 text-bissap" />
              {isPrefilled ? "Composer une fiche pré-remplie Multi-Zones" : "Composer une fiche vierge sur mesure"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sélectionnez les zones à inclure dans ce PDF (tronc commun + contre-indications inclus automatiquement).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {BODY_ZONES.map((z) => {
              const checked = multiZones.includes(z.id);
              return (
                <label
                  key={z.id}
                  className={cn(
                    "flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                    checked ? "border-gold/60 bg-gold/10" : "border-border hover:bg-muted/40"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      setMultiZones((prev) =>
                        v ? [...prev, z.id] : prev.filter((item) => item !== z.id)
                      );
                    }}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-foreground">{z.label}</div>
                    <div className="text-[11px] text-muted-foreground">{z.hint}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMultiOpen(false);
                openSheet({ mode: "universelle" });
              }}
              className="text-xs"
            >
              Tout inclure (Universelle)
            </Button>
            <Button
              size="sm"
              disabled={multiZones.length === 0}
              onClick={() => {
                setMultiOpen(false);
                if (multiZones.length === BODY_ZONES.length) {
                  openSheet({ mode: "universelle" });
                } else if (multiZones.length === 1) {
                  openSheet({ zone: multiZones[0] });
                } else {
                  openSheet({ zones: multiZones });
                }
              }}
              className="k-btn-gold text-primary-foreground text-xs font-bold gap-1.5"
            >
              <Printer className="size-3.5" />
              Générer le PDF ({multiZones.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
