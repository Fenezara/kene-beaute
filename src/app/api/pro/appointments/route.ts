// GET /api/pro/appointments?tenantId=&from=&to= | POST — création côté institut (confirmé)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, overlaps, dayEnd, notify, ddMM, hhmm } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { getActiveLeaveForEmployee, formatLeaveBlockedMessage } from "@/lib/kene/leaves";
import { ensureClientProfile } from "@/lib/kene/client-link";
import { canonicalPhone } from "@/lib/kene/phone-normalize";

const include = {
  service: { select: { id: true, name: true, durationMin: true, price: true } },
  resource: { select: { id: true, name: true, color: true } },
  clientProfile: { select: { id: true, name: true, phone: true, rfmSegment: true } },
};

export async function GET(req: NextRequest) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
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

    const pendingOnly = req.nextUrl.searchParams.get("pending") === "1";
    if (pendingOnly) {
      const appointments = await db.appointment.findMany({
        where: { tenantId: tenant.id, status: "pending" },
        include,
        orderBy: { startAt: "asc" },
      });
      return NextResponse.json({ appointments, pendingCount: appointments.length });
    }

    const appointments = await db.appointment.findMany({
      where: { tenantId: tenant.id, startAt: { gte: from, lte: to } },
      include,
      orderBy: { startAt: "asc" },
    });

    const pendingCount = await db.appointment.count({
      where: { tenantId: tenant.id, status: "pending" },
    });

    return NextResponse.json({ appointments, pendingCount });
  } catch (err) {
    return serverError("pro/appointments:get", err);
  }
}

const CreateBody = z.object({
  tenantId: z.string().min(1),
  clientName: z.string().trim().min(1),
  clientPhone: z.string().trim().min(5),
  clientProfileId: z.string().optional(),
  serviceId: z.string().optional(),
  customServiceName: z.string().optional(),
  customPrice: z.number().optional(),
  customDurationMin: z.number().optional(),
  resourceId: z.string().min(1),
  startAt: z.string().min(10),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Session signée (, migration douce): avec cookie, la création de
    // RDV côté institut exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:appointments:post");
    if (guard) return guard;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, clientName, clientPhone, clientProfileId, serviceId, customServiceName, customPrice, customDurationMin, resourceId, notes } = parsed.data;
    const start = new Date(parsed.data.startAt);
    if (Number.isNaN(start.getTime())) return jsonError("Date de début invalide", 400);

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Résolution du soin : depuis le catalogue OU création d'un soin saisi manuellement
    let service = serviceId
      ? await db.service.findFirst({ where: { id: serviceId, tenantId, active: true } })
      : null;

    if (!service && customServiceName?.trim()) {
      const cleanName = customServiceName.trim();
      const dur = customDurationMin && customDurationMin > 0 ? customDurationMin : 60;
      const pr = customPrice !== undefined && customPrice >= 0 ? customPrice : 15000;

      // Chercher si un soin identique existe déjà pour cet institut
      service = await db.service.findFirst({
        where: { tenantId, name: { equals: cleanName } },
      });

      if (!service) {
        service = await db.service.create({
          data: {
            tenantId,
            name: cleanName,
            category: "soin",
            durationMin: dur,
            price: pr,
            commissionPct: 10,
            active: true,
          },
        });
      }
    }

    if (!service) return jsonError("Veuillez sélectionner ou saisir un soin", 400);

    const resource = await db.resource.findFirst({ where: { id: resourceId, tenantId, active: true } });
    if (!resource) return jsonError("Praticienne introuvable", 404);

    // Règle d'entreprise : une personne en congé ne peut plus intervenir dans les activités
    const leaveOnDate = await getActiveLeaveForEmployee(
      { tenantId, resourceId: resource.id, name: resource.name },
      start
    );
    if (leaveOnDate) {
      return jsonError(formatLeaveBlockedMessage(leaveOnDate, "prendre un rendez-vous"), 400);
    }

    // Résolution / création de la fiche cliente CRM
    const normPhone = canonicalPhone(clientPhone);

    // Résolution du compte User Kènè par téléphone pour parité et affichage instantané côté client
    const digits = normPhone.replace(/\D/g, "");
    const matchedUser = await db.user.findFirst({
      where: {
        OR: [
          { phone: normPhone },
          { phone: clientPhone },
          ...(digits.length >= 8 ? [{ phone: { contains: digits.slice(-8) } }] : []),
        ],
      },
    });

    const isGenericUserName = !matchedUser?.name || matchedUser.name.startsWith("Nouvelle ") || matchedUser.name.startsWith("Membre ") || matchedUser.name.includes("??");
    if (matchedUser && isGenericUserName && clientName && !clientName.startsWith("Nouvelle ")) {
      await db.user.update({
        where: { id: matchedUser.id },
        data: { name: clientName },
      }).catch(() => null);
    }

    const resolvedUserId = matchedUser?.id ?? null;
    let profileId: string | null = null;

    if (clientProfileId && clientProfileId !== "new") {
      const profile = await db.clientProfile.findFirst({ where: { id: clientProfileId, tenantId } });
      if (profile) profileId = profile.id;
    }

    if (!profileId) {
      const profile = await ensureClientProfile(db, tenantId, matchedUser || {
        id: `pro_${Date.now()}`,
        name: clientName,
        phone: normPhone,
      });
      profileId = profile?.id ?? null;
    }

    const effectiveClientName = matchedUser && !isGenericUserName ? matchedUser.name : clientName;

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
        userId: resolvedUserId,
        clientName: effectiveClientName,
        clientPhone: normPhone,
        serviceId: service.id,
        resourceId,
        startAt: start,
        durationMin: service.durationMin,
        status: "confirmed",
        price: service.price,
        notes: notes ?? null,
      },
      include,
    });

    // 1. Notification immédiate de confirmation
    await notify({
      userId: resolvedUserId,
      tenantId,
      channel: "whatsapp",
      toPhone: clientPhone,
      message: `Kènè : Moment de soin confirmé ✨ ${service.name} avec ${resource.name} le ${ddMM(start)} à ${hhmm(start)} chez ${tenant.name}. Retrouvez vos détails dans votre espace Kènè.`,
    });

    // 2. Rappel proactif J-1 (24h avant)
    const reminder24h = new Date(start.getTime() - 24 * 3600 * 1000);
    if (reminder24h > new Date()) {
      await notify({
        userId: resolvedUserId,
        tenantId,
        channel: "whatsapp",
        toPhone: clientPhone,
        status: "scheduled",
        scheduledAt: reminder24h,
        metaJson: JSON.stringify({ apptId: appointment.id, type: "reminder_24h" }),
        message: `Kènè : Rappel bienveillant 🌸 Votre rendez-vous « ${service.name} » chez ${tenant.name} aura lieu demain à ${hhmm(start)}. À très bientôt !`,
      });
    }

    // 3. Rappel proactif Jour J (2h avant)
    const reminder2h = new Date(start.getTime() - 2 * 3600 * 1000);
    if (reminder2h > new Date()) {
      await notify({
        userId: resolvedUserId,
        tenantId,
        channel: "whatsapp",
        toPhone: clientPhone,
        status: "scheduled",
        scheduledAt: reminder2h,
        metaJson: JSON.stringify({ apptId: appointment.id, type: "reminder_2h" }),
        message: `Kènè : Votre moment de bien-être approche ✨ Rendez-vous aujourd'hui à ${hhmm(start)} chez ${tenant.name} (${service.name} avec ${resource.name}).`,
      });
    }

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err) {
    return serverError("pro/appointments:post", err);
  }
}
