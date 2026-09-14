"use client";
// Kènè — Console Admin (t. 128 — refonte en console de GESTION):
// onglets Vue d'ensemble · Instituts · Utilisatrices · Sécurité.
// La fondatrice pilote désormais le réseau: suspendre/réactiver un institut
// (motif montré à la gérante, notifiée), piloter commission et plan, et
// verrouiller un compte abusif. Les routes de gestion exigent une session
// admin (aucun mode anonyme) et chaque geste est audité.
import { useState } from "react";
import { Building2, LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import { apiGet } from "@/lib/kene/api";
import { cn } from "@/lib/utils";
import { useApi } from "@/components/kene/pro/useApi";
import { ErrorState } from "@/components/kene/pro/ui-bits";
import type { AdminSecurity as AdminSecurityData, AdminStats } from "@/components/kene/pro/types";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { KeneEmblem } from "@/components/kene/icons";
import { AdminOverview } from "./AdminOverview";
import { AdminSecurity } from "./AdminSecurity";
import { AdminTenants } from "./AdminTenants";
import { AdminUsers } from "./AdminUsers";

type AdminTab = "overview" | "tenants" | "users" | "security";

const TABS: { key: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { key: "tenants", label: "Instituts", icon: Building2 },
  { key: "users", label: "Utilisatrices", icon: Users },
  { key: "security", label: "Sécurité", icon: ShieldCheck },
];

export function AdminApp() {
  const [tab, setTab] = useState<AdminTab>("overview");

  // Vue d'ensemble + Sécurité gardent LEURS hooks (la navigation entre
  // onglets ne re-télécharge jamais ce qui est déjà en mémoire — l'état
  // useApi vit dans ce composant, les onglets ne démontent que le DOM).
  const stats = useApi(() => apiGet<AdminStats>("/api/admin/stats"), []);
  const sec = useApi(() => apiGet<AdminSecurityData>("/api/admin/security"), []);

  if (stats.error && !stats.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <ConsoleHeader />
        <ErrorState message={`Console indisponible : ${stats.error}`} onRetry={stats.refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 space-y-5 min-h-screen">
      <ConsoleHeader />

      {/* Onglets — pills larges (44 px+), icône + libellé, scroll horizontal mobile */}
      <nav aria-label="Sections de la console" className="sticky top-2 z-20 -mx-1 overflow-x-auto pretty-scroll px-1 pb-1">
        <div className="flex min-w-max gap-1.5 rounded-2xl border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors",
                tab === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Contenu de l'onglet actif */}
      {tab === "overview" && (
        stats.loading && !stats.data ? (
          <div className="space-y-5" aria-busy="true" aria-label="Chargement de la console">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : (
          <AdminOverview stats={stats} />
        )
      )}
      {tab === "tenants" && <AdminTenants />}
      {tab === "users" && <AdminUsers />}
      {tab === "security" && <AdminSecurity sec={sec} />}

      <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Console plateforme Kènè · Pilotage réseau &amp; modération · Chaque geste est audité
      </p>
    </div>
  );
}

function ConsoleHeader() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div aria-hidden="true" className="kente-band h-1.5 w-full" />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {/* Sceau de marque — la console porte le Médaillon Kènè */}
          <span aria-hidden="true" className="shrink-0 select-none">
            <KeneEmblem size={56} className="drop-shadow-[0_2px_10px_rgba(200,149,30,0.22)]" />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Console Kènè</h2>
            <p className="text-sm text-muted-foreground">Pilotage de la plateforme — instituts, IA diagnostic, marketplace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BadgeConsole />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function BadgeConsole() {
  return (
    <span className="inline-flex items-center rounded-full border border-finance/30 bg-finance/15 px-2.5 py-0.5 text-xs font-medium text-finance">
      Espace administrateur
    </span>
  );
}
