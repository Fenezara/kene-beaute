// GET /api/pro/accounting?tenantId= — plan SYSCOHADA, journaux, balance, états financiers
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeBalance, buildStatements } from "@/lib/accounting/syscohada";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:accounting:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [accounts, allEntries] = await Promise.all([
      db.chartAccount.findMany({ where: { tenantId: tenant.id }, orderBy: { code: "asc" } }),
      db.journalEntry.findMany({
        where: { tenantId: tenant.id },
        include: {
          lines: {
            include: { account: { select: { code: true, label: true } } },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const entries = allEntries.slice(0, 60).map((e) => ({
      id: e.id,
      journalCode: e.journalCode,
      date: e.date,
      reference: e.reference,
      description: e.description,
      lines: e.lines.map((l) => ({
        account: l.account ? { code: l.account.code, label: l.account.label } : { code: "?", label: "Compte supprimé" },
        debit: l.debit,
        credit: l.credit,
        label: l.label,
      })),
    }));

    // Balance sur TOUTES les écritures
    const accountsMap = new Map(accounts.map((a) => [a.code, { code: a.code, label: a.label, classe: a.classe, type: a.type }]));
    const flatLines = allEntries.flatMap((e) =>
      e.lines.map((l) => ({ accountCode: l.account?.code ?? "?", debit: l.debit, credit: l.credit }))
    );
    const balance = computeBalance(flatLines, accountsMap);
    const statements = buildStatements(balance);

    return NextResponse.json({ tenant, accounts, entries, balance, statements });
  } catch (err) {
    return serverError("pro/accounting:get", err);
  }
}
