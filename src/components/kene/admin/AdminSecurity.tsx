"use client";
// Kènè — Console Admin · Posture sécurité & Cockpit Santé Système
// Enrichi : Pouls serveur direct (Uptime, DB Latence, RAM, Charge),
// Détection d'attaques (honeypot, velocity, impossible travel, bots),
// Journal complet responsive & filtrable avec détails complets.
import { useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bot,
  Bell,
  CloudUpload,
  Send,
  CheckCircle2,
  Cpu,
  Database,
  Filter,
  Flame,
  Globe,
  HardDrive,
  Info,
  Layers,
  Lock,
  Radio,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/kene/format";
import { cn } from "@/lib/utils";
import type { UseApiResult } from "@/components/kene/pro/useApi";
import { KenteTop } from "@/components/kene/pro/ui-bits";
import type { AdminSecurity, AdminSystemHealth } from "@/components/kene/pro/types";
import { apiPost } from "@/lib/kene/api";
import { toast } from "sonner";

/** Canaux d'alerte (Telegram/WhatsApp/SMS) + copie des sauvegardes hors serveur. */
function AlertsAndOffsitePanel({ health }: { health?: AdminSystemHealth }) {
  const [testing, setTesting] = useState(false);
  const ch = health?.alertChannels;
  const off = health?.offsiteBackup;
  const channels: { label: string; on: boolean; hint: string }[] = [
    { label: "SMS critique", on: Boolean(ch?.sms), hint: "Attaques graves, nouvelle IP admin" },
    { label: "Telegram", on: Boolean(ch?.telegram), hint: "Toutes les alertes + copie des sauvegardes" },
    { label: "WhatsApp", on: Boolean(ch?.whatsapp), hint: "Toutes les alertes" },
  ];
  async function test() {
    setTesting(true);
    try {
      const r = await apiPost<{ ok: boolean; sent: string[] }>("/api/admin/alerts/test", {});
      if (r.ok) toast.success(`Alerte de test envoyée : ${r.sent.join(", ")}`);
      else toast.error("Aucun canal n'a pu envoyer l'alerte — vérifiez la configuration.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du test");
    } finally {
      setTesting(false);
    }
  }
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-border/70 bg-card/60 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold flex items-center gap-1.5 text-muted-foreground">
            <Bell className="size-3.5 text-primary" /> Alertes temps réel
          </p>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => void test()} disabled={testing}>
            <Send className={cn("size-3", testing && "animate-pulse")} /> Tester
          </Button>
        </div>
        <ul className="space-y-1">
          {channels.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-xs">
              <span className={cn("size-2 rounded-full", c.on ? "bg-emerald-500" : "bg-muted-foreground/30")} />
              <span className="font-semibold text-foreground">{c.label}</span>
              <span className="text-[10px] text-muted-foreground truncate">{c.on ? c.hint : "à activer"}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-border/70 bg-card/60 p-3 space-y-1.5">
        <p className="text-[11px] font-semibold flex items-center gap-1.5 text-muted-foreground">
          <CloudUpload className="size-3.5 text-gold-text" /> Copie des sauvegardes hors serveur
        </p>
        <p className={cn("font-heading text-base font-black", off?.ok ? "text-emerald-600" : "text-amber-600")}>
          {off?.ok ? "✅ À jour" : "⚠️ Non active"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {off?.at
            ? `Dernière copie : ${formatDate(off.at)}${off.target ? ` → ${off.target}` : ""}`
            : "Les sauvegardes restent sur le VPS. Activez Telegram pour recevoir la copie chaque nuit."}
          {off?.detail && !off.ok ? ` · ${off.detail}` : ""}
        </p>
      </div>
    </div>
  );
}

const SEC_KINDS: Record<string, { label: string; cls: string; isThreat?: boolean }> = {
  login_success: { label: "Connexion réussie", cls: "bg-success/15 text-success" },
  login_failed: { label: "Code erroné", cls: "bg-bissap/15 text-bissap" },
  login_locked: { label: "Compte verrouillé", cls: "bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold", isThreat: true },
  otp_request: { label: "Code demandé", cls: "bg-primary/15 text-primary" },
  logout: { label: "Déconnexion", cls: "bg-muted text-muted-foreground" },
  payment_confirm: { label: "Paiement confirmé", cls: "bg-emerald-500/15 text-emerald-600" },
  admin_access: { label: "Accès console", cls: "bg-muted text-muted-foreground" },
  pro_register: { label: "Inscription pro", cls: "bg-muted text-muted-foreground" },
  push_subscribe: { label: "Abonnement push", cls: "bg-muted text-muted-foreground" },
  upload_reject: { label: "Fichier suspect rejeté", cls: "bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold", isThreat: true },
  // ── Boucliers Anti-Intrusion ──
  honeypot_probe: { label: "Scan sonde bloqué", cls: "bg-rose-600/25 text-rose-600 dark:text-rose-300 font-extrabold ring-1 ring-rose-500", isThreat: true },
  impossible_travel: { label: "Saut géographique impossible", cls: "bg-red-600/25 text-red-600 dark:text-red-300 font-extrabold ring-1 ring-red-500", isThreat: true },
  velocity_anomaly: { label: "Anomalie vitesse IP", cls: "bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold", isThreat: true },
  bot_blocked: { label: "Robot scanner bloqué", cls: "bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold", isThreat: true },
  rate_limit_exceeded: { label: "Rafale abusive (429)", cls: "bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold", isThreat: true },
  csrf_blocked: { label: "Origine suspecte bloquée", cls: "bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold", isThreat: true },
  // ── Gestes de gestion console ──
  tenant_suspended: { label: "Institut suspendu", cls: "bg-gold/15 text-gold" },
  tenant_reactivated: { label: "Institut réactivé", cls: "bg-success/15 text-success" },
  tenant_commission: { label: "Commission fixée", cls: "bg-gold/15 text-gold" },
  tenant_plan: { label: "Plan changé", cls: "bg-muted text-muted-foreground" },
  user_locked: { label: "Compte verrouillé (console)", cls: "bg-gold/15 text-gold" },
  user_unlocked: { label: "Compte déverrouillé", cls: "bg-success/15 text-success" },
  // ── Step-up & passkeys ──
  admin_elevated: { label: "Identité confirmée (step-up)", cls: "bg-primary/15 text-primary" },
  admin_elevate_failed: { label: "Step-up refusé", cls: "bg-bissap/15 text-bissap", isThreat: true },
  passkey_registered: { label: "Passkey enregistré", cls: "bg-gold/15 text-gold" },
  passkey_register_failed: { label: "Passkey refusé", cls: "bg-bissap/15 text-bissap" },
  passkey_removed: { label: "Passkey retiré", cls: "bg-muted text-muted-foreground" },
  // ── Télémétrie incidents & erreurs en direct ──
  client_error: { label: "Incident applicatif", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold" },
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remMinutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}j ${remHours}h`;
}

function secTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : formatDate(d, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function AdminSecurity({ sec }: { sec: UseApiResult<AdminSecurity> }) {
  const d = sec.data;
  const loading = sec.loading && !d;
  const [filter, setFilter] = useState<"all" | "threats" | "errors" | "auth">("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const health = d?.health;
  const failed = d?.stats.failedLogins24h ?? 0;
  const locked = d?.stats.locked24h ?? 0;
  const errors = d?.stats.clientErrors24h ?? 0;
  const threats = d?.stats.threats24h ?? 0;
  const pinLocked = d?.stats.pinLockedCount ?? 0;

  // Filtrage du journal en 1 clic — les accès console admin sont regroupés (bruit).
  const [showAdminAccess, setShowAdminAccess] = useState(false);
  const adminAccessCount = (d?.events ?? []).filter((e) => e.kind === "admin_access").length;
  const ipGeo = d?.ipGeo ?? {};
  const filteredEvents = (d?.events ?? []).filter((e) => {
    if (!showAdminAccess && filter === "all" && e.kind === "admin_access") return false;
    if (filter === "threats") {
      const k = SEC_KINDS[e.kind];
      return k?.isThreat || e.kind.includes("threat") || e.kind.includes("probe") || e.kind.includes("attack");
    }
    if (filter === "errors") {
      return e.kind === "client_error";
    }
    if (filter === "auth") {
      return e.kind.startsWith("login_") || e.kind === "otp_request" || e.kind === "logout";
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* ── 1. COCKPIT SANTÉ SYSTÈME (Pouls Serveur & SQLite) ── */}
      <Card className="overflow-hidden border-border/80 shadow-xs">
        <KenteTop />
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading text-base">
              <Activity className="size-4 text-primary animate-pulse" aria-hidden="true" />
              <span>Santé Système &amp; Performance Serveur en Direct</span>
              {health && (
                <Badge
                  variant="outline"
                  className={cn(
                    "font-bold text-xs px-2 py-0.5",
                    health.status === "optimal"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      : health.status === "warning"
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                  )}
                >
                  {health.status === "optimal" ? "🟢 État Optimal (100%)" : health.status === "warning" ? "🟠 Sous Tension" : "🔴 Attention Requise"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Sonde de diagnostic interne : mémoire vive, latence de la base de données SQLite et flux fintech.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void sec.refetch()}
            disabled={sec.loading}
            className="h-8 gap-1.5 text-xs self-start sm:self-auto"
          >
            <RefreshCw className={cn("size-3.5", sec.loading && "animate-spin")} />
            <span>Tester maintenant</span>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Base de données */}
            <div className="rounded-2xl border border-border/70 bg-card/60 p-3 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5">
                  <Database className="size-3.5 text-gold-text" /> SQLite / Prisma
                </span>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">Actif</span>
              </div>
              <p className="font-heading text-lg font-black text-foreground">
                {health ? `${health.dbLatencyMs} ms` : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {health?.dbLatencyMs && health.dbLatencyMs < 10 ? "Réponse ultra-rapide" : "Latence normale"}
              </p>
            </div>

            {/* Mémoire RAM */}
            <div className="rounded-2xl border border-border/70 bg-card/60 p-3 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-primary" /> Mémoire Vive
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">Heap</span>
              </div>
              <p className="font-heading text-lg font-black text-foreground">
                {health ? `${health.memoryUsageMb} Mo` : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {health ? `Total RSS : ${health.memoryRssMb} Mo` : "Allocation Node.js"}
              </p>
            </div>

            {/* Disponibilité continue */}
            <div className="rounded-2xl border border-border/70 bg-card/60 p-3 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5">
                  <Radio className="size-3.5 text-emerald-500" /> Dernier redémarrage
                </span>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">En ligne</span>
              </div>
              <p className="font-heading text-lg font-black text-foreground">
                {health ? `il y a ${formatUptime(health.uptimeSec)}` : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {health?.startedAt ? `Déploiement / relance : ${secTime(health.startedAt)}` : "Process Node.js"}
              </p>
            </div>

            {/* Webhooks Fintech 24h */}
            <div className="rounded-2xl border border-border/70 bg-card/60 p-3 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5">
                  <Zap className="size-3.5 text-amber-500" /> Webhooks 24h
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">Idempotents</span>
              </div>
              <p className="font-heading text-lg font-black text-foreground">
                {health ? health.webhookEvents24h : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {health?.lastWebhookAt ? `Dernier reçu : ${secTime(health.lastWebhookAt)}` : "Aucun webhook reçu à ce jour"}
              </p>
            </div>
          </div>

          <AlertsAndOffsitePanel health={health} />
        </CardContent>
      </Card>

      {/* ── 2. BOUCLIER DE SÉCURITÉ & RADAR DES MENACES ── */}
      <Card className="overflow-hidden border-border/80 shadow-xs">
        <KenteTop />
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 font-heading text-base">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              <span>Bouclier Anti-Attaques &amp; Audit Sécurité</span>
              <Badge variant="outline" className="font-mono text-[10px]">Protection 2026</Badge>
            </div>
            {threats > 0 && (
              <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30 gap-1 font-bold animate-bounce">
                <AlertOctagon className="size-3" />
                {threats} menace{threats > 1 ? "s" : ""} bloquée{threats > 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            Surveillance continue contre les attaques par force brute, robots scanners, scans de failles et anomalies de vitesse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Compteurs dynamiques 24h */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] leading-tight text-muted-foreground">Activité 24 h</p>
              <p className="mt-1 font-mono text-xl font-bold text-foreground">
                {loading ? "…" : d?.stats.last24h ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] leading-tight text-muted-foreground">Attaques bloquées</p>
              <p className={cn("mt-1 font-mono text-xl font-bold", threats > 0 ? "text-rose-600" : "text-foreground")}>
                {loading ? "…" : threats}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] leading-tight text-muted-foreground">Échecs de connexion</p>
              <p className={cn("mt-1 font-mono text-xl font-bold", failed > 0 ? "text-bissap" : "text-foreground")}>
                {loading ? "…" : failed}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] leading-tight text-muted-foreground">Comptes / PIN verrouillés</p>
              <p className={cn("mt-1 font-mono text-xl font-bold", (locked > 0 || pinLocked > 0) ? "text-bissap" : "text-foreground")}>
                {loading ? "…" : locked + pinLocked}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] leading-tight text-muted-foreground">Incidents applicatifs</p>
              <p className={cn("mt-1 font-mono text-xl font-bold", errors > 0 ? "text-rose-500" : "text-foreground")}>
                {loading ? "…" : errors}
              </p>
            </div>
          </div>

          {/* Filtres rapides en 1 clic */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 border-b border-border/40">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="size-3" /> Filtrer :
            </span>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "h-7 px-2.5 rounded-full text-xs font-bold transition-all cursor-pointer",
                filter === "all" ? "bg-primary text-primary-foreground shadow-2xs" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              Tous ({d?.events.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setFilter("threats")}
              className={cn(
                "h-7 px-2.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                filter === "threats" ? "bg-rose-600 text-white shadow-2xs" : "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
              )}
            >
              <ShieldAlert className="size-3" /> Attaques &amp; Menaces
            </button>
            <button
              type="button"
              onClick={() => setFilter("errors")}
              className={cn(
                "h-7 px-2.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                filter === "errors" ? "bg-amber-600 text-white shadow-2xs" : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
              )}
            >
              <AlertTriangle className="size-3" /> Incidents ({errors})
            </button>
            <button
              type="button"
              onClick={() => setFilter("auth")}
              className={cn(
                "h-7 px-2.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                filter === "auth" ? "bg-gold text-[#18120C] shadow-2xs" : "bg-gold/10 text-gold-text hover:bg-gold/20"
              )}
            >
              <Lock className="size-3.5" /> Connexions &amp; PIN
            </button>
            {adminAccessCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAdminAccess((v) => !v)}
                className={cn(
                  "h-7 px-2.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap",
                  showAdminAccess ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {showAdminAccess ? "Masquer" : "Afficher"} mes accès console ({adminAccessCount})
              </button>
            )}
          </div>

          {(d?.adminIps?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 text-xs space-y-1.5">
              <p className="font-semibold text-foreground">IP ayant accédé à la console admin (30 j)</p>
              <div className="flex flex-wrap gap-1.5">
                {d!.adminIps!.map((ip) => (
                  <span key={ip} className="font-mono text-[11px] bg-background px-2 py-0.5 rounded-full border border-border/60">
                    {ip}
                    {ipGeo[ip] ? <span className="text-muted-foreground"> · {ipGeo[ip]!.label}</span> : null}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Une IP inconnue déclenche automatiquement une alerte. Si l&apos;une d&apos;elles n&apos;est pas à vous, supprimez les passkeys inconnues.
              </p>
            </div>
          )}

          {/* Journal des événements avec détails complets au clic */}
          {sec.error ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-bissap/10 px-3.5 py-3 text-sm text-bissap">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">Journal indisponible : {sec.error}</span>
              <Button size="sm" variant="outline" onClick={() => void sec.refetch()} className="gap-1.5">
                <RefreshCw className="size-3.5" aria-hidden="true" /> Réessayer
              </Button>
            </div>
          ) : loading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Chargement du journal sécurité">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              {filter === "all" ? "Aucun événement dans le journal pour le moment." : "Aucun événement correspondant à ce filtre."}
            </p>
          ) : (
            <ul
              role="list"
              aria-label="Journal de sécurité en temps réel"
              className="max-h-96 divide-y divide-border/60 overflow-y-auto pretty-scroll"
            >
              {filteredEvents.map((e) => {
                const k = SEC_KINDS[e.kind] ?? { label: e.kind, cls: "bg-muted text-muted-foreground" };
                const isSelected = selectedEventId === e.id;

                return (
                  <li
                    role="listitem"
                    key={e.id}
                    onClick={() => setSelectedEventId(isSelected ? null : e.id)}
                    className={cn(
                      "p-2.5 rounded-xl transition-all cursor-pointer space-y-1.5",
                      isSelected ? "bg-muted/80 ring-1 ring-primary/40 shadow-xs" : "hover:bg-muted/40"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ring-current/15", k.cls)}>
                        {k.label}
                      </span>

                      {e.phone && (
                        <span className="font-mono text-xs font-bold text-foreground">
                          {e.phone}
                        </span>
                      )}

                      {e.ip && (
                        <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          IP: {e.ip}
                          {ipGeo[e.ip] ? ` · ${ipGeo[e.ip]!.label}` : ""}
                        </span>
                      )}

                      <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {secTime(e.ts)}
                      </span>
                    </div>

                    {/* Détail clair : visible en entier si sélectionné, ou résumé en 1 ligne */}
                    {e.detail && (
                      <p className={cn(
                        "text-xs text-muted-foreground leading-relaxed pl-1",
                        isSelected ? "whitespace-pre-wrap break-words font-mono text-[11px] bg-background/80 p-2 rounded-lg border border-border/60" : "truncate max-w-full"
                      )}>
                        {e.detail}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
