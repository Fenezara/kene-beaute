"use client";
// Kènè — Initialiseur global de palette d'abonnement au démarrage.
// Écoute l'utilisateur courant et synchronise le data-tier sur <html>.

import { useEffect, useRef } from "react";
import { useKene } from "@/store/kene";
import { apiGet } from "@/lib/kene/api";
import { syncActiveTierTheme, getSavedTierTheme, applyTierThemeToDom, resolveDefaultTierTheme } from "@/lib/kene/tier-theme";

// Cache mémoire court pour éviter de sur-solliciter /api/subscriptions
const subsCache = new Map<string, { plan: string | null; month: number; ts: number }>();
const CACHE_TTL = 60_000; // 60 secondes

export function TierThemeBoot() {
  const user = useKene((s) => s.user);
  const proTenantId = useKene((s) => s.proTenantId);
  const userId = user?.id;
  const userRole = user?.role;
  const tenantId = proTenantId || user?.tenantId;
  const lastFetchedKey = useRef<string | null>(null);

  // Écoute en temps réel de changement de thème de l'institut par la gérante
  useEffect(() => {
    const handleTenantChange = (e: Event) => {
      const custom = e as CustomEvent<{ tenantId: string; themeId: string | null }>;
      if (custom.detail?.themeId) {
        applyTierThemeToDom(custom.detail.themeId as any);
      }
    };
    window.addEventListener("kene:tenant-tier-theme-changed", handleTenantChange);
    return () => {
      window.removeEventListener("kene:tenant-tier-theme-changed", handleTenantChange);
    };
  }, []);

  useEffect(() => {
    // 1. Appliquer immédiatement le choix sauvegardé en local ou par défaut
    const saved = getSavedTierTheme();
    if (saved) {
      applyTierThemeToDom(saved);
    } else {
      applyTierThemeToDom(resolveDefaultTierTheme({ user, planId: null }));
    }

    // 2. Si aucun utilisateur connecté, s'arrêter là
    if (!userId) {
      lastFetchedKey.current = null;
      return;
    }

    const audience = userRole === "pro" ? "pro" : "client";
    const cacheKey = `${userId}:${audience}:${tenantId ?? ""}`;
    const cached = subsCache.get(cacheKey);

    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      syncActiveTierTheme({
        user,
        planId: cached.plan,
        monthsPaid: cached.month,
        currentMonth: cached.month,
        tenantId,
      });
      return;
    }

    if (lastFetchedKey.current === cacheKey) return;
    lastFetchedKey.current = cacheKey;

    let alive = true;

    apiGet<{
      plan: string;
      subscription?: { plan: string } | null;
      loyalty?: { monthsPaid?: number; currentMonth?: number };
    }>(`/api/subscriptions?userId=${encodeURIComponent(userId)}&audience=${audience}`)
      .then((res) => {
        if (!alive) return;
        const plan = res.subscription?.plan ?? res.plan ?? null;
        const month = Math.max(res.loyalty?.monthsPaid ?? 0, res.loyalty?.currentMonth ?? 0);
        subsCache.set(cacheKey, { plan, month, ts: Date.now() });
        syncActiveTierTheme({
          user: useKene.getState().user,
          planId: plan,
          monthsPaid: month,
          currentMonth: month,
          tenantId,
        });
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [userId, userRole, tenantId]);

  return <div className="k-ambient-tier-aura" aria-hidden="true" />;
}
