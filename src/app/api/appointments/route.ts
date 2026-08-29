// GET /api/appointments?userId= — RDV de la cliente | POST — nouveau RDV (côté cliente)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, overlaps, genRef, notify, dayEnd, ensureWallet, debitWallet } from "@/lib/kene/server";

const CreateBody = z.object({
  tenantId: z.string().min(1),
  serviceId: z.string().min(1),
  resourceId: z.string().min(1),
  startAt: z.string().min(10),
  clientName: z.string().trim().min(1),
  clientPhone: z.string().trim().min(5),
  userId: z.string().optional(),
  depositAmount: z.number().int().min(0).optional(),
  paymentMethod: z.enum(["wave", "orange", "wallet"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const appointments = await db.appointment.findMany({
      where: { userId, startAt: { gte: since } },
      include: {
        tenant: { select: { name: true, city: true, country: true } },
        service: { select: { name: true, durationMin: true, price: true } },
        resource: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    });
    return NextResponse.json({ appointments });
  } catch (err) {
    return serverError("appointments:get", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, serviceId, resourceId, startAt, clientName, clientPhone, userId, paymentMethod } = parsed.data;
    const depositAmount = parsed.data.depositAmount ?? 0;

    const start = new Date(startAt);
    if (Number.isNaN(start.getTime())) return jsonError("Date de début invalide", 400);

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.active) return jsonError("Institut introuvable", 404);

    const service = await db.service.findFirst({ where: { id: serviceId, tenantId, active: true } });
    if (!service) return jsonError("Service introuvable", 404);

    const resource = await db.resource.findFirst({ where: { id: resourceId, tenantId, active: true } });
    if (!resource) return jsonError("Praticienne introuvable", 404);

    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) return jsonError("Utilisatrice introuvable", 404);
    }

    // Pas de chevauchement pour cette praticienne (hors annulés / no-show)
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

    let appointment = await db.appointment.create({
      data: {
        tenantId,
        serviceId,
        resourceId,
        userId: userId ?? null,
        clientName,
        clientPhone,
        startAt: start,
        durationMin: service.durationMin,
        status: "pending",
        price: service.price,
        depositAmount: 0,
      },
      include: {
        tenant: { select: { name: true, city: true, country: true } },
        service: { select: { name: true, durationMin: true, price: true } },
        resource: { select: { name: true } },
      },
    });

    // Acompte (simulation MoMo) → Payment en attente de confirmation
    let payment: Awaited<ReturnType<typeof db.payment.create>> | null = null;
    if (depositAmount > 0) {
      if (paymentMethod === "wallet") {
        // Paiement wallet immédiat : débit direct + confirmation du RDV
        if (!userId) return jsonError("Wallet : userId requis", 400);
        const w = await ensureWallet(userId);
        if (!w) return jsonError("Wallet indisponible", 400);
        if (w.balance < depositAmount) return jsonError("Solde wallet insuffisant", 400);
        const wtx = await debitWallet(w.id, depositAmount, "payment", appointment.id);
        payment = await db.payment.create({
          data: {
            userId,
            purpose: "appointment_deposit",
            method: "wallet",
            amount: depositAmount,
            ref: genRef("PAY"),
            status: "success",
            confirmedAt: new Date(),
            metaJson: JSON.stringify({ appointmentId: appointment.id, walletTxId: wtx?.id ?? null }),
          },
        });
        appointment = await db.appointment.update({
          where: { id: appointment.id },
          data: { paymentId: payment.id, status: "confirmed", depositAmount },
          include: {
            tenant: { select: { name: true, city: true, country: true } },
            service: { select: { name: true, durationMin: true, price: true } },
            resource: { select: { name: true } },
          },
        });
      } else {
        payment = await db.payment.create({
          data: {
            userId: userId ?? null,
            purpose: "appointment_deposit",
            method: paymentMethod ?? "wave",
            amount: depositAmount,
            ref: genRef("PAY"),
            metaJson: JSON.stringify({ appointmentId: appointment.id }),
          },
        });
        appointment = await db.appointment.update({
          where: { id: appointment.id },
          data: { paymentId: payment.id },
          include: {
            tenant: { select: { name: true, city: true, country: true } },
            service: { select: { name: true, durationMin: true, price: true } },
            resource: { select: { name: true } },
          },
        });
      }
    }

    await notify({
      userId: userId ?? null,
      tenantId,
      channel: "sms",
      toPhone: clientPhone,
      message: depositAmount > 0
        ? `Kènè : RDV en attente de confirmation d'acompte — ${service.name} chez ${tenant.name}. Réf ${appointment.id.slice(-6).toUpperCase()}.`
        : `Kènè : demande de RDV ${service.name} chez ${tenant.name} enregistrée. Confirmation à venir.`,
    });

    return NextResponse.json({ appointment, payment: payment ?? undefined }, { status: 201 });
  } catch (err) {
    return serverError("appointments:post", err);
  }
}
