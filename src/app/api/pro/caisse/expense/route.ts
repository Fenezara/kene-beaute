// GET /api/pro/caisse/expense?tenantId=&date= | POST — Décaissement / Sortie de Caisse en espèces
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, createJournalEntry, genRef } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

const EXPENSE_ACCOUNT_MAP: Record<string, string> = {
  fournitures: "605000", // Autres achats & consommables (lingettes, savon, cotons...)
  cabine: "602000",      // Achats matières premières & produits soin cabine
  transport: "626000",   // Frais de transport, courses urgentes, taxi
  pause: "605000",       // Ravitaillement, café, eau, collation équipe
  entretien: "615000",   // Entretien matériel, réparations, plomberie
  avance: "421000",      // Avance sur salaire / acompte collaboratrice
  autre: "605000",       // Dépense diverse d'exploitation
};

const Body = z.object({
  tenantId: z.string().min(1),
  amount: z.number().int().min(50).max(5000000),
  reason: z.string().trim().min(2).max(150),
  category: z.string().trim().default("fournitures"),
  beneficiary: z.string().trim().max(80).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:caisse:expense:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const dateParam = req.nextUrl.searchParams.get("date");
    const targetDate = dateParam && !Number.isNaN(new Date(dateParam).getTime()) ? new Date(dateParam) : new Date();

    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const entries = await db.journalEntry.findMany({
      where: {
        tenantId: tenant.id,
        journalCode: "CA",
        sourceType: "cash_expense",
        date: { gte: start, lte: end },
      },
      include: {
        lines: {
          include: { account: { select: { code: true, label: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const expenses = entries.map((e) => {
      // Le montant de la sortie est le crédit sur le compte caisse 571000 (ou le débit sur la charge)
      const cashLine = e.lines.find((l) => l.credit > 0);
      const chargeLine = e.lines.find((l) => l.debit > 0);
      const amount = cashLine?.credit ?? chargeLine?.debit ?? 0;
      return {
        id: e.id,
        reference: e.reference,
        description: e.description,
        amount,
        chargeAccount: chargeLine?.account ? `${chargeLine.account.code} - ${chargeLine.account.label}` : "Charge d'exploitation",
        date: e.date.toISOString(),
        createdAt: e.createdAt.toISOString(),
      };
    });

    const totalAmount = expenses.reduce((s, x) => s + x.amount, 0);

    return NextResponse.json({
      date: targetDate.toISOString(),
      expenses,
      totalAmount,
      count: expenses.length,
    });
  } catch (err) {
    return serverError("pro/caisse/expense:get", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:caisse:expense:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const { tenantId, amount, reason, category, beneficiary } = parsed.data;

    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const chargeCode = EXPENSE_ACCOUNT_MAP[category] ?? "605000";
    const fullDesc = beneficiary?.trim()
      ? `Sortie de caisse : ${reason.trim()} (Bénéficiaire : ${beneficiary.trim()})`
      : `Sortie de caisse : ${reason.trim()}`;

    // Écriture comptable équilibrée au journal de Caisse (CA)
    // Débit : Charge d'exploitation (Classe 6)
    // Crédit : Caisse espèces (571000)
    const entry = await createJournalEntry(tenant.id, {
      journalCode: "CA",
      date: new Date(),
      reference: genRef("DEC"),
      description: fullDesc,
      sourceType: "cash_expense",
      lines: [
        { accountCode: chargeCode, label: reason.trim(), debit: amount },
        { accountCode: "571000", label: "Caisse espèces", credit: amount },
      ],
    });

    // Journal d'audit pour traçabilité et historique Z
    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        entity: "cash_expense",
        action: "disbursement",
        detailsJson: JSON.stringify({
          entryId: entry?.id ?? null,
          reference: entry?.reference ?? null,
          amount,
          reason: reason.trim(),
          category,
          beneficiary: beneficiary?.trim() || null,
          createdAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      expense: {
        reference: entry?.reference ?? genRef("DEC"),
        amount,
        reason: reason.trim(),
        category,
        beneficiary: beneficiary?.trim() || null,
        date: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    return serverError("pro/caisse/expense:post", err);
  }
}
