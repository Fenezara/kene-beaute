"use client";
// Kènè Pro — Paie: exécution mensuelle (CNPS CI / IPRES SN), bulletins
// imprimables, e-CNPS. Le registre du personnel vit dans la section Équipe.
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Download,
  FileText,
  Printer,
  Scale,
  Users,
} from "lucide-react";
import { CauriIcon } from "@/components/kene/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof, formatDate } from "@/lib/kene/format";
import type { PayrollLine } from "@/lib/payroll";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, KenteTop, Money, SectionHeader } from "./ui-bits";
import type { ProPayPeriod, ProPayslip, PayrollResponse, PayslipDetails } from "./types";

const ROLE_LABELS: Record<string, string> = {
  estheticienne: "Esthéticienne",
  dermo_conseillere: "Dermo-conseillère",
  caissiere: "Caissière",
  manager: "Manager",
};

function parseDetails(ps: ProPayslip): PayslipDetails {
  try {
    const d = JSON.parse(ps.detailsJson) as PayslipDetails;
    return { ...d, lines: Array.isArray(d.lines) ? d.lines : [] };
  } catch {
    return { lines: [] as PayrollLine[] };
  }
}

export function PayrollSection({
  tenantId,
  tenantName,
  onNavigate,
}: {
  tenantId: string;
  defaultCountry: string;
  tenantName: string;
  onNavigate: (s: "equipe") => void;
}) {
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [running, setRunning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payslip, setPayslip] = useState<{ slip: ProPayslip; periodLabel: string } | null>(null);

  const payroll = useApi<PayrollResponse>(
    () => (tenantId ? apiGet<PayrollResponse>(`/api/pro/payroll?tenantId=${tenantId}`) : Promise.resolve({ payPeriods: [] })),
    [tenantId]
  );

  const commissionsApi = useApi<{
    period: string;
    periodLabel: string;
    practitioners: Array<{
      employeeId: string;
      name: string;
      role: string;
      servicesRevenue: number;
      servicesCount: number;
      serviceCommissionRate: number;
      serviceCommission: number;
      productsRevenue: number;
      productsCount: number;
      productCommissionRate: number;
      productCommission: number;
      totalCommission: number;
      salesCount: number;
    }>;
    unassigned: {
      salesCount: number;
      servicesRevenue: number;
      productsRevenue: number;
    };
    summary: {
      totalSalesCount: number;
      totalServicesRevenue: number;
      totalProductsRevenue: number;
      totalRevenue: number;
      totalCommissions: number;
    };
  }>(
    () => (tenantId ? apiGet<any>(`/api/pro/payroll/commissions?tenantId=${tenantId}&period=${period}`) : Promise.resolve(null)),
    [tenantId, period]
  );

  const periods = payroll.data?.payPeriods ?? [];
  const latest = periods.length > 0 ? periods.reduce((a, b) => (a.period > b.period ? a : b)) : null;
  const kpis = useMemo(() => {
    const p = periods.find((x) => x.id === expandedId) ?? latest;
    const slips = p?.payslips ?? [];
    return {
      period: p?.period ?? "—",
      masseBrute: slips.reduce((s, x) => s + x.grossSalary, 0),
      patronales: slips.reduce((s, x) => s + x.cnpsEmployer, 0),
      salariees: slips.reduce((s, x) => s + x.cnpsEmployee, 0),
      igr: slips.reduce((s, x) => s + x.incomeTax + x.cn, 0),
      net: slips.reduce((s, x) => s + x.netSalary, 0),
      count: slips.length,
    };
  }, [periods, expandedId, latest]);

  async function runPayroll() {
    setRunning(true);
    try {
      await apiPost("/api/pro/payroll/run", { tenantId, period });
      toast.success(`Paie ${period} générée`, { description: "Bulletins calculés (CNPS/IPRES) et écriture PA journalisée." });
      await payroll.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Exécution impossible");
    } finally {
      setRunning(false);
    }
  }

  async function downloadEcnps(p: ProPayPeriod) {
    try {
      const res = await fetch(`/api/pro/payroll/ecnps?tenantId=${tenantId}&period=${p.period}`);
      if (!res.ok) throw new Error(`Export impossible (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ecnps-${p.period}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Déclaration e-CNPS téléchargée", { description: `Fichier ecnps-${p.period}.xml` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export e-CNPS impossible");
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Paie"
        sub="Exécution mensuelle et bulletins conformes CNPS CI / IPRES SN"
      />

      {/* ── Pont vers la section Équipe ── */}
      <Card className="overflow-hidden pt-0">
        <KenteTop />
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold" aria-hidden="true">
            <Users className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-bold">Embaucher, pointer, modifier une fiche ?</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Le registre du personnel, les pointages et les comptes app vivent dans la section Équipe.
            </p>
          </div>
          <Button variant="outline" className="gap-1.5" onClick={() => onNavigate("equipe")}>
            Gérer l&apos;équipe <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </CardContent>
      </Card>

      {/* ── Exécution paie ── */}
      <section aria-label="Exécution de la paie" className="space-y-3">
        <h3 className="font-heading text-base font-bold flex items-center gap-2">
          <Scale className="size-4 text-primary" aria-hidden="true" /> Exécution de la paie
        </h3>
        <Card className="overflow-hidden pt-0">
          <KenteTop />
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="pay-period" className="text-xs">Mois de paie</Label>
                <Input id="pay-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-card w-44" />
              </div>
              <Button disabled={running || !period} onClick={runPayroll} className="gap-1.5 font-semibold">
                <Banknote className="size-4" aria-hidden="true" /> {running ? "Calcul en cours…" : "Générer la paie du mois"}
              </Button>
              <p className="text-[11px] text-muted-foreground flex-1 min-w-52">
                Calcule cotisations CNPS/IPRES, IGR/IR, CN — journalise l&apos;écriture PA (SYSCOHADA). Une période déjà validée ne peut être recalculée.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Masse brute", value: kpis.masseBrute },
                { label: "Cotis. patronales", value: kpis.patronales },
                { label: "Cotis. salariés", value: kpis.salariees },
                { label: "IGR / IR + CN", value: kpis.igr },
                { label: "Net à payer", value: kpis.net, strong: true },
              ].map((k) => (
                <div key={k.label} className={cn("rounded-xl border border-border bg-card p-3", k.strong && "border-gold/40 bg-gold/5")}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
                  <Money value={k.value} className={cn("text-sm font-semibold", k.strong && "text-gold text-base")} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Totaux de la période <span className="font-mono font-semibold text-foreground">{kpis.period}</span> ({kpis.count} bulletin{kpis.count > 1 ? "s" : ""}).
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Commissions Praticiennes & Ventes Boutique ── */}
      <section aria-label="Commissions Praticiennes" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-base font-bold flex items-center gap-2">
            <CauriIcon className="size-4 text-gold-text" aria-hidden="true" /> Commissions Praticiennes &amp; Ventes Boutique ({period})
          </h3>
          <Badge variant="outline" className="text-xs font-semibold bg-gold/10 text-gold-text border-gold/30">
            10% Soins · 5% Cosmétiques
          </Badge>
        </div>
        <Card className="overflow-hidden pt-0">
          <KenteTop />
          <CardContent className="p-4 space-y-4">
            {/* KPI Commissions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CA Soins Cabine</p>
                <Money value={commissionsApi.data?.summary.totalServicesRevenue ?? 0} className="text-sm font-semibold" />
                <p className="text-[9px] text-muted-foreground mt-0.5">Prime 10% appliquée</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CA Boutique Cosmétique</p>
                <Money value={commissionsApi.data?.summary.totalProductsRevenue ?? 0} className="text-sm font-semibold" />
                <p className="text-[9px] text-muted-foreground mt-0.5">Prime 5% appliquée</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CA Global Attribué</p>
                <Money value={commissionsApi.data?.summary.totalRevenue ?? 0} className="text-sm font-semibold text-foreground" />
                <p className="text-[9px] text-muted-foreground mt-0.5">{commissionsApi.data?.summary.totalSalesCount ?? 0} encaissement(s)</p>
              </div>
              <div className="rounded-xl border border-gold/40 bg-gold/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Primes Praticiennes</p>
                <Money value={commissionsApi.data?.summary.totalCommissions ?? 0} className="text-base font-bold text-gold-text" />
                <p className="text-[9px] text-gold-text/80 mt-0.5">À verser avec le salaire</p>
              </div>
            </div>

            {/* Tableau par Praticienne */}
            {(commissionsApi.data?.practitioners ?? []).length === 0 ? (
              <EmptyState label="Aucune donnée de commission" sub="Attribuez les praticiennes en caisse pour générer les primes." />
            ) : (
              <div className="rounded-xl border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-semibold">Praticienne</TableHead>
                      <TableHead className="text-xs text-right font-semibold">Soins Réalisés</TableHead>
                      <TableHead className="text-xs text-right font-semibold">CA Soins</TableHead>
                      <TableHead className="text-xs text-right text-primary font-bold">Com. Soins (10%)</TableHead>
                      <TableHead className="text-xs text-right font-semibold">Produits Vendus</TableHead>
                      <TableHead className="text-xs text-right font-semibold">CA Boutique</TableHead>
                      <TableHead className="text-xs text-right text-primary font-bold">Com. Vente (5%)</TableHead>
                      <TableHead className="text-xs text-right font-black text-gold-text">TOTAL PRIME</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionsApi.data?.practitioners.map((pr) => (
                      <TableRow key={pr.employeeId}>
                        <TableCell>
                          <p className="font-semibold text-xs">{pr.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{ROLE_LABELS[pr.role] ?? pr.role}</p>
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">{pr.servicesCount}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{xof(pr.servicesRevenue)}</TableCell>
                        <TableCell className="text-right text-xs font-mono font-bold text-primary">{xof(pr.serviceCommission)}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{pr.productsCount}</TableCell>
                        <TableCell className="text-right text-xs font-mono">{xof(pr.productsRevenue)}</TableCell>
                        <TableCell className="text-right text-xs font-mono font-bold text-primary">{xof(pr.productCommission)}</TableCell>
                        <TableCell className="text-right text-xs font-mono font-black text-gold-text">{xof(pr.totalCommission)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── c) Bulletins ── */}
      <section aria-label="Bulletins de paie" className="space-y-3">
        <h3 className="font-heading text-base font-bold flex items-center gap-2">
          <FileText className="size-4 text-primary" aria-hidden="true" /> Périodes & bulletins
        </h3>
        {payroll.error && !payroll.data ? (
          typeof navigator !== "undefined" && !navigator.onLine ? (
            <Card className="p-8 text-center space-y-3">
              <EmptyState
                label="Paie hors-ligne"
                sub="Les bulletins et périodes de paie n'ont pas encore été synchronisés sur cet appareil. Vos données s'afficheront dès la reconnexion."
              />
              <Button onClick={payroll.refetch} variant="outline" className="text-xs">
                Réessayer la connexion
              </Button>
            </Card>
          ) : (
            <ErrorState message={`Paie indisponible : ${payroll.error}`} onRetry={payroll.refetch} />
          )
        ) : payroll.loading && !payroll.data ? (
          <Skeleton className="h-48" />
        ) : periods.length === 0 ? (
          <EmptyState label="Aucune période de paie" sub="Générez la paie du mois pour créer les bulletins." />
        ) : (
          <div className="space-y-2.5">
            {periods.map((p) => {
              const open = expandedId === p.id;
              return (
                <Card key={p.id} className="overflow-hidden">
                  <button
                    onClick={() => setExpandedId(open ? null : p.id)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
                  >
                    <span className="font-mono text-sm font-semibold">{p.period}</span>
                    <Badge variant="outline" className="text-[10px] font-mono bg-muted">{p.country}</Badge>
                    <Badge variant="outline" className={cn("text-[10px]", p.status === "validated" ? "bg-success/15 text-success border-success/30" : "bg-gold/15 text-gold border-gold/30")}>
                      {p.status === "validated" ? "Validée" : "Ouverte"}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{p.payslips.length} bulletins</span>
                    {p.country === "CI" && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadEcnps(p);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            void downloadEcnps(p);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-finance/40 px-2 py-1 text-[10px] font-medium text-finance hover:bg-finance/10"
                      >
                        <Download className="size-3" aria-hidden="true" /> e-CNPS XML
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
                  </button>
                  {open && (
                    <div className="border-t border-border/70">
                      <div className="overflow-x-auto pretty-scroll">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employé</TableHead>
                              <TableHead className="text-right">Brut</TableHead>
                              <TableHead className="text-right hidden sm:table-cell">CNPS/IPRES sal.</TableHead>
                              <TableHead className="text-right hidden sm:table-cell">IGR / IR</TableHead>
                              <TableHead className="text-right hidden md:table-cell">CN</TableHead>
                              <TableHead className="text-right">NET à payer</TableHead>
                              <TableHead className="text-right">Bulletin</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {p.payslips.map((slip) => (
                              <TableRow key={slip.id}>
                                <TableCell>
                                  <p className="text-sm font-medium">{slip.employee.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[slip.employee.role] ?? slip.employee.role}</p>
                                </TableCell>
                                <TableCell className="text-right"><Money value={slip.grossSalary} className="text-xs" /></TableCell>
                                <TableCell className="text-right hidden sm:table-cell"><Money value={slip.cnpsEmployee} className="text-xs" /></TableCell>
                                <TableCell className="text-right hidden sm:table-cell"><Money value={slip.incomeTax} className="text-xs" /></TableCell>
                                <TableCell className="text-right hidden md:table-cell"><Money value={slip.cn} className="text-xs" /></TableCell>
                                <TableCell className="text-right"><Money value={slip.netSalary} className="text-xs font-bold text-gold" /></TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => setPayslip({ slip, periodLabel: p.period })}>
                                    <FileText className="size-3.5" aria-hidden="true" /> Voir
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {p.country === "SN" && (
                        <p className="border-t border-border/70 px-4 py-2 text-[11px] text-muted-foreground">
                          Note : déclaration IPRES (Sénégal) — les taux cadres / non-cadres IPM sont appliqués automatiquement selon le statut de chaque employée.
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Bulletin A4 ── */}
      {payslip && <PayslipDialog slip={payslip.slip} periodLabel={payslip.periodLabel} tenantName={tenantName} country={latestCountry(payslip.slip)} onClose={() => setPayslip(null)} />}
    </div>
  );
}

function latestCountry(slip: ProPayslip): string {
  // le régime est dérivable du détails (CNPS=CI / IPRES=SN)
  return parseDetails(slip).regime?.includes("IPRES") || parseDetails(slip).regime?.includes("IPM") ? "SN" : "CI";
}

// ═════════════ Bulletin A4 imprimable ═════════════
function PayslipDialog({ slip, periodLabel, tenantName, country, onClose }: { slip: ProPayslip; periodLabel: string; tenantName: string; country: string; onClose: () => void }) {
  const details = parseDetails(slip);
  const totalRetenues = details.lines.find((l) => l.libelle === "Total retenues")?.retenue ?? slip.cnpsEmployee + slip.incomeTax + slip.cn;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto pretty-scroll">
        <DialogHeader className="sr-only">
          <DialogTitle>Bulletin de paie — {slip.employee.name}</DialogTitle>
          <DialogDescription>Bulletin détaillé imprimable</DialogDescription>
        </DialogHeader>

        <div className="print-area max-w-[720px] mx-auto bg-white text-black shadow-md rounded-sm p-6 sm:p-8 text-[12px]">
          {/* En-tête */}
          <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
            <div>
              <p className="font-heading font-bold text-base uppercase">{tenantName}</p>
              <p className="text-[10px] text-black/70">Gestion esthétique & bien-être — Kènè Pro</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">BULLETIN DE PAIE</p>
              <p className="font-mono text-[11px]">Période : {periodLabel}</p>
            </div>
          </div>

          {/* Employé */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-black/40 py-3 text-[11px]">
            <p><span className="font-semibold">Salarié :</span> {slip.employee.name}</p>
            <p><span className="font-semibold">Fonction :</span> {ROLE_LABELS[slip.employee.role] ?? slip.employee.role}</p>
            <p><span className="font-semibold">Matricule {country === "SN" ? "IPRES" : "CNPS"} :</span> <span className="font-mono">{slip.employee.cnpsNumber ?? "EN ATTENTE"}</span></p>
            <p><span className="font-semibold">Régime :</span> {details.regime ?? (country === "SN" ? "IPM + IPRES + IR (Sénégal)" : "CNPS Côte d'Ivoire + IGR + CN")}</p>
          </div>

          {/* Lignes */}
          <table className="w-full mt-3 border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-black/60 text-left">
                <th className="py-1.5 font-semibold">Libellé</th>
                <th className="py-1.5 font-semibold text-right">Base</th>
                <th className="py-1.5 font-semibold text-right">Taux</th>
                <th className="py-1.5 font-semibold text-right">Gains</th>
                <th className="py-1.5 font-semibold text-right">Retenues</th>
              </tr>
            </thead>
            <tbody>
              {details.lines.map((l, i) => {
                const isTotal = l.libelle === "Total retenues";
                const isNet = l.libelle === "NET À PAYER";
                return (
                  <tr key={i} className={cn("border-b border-black/15", (isTotal || isNet) && "font-bold", isNet && "text-[12px]")}>
                    <td className="py-1.5">{l.libelle}{l.employeur ? <span className="text-black/55 font-normal"> (part employeur : {xof(l.employeur)})</span> : ""}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{l.base ? l.base.toLocaleString("fr-FR") : ""}</td>
                    <td className="py-1.5 text-right">{l.taux ?? ""}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{l.gain ? l.gain.toLocaleString("fr-FR") : ""}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{l.retenue ? l.retenue.toLocaleString("fr-FR") : ""}</td>
                  </tr>
                );
              })}
              {details.lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-black/60">Détail indisponible — totaux affichés ci-dessous.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Cumuls */}
          <div className="mt-4 ml-auto w-full sm:w-80 space-y-1 text-[12px]">
            <div className="flex justify-between border-b border-black/30 py-1">
              <span className="font-semibold">Salaire brut</span>
              <span className="font-mono font-bold tabular-nums">{xof(slip.grossSalary)}</span>
            </div>
            <div className="flex justify-between border-b border-black/30 py-1">
              <span className="font-semibold">Total retenues</span>
              <span className="font-mono font-bold tabular-nums">{xof(totalRetenues || 0)}</span>
            </div>
            <div className="flex justify-between bg-black/5 rounded px-2 py-2 mt-1">
              <span className="font-heading font-bold text-sm">NET À PAYER</span>
              <span className="font-mono font-bold text-base tabular-nums">{xof(slip.netSalary)}</span>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-black/60 text-right">
            Coût employeur total : <span className="font-mono">{xof(slip.grossSalary + slip.cnpsEmployer)}</span> (dont part patronale <span className="font-mono">{xof(slip.cnpsEmployer)}</span>)
          </p>

          {/* Pied */}
          <div className="mt-6 border-t border-dashed border-black/50 pt-3 text-center text-[10px] text-black/70">
            <p>Conforme CNPS CI / IPM SN — généré par Kènè</p>
            <p className="font-mono mt-0.5">Édité le {formatDate(new Date())} · Kènè Pro</p>
          </div>
        </div>

        <Button onClick={() => window.print()} className="mx-auto mt-4 gap-2 font-semibold" size="lg">
          <Printer className="size-4" aria-hidden="true" /> Imprimer le bulletin
        </Button>
      </DialogContent>
    </Dialog>
  );
}
