// POST /api/pro/employees/attendance — pointage entrée / sortie du jour
// GET  /api/pro/employees/attendance — statut du pointage pour l'employée connectée ou le salon
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, dayStart, dayEnd, hhmm, resolveTenant } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";
import { getTenantCoords, haversineKm } from "@/app/api/institutes/route";
import {
  parseEmployeeScheduleFromRaw,
  timeHHMMToMinutes,
  isValidTimeHHMM,
} from "@/lib/kene/hr-constants";

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

    const authorizedTenant = await resolveTenant(req, employee.tenantId);
    if (!authorizedTenant) {
      return jsonError("Accès non autorisé à cet institut", 403);
    }

    const attendance = await db.attendance.findFirst({
      where: { employeeId: employee.id, date: { gte: dayStart(), lte: dayEnd() } },
    });

    const sched = parseEmployeeScheduleFromRaw(employee.permissions);
    const tenantOpen = authorizedTenant.openingHour ?? 9;
    const tenantClose = authorizedTenant.closingHour ?? 19;

    return NextResponse.json({
      attendance,
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        tenantId: employee.tenantId,
        workStart: sched.workStart,
        workEnd: sched.workEnd,
        workDays: sched.workDays,
        tenantOpeningHour: tenantOpen,
        tenantClosingHour: tenantClose,
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

    const authorizedTenant = await resolveTenant(req, employee.tenantId);
    if (!authorizedTenant) {
      return jsonError("Accès non autorisé à cet institut", 403);
    }

    // CONTRÔLE ANTI-FRAUDE PRÉSENCE PHYSIQUE (Standards Sécurité RH 2026) :
    // Le pointage d'arrivée exige impérativement une preuve physique :
    // 1. Soit le QR Code de caisse/présence affiché sur l'écran du salon
    // 2. Soit les coordonnées GPS certifiées à moins de 1000m de l'institut
    if (parsed.data.action === "in") {
      const { lat, lng, qrToken } = parsed.data;
      const tenant = employee.tenant;
      const expectedQrToday = `kene_presence_${tenant.id}_${new Date().toISOString().slice(0, 10)}`;

      const isQrValid = Boolean(qrToken && qrToken === expectedQrToday);

      if (!isQrValid) {
        // Si aucun QR code valide du salon n'est fourni, la géolocalisation GPS est OBLIGATOIRE
        if (typeof lat !== "number" || typeof lng !== "number") {
          return jsonError(
            `Pointage refusé : vous devez être physiquement présente dans l'institut ${tenant.name}. Veuillez activer la géolocalisation de votre téléphone ou scanner le QR code de présence affiché au salon.`,
            403
          );
        }

        const tenantCoords = getTenantCoords(tenant.city, tenant.address);
        const distanceKm = haversineKm(lat, lng, tenantCoords.lat, tenantCoords.lng);
        const distanceMeters = Math.round(distanceKm * 1000);

        // Rayon de tolérance : 1000 mètres (1 km) pour absorber toute dispersion d'antenne relais ou imprécision urbaine
        if (distanceKm > 1.0) {
          return jsonError(
            `Présence non confirmée : vous êtes localisée à ${distanceMeters}m de l'institut ${tenant.name}. Le pointage à distance hors de l'établissement est formellement interdit.`,
            403
          );
        }
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

    const sched = parseEmployeeScheduleFromRaw(employee.permissions);
    const tenantOpenHour = employee.tenant.openingHour ?? 9;
    const tenantCloseHour = employee.tenant.closingHour ?? 19;
    const expectedStartMin = isValidTimeHHMM(sched.workStart)
      ? timeHHMMToMinutes(sched.workStart, tenantOpenHour)
      : tenantOpenHour * 60;
    const expectedEndMin = isValidTimeHHMM(sched.workEnd)
      ? timeHHMMToMinutes(sched.workEnd, tenantCloseHour)
      : tenantCloseHour * 60;
    const expectedDailyHours = Math.max(
      1,
      Math.round(((expectedEndMin - expectedStartMin) / 60) * 10) / 10
    );

    if (parsed.data.action === "in") {
      const time = hhmm(now);
      const minutes = now.getHours() * 60 + now.getMinutes();
      // Tolérance de 15 minutes après l'heure de prise de poste prévue (horaire individuel ou ouverture entreprise)
      const status = minutes > expectedStartMin + 15 ? "late" : "present";
      const attendance = existing
        ? await db.attendance.update({ where: { id: existing.id }, data: { checkIn: time, status } })
        : await db.attendance.create({ data: { employeeId: employee.id, date: now, checkIn: time, status } });
      return NextResponse.json({ attendance, employee });
    }

    // action "out"
    const time = hhmm(now);
    if (!existing) {
      const attendance = await db.attendance.create({
        data: { employeeId: employee.id, date: now, checkOut: time, hours: expectedDailyHours },
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
