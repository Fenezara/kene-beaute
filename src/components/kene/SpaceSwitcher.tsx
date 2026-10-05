"use client";
// Kènè — Sélecteur universel d'espaces (App Cliente, App Pro, Console Admin)
// Permet de basculer instantanément entre toutes les interfaces de la plateforme.

import { useState } from "react";
import { Smartphone, BriefcaseBusiness, ShieldCheck, ChevronDown, Loader2, LogOut, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useKene, type Space } from "@/store/kene";
import { performLogout } from "@/lib/kene/logout";
import { DEFAULT_FALLBACK_TENANT_ID } from "@/lib/kene/fallback-catalog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SpaceSwitcher({
  className,
  variant = "pills",
}: {
  className?: string;
  variant?: "pills" | "dropdown" | "compact";
}) {
  const space = useKene((s) => s.space);
  const user = useKene((s) => s.user);
  const setSpace = useKene((s) => s.setSpace);
  const [switching, setSwitching] = useState<Space | null>(null);

  // RÈGLE : Seuls les administrateurs et les professionnels/employés d'institut
  // ont accès au sélecteur d'interface (mode dual pour les employées).
  if (user?.role !== "admin" && user?.role !== "pro") {
    return null;
  }

  const isPro = user?.role === "pro";

  const availableSpaces = isPro
    ? [
        {
          id: "client" as Space,
          label: "Mon Espace Beauté",
          badge: "Personnel",
          desc: "Mon diagnostic cutané, Dr. Kènè IA & rituels",
          icon: Sparkles,
        },
        {
          id: "pro" as Space,
          label: "Espace Institut",
          badge: "Travail",
          desc: "Cabine, fiches clientes, soins & planning",
          icon: BriefcaseBusiness,
        },
      ]
    : [
        { id: "client" as Space, label: "Cliente", badge: "Grand Public", desc: "Diagnostic IA, boutique, RDV, chat", icon: Smartphone },
        { id: "pro" as Space, label: "Pro", badge: "Institut & Caisse", desc: "Caisse POS, TVA, agenda, stock, CRM", icon: BriefcaseBusiness },
        { id: "admin" as Space, label: "Admin", badge: "Console", desc: "Pilotage plateforme, abonnements", icon: ShieldCheck },
      ];

  const current = availableSpaces.find((s) => s.id === space) || availableSpaces[0];

  function handleSwitch(target: Space) {
    if (target === space || switching) return;
    setSwitching(target);

    // Si bascule vers Pro et pas d'institut mémorisé, sélectionner l'institut par défaut
    if (target === "pro" && !useKene.getState().proTenantId) {
      useKene.getState().setProTenantId(user?.tenantId || DEFAULT_FALLBACK_TENANT_ID);
    }

    setSpace(target);

    // Synchronisation de l'URL du navigateur sans rechargement complet
    if (typeof window !== "undefined") {
      const targetPath = target === "admin" ? "/console" : target === "pro" ? "/pro" : "/";
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, "", targetPath);
        window.dispatchEvent(new Event("popstate"));
      }
    }

    toast.success(
      target === "pro"
        ? "Basculé vers l'Espace Institut"
        : target === "admin"
        ? "Basculé vers la Console Administrateur"
        : isPro
        ? "Bienvenue dans ton Espace Beauté personnel 🌸"
        : "Basculé vers l'Espace Cliente"
    );
    setSwitching(null);
  }

  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={switching !== null}
            className={cn("h-8 rounded-full gap-1.5 px-3 text-xs font-semibold bg-background/90 backdrop-blur border-primary/40 shadow-xs hover:border-primary transition-all", className)}
          >
            {switching ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <current.icon className="size-3.5 text-primary" />
            )}
            <span className="text-[11px] text-muted-foreground font-normal">Espace :</span>
            <span className="font-bold text-foreground">{current.label}</span>
            <ChevronDown className="size-3 opacity-60 ml-0.5 text-primary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 rounded-2xl shadow-xl p-1.5">
          <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
            {isPro ? "Changer d'univers" : "Basculer d'interface"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableSpaces.map((s) => {
            const Icon = s.icon;
            const active = space === s.id;
            return (
              <DropdownMenuItem
                key={s.id}
                onClick={() => handleSwitch(s.id)}
                className={cn(
                  "flex items-center gap-2.5 p-2 rounded-xl text-xs cursor-pointer font-medium transition-colors",
                  active ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted"
                )}
              >
                <div className={cn("grid size-7 place-items-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon className="size-4" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span>{s.label}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-mono">{s.badge}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{s.desc}</span>
                </div>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => performLogout({ redirectUrl: "/" })}
            className="flex items-center gap-2.5 p-2 rounded-xl text-xs cursor-pointer font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <div className="grid size-7 place-items-center rounded-lg bg-destructive/10 text-destructive">
              <LogOut className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold">Se déconnecter</span>
              <span className="text-[10px] text-muted-foreground leading-tight">Fermer la session sur cet appareil</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <nav
      aria-label="Sélecteur d'interfaces Kènè"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/85 p-1 shadow-sm backdrop-blur-md",
        className
      )}
    >
      {availableSpaces.map((s) => {
        const Icon = s.icon;
        const active = space === s.id;
        const isThisSwitching = switching === s.id;

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => handleSwitch(s.id)}
            disabled={switching !== null}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all select-none active:scale-95 disabled:opacity-50",
              active
                ? "k-btn-gold text-primary-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {isThisSwitching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Icon className="size-3.5" />
            )}
            <span>{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
