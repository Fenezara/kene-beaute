"use client";
// Kènè — Sélecteur & Vitrine des Palettes de Statut d'Abonnement.
// Permet à l'utilisatrice / gérante de visualiser l'ambiance chromatique
// liée à son statut et de basculer entre les palettes débloquées.

import { useEffect, useState } from "react";
import { Check, Lock, Palette, Sparkles, Wand2 } from "lucide-react";
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

export function TierThemeSelector({ className, audience }: { className?: string; audience?: "client" | "pro" }) {
  const user = useKene((s) => s.user);
  const effectiveAudience = audience ?? (user?.role === "pro" ? "pro" : "client");

  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [loyaltyMonth, setLoyaltyMonth] = useState<number>(0);
  const [currentTierId, setCurrentTierId] = useState<TierThemeId>("karite_tiebele");
  const [isManualOverride, setIsManualOverride] = useState(false);

  // Charger l'état réel de l'abonnement pour calculer les déblocages
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

          // Synchroniser le thème actif
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
      toast.error(`Palette réservée : ${theme.badge}`, {
        description: `Cette ambiance chromatique se débloque avec l'offre ${theme.badge}.`,
      });
      return;
    }

    saveTierTheme(theme.id);
    setCurrentTierId(theme.id);
    setIsManualOverride(true);
    toast.success(`Ambiance « ${theme.name} » appliquée 🎨`, {
      description: theme.subtitle,
    });
  }

  function handleResetAuto() {
    haptic(HAPTIC.tap);
    saveTierTheme(null);
    const def = resolveDefaultTierTheme(context);
    setCurrentTierId(def);
    setIsManualOverride(false);
    applyTierThemeToDom(def);
    const defObj = TIER_THEMES.find((t) => t.id === def);
    toast.success("Ambiance automatique synchronisée ✨", {
      description: `Synchronisée avec votre palier : ${defObj?.name ?? "Kènè"}`,
    });
  }

  return (
    <div className={cn("k-card rounded-[24px] p-4 space-y-4 border border-border/80", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconBadge icon={<Palette size={19} />} tone="gold" />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-foreground">Palettes &amp; Ambiance de Statut</p>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                {activeDef.badge}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Les couleurs s&apos;harmonisent avec le niveau de votre abonnement et votre fidélité.
            </p>
          </div>
        </div>

        {isManualOverride && (
          <button
            type="button"
            onClick={handleResetAuto}
            className="text-[10px] font-bold text-primary hover:underline shrink-0 inline-flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-lg"
            title="Revenir au thème calculé automatiquement selon votre abonnement"
          >
            <Wand2 size={11} /> Auto
          </button>
        )}
      </div>

      {/* Carte d'aperçu de la palette active */}
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 flex items-center gap-3.5">
        <div
          className={cn(
            "size-11 rounded-full shrink-0 shadow-sm border border-white/20 bg-gradient-to-br flex items-center justify-center text-white",
            activeDef.previewGradient
          )}
        >
          <Sparkles size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground truncate">{activeDef.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground">({activeDef.tag})</span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{activeDef.subtitle}</p>
        </div>
      </div>

      {/* Grille des palettes débloquées & à débloquer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {TIER_THEMES.map((t) => {
          const isSelected = t.id === currentTierId;
          const unlocked = isTierUnlocked(t.id, context);

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelect(t)}
              aria-pressed={isSelected}
              className={cn(
                "rounded-xl border p-2.5 text-left transition-all active:scale-[0.98] flex items-center gap-2.5 relative group",
                isSelected
                  ? "border-primary bg-primary/10 shadow-xs"
                  : unlocked
                  ? "border-border/60 bg-background/60 hover:border-primary/40 hover:bg-muted/30"
                  : "border-border/30 bg-muted/10 opacity-60 cursor-not-allowed"
              )}
            >
              <div
                className={cn(
                  "size-8 rounded-full shrink-0 shadow-xs border border-white/20 bg-gradient-to-br flex items-center justify-center text-white",
                  t.previewGradient
                )}
              >
                {isSelected ? (
                  <Check size={13} className="text-white drop-shadow" />
                ) : !unlocked ? (
                  <Lock size={12} className="text-white/80 drop-shadow" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={cn("text-xs font-bold truncate", isSelected ? "text-primary" : "text-foreground")}>
                    {t.name}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-muted text-muted-foreground shrink-0">
                    {t.tag}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                  {unlocked ? t.subtitle : `Déblocage : ${t.badge}`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
