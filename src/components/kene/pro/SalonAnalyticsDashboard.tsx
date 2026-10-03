// Kènè Pro — Tableau de Bord Financier & KPIs Salon
// Visualisation avancée du Chiffre d'Affaires, digitalisation Mobile Money,
// panier moyen, taux d'occupation des cabines et exports SYSCOHADA.
"use client";

import { useMemo } from "react";
import {
  Banknote,
  Coins,
  TrendingUp,
  Percent,
  CalendarCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Sparkles,
  ArrowUpRight,
  CreditCard,
  Smartphone,
  ShieldCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { xof, formatDate } from "@/lib/kene/format";
import type { ProOverview } from "./types";
import { dayLabel, KenteTop } from "./ui-bits";

const PAYMENT_COLORS: Record<string, string> = {
  winipayer: "#10B981",
  wave: "#1DC8FF",
  orange: "#FF7900",
  mtn: "#FFCC00",
  moov: "#005BA6",
  cash: "#C8951E",
  card: "#3F7D3F",
  wallet: "#8B1A3B",
};

const PAYMENT_LABELS: Record<string, string> = {
  winipayer: "WiniPayer (Multi-opérateurs)",
  wave: "Wave Mobile Money",
  orange: "Orange Money",
  mtn: "MTN MoMo",
  moov: "Moov Money",
  cash: "Espèces (Caisse)",
  card: "Carte Bancaire",
  wallet: "Compte Kènè",
};

export function SalonAnalyticsDashboard({
  tenantId,
  data,
}: {
  tenantId: string;
  data: ProOverview;
}) {
  const k = data.kpis;

  // Calcul du taux de digitalisation des paiements (Mobile Money + Carte / Total)
  const pieData = useMemo(() => {
    return data.paymentSplit.map((p) => ({
      name: PAYMENT_LABELS[p.method] ?? p.method,
      value: p.total,
      key: p.method,
      color: PAYMENT_COLORS[p.method] ?? "#8884d8",
    }));
  }, [data.paymentSplit]);

  const totalPayments = useMemo(() => pieData.reduce((s, p) => s + p.value, 0), [pieData]);

  const digitalPayments = useMemo(() => {
    return pieData
      .filter((p) => p.key === "wave" || p.key === "orange" || p.key === "card" || p.key === "wallet")
      .reduce((s, p) => s + p.value, 0);
  }, [pieData]);

  const cashPayments = useMemo(() => {
    return pieData.filter((p) => p.key === "cash").reduce((s, p) => s + p.value, 0);
  }, [pieData]);

  const digitalRate = totalPayments > 0 ? Math.round((digitalPayments / totalPayments) * 100) : 0;

  const chartData = useMemo(() => {
    return data.chart.map((c) => ({
      ...c,
      label: dayLabel(c.date),
    }));
  }, [data.chart]);

  return (
    <div className="space-y-6">
      {/* ── En-tête & Exports SYSCOHADA ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-lg font-bold">Pilotage Financier & Performance</h3>
            <Badge variant="outline" className="border-gold/40 text-gold-text text-[10px] uppercase font-bold">
              SYSCOHADA
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ventilation des encaissements, rentabilité cabine et traçabilité de caisse.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/pro/accounting/csv?tenantId=${tenantId}&period=current_month`, "_blank")}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            Journal des ventes (CSV)
          </Button>
          <Button
            size="sm"
            onClick={() => window.open(`/api/pro/accounting/pdf?tenantId=${tenantId}&period=current_month`, "_blank")}
            className="h-8 gap-1.5 text-xs font-semibold bg-gold hover:bg-gold-dark text-white"
          >
            <FileText className="size-3.5" />
            Liasse SYSCOHADA (PDF)
          </Button>
        </div>
      </div>

      {/* ── Cartes KPIs Financières Principales ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CA du Jour */}
        <Card className="relative overflow-hidden border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CA du Jour</span>
              <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold-text">
                <Banknote className="size-5" />
              </span>
            </div>
            <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-foreground">{xof(k.caToday)}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>7 derniers jours :</span>
              <span className="font-mono font-semibold">{xof(k.ca7d)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>30 derniers jours :</span>
              <span className="font-mono font-semibold">{xof(k.ca30d)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Part Mobile Money vs Cash */}
        <Card className="relative overflow-hidden border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Digitalisation Caisse</span>
              <span className="grid size-9 place-items-center rounded-xl bg-[#1DC8FF]/15 text-[#008BB5]">
                <Smartphone className="size-5" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="font-mono text-2xl font-bold tracking-tight text-foreground">{digitalRate} %</p>
              <span className="text-xs text-muted-foreground">en digital</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Mobile Money & CB :</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{xof(digitalPayments)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Espèces physiques :</span>
              <span className="font-mono font-semibold text-gold-text">{xof(cashPayments)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Panier Moyen */}
        <Card className="relative overflow-hidden border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Panier Moyen</span>
              <span className="grid size-9 place-items-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <Coins className="size-5" />
              </span>
            </div>
            <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-foreground">{xof(k.avgBasket)}</p>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Valeur moyenne par passage cliente en caisse et sur l&apos;application.
            </p>
          </CardContent>
        </Card>

        {/* Taux d'Occupation Cabines */}
        <Card className="relative overflow-hidden border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Occupation Cabines</span>
              <span className="grid size-9 place-items-center rounded-xl bg-success/15 text-success">
                <CalendarCheck className="size-5" />
              </span>
            </div>
            <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-foreground">{k.occupancyPct} %</p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>RDV aujourd&apos;hui :</span>
              <span className="font-mono font-semibold">{k.appointmentsToday} cabine(s)</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Nouvelles clientes (30j) :</span>
              <span className="font-mono font-semibold">+{k.newClients30d}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Graphiques : Évolution du CA & Répartition des paiements ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Évolution Quotidienne du CA (2 colonnes) */}
        <Card className="lg:col-span-2 overflow-hidden">
          <KenteTop />
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading font-bold flex items-center gap-2">
              <TrendingUp className="size-4 text-gold" />
              Chiffre d&apos;Affaires Quotidien (14 derniers jours)
            </CardTitle>
            <CardDescription className="text-xs">
              Recettes journalières consolidées (Soins cabine + Boutique en FCFA).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis dataKey="label" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                    formatter={(val: number) => [`${xof(val)}`, "Chiffre d'Affaires"]}
                  />
                  <Bar dataKey="total" fill="var(--color-gold, #C8951E)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Répartition des encaissements (Donut Chart) */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading font-bold flex items-center gap-2">
              <CreditCard className="size-4 text-blue-500" />
              Canaux d&apos;Encaissement
            </CardTitle>
            <CardDescription className="text-xs">
              Ventilation par méthode de règlement.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                    formatter={(val: number) => [`${xof(val)}`, "Total"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Légende détaillée */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              {pieData.map((p) => {
                const pct = totalPayments > 0 ? Math.round((p.value / totalPayments) * 100) : 0;
                return (
                  <div key={p.key} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="truncate text-muted-foreground">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono">
                      <span>{xof(p.value)}</span>
                      <span className="text-[10px] text-muted-foreground w-7 text-right">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Top Soins du Salon ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading font-bold flex items-center gap-2">
            <Sparkles className="size-4 text-gold" />
            Soins Stars & Rentabilité des Prestations
          </CardTitle>
          <CardDescription className="text-xs">
            Volume de rendez-vous honorés et chiffre d&apos;affaires généré.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {data.topServices.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground text-center">Aucun soin enregistré sur la période.</p>
            ) : (
              data.topServices.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="grid size-7 place-items-center rounded-lg bg-gold/15 font-mono text-xs font-bold text-gold-text shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.count} prestation(s) réalisée(s)</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold text-foreground">{xof(s.total)}</p>
                    <p className="text-[10px] text-muted-foreground">CA généré</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
