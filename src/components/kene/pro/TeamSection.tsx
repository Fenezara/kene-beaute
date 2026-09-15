"use client";
// Kènè Pro — Équipe : registre du personnel (fiches, postes, contrats, salaires,
// comptes app), pointage du jour, embauche, édition de fiche et sortie.
// La paie (exécution mensuelle, bulletins, e-CNPS) vit dans la section Paie.
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  Check,
  LogIn,
  LogOut,
  Palmtree,
  Pencil,
  Plus,
  Smartphone,
  Undo2,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { apiGet, apiPatch, apiPost } from "@/lib/kene/api";
import { xof, formatDate } from "@/lib/kene/format";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, KpiCard, Money, SectionHeader } from "./ui-bits";
import type { EmployeesResponse, LeaveBalance, LeavesResponse, ProEmployee, ProLeave } from "./types";

const ROLE_LABELS: Record<string, string> = {
  estheticienne: "Esthéticienne",
  dermo_conseillere: "Dermo-conseillère",
  caissiere: "Caissière",
  manager: "Manager",
};
const ROLES = Object.keys(ROLE_LABELS);
const CONTRACTS = ["CDI", "CDD", "Stage"] as const;

const ATTENDANCE_STYLES: Record<string, { label: string; cls: string }> = {
  present: { label: "Présente", cls: "bg-success/15 text-success border-success/30" },
  late: { label: "Retard", cls: "bg-sunset/15 text-sunset border-sunset/30" },
  absent: { label: "Non pointée", cls: "bg-muted text-muted-foreground border-border" },
  leave: { label: "Congé", cls: "bg-muted text-muted-foreground border-border" },
};

const ROLE_HINTS: Record<string, string> = {
  estheticienne: "Agenda et Diagnostic.",
  dermo_conseillere: "Agenda, Diagnostic, CRM et Relances.",
  caissiere: "Caisse, Catalogue, Promos et Stock.",
  manager: "toute la gestion (hors paie et compta).",
};

const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: "conge", label: "Congé annuel" },
  { value: "maladie", label: "Maladie" },
  { value: "maternite", label: "Maternité" },
];
const LEAVE_TYPE_STYLES: Record<string, { label: string; cls: string }> = {
  conge: { label: "Congé annuel", cls: "bg-success/15 text-success border-success/30" },
  maladie: { label: "Maladie", cls: "bg-sunset/15 text-sunset border-sunset/30" },
  maternite: { label: "Maternité", cls: "bg-bissap/12 text-bissap border-bissap/30" },
};
const LEAVE_STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-gold/15 text-gold-text border-gold/30" },
  approved: { label: "Approuvé", cls: "bg-success/15 text-success border-success/30" },
  rejected: { label: "Refusé", cls: "bg-muted text-muted-foreground border-border" },
};

