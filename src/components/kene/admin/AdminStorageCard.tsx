"use client";

import { AlertTriangle, Cpu, Database, FolderArchive, HardDrive, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/kene/format";
import { cn } from "@/lib/utils";
import type { AdminSystemHealth } from "@/components/kene/pro/types";

interface AdminStorageCardProps {
  disk?: AdminSystemHealth["disk"];
  hostRam?: AdminSystemHealth["hostRam"];
  folders?: AdminSystemHealth["folders"];
  loadAvg?: number[];
  memoryUsageMb?: number;
  memoryRssMb?: number;
  compact?: boolean;
  className?: string;
}

function barColorClass(pct: number, warnAt: number, critAt: number): string {
  if (pct >= critAt) return "bg-rose-500";
  if (pct >= warnAt) return "bg-amber-500";
  return "bg-emerald-500";
}

function ramLabel(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb} Mo`;
}

export function AdminStorageCard({
  disk,
  hostRam,
  folders,
  loadAvg,
  memoryUsageMb,
  memoryRssMb,
  compact = false,
  className,
}: AdminStorageCardProps) {
  if (!disk && !hostRam && !folders) return null;

  const diskPct = disk?.usedPct ?? 0;
  const diskIsCrit = disk?.status === "critical" || diskPct >= 85;
  const diskIsWarn = !diskIsCrit && (disk?.status === "warn" || diskPct >= 75);
  const ramPct = hostRam?.usedPct ?? 0;
  const cpuLoad1 = Array.isArray(loadAvg) && typeof loadAvg[0] === "number" ? loadAvg[0].toFixed(2) : null;

  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5 space-y-3 transition-colors",
        diskIsCrit
          ? "border-rose-500/45 bg-rose-500/5"
          : diskIsWarn
            ? "border-amber-500/45 bg-amber-500/5"
            : "border-border/70 bg-muted/20",
        className
      )}
    >
      <div className={cn("grid gap-3", hostRam ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
        {/* Jauge Disque VPS */}
        {disk && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <HardDrive
                  className={cn(
                    "size-3.5",
                    diskIsCrit ? "text-rose-500" : diskIsWarn ? "text-amber-500" : "text-emerald-500"
                  )}
                />
                <span>Disque Serveur ({disk.mountLabel})</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-foreground">{disk.usedPct} %</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0 font-semibold",
                    diskIsCrit
                      ? "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : diskIsWarn
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  )}
                >
                  {diskIsCrit ? "Critique ≥ 85%" : diskIsWarn ? "Attention ≥ 75%" : "Sain"}
                </Badge>
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80 border border-border/50">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColorClass(disk.usedPct, 75, 85))}
                style={{ width: `${Math.max(2, Math.min(100, disk.usedPct))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                <strong className="text-foreground">{formatBytes(disk.freeBytes)}</strong> libres
              </span>
              <span>
                {formatBytes(disk.usedBytes)} utilisés / {formatBytes(disk.totalBytes)}
              </span>
            </div>
          </div>
        )}

        {/* Jauge RAM Serveur + Charge CPU */}
        {hostRam && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Cpu className="size-3.5 text-primary" />
                <span>RAM &amp; Charge CPU</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-foreground">{ramPct} %</span>
                {cpuLoad1 !== null && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    Load {cpuLoad1}
                  </Badge>
                )}
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80 border border-border/50">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColorClass(ramPct, 85, 95))}
                style={{ width: `${Math.max(2, Math.min(100, ramPct))}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
              <span>
                <strong className="text-foreground">{ramLabel(hostRam.freeMb)}</strong> dispo sur {ramLabel(hostRam.totalMb)}
              </span>
              {typeof memoryUsageMb === "number" && (
                <span>
                  Node : {memoryUsageMb} Mo{typeof memoryRssMb === "number" ? ` (RSS ${memoryRssMb} Mo)` : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Répartition des données Kènè */}
      {folders && (
        <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-2.5 py-1.5 text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground truncate">
              <Database className="size-3 text-emerald-500 shrink-0" />
              <span className="truncate">SQLite (+ WAL)</span>
            </span>
            <span className="font-mono font-bold text-foreground shrink-0">{formatBytes(folders.dbBytes)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-2.5 py-1.5 text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground truncate">
              <FolderArchive className="size-3 text-amber-500 shrink-0" />
              <span className="truncate">Snapshots ({folders.backupsCount})</span>
            </span>
            <span className="font-mono font-bold text-foreground shrink-0">{formatBytes(folders.backupsBytes)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-2.5 py-1.5 text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground truncate">
              <ImageIcon className="size-3 text-primary shrink-0" />
              <span className="truncate">Uploads média</span>
            </span>
            <span className="font-mono font-bold text-foreground shrink-0">{formatBytes(folders.uploadsBytes)}</span>
          </div>
        </div>
      )}

      {/* Alerte proactive seuil disque */}
      {(diskIsCrit || diskIsWarn) && disk && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-snug",
            diskIsCrit
              ? "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          )}
        >
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            {diskIsCrit
              ? `Espace disque critique (${disk.usedPct} %, il reste ${formatBytes(disk.freeBytes)}). Une alerte automatique est envoyée sur vos canaux configurés (max 1×/6h). Purgez le cache Docker sur le VPS : docker builder prune -f.`
              : `Disque à ${disk.usedPct} % (${formatBytes(disk.freeBytes)} restants). Pensez à nettoyer les anciennes images/cache Docker ou les vieux snapshots avant d'atteindre 85 %.`}
          </span>
        </div>
      )}
    </div>
  );
}
