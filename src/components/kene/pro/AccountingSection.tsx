"use client";
// Kènè Pro — Compta SYSCOHADA : journal, grand livre, balance, liasse fiscale (bilan + résultat + TVA)
// + Exports CSV téléchargeables (Excel FR) avec période au choix : livre des ventes, journal, balance, liasse.
import { Fragment, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarRange,
  CheckCircle2,
  Download,
  Equal,
  FileSpreadsheet,
  FileText,
  Landmark,
  Library,
  Loader2,
  Plus,
  Printer,
  Scale,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { CLASSES_LABELS } from "@/lib/accounting/syscohada";
import { EXPORT_TYPE_LABELS, exportFilename, type ExportType } from "@/lib/accounting/csv";
import { useApi } from "./useApi";
import { ClasseBadge, EmptyState, ErrorState, JournalBadge, KenteTop, Money, SectionHeader } from "./ui-bits";
import type { AccountingResponse } from "./types";

interface OdLine {
  accountCode: string;
  debit: string;
  credit: string;
}

export function AccountingSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [tab, setTab] = useState("journal");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [odOpen, setOdOpen] = useState(false);
  const [odDesc, setOdDesc] = useState("");
  const [odDate, setOdDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [odLines, setOdLines] = useState<OdLine[]>([
    { accountCode: "", debit: "", credit: "" },
    { accountCode: "", debit: "", credit: "" },
  ]);
  const [ledgerAccount, setLedgerAccount] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // ── Exports CSV/PDF & période — clé de charge « format:type » ──
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const periodLabel = !period
    ? "Toute la période"
    : `Du ${formatDate(period.from, { day: "2-digit", month: "2-digit", year: "2-digit" })}${
        period.to ? ` au ${formatDate(period.to, { day: "2-digit", month: "2-digit", year: "2-digit" })}` : ""
      }`;

  function ymd(d: Date): string {
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function applyPreset(kind: "month" | "lastMonth" | "year") {
    const now = new Date();
    let from: Date;
    let to: Date;
    if (kind === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (kind === "lastMonth") {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
    } else {
      from = new Date(now.getFullYear(), 0, 1);
      to = now;
    }
    setPeriod({ from: ymd(from), to: ymd(to) });
    setPeriodOpen(false);
  }

  function applyCustomPeriod() {
    if (!customFrom && !customTo) return;
    setPeriod({ from: customFrom, to: customTo });
    setPeriodOpen(false);
  }

  async function downloadExport(type: ExportType, format: "csv" | "pdf" = "csv") {
    const busyKey = `${format}:${type}`;
    if (exportBusy) return;
    setExportBusy(busyKey);
    try {
      const params = new URLSearchParams({ tenantId, type, format });
      if (period?.from) params.set("from", period.from);
      if (period?.to) params.set("to", period.to);
      const res = await fetch(`/api/pro/accounting/export?${params.toString()}`);
      if (!res.ok) {
        let msg = `Export impossible (${res.status})`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* réponse non-JSON : message générique conservé */
        }
        throw new Error(msg);
      }
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fallback = format === "pdf" ? "kene-liasse.pdf" : exportFilename(type, period?.from, period?.to);
      const filename =
        /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallback;
      const rowsCount = res.headers.get("X-Rows-Count");
      const pagesCount = res.headers.get("X-Pages-Count");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(format === "pdf" ? "Liasse PDF téléchargée" : "Fichier téléchargé", {
        description: `${filename}${pagesCount ? ` · ${pagesCount} pages` : rowsCount ? ` · ${rowsCount} lignes` : ""}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible");
    } finally {
      setExportBusy(null);
    }
  }

  function printLiasse() {
    setTab("liasse");
    window.setTimeout(() => window.print(), 200);
  }

  const acc = useApi<AccountingResponse>(
    () => (tenantId ? apiGet<AccountingResponse>(`/api/pro/accounting?tenantId=${tenantId}`) : Promise.resolve(null as unknown as AccountingResponse)),
    [tenantId]
  );

  const entries = useMemo(
    () => [...(acc.data?.entries ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [acc.data]
  );
  const balance = useMemo(() => [...(acc.data?.balance ?? [])].sort((a, b) => a.accountCode.localeCompare(b.accountCode)), [acc.data]);
  const balanceByClasse = useMemo(() => {
    const map = new Map<number, typeof balance>();
    for (const row of balance) {
      const arr = map.get(row.classe) ?? [];
      arr.push(row);
      map.set(row.classe, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [balance]);
  const totalDebit = balance.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredit = balance.reduce((s, r) => s + r.totalCredit, 0);

  // Grand livre — lignes chronologiques du compte sélectionné
  const ledgerLines = useMemo(() => {
    if (!ledgerAccount || !acc.data) return [];
    const out: { date: string; journal: string; label: string; debit: number; credit: number; solde: number }[] = [];
    const sorted = [...(acc.data.entries ?? [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let solde = 0;
    for (const e of sorted) {
      for (const l of e.lines) {
        if (l.account.code !== ledgerAccount) continue;
        solde += l.debit - l.credit;
        out.push({ date: e.date, journal: e.journalCode, label: l.label || e.description, debit: l.debit, credit: l.credit, solde });
      }
    }
    return out;
  }, [ledgerAccount, acc.data]);

  const odTotals = odLines.reduce(
    (t, l) => ({ d: t.d + (Number(l.debit) || 0), c: t.c + (Number(l.credit) || 0) }),
    { d: 0, c: 0 }
  );
  const odBalanced = odTotals.d > 0 && Math.abs(odTotals.d - odTotals.c) < 0.5;

  async function submitOd() {
    const lines = odLines
      .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }));
    if (!odDesc.trim() || lines.length < 2 || !odBalanced) {
      toast.error("Description requise, au moins 2 lignes et équilibre débit = crédit");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/pro/accounting/manual", { tenantId, journalCode: "OD", date: odDate, description: odDesc.trim(), lines });
      toast.success("Écriture OD enregistrée", { description: "Le journal et la balance sont à jour." });
      setOdOpen(false);
      setOdDesc("");
      setOdLines([
        { accountCode: "", debit: "", credit: "" },
        { accountCode: "", debit: "", credit: "" },
      ]);
      await acc.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  if (acc.error && !acc.data) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Compta" sub="SYSCOHADA révisé — journal, grand livre, balance, liasse" />
        <ErrorState message={`Comptabilité indisponible : ${acc.error}`} onRetry={acc.refetch} />
      </div>
    );
  }
  if (acc.loading && !acc.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const data = acc.data;
  if (!data) return null;

  const st = data.statements;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Compta"
        sub={`SYSCOHADA révisé — ${entries.length} écritures · ${balance.length} comptes mouvementés`}
        actions={
          <>
            <Popover open={periodOpen} onOpenChange={setPeriodOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-1.5 text-xs">
                  <CalendarRange className="size-4" aria-hidden="true" />
                  {periodLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div>
                  <p className="text-xs font-semibold">Période d&apos;export</p>
                  <p className="text-[11px] text-muted-foreground">
                    Filtre les fichiers téléchargés — les 4 CSV et le PDF de la liasse.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => applyPreset("month")}>
                    Ce mois-ci
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("lastMonth")}>
                    Mois dernier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("year")}>
                    Cette année
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPeriod(null);
                      setPeriodOpen(false);
                    }}
                  >
                    Tout
                  </Button>
                </div>
                <div className="space-y-2 border-t pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="exp-from" className="text-[11px]">
                        Du
                      </Label>
                      <Input
                        id="exp-from"
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="exp-to" className="text-[11px]">
                        Au
                      </Label>
                      <Input
                        id="exp-to"
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <Button size="sm" className="w-full" onClick={applyCustomPeriod} disabled={!customFrom && !customTo}>
                    Appliquer cette période
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1.5 font-semibold" disabled={exportBusy !== null}>
                  {exportBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="size-4" aria-hidden="true" />
                  )}
                  Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[11px]">Fichiers CSV (Excel FR)</DropdownMenuLabel>
                {(["ventes", "journal", "balance", "liasse"] as const).map((t) => (
                  <DropdownMenuItem
                    key={t}
                    onSelect={() => downloadExport(t)}
                    disabled={exportBusy !== null}
                    className="gap-2"
                  >
                    {exportBusy === `csv:${t}` ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-finance" aria-hidden="true" />
                    ) : (
                      <FileSpreadsheet className="size-4 shrink-0 text-finance" aria-hidden="true" />
                    )}
                    <span className="flex-1">{EXPORT_TYPE_LABELS[t]}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {t === "ventes" ? "TVA" : t === "journal" ? "lignes" : t === "balance" ? "comptes" : "bilan"}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px]">Dossier pour le comptable</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => downloadExport("liasse", "pdf")}
                  disabled={exportBusy !== null}
                  className="gap-2"
                >
                  {exportBusy === "pdf:liasse" ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                  ) : (
                    <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  )}
                  <span className="flex-1 font-semibold">Liasse PDF (dossier complet)</span>
                  <span className="text-[10px] text-muted-foreground">comptable</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={printLiasse} className="gap-2">
                  <Printer className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">Imprimer la liasse</span>
                  <span className="text-[10px] text-muted-foreground">papier</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {tab === "journal" && (
              <Button variant="outline" onClick={() => setOdOpen(true)} className="gap-1.5">
                <Plus className="size-4" aria-hidden="true" /> Saisie manuelle OD
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="journal" className="text-xs gap-1.5"><BookOpen className="size-3.5" aria-hidden="true" /> Journal</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs gap-1.5"><Library className="size-3.5" aria-hidden="true" /> Grand livre</TabsTrigger>
          <TabsTrigger value="balance" className="text-xs gap-1.5"><Scale className="size-3.5" aria-hidden="true" /> Balance</TabsTrigger>
          <TabsTrigger value="liasse" className="text-xs gap-1.5"><Landmark className="size-3.5" aria-hidden="true" /> Liasse fiscale</TabsTrigger>
        </TabsList>

        {/* ───────── JOURNAL ───────── */}
        <TabsContent value="journal" className="mt-3">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {entries.length === 0 ? (
                <EmptyState label="Aucune écriture au journal" sub="Les ventes POS et la paie génèrent automatiquement les écritures." />
              ) : (
                <ul className="divide-y divide-border/70">
                  {entries.map((e) => {
                    const open = expanded === e.id;
                    const totD = e.lines.reduce((s, l) => s + l.debit, 0);
                    const totC = e.lines.reduce((s, l) => s + l.credit, 0);
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => setExpanded(open ? null : e.id)}
                          aria-expanded={open}
                          className="w-full flex flex-wrap items-center gap-2.5 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
                        >
                          <JournalBadge code={e.journalCode} />
                          <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{formatDate(e.date)}</span>
                          <span className="font-mono text-[11px] text-muted-foreground hidden sm:inline w-28 shrink-0 truncate">{e.reference}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{e.description}</span>
                          <Money value={totD} className="text-xs font-semibold shrink-0" />
                          <span className="text-[10px] text-muted-foreground">{open ? "▲" : "▼"}</span>
                        </button>
                        {open && (
                          <div className="border-t border-border/60 bg-muted/30 px-4 py-3 overflow-x-auto pretty-scroll">
                            <table className="w-full text-xs min-w-[560px]">
                              <thead>
                                <tr className="text-left text-muted-foreground border-b border-border">
                                  <th className="py-1.5 font-medium">Compte</th>
                                  <th className="py-1.5 font-medium">Libellé</th>
                                  <th className="py-1.5 font-medium text-right">Débit</th>
                                  <th className="py-1.5 font-medium text-right">Crédit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.lines.map((l, i) => (
                                  <tr key={i} className="border-b border-border/50">
                                    <td className="py-1.5 font-mono">{l.account.code}</td>
                                    <td className="py-1.5">{l.label || l.account.label}</td>
                                    <td className="py-1.5 text-right font-mono tabular-nums">{l.debit ? l.debit.toLocaleString("fr-FR") : ""}</td>
                                    <td className="py-1.5 text-right font-mono tabular-nums">{l.credit ? l.credit.toLocaleString("fr-FR") : ""}</td>
                                  </tr>
                                ))}
                                <tr className="font-semibold">
                                  <td colSpan={2} className="py-1.5">Totaux — {Math.abs(totD - totC) < 0.5 ? "écriture équilibrée" : "déséquilibre"}</td>
                                  <td className="py-1.5 text-right font-mono tabular-nums">{totD.toLocaleString("fr-FR")}</td>
                                  <td className="py-1.5 text-right font-mono tabular-nums">{totC.toLocaleString("fr-FR")}</td>
                                </tr>
                              </tbody>
                            </table>
                            {Math.abs(totD - totC) < 0.5 && (
                              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-success">
                                <CheckCircle2 className="size-3.5" aria-hidden="true" /> Débit = Crédit
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── GRAND LIVRE ───────── */}
        <TabsContent value="ledger" className="mt-3 space-y-3">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <div className="space-y-1 min-w-64">
                <Label className="text-xs">Compte</Label>
                <Select value={ledgerAccount || undefined} onValueChange={setLedgerAccount}>
                  <SelectTrigger aria-label="Compte"><SelectValue placeholder="Choisir un compte mouvementé…" /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    {balance.map((r) => (
                      <SelectItem key={r.accountCode} value={r.accountCode}>
                        <span className="font-mono">{r.accountCode}</span> — {r.accountLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {ledgerAccount && (
                <div className="rounded-xl border border-border bg-card px-4 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Solde final</p>
                  <Money value={ledgerLines[ledgerLines.length - 1]?.solde ?? 0} className={cn("text-base font-bold", (ledgerLines[ledgerLines.length - 1]?.solde ?? 0) >= 0 ? "text-terre" : "text-success")} />
                </div>
              )}
            </CardContent>
          </Card>
          {!ledgerAccount ? (
            <EmptyState label="Sélectionnez un compte" sub="Le grand livre retrace chronologiquement toutes ses lignes." />
          ) : ledgerLines.length === 0 ? (
            <EmptyState label="Aucun mouvement sur ce compte" />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto pretty-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Journal</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead className="text-right">Débit</TableHead>
                      <TableHead className="text-right">Crédit</TableHead>
                      <TableHead className="text-right">Solde progressif</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerLines.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{formatDate(l.date)}</TableCell>
                        <TableCell><JournalBadge code={l.journal} /></TableCell>
                        <TableCell className="text-xs">{l.label}</TableCell>
                        <TableCell className="text-right"><Money value={l.debit} className="text-xs" /></TableCell>
                        <TableCell className="text-right"><Money value={l.credit} className="text-xs" /></TableCell>
                        <TableCell className="text-right"><Money value={Math.abs(l.solde)} className={cn("text-xs font-semibold", l.solde >= 0 ? "text-terre" : "text-success")} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ───────── BALANCE ───────── */}
        <TabsContent value="balance" className="mt-3">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {balance.length === 0 ? (
                <EmptyState label="Balance vide" sub="Aucune écriture enregistrée." />
              ) : (
                <div className="overflow-x-auto pretty-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Compte</TableHead>
                        <TableHead className="hidden md:table-cell">Libellé</TableHead>
                        <TableHead className="text-right">Total débit</TableHead>
                        <TableHead className="text-right">Total crédit</TableHead>
                        <TableHead className="text-right">Solde débiteur</TableHead>
                        <TableHead className="text-right">Solde créditeur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balanceByClasse.map(([classe, rows]) => (
                        <Fragment key={classe}>
                          <TableRow className="bg-muted/60 hover:bg-muted/60">
                            <TableCell colSpan={6} className="py-2">
                              <span className="flex items-center gap-2">
                                <ClasseBadge classe={classe} />
                                <span className="font-heading text-xs font-bold">{CLASSES_LABELS[classe] ?? `Classe ${classe}`}</span>
                              </span>
                            </TableCell>
                          </TableRow>
                          {rows.map((r) => (
                            <TableRow key={r.accountCode}>
                              <TableCell className="font-mono text-xs">{r.accountCode}</TableCell>
                              <TableCell className="hidden md:table-cell text-xs">{r.accountLabel}</TableCell>
                              <TableCell className="text-right"><Money value={r.totalDebit} className="text-xs" /></TableCell>
                              <TableCell className="text-right"><Money value={r.totalCredit} className="text-xs" /></TableCell>
                              <TableCell className="text-right"><Money value={r.solde > 0 ? r.solde : 0} className="text-xs" /></TableCell>
                              <TableCell className="text-right"><Money value={r.solde < 0 ? -r.solde : 0} className="text-xs" /></TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      ))}
                      <TableRow className="font-bold bg-gold/10 hover:bg-gold/10">
                        <TableCell colSpan={2} className="py-2.5">TOTAUX</TableCell>
                        <TableCell className="text-right"><Money value={totalDebit} className="text-xs" /></TableCell>
                        <TableCell className="text-right"><Money value={totalCredit} className="text-xs" /></TableCell>
                        <TableCell colSpan={2} className="py-2.5">
                          <span className={cn("inline-flex items-center gap-1 text-xs", Math.abs(totalDebit - totalCredit) < 0.5 ? "text-success" : "text-bissap")}>
                            <Equal className="size-3.5" aria-hidden="true" />
                            {Math.abs(totalDebit - totalCredit) < 0.5 ? "Balance équilibrée (D = C)" : "Déséquilibre détecté"}
                          </span>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── LIASSE FISCALE ───────── */}
        <TabsContent value="liasse" className="mt-3">
          <div className="print-area space-y-4">
            <div className="hidden print:block">
              <p className="font-heading font-bold text-lg">{tenantName} — Liasse fiscale SYSCOHADA</p>
              <p className="text-xs">Édité le {formatDate(new Date())} — Kènè Pro</p>
            </div>

            {/* TVA */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "TVA collectée (18 %)", value: st.tvaCollected },
                { label: "TVA déductible", value: st.tvaDeductible },
                { label: "TVA à payer", value: st.tvaAPayer, strong: true },
              ].map((c) => (
                <Card key={c.label} className={cn("overflow-hidden pt-0 border-finance/30", c.strong && "bg-finance/5")}>
                  <KenteTop className="opacity-40" />
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                    <Money value={c.value} className={cn("text-lg font-bold", c.strong ? "text-finance" : "")} />
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Bilan */}
              <Card className="overflow-hidden pt-0">
                <KenteTop />
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-base flex items-center gap-2">
                    <Landmark className="size-4 text-finance" aria-hidden="true" /> Bilan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Actif</p>
                    <ul className="text-sm divide-y divide-border/60">
                      {st.actif.map((a) => (
                        <li key={a.label} className="flex justify-between gap-2 py-1.5">
                          <span className="truncate">{a.label}</span>
                          <Money value={a.amount} className="text-xs" />
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-between mt-1.5 pt-2 border-t-2 border-border font-semibold">
                      <span>Total actif</span>
                      <Money value={st.totalActif} className="text-sm text-finance" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Passif</p>
                    <ul className="text-sm divide-y divide-border/60">
                      {st.passif.map((p) => (
                        <li key={p.label} className={cn("flex justify-between gap-2 py-1.5", p.label.startsWith("Résultat") && "font-semibold text-gold")}>
                          <span className="truncate">{p.label}</span>
                          <Money value={p.amount} className="text-xs" />
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-between mt-1.5 pt-2 border-t-2 border-border font-semibold">
                      <span>Total passif</span>
                      <Money value={st.totalPassif} className="text-sm text-finance" />
                    </div>
                  </div>
                  <p className={cn("flex items-center gap-1.5 text-xs", Math.abs(st.totalActif - st.totalPassif) < 1 ? "text-success" : "text-bissap")}>
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                    {Math.abs(st.totalActif - st.totalPassif) < 1
                      ? "Bilan équilibré : Actif = Passif"
                      : `Écart actif/passif : ${Math.abs(st.totalActif - st.totalPassif).toLocaleString("fr-FR")} FCFA`}
                  </p>
                </CardContent>
              </Card>

              {/* Compte de résultat */}
              <Card className="overflow-hidden pt-0">
                <KenteTop />
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-base flex items-center gap-2">
                    <TrendingUp className="size-4 text-finance" aria-hidden="true" /> Compte de résultat
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center rounded-xl bg-success/8 border border-success/25 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium"><TrendingUp className="size-4 text-success" aria-hidden="true" /> Produits</span>
                    <Money value={st.produits} className="text-base font-bold text-success" />
                  </div>
                  <div className="flex justify-between items-center rounded-xl bg-bissap/8 border border-bissap/25 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium"><TrendingDown className="size-4 text-bissap" aria-hidden="true" /> Charges</span>
                    <Money value={st.charges} className="text-base font-bold text-bissap" />
                  </div>
                  <div className={cn("flex justify-between items-center rounded-xl px-4 py-4 border", st.resultat >= 0 ? "bg-success/10 border-success/40" : "bg-bissap/10 border-bissap/40")}>
                    <span className="font-heading font-bold">RÉSULTAT NET</span>
                    <Money value={st.resultat} className={cn("text-2xl font-bold", st.resultat >= 0 ? "text-success" : "text-bissap")} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Résultat intégré au passif du bilan (ligne « Résultat de l&apos;exercice »).
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Dialog saisie OD ── */}
      <Dialog open={odOpen} onOpenChange={setOdOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto pretty-scroll">
          <DialogHeader>
            <DialogTitle className="font-heading">Saisie manuelle — Opérations diverses (OD)</DialogTitle>
            <DialogDescription>Écriture libre au journal OD. Le débit doit égaler le crédit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="od-desc" className="text-xs">Description</Label>
                <Input id="od-desc" value={odDesc} onChange={(e) => setOdDesc(e.target.value)} placeholder="Régularisation caisse juin…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="od-date" className="text-xs">Date</Label>
                <Input id="od-date" type="date" value={odDate} onChange={(e) => setOdDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              {odLines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_90px_32px] gap-2 items-center">
                  <Select value={l.accountCode || undefined} onValueChange={(v) => setOdLines((ls) => ls.map((x, j) => (j === i ? { ...x, accountCode: v } : x)))}>
                    <SelectTrigger className="text-xs" aria-label={`Compte ligne ${i + 1}`}><SelectValue placeholder="Compte…" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {data.accounts.map((a) => (
                        <SelectItem key={a.id} value={a.code}>
                          <span className="font-mono">{a.code}</span> — {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    inputMode="numeric"
                    value={l.debit}
                    onChange={(e) => setOdLines((ls) => ls.map((x, j) => (j === i ? { ...x, debit: e.target.value.replace(/[^0-9]/g, "") } : x)))}
                    placeholder="Débit"
                    className="font-mono text-xs text-right"
                    aria-label={`Ligne ${i + 1} débit`}
                  />
                  <Input
                    inputMode="numeric"
                    value={l.credit}
                    onChange={(e) => setOdLines((ls) => ls.map((x, j) => (j === i ? { ...x, credit: e.target.value.replace(/[^0-9]/g, "") } : x)))}
                    placeholder="Crédit"
                    className="font-mono text-xs text-right"
                    aria-label={`Ligne ${i + 1} crédit`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-bissap"
                    onClick={() => setOdLines((ls) => ls.filter((_, j) => j !== i))}
                    aria-label={`Supprimer la ligne ${i + 1}`}
                    disabled={odLines.length <= 2}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setOdLines((ls) => [...ls, { accountCode: "", debit: "", credit: "" }])} className="gap-1 w-fit">
                <Plus className="size-3.5" aria-hidden="true" /> Ajouter une ligne
              </Button>
            </div>
            <div className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-xs font-mono", odBalanced ? "bg-success/10 text-success" : "bg-bissap/10 text-bissap")}>
              <span>Débit : {odTotals.d.toLocaleString("fr-FR")}</span>
              <span className="flex items-center gap-1">
                <Equal className="size-3" aria-hidden="true" />
                {odBalanced ? "Équilibrée" : `Écart : ${(odTotals.d - odTotals.c).toLocaleString("fr-FR")}`}
              </span>
              <span>Crédit : {odTotals.c.toLocaleString("fr-FR")}</span>
            </div>
            <Button disabled={busy || !odBalanced} onClick={submitOd} className="w-full font-semibold">
              {busy ? "Enregistrement…" : "Enregistrer l'écriture OD"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
