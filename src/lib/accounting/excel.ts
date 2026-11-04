// src/lib/accounting/excel.ts
// Générateur de classeurs Excel professionnels (.xlsx) pour Kènè Pro
// Mise en page soignée, largeurs automatiques, alignements financiers FCFA et styles signature or/terre.

import * as ExcelJS from "exceljs";
import type { JournalExportEntry, SaleExportRow, CsvMeta } from "./csv";
import type { BalanceRow, FinancialStatements } from "./syscohada";

// ── Palette Kènè ──
const COLOR_HEADER_BG = "FFF4E6"; // Crème or clair
const COLOR_HEADER_TEXT = "5A3E1B"; // Terre sombre
const COLOR_BORDER = "E5D5C0"; // Séparateur sable
const COLOR_TOTAL_BG = "FAF5EE"; // Fond totaux

/** Applique un style standard à l'en-tête de section */
function applyMetaHeader(ws: ExcelJS.Worksheet, title: string, meta: CsvMeta) {
  // Ligne 1 : Titre principal
  const r1 = ws.addRow([`KÈNÈ PRO — ${title.toUpperCase()}`]);
  r1.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FF4A341B" } };
  ws.mergeCells(r1.number, 1, r1.number, 6);

  // Ligne 2 : Établissement
  const r2 = ws.addRow([meta.tenantCity ? `${meta.tenantName} (${meta.tenantCity})` : meta.tenantName]);
  r2.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FF7C5E33" } };

  // Ligne 3 : Période et date
  const periodText = meta.from
    ? `Période : du ${formatDateFR(meta.from)}${meta.to ? ` au ${formatDateFR(meta.to)}` : ""}`
    : "Période : Intégralité de l'historique";
  const r3 = ws.addRow([`${periodText} · Édité le ${formatDateFR(new Date())} · Montants en FCFA`]);
  r3.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF888888" } };

  // Ligne vide
  ws.addRow([]);
}

