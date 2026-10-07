"use client";

import { motion } from "framer-motion";
import {
  ScanFace,
  PersonStanding,
  Hand,
  Brush,
  Cross,
  Check,
} from "lucide-react";
import { DuafeIcon } from "@/components/kene/icons";
import { cn } from "@/lib/utils";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";

interface SkinZoneSelectorProps {
  selectedZone: BodyZone;
  onSelectZone: (zone: BodyZone) => void;
}

const ZONE_ICONS: Record<BodyZone, React.ComponentType<{ className?: string }>> = {
  visage: ScanFace,
  dos: PersonStanding,
  cuir_chevelu: DuafeIcon,
  mains: Hand,
  barbe: Brush,
  naevi: Cross,
};

const ZONE_DETAILS: Record<
  BodyZone,
  { shortName: string; focus: string; badge: string; color: string }
> = {
  visage: {
    shortName: "Visage",
    focus: "Teint, mélanine, pores, taches PIH & barrière",
    badge: "Priorité cabine",
    color: "from-gold/20 to-amber-500/10 border-gold/40 text-gold-text",
  },
  dos: {
    shortName: "Dos & Épaules",
    focus: "Acné dorsale, folliculite, omoplates & rugosités",
    badge: "Soin purifiant",
    color: "from-terre/20 to-stone-500/10 border-terre/40 text-terre",
  },
  cuir_chevelu: {
    shortName: "Cuir chevelu",
    focus: "Desquamation, sébum, alopécie & racine",
    badge: "Trichologie",
    color: "from-bissap/20 to-rose-500/10 border-bissap/40 text-bissap",
  },
  mains: {
    shortName: "Mains & Pieds",
    focus: "Extrémités : crevasses talons, callosités, ongles & sécheresse",
    badge: "Soin acral réparateur",
    color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  },
  barbe: {
    shortName: "Barbe & Cou",
    focus: "Poils incarnés, pseudo-folliculite, gorge & menton",
    badge: "Soin apaisant",
    color: "from-amber-600/20 to-orange-500/10 border-amber-600/40 text-amber-700 dark:text-amber-400",
  },
  naevi: {
    shortName: "Corps & Lésions",
    focus: "Bras, jambes, torse, ventre, cuisses, analyse ABCDE",
    badge: "Corps & Dépistage",
    color: "from-red-500/20 to-rose-600/10 border-red-500/40 text-red-600 dark:text-red-400",
  },
};

export function SkinZoneSelector({ selectedZone, onSelectZone }: SkinZoneSelectorProps) {
  return (
    <div className="space-y-3" role="radiogroup" aria-label="Sélection de la zone anatomique">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Cartographie de la zone à diagnostiquer
        </label>
        <span className="text-[11px] font-medium text-gold-text bg-gold/10 px-2 py-0.5 rounded-full border border-gold/20">
          Pondération clinique active
        </span>
      </div>

      {/* Grille tactile ergonomique adaptée tablette & desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {BODY_ZONES.map((z) => {
          const isSelected = selectedZone === z.id;
          const Icon = ZONE_ICONS[z.id];
          const details = ZONE_DETAILS[z.id];

          return (
            <motion.button
              key={z.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectZone(z.id)}
              className={cn(
                "relative text-left p-3 rounded-2xl border transition-all duration-200 flex flex-col justify-between min-h-[96px]",
                isSelected
                  ? "bg-gradient-to-br border-primary shadow-sm ring-2 ring-primary/20 " + details.color
                  : "bg-card/70 hover:bg-muted/60 border-border text-foreground"
              )}
            >
              {/* En-tête de la carte de zone */}
              <div className="flex items-start justify-between gap-1.5 w-full">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid place-items-center size-7 rounded-xl shrink-0 transition-colors",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="font-heading font-bold text-xs sm:text-[13px] leading-tight line-clamp-1">
                    {details.shortName}
                  </span>
                </div>

                {isSelected && (
                  <span className="size-4 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0">
                    <Check className="size-2.5 stroke-[3]" />
                  </span>
                )}
              </div>

              {/* Description & focus dermo */}
              <p className="text-[10.5px] text-muted-foreground leading-snug line-clamp-2 mt-1.5">
                {details.focus}
              </p>

              {/* Tag / badge clinique */}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[9.5px] font-semibold opacity-85">
                  {details.badge}
                </span>
                <span className="text-[9.5px] font-mono text-muted-foreground">
                  Poids {Math.round(z.weight * 100)}%
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
