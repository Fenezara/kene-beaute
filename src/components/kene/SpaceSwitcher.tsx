"use client";
// Kènè — Sélecteur universel d'espaces (App Cliente, App Pro, Console Admin)
// Permet de basculer instantanément entre toutes les interfaces de la plateforme.

import { useState } from "react";
import { Smartphone, BriefcaseBusiness, ShieldCheck, ChevronDown, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useKene, type Space, type SessionUser } from "@/store/kene";
import { apiGet } from "@/lib/kene/api";
import type { ApiUser } from "@/components/kene/client/types";
import { performLogout } from "@/lib/kene/logout";
import { DEFAULT_FALLBACK_TENANT_ID } from "@/lib/kene/fallback-catalog";
import { CauriIcon } from "@/components/kene/icons";
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

  // STRICTE RÈGLE DE SÉCURITÉ : Le basculement d'espace est STRICTEMENT réservé
  // aux Entreprises (pro) qui possèdent aussi un espace client personnel,
  // et aux Administrateurs (admin) qui ont accès à toute la plateforme.
  // Les clients standards et invités n'ont aucun commutateur d'espace.
  if (!user || (user.role !== "admin" && user.role !== "pro")) {
    return null;
  }

  const isPro = user.role === "pro";
  const isAdmin = user.role === "admin";

  const availableSpaces = isAdmin
    ? [
        { id: "client" as Space, label: "Cliente", shortLabel: "Cliente", badge: "Grand Public", desc: "Diagnostic dermo-biométrique, boutique, RDV, chat", icon: Smartphone },
        { id: "pro" as Space, label: "Pro", shortLabel: "Pro", badge: "Institut & Caisse", desc: "Caisse POS, TVA, agenda, stock, CRM", icon: BriefcaseBusiness },
        { id: "admin" as Space, label: "Admin", shortLabel: "Admin", badge: "Console", desc: "Pilotage plateforme, abonnements", icon: ShieldCheck },
      ]
    : [
        {
          id: "client" as Space,
          label: "Mon Espace Beauté",
          shortLabel: "Beauté",
          badge: "Personnel",
          desc: "Mon diagnostic cutané personnel, Dermo Kènè & rituels",
          icon: CauriIcon,
        },
        {
          id: "pro" as Space,
          label: "Espace Entreprise",
          shortLabel: "Entreprise",
          badge: "Mon Institut",
          desc: "Cabine, caisse POS, fiches clientes, soins & planning",
          icon: BriefcaseBusiness,
        },
      ];

  const current = availableSpaces.find((s) => s.id === space) || availableSpaces[0];

  async function handleSwitch(target: Space) {
    if (target === space || switching) return;
    setSwitching(target);

    try {
      if (target === "pro" && !useKene.getState().proTenantId && user?.tenantId) {
        useKene.getState().setProTenantId(user.tenantId);
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
          ? "Bienvenue dans l'Espace Entreprise (Kènè Pro) 💼"
          : target === "admin"
          ? "Basculé vers la Console Administrateur"
          : "Bienvenue dans ton Espace Beauté personnel 🌸"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bascule impossible");
    } finally {
      setSwitching(null);
    }
  }

  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={switching !== null}
            aria-label={`Espace actif : ${current.label}. Cliquer pour changer d'interface.`}
            title={`Espace actif : ${current.label}`}
            className={cn(
              "h-8 rounded-full gap-1 sm:gap-1.5 px-2 sm:px-3 text-xs font-semibold bg-background/90 backdrop-blur border-primary/40 shadow-xs hover:border-primary transition-all shrink-0 whitespace-nowrap",
              className
            )}
          >
            {switching ? (
              <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
            ) : (
              <current.icon className="size-3.5 text-primary shrink-0" />
            )}
            <span className="hidden md:inline text-[11px] text-muted-foreground font-normal">Espace :</span>
            <span className="font-bold text-foreground hidden sm:inline">{current.shortLabel}</span>
            <ChevronDown className="size-3 opacity-60 ml-0.5 text-primary shrink-0" />
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
