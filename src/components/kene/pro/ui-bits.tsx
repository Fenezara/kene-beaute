"use client";
// Kènè Pro — briques UI partagées (KPI, badges statut, états vides/erreur/chargement)
import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { xof, formatDate } from "@/lib/kene/format";

/** Label jour robuste : accepte une date ISO ou une chaîne déjà formatée ("16/08") */
export function dayLabel(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : formatDate(date, { day: "2-digit", month: "2-digit" });
}

/** Bande kente douce en haut d'une card clé */
export function KenteTop({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={cn("kente-band-soft h-1.5 w-full rounded-t-xl", className)} />;
}

/** Montant financier — TOUJOURS font-mono + xof() */
export function Money({ value, className, compact }: { value: number; className?: string; compact?: boolean }) {
  return <span className={cn("font-mono tabular-nums", className)}>{xof(value, { compact })}</span>;
}

export function KpiCard({
  icon,
  label,
  value,
  hint,
  monetary = true,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  monetary?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden pt-0 gap-2">
      <KenteTop />
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <span className="text-primary shrink-0">{icon}</span>
        </div>
        <p className="mt-2 text-xl font-semibold tracking-tight font-mono tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ─────────────── Badges statut RDV ───────────────
export const APPT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-sunset/15 text-sunset border-sunset/30" },
  confirmed: { label: "Confirmé", cls: "bg-success/15 text-success border-success/30" },
  completed: { label: "Terminé", cls: "bg-gold/15 text-gold border-gold/30" },
  cancelled: { label: "Annulé", cls: "bg-muted text-muted-foreground border-border" },
  no_show: { label: "Absente", cls: "bg-bissap/15 text-destructive border-bissap/30" },
};

export function ApptStatusBadge({ status }: { status: string }) {
  const s = APPT_STATUS[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", s.cls)}>{s.label}</Badge>;
}

/** Badge code journal compta */
export function JournalBadge({ code }: { code: string }) {
  const map: Record<string, string> = {
    CA: "bg-gold/15 text-gold border-gold/30",
    VE: "bg-gold/15 text-gold border-gold/30",
    BQ: "bg-finance/15 text-finance border-finance/30",
    PA: "bg-terre/15 text-terre border-terre/30",
    OD: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={cn("font-mono text-[10px] px-1.5", map[code] ?? map.OD)}>{code}</Badge>;
}

/** Badge classe SYSCOHADA */
export function ClasseBadge({ classe }: { classe: number }) {
  const colors: Record<number, string> = {
    1: "bg-terre/15 text-terre",
    2: "bg-gold/15 text-gold",
    3: "bg-sunset/15 text-sunset",
    4: "bg-success/15 text-success",
    5: "bg-finance/15 text-finance",
    6: "bg-bissap/15 text-bissap",
    7: "bg-success/15 text-success",
    8: "bg-muted text-muted-foreground",
    9: "bg-muted text-muted-foreground",
  };
  return <Badge className={cn("font-mono text-[10px] px-1.5", colors[classe] ?? "bg-muted text-muted-foreground")}>Classe {classe}</Badge>;
}

// ─────────────── États ───────────────
export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
      <Inbox className="size-8 opacity-50" aria-hidden="true" />
      <p className="text-sm font-medium">{label}</p>
      {sub && <p className="text-xs">{sub}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-bissap/30 bg-bissap/5 p-4">
      <div className="flex items-center gap-2 text-bissap">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="size-3.5" aria-hidden="true" /> Réessayer
        </Button>
      )}
    </div>
  );
}

/** Titre de section (font-heading) + actions à droite */
export function SectionHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Avatar initiale cliente */
export function InitialAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[11px] font-semibold text-[#FFF9EC]",
        className
      )}
    >
      {initials || "?"}
    </span>
  );
}
