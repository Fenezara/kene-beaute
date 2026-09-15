// GET/POST/PATCH /api/pro/leaves — congés & absences du personnel.
// GET    : liste (en attente d'abord, puis par date) + soldes estimés.
// POST   : pose un congé (pending par défaut, ou approuvé d'emblée).
// PATCH  : tranche une demande en attente (approve | reject, avec note).
// Règles : isolation stricte par institut (resolveTenant), chevauchement
// interdit (409), jours ouvrés calculés côté serveur (dimanche exclu),
// solde estimé 2 j/mois travaillé plafonné à 24 j (congés maladie et
// maternité ne décomptent pas le solde annuel). L'employée liée à un
// compte app reçoit une notification à l'approbation / au refus.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, notify } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { formatDate } from "@/lib/kene/format";

/** Jours ouverts (tous les jours sauf dimanche — semaine des instituts). */
function countWorkingDays(start: Date, end: Date): number {
  let days = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (cur <= stop) {
    if (cur.getDay() !== 0) days += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Solde estimé : 2 j par mois travaillé (plafond 24 j) − congés pris. */
function balanceFor(
  emp: { id: string; hireDate: Date },
  takenByEmployee: Map<string, number>,
): { employeeId: string; earned: number; taken: number; balance: number } {
  const months = Math.max(
    0,
    Math.floor((Date.now() - emp.hireDate.getTime()) / (30.44 * 24 * 3600 * 1000)),
  );
  const earned = Math.min(24, months * 2);
  const taken = takenByEmployee.get(emp.id) ?? 0;
  return { employeeId: emp.id, earned, taken, balance: earned - taken };
}

/** Notifie le compte app de l'employée (si lié) — best effort. */
async function notifyEmployee(
  employee: { id: string; name: string; userId: string | null },
  tenantId: string,
  message: string,
) {
  if (!employee.userId) return;
  const user = await db.user.findUnique({ where: { id: employee.userId }, select: { phone: true } });
  if (!user) return;
  await notify({ userId: employee.userId, tenantId, channel: "app", toPhone: user.phone, message });
}

/* ─────────────────────────── GET — liste + soldes ─────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:leaves:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [leaves, employees] = await Promise.all([
      db.leaveRequest.findMany({
        where: { tenantId: tenant.id },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: [{ status: "asc" }, { startDate: "desc" }], // pending d'abord, puis par date
        take: 150,
      }),
      db.employee.findMany({ where: { tenantId: tenant.id }, select: { id: true, hireDate: true, active: true } }),
    ]);

    const takenByEmployee = new Map<string, number>();
    for (const l of leaves) {
      if (l.status === "approved" && l.type === "conge") {
        takenByEmployee.set(l.employeeId, (takenByEmployee.get(l.employeeId) ?? 0) + l.days);
      }
    }

    const now = Date.now();
    return NextResponse.json({
      leaves: leaves.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        employeeName: l.employee.name,
        type: l.type,
        startDate: l.startDate,
        endDate: l.endDate,
        days: l.days,
        status: l.status,
        reason: l.reason,
        note: l.note,
        decidedAt: l.decidedAt,
        createdAt: l.createdAt,
        current: l.status === "approved" && l.startDate.getTime() <= now && l.endDate.getTime() >= now,
      })),
      balances: employees.map((e) => balanceFor(e, takenByEmployee)),
    });
  } catch (err) {
    return serverError("pro/leaves:get", err);
  }
}

/* ─────────────────────────── POST — poser un congé ─────────────────────────── */
const PostBody = z.object({
  tenantId: z.string().min(1),
  employeeId: z.string().min(1),
  type: z.enum(["conge", "maladie", "maternite"]).default("conge"),
  startDate: z.string().min(8), // YYYY-MM-DD (heure ignorée)
  endDate: z.string().min(8),
  reason: z.string().trim().max(200).optional(),
  approve: z.boolean().optional(), // approuvé d'emblée (défaut : en attente)
});

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:leaves:post");
    if (guard) return guard;

    const parsed = PostBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, employeeId, type, reason, approve } = parsed.data;

    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.tenantId !== tenant.id) return jsonError("Employée introuvable", 404);
    if (!employee.active) return jsonError("Cette employée est sortie de l'équipe", 409);

    const start = new Date(`${parsed.data.startDate}T00:00:00`);
    const end = new Date(`${parsed.data.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return jsonError("Dates invalides", 400);
    }
    if (end < start) return jsonError("La date de fin précède le début", 400);
    const days = countWorkingDays(start, end);
    if (days < 1) return jsonError("Cette période ne contient aucun jour ouvert (dimanche exclu)", 400);
    if (days > 90) return jsonError("Période trop longue (90 jours ouverts maximum)", 400);

    // Chevauchement avec un congé en attente ou approuvé de la même employée.
    const overlap = await db.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ["pending", "approved"] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap) {
      return jsonError(
        `Congé déjà posé sur cette période (${formatDate(overlap.startDate)} → ${formatDate(overlap.endDate)})`,
        409,
      );
    }

    // Solde (informatif — n'empêche pas la saisie ; maladie/maternité exclues).
    const allLeaves = await db.leaveRequest.findMany({
      where: { tenantId: tenant.id, status: "approved", type: "conge" },
      select: { employeeId: true, days: true },
    });
    const taken = new Map<string, number>();
    for (const l of allLeaves) taken.set(l.employeeId, (taken.get(l.employeeId) ?? 0) + l.days);
    const bal = balanceFor(employee, taken);

    const created = await db.leaveRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId,
        startDate: start,
        endDate: end,
        type,
        days,
        status: approve ? "approved" : "pending",
        reason: reason ?? null,
        decidedAt: approve ? new Date() : null,
      },
    });

    if (approve) {
      await notifyEmployee(
        employee,
        tenant.id,
        `Congé approuvé : ${formatDate(start)} → ${formatDate(end)} (${days} j) — ${tenant.name}`,
      );
    }

    return NextResponse.json(
      {
        leave: { ...created, employeeName: employee.name },
        balance: bal,
        exceedsBalance: type === "conge" && approve && bal.balance - days < 0,
      },
      { status: 201 },
    );
  } catch (err) {
    return serverError("pro:leaves:post", err);
  }
}

/* ────────────────────── PATCH — approuver / refuser ────────────────────── */
const PatchBody = z.object({
  tenantId: z.string().min(1),
  id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(200).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:leaves:patch");
    if (guard) return guard;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, id, action, note } = parsed.data;

    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const leave = await db.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
    if (!leave || leave.tenantId !== tenant.id) return jsonError("Congé introuvable", 404);
    if (leave.status !== "pending") return jsonError("Cette demande est déjà traitée", 409);

    const updated = await db.leaveRequest.update({
      where: { id },
      data: { status: action === "approve" ? "approved" : "rejected", note: note ?? null, decidedAt: new Date() },
    });

    await notifyEmployee(
      leave.employee,
      tenant.id,
      action === "approve"
        ? `Congé approuvé : ${formatDate(leave.startDate)} → ${formatDate(leave.endDate)} (${leave.days} j) — ${tenant.name}`
        : `Demande de congé refusée (${formatDate(leave.startDate)} → ${formatDate(leave.endDate)})${note ? ` — ${note}` : ""} — ${tenant.name}`,
    );

    return NextResponse.json({ leave: { ...updated, employeeName: leave.employee.name } });
  } catch (err) {
    return serverError("pro:leaves:patch", err);
  }
}
