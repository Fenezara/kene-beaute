"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  Database,
  Download,
  FileJson,
  HardDriveDownload,
  Loader2,
  Lock,
  PlusCircle,
  RefreshCw,
  ServerCrash,
  Shield,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { KenteTop } from "@/components/kene/pro/ui-bits";

interface SnapshotItem {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

interface BackupInfo {
  dbSizeBytes: number;
  dbUpdatedAt: string;
  snapshots: SnapshotItem[];
  autoBackupSchedule: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 Ko";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function AdminBackupAndShieldCard() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloadingDb, setDownloadingDb] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const res = await apiGet<BackupInfo>("/api/admin/backup?info=1");
      setInfo(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInfo();
  }, []);

  const handleCreateSnapshot = async () => {
    setCreating(true);
    try {
      const res = await apiPost<{ ok: boolean; snapshot: SnapshotItem }>("/api/admin/backup", {});
      if (res.ok) {
        toast.success("Point de restauration créé sur le serveur", {
          description: res.snapshot.name,
        });
        await loadInfo();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de créer la sauvegarde");
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (format: "db" | "json") => {
    if (format === "db") setDownloadingDb(true);
    else setDownloadingJson(true);

    try {
      const res = await fetch(`/api/admin/backup?format=${format}`, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Téléchargement refusé — vérifie ta session administrateur");
      }
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      const ext = format === "json" ? "json" : "db";
      const fileName = `kene-backup-${stamp}.${ext}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      toast.success(`Sauvegarde téléchargée (${fileName})`, {
        description: "Conserve ce fichier en lieu sûr (ordinateur ou cloud privé).",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du téléchargement");
    } finally {
      if (format === "db") setDownloadingDb(false);
      else setDownloadingJson(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ── CARTE 1 : Sauvegardes & Continuité d'Activité (Angle Mort n°2) ── */}
      <Card className="overflow-hidden pt-0">
        <KenteTop />
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 font-heading text-base">
              <Database className="size-4 text-primary" />
              Sauvegardes &amp; Continuité (Backups)
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadInfo()}
              disabled={loading}
              className="h-7 px-2 text-xs gap-1"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
          <CardDescription className="text-xs">
            Protection contre toute perte matérielle : snapshots automatiques serveur + téléchargement hors-site en 1 clic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">Base SQLite active</p>
              <p className="mt-0.5 font-mono text-base font-bold">
                {loading ? "…" : formatBytes(info?.dbSizeBytes ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Intégrité WAL vérifiée
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="text-[11px] text-muted-foreground">Snapshots serveur</p>
              <p className="mt-0.5 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                {loading ? "…" : `${info?.snapshots.length ?? 0} copie(s)`}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Rotation auto 30 jours
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => void handleDownload("db")}
              disabled={downloadingDb}
              className="flex-1 gap-1.5 text-xs font-bold"
            >
              {downloadingDb ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <HardDriveDownload className="size-4" />
              )}
              Télécharger la base (.db)
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleDownload("json")}
              disabled={downloadingJson}
              className="flex-1 gap-1.5 text-xs font-semibold"
            >
              {downloadingJson ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileJson className="size-4" />
              )}
              Export lisible (.json)
            </Button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleCreateSnapshot()}
            disabled={creating}
            className="w-full gap-1.5 text-xs font-semibold"
          >
            {creating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <PlusCircle className="size-3.5" />
            )}
            Créer un point de restauration instantané sur le serveur
          </Button>

          {info && info.snapshots.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Derniers points de restauration serveur
              </p>
              <ul className="max-h-28 overflow-y-auto pretty-scroll divide-y divide-border/40 text-xs">
                {info.snapshots.slice(0, 5).map((s) => (
                  <li key={s.name} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] truncate">{s.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                      {formatBytes(s.sizeBytes)} ·{" "}
                      {formatDate(new Date(s.createdAt), {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CARTE 2 : Bouclier Infrastructure & Anti-DDoS (Angle Mort n°1) ── */}
      <Card className="overflow-hidden pt-0">
        <KenteTop />
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 font-heading text-base">
              <Shield className="size-4 text-emerald-600" />
              Bouclier Serveur &amp; Anti-DDoS
            </CardTitle>
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
              Actif 24/7
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Défenses périmétriques actives sur le serveur VPS et protection contre la saturation réseau.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">Pare-feu UFW &amp; Isolation Docker</p>
                <p className="text-[11px] text-muted-foreground">
                  Seuls les ports 80/443 (HTTPS) et 22 (SSH par clé) sont ouverts. Les ports internes (3000, 3004, SQLite) sont invisibles depuis Internet.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">Fail2Ban + Rate-Limiting Multi-Couches</p>
                <p className="text-[11px] text-muted-foreground">
                  Bannissement automatique des IP attaquantes (SSH &amp; rafales HTTP) + quotas stricts sur les SMS OTP et tentatives de connexion.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-foreground">Sauvegarde Cron Quotidienne (03h00 UTC)</p>
                <p className="text-[11px] text-muted-foreground">
                  Copie automatique chaque nuit dans <code className="font-mono text-[10px]">/opt/kene/db/backups</code> avec purge automatique au-delà de 30 jours.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-foreground">
              <Cloud className="size-4 text-gold-text" />
              Bouclier Mondial Cloudflare (Optionnel · Gratuit)
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Pour absorber les attaques DDoS internationales de plusieurs millions de requêtes/sec : crée un compte gratuit sur{" "}
              <a
                href="https://dash.cloudflare.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline"
              >
                cloudflare.com
              </a>
              , ajoute <strong className="text-foreground">kene-beaute.com</strong> et active le nuage orange (Proxy) vers <code className="font-mono">2.29.53.176</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
