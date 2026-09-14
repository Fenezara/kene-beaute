"use client";
// Kènè Pro — Tableau de bord: KPIs, CA 14j, paiements, top soins, timeline du jour, alertes stock
import {
  Banknote,
  CalendarCheck,
  Percent,
  Sparkles,
  UserPlus,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Star,
  MessageSquareHeart,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { KpiCard, Money, ApptStatusBadge, EmptyState, ErrorState, KenteTop, dayLabel } from "./ui-bits";
import type { ProOverview } from "./types";
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
}) {
  const data = overview.data;

  if (overview.error && !data) {
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

  const k = data.kpis;
  const pieData = data.paymentSplit.map((p) => ({ name: PAYMENT_LABELS[p.method] ?? p.method, value: p.total, key: p.method }));
  const pieTotal = pieData.reduce((s, p) => s + p.value, 0);
  const chartData = data.chart.map((c) => ({ ...c, label: dayLabel(c.date) }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">Tableau de bord</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data.tenant.name} — {data.tenant.city} · vue temps réel de l&apos;activité
          </p>
        </div>
      </div>

      {/* ── KPI ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={<Banknote className="size-4" />} label="CA du jour" value={xof(k.caToday)} />
        <KpiCard icon={<TrendingUp className="size-4" />} label="CA 7 jours" value={xof(k.ca7d, { compact: true })} hint={`${xof(k.ca30d, { compact: true })} sur 30 j`} />
        <KpiCard icon={<Sparkles className="size-4" />} label="Panier moyen" value={xof(k.avgBasket)} />
        <KpiCard icon={<CalendarCheck className="size-4" />} label="RDV aujourd'hui" value={String(k.appointmentsToday)} monetary={false} />
        <KpiCard icon={<UserPlus className="size-4" />} label="Nouvelles clientes 30 j" value={String(k.newClients30d)} monetary={false} />
        <KpiCard icon={<Percent className="size-4" />} label="Occupation" value={`${Math.round(k.occupancyPct)} %`} monetary={false} />
      </div>

      {/* ── Graphiques ── */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 overflow-hidden pt-0">
          <KenteTop />
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">Chiffre d&apos;affaires — 14 derniers jours</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} tickLine={false} axisLine={false} width={38} />
                <Tooltip
                  cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                  contentStyle={tooltipStyle}
                  formatter={(value) => [xof(Number(value)), "CA"]}
                />
                <Bar dataKey="total" fill="var(--chart-1)" radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 overflow-hidden pt-0">
          <KenteTop />
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">Répartition des paiements</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex flex-col">
            {pieTotal > 0 ? (
              <>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={3} strokeWidth={0}>
                        {pieData.map((entry) => (
                          <Cell key={entry.key} fill={PAYMENT_COLORS[entry.key] ?? "var(--chart-3)"} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => xof(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {pieData.map((p) => (
                    <li key={p.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="size-2 rounded-full shrink-0" style={{ background: PAYMENT_COLORS[p.key] ?? "var(--chart-3)" }} aria-hidden="true" />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto font-mono text-foreground/80">{Math.round((p.value / pieTotal) * 100)} %</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState label="Aucun paiement enregistré" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Ligne 3: timeline + top soins ── */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden pt-0">
          <KenteTop />
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base">Timeline du jour</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.todayAppointments.length === 0 ? (
              <EmptyState label="Aucun rendez-vous aujourd'hui" sub="Créez un RDV depuis l'Agenda" />
            ) : (
              <ul className="max-h-80 overflow-y-auto pretty-scroll divide-y divide-border/70">
                {data.todayAppointments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors">
                    <span className="font-mono text-xs text-muted-foreground w-11 shrink-0 tabular-nums">{formatTime(a.startAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.clientName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.serviceName} · {a.resourceName}
                      </p>
                    </div>
                    <Money value={a.price} className="text-xs shrink-0" />
                    <ApptStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">Top soins vendus</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.topServices.length === 0 ? (
                <EmptyState label="Pas encore de ventes" />
              ) : (
                <ul className="divide-y divide-border/70">
                  {data.topServices.map((s, i) => (
                    <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="grid size-6 place-items-center rounded-md bg-gold/15 text-gold font-mono text-[11px] font-semibold" aria-hidden="true">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.count} prestation{s.count > 1 ? "s" : ""}</p>
                      </div>
                      <Money value={s.total} className="text-sm" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <MessageSquareHeart className="size-4 text-gold" aria-hidden="true" />
                Derniers avis clientes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!data.recentReviews || data.recentReviews.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  Aucun avis pour l&apos;instant — ils arrivent dès que vos clientes notent leurs RDV depuis l&apos;app.
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto pretty-scroll divide-y divide-border/70">
                  {data.recentReviews.map((r) => (
                    <li key={r.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{r.clientName}</p>
                        <span className="flex items-center gap-0.5 shrink-0" role="img" aria-label={`Note ${r.rating} sur 5`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={cn("size-3", i < r.rating ? "fill-gold text-gold" : "text-border")} aria-hidden="true" />
                          ))}
                        </span>
                      </div>
                      {r.comment ? <p className="mt-0.5 truncate text-xs text-muted-foreground">« {r.comment} »</p> : null}
                      <p className="mt-0.5 text-[10px] text-muted-foreground font-mono">
                        {r.serviceName ? `${r.serviceName} · ` : ""}{formatDate(r.createdAt)}
                      </p>
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
                <p className="text-sm text-muted-foreground">Tous les stocks sont au-dessus des seuils d&apos;alerte.</p>
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
    </div>
  );
}