/** Jours ouverts d'une période (tous les jours sauf dimanche). */
function workingDays(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (cur.getDay() !== 0) days += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function TeamSection({ tenantId, defaultCountry }: { tenantId: string; defaultCountry: string }) {
  const [hireOpen, setHireOpen] = useState(false);
  const [editing, setEditing] = useState<ProEmployee | null>(null);
  const [departing, setDeparting] = useState<ProEmployee | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const employees = useApi<EmployeesResponse>(
    () =>
      tenantId
        ? apiGet<EmployeesResponse>(`/api/pro/employees?tenantId=${tenantId}`)
        : Promise.resolve({ employees: [], attendanceToday: [] }),
    [tenantId],
  );
  const leaves = useApi<LeavesResponse>(
    () =>
      tenantId
        ? apiGet<LeavesResponse>(`/api/pro/leaves?tenantId=${tenantId}`)
        : Promise.resolve({ leaves: [], balances: [] }),
    [tenantId],
  );

  async function refreshTeam() {
    await Promise.all([employees.refetch(), leaves.refetch()]);
  }

  const list = employees.data?.employees ?? [];
  const attendanceToday = employees.data?.attendanceToday ?? [];
  const leaveList = leaves.data?.leaves ?? [];
  const balances = leaves.data?.balances ?? [];
  const balanceOf = (id: string) => balances.find((b) => b.employeeId === id);
  const pendingLeaves = leaveList.filter((l) => l.status === "pending");
  const onLeaveNow = leaveList.filter((l) => l.current);
  const kpis = useMemo(() => {
    const actives = list.filter((e) => e.active);
    return {
      effectif: actives.length,
      sorties: list.length - actives.length,
      presentes: attendanceToday.filter((a) => a.checkIn && a.status !== "leave").length,
      comptes: actives.filter((e) => e.accountPhone).length,
      masseBase: actives.reduce((s, e) => s + e.baseSalary, 0),
    };
  }, [list, attendanceToday]);

  async function point(employeeId: string, action: "in" | "out", name: string) {
    try {
      await apiPost("/api/pro/employees/attendance", { employeeId, action });
      toast.success(action === "in" ? `Arrivée pointée — ${name}` : `Départ pointé — ${name}`);
      await employees.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pointage impossible");
    }
  }

  async function decide(leave: ProLeave, action: "approve" | "reject") {
    try {
      await apiPatch("/api/pro/leaves", { tenantId, id: leave.id, action });
      toast.success(action === "approve" ? "Congé approuvé" : "Demande refusée", {
        description: `${leave.employeeName} · ${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}`,
      });
      await refreshTeam();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    }
  }

  async function setDeparture(emp: ProEmployee, when: string) {
    try {
      await apiPatch("/api/pro/employees", {
        tenantId,
        id: emp.id,
        active: false,
        ...(when ? { endDate: new Date(when).toISOString() } : {}),
      });
      toast.success(`Sortie enregistrée — ${emp.name}`, {
        description: when ? `Fin de contrat le ${formatDate(when)}.` : "Elle quitte l'équipe aujourd'hui.",
      });
      setDeparting(null);
      await refreshTeam();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    }
  }

  async function reactivate(emp: ProEmployee) {
    try {
      await apiPatch("/api/pro/employees", { tenantId, id: emp.id, active: true });
      toast.success(`${emp.name} est de retour dans l'équipe`);
      await refreshTeam();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Réactivation impossible");
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Équipe"
        sub="Registre du personnel — postes, contrats, comptes app et pointage du jour"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setLeaveOpen(true)} className="gap-1.5">
              <Palmtree className="size-4" aria-hidden="true" /> Poser un congé
            </Button>
            <Button variant="outline" onClick={() => setHireOpen(true)} className="gap-1.5">
              <Plus className="size-4" aria-hidden="true" /> Embaucher
            </Button>
          </div>
        }
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="En poste" value={String(kpis.effectif)} icon={<Users className="size-4" aria-hidden="true" />} />
        <KpiCard label="Pointées aujourd'hui" value={String(kpis.presentes)} icon={<UserRoundCheck className="size-4" aria-hidden="true" />} />
        <KpiCard label="Comptes app liés" value={String(kpis.comptes)} icon={<Smartphone className="size-4" aria-hidden="true" />} />
        <KpiCard label="Masse de base / mois" value={xof(kpis.masseBase)} icon={<Banknote className="size-4" aria-hidden="true" />} />
      </div>

      {/* ── Fiches ── */}
      {employees.error && !employees.data ? (
        <ErrorState message={`Équipe indisponible : ${employees.error}`} onRetry={employees.refetch} />
      ) : employees.loading && !employees.data ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          label="Aucune employée enregistrée"
          sub="Embauche ta première collaboratrice : sa fiche portera poste, contrat, salaire et compte app."
        />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((emp) => {
            const att = attendanceToday.find((a) => a.employeeId === emp.id);
            const st = ATTENDANCE_STYLES[att?.status ?? "absent"] ?? ATTENDANCE_STYLES.absent;
            const primes = (emp.transport ?? 0) + (emp.housing ?? 0);
            const bal = balanceOf(emp.id);
            const cur = leaveList.find((l) => l.employeeId === emp.id && l.current);
            return (
              <Card key={emp.id} className={cn("gap-2 overflow-hidden", !emp.active && "opacity-75")}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[12px] font-semibold text-[#FFF9EC]"
                      >
                        {emp.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                      </span>
                      <div className="min-w-0">
                        <p className="font-heading font-semibold leading-tight truncate">{emp.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[emp.role] ?? emp.role}</Badge>
                          <Badge variant="outline" className="text-[10px]">{emp.contractType}</Badge>
                          <Badge variant="outline" className="text-[10px] font-mono bg-muted">{emp.country}</Badge>
                        </div>
                      </div>
                    </div>
                    {emp.active && cur ? (
                      <Badge variant="outline" className="text-[10px] shrink-0 bg-gold/15 text-gold-text border-gold/30">
                        En congé · retour {formatDate(cur.endDate)}
                      </Badge>
                    ) : emp.active ? (
                      <Badge variant="outline" className="text-[10px] shrink-0 bg-success/10 text-success border-success/30">
                        En poste
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                        Sortie{emp.endDate ? ` · ${formatDate(emp.endDate)}` : ""}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Salaire de base</span>
                      <Money value={emp.baseSalary} className="font-semibold" />
                    </div>
                    {primes > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Primes (transport + logement)</span>
                        <Money value={primes} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="size-3" aria-hidden="true" /> Embauchée
                      </span>
                      <span className="font-mono text-[11px]">{formatDate(emp.hireDate)}</span>
                    </div>
                    {bal && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Palmtree className="size-3" aria-hidden="true" /> Solde congés
                        </span>
                        <span className={cn("font-mono text-[11px]", bal.balance < 0 && "text-bissap")}>{bal.balance} j</span>
                      </div>
                    )}
                    {emp.cnpsNumber && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Matricule {emp.country === "SN" ? "IPRES" : "CNPS"}</span>
                        <span className="font-mono text-[11px]">{emp.cnpsNumber}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Smartphone className="size-3" aria-hidden="true" /> Compte app
                      </span>
                      {emp.accountPhone ? (
                        <span className="font-mono text-[11px] text-success">{emp.accountPhone}</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>

                  {emp.active && (
                    <div className="rounded-xl border border-border bg-muted/40 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {att?.checkIn ?? "--:--"} → {att?.checkOut ?? "--:--"}
                          {att?.hours ? ` (${att.hours} h)` : ""}
                        </span>
                      </div>
                      {att?.status === "leave" || cur ? (
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Palmtree className="size-3 shrink-0" aria-hidden="true" />
                          En congé{cur ? ` — retour prévu le ${formatDate(cur.endDate)}` : ""}
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(att?.checkIn)}
                            className="h-7 text-[11px] gap-1"
                            onClick={() => void point(emp.id, "in", emp.name)}
                          >
                            <LogIn className="size-3" aria-hidden="true" /> Arrivée
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!att?.checkIn || Boolean(att?.checkOut)}
                            className="h-7 text-[11px] gap-1"
                            onClick={() => void point(emp.id, "out", emp.name)}
                          >
                            <LogOut className="size-3" aria-hidden="true" /> Départ
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-0.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 text-[11px] gap-1"
                      onClick={() => setEditing(emp)}
                    >
                      <Pencil className="size-3" aria-hidden="true" /> Modifier la fiche
                    </Button>
                    {emp.active ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 text-[11px] gap-1 text-bissap hover:text-bissap"
                        onClick={() => setDeparting(emp)}
                      >
                        <LogOut className="size-3" aria-hidden="true" /> Sortie
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 text-[11px] gap-1"
                        onClick={() => void reactivate(emp)}
                      >
                        <Undo2 className="size-3" aria-hidden="true" /> Réactiver
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Congés & absences ── */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-heading font-semibold flex items-center gap-2">
                <Palmtree className="size-4 text-gold" aria-hidden="true" /> Congés & absences
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Solde estimé : 2 j par mois travaillé (plafond 24 j) — maladie et maternité ne décomptent pas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pendingLeaves.length > 0 && (
                <Badge variant="outline" className="text-[10px] bg-gold/15 text-gold-text border-gold/30">
                  {pendingLeaves.length} en attente
                </Badge>
              )}
              {onLeaveNow.length > 0 && (
                <Badge variant="outline" className="text-[10px] bg-success/12 text-success border-success/30">
                  {onLeaveNow.length} en congé aujourd'hui
                </Badge>
              )}
              <Button size="sm" onClick={() => setLeaveOpen(true)} className="h-8 gap-1.5">
                <Plus className="size-3.5" aria-hidden="true" /> Poser un congé
              </Button>
            </div>
          </div>

          {leaves.error && !leaves.data ? (
            <ErrorState message={`Congés indisponibles : ${leaves.error}`} onRetry={leaves.refetch} />
          ) : leaves.loading && !leaves.data ? (
            <Skeleton className="h-40" />
          ) : leaveList.length === 0 ? (
            <EmptyState
              label="Aucun congé enregistré"
              sub="Pose un congé annuel, une absence maladie ou un congé maternité pour une employée."
            />
          ) : (
            <div className="max-h-80 overflow-y-auto -mx-1 px-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employée</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Jours</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Décision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveList.map((l) => {
                    const tst = LEAVE_STATUS_STYLES[l.status] ?? LEAVE_STATUS_STYLES.pending;
                    const ty = LEAVE_TYPE_STYLES[l.type] ?? LEAVE_TYPE_STYLES.conge;
                    return (
                      <TableRow key={l.id} className={cn(l.status === "rejected" && "opacity-60")}>
                        <TableCell className="font-medium">{l.employeeName}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className={cn("text-[10px]", ty.cls)}>{ty.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-[11px]">
                            {formatDate(l.startDate)} → {formatDate(l.endDate)}
                          </span>
                          {(l.status === "pending" ? l.reason : l.note) && (
                            <p className="mt-0.5 max-w-40 truncate text-[10px] text-muted-foreground">
                              {l.status === "pending" ? l.reason : l.note}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right font-mono text-[11px]">{l.days} j</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px]", tst.cls)}>{tst.label}</Badge>
                          {l.current && <span className="ml-1 text-[10px] text-success">en cours</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {l.status === "pending" ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-[11px] text-success hover:text-success"
                                onClick={() => void decide(l, "approve")}
                              >
                                <Check className="size-3" aria-hidden="true" />
                                <span className="hidden sm:inline">Approuver</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-[11px] text-bissap hover:text-bissap"
                                onClick={() => void decide(l, "reject")}
                              >
                                <X className="size-3" aria-hidden="true" />
                                <span className="hidden sm:inline">Refuser</span>
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {l.decidedAt ? formatDate(l.decidedAt) : "—"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <HireDialog
        open={hireOpen}
        onOpenChange={setHireOpen}
        tenantId={tenantId}
        defaultCountry={defaultCountry}
        onCreated={() => void refreshTeam()}
      />
      {editing && (
        <EditDialog
          key={editing.id}
          employee={editing}
          tenantId={tenantId}
          onClose={() => setEditing(null)}
          onSaved={() => void employees.refetch()}
        />
      )}
      {departing && (
        <DepartDialog key={departing.id} employee={departing} onClose={() => setDeparting(null)} onConfirm={setDeparture} />
      )}
      {leaveOpen && (
        <LeaveDialog
          employees={list}
          balances={balances}
          tenantId={tenantId}
          onClose={() => setLeaveOpen(false)}
          onSaved={() => void refreshTeam()}
        />
      )}
    </div>
  );
}

/* ═════════════ Embauche (dialog) ═════════════ */
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
  onCreated: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("estheticienne");
  const [contractType, setContractType] = useState("CDI");
  const [country, setCountry] = useState(defaultCountry === "SN" ? "SN" : "CI");
  const [baseSalary, setBaseSalary] = useState("");
  const [transport, setTransport] = useState("");
  const [housing, setHousing] = useState("");
  const [cadres, setCadres] = useState(false);
  const [phone, setPhone] = useState("");

  async function submit() {
    if (!name.trim() || !baseSalary) {
      toast.error("Nom complet et salaire de base sont obligatoires");
      return;
    }
    setBusy(true);
    try {
      const r = await apiPost<{ account: { created: boolean; phone: string } | null }>("/api/pro/employees", {
        tenantId,
        name: name.trim(),
        role,
        contractType,
        country,
        baseSalary: Number(baseSalary),
        transport: transport ? Number(transport) : 0,
        housing: housing ? Number(housing) : 0,
        cadres,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      if (r.account?.created) {
        toast.success(`${name.trim()} rejoint l'équipe`, {
          description: `Compte app créé (${phone.trim()}) — elle se connecte avec ce numéro (code SMS) et voit les sections de son poste.`,
        });
      } else {
        toast.success(`${name.trim()} rejoint l'équipe`);
      }
      setName(""); setBaseSalary(""); setTransport(""); setHousing(""); setCadres(false); setPhone("");
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
          <DialogTitle className="font-heading">Embaucher une collaboratrice</DialogTitle>
          <DialogDescription>
            Le régime de paie (CI/SN) détermine automatiquement les cotisations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="h-name" className="text-xs">Nom complet</Label>
              <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aminata Cissé" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Poste</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger aria-label="Poste"><SelectValue /></SelectTrigger>
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
              {ROLE_HINTS[role]}
            </p>
          </div>
          <Button disabled={busy} onClick={submit} className="w-full font-semibold gap-1.5">
            <BadgeCheck className="size-4" aria-hidden="true" /> {busy ? "Création…" : "Ajouter à l'équipe"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════ Édition de fiche (dialog) ═════════════ */
function EditDialog({
  employee,
  tenantId,
  onClose,
  onSaved,
}: {
  employee: ProEmployee;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  // Monté par clé (key={employee.id}) : le formulaire s'initialise de la fiche.
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState(employee.role);
  const [contractType, setContractType] = useState(employee.contractType);
  const [country, setCountry] = useState(employee.country);
  const [baseSalary, setBaseSalary] = useState(String(employee.baseSalary));
  const [transport, setTransport] = useState(String(employee.transport ?? 0));
  const [housing, setHousing] = useState(String(employee.housing ?? 0));
  const [cadres, setCadres] = useState(Boolean(employee.cadres));
  const [cnpsNumber, setCnpsNumber] = useState(employee.cnpsNumber ?? "");
  const [bankAccount, setBankAccount] = useState(employee.bankAccount ?? "");
  const [phone, setPhone] = useState(employee.accountPhone ?? "");

  async function submit() {
    if (!name.trim() || !baseSalary) {
      toast.error("Nom complet et salaire de base sont obligatoires");
      return;
    }
    setBusy(true);
    try {
      await apiPatch("/api/pro/employees", {
        tenantId,
        id: employee.id,
        name: name.trim(),
        role,
        contractType,
        country,
        baseSalary: Number(baseSalary),
        transport: transport ? Number(transport) : 0,
        housing: housing ? Number(housing) : 0,
        cadres,
        cnpsNumber: cnpsNumber.trim() || null,
        bankAccount: bankAccount.trim() || null,
        ...(phone.trim() ? { phone: phone.trim() } : { phone: null }),
      });
      toast.success(`Fiche mise à jour — ${name.trim()}`);
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto pretty-scroll">
        <DialogHeader>
          <DialogTitle className="font-heading">Modifier la fiche</DialogTitle>
          <DialogDescription>
            {`${ROLE_LABELS[employee.role] ?? employee.role} · ${employee.contractType} · depuis ${formatDate(employee.hireDate)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="e-name" className="text-xs">Nom complet</Label>
              <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Poste</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger aria-label="Poste"><SelectValue /></SelectTrigger>
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
              <Label htmlFor="e-salary" className="text-xs">Salaire base</Label>
              <Input id="e-salary" inputMode="numeric" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="e-transport" className="text-xs">Transport (FCFA)</Label>
              <Input id="e-transport" inputMode="numeric" value={transport} onChange={(e) => setTransport(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-housing" className="text-xs">Logement (FCFA)</Label>
              <Input id="e-housing" inputMode="numeric" value={housing} onChange={(e) => setHousing(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="e-cnps" className="text-xs">Matricule {country === "SN" ? "IPRES" : "CNPS"}</Label>
              <Input id="e-cnps" value={cnpsNumber} onChange={(e) => setCnpsNumber(e.target.value)} className="font-mono" placeholder="—" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-bank" className="text-xs">Compte bancaire</Label>
              <Input id="e-bank" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="font-mono" placeholder="—" />
            </div>
          </div>
          {country === "SN" && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2.5">
              <div>
                <Label htmlFor="e-cadres" className="text-xs font-medium">Statut cadres (IPRES)</Label>
                <p className="text-[10px] text-muted-foreground">Taux IPRES cadres : 2,40 % salarié / 3,60 % employeur.</p>
              </div>
              <Switch id="e-cadres" checked={cadres} onCheckedChange={setCadres} />
            </div>
          )}
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <Label htmlFor="e-phone" className="text-xs font-medium">Compte app de l&apos;employée</Label>
            <Input
              id="e-phone"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9+ ]/g, ""))}
              className="mt-1.5 font-mono"
              placeholder="07 05 04 03 02"
            />
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Vidé = délier le compte app (elle ne peut plus se connecter à l&apos;espace Pro).{" "}
              {phone.trim() ? `Elle voit : ${ROLE_HINTS[role]}` : ""}
            </p>
          </div>
          <Button disabled={busy} onClick={submit} className="w-full font-semibold gap-1.5">
            <BadgeCheck className="size-4" aria-hidden="true" /> {busy ? "Enregistrement…" : "Enregistrer la fiche"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════ Congés : poser un congé (dialog) ═════════════ */
function LeaveDialog({
  employees,
  balances,
  tenantId,
  onClose,
  onSaved,
}: {
  employees: ProEmployee[];
  balances: LeaveBalance[];
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const actives = employees.filter((e) => e.active);
  const [employeeId, setEmployeeId] = useState(actives[0]?.id ?? "");
  const [type, setType] = useState("conge");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const days = workingDays(start, end);
  const bal = balances.find((b) => b.employeeId === employeeId);
  const overdrawn = type === "conge" && bal !== undefined && days > bal.balance;

  async function submit(approve: boolean) {
    if (!employeeId || days < 1) return;
    setBusy(true);
    try {
      await apiPost("/api/pro/leaves", {
        tenantId,
        employeeId,
        type,
        startDate: start,
        endDate: end,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        approve,
      });
      toast.success(approve ? "Congé approuvé" : "Demande enregistrée — en attente", {
        description: `${actives.find((e) => e.id === employeeId)?.name} · ${formatDate(start)} → ${formatDate(end)} (${days} j ouverts)`,
      });
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Poser un congé</DialogTitle>
          <DialogDescription>
            Enregistre une absence pour une employée — les jours ouverts (dimanche exclu) sont comptés automatiquement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="leave-emp">Employée</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id="leave-emp">
                <SelectValue placeholder="Choisir une employée" />
              </SelectTrigger>
              <SelectContent>
                {actives.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {ROLE_LABELS[e.role] ?? e.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type d&apos;absence</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="leave-start">Du</Label>
              <Input id="leave-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-end">Au</Label>
              <Input id="leave-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Jours ouverts (dimanche exclu)</span>
            <span className="font-mono font-semibold">{days} j</span>
          </div>
          {bal && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Solde congés estimé de l&apos;employée</span>
              <span className="font-mono">{bal.balance} j</span>
            </div>
          )}
          {overdrawn && (
            <p className="text-[11px] text-sunset">
              Cette absence dépasse le solde estimé — elle reste enregistrable (à ton appréciation).
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="leave-reason">Motif (optionnel)</Label>
            <Input
              id="leave-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. congé annuel, repos médical…"
            />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={busy || !employeeId || days < 1} onClick={() => void submit(false)}>
            Garder en attente
          </Button>
          <Button disabled={busy || !employeeId || days < 1} onClick={() => void submit(true)} className="gap-1.5">
            <Check className="size-4" aria-hidden="true" /> Poser et approuver
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════ Sortie (confirmation) ═════════════ */
function DepartDialog({
  employee,
  onClose,
  onConfirm,
}: {
  employee: ProEmployee;
  onClose: () => void;
  onConfirm: (emp: ProEmployee, when: string) => Promise<void>;
}) {
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading">
            Enregistrer la sortie de {employee.name} ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Sa fiche reste dans l&apos;historique (paie, pointages) mais elle n&apos;est plus comptée dans
                l&apos;effectif, ne peut plus être pointée et son compte app n&apos;ouvre plus l&apos;espace Pro de
                l&apos;institut.
              </p>
              <div className="space-y-1">
                <Label htmlFor="e-when" className="text-xs">Date de fin de contrat</Label>
                <Input
                  id="e-when"
                  type="date"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="bg-card w-44"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault(); // garde le dialog ouvert pendant l'appel
              setBusy(true);
              void onConfirm(employee, when).finally(() => setBusy(false));
            }}
            className="bg-bissap text-white hover:bg-bissap/90"
          >
            {busy ? "Enregistrement…" : "Confirmer la sortie"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
