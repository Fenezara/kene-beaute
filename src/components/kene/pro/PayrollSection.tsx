"use client";
// Kènè Pro — Paie : employés, pointage du jour, exécution mensuelle (CNPS CI / IPRES SN), bulletins imprimables, e-CNPS
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Download,
  FileText,
  LogIn,
  LogOut,
  Plus,
  Printer,
  Scale,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof, formatDate } from "@/lib/kene/format";
import type { PayrollLine } from "@/lib/payroll";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, KenteTop, Money, SectionHeader } from "./ui-bits";
import type { EmployeesResponse, ProPayPeriod, ProPayslip, PayrollResponse, PayslipDetails } from "./types";

const ROLE_LABELS: Record<string, string> = {
  estheticienne: "Esthéticienne",
  dermo_conseillere: "Dermo-conseillère",
  caissiere: "Caissière",
  manager: "Manager",
};
const ROLES = Object.keys(ROLE_LABELS);
const CONTRACTS = ["CDI", "CDD", "Stage"] as const;

const ATTENDANCE_STYLES: Record<string, { label: string; cls: string }> = {
  present: { label: "Présent", cls: "bg-success/15 text-success border-success/30" },
  late: { label: "Retard", cls: "bg-sunset/15 text-sunset border-sunset/30" },
  absent: { label: "Absent", cls: "bg-bissap/15 text-bissap border-bissap/30" },
  leave: { label: "Congé", cls: "bg-muted text-muted-foreground border-border" },
};

function parseDetails(ps: ProPayslip): PayslipDetails {
  try {
    const d = JSON.parse(ps.detailsJson) as PayslipDetails;
    return { ...d, lines: Array.isArray(d.lines) ? d.lines : [] };
  } catch {
    return { lines: [] as PayrollLine[] };
  }
}

