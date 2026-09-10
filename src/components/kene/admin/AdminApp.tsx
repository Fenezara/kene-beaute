"use client";
// Kènè — Console Admin : KPIs plateforme, diagnostics IA/jour, top instituts
// + « Posture sécurité » (t. 86-d) : journal d'audit OTP/connexions + verrouillages.
import { Activity, AlertTriangle, Building2, HeartHandshake, ReceiptText, RefreshCw, ShieldCheck, ShoppingBag, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/kene/api";
import { xof, formatDate } from "@/lib/kene/format";
import { cn } from "@/lib/utils";
import { useApi, type UseApiResult } from "@/components/kene/pro/useApi";
import { EmptyState, ErrorState, KpiCard, KenteTop, Money, dayLabel } from "@/components/kene/pro/ui-bits";
import type { AdminSecurity, AdminStats } from "@/components/kene/pro/types";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { KeneEmblem } from "@/components/kene/icons";

export function AdminApp() {
  const stats = useApi<AdminStats>(() => apiGet<AdminStats>("/api/admin/stats"), []);
  // t. 86-d : journal sécurité — hook séparé, la carte gère SES états (erreur
  // inline, vide, chargement) sans jamais toucher au rendu des KPIs existants.
  const sec = useApi<AdminSecurity>(() => apiGet<AdminSecurity>("/api/admin/security"), []);

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
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 space-y-5 min-h-screen">
      <ConsoleHeader />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={<Users className="size-4" />} label="Utilisatrices" value={String(data.users)} monetary={false} />
        <KpiCard icon={<HeartHandshake className="size-4" />} label="Parrainages" value={String(data.referrals)} monetary={false} hint="Fil du Parrainage" />
        <KpiCard icon={<Building2 className="size-4" />} label="Instituts" value={String(data.tenants)} monetary={false} />
        <KpiCard icon={<Activity className="size-4" />} label="Diagnostics IA" value={String(data.diagnoses)} monetary={false} />
        <KpiCard icon={<ShoppingBag className="size-4" />} label="Commandes boutique" value={String(data.orders)} monetary={false} />
        <KpiCard icon={<ReceiptText className="size-4" />} label="GMV boutique" value={xof(data.gmvBoutique, { compact: true })} hint={`Commissions : ${xof(data.commissionTotal, { compact: true })}`} />
      </div>

      {/* Posture sécurité (t. 86-d) — journal d'audit + verrouillages */}
      <SecurityCard sec={sec} />

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

// ─────────────── Posture sécurité (t. 86-d) ───────────────
// Kind → libellé FR lisible + pastille couleur (tokens shadcn : succès vert
// Baobab, échecs/verrous bordeaux Bissap, demande de code or profond, le
// reste en sobre muted). Zéro nouvelle dépendance.
const SEC_KINDS: Record<string, { label: string; cls: string }> = {
  login_success: { label: "Connexion réussie", cls: "bg-success/15 text-success" },
  login_failed: { label: "Code erroné", cls: "bg-bissap/15 text-bissap" },
  login_locked: { label: "Compte verrouillé", cls: "bg-bissap/15 text-bissap" },
  otp_request: { label: "Code demandé", cls: "bg-primary/15 text-primary" },
  logout: { label: "Déconnexion", cls: "bg-muted text-muted-foreground" },
  payment_confirm: { label: "Paiement confirmé", cls: "bg-muted text-muted-foreground" },
  admin_access: { label: "Accès console", cls: "bg-muted text-muted-foreground" },
  pro_register: { label: "Inscription pro", cls: "bg-muted text-muted-foreground" },
  push_subscribe: { label: "Abonnement push", cls: "bg-muted text-muted-foreground" },
  upload_reject: { label: "Fichier rejeté", cls: "bg-muted text-muted-foreground" },
};

/** Heure FR compacte : « 16/08 14:32 » (— si date illisible). */
function secTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : formatDate(d, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function SecurityCard({ sec }: { sec: UseApiResult<AdminSecurity> }) {
  const d = sec.data;
  const loading = sec.loading && !d;
  const failed = d?.stats.failedLogins24h ?? 0;
  const locked = d?.stats.locked24h ?? 0;
  const indicators = [
    { label: "Événements 24 h", value: d?.stats.last24h ?? 0, warn: false },
    { label: "Échecs de connexion 24 h", value: failed, warn: failed > 0 },
    { label: "Verrouillages 24 h", value: locked, warn: locked > 0 },
    { label: "Total journal", value: d?.stats.total ?? 0, warn: false },
  ];

  return (
    <Card className="overflow-hidden pt-0">
      <KenteTop />
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-base">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          Posture sécurité
          <Badge variant="outline" className="font-mono text-[10px]">2026</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 4 indicateurs — sobre, alerte bordeaux seulement si > 0 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {indicators.map((i) => (
            <div key={i.label} className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] leading-tight text-muted-foreground">{i.label}</p>
              <p className={cn("mt-1 font-mono text-xl font-bold tabular-nums", i.warn ? "text-bissap" : "text-foreground")}>
                {loading ? "…" : i.value}
              </p>
            </div>
          ))}
        </div>

        {/* Journal — erreur inline (la carte reste debout), vide, ou liste */}
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
        ) : !d || d.events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Rien à signaler — le journal démarre avec la prochaine connexion
          </p>
        ) : (
          <ul
            role="list"
            aria-label="Journal de sécurité — événements les plus récents"
            className="max-h-80 divide-y divide-border/60 overflow-y-auto pretty-scroll"
          >
            {d.events.map((e) => {
              const k = SEC_KINDS[e.kind] ?? { label: e.kind, cls: "bg-muted text-muted-foreground" };
              return (
                <li role="listitem" key={e.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5">
                  <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ring-current/15", k.cls)}>
                    {k.label}
                  </span>
                  {e.phone && <span className="font-mono text-xs text-muted-foreground">{e.phone}</span>}
                  {e.ip && <span className="hidden font-mono text-[11px] text-muted-foreground/70 sm:inline">{e.ip}</span>}
                  {e.detail && (
                    <span className="hidden max-w-40 truncate text-[11px] text-muted-foreground/80 md:inline" title={e.detail}>{e.detail}</span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{secTime(e.ts)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ConsoleHeader() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div aria-hidden="true" className="kente-band h-1.5 w-full" />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {/* Sceau de marque (t. 86) — la console porte le Médaillon Kènè */}
          <span aria-hidden="true" className="shrink-0 select-none">
            <KeneEmblem size={56} className="drop-shadow-[0_2px_10px_rgba(200,149,30,0.22)]" />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-bold tracking-tight">Console Kènè</h2>
            <p className="text-sm text-muted-foreground">Pilotage de la plateforme — instituts, IA diagnostic, marketplace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-finance/15 text-finance border border-finance/30 hover:bg-finance/15">Espace administrateur</Badge>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
