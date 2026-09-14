"use client";
// Kènè Pro — briques UI partagées (KPI, badges statut, états vides/erreur/chargement) — ÉCLAT 2026.
// Mêmes signatures d'export (zéro breaking change pour les 11 sections): les KPI
// passent à la carte verre k-card + eyebrow + valeur mono signature, les badges
// aux pastilles ring-inset, les états vides au grain (primitives: ui2026.tsx).
import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { xof, formatDate } from "@/lib/kene/format";
import { Eyebrow, IconBadge, Shimmer } from "@/components/kene/ui2026";

/** Label jour robuste: accepte une date ISO ou une chaîne déjà formatée ("16/08") */
export function dayLabel(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? date : formatDate(date, { day: "2-digit", month: "2-digit" });
}

/** Bande kente douce en haut d'une card clé */
export function KenteTop({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={cn("kente-band-soft h-1.5 w-full rounded-t-xl", className)} />;
}

/** Montant financier — TOUJOURS font-mono + xof */
export function Money({ value, className, compact }: { value: number; className?: string; compact?: boolean }) {
  return <span className={cn("font-mono tabular-nums", className)}>{xof(value, { compact })}</span>;
}

/** KPI — carte verre ÉCLAT 2026: label en eyebrow, valeur mono signature
 * (or lisible AA), badge icône teinté selon la donnée (monétaire → or,
 * opérationnel → terre). Hover élévation desktop. */
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
    <div className="k-card k-card-hover relative rounded-[20px] p-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow className="min-w-0 leading-snug">{label}</Eyebrow>
        <IconBadge icon={icon} size="sm" tone={monetary ? "gold" : "terre"} />
      </div>
      <p className="mt-3 font-mono text-2xl font-bold tabular-nums tracking-tight text-gold-text">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─────────────── Badges statut RDV ───────────────
export const APPT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-sunset/15 text-sunset-text" },
  confirmed: { label: "Confirmé", cls: "bg-success/15 text-success" },
  completed: { label: "Terminé", cls: "bg-gold/15 text-gold-text" },
  cancelled: { label: "Annulé", cls: "bg-muted text-muted-foreground" },
  no_show: { label: "Absente", cls: "bg-bissap/15 text-destructive" },
};

export function ApptStatusBadge({ status }: { status: string }) {
  const s = APPT_STATUS[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ring-current/15", s.cls)}>{s.label}</span>;
}

/** Badge code journal compta */
export function JournalBadge({ code }: { code: string }) {
  const map: Record<string, string> = {
    CA: "bg-gold/15 text-gold-text",
    VE: "bg-gold/15 text-gold-text",
    BQ: "bg-finance/15 text-finance",
    PA: "bg-terre/15 text-terre",
    OD: "bg-muted text-muted-foreground",
  };
  return <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ring-1 ring-inset ring-current/15", map[code] ?? map.OD)}>{code}</span>;
}

/** Badge classe SYSCOHADA */
export function ClasseBadge({ classe }: { classe: number }) {
  const colors: Record<number, string> = {
    1: "bg-terre/15 text-terre",
    2: "bg-gold/15 text-gold-text",
    3: "bg-sunset/15 text-sunset-text",
    4: "bg-success/15 text-success",
    5: "bg-finance/15 text-finance",
    6: "bg-bissap/15 text-bissap",
    7: "bg-success/15 text-success",
    8: "bg-muted text-muted-foreground",
    9: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ring-1 ring-inset ring-current/15", colors[classe] ?? "bg-muted text-muted-foreground")}>
      Classe {classe}
    </span>
  );
}

// ─────────────── États ───────────────
export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Chargement">
      <Shimmer className="h-8 w-56" />
      {Array.from({ length: rows }).map((_, i) => (
        <Shimmer key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="k-card grain-kene relative flex flex-col items-center justify-center gap-3 rounded-[20px] px-6 py-10 text-center">
      <IconBadge icon={<Inbox className="size-6" />} size="lg" tone="gold" />
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="k-card overflow-hidden rounded-[18px]">
      <div className="flex flex-col items-start gap-3 bg-bissap/5 p-4">
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
        "grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[11px] font-semibold text-[#FFF9EC] ring-1 ring-inset ring-gold/30",
        className
      )}
    >
      {initials || "?"}
    </span>
  );
}
