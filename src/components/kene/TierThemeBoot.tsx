"use client";
// Kènè — Initialiseur global de palette d'abonnement au démarrage.
// Écoute l'utilisateur courant et synchronise le data-tier sur <html>.

import { useEffect } from "react";
import { useKene } from "@/store/kene";
import { apiGet } from "@/lib/kene/api";
import { syncActiveTierTheme, getSavedTierTheme, applyTierThemeToDom, resolveDefaultTierTheme } from "@/lib/kene/tier-theme";

export function TierThemeBoot() {
  const user = useKene((s) => s.user);

  useEffect(() => {
    // 1. Appliquer immédiatement le choix sauvegardé en local ou par défaut
    const saved = getSavedTierTheme();
    if (saved) {
      applyTierThemeToDom(saved);
    } else {
      applyTierThemeToDom(resolveDefaultTierTheme({ user, planId: null }));
    }

    // 2. Si un utilisateur est connecté, récupérer son abonnement pour synchroniser
    if (!user?.id) return;

    let alive = true;
    const audience = user.role === "pro" ? "pro" : "client";

    apiGet<{
      plan: string;
      subscription?: { plan: string } | null;
      loyalty?: { monthsPaid?: number; currentMonth?: number };
    }>(`/api/subscriptions?userId=${encodeURIComponent(user.id)}&audience=${audience}`)
      .then((res) => {
        if (!alive) return;
        const plan = res.subscription?.plan ?? res.plan ?? null;
        const month = Math.max(res.loyalty?.monthsPaid ?? 0, res.loyalty?.currentMonth ?? 0);
        syncActiveTierTheme({
          user,
          planId: plan,
          monthsPaid: month,
          currentMonth: month,
        });
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [user]);

  return null;
}
