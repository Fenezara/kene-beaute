"use client";

import { Smartphone, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { useKene, type Space } from "@/store/kene";
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

const SPACES: { id: Space; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "client", label: "App Cliente", desc: "Diagnostic IA, boutique, RDV", icon: Smartphone },
  { id: "pro", label: "App Pro", desc: "Agenda · Caisse · CRM · Paie", icon: BriefcaseBusiness },
  { id: "admin", label: "Console Admin", desc: "Pilotage plateforme", icon: ShieldCheck },
];

export function SpaceSwitcher() {
  const space = useKene((s) => s.space);
  const setSpace = useKene((s) => s.setSpace);
  const current = SPACES.find((s) => s.id === space)!;

  return (
    <>
      {/* Desktop — pills */}
      <nav aria-label="Espaces Kènè" className="hidden md:flex items-center gap-1 rounded-full border border-border bg-card/70 p-1">
        {SPACES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSpace(s.id)}
            aria-current={space === s.id ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5",
              space === s.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <s.icon className="size-3.5" />
            {s.label.replace("App ", "").replace("Console ", "")}
          </button>
        ))}
      </nav>

      {/* Mobile — menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="md:hidden rounded-full gap-1.5">
            <current.icon className="size-3.5" />
            <span className="text-xs">{current.label.replace("App ", "").replace("Console ", "")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Espaces Kènè</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SPACES.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => setSpace(s.id)} className={cn(space === s.id && "bg-accent")}>
              <s.icon className="size-4 mr-2" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="text-xs text-muted-foreground">{s.desc}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
