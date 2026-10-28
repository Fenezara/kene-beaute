"use client";
// Kènè Pro — Tableau de bord: KPIs, CA 14j, paiements, top soins, timeline du jour, alertes stock
import { useState } from "react";
import {
  Banknote,
  CalendarCheck,
  CheckCircle2,
  Percent,
  UserPlus,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Star,
  MessageSquareHeart,
  MessageCircle,
  Loader2,
  BarChart3,
  LayoutDashboard,
  Sparkles,
  Zap,
  Plus,
  Crown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CauriIcon } from "@/components/kene/icons";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { apiGet } from "@/lib/kene/api";
import { waLink } from "@/lib/kene/followups";
import { KpiCard, Money, ApptStatusBadge, EmptyState, ErrorState, KenteTop, dayLabel } from "./ui-bits";
import { SalonAnalyticsDashboard } from "./SalonAnalyticsDashboard";
import type { ProOverview, ProReviewView, ProReviewSummary, ProReviewsResponse } from "./types";
import type { UseApiResult } from "./useApi";
import type { ProSectionId } from "./ProApp";

const PAYMENT_COLORS: Record<string, string> = {
  wave: "#1DC8FF",
  orange: "#FF7900",
  cash: "#C8951E",
  card: "#3F7D3F",
  wallet: "#A0522D",
};
const PAYMENT_LABELS: Record<string, string> = {
  wave: "Wave",
  orange: "Orange Money",
  cash: "Espèces",
  card: "Carte bancaire",
  wallet: "Wallet Kènè",
};

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  color: "var(--foreground)",
  fontSize: "12px",
  boxShadow: "0 4px 16px rgba(0,0,0,.12)",
};

