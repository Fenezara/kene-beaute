"use client";
// Kènè — Console Admin · Vue d'ensemble (t. 128: extraite d'AdminApp,
// comportement inchangé): KPIs plateforme, courbe diagnostics 14 j,
// top instituts par CA 30 j.
import { Activity, Building2, CreditCard, HeartHandshake, ReceiptText, ShoppingBag, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { useApi } from "@/components/kene/pro/useApi";
import { EmptyState, KpiCard, Money, dayLabel } from "@/components/kene/pro/ui-bits";
import type { AdminStats } from "@/components/kene/pro/types";

export function AdminOverview({ stats }: { stats: ReturnType<typeof useApi<AdminStats>> }) {
  const data = stats.data;
  if (!data) return null;

  const chartData = data.chart.map((c) => ({ ...c, label: dayLabel(c.date) }));
  const maxCa = Math.max(1, ...data.topTenants.map((t) => t.ca30));

  return (
    <div className="space-y-5">
      {/* KPIs — t. 135: la monétisation rejoint la vue d'ensemble (MRR simulé,
          fallbacks 0: le cache mémoire peut servir un snapshot antérieur). */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard icon={<Users className="size-4" />} label="Utilisatrices" value={String(data.users)} monetary={false} />
        <KpiCard icon={<HeartHandshake className="size-4" />} label="Parrainages" value={String(data.referrals)} monetary={false} hint="Fil du Parrainage" />
        <KpiCard icon={<Building2 className="size-4" />} label="Instituts" value={String(data.tenants)} monetary={false} />
        <KpiCard icon={<Activity className="size-4" />} label="Diagnostics IA" value={String(data.diagnoses)} monetary={false} />
        <KpiCard icon={<ShoppingBag className="size-4" />} label="Commandes boutique" value={String(data.orders)} monetary={false} />
        <KpiCard icon={<ReceiptText className="size-4" />} label="GMV boutique" value={xof(data.gmvBoutique, { compact: true })} hint={`Commissions : ${xof(data.commissionTotal, { compact: true })}`} />
        <KpiCard icon={<CreditCard className="size-4" />} label="Revenus abonnements" value={xof(data.subsMrrFcfa ?? 0, { compact: true })} hint={`${data.activeSubs ?? 0} abonnée${(data.activeSubs ?? 0) > 1 ? "s" : ""} · simulation`} />
      </div>

      {/* Chart */}
      <Card className="overflow-hidden pt-0">
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
    </div>
  );
}