function formatDateFR(d: string | Date): string {
  const n = new Date(d);
  if (Number.isNaN(n.getTime())) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()}`;
}

/** Formate la ligne d'en-tête d'un tableau de données */
function styleTableHeaders(row: ExcelJS.Row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_HEADER_BG },
    };
    cell.font = {
      name: "Segoe UI",
      size: 10,
      bold: true,
      color: { argb: COLOR_HEADER_TEXT },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: COLOR_BORDER } },
      bottom: { style: "medium", color: { argb: "FFC5A880" } },
      left: { style: "thin", color: { argb: COLOR_BORDER } },
      right: { style: "thin", color: { argb: COLOR_BORDER } },
    };
  });
}

/** Ajuste automatiquement la largeur des colonnes avec un minimum esthétique */
function autoFitColumns(ws: ExcelJS.Worksheet, minWidths: number[] = []) {
  ws.columns.forEach((column, idx) => {
    let maxLen = 0;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    const minW = minWidths[idx] ?? 12;
    column.width = Math.max(maxLen + 3, minW);
  });
}

// ─────────────────────────────────────────────────────────────
// 1. LIVRE DES VENTES EXCEL
// ─────────────────────────────────────────────────────────────
export async function buildSalesBookExcel(meta: CsvMeta, sales: SaleExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kènè Pro";
  wb.created = new Date();

  const ws = wb.addWorksheet("Livre des Ventes", {
    views: [{ showGridLines: true }],
  });

  applyMetaHeader(ws, "Livre des Ventes & Encaissements", meta);

  const headerRow = ws.addRow([
    "Date",
    "Réf Vente",
    "Cliente",
    "Nb Articles",
    "Prestations (FCFA)",
    "Produits (FCFA)",
    "Sous-total",
    "Remise",
    "Total HT",
    "TVA (18%)",
    "Total TTC (FCFA)",
    "Mode de Paiement",
    "Réf Transaction",
    "Caissière",
  ]);
  styleTableHeaders(headerRow);

  let totSvc = 0;
  let totProd = 0;
  let totSub = 0;
  let totDisc = 0;
  let totHT = 0;
  let totTVA = 0;
  let totTTC = 0;

  for (const s of sales) {
    const ht = s.total - s.tvaAmount;
    const r = ws.addRow([
      formatDateFR(s.date),
      s.ref ?? "-",
      s.clientName ?? "Cliente de passage",
      s.itemCount,
      s.servicesAmount,
      s.productsAmount,
      s.subtotal,
      s.discount,
      ht,
      s.tvaAmount,
      s.total,
      s.paymentMethod.toUpperCase(),
      s.paymentRef ?? "-",
      s.cashierName,
    ]);

    // Alignements
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(4).alignment = { horizontal: "center" };
    r.getCell(12).alignment = { horizontal: "center" };

    // Format numérique monétaire
    for (const c of [5, 6, 7, 8, 9, 10, 11]) {
      const cell = r.getCell(c);
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
    }

    totSvc += s.servicesAmount;
    totProd += s.productsAmount;
    totSub += s.subtotal;
    totDisc += s.discount;
    totHT += ht;
    totTVA += s.tvaAmount;
    totTTC += s.total;
  }

  // Ligne de totaux
  const totRow = ws.addRow([
    "TOTAUX",
    "",
    `${sales.length} ventes`,
    "",
    totSvc,
    totProd,
    totSub,
    totDisc,
    totHT,
    totTVA,
    totTTC,
    "",
    "",
    "",
  ]);
  totRow.height = 24;
  totRow.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTAL_BG } };
    cell.font = { name: "Segoe UI", bold: true, color: { argb: "FF2E1E0F" } };
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } };
    if ([5, 6, 7, 8, 9, 10, 11].includes(col)) {
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
    }
  });

  autoFitColumns(ws, [12, 16, 22, 12, 16, 16, 16, 12, 16, 14, 18, 16, 18, 16]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─────────────────────────────────────────────────────────────
// 2. JOURNAL DES ÉCRITURES COMPTABLES
// ─────────────────────────────────────────────────────────────
export async function buildJournalExcel(meta: CsvMeta, entries: JournalExportEntry[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kènè Pro";
  const ws = wb.addWorksheet("Journal", { views: [{ showGridLines: true }] });

  applyMetaHeader(ws, "Journal des Écritures (SYSCOHADA)", meta);

  const headerRow = ws.addRow([
    "Date",
    "Journal",
    "N° Pièce",
    "Description de l'Opération",
    "Compte",
    "Intitulé du Compte",
    "Libellé Ligne",
    "Débit (FCFA)",
    "Crédit (FCFA)",
  ]);
  styleTableHeaders(headerRow);

  let totD = 0;
  let totC = 0;

  for (const e of entries) {
    for (const l of e.lines) {
      const r = ws.addRow([
        formatDateFR(e.date),
        e.journalCode,
        e.reference,
        e.description,
        l.account?.code ?? "?",
        l.account?.label ?? "Compte supprimé",
        l.label ?? "-",
        l.debit,
        l.credit,
      ]);

      r.getCell(1).alignment = { horizontal: "center" };
      r.getCell(2).alignment = { horizontal: "center" };
      r.getCell(3).alignment = { horizontal: "center" };
      r.getCell(5).alignment = { horizontal: "center" };

      const debitCell = r.getCell(8);
      const creditCell = r.getCell(9);
      debitCell.numFmt = "#,##0";
      debitCell.alignment = { horizontal: "right" };
      creditCell.numFmt = "#,##0";
      creditCell.alignment = { horizontal: "right" };

      totD += l.debit;
      totC += l.credit;
    }
  }

  const totRow = ws.addRow(["TOTAUX", "", "", "", "", "", "", totD, totC]);
  totRow.height = 24;
  totRow.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTAL_BG } };
    cell.font = { name: "Segoe UI", bold: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } };
    if (col >= 8) {
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
    }
  });

  autoFitColumns(ws, [12, 10, 16, 30, 10, 26, 26, 16, 16]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─────────────────────────────────────────────────────────────
// 3. BALANCE GÉNÉRALE DES COMPTES
// ─────────────────────────────────────────────────────────────
export async function buildBalanceExcel(meta: CsvMeta, balance: BalanceRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kènè Pro";
  const ws = wb.addWorksheet("Balance Générale", { views: [{ showGridLines: true }] });

  applyMetaHeader(ws, "Balance Générale des Comptes (SYSCOHADA)", meta);

  const headerRow = ws.addRow([
    "Compte",
    "Classe",
    "Intitulé du Compte",
    "Type",
    "Total Débit (FCFA)",
    "Total Crédit (FCFA)",
    "Solde Débiteur (FCFA)",
    "Solde Créditeur (FCFA)",
  ]);
  styleTableHeaders(headerRow);

  let totD = 0;
  let totC = 0;

  for (const b of balance) {
    const sDeb = b.solde > 0 ? b.solde : 0;
    const sCred = b.solde < 0 ? -b.solde : 0;
    const r = ws.addRow([
      b.accountCode,
      b.classe,
      b.accountLabel,
      b.type.toUpperCase(),
      b.totalDebit,
      b.totalCredit,
      sDeb,
      sCred,
    ]);

    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(4).alignment = { horizontal: "center" };

    for (const c of [5, 6, 7, 8]) {
      const cell = r.getCell(c);
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
    }

    totD += b.totalDebit;
    totC += b.totalCredit;
  }

  const totRow = ws.addRow(["TOTAUX", "", "", "", totD, totC, "", ""]);
  totRow.height = 24;
  totRow.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTAL_BG } };
    cell.font = { name: "Segoe UI", bold: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } };
    if (col >= 5) {
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right" };
    }
  });

  autoFitColumns(ws, [12, 10, 30, 12, 18, 18, 18, 18]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─────────────────────────────────────────────────────────────
// 4. FEUILLE D'ÉMARGEMENT & HISTORIQUE DES POINTAGES (RH)
// ─────────────────────────────────────────────────────────────
export interface AttendanceExportRow {
  date: string | Date;
  employeeName: string;
  role: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number;
  status: "present" | "late" | "absent" | "leave";
  notes?: string | null;
}

export async function buildAttendanceExcel(
  meta: CsvMeta,
  records: AttendanceExportRow[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kènè Pro";
  const ws = wb.addWorksheet("Émargement & Pointages", { views: [{ showGridLines: true }] });

  applyMetaHeader(ws, "Feuille d'Émargement & Suivi des Présences", meta);

  const headerRow = ws.addRow([
    "Date",
    "Collaboratrice",
    "Poste / Rôle",
    "Heure d'Arrivée",
    "Heure de Départ",
    "Heures Réalisées",
    "Statut de Présence",
    "Signature / Visa",
  ]);
  styleTableHeaders(headerRow);

  let totalHours = 0;

  for (const r of records) {
    const statusLabel =
      r.status === "present"
        ? "Présente"
        : r.status === "late"
        ? "En retard"
        : r.status === "leave"
        ? "En congé"
        : "Absente";

    const row = ws.addRow([
      formatDateFR(r.date),
      r.employeeName,
      r.role,
      r.checkIn ?? "--:--",
      r.checkOut ?? "--:--",
      r.hoursWorked,
      statusLabel,
      "", // Colonne libre pour émargement physique si imprimé
    ]);

    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(5).alignment = { horizontal: "center" };
    row.getCell(6).alignment = { horizontal: "center" };
    row.getCell(7).alignment = { horizontal: "center" };

    // Couleur d'état
    const statusCell = row.getCell(7);
    if (r.status === "present") statusCell.font = { color: { argb: "FF0D7A46" }, bold: true };
    else if (r.status === "late") statusCell.font = { color: { argb: "FFB45309" }, bold: true };
    else if (r.status === "absent") statusCell.font = { color: { argb: "FFB91C1C" }, bold: true };

    totalHours += r.hoursWorked;
  }

  const totRow = ws.addRow([
    "TOTAL HEURES",
    "",
    "",
    "",
    "",
    totalHours,
    `${records.length} pointages`,
    "",
  ]);
  totRow.height = 24;
  totRow.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTAL_BG } };
    cell.font = { name: "Segoe UI", bold: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } };
  });

  autoFitColumns(ws, [14, 25, 20, 16, 16, 16, 18, 20]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
