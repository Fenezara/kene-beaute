"use client";
// Kènè — Galerie de Haute Joaillerie & Palettes de Statut Royale.
// Une immersion visuelle prestigieuse inspirée des trésors minéraux,
// métalliques et botaniques des grands royaumes africains.

import { useEffect, useState } from "react";
import { Check, Crown, Eye, Lock, Sparkles, Wand2, Shield, Gem } from "lucide-react";
import { toast } from "sonner";
import {
  TIER_THEMES,
  type TierThemeId,
  type TierThemeDef,
  isTierUnlocked,
  resolveDefaultTierTheme,
  getSavedTierTheme,
  saveTierTheme,
  applyTierThemeToDom,
} from "@/lib/kene/tier-theme";
import {
  BaouleIcon,
  BissapFlowerIcon,
  CacaoPodIcon,
  KariteIcon,
  KenteIcon,
  MoringaIcon,
} from "@/components/kene/icons";
import { useKene } from "@/store/kene";
import { apiGet } from "@/lib/kene/api";
import { IconBadge } from "./ui2026";
import { Badge } from "@/components/ui/badge";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { cn } from "@/lib/utils";

interface TierThemeSelectorProps {
  className?: string;
  audience?: "client" | "pro";
}

function getHeritageIcon(symbol: TierThemeDef["symbol"]) {
  switch (symbol) {
    case "karite":
      return <KariteIcon className="size-5" />;
    case "bissap":
      return <BissapFlowerIcon className="size-5" />;
    case "baoule":
      return <BaouleIcon className="size-5" />;
    case "bronze":
      return <CacaoPodIcon className="size-5" />;
    case "moringa":
      return <MoringaIcon className="size-5" />;
    case "indigo":
      return <KenteIcon className="size-5" />;
  }
}

