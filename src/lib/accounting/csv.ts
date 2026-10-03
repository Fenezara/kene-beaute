// Kènè — Export comptable CSV (SYSCOHADA révisé)
// Lib PURE client-safe: format Excel FR (séparateur «; », fins de ligne \r\n, BOM UTF-8).
// Les 4 constructeurs partagent un en-tête documentaire (institut, période, édition)
// puis alignent colonnes et totaux pour être exploitables directement par un comptable.

import type { BalanceRow, FinancialStatements } from "./syscohada";

// ─────────────── Types & constantes ───────────────

export type CsvCell = string | number;

export const EXPORT_TYPES = ["journal", "balance", "liasse", "ventes"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const EXPORT_TYPE_LABELS: Record<ExportType, string> = {
  journal: "Journal des écritures",
  balance: "Balance générale des comptes",
  liasse: "Liasse fiscale simplifiée",
  ventes: "Livre des ventes (TVA)",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wave: "Wave",
  orange: "Orange Money",
  cash: "Espèces",
  card: "Carte",
  wallet: "Wallet Kènè",
};

// ─────────────── Primitives CSV ───────────────

/** Échappe une cellule: guillemets doublés si séparateur / quote / retour ligne */
export function csvEscape(v: CsvCell): string {
  const s = String(v ?? "");
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Assemble les lignes — BOM par défaut (accents Excel), \r\n standard FR */
export function toCsv(rows: CsvCell[][], opts?: { bom?: boolean }): string {
  const body = rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
  return (opts?.bom === false ? "" : "\uFEFF") + body;
}

/** Date → JJ/MM/AAAA (format comptable) */
export function csvDate(d: string | Date): string {
  const n = new Date(d);
  if (Number.isNaN(n.getTime())) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()}`;
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/** Nom de fichier ASCII-safe : kene-{type}-{AAAAMMJJ-AAAAMMJJ|tout}.csv */
export function exportFilename(type: ExportType, from?: string | Date, to?: string | Date): string {
  const stamp = (d?: string | Date) => {
    if (!d) return "";
    const n = new Date(d);
    if (Number.isNaN(n.getTime())) return "";
    return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}`;
  };
  const a = stamp(from);
  const b = stamp(to);
  const period = a && b ? `${a}-${b}` : a || b || "tout";
  return `kene-${type}-${period}.csv`;
}

// ─────────────── En-tête documentaire commun ───────────────

export interface CsvMeta {
  tenantName: string;
  tenantCity?: string | null;
  type: ExportType;
  from?: Date;
  to?: Date;
  countLabel: string; // ex. « 28 écritures »
}

function metaRows(m: CsvMeta): CsvCell[][] {
  const periodLabel = m.from
    ? `Période : du ${csvDate(m.from)}${m.to ? ` au ${csvDate(m.to)}` : ""}`
    : "Période : intégralité des données";
  return [
    ["Kènè Pro — Comptabilité SYSCOHADA révisé"],
    [EXPORT_TYPE_LABELS[m.type]],
    [m.tenantCity ? `${m.tenantName} (${m.tenantCity})` : m.tenantName],
    [periodLabel],
    [`Édité le ${csvDate(new Date())} · ${m.countLabel} · montants en FCFA`],
    [],
  ];
}

// ─────────────── Journal ───────────────

export interface JournalExportLine {
  account: { code: string; label: string } | null;
  label?: string | null;
  debit: number;
  credit: number;
}

export interface JournalExportEntry {
  journalCode: string;
  date: string | Date;
  reference: string;
  description: string;
  lines: JournalExportLine[];
}

export function journalCsvRows(m: CsvMeta, entries: JournalExportEntry[]): CsvCell[][] {
  const rows = metaRows({ ...m, countLabel: m.countLabel });
  rows.push(["Date", "Journal", "Référence", "Description", "Compte", "Intitulé compte", "Libellé ligne", "Débit", "Crédit"]);
  let totD = 0;
  let totC = 0;
  for (const e of entries) {
    for (const l of e.lines) {
      rows.push([
        csvDate(e.date),
        e.journalCode,
        e.reference,
        e.description,
        l.account?.code ?? "?",
        l.account?.label ?? "Compte supprimé",
        l.label ?? "",
        l.debit,
        l.credit,
      ]);
      totD += l.debit;
      totC += l.credit;
    }
  }
  rows.push([], ["TOTAUX", "", "", "", "", "", "", totD, totC]);
  return rows;
}

