"use client";
// Kènè Pro — Tableau de bord: KPIs, CA 14j, paiements, top soins, timeline du jour, alertes stock
import { useState } from "react";
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
  MessageCircle,
  Loader2,
  BarChart3,
  LayoutDashboard,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  Aucun avis pour l&apos;instant — ils arrivent dès que vos clientes notent leurs RDV depuis l&apos;app.
                </p>
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
