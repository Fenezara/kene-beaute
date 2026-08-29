"use client";
// Kènè — Console Admin : KPIs plateforme, diagnostics IA/jour, top instituts
import { Activity, Building2, ReceiptText, ShieldCheck, ShoppingBag, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { useApi } from "@/components/kene/pro/useApi";
import { EmptyState, ErrorState, KpiCard, KenteTop, Money, dayLabel } from "@/components/kene/pro/ui-bits";
import type { AdminStats } from "@/components/kene/pro/types";

export function AdminApp() {
  const stats = useApi<AdminStats>(() => apiGet<AdminStats>("/api/admin/stats"), []);

  if (stats.error && !stats.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <ConsoleHeader />
        <ErrorState message={`Console indisponible : ${stats.error}`} onRetry={stats.refetch} />
      </div>
    );
  }

  if (stats.loading && !stats.data) {
    return (
      <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 space-y-5">
        <ConsoleHeader />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const data = stats.data;
  if (!data) return null;

  const chartData = data.chart.map((c) => ({ ...c, label: dayLabel(c.date) }));
  const maxCa = Math.max(1, ...data.topTenants.map((t) => t.ca30));

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 space-y-5 min-h-[calc(100vh-8rem)]">
      <ConsoleHeader />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard icon={<Users className="size-4" />} label="Utilisatrices" value={String(data.users)} monetary={false} />
        <KpiCard icon={<Building2 className="size-4" />} label="Instituts" value={String(data.tenants)} monetary={false} />
        <KpiCard icon={<Activity className="size-4" />} label="Diagnostics IA" value={String(data.diagnoses)} monetary={false} />
        <KpiCard icon={<ShoppingBag className="size-4" />} label="Commandes boutique" value={String(data.orders)} monetary={false} />
        <KpiCard icon={<ReceiptText className="size-4" />} label="GMV boutique" value={xof(data.gmvBoutique, { compact: true })} hint={`Commissions : ${xof(data.commissionTotal, { compact: true })}`} />
      </div>

      {/* Chart */}
      <Card className="overflow-hidden pt-0">
        <KenteTop />
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">Diagnostics IA par jour — 14 derniers jours</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {chartData.length === 0 ? (
            <EmptyState label="Aucun diagnostic sur la période" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--foreground)", fontSize: "12px" }}
                  formatter={(value) => [String(value), "Diagnostics"]}
                />
                <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--chart-1)" }} activeDot={{ r: 5 }} />
              </LineChart>
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

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        POC — données de démonstration · Commission plateforme 5 % sur la boutique Kènè
      </p>
    </div>
  );
}

function ConsoleHeader() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div aria-hidden="true" className="kente-band h-1.5 w-full" />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">Console Kènè</h2>
          <p className="text-sm text-muted-foreground">Pilotage de la plateforme — instituts, IA diagnostic, marketplace</p>
        </div>
        <Badge className="bg-finance/15 text-finance border border-finance/30 hover:bg-finance/15">Espace administrateur</Badge>
      </div>
    </div>
  );
}
