"use client";
// Kènè — Console Admin · Vue d'ensemble (: extraite d'AdminApp,
// comportement inchangé): KPIs plateforme, courbe diagnostics 14 j,
// top instituts par CA 30 j.
import { useEffect, useState } from "react";
import { Activity, AlertCircle, Building2, CheckCircle2, Cpu, CreditCard, Crown, Database, ExternalLink, HeartHandshake, MessageSquare, ReceiptText, RefreshCw, Server, ShoppingBag, Smartphone, ShieldCheck, BriefcaseBusiness, Users } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/kene/api";
import { cn } from "@/lib/utils";
import { xof } from "@/lib/kene/format";
import { useApi } from "@/components/kene/pro/useApi";
import { useKene } from "@/store/kene";
import { EmptyState, KpiCard, Money, dayLabel } from "@/components/kene/pro/ui-bits";
import { AdminMaintenanceControl } from "./AdminMaintenanceControl";
import type { AdminSecurity, AdminStats } from "@/components/kene/pro/types";

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

interface ConnectorsData {
  winipayer: { status: "live" | "sandbox" | "unconfigured"; merchantUuidMasked: string; preferredEnv: string; detail: string };
  saspay?: { status: "live" | "sandbox" | "unconfigured"; keyMasked: string; detail: string };
  zavu: { status: "ready" | "needs_sender_number" | "unconfigured"; keyMasked: string; detail: string };
  termii?: { status: "ready" | "unconfigured"; senderId: string; keyMasked: string; detail: string };
  ai: { status: "live" | "fallback_expert"; model: string; detail: string };
  alerts?: { status: "ready" | "unconfigured"; detail: string };
  database: { status: string; usersCount: number; latencyMs?: number };
}

