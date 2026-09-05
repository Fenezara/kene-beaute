// GET /api/pro/accounting/export?tenantId=&type=journal|balance|liasse|ventes&from=&to=&format=csv|pdf
// CSV : fichiers Excel FR téléchargeables — données COMPLÈTES (pas de plafond 60) + filtre période.
// PDF : réservé au type « liasse » — dossier complet multi-pages (compte de résultat, TVA,
// bilan, balance, journal, livre des ventes) généré sans dépendance externe.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeBalance, buildStatements } from "@/lib/accounting/syscohada";
import { liassePdf, liassePdfFilename } from "@/lib/accounting/pdf";
import {
  toCsv,
  journalCsvRows,
  balanceCsvRows,
  liasseCsvRows,
  salesBookCsvRows,
  exportFilename,
  EXPORT_TYPE_LABELS,
  EXPORT_TYPES,
  type CsvCell,
  type ExportType,
} from "@/lib/accounting/csv";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

/** "2026-08-01" | ISO → Date ; undefined si absent, null si présent mais invalide */
function parseDay(v: string | null): Date | undefined | null {
  if (!v) return undefined;
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(23, 59, 59, 999);
  return n;
}

export async function GET(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : export navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:accounting:export");
    if (guard) return guard;

    const sp = req.nextUrl.searchParams;
    const tenant = await resolveTenant(sp.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const typeParam = sp.get("type") ?? "journal";
    if (!EXPORT_TYPES.includes(typeParam as ExportType)) {
      return jsonError(`Type d'export inconnu « ${typeParam} » — types acceptés : ${EXPORT_TYPES.join(", ")}`, 400);
    }
    const type = typeParam as ExportType;

    const formatParam = (sp.get("format") ?? "csv").toLowerCase();
    if (formatParam !== "csv" && formatParam !== "pdf") {
      return jsonError(`Format d'export inconnu « ${formatParam} » — formats acceptés : csv, pdf`, 400);
    }
    if (formatParam === "pdf" && type !== "liasse") {
      return jsonError("Le format PDF est réservé au type « liasse » (dossier complet) — journal, balance et ventes s'exportent en CSV", 400);
    }

    const from = parseDay(sp.get("from"));
    const toRaw = parseDay(sp.get("to"));
    if (from === null) return jsonError("Paramètre « from » invalide — format attendu AAAA-MM-JJ", 400);
    if (toRaw === null) return jsonError("Paramètre « to » invalide — format attendu AAAA-MM-JJ", 400);
    const to = toRaw ? endOfDay(toRaw) : undefined;

    const dateFilter = from || to ? { gte: from, lte: to } : undefined;

    // ── PDF : la liasse complète (toutes sections, une seule requête) ──
    if (formatParam === "pdf") {
      const [entries, accounts, sales] = await Promise.all([
        db.journalEntry.findMany({
          where: { tenantId: tenant.id, ...(dateFilter ? { date: dateFilter } : {}) },
          include: {
            lines: { include: { account: { select: { code: true, label: true } } }, orderBy: { id: "asc" } },
          },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        }),
        db.chartAccount.findMany({ where: { tenantId: tenant.id } }),
        db.sale.findMany({
          where: { tenantId: tenant.id, status: "completed", ...(dateFilter ? { createdAt: dateFilter } : {}) },
          include: { items: true, clientProfile: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      const accountsMap = new Map(accounts.map((a) => [a.code, { code: a.code, label: a.label, classe: a.classe, type: a.type }]));
      const flatLines = entries.flatMap((e) =>
        e.lines.map((l) => ({ accountCode: l.account?.code ?? "?", debit: l.debit, credit: l.credit }))
      );
      const balance = computeBalance(flatLines, accountsMap);
      const statements = buildStatements(balance);
      const pdf = liassePdf({
        tenantName: tenant.name,
        tenantCity: tenant.city,
        from,
        to,
        entries,
        balance,
        statements,
        sales: sales.map((s) => {
          const servicesAmount = s.items.filter((i) => i.kind === "service").reduce((t2, i) => t2 + i.total, 0);
          const productsAmount = s.items.filter((i) => i.kind === "product").reduce((t2, i) => t2 + i.total, 0);
          return {
            date: s.createdAt,
            ref: s.paymentRef,
            clientName: s.clientProfile?.name ?? null,
            itemCount: s.items.length,
            servicesAmount,
            productsAmount,
            subtotal: s.subtotal,
            discount: s.discount,
            total: s.total,
            tvaAmount: s.tvaAmount,
            paymentMethod: s.paymentMethod,
            paymentRef: s.paymentRef,
            cashierName: s.cashierName,
          };
        }),
      });
      return new NextResponse(new Uint8Array(pdf.data), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(pdf.data.length),
          "Content-Disposition": `attachment; filename="${liassePdfFilename(from, to)}"`,
          "X-Rows-Count": String(entries.length + sales.length + balance.length),
          "X-Pages-Count": String(pdf.pages),
          "X-Export-Type": "Liasse PDF (dossier complet)",
          "Cache-Control": "no-store",
        },
      });
    }

    let rows: CsvCell[][] = [];
    let count = 0;

    switch (type) {
      case "journal": {
        const entries = await db.journalEntry.findMany({
          where: { tenantId: tenant.id, ...(dateFilter ? { date: dateFilter } : {}) },
          include: {
            lines: { include: { account: { select: { code: true, label: true } } }, orderBy: { id: "asc" } },
          },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        });
        count = entries.length;
        rows = journalCsvRows(
          { tenantName: tenant.name, tenantCity: tenant.city, type, from, to, countLabel: `${entries.length} écritures` },
          entries
        );
        break;
      }
      case "balance":
      case "liasse": {
        const [entries, accounts] = await Promise.all([
          db.journalEntry.findMany({
            where: { tenantId: tenant.id, ...(dateFilter ? { date: dateFilter } : {}) },
            include: {
              lines: { include: { account: { select: { code: true, label: true } } }, orderBy: { id: "asc" } },
            },
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          }),
          db.chartAccount.findMany({ where: { tenantId: tenant.id } }),
        ]);
        const accountsMap = new Map(accounts.map((a) => [a.code, { code: a.code, label: a.label, classe: a.classe, type: a.type }]));
        const flatLines = entries.flatMap((e) =>
          e.lines.map((l) => ({ accountCode: l.account?.code ?? "?", debit: l.debit, credit: l.credit }))
        );
        const balance = computeBalance(flatLines, accountsMap);
        if (type === "balance") {
          count = balance.length;
          rows = balanceCsvRows(
            { tenantName: tenant.name, tenantCity: tenant.city, type, from, to, countLabel: `${balance.length} comptes mouvementés` },
            balance
          );
        } else {
          const statements = buildStatements(balance);
          count = entries.length;
          rows = liasseCsvRows(
            { tenantName: tenant.name, tenantCity: tenant.city, type, from, to, countLabel: `${entries.length} écritures consolidées` },
            statements
          );
        }
        break;
      }
      case "ventes": {
        const sales = await db.sale.findMany({
          where: { tenantId: tenant.id, status: "completed", ...(dateFilter ? { createdAt: dateFilter } : {}) },
          include: { items: true, clientProfile: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        });
        count = sales.length;
        rows = salesBookCsvRows(
          { tenantName: tenant.name, tenantCity: tenant.city, type, from, to, countLabel: `${sales.length} ventes réalisées` },
          sales.map((s) => {
            const servicesAmount = s.items.filter((i) => i.kind === "service").reduce((t, i) => t + i.total, 0);
            const productsAmount = s.items.filter((i) => i.kind === "product").reduce((t, i) => t + i.total, 0);
            return {
              date: s.createdAt,
              ref: s.paymentRef,
              clientName: s.clientProfile?.name ?? null,
              itemCount: s.items.length,
              servicesAmount,
              productsAmount,
              subtotal: s.subtotal,
              discount: s.discount,
              total: s.total,
              tvaAmount: s.tvaAmount,
              paymentMethod: s.paymentMethod,
              paymentRef: s.paymentRef,
              cashierName: s.cashierName,
            };
          })
        );
        break;
      }
    }

    const csv = toCsv(rows);
    const filename = exportFilename(type, from, to);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Rows-Count": String(count),
        "X-Export-Type": EXPORT_TYPE_LABELS[type],
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError("pro/accounting/export:get", err);
  }
}
