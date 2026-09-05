// POST /api/pro/accounting/manual — écriture OD équilibrée
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

const Body = z.object({
  tenantId: z.string().min(1),
  journalCode: z.enum(["OD", "VE", "BQ", "CA", "PA"]).default("OD"),
  date: z.string().min(8),
  description: z.string().trim().min(3),
  lines: z
    .array(
      z.object({
        accountCode: z.string().min(4),
        debit: z.number().int().min(0).default(0),
        credit: z.number().int().min(0).default(0),
      })
    )
    .min(2),
});

export async function POST(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : avec cookie, l'écriture
    // comptable exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:accounting:manual");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, journalCode, description, lines } = parsed.data;
    const date = new Date(parsed.data.date);
    if (Number.isNaN(date.getTime())) return jsonError("Date invalide", 400);

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const accounts = await db.chartAccount.findMany({ where: { tenantId } });
    const byCode = new Map(accounts.map((a) => [a.code, a]));

    const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (totalDebit !== totalCredit) {
      return jsonError(`Écriture non équilibrée (débit ${totalDebit} ≠ crédit ${totalCredit})`, 400);
    }

    const resolved: { accountId: string; debit: number; credit: number }[] = [];
    for (const l of lines) {
      const acc = byCode.get(l.accountCode);
      if (!acc) return jsonError(`Compte inconnu dans le plan : ${l.accountCode}`, 400);
      if ((l.debit ?? 0) === 0 && (l.credit ?? 0) === 0) continue;
      resolved.push({ accountId: acc.id, debit: l.debit ?? 0, credit: l.credit ?? 0 });
    }
    if (resolved.length < 2) return jsonError("Au moins deux lignes non nulles sont requises", 400);

    const entry = await db.journalEntry.create({
      data: {
        tenantId,
        journalCode,
        date,
        reference: genRef(journalCode),
        description,
        sourceType: "manual",
        lines: { create: resolved.map((l) => ({ ...l, label: description })) },
      },
      include: { lines: { include: { account: { select: { code: true, label: true } } } } },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return serverError("pro/accounting/manual", err);
  }
}
