// POST /api/pro/employees/attendance — pointage entrée / sortie du jour
// GET  /api/pro/employees/attendance — statut du pointage pour l'employée connectée ou le salon
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, dayStart, dayEnd, hhmm } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";

const Body = z.object({
  employeeId: z.string().optional(),
  action: z.enum(["in", "out"]),
});

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:employees:attendance:get");
    if (guard) return guard;

    const sess = sessionFromRequest(req);
    const employeeIdParam = req.nextUrl.searchParams.get("employeeId");
    const tenantIdParam = req.nextUrl.searchParams.get("tenantId");

    let employee = null;
    if (employeeIdParam) {
      employee = await db.employee.findUnique({ where: { id: employeeIdParam } });
    } else if (sess?.userId) {
      employee = await db.employee.findFirst({
        where: {
          userId: sess.userId,
          ...(tenantIdParam ? { tenantId: tenantIdParam } : {}),
        },
      });
    }

    if (!employee) {
      return NextResponse.json({ attendance: null, employee: null });
    }

    const attendance = await db.attendance.findFirst({
      where: { employeeId: employee.id, date: { gte: dayStart(), lte: dayEnd() } },
    });

    return NextResponse.json({
      attendance,
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        tenantId: employee.tenantId,
      },
    });
  } catch (err) {
    return serverError("pro/employees/attendance:get", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:employees:attendance");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const sess = sessionFromRequest(req);
    let employee = parsed.data.employeeId
      ? await db.employee.findUnique({ where: { id: parsed.data.employeeId } })
      : null;

    if (!employee && sess?.userId) {
      employee = await db.employee.findFirst({ where: { userId: sess.userId } });
    }

    if (!employee) return jsonError("Employée introuvable", 404);

    const now = new Date();

    // Règle d'entreprise stricte : une personne en congé ne peut pas pointer ni intervenir
    const leave = await db.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: "approved",
        startDate: { lte: dayEnd(now) },
        endDate: { gte: dayStart(now) },
      },
    });
    if (leave) {
      return jsonError(
        `${employee.name} est actuellement en ${leave.type === "maladie" ? "arrêt maladie" : "congé"} (du ${leave.startDate.toLocaleDateString("fr-FR")} au ${leave.endDate.toLocaleDateString("fr-FR")}). Pointage impossible.`,
        403
      );
    }

    const existing = await db.attendance.findFirst({
      where: { employeeId: employee.id, date: { gte: dayStart(), lte: dayEnd() } },
    });

    if (parsed.data.action === "in") {
      const time = hhmm(now);
      const minutes = now.getHours() * 60 + now.getMinutes();
      const status = minutes > 9 * 60 + 15 ? "late" : "present";
      const attendance = existing
        ? await db.attendance.update({ where: { id: existing.id }, data: { checkIn: time, status } })
        : await db.attendance.create({ data: { employeeId: employee.id, date: now, checkIn: time, status } });
      return NextResponse.json({ attendance, employee });
    }

    // action "out"
    const time = hhmm(now);
    if (!existing) {
      const attendance = await db.attendance.create({
        data: { employeeId: employee.id, date: now, checkOut: time, hours: 8 },
      });
      return NextResponse.json({ attendance, employee });
    }

    let hours = existing.hours;
    if (existing.checkIn) {
      const [h, m] = existing.checkIn.split(":").map(Number);
      hours = Math.max(0, Math.round(((now.getHours() * 60 + now.getMinutes()) - (h * 60 + m)) / 6) / 10);
    }
    const attendance = await db.attendance.update({
      where: { id: existing.id },
      data: { checkOut: time, hours },
    });
    return NextResponse.json({ attendance, employee });
  } catch (err) {
    return serverError("pro/employees/attendance", err);
  }
}