// ─────────────── Balance ───────────────

export function balanceCsvRows(m: CsvMeta, balance: BalanceRow[]): CsvCell[][] {
  const rows = metaRows(m);
  rows.push(["Compte", "Classe", "Intitulé", "Type", "Total débit", "Total crédit", "Solde débiteur", "Solde créditeur"]);
  let totD = 0;
  let totC = 0;
  for (const r of balance) {
    totD += r.totalDebit;
    totC += r.totalCredit;
    rows.push([
      r.accountCode,
      r.classe,
      r.accountLabel,
      r.type,
      r.totalDebit,
      r.totalCredit,
      r.solde > 0 ? r.solde : 0,
      r.solde < 0 ? -r.solde : 0,
    ]);
  }
  rows.push([], ["TOTAUX", "", "", "", totD, totC, "", ""], [`Contrôle : ${totD === totC ? "balance équilibrée (débit = crédit)" : "DÉSÉQUILIBRE"}`]);
  return rows;
}

// ─────────────── Liasse fiscale ───────────────

export function liasseCsvRows(m: CsvMeta, st: FinancialStatements): CsvCell[][] {
  const rows = metaRows(m);
  rows.push(
    ["COMPTE DE RÉSULTAT"],
    ["Produits d'exploitation", st.produits],
    ["Charges d'exploitation", st.charges],
    ["RÉSULTAT NET", st.resultat],
    [],
    ["TVA (18 % incluse)"],
    ["TVA collectée", st.tvaCollected],
    ["TVA déductible", st.tvaDeductible],
    ["TVA nette à payer", st.tvaAPayer],
    [],
    ["BILAN — ACTIF"]
  );
  for (const a of st.actif) rows.push([a.label, a.amount]);
  rows.push(["Total actif", st.totalActif], [], ["BILAN — PASSIF"]);
  for (const p of st.passif) rows.push([p.label, p.amount]);
  rows.push(
    ["Total passif", st.totalPassif],
    [],
    [`Contrôle : ${st.totalActif === st.totalPassif ? "actif = passif" : `écart ${Math.abs(st.totalActif - st.totalPassif)} FCFA`}`]
  );
  return rows;
}

// ─────────────── Livre des ventes ───────────────

export interface SaleExportRow {
  date: string | Date;
  ref: string | null;
  clientName: string | null;
  itemCount: number;
  servicesAmount: number;
  productsAmount: number;
  subtotal: number;
  discount: number;
  total: number;
  tvaAmount: number;
  paymentMethod: string;
  paymentRef: string | null;
  cashierName: string;
}

export function salesBookCsvRows(m: CsvMeta, sales: SaleExportRow[]): CsvCell[][] {
  const rows = metaRows(m);
  rows.push([
    "Date",
    "Réf vente",
    "Cliente",
    "Articles",
    "Part prestations",
    "Part produits",
    "Sous-total",
    "Remise",
    "Total HT",
    "TVA",
    "Total TTC",
    "Mode",
    "Réf paiement",
    "Caissière",
  ]);
  const t = { svc: 0, prod: 0, sub: 0, disc: 0, ht: 0, tva: 0, ttc: 0 };
  for (const s of sales) {
    const ht = s.total - s.tvaAmount;
    rows.push([
      csvDate(s.date),
      s.ref ?? "",
      s.clientName ?? "Cliente de passage",
      s.itemCount,
      s.servicesAmount,
      s.productsAmount,
      s.subtotal,
      s.discount,
      ht,
      s.tvaAmount,
      s.total,
      paymentMethodLabel(s.paymentMethod),
      s.paymentRef ?? "",
      s.cashierName,
    ]);
    t.svc += s.servicesAmount;
    t.prod += s.productsAmount;
    t.sub += s.subtotal;
    t.disc += s.discount;
    t.ht += ht;
    t.tva += s.tvaAmount;
    t.ttc += s.total;
  }
  rows.push(
    [],
    ["TOTAUX", "", "", sales.length, t.svc, t.prod, t.sub, t.disc, t.ht, t.tva, t.ttc, "", "", ""],
    ["Ventes réalisées (statut « completed ») — les remboursements passent par écritures OD."]
  );
  return rows;
}