export function PayrollSection({ tenantId, defaultCountry, tenantName }: { tenantId: string; defaultCountry: string; tenantName: string }) {
  const [hireOpen, setHireOpen] = useState(false);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [running, setRunning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payslip, setPayslip] = useState<{ slip: ProPayslip; periodLabel: string } | null>(null);

  const employees = useApi<EmployeesResponse>(
    () => (tenantId ? apiGet<EmployeesResponse>(`/api/pro/employees?tenantId=${tenantId}`) : Promise.resolve({ employees: [], attendanceToday: [] })),
    [tenantId]
  );
  const payroll = useApi<PayrollResponse>(
    () => (tenantId ? apiGet<PayrollResponse>(`/api/pro/payroll?tenantId=${tenantId}`) : Promise.resolve({ payPeriods: [] })),
    [tenantId]
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
        sub="Registre du personnel, pointage, exécution mensuelle et bulletins conformes CNPS / IPRES"
        actions={
          <Button variant="outline" onClick={() => setHireOpen(true)} className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" /> Employé
          </Button>
        }
      />

      {/* ── a) Employés + pointage ── */}
      <section aria-label="Employés" className="space-y-3">
        <h3 className="font-heading text-base font-bold flex items-center gap-2">
          <Users className="size-4 text-primary" aria-hidden="true" /> Équipe & pointage du jour
        </h3>
        {employees.error && !employees.data ? (
          <ErrorState message={`Équipe indisponible : ${employees.error}`} onRetry={employees.refetch} />
        ) : employees.loading && !employees.data ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : (employees.data?.employees ?? []).length === 0 ? (
          <EmptyState label="Aucun employé enregistré" sub="Ajoutez votre première employée pour préparer la paie." />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(employees.data?.employees ?? []).map((emp) => {
              const att = employees.data?.attendanceToday?.find((a) => a.employeeId === emp.id);
              const st = ATTENDANCE_STYLES[att?.status ?? "absent"] ?? ATTENDANCE_STYLES.absent;
              return (
                <Card key={emp.id} className="gap-2 overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-heading font-semibold leading-tight truncate">{emp.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[emp.role] ?? emp.role}</Badge>
                          <Badge variant="outline" className="text-[10px]">{emp.contractType}</Badge>
                          <Badge variant="outline" className="text-[10px] font-mono bg-muted">{emp.country}</Badge>
                        </div>
                      </div>
                      {!emp.active && <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">Inactif</Badge>}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Salaire de base</span>
                      <Money value={emp.baseSalary} className="font-semibold" />
                    </div>
                    {emp.cnpsNumber && (
                      <p className="text-[10px] text-muted-foreground font-mono">N° {emp.country === "CI" ? "CNPS" : "IPRES"} : {emp.cnpsNumber}</p>
                    )}
                    {/* Pointage */}
                    <div className="rounded-xl border border-border bg-muted/40 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {att?.checkIn ?? "--:--"} → {att?.checkOut ?? "--:--"}
                          {att?.hours ? ` (${att.hours} h)` : ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!emp.active || Boolean(att?.checkIn)}
                          className="h-7 text-[11px] gap-1"
                          onClick={async () => {
                            try {
                              await apiPost("/api/pro/employees/attendance", { employeeId: emp.id, action: "in" });
                              toast.success(`Arrivée pointée — ${emp.name}`);
                              await employees.refetch();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Pointage impossible");
                            }
                          }}
                        >
                          <LogIn className="size-3" aria-hidden="true" /> Pointer arrivée
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!emp.active || !att?.checkIn || Boolean(att?.checkOut)}
                          className="h-7 text-[11px] gap-1"
                          onClick={async () => {
                            try {
                              await apiPost("/api/pro/employees/attendance", { employeeId: emp.id, action: "out" });
                              toast.success(`Départ pointé — ${emp.name}`);
                              await employees.refetch();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Pointage impossible");
                            }
                          }}
                        >
                          <LogOut className="size-3" aria-hidden="true" /> Pointer départ
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── b) Exécution paie ── */}
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

      {/* ── c) Bulletins ── */}
      <section aria-label="Bulletins de paie" className="space-y-3">
        <h3 className="font-heading text-base font-bold flex items-center gap-2">
          <FileText className="size-4 text-primary" aria-hidden="true" /> Périodes & bulletins
        </h3>
        {payroll.error && !payroll.data ? (
          <ErrorState message={`Paie indisponible : ${payroll.error}`} onRetry={payroll.refetch} />
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

      {/* ── Dialog nouveau salarié ── */}
      <HireDialog open={hireOpen} onOpenChange={setHireOpen} tenantId={tenantId} defaultCountry={defaultCountry} onCreated={employees.refetch} />

      {/* ── Bulletin A4 ── */}
      {payslip && <PayslipDialog slip={payslip.slip} periodLabel={payslip.periodLabel} tenantName={tenantName} country={latestCountry(payslip.slip)} onClose={() => setPayslip(null)} />}
    </div>
  );
}

function latestCountry(slip: ProPayslip): string {
  // le régime est dérivable du détails (CNPS=CI / IPRES=SN)
  return parseDetails(slip).regime?.includes("IPRES") || parseDetails(slip).regime?.includes("IPM") ? "SN" : "CI";
}

// ═════════════ Embauche ═════════════
function HireDialog({
  open,
  onOpenChange,
  tenantId,
  defaultCountry,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  defaultCountry: string;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("estheticienne");
  const [contractType, setContractType] = useState("CDI");
  const [country, setCountry] = useState(defaultCountry || "CI");
  const [baseSalary, setBaseSalary] = useState("");
  const [transport, setTransport] = useState("");
  const [housing, setHousing] = useState("");
  const [cadres, setCadres] = useState(false);
  // t. 96 — compte APP de l'employée : son numéro lui ouvre l'espace Pro
  // avec les sections de son poste (elle se connecte par code SMS).
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const salary = Number(baseSalary);
    if (!name.trim() || !salary || salary <= 0) {
      toast.error("Nom et salaire de base valides requis");
      return;
    }
    const digits = phone.replace(/\D/g, "");
    if (phone.trim() && digits.length < 8) {
      toast.error("Numéro de l'employée invalide (8 chiffres min.)");
      return;
    }
    setBusy(true);
    try {
      const r = await apiPost<{ employee: unknown; account: { created: boolean } | null }>("/api/pro/employees", {
        tenantId,
        name: name.trim(),
        role,
        contractType,
        country,
        baseSalary: salary,
        transport: Number(transport) || 0,
        housing: Number(housing) || 0,
        cadres: country === "SN" ? cadres : undefined,
        phone: phone.trim() || undefined,
      });
      if (r.account?.created) {
        toast.success(`${name.trim()} ajoutée à l'équipe`, {
          description: `Compte app créé (${phone.trim()}) — elle se connecte avec ce numéro (code SMS) et voit les sections de son poste.`,
        });
      } else {
        toast.success(`${name.trim()} ajoutée à l'équipe`);
      }
      setName("");
      setBaseSalary("");
      setTransport("");
      setHousing("");
      setCadres(false);
      setPhone("");
      onOpenChange(false);
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Nouvel employé</DialogTitle>
          <DialogDescription>Le régime de paie (CI/SN) détermine automatiquement les cotisations.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="h-name" className="text-xs">Nom complet</Label>
              <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aminata Cissé" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rôle</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger aria-label="Rôle"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Contrat</Label>
              <Select value={contractType} onValueChange={setContractType}>
                <SelectTrigger aria-label="Contrat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACTS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pays</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger aria-label="Pays"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CI">Côte d&apos;Ivoire</SelectItem>
                  <SelectItem value="SN">Sénégal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-salary" className="text-xs">Salaire base</Label>
              <Input id="h-salary" inputMode="numeric" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" placeholder="120000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="h-transport" className="text-xs">Transport (FCFA)</Label>
              <Input id="h-transport" inputMode="numeric" value={transport} onChange={(e) => setTransport(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" placeholder="10000" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="h-housing" className="text-xs">Logement (FCFA)</Label>
              <Input id="h-housing" inputMode="numeric" value={housing} onChange={(e) => setHousing(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" placeholder="0" />
            </div>
          </div>
          {country === "SN" && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2.5">
              <div>
                <Label htmlFor="h-cadres" className="text-xs font-medium">Statut cadres (IPRES)</Label>
                <p className="text-[10px] text-muted-foreground">Taux IPRES cadres : 2,40 % salarié / 3,60 % employeur.</p>
              </div>
              <Switch id="h-cadres" checked={cadres} onCheckedChange={setCadres} />
            </div>
          )}
          {/* t. 96 — compte APP de l'employée : son numéro de téléphone suffit. */}
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <Label htmlFor="h-phone" className="text-xs font-medium">Compte app de l&apos;employée (facultatif)</Label>
            <Input
              id="h-phone"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9+ ]/g, ""))}
              className="mt-1.5 font-mono"
              placeholder="07 05 04 03 02"
            />
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Avec son numéro, elle se connecte à l&apos;app par code SMS et accède à l&apos;espace Pro selon son poste —{" "}
              {role === "estheticienne" && "Agenda et Diagnostic."}
              {role === "dermo_conseillere" && "Agenda, Diagnostic, CRM et Relances."}
              {role === "caissiere" && "Caisse, Catalogue, Promos et Stock."}
              {role === "manager" && "toute la gestion (hors paie et compta)."}
            </p>
          </div>
          <Button disabled={busy} onClick={submit} className="w-full font-semibold gap-1.5">
            <BadgeCheck className="size-4" aria-hidden="true" /> {busy ? "Création…" : "Ajouter l'employé"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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