export function DashboardSection({
  tenantId,
  overview,
  loadingOverview,
  onNavigate,
}: {
  tenantId: string;
  overview: UseApiResult<ProOverview>;
  loadingOverview: boolean;
  onNavigate: (s: ProSectionId) => void;
  onOpenInciScanner?: () => void;
  onOpenMirrorKiosk?: () => void;
}) {
  const data = overview.data;

  const [viewMode, setViewMode] = useState<"operations" | "finance">("operations");
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [allReviews, setAllReviews] = useState<ProReviewView[]>([]);
  const [reviewsSummary, setReviewsSummary] = useState<ProReviewSummary | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewsFilter, setReviewsFilter] = useState<number | "all">("all");

  async function openAllReviews() {
    setShowReviewsModal(true);
    setLoadingReviews(true);
    try {
      const res = await apiGet<ProReviewsResponse>(`/api/pro/reviews?tenantId=${tenantId}`);
      setAllReviews(res.reviews ?? []);
      setReviewsSummary(res.summary ?? null);
    } catch {
      if (data?.recentReviews) {
        setAllReviews(data.recentReviews);
      }
    } finally {
      setLoadingReviews(false);
    }
  }

  const filteredReviews = reviewsFilter === "all" ? allReviews : allReviews.filter((r) => r.rating === reviewsFilter);

  if (overview.error && !data) {
    const isNetwork =
      /network|failed to fetch|hors-ligne|load failed|offline/i.test(overview.error) ||
      (typeof navigator !== "undefined" && !navigator.onLine);
    if (isNetwork) {
      return (
        <Card className="p-8 text-center space-y-4">
          <EmptyState
            label="Tableau de bord hors-ligne"
            sub="Vos outils d'établissement restent opérationnels. Vous pouvez encaisser vos ventes à la Caisse et consulter le carnet de clientes sans interruption."
          />
          <div className="flex justify-center gap-3">
            <Button onClick={() => onNavigate("caisse")} className="k-btn-gold text-xs font-bold">
              Ouvrir la Caisse POS
            </Button>
            <Button onClick={() => onNavigate("crm")} variant="outline" className="text-xs font-semibold">
              Carnet de Clientes
            </Button>
          </div>
        </Card>
      );
    }
    return <ErrorState message={`Tableau de bord indisponible : ${overview.error}`} onRetry={overview.refetch} />;
  }

  if (loadingOverview && !data) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (!data) return null;

  const [chartRange, setChartRange] = useState<"7d" | "14d">("14d");
  const k = data.kpis;
  const pieData = data.paymentSplit.map((p) => ({ name: PAYMENT_LABELS[p.method] ?? p.method, value: p.total, key: p.method }));
  const pieTotal = pieData.reduce((s, p) => s + p.value, 0);

  // Séries 14j et 7j réelles
  const rawChart = data.chart ?? [];
  const chartData14 = rawChart.map((c) => ({ ...c, label: dayLabel(c.date) }));
  const chartData7 = chartData14.slice(-7);
  const displayChartData = chartRange === "7d" ? chartData7 : chartData14;

  // Calculs honnêtes sans simulation
  const last7 = rawChart.slice(-7);
  const prev7 = rawChart.slice(-14, -7);
  const ca7Total = last7.reduce((acc, cur) => acc + cur.total, 0);
  const prev7Total = prev7.reduce((acc, cur) => acc + cur.total, 0);
  const caTrendValue = prev7Total > 0 ? Math.round(((ca7Total - prev7Total) / prev7Total) * 100) : 0;
  const caTrendDirection: "up" | "down" | "flat" = caTrendValue > 0 ? "up" : caTrendValue < 0 ? "down" : "flat";

  const sparklineCA = rawChart.map((c) => c.total);
  const sparklineBaskets = rawChart.map((c) => c.count ?? (c.total > 0 ? 1 : 0));

  // Jour record sur la période affichée
  const peakDay = displayChartData.reduce(
    (max, cur) => (cur.total > max.total ? cur : max),
    { total: 0, label: "", date: "" }
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data.tenant.name} — {data.tenant.city} · vue temps réel de l&apos;activité
          </p>
        </div>

        {/* Toggle Vue Opérationnelle / Analyse Financière */}
        <div className="flex rounded-xl bg-muted p-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("operations")}
            className={cn(
              "rounded-lg px-3 py-1.5 font-semibold transition-all flex items-center gap-1.5",
              viewMode === "operations" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutDashboard className="size-3.5" />
            Vue Opérationnelle
          </button>
          <button
            type="button"
            onClick={() => setViewMode("finance")}
            className={cn(
              "rounded-lg px-3 py-1.5 font-semibold transition-all flex items-center gap-1.5",
              viewMode === "finance" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="size-3.5 text-gold-text" />
            Analyse Financière &amp; KPIs
          </button>
        </div>
      </div>

      {viewMode === "finance" ? (
        <SalonAnalyticsDashboard tenantId={tenantId} data={data} />
      ) : (
        <>
          {/* ── BENTO GRID SUPRÊME AWWWARDS (HERO AREA + 4 KPI TILES) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3.5 sm:gap-4">
            
            {/* 🌟 HERO CARTE REVENUE (8 colonnes desktop, 2 col tablette, 1 col mobile) */}
            <div className="md:col-span-2 lg:col-span-8 rounded-[24px] sm:rounded-[28px] border border-gold/35 bg-card p-4 sm:p-6 relative overflow-hidden shadow-xs flex flex-col justify-between group transition-all duration-300">
              <div className="absolute top-0 right-0 w-80 h-80 bg-gold/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
              <KenteTop />

              {/* En-tête Hero */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-10">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold font-mono uppercase tracking-wider bg-gold/15 text-gold-text border border-gold/25">
                      <Zap className="size-3" />
                      Flux d&apos;Encaissement Réel
                    </span>
                    {peakDay.total > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                        Record : {peakDay.label} ({xof(peakDay.total, { compact: true })})
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3 mt-2">
                    <h2 className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-foreground tracking-tight">
                      {xof(chartRange === "7d" ? ca7Total : rawChart.reduce((s, c) => s + c.total, 0))}
                    </h2>
                    {prev7Total > 0 && (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border",
                        caTrendDirection === "up" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25" :
                        caTrendDirection === "down" ? "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/25" :
                        "bg-muted text-muted-foreground border-border"
                      )}>
                        {caTrendDirection === "up" ? `+${caTrendValue}% vs sem. préc.` : `${caTrendValue}% vs sem. préc.`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {chartRange === "7d" ? "Chiffre d'affaires cumulé sur les 7 derniers jours" : "Chiffre d'affaires consolidé sur les 14 derniers jours"}
                  </p>
                </div>

                {/* Commutateur 7j / 14j */}
                <div className="flex items-center bg-muted/90 p-1 rounded-xl border border-border/80 self-start sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => setChartRange("7d")}
                    className={cn(
                      "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                      chartRange === "7d" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    7 jours
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartRange("14d")}
                    className={cn(
                      "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                      chartRange === "14d" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    14 jours
                  </button>
                </div>
              </div>

              {/* AreaChart avec Halo Lumineux Solaire */}
              <div className="h-60 sm:h-64 w-full mt-4 z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={displayChartData} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
                    <defs>
                      <linearGradient id="goldAuraGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D49A24" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#D49A24" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      interval="preserveStartEnd"
                      tickLine={false}
                      axisLine={{ stroke: "var(--border)" }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload as { label: string; date: string; total: number; count?: number };
                        return (
                          <div className="rounded-xl border border-gold/40 bg-card/95 backdrop-blur-md px-3.5 py-2.5 shadow-xl text-xs space-y-1">
                            <p className="font-semibold text-foreground flex items-center justify-between gap-3">
                              <span>{point.label}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">{point.date}</span>
                            </p>
                            <p className="font-mono text-base font-bold text-gold-text">
                              {xof(point.total)}
                            </p>
                            {typeof point.count === "number" && (
                              <p className="text-[10px] text-muted-foreground">
                                {point.count} transaction{point.count > 1 ? "s" : ""} enregistrée{point.count > 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#D49A24"
                      strokeWidth={2.75}
                      fillOpacity={1}
                      fill="url(#goldAuraGradient)"
                      dot={{ r: 3, fill: "#D49A24", strokeWidth: 1.5, stroke: "#FFF" }}
                      activeDot={{ r: 5, fill: "#D49A24", strokeWidth: 2, stroke: "#FFF" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 💎 4 TUILES KPI EN BENTO (4 colonnes desktop, 2 colonnes tablette & mobile) */}
            <div className="md:col-span-2 lg:col-span-4 grid grid-cols-2 gap-3.5 sm:gap-4">
              <KpiCard
                icon={<Banknote className="size-4" />}
                label="CA du jour"
                value={xof(k.caToday)}
                hint="Caisse & Acomptes"
                sparkline={sparklineCA.slice(-7)}
              />
              <KpiCard
                icon={<CalendarCheck className="size-4" />}
                label="RDV aujourd'hui"
                value={String(k.appointmentsToday)}
                monetary={false}
                hint="En cabine & agenda"
                sparkline={sparklineBaskets.slice(-7)}
              />
              <KpiCard
                icon={<CauriIcon className="size-4" />}
                label="Panier moyen"
                value={xof(k.avgBasket)}
                hint={`${xof(k.ca30d, { compact: true })} sur 30 j`}
                sparkline={sparklineCA}
                trend={caTrendValue !== 0 ? { value: Math.abs(caTrendValue), direction: caTrendDirection } : undefined}
              />
              <KpiCard
                icon={<Percent className="size-4" />}
                label="Occupation"
                value={`${Math.round(k.occupancyPct)} %`}
                monetary={false}
                hint={`${k.newClients30d} nvlles clientes / 30j`}
              />
            </div>
          </div>

          {/* ── LIGNE 2 : TIMELINE DU JOUR & RÉPARTITION DES PAIEMENTS ── */}
          <div className="grid lg:grid-cols-12 gap-4">
            {/* Timeline du jour (7 colonnes) */}
            <Card className="lg:col-span-7 overflow-hidden pt-0 rounded-[22px] sm:rounded-[26px]">
              <KenteTop />
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <CalendarCheck className="size-4 text-primary" />
                  Timeline du jour
                </CardTitle>
                <span className="text-xs font-mono text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
                  {data.todayAppointments.length} soin{data.todayAppointments.length > 1 ? "s" : ""}
                </span>
              </CardHeader>
              <CardContent className="p-0">
                {data.todayAppointments.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="size-12 rounded-2xl bg-gold/10 border border-gold/25 grid place-items-center text-gold-text">
                      <Sparkles className="size-6" />
                    </div>
                    <div>
                      <h4 className="font-heading font-bold text-base text-foreground">Cabine prête · Aucun rendez-vous</h4>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                        Votre planning d&apos;aujourd&apos;hui est dégagé. Proposez un créneau à vos clientes fidèles ou enregistrez une vente directe.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center items-center gap-2 pt-1">
                      <Button onClick={() => onNavigate("agenda")} size="sm" className="k-btn-gold text-xs font-bold gap-1.5 rounded-full">
                        <Plus className="size-3.5" /> Poser un soin à l&apos;agenda
                      </Button>
                      <Button onClick={() => onNavigate("caisse")} size="sm" variant="outline" className="text-xs font-semibold rounded-full">
                        Ouvrir la Caisse POS
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ul className="max-h-80 overflow-y-auto pretty-scroll divide-y divide-border/70">
                    {data.todayAppointments.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors">
                        <span className="font-mono text-xs text-muted-foreground w-12 shrink-0 tabular-nums font-semibold bg-muted px-1.5 py-0.5 rounded-md text-center">
                          {formatTime(a.startAt)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{a.clientName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {a.serviceName} · {a.resourceName}
                          </p>
                        </div>
                        <Money value={a.price} className="text-xs font-bold shrink-0" />
                        <ApptStatusBadge status={a.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Répartition des paiements (5 colonnes) */}
            <Card className="lg:col-span-5 overflow-hidden pt-0 rounded-[22px] sm:rounded-[26px]">
              <KenteTop />
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Banknote className="size-4 text-gold-text" />
                  Modes de paiement
                </CardTitle>
                <span className="text-xs font-mono font-bold text-foreground">
                  {xof(pieTotal, { compact: true })}
                </span>
              </CardHeader>
              <CardContent className="h-64 flex flex-col justify-between">
                {pieTotal > 0 ? (
                  <>
                    <div className="relative flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="56%"
                            outerRadius="82%"
                            paddingAngle={3}
                            strokeWidth={0}
                          >
                            {pieData.map((entry) => (
                              <Cell key={entry.key} fill={PAYMENT_COLORS[entry.key] ?? "var(--chart-3)"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} formatter={(value) => xof(Number(value))} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground">Total</span>
                        <span className="font-mono text-xs sm:text-sm font-black text-foreground">{xof(pieTotal, { compact: true })}</span>
                      </div>
                    </div>
                    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-border/60">
                      {pieData.map((p) => {
                        const pct = Math.round((p.value / pieTotal) * 100);
                        return (
                          <li key={p.key} className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <span className="size-2 rounded-full shrink-0" style={{ background: PAYMENT_COLORS[p.key] ?? "var(--chart-3)" }} aria-hidden="true" />
                              <span className="truncate">{p.name}</span>
                              <span className="ml-auto font-mono font-semibold text-foreground">{pct} %</span>
                            </div>
                            <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PAYMENT_COLORS[p.key] ?? "var(--chart-3)" }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <EmptyState label="Aucun paiement enregistré" sub="Les encaissements caisse apparaîtront ici" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── LIGNE 3 : TOP SOINS & AVIS CLIENTES & ALERTES STOCK ── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="rounded-[22px] sm:rounded-[26px]">
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Crown className="size-4 text-gold-text" />
                  Top soins vendus
                </CardTitle>
                <span className="text-xs text-muted-foreground">Volume & Récurrence</span>
              </CardHeader>
              <CardContent className="p-0">
                {data.topServices.length === 0 ? (
                  <EmptyState label="Pas encore de ventes" sub="Vos prestations les plus populaires s'afficheront ici" />
                ) : (
                  <ul className="divide-y divide-border/70">
                    {(() => {
                      const maxTotal = Math.max(...data.topServices.map((s) => s.total || 1));
                      return data.topServices.map((s, i) => {
                        const pct = Math.round((s.total / maxTotal) * 100);
                        return (
                          <li key={s.name} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                "grid size-6 place-items-center rounded-lg font-mono text-[11px] font-bold shrink-0",
                                i === 0 ? "bg-gold/25 text-gold-text border border-gold/40 shadow-xs" :
                                i === 1 ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" :
                                i === 2 ? "bg-terre/15 text-terre" :
                                "bg-muted text-muted-foreground"
                              )} aria-hidden="true">
                                {i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{s.name}</p>
                                <p className="text-xs text-muted-foreground">{s.count} prestation{s.count > 1 ? "s" : ""}</p>
                              </div>
                              <Money value={s.total} className="text-sm font-bold" />
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden ml-9 max-w-[calc(100%-2.25rem)]">
                              <div className="h-full rounded-full bg-gradient-to-r from-gold to-terre" style={{ width: `${pct}%` }} />
                            </div>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="rounded-[22px] sm:rounded-[26px]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <MessageSquareHeart className="size-4 text-gold" aria-hidden="true" />
                  Avis clientes & Réputation
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-gold px-2 py-0.5 text-xs font-bold font-mono">
                    <Star size={11} className="fill-gold" />
                    {(data.tenant?.rating ?? 5.0).toFixed(1)} / 5
                  </span>
                  {data.recentReviews && data.recentReviews.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={openAllReviews}
                      className="h-7 text-xs font-semibold text-primary hover:text-primary px-2"
                    >
                      Voir tout ({data.tenant?.reviewCount ?? data.recentReviews.length})
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!data.recentReviews || data.recentReviews.length === 0 ? (
                <div className="px-4 py-4 space-y-2.5">
                  <div className="flex items-center gap-1 text-gold" role="img" aria-label="5 étoiles d'excellence">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-4 fill-gold text-gold" />
                    ))}
                    <span className="ml-2 text-xs font-bold text-foreground">Excellence Clinique 5.0</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Vos clientes invitées peuvent noter leur expérience cabine directement après chaque rendez-vous.
                  </p>
                </div>
              ) : (
                <ul className="max-h-60 overflow-y-auto pretty-scroll divide-y divide-border/70">
                  {data.recentReviews.map((r) => (
                    <li key={r.id} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{r.clientName}</p>
                        <span className="flex items-center gap-0.5 shrink-0" role="img" aria-label={`Note ${r.rating} sur 5`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={cn("size-3", i < r.rating ? "fill-gold text-gold" : "text-border")} aria-hidden="true" />
                          ))}
                        </span>
                      </div>
                      {r.comment ? <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">« {r.comment} »</p> : null}
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground font-mono">
                        <span className="truncate">{r.serviceName ? `${r.serviceName} · ` : ""}{formatDate(r.createdAt)}</span>
                        {r.clientPhone && (
                          <a
                            href={waLink(
                              r.clientPhone,
                              `Bonjour ${r.clientName} 👋 Merci infiniment pour votre avis (${r.rating}★) sur votre soin chez ${data.tenant.name} ! Au plaisir de vous accueillir à nouveau.`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#25D366] hover:underline font-sans font-semibold shrink-0"
                            title="Remercier sur WhatsApp"
                          >
                            <MessageCircle size={11} /> Remercier
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className={cn("border-bissap/30", data.stockAlerts.length === 0 && "border-success/25")}>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <AlertTriangle className={cn("size-4", data.stockAlerts.length > 0 ? "text-bissap" : "text-success")} aria-hidden="true" />
                Alertes stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.stockAlerts.length === 0 ? (
                <div className="flex items-center gap-2.5 py-1">
                  <span className="grid size-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">Rayon 100 % Opérationnel</p>
                    <p className="text-[11px] text-muted-foreground">Tous les stocks sont au-dessus des seuils de réassort.</p>
                  </div>
                </div>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {data.stockAlerts.slice(0, 4).map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono text-xs text-bissap shrink-0">
                          {p.stock} / seuil {p.stockAlert}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="outline" className="mt-3 gap-1.5 border-bissap/40 text-bissap hover:bg-bissap/10" onClick={() => onNavigate("stock")}>
                    Gérer le stock <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </>
      )}

      {/* Modal Avis & Réputation Pro */}
      <Dialog open={showReviewsModal} onOpenChange={setShowReviewsModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden rounded-3xl">
          <DialogHeader className="shrink-0 pb-3 border-b border-border/70">
            <div className="flex items-center justify-between gap-2">
              <div>
                <DialogTitle className="font-heading text-lg flex items-center gap-2">
                  <MessageSquareHeart className="size-5 text-gold" />
                  Avis & Réputation de l&apos;institut
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data?.tenant?.name} · {data?.tenant?.city}, {data?.tenant?.country}
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Synthèse des indicateurs de satisfaction */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-muted/40 border border-border/60 shrink-0 mt-2">
            <div className="flex flex-col items-center justify-center text-center p-2 border-b md:border-b-0 md:border-r border-border/60">
              <span className="font-heading font-black text-3xl text-foreground">
                {(reviewsSummary?.averageRating ?? data?.tenant?.rating ?? 5.0).toFixed(1)}
              </span>
              <div className="flex items-center gap-0.5 mt-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={13}
                    className={cn(
                      "fill-current",
                      i < Math.round(reviewsSummary?.averageRating ?? data?.tenant?.rating ?? 5.0) ? "text-gold fill-gold" : "text-border"
                    )}
                  />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground mt-1">
                {reviewsSummary?.totalCount ?? allReviews.length ?? data?.tenant?.reviewCount ?? 0} avis clients vérifiés
              </span>
            </div>

            <div className="flex flex-col items-center justify-center text-center p-2 border-b md:border-b-0 md:border-r border-border/60">
              <span className="font-heading font-black text-3xl text-[#3F7D3F] dark:text-[#8FD18F]">
                {reviewsSummary?.satisfactionRate ?? 100}%
              </span>
              <span className="text-xs font-semibold text-foreground mt-1">Satisfaction globale</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">Avis positifs (4 & 5 étoiles)</span>
            </div>

            <div className="space-y-1 text-xs justify-center flex flex-col p-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const total = reviewsSummary?.totalCount || allReviews.length || 1;
                const count = reviewsSummary?.breakdown?.[star] ?? allReviews.filter((r) => r.rating === star).length;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={star} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-3 text-muted-foreground font-mono">{star}</span>
                    <Star size={9} className="fill-gold text-gold shrink-0" />
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right font-mono text-muted-foreground text-[10px]">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filtres */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-2 shrink-0">
            <button
              type="button"
              onClick={() => setReviewsFilter("all")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                reviewsFilter === "all" ? "bg-primary text-primary-foreground font-bold shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              Tous ({allReviews.length})
            </button>
            {[5, 4, 3].map((star) => {
              const count = allReviews.filter((r) => r.rating === star).length;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewsFilter(star)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1",
                    reviewsFilter === star ? "bg-gold text-black font-bold shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <Star size={10} className="fill-current" /> {star}★ ({count})
                </button>
              );
            })}
          </div>

          {/* Liste complète des avis */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 pretty-scroll mt-1">
            {loadingReviews ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 size={24} className="animate-spin text-primary" />
                <span className="text-xs">Chargement des avis...</span>
              </div>
            ) : filteredReviews.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                Aucun avis correspondant dans cette catégorie.
              </div>
            ) : (
              filteredReviews.map((r) => (
                <div key={r.id} className="p-3.5 rounded-2xl border border-border/70 bg-card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{r.clientName ?? "Cliente"}</p>
                        {r.clientPhone && (
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {r.clientPhone}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {r.serviceName ? `Soin : ${r.serviceName}` : ""}
                        {r.practitionerName ? ` · avec ${r.practitionerName}` : ""}
                        {r.appointmentDate ? ` · RDV du ${formatDate(r.appointmentDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0" role="img" aria-label={`Note ${r.rating} sur 5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={13} className={cn(i < r.rating ? "fill-gold text-gold" : "text-border")} />
                      ))}
                    </div>
                  </div>

                  {r.comment ? (
                    <p className="text-xs text-foreground/90 bg-muted/40 p-2.5 rounded-xl italic leading-relaxed">
                      « {r.comment} »
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">Note sans commentaire écrit.</p>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                    <span className="font-mono text-[10px]">Avis déposé le {formatDate(r.createdAt)}</span>
                    {r.clientPhone && (
                      <a
                        href={waLink(
                          r.clientPhone,
                          `Bonjour ${r.clientName} 👋 Merci infiniment pour votre avis (${r.rating}★) sur votre soin chez ${data?.tenant?.name} ! Au plaisir de vous accueillir à nouveau.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] font-semibold transition-colors active:scale-95"
                      >
                        <MessageCircle size={12} />
                        <span>Remercier sur WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