export function TierThemeSelector({ className, audience }: TierThemeSelectorProps) {
  const user = useKene((s) => s.user);
  const effectiveAudience = audience ?? (user?.role === "pro" ? "pro" : "client");

  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [loyaltyMonth, setLoyaltyMonth] = useState<number>(0);
  const [currentTierId, setCurrentTierId] = useState<TierThemeId>("karite_tiebele");
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [previewTimer, setPreviewTimer] = useState<NodeJS.Timeout | null>(null);

  // Charger l'état réel de l'abonnement pour calculer les parures débloquées
  useEffect(() => {
    let alive = true;
    if (user?.id) {
      apiGet<{
        plan: string;
        subscription?: { plan: string } | null;
        loyalty?: { monthsPaid?: number; currentMonth?: number };
      }>(`/api/subscriptions?userId=${encodeURIComponent(user.id)}&audience=${effectiveAudience}`)
        .then((res) => {
          if (!alive) return;
          const plan = res.subscription?.plan ?? res.plan ?? null;
          setActivePlan(plan);
          const month = Math.max(res.loyalty?.monthsPaid ?? 0, res.loyalty?.currentMonth ?? 0);
          setLoyaltyMonth(month);

          const saved = getSavedTierTheme();
          if (saved && isTierUnlocked(saved, { user, planId: plan, monthsPaid: month, currentMonth: month })) {
            setCurrentTierId(saved);
            setIsManualOverride(true);
            applyTierThemeToDom(saved);
          } else {
            const def = resolveDefaultTierTheme({ user, planId: plan, monthsPaid: month, currentMonth: month });
            setCurrentTierId(def);
            setIsManualOverride(false);
            applyTierThemeToDom(def);
          }
        })
        .catch(() => {
          if (!alive) return;
          const saved = getSavedTierTheme();
          if (saved) {
            setCurrentTierId(saved);
            setIsManualOverride(true);
            applyTierThemeToDom(saved);
          } else {
            const def = resolveDefaultTierTheme({ user, planId: null });
            setCurrentTierId(def);
            applyTierThemeToDom(def);
          }
        });
    } else {
      const saved = getSavedTierTheme();
      if (saved) {
        setCurrentTierId(saved);
        setIsManualOverride(true);
        applyTierThemeToDom(saved);
      } else {
        const def = resolveDefaultTierTheme({ user: null });
        setCurrentTierId(def);
        applyTierThemeToDom(def);
      }
    }

    return () => {
      alive = false;
      if (previewTimer) clearTimeout(previewTimer);
    };
  }, [user, effectiveAudience]);

  const context = {
    user,
    planId: activePlan,
    monthsPaid: loyaltyMonth,
    currentMonth: loyaltyMonth,
  };

  const activeDef = TIER_THEMES.find((t) => t.id === currentTierId) ?? TIER_THEMES[0];

  function handleSelect(theme: TierThemeDef) {
    haptic(HAPTIC.tap);
    const unlocked = isTierUnlocked(theme.id, context);
    if (!unlocked) {
      haptic(HAPTIC.warning);
      toast.error(`Parure royale réservée : ${theme.badge}`, {
        description: `Ce sacrement de haute joaillerie s'obtient avec l'abonnement ${theme.badge}.`,
      });
      return;
    }

    if (previewTimer) clearTimeout(previewTimer);
    saveTierTheme(theme.id);
    setCurrentTierId(theme.id);
    setIsManualOverride(true);
    haptic(HAPTIC.success);
    toast.success(`Parure « ${theme.name} » appliquée 👑`, {
      description: `${theme.gemstone} · ${theme.kingdom}`,
    });
  }

  function handlePreviewTemporary(theme: TierThemeDef) {
    haptic(HAPTIC.tap);
    applyTierThemeToDom(theme.id);
    setCurrentTierId(theme.id);

    if (previewTimer) clearTimeout(previewTimer);
    const timer = setTimeout(() => {
      const def = getSavedTierTheme() ?? resolveDefaultTierTheme(context);
      applyTierThemeToDom(def);
      setCurrentTierId(def);
      toast.info("Fin de l'Aperçu Royal", {
        description: "Souscrivez à l'offre pour revêtir cette parure de façon permanente.",
      });
    }, 5 * 60 * 1000); // 5 minutes d'aperçu
    setPreviewTimer(timer);

    toast.success(`Aperçu Royal activé (5 min) ✨`, {
      description: `Admirez la parure ${theme.name} sur toute votre application.`,
    });
  }

  function handleResetAuto() {
    haptic(HAPTIC.tap);
    if (previewTimer) clearTimeout(previewTimer);
    saveTierTheme(null);
    const def = resolveDefaultTierTheme(context);
    setCurrentTierId(def);
    setIsManualOverride(false);
    applyTierThemeToDom(def);
    const defObj = TIER_THEMES.find((t) => t.id === def);
    toast.success("Ambiance royale automatique synchronisée ✨", {
      description: `Parure alignée sur votre statut officiel : ${defObj?.name ?? "Kènè"}`,
    });
  }

  return (
    <div className={cn("k-card rounded-[26px] p-4 sm:p-5 space-y-4 sm:space-y-5 border border-gold/30 shadow-sm relative overflow-hidden", className)}>
      {/* En-tête de prestige */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-gold-text bg-gold/15 px-2.5 py-0.5 rounded-full border border-gold/30 inline-flex items-center gap-1.5">
              <Crown size={12} className="text-gold-text" /> Haute Joaillerie Africaine
            </span>
            <Badge variant="outline" className="text-[10px] font-bold border-primary/30 text-primary bg-primary/10">
              {activeDef.rarityTag}
            </Badge>
          </div>
          <h3 className="font-heading text-base sm:text-lg font-bold text-foreground">
            Parures &amp; Ambiances Royales
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            Inspirées des métaux précieux et de la pharmacopée sacrée des grands souverains d&apos;Afrique. Chaque palier sublime l&apos;application d&apos;une parure minérale et chromatique unique.
          </p>
        </div>

        {isManualOverride && (
          <button
            type="button"
            onClick={handleResetAuto}
            className="text-xs font-bold text-primary hover:underline shrink-0 inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-xl active:scale-95 transition-all shadow-xs"
            title="Réaligner automatiquement sur l'abonnement actif"
          >
            <Wand2 size={13} /> Synchronisation Auto
          </button>
        )}
      </div>

      {/* Carte Maîtresse : Parure Royale Actuelle (Effet WAHOU immersif) */}
      <div
        className="rounded-[22px] p-4 sm:p-5 text-white shadow-lg relative overflow-hidden transition-all duration-500 border border-white/20"
        style={{
          background: activeDef.heroGradient,
          boxShadow: `0 16px 36px -12px ${activeDef.glowColor}, inset 0 1px 0 rgba(255, 255, 255, 0.4)`,
        }}
      >
        {/* Filigrane d'héritage africain en arrière-plan */}
        <div className="absolute -right-6 -bottom-6 opacity-15 pointer-events-none scale-150 transform rotate-12 text-white">
          {getHeritageIcon(activeDef.symbol)}
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-md">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-black/25 backdrop-blur-md border border-white/20 text-white shadow-xs">
                {getHeritageIcon(activeDef.symbol)}
              </span>
              <span className="text-[11px] font-bold tracking-wider uppercase drop-shadow-sm opacity-90">
                {activeDef.kingdom}
              </span>
            </div>

            <h4 className="font-heading text-lg sm:text-xl font-bold tracking-tight text-white drop-shadow">
              {activeDef.name}
            </h4>

            <p className="text-xs text-white/90 leading-relaxed font-medium drop-shadow-xs">
              {activeDef.description}
            </p>

            <div className="flex items-center gap-2 pt-1 text-[11px] text-white/80">
              <span className="inline-flex items-center gap-1">
                <Gem size={13} /> {activeDef.gemstone}
              </span>
              <span>•</span>
              <span className="font-semibold">{activeDef.badge}</span>
            </div>
          </div>

          <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-2 border-t sm:border-t-0 sm:border-l border-white/20 pt-3 sm:pt-0 sm:pl-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white text-zinc-900 px-3 py-1.5 rounded-full shadow-md">
              <Check size={14} className="text-emerald-600 stroke-[3]" /> Parure Active
            </span>
            <span className="text-[10px] text-white/80 font-mono tracking-wide">
              {activeDef.rarityTag}
            </span>
          </div>
        </div>
      </div>

      {/* Galerie des 6 Parures de Haute Joaillerie */}
      <div className="space-y-2.5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Collection des Parures Sacrées &amp; Matières Précieuses
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TIER_THEMES.map((t) => {
            const isSelected = t.id === currentTierId;
            const unlocked = isTierUnlocked(t.id, context);

            return (
              <div
                key={t.id}
                className={cn(
                  "rounded-2xl border p-3.5 transition-all duration-300 relative flex flex-col justify-between gap-3 group",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary/40"
                    : unlocked
                    ? "border-border/80 bg-card/60 hover:border-primary/50 hover:bg-muted/40"
                    : "border-border/40 bg-muted/15 opacity-75 hover:opacity-90"
                )}
                style={{
                  borderColor: isSelected ? undefined : t.metallicBorder,
                }}
              >
                {/* En-tête de la carte */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="size-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm border border-white/20"
                      style={{ background: t.heroGradient }}
                    >
                      {getHeritageIcon(t.symbol)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={cn("font-heading text-sm font-bold truncate", isSelected ? "text-primary" : "text-foreground")}>
                          {t.name}
                        </p>
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        {t.kingdom}
                      </p>
                    </div>
                  </div>

                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-muted border border-border/60 text-muted-foreground shrink-0">
                    {t.rarityTag}
                  </span>
                </div>

                {/* Subtitle & Matière précieuse */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground leading-snug">
                    {t.subtitle}
                  </p>
                  <p className="text-[10px] text-foreground/80 font-medium inline-flex items-center gap-1">
                    <Gem size={11} className="text-gold-text" /> {t.gemstone}
                  </p>
                </div>

                {/* Actions : Revêtir / Aperçu / Verrouillé */}
                <div className="pt-1 flex items-center justify-between gap-2 border-t border-border/50">
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {unlocked ? t.badge : `🔒 ${t.badge}`}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {unlocked ? (
                      isSelected ? (
                        <span className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs">
                          <Check size={13} /> Revêtue
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelect(t)}
                          className="h-8 px-3 rounded-xl k-btn-tier text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                        >
                          <Crown size={12} /> Revêtir
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePreviewTemporary(t)}
                        className="h-8 px-2.5 rounded-xl border border-border hover:border-primary/50 bg-background/80 text-foreground text-[11px] font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-2xs hover:bg-muted"
                        title="Activer un aperçu royal immersif de 5 minutes sur votre interface"
                      >
                        <Eye size={12} className="text-gold-text" /> Aperçu (5 min)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
