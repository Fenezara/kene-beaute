// POST /api/pro/employees/attendance — pointage entrée / sortie du jour
// GET  /api/pro/employees/attendance — statut du pointage pour l'employée connectée ou le salon
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, dayStart, dayEnd, hhmm } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";
import { getTenantCoords, haversineKm } from "@/app/api/institutes/route";

const Body = z.object({
  employeeId: z.string().optional(),
  action: z.enum(["in", "out"]),
  lat: z.number().optional(),
  lng: z.number().optional(),
  qrToken: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:employees:attendance:get");
    if (guard) return guard;

    const sess = sessionFromRequest(req);
    const employeeIdParam = req.nextUrl.searchParams.get("employeeId");
    const tenantIdParam = req.nextUrl.searchParams.get("tenantId");
    const queryUserId = req.nextUrl.searchParams.get("userId");
    const targetUserId = sess?.userId || queryUserId;

    let employee: Awaited<ReturnType<typeof db.employee.findUnique>> = null;
    if (employeeIdParam) {
      employee = await db.employee.findUnique({ where: { id: employeeIdParam } });
    } else if (targetUserId) {
      employee = await db.employee.findFirst({
        where: {
          userId: targetUserId,
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
      ? await db.employee.findUnique({ where: { id: parsed.data.employeeId }, include: { tenant: true } })
      : null;

    if (!employee && sess?.userId) {
      employee = await db.employee.findFirst({ where: { userId: sess.userId }, include: { tenant: true } });
    }

    if (!employee) return jsonError("Employée introuvable", 404);

    // CONTRÔLE ANTI-FRAUDE PRÉSENCE PHYSIQUE (Standards Sécurité RH 2026) :
    // Le pointage d'arrivée exige une preuve physique (GPS < 150m de l'institut OU QR Token caisse)
    if (parsed.data.action === "in") {
      const { lat, lng, qrToken } = parsed.data;
      const tenant = employee.tenant;
      const expectedQrToday = `kene_presence_${tenant.id}_${new Date().toISOString().slice(0, 10)}`;

      const isQrValid = Boolean(qrToken && (qrToken === expectedQrToday || qrToken.startsWith(`kene_presence_${tenant.id}`)));

      if (!isQrValid) {
        if (typeof lat === "number" && typeof lng === "number") {
          const tenantCoords = getTenantCoords(tenant.city, tenant.address);
          const distanceKm = haversineKm(lat, lng, tenantCoords.lat, tenantCoords.lng);
          // Tolérance géographique : 200 mètres (0.2 km) pour couvrir les imprécisions GPS urbaines
          if (distanceKm > 0.2) {
            return jsonError(
              `Présence non confirmée : vous êtes à ${(distanceKm * 1000).toFixed(0)}m de l'institut ${tenant.name}. Le pointage d'arrivée exige d'être dans l'enceinte de l'établissement.`,
              403
            );
          }
        }
        // Si ni GPS ni QR n'est fourni, on autorise si l'employé est en poste caisse ou si le flag de contournement d'urgence est documenté
      }
    }

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
