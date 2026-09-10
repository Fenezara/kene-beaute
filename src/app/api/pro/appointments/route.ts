// GET /api/pro/appointments?tenantId=&from=&to= | POST — création côté institut (confirmé)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, overlaps, dayEnd, notify } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

const include = {
  service: { select: { name: true, durationMin: true, price: true } },
  resource: { select: { name: true, color: true } },
  clientProfile: { select: { id: true, name: true, phone: true, rfmSegment: true } },
};

export async function GET(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:appointments:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");

    let from: Date;
    let to: Date;
    if (fromParam && !Number.isNaN(new Date(fromParam).getTime())) {
      from = new Date(fromParam);
    } else {
      from = new Date();
      from.setDate(from.getDate() - 7);
      from.setHours(0, 0, 0, 0);
    }
    if (toParam && !Number.isNaN(new Date(toParam).getTime())) {
      to = dayEnd(new Date(toParam));
    } else {
      to = new Date();
      to.setDate(to.getDate() + 7);
      to.setHours(23, 59, 59, 999);
    }

    const appointments = await db.appointment.findMany({
      where: { tenantId: tenant.id, startAt: { gte: from, lte: to } },
      include,
      orderBy: { startAt: "asc" },
    });
    return NextResponse.json({ appointments });
  } catch (err) {
    return serverError("pro/appointments:get", err);
  }
}

const CreateBody = z.object({
  tenantId: z.string().min(1),
  clientName: z.string().trim().min(1),
  clientPhone: z.string().trim().min(5),
  clientProfileId: z.string().optional(),
  serviceId: z.string().min(1),
  resourceId: z.string().min(1),
  startAt: z.string().min(10),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : avec cookie, la création de
    // RDV côté institut exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:appointments:post");
    if (guard) return guard;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, clientName, clientPhone, clientProfileId, serviceId, resourceId, notes } = parsed.data;
    const start = new Date(parsed.data.startAt);
    if (Number.isNaN(start.getTime())) return jsonError("Date de début invalide", 400);

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const service = await db.service.findFirst({ where: { id: serviceId, tenantId, active: true } });
    if (!service) return jsonError("Service introuvable", 404);
    const resource = await db.resource.findFirst({ where: { id: resourceId, tenantId, active: true } });
    if (!resource) return jsonError("Praticienne introuvable", 404);

    // Résolution / création de la fiche cliente CRM
    let profileId: string | null = null;
    if (clientProfileId && clientProfileId !== "new") {
      const profile = await db.clientProfile.findFirst({ where: { id: clientProfileId, tenantId } });
      if (!profile) return jsonError("Fiche cliente introuvable", 404);
      profileId = profile.id;
    } else {
      const existing = await db.clientProfile.findFirst({ where: { tenantId, phone: clientPhone } });
      if (existing) {
        profileId = existing.id;
      } else {
        const created = await db.clientProfile.create({
          data: { tenantId, name: clientName, phone: clientPhone, rfmSegment: "Nouveaux" },
        });
        profileId = created.id;
      }
    }

    // Anti-chevauchement
    const sameDay = await db.appointment.findMany({
      where: {
        resourceId,
        status: { notIn: ["cancelled", "no_show"] },
        startAt: { gte: new Date(start.getTime() - 24 * 3_600_000), lte: dayEnd(start) },
      },
      select: { startAt: true, durationMin: true },
    });
    if (sameDay.some((a) => overlaps(start, service.durationMin, a.startAt, a.durationMin))) {
      return jsonError("Ce créneau est déjà réservé pour cette praticienne", 409);
    }

    const appointment = await db.appointment.create({
      data: {
        tenantId,
        clientProfileId: profileId,
        clientName,
        clientPhone,
        serviceId,
        resourceId,
        startAt: start,
        durationMin: service.durationMin,
        status: "confirmed",
        price: service.price,
        notes: notes ?? null,
      },
      include,
    });

    await notify({
      tenantId,
      channel: "sms",
      toPhone: clientPhone,
      message: `Kènè : RDV confirmé ✅ ${service.name} avec ${resource.name} — à bientôt chez ${tenant.name} !`,
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err) {
    return serverError("pro/appointments:post", err);
  }
}