export function AdminOverview({
  stats,
  sec,
  scope = "real",
  onScopeChange,
  onNavigateTab,
}: {
  stats: ReturnType<typeof useApi<AdminStats>>;
  sec?: ReturnType<typeof useApi<AdminSecurity>>;
  scope?: "real" | "all";
  onScopeChange?: (s: "real" | "all") => void;
  onNavigateTab?: (tab: "overview" | "orders" | "appointments" | "tenants" | "users" | "subs" | "referrals" | "security") => void;
}) {
  const data = stats.data;
  const [connectors, setConnectors] = useState<ConnectorsData | null>(null);
  const [loadingConnectors, setLoadingConnectors] = useState(false);

  const fetchConnectors = () => {
    setLoadingConnectors(true);
    apiGet<ConnectorsData>("/api/admin/connectors")
      .then((d) => setConnectors(d))
      .catch(() => null)
      .finally(() => setLoadingConnectors(false));
  };

  useEffect(() => {
    fetchConnectors();
  }, []);

  if (!data) return null;

  const chartData = data.chart.map((c) => ({ ...c, label: dayLabel(c.date) }));
  const maxCa = Math.max(1, ...data.topTenants.map((t) => t.ca30));

  // Sparklines et tendances réelles pour l'admin
  const sparklineDiag = data.chart.map((c) => c.count);
  const last7Diag = data.chart.slice(-7);
  const prev7Diag = data.chart.slice(-14, -7);
  const diag7Sum = last7Diag.reduce((s, c) => s + c.count, 0);
  const diagPrevSum = prev7Diag.reduce((s, c) => s + c.count, 0);
  const diagTrendVal = diagPrevSum > 0 ? Math.round(((diag7Sum - diagPrevSum) / diagPrevSum) * 100) : 0;
  const diagTrendDir: "up" | "down" | "flat" = diagTrendVal > 0 ? "up" : diagTrendVal < 0 ? "down" : "flat";

  return (
    <div className="space-y-5">
      {/* 👑 Cockpit Exécutif du Fondateur — Verre Solaire & Aura d'Or */}
      <div className="k-solar-glass relative overflow-hidden rounded-[24px] p-4 sm:p-5">
        <div
          aria-hidden="true"
          className="k-aura-glow absolute -top-12 -right-12 h-44 w-44 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(212,154,36,0.55) 0%, rgba(158,32,69,0.22) 55%, transparent 75%)",
          }}
        />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                <Crown className="size-4" />
              </span>
              <h2 className="font-heading text-lg sm:text-xl font-bold text-foreground">
                Cockpit Fondateur · Dermo TIC
              </h2>
              <span className="rounded-full bg-primary/20 text-gold-text text-[10px] font-mono px-2 py-0.5 font-bold uppercase tracking-wider">
                Éditeur Logiciel
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Supervision de la plateforme Kènè éditée par Dermo TIC · Seules les entreprises partenaires vendent des produits et réalisent les soins &amp; rendez-vous
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Commutateur Données Réelles vs Toutes les données */}
            {onScopeChange && (
              <div className="flex items-center gap-1 bg-background/90 border border-border rounded-full p-0.5 text-xs shadow-xs">
                <button
                  type="button"
                  onClick={() => onScopeChange("real")}
                  className={cn(
                    "px-3 py-1 rounded-full font-bold transition-all text-[11px] flex items-center gap-1.5 cursor-pointer",
                    scope === "real"
                      ? "bg-emerald-500/20 text-emerald-600 border border-emerald-500/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  Réel
                </button>
                <button
                  type="button"
                  onClick={() => onScopeChange("all")}
                  className={cn(
                    "px-3 py-1 rounded-full font-bold transition-all text-[11px] flex items-center gap-1.5 cursor-pointer",
                    scope === "all"
                      ? "bg-amber-500/20 text-amber-600 border border-amber-500/30"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Avec Démo
                </button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 gap-1.5 text-xs font-semibold rounded-full border-gold/50 bg-gold/10 text-gold hover:bg-gold/20"
            >
              <a href="/case-study" target="_blank" rel="noopener noreferrer">
                <ShieldCheck className="size-3.5 text-amber-500" />
                <span>Case Study 3D</span>
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => useKene.getState().setSpace("client")}
              className="h-8 gap-1.5 text-xs font-semibold rounded-full border-border/80 hover:border-primary"
            >
              <Smartphone className="size-3.5 text-primary" />
              <span>App Cliente</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                useKene.getState().setProTenantId(null);
                useKene.getState().setSpace("pro");
              }}
              className="h-8 gap-1.5 text-xs font-semibold rounded-full border-border/80 hover:border-primary"
            >
              <BriefcaseBusiness className="size-3.5 text-primary" />
              <span>Espace Salon</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 🛑 Contrôle du Mode Maintenance & Affiche Clientèle */}
      <AdminMaintenanceControl />

      {/* KPIs — Monétisation et volume réel du réseau unifié (Style Bento Afro-Luxe) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard icon={<Users className="size-4" />} label="Utilisatrices" value={String(data.users)} monetary={false} hint={scope === "real" ? "Comptes réels" : "Tous les comptes"} />
        <KpiCard icon={<HeartHandshake className="size-4" />} label="Parrainages" value={String(data.referrals)} monetary={false} hint="Fil du Parrainage" />
        <KpiCard icon={<Building2 className="size-4" />} label="Instituts" value={String(data.tenants)} monetary={false} hint={scope === "real" ? "Salons actifs réels" : "Tous"} />
        <KpiCard
          icon={<Activity className="size-4" />}
          label="Diagnostics IA"
          value={String(data.diagnoses)}
          monetary={false}
          sparkline={sparklineDiag}
          trend={diagTrendVal !== 0 ? { value: Math.abs(diagTrendVal), direction: diagTrendDir } : undefined}
          hint="Analyses biométriques"
        />
        <KpiCard icon={<ShoppingBag className="size-4" />} label="Ventes Caisse" value={String(data.salesCount ?? 0)} monetary={false} hint={`CA : ${xof(data.salesVolume ?? 0, { compact: true })}`} />
        <KpiCard icon={<CreditCard className="size-4" />} label="Commandes Web" value={String(data.orders ?? 0)} monetary={false} hint={`CA : ${xof(data.gmvBoutique ?? 0, { compact: true })}`} />
        <KpiCard icon={<ReceiptText className="size-4" />} label="Volume Réseau (GMV)" value={xof(data.networkGmv ?? 0, { compact: true })} hint={`Acomptes RDV : ${xof(data.appointmentsDeposit ?? 0, { compact: true })}`} />
        <KpiCard icon={<Crown className="size-4" />} label="Revenus abonnements" value={xof(data.subsMrrFcfa ?? 0, { compact: true })} hint={`${data.activeSubs ?? 0} abonnée${(data.activeSubs ?? 0) > 1 ? "s" : ""}`} />
      </div>

      {/* 🛡️ Cockpit Santé Serveur & Radar de Sécurité Direct (Visible dès la 1ère page) */}
      <Card className="overflow-hidden border-border/80 bg-gradient-to-br from-card via-card to-primary/5 shadow-xs">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-base flex flex-wrap items-center gap-2">
              <Activity className="size-4 text-primary animate-pulse" aria-hidden="true" />
              <span>Santé Serveur &amp; Radar Anti-Attaques (Temps Réel)</span>
              {sec?.data?.health && (
                <Badge
                  variant="outline"
                  className={cn(
                    "font-bold text-xs px-2 py-0.5",
                    sec.data.health.status === "optimal"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      : sec.data.health.status === "warning"
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                  )}
                >
                  {sec.data.health.status === "optimal" ? "🟢 Système Optimal (100%)" : sec.data.health.status === "warning" ? "🟠 Sous Tension" : "🔴 Attention Requise"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Supervision directe de l&apos;infrastructure Kènè : base SQLite, mémoire vive, cyber-menaces et intégrité des flux.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void sec?.refetch();
                fetchConnectors();
              }}
              disabled={sec?.loading || loadingConnectors}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={cn("size-3.5", (sec?.loading || loadingConnectors) && "animate-spin")} />
              <span>Tester maintenant</span>
            </Button>
            {onNavigateTab && (
              <Button
                size="sm"
                onClick={() => onNavigateTab("security")}
                className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground font-bold"
              >
                <ShieldCheck className="size-3.5" />
                <span>Voir le Journal complet →</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {/* 1. Base de données */}
            <div className="rounded-xl border border-border/70 bg-card/60 p-3 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5">
                  <Database className="size-3.5 text-emerald-500" /> Latence SQLite
                </span>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">Prisma</span>
              </div>
              <p className="font-heading text-lg font-black text-foreground">
                {sec?.data?.health ? `${sec.data.health.dbLatencyMs} ms` : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {sec?.data?.health?.dbLatencyMs && sec.data.health.dbLatencyMs < 10 ? "Ultra-rapide" : "Temps de réponse"}
              </p>
            </div>

            {/* 2. Uptime 24/7 */}
            <div className="rounded-xl border border-border/70 bg-card/60 p-3 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5">
                  <Server className="size-3.5 text-primary" /> Disponibilité
                </span>
                <span className="text-[10px] font-mono text-emerald-600 font-bold">En ligne</span>
              </div>
              <p className="font-heading text-lg font-black text-foreground">
                {sec?.data?.health ? formatUptime(sec.data.health.uptimeSec) : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">Sans aucune coupure</p>
            </div>

            {/* 3. Mémoire Vive */}
            <div className="rounded-xl border border-border/70 bg-card/60 p-3 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-purple-500" /> Mémoire RAM
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">Node.js</span>
              </div>
              <p className="font-heading text-lg font-black text-foreground">
                {sec?.data?.health ? `${sec.data.health.memoryUsageMb} Mo` : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">Allocation serveur active</p>
            </div>

            {/* 4. Menaces Bloquées 24h */}
            <div className={cn(
              "rounded-xl border p-3 space-y-1 transition-all",
              (sec?.data?.stats.threats24h ?? 0) > 0
                ? "border-rose-500/40 bg-rose-500/10"
                : "border-border/70 bg-card/60"
            )}>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <ShieldCheck className="size-3.5" /> Menaces 24h
                </span>
                <span className="text-[10px] font-bold text-rose-600">Bouclier</span>
              </div>
              <p className={cn("font-heading text-lg font-black", (sec?.data?.stats.threats24h ?? 0) > 0 ? "text-rose-600" : "text-foreground")}>
                {sec?.data ? `${sec.data.stats.threats24h ?? 0} bloquée${(sec.data.stats.threats24h ?? 0) > 1 ? "s" : ""}` : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">Honeypot, robots, force-brute</p>
            </div>

            {/* 5. Incidents applicatifs */}
            <div className="rounded-xl border border-border/70 bg-card/60 p-3 space-y-1 col-span-2 sm:col-span-4 lg:col-span-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold flex items-center gap-1.5">
                  <Activity className="size-3.5 text-amber-500" /> Bugs / Erreurs 24h
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">Télémétrie</span>
              </div>
              <p className="font-heading text-lg font-black text-foreground">
                {sec?.data?.stats ? sec.data.stats.clientErrors24h ?? 0 : "…"}
              </p>
              <p className="text-[10px] text-muted-foreground">Remontées client &amp; cabine</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connecteurs & Passerelles Réelles */}
      <Card className="border-border/80">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Server className="size-4 text-gold-text" />
              État des Connecteurs de Production
            </CardTitle>
            <CardDescription className="text-xs">
              Passerelles de paiement, messagerie SMS/WhatsApp et services d&apos;intelligence artificielle
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchConnectors}
            disabled={loadingConnectors}
            className="h-8 px-2 text-xs gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loadingConnectors ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent>
          {connectors ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* WiniPayer */}
              <div className="rounded-xl border border-border bg-card/50 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <CreditCard className="size-3.5 text-primary" />
                    WiniPayer API v2
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold ${
                      connectors.winipayer.status === "live"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                    }`}
                  >
                    {connectors.winipayer.status === "live" ? "Mode Réel (Live)" : "Mode Test (Sandbox)"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {connectors.winipayer.detail}
                </p>
                <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
                  <span>UUID : {connectors.winipayer.merchantUuidMasked}</span>
                  <span className="font-mono">{connectors.winipayer.preferredEnv.toUpperCase()}</span>
                </div>
              </div>

              {/* SasPay */}
              {connectors.saspay && (
                <div className="rounded-xl border border-border bg-card/50 p-3 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs flex items-center gap-1.5">
                      <CreditCard className="size-3.5 text-amber-500" />
                      SasPay (Afrique)
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold ${
                        connectors.saspay.status === "live"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                      }`}
                    >
                      {connectors.saspay.status === "live" ? "Mode Réel (Live)" : "Mode Test (Sandbox)"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {connectors.saspay.detail}
                  </p>
                  <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
                    <span>Clé : {connectors.saspay.keyMasked}</span>
                    <a
                      href="https://saspay.me"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-0.5"
                    >
                      saspay.me <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* Zavu SMS */}
              <div className="rounded-xl border border-border bg-card/50 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-blue-500" />
                    Zavu (SMS GSM)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold ${
                      connectors.zavu.status === "ready"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                    }`}
                  >
                    {connectors.zavu.status === "ready" ? "Opérationnel" : "Numéro Requis"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {connectors.zavu.detail}
                </p>
                <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
                  <span>Clé : {connectors.zavu.keyMasked}</span>
                  <a
                    href="https://zavu.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-0.5"
                  >
                    zavu.dev <ExternalLink className="size-2.5" />
                  </a>
                </div>
              </div>

              {/* Termii SMS */}
              {connectors.termii && (
                <div className="rounded-xl border border-border bg-card/50 p-3 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs flex items-center gap-1.5">
                      <MessageSquare className="size-3.5 text-cyan-500" />
                      Termii (SMS OTP)
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold ${
                        connectors.termii.status === "ready"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                      }`}
                    >
                      {connectors.termii.status === "ready" ? "Opérationnel" : "Non configuré"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {connectors.termii.detail}
                  </p>
                  <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
                    <span>Expéditeur : {connectors.termii.senderId}</span>
                    <a
                      href="https://termii.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-0.5"
                    >
                      termii.com <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* Moteur IA */}
              <div className="rounded-xl border border-border bg-card/50 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <Cpu className="size-3.5 text-purple-500" />
                    Dermo-IA Dermo Kènè
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold ${
                      connectors.ai.status === "live"
                        ? "bg-purple-500/10 text-purple-600 border-purple-500/30"
                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    }`}
                  >
                    {connectors.ai.status === "live" ? "Moteur IA Kènè" : "Moteur Expert"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {connectors.ai.detail}
                </p>
                <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                  Modèle : <span className="font-mono">{connectors.ai.model}</span>
                </div>
              </div>

              {/* Base de données */}
              <div className="rounded-xl border border-border bg-card/50 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-xs flex items-center gap-1.5">
                    <Database className="size-3.5 text-emerald-500" />
                    Base de Données
                  </span>
                  <Badge variant="outline" className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    Connectée {connectors.database.latencyMs ? `(${connectors.database.latencyMs} ms)` : ""}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Prisma ORM opérationnel avec intégrité référentielle
                </p>
                <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
                  <span>Comptes enregistrés : <strong className="text-foreground">{connectors.database.usersCount}</strong></span>
                  {connectors.database.latencyMs && (
                    <span className="text-emerald-600 font-mono font-bold text-[10px]">{connectors.database.latencyMs} ms</span>
                  )}
                </div>
              </div>

              {/* Relais d'alertes instantanées */}
              {connectors.alerts && (
                <div className="rounded-xl border border-border bg-card/50 p-3 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-primary" />
                      Alertes Externes (Bot)
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold ${
                        connectors.alerts.status === "ready"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {connectors.alerts.status === "ready" ? "Canal Actif" : "Non configuré"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {connectors.alerts.detail}
                  </p>
                  <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                    Notification automatique en cas d&apos;attaque ou d&apos;incident
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-muted-foreground">
              Chargement de la télémétrie des connecteurs...
            </div>
          )}
        </CardContent>
      </Card>

      {/* 🌟 Diagnostics IA — Courbe Solaire Awwwards */}
      <Card className="overflow-hidden pt-0 rounded-[22px] sm:rounded-[26px] border border-border/80 shadow-xs relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-2xl pointer-events-none" />
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <Activity className="size-4 text-gold-text" />
                Diagnostics IA biométriques — 14 derniers jours
              </CardTitle>
              <CardDescription className="text-xs">
                Volume d&apos;analyses cutanées traitées en temps réel par le moteur Dermo-IA
              </CardDescription>
            </div>
            <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-gold/15 text-gold-text border border-gold/30 self-start sm:self-center">
              Total 14j : {data.chart.reduce((s, c) => s + c.count, 0)} analyses
            </span>
          </div>
        </CardHeader>
        <CardContent className="h-64 touch-pan-y">
          {chartData.length === 0 ? (
            <EmptyState label="Aucun diagnostic sur la période" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminDiagGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D49A24" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#D49A24" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as { label: string; date: string; count: number };
                    return (
                      <div className="rounded-xl border border-gold/40 bg-card/95 backdrop-blur-md px-3 py-2 shadow-lg text-xs space-y-0.5">
                        <p className="font-semibold text-foreground flex items-center justify-between gap-3">
                          <span>{p.label}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{p.date}</span>
                        </p>
                        <p className="font-mono text-sm font-bold text-gold-text">
                          {p.count} diagnostic{p.count > 1 ? "s" : ""} IA
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#D49A24"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#adminDiagGradient)"
                  dot={{ r: 3, fill: "#D49A24", strokeWidth: 1.5, stroke: "#FFF" }}
                  activeDot={{ r: 5, fill: "#D49A24", strokeWidth: 2, stroke: "#FFF" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top instituts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">Instituts partenaires — CA 30 jours</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.topTenants.length === 0 ? (
            <EmptyState label="Aucun institut partenaire" />
          ) : (
            <div className="overflow-x-auto pretty-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institut</TableHead>
                    <TableHead className="hidden sm:table-cell">Ville</TableHead>
                    <TableHead>Poids CA 30 j</TableHead>
                    <TableHead className="text-right">CA 30 jours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topTenants.map((t) => (
                    <TableRow key={`${t.name}-${t.city}`}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="flex items-center gap-1.5 text-sm">
                          {t.city}
                          {t.country && <Badge variant="outline" className="text-[9px] font-mono">{t.country}</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="w-40">
                        <div className="h-2 rounded-full bg-muted overflow-hidden" role="img" aria-label={`${Math.round((t.ca30 / maxCa) * 100)} % du CA total`}>
                          <div className="h-full rounded-full bg-gradient-to-r from-gold to-terre" style={{ width: `${Math.max(4, Math.round((t.ca30 / maxCa) * 100))}%` }} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right"><Money value={t.ca30} className="text-sm font-semibold" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
