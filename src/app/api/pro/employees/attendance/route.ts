// POST /api/pro/employees/attendance — pointage entrée / sortie du jour
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, dayStart, dayEnd, hhmm } from "@/lib/kene/server";

const Body = z.object({
  employeeId: z.string().min(1),
  action: z.enum(["in", "out"]),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const employee = await db.employee.findUnique({ where: { id: parsed.data.employeeId } });
    if (!employee) return jsonError("Employée introuvable", 404);

    const now = new Date();
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
      return NextResponse.json({ attendance });
    }

    // action "out"
    const time = hhmm(now);
    if (!existing) {
      const attendance = await db.attendance.create({
        data: { employeeId: employee.id, date: now, checkOut: time, hours: 8 },
      });
      return NextResponse.json({ attendance });
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
    return NextResponse.json({ attendance });
  } catch (err) {
    return serverError("pro/employees/attendance", err);
  }
}
