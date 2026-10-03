// GET /api/institutes/[id]/availability?date=YYYY-MM-DD&serviceId=
// Grille de créneaux 30 min; un créneau est proposé si ≥ 1 praticienne libre
// pour la durée complète du service.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, dayStart, dayEnd, overlaps } from "@/lib/kene/server";
import { generateDaySlots } from "@/lib/kene/rfm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dateStr = req.nextUrl.searchParams.get("date");
    const serviceId = req.nextUrl.searchParams.get("serviceId");

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return jsonError("Paramètre date (YYYY-MM-DD) requis", 400);

    const tenant = await db.tenant.findUnique({ where: { id } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const date = dayStart(new Date(`${dateStr}T00:00:00`));
    if (Number.isNaN(date.getTime())) return jsonError("Date invalide", 400);

    const service = serviceId
      ? await db.service.findFirst({ where: { id: serviceId, tenantId: id, active: true } })
      : null;
    const durationMin = service?.durationMin ?? 30;

    const resources = await db.resource.findMany({ where: { tenantId: id, active: true } });
    if (resources.length === 0) return NextResponse.json({ slots: [] });

    // Grille des libellés 30 min via la lib métier (gère aussi « date passée »)
    const grid = generateDaySlots(date, tenant.openingHour, tenant.closingHour, 30, [], undefined);

    const bookedByResource = new Map<string, { startAt: Date; durationMin: number }[]>();
    for (const r of resources) {
      const appts = await db.appointment.findMany({
        where: {
          resourceId: r.id,
          startAt: { gte: dayStart(date), lte: dayEnd(date) },
          status: { notIn: ["cancelled", "no_show"] },
        },
        select: { startAt: true, durationMin: true },
      });
      bookedByResource.set(r.id, appts);
    }

    const now = new Date();
    const dayClose = dayStart(date);
    dayClose.setHours(tenant.closingHour, 0, 0, 0);

    const slots = grid.map(({ time }) => {
      const [h, m] = time.split(":").map(Number);
      const slotStart = dayStart(date);
      slotStart.setHours(h, m, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + durationMin * 60_000);

      const freeResourceIds = resources
        .filter((r) => {
          if (slotStart < now || slotEnd > dayClose) return false; // passé ou au-delà de la fermeture
          return !(bookedByResource.get(r.id) ?? []).some((b) => overlaps(slotStart, durationMin, b.startAt, b.durationMin));
        })
        .map((r) => r.id);

      return { time, available: freeResourceIds.length > 0, resourceIds: freeResourceIds };
    });

    return NextResponse.json({ slots });
  } catch (err) {
    return serverError("institutes/[id]/availability", err);
  }
}
