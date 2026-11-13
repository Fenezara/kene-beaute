"use client";

import { motion } from "framer-motion";
import {
  ScanFace,
  PersonStanding,
  Hand,
  Brush,
  Cross,
  Check,
  Sparkles,
  Layers,
  ShieldCheck,
  CheckSquare,
  Square,
} from "lucide-react";
import { DuafeIcon } from "@/components/kene/icons";
import { cn } from "@/lib/utils";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";

export interface ClinicalPack {
  id: string;
  label: string;
  tagline: string;
  zones: BodyZone[];
  badge: string;
  color: string;
}

export const CLINICAL_PACKS: ClinicalPack[] = [
  {
    id: "pack_eclat",
    label: "Pack Éclat & Uniformité",
    tagline: "Visage + Barbe/Cou + Mains (Contrastes de carnation & mélasma)",
    zones: ["visage", "barbe", "mains"],
    badge: "Populaire Abidjan",
    color: "from-amber-500/20 via-gold/15 to-amber-600/10 border-gold/50 text-gold-text",
  },
  {
    id: "pack_purete",
    label: "Pack Pureté & Anti-Imperfections",
    tagline: "Visage + Dos & Épaules (Acné faciale et troncale, PIH)",
    zones: ["visage", "dos"],
    badge: "Acné & Sébum",
    color: "from-terre/20 via-stone-500/15 to-terre/10 border-terre/50 text-terre",
  },
  {
    id: "pack_reparation",
    label: "Pack Réparation & Barrière",
    tagline: "Visage + Mains & Pieds + Corps (Xérose, Harmattan, crevasses)",
    zones: ["visage", "mains", "naevi"],
    badge: "Nutrition Haute",
    color: "from-emerald-500/20 via-teal-500/15 to-emerald-600/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "pack_integral",
    label: "Check-up Dermo-Intégral",
    tagline: "Les 6 zones corporelles complètes pour un bilan exhaustif",
    zones: ["visage", "dos", "cuir_chevelu", "mains", "barbe", "naevi"],
    badge: "Exhaustif 360°",
    color: "from-bissap/20 via-purple-500/15 to-bissap/10 border-bissap/50 text-bissap",
  },
];

interface SkinZoneSelectorProps {
  selectedZone?: BodyZone;
  onSelectZone?: (zone: BodyZone) => void;
  // Support Multi-Zones
  selectedZones?: BodyZone[];
  onSelectZones?: (zones: BodyZone[]) => void;
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

export function SkinZoneSelector({
  selectedZone = "visage",
  onSelectZone,
  selectedZones,
  onSelectZones,
}: SkinZoneSelectorProps) {
  // Mode multi-zones si handler ou liste fourni, sinon fallback mono-zone
  const isMulti = Boolean(onSelectZones || selectedZones);
  const activeZones: BodyZone[] = selectedZones || (selectedZone ? [selectedZone] : ["visage"]);

  const toggleZone = (zId: BodyZone) => {
    if (onSelectZones) {
      if (activeZones.includes(zId)) {
        // Garder au moins 1 zone
        if (activeZones.length > 1) {
          onSelectZones(activeZones.filter((z) => z !== zId));
        }
      } else {
        onSelectZones([...activeZones, zId]);
      }
    } else if (onSelectZone) {
      onSelectZone(zId);
    }
  };

  const applyPack = (pack: ClinicalPack) => {
    if (onSelectZones) {
      onSelectZones(pack.zones);
    } else if (onSelectZone && pack.zones[0]) {
      onSelectZone(pack.zones[0]);
    }
  };

  return (
    <div className="space-y-4" aria-label="Sélection de la zone anatomique">
      {/* ── BANNERS 1-CLIC : PACKS CLINIQUES CABINET LA DERMO ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-gold-text" />
            <span>Packs Cliniques 1-Clic (Consultation Multi-Zones)</span>
          </label>
          <span className="text-[11px] font-bold text-gold-text bg-gold/10 px-2 py-0.5 rounded-full border border-gold/30">
            {activeZones.length} zone{activeZones.length > 1 ? "s" : ""} sélectionnée{activeZones.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CLINICAL_PACKS.map((pack) => {
            const isPackActive =
              pack.zones.length === activeZones.length &&
              pack.zones.every((z) => activeZones.includes(z));

            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => applyPack(pack)}
                className={cn(
                  "p-2.5 rounded-xl border text-left transition-all flex items-start justify-between gap-2",
                  isPackActive
                    ? "bg-gradient-to-r shadow-xs ring-2 ring-primary/40 " + pack.color
                    : "bg-card/80 hover:bg-muted/50 border-border text-foreground"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold truncate">{pack.label}</span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10 shrink-0">
                      {pack.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{pack.tagline}</p>
                </div>
                {isPackActive ? (
                  <span className="size-5 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0 mt-0.5">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                ) : (
                  <span className="size-5 rounded-full border border-border/80 grid place-items-center shrink-0 mt-0.5 text-muted-foreground text-[10px]">
                    +
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SÉLECTION INDIVIDUELLE OU MULTIPLE DES 6 ZONES ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-foreground" />
            <span>Cartographie anatomique (Cochez les zones à diagnostiquer ensemble)</span>
          </label>
          <span className="text-[10.5px] text-muted-foreground font-mono">
            Pondération dynamique active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {BODY_ZONES.map((z) => {
            const isSelected = activeZones.includes(z.id);
            const Icon = ZONE_ICONS[z.id];
            const details = ZONE_DETAILS[z.id];

            return (
              <motion.button
                key={z.id}
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleZone(z.id)}
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

                  {isSelected ? (
                    <span className="size-4 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0">
                      <Check className="size-2.5 stroke-[3]" />
                    </span>
                  ) : (
                    <span className="size-4 rounded-full border border-border grid place-items-center shrink-0 text-muted-foreground" />
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
    </div>
  );
}
