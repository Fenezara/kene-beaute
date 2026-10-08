"use client";
// Kènè — Console Admin (t. 128 — console de GESTION; t. 130 — porte dédiée
// /console, session 8 h, step-up, passkeys; t. 135 — abonnements): onglets
// Vue d'ensemble · Instituts · Utilisatrices · Abonnements · Sécurité.
// La fondatrice pilote le réseau: suspendre/réactiver un institut (motif
// montré à la gérante, notifiée), piloter commission et plan, verrouiller
// un compte abusif, et gérer la monétisation (abonnées, MRR simulé,
// annulation notifiée, 30 j offerts) — chaque geste sensible exige une
// confirmation d'identité fraîche (AdminGate) et est audité. Les routes
// de gestion exigent une session admin stricte.
import { useState } from "react";
import { ArrowLeft, Building2, Calendar, CreditCard, ExternalLink, KeyRound, LayoutDashboard, LogOut, ShieldCheck, ShoppingBag, Users } from "lucide-react";
import { apiGet } from "@/lib/kene/api";
import { cn } from "@/lib/utils";
import { useApi } from "@/components/kene/pro/useApi";
import { ErrorState } from "@/components/kene/pro/ui-bits";
import { Button } from "@/components/ui/button";
import { useKene } from "@/store/kene";
import { performLogout } from "@/lib/kene/logout";
import type { AdminSecurity as AdminSecurityData, AdminStats } from "@/components/kene/pro/types";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { KeneEmblem } from "@/components/kene/icons";
import { AdminGateProvider } from "./admin-gate";
import { AdminOverview } from "./AdminOverview";
import { AdminOrders } from "./AdminOrders";
import { AdminAppointments } from "./AdminAppointments";
import { AdminPasskeyCard } from "./AdminPasskeyCard";
import { AdminSecurity } from "./AdminSecurity";
import { AdminSubscriptions } from "./AdminSubscriptions";
import { AdminTenants } from "./AdminTenants";
import { AdminUsers } from "./AdminUsers";

type AdminTab = "overview" | "orders" | "appointments" | "tenants" | "users" | "subs" | "security";

const TABS: { key: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { key: "orders", label: "Commandes", icon: ShoppingBag },
  { key: "appointments", label: "Rendez-Vous", icon: Calendar },
  { key: "tenants", label: "Instituts", icon: Building2 },
  { key: "users", label: "Utilisatrices", icon: Users },
  { key: "subs", label: "Abonnements", icon: CreditCard },
  { key: "security", label: "Sécurité", icon: ShieldCheck },
];

export function AdminApp() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const setUser = useKene((s) => s.setUser);

  // Vue d'ensemble + Sécurité gardent LEURS hooks (la navigation entre
  // onglets ne re-télécharge jamais ce qui est déjà en mémoire — l'état
  // useApi vit dans ce composant, les onglets ne démontent que le DOM).
  const stats = useApi(() => apiGet<AdminStats>("/api/admin/stats"), []);
  const sec = useApi(() => apiGet<AdminSecurityData>("/api/admin/security"), []);

  if (stats.error && !stats.data) {
    const isAuthError =
      stats.error.toLowerCase().includes("session") ||
      stats.error.toLowerCase().includes("dédié") ||
      stats.error.toLowerCase().includes("réservé") ||
      stats.error.toLowerCase().includes("non autorisé") ||
      stats.error.toLowerCase().includes("401");

    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <ConsoleHeader />
        {isAuthError ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-5 shadow-sm max-w-md mx-auto">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <KeyRound className="size-7" />
            </div>
            <div className="space-y-2">
              <h3 className="font-heading text-xl font-bold">Session administrateur expirée</h3>
              <p className="text-sm text-muted-foreground">
                {stats.error || "Ta session administrateur Kènè a expiré ou nécessite une nouvelle authentification."}
              </p>
            </div>
            <div className="flex flex-col gap-2.5 pt-2">
              <Button
                variant="default"
                size="lg"
                onClick={() => performLogout({ redirectUrl: "/console" })}
                className="w-full gap-2 font-medium"
              >
                <KeyRound className="size-4" />
                Se reconnecter à la Console
              </Button>
              <Button variant="outline" size="lg" asChild className="w-full">
                <a href="/">
                  <ArrowLeft className="size-4 mr-2" />
                  Retourner à l'application Kènè
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <ErrorState message={`Console indisponible : ${stats.error}`} onRetry={stats.refetch} />
        )}
      </div>
    );
  }

  return (
    <AdminGateProvider>
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 space-y-5 min-h-screen overscroll-none">
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
      {tab === "orders" && <AdminOrders />}
      {tab === "appointments" && <AdminAppointments />}
      {tab === "tenants" && <AdminTenants />}
      {tab === "users" && <AdminUsers />}
      {tab === "subs" && <AdminSubscriptions />}
      {tab === "security" && (
        <div className="space-y-5">
          <AdminSecurity sec={sec} />
          {/* t. 130 — passkeys: appareils autorisés à ouvrir la console */}
          <AdminPasskeyCard />
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Console plateforme Kènè · Pilotage réseau, modération &amp; abonnements · Session 8 h · Chaque geste est audité
      </p>
    </div>
    </AdminGateProvider>
  );
}

function ConsoleHeader() {
  const setUser = useKene((s) => s.setUser);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await performLogout({ redirectUrl: "/console" });
  };

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
            <p className="text-xs sm:text-sm font-semibold text-gold-text dark:text-[#E3B04B]">Beauté mélanoderme · Pilotage plateforme</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SpaceSwitcher variant="compact" />
          <BadgeConsole />
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <a href="/" title="Ouvrir l'application Kènè">
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">Ouvrir l&apos;app</span>
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Se déconnecter de la Console"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function BadgeConsole() {
  return (
    <span className="hidden sm:inline-flex items-center rounded-full border border-finance/30 bg-finance/15 px-2.5 py-0.5 text-xs font-medium text-finance">
      Espace administrateur
    </span>
  );
}
