"use client";
// Kènè Pro — briques UI partagées (KPI, badges statut, états vides/erreur/chargement) — ÉCLAT 2026.
// Mêmes signatures d'export (zéro breaking change pour les 11 sections): les KPI
// passent à la carte verre k-card + eyebrow + valeur mono signature, les badges
// aux pastilles ring-inset, les états vides au grain (primitives: ui2026.tsx).
import { useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

/** Mini Sparkline SVG ultra-légère pour cartes métriques */
export function MiniSparkline({ data, tone = "gold" }: { data: number[]; tone?: "gold" | "terre" }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 24;
  const padding = 2;
  const h = height - padding * 2;
  const step = width / (data.length - 1);

  const points = data.map((val, i) => {
    const x = i * step;
    const y = height - padding - ((val - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const areaD = `M ${points[0]} L ${points.join(" L ")} L ${width},${height} L 0,${height} Z`;
  const strokeColor = tone === "gold" ? "var(--color-gold, #C8951E)" : "var(--color-primary, #9E6B47)";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-${tone})`} />
      <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** KPI — carte verre ÉCLAT 2026: label en eyebrow, valeur mono signature,
 * tendance dynamique, sparkline en arrière-plan et micro-reflet lumière. */
export function KpiCard({
  icon,
  label,
  value,
  hint,
  monetary = true,
  sparkline,
  trend,
  className,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  monetary?: boolean;
  sparkline?: number[];
  trend?: { value: number; label?: string; direction?: "up" | "down" | "flat" };
  className?: string;
}) {
  return (
    <div className={cn("k-card-awwwards k-card-hover relative p-4 sm:p-5 flex flex-col justify-between overflow-hidden group transition-all duration-300", className)}>
      <div className="flex items-center justify-between gap-2 z-10">
        <Eyebrow className="min-w-0 leading-snug truncate text-foreground/80 font-extrabold tracking-[0.12em]">{label}</Eyebrow>
        <IconBadge icon={icon} size="sm" tone={monetary ? "gold" : "terre"} />
      </div>

      <div className="mt-3 z-10">
        <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
          <p className="font-heading text-2xl sm:text-[26px] font-bold tabular-nums tracking-tight text-foreground truncate" title={value}>{value}</p>
          {trend && (
            <span className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums shrink-0",
              trend.direction === "up" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25" :
              trend.direction === "down" ? "bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-500/25" :
              "bg-muted text-muted-foreground border border-border"
            )}>
              {trend.direction === "up" && <TrendingUp className="size-2.5" />}
              {trend.direction === "down" && <TrendingDown className="size-2.5" />}
              {trend.direction === "flat" && <Minus className="size-2.5" />}
              {trend.direction === "up" ? `+${trend.value}%` : trend.direction === "down" ? `-${trend.value}%` : `${trend.value}%`}
            </span>
          )}
        </div>
        {hint && <p className="mt-1 text-xs font-medium text-muted-foreground truncate" title={hint}>{hint}</p>}
      </div>

      {sparkline && sparkline.length >= 2 && (
        <div className="mt-2.5 w-full h-7 opacity-80 group-hover:opacity-100 transition-opacity">
          <MiniSparkline data={sparkline} tone={monetary ? "gold" : "terre"} />
        </div>
      )}
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
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-current/15", s.cls)}>{s.label}</span>;
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
  return <span className={cn("rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ring-1 ring-inset ring-current/15", map[code] ?? map.OD)}>{code}</span>;
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
    <span className={cn("rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ring-1 ring-inset ring-current/15", colors[classe] ?? "bg-muted text-muted-foreground")}>
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

/** Titre de section (font-heading) + actions à droite — Signature Éditoriale Afro-Luxe avec défilement horizontal fluide sur mobile */
export function SectionHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="k-card-awwwards px-3.5 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 overflow-hidden">
      <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
        <div className="mt-1 h-8 sm:h-9 w-1.5 shrink-0 rounded-full k-rail-line" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="font-heading text-lg sm:text-2xl lg:text-[26px] font-bold tracking-tight text-foreground leading-tight">{title}</h1>
          {sub && <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground leading-snug">{sub}</p>}
        </div>
      </div>
      {actions && (
        <div className="w-full sm:w-auto overflow-x-auto no-scrollbar touch-pan-x -mx-1 px-1 py-0.5">
          <div className="flex items-center gap-2 shrink-0 min-w-max">
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}

/** Avatar cliente ou collaboratrice — affiche la photo de profil si disponible, sinon les initiales */
export function InitialAvatar({
  name,
  userId,
  className,
}: {
  name: string;
  userId?: string | null;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const hasPhoto = Boolean(userId && !userId.startsWith("guest") && !userId.startsWith("auto") && !imgError);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[11px] font-semibold text-[#FFF9EC] ring-1 ring-inset ring-gold/30 overflow-hidden",
        className
      )}
    >
      {hasPhoto ? (
        <img
          src={`/api/media/user/${userId}`}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span>{initials || "?"}</span>
      )}
    </span>
  );
}
