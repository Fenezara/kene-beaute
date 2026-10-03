// GET /api/appointments?userId= — RDV de la cliente | POST — nouveau RDV (côté cliente)
//: les écritures de booking (appointment + payment) passent dans UNE
// prisma.$transaction. L'acompte MoMo (wave/orange) crée un Payment pending
// porteur d'un code de confirmation (token BRUT renvoyé au front — contrat 63-b,
// hash sha256 stocké); le paiement wallet reste instantané (succès, sans code).
// Les notifications/rappels restent best-effort, APRÈS le commit.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, overlaps, genRef, notify, dayEnd, ensureWallet, debitWallet } from "@/lib/kene/server";
import { DEPOSIT_RATE } from "@/lib/kene/format";
import { newConfirmToken, paymentWithConfirmToken, serializePayment } from "@/lib/kene/confirm-token";
import type { Appointment, Payment } from "@prisma/client";
import { guardUserClaim } from "@/lib/kene/session";
import { ensureClientProfile } from "@/lib/kene/client-link";
import { rateLimit, rlKey, rateLimitResponse, APPOINTMENTS_CREATE } from "@/lib/kene/rate-limit";
import { createWaveCheckoutSession } from "@/lib/payments/wave";
import { createWiniPayerPaymentSession } from "@/lib/payments/winipayer";
import { createSaspayCheckoutSession } from "@/lib/payments/saspay";

const CreateBody = z.object({
  tenantId: z.string().min(1),
  serviceId: z.string().min(1),
  resourceId: z.string().min(1),
  startAt: z.string().min(10),
  clientName: z.string().trim().min(1),
  clientPhone: z.string().trim().min(5),
  userId: z.string().optional(),
  depositAmount: z.number().int().min(0).optional(),
  paymentMethod: z.enum(["wave", "orange", "mtn", "moov", "saspay", "winipayer", "wallet"]).optional(),
});

const APPT_INCLUDE = {
  tenant: { select: { id: true, name: true, city: true, country: true } },
  service: { select: { name: true, durationMin: true, price: true } },
  resource: { select: { name: true } },
  review: { select: { id: true, rating: true, comment: true, createdAt: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    // Session signée (, migration douce): avec cookie, la session ne
    // lit que SES rendez-vous; sans cookie → legacy (comportement conservé).
    const guard = guardUserClaim(req, "appointments:get", userId);
    if (guard) return guard;

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const appointments = await db.appointment.findMany({
      where: { userId, startAt: { gte: since } },
      include: APPT_INCLUDE,
      orderBy: { startAt: "asc" },
    });
    return NextResponse.json({ appointments });
  } catch (err) {
    return serverError("appointments:get", err);
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "appointments:create"), APPOINTMENTS_CREATE);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de demandes de RDV — patiente quelques secondes");
  }
  try {
    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, serviceId, resourceId, startAt, clientName, clientPhone, userId, paymentMethod } = parsed.data;

    // Session signée (, migration douce): avec cookie, le userId
    // éventuel du corps doit être celui de la session (réservation pour soi);
    // sans cookie → legacy (walk-in sans compte: userId facultatif, inchangé).
    const guard = guardUserClaim(req, "appointments:post", userId);
    if (guard) return guard;

    const start = new Date(startAt);
    if (Number.isNaN(start.getTime())) return jsonError("Date de début invalide", 400);

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.active) return jsonError("Institut introuvable", 404);

    const service = await db.service.findFirst({ where: { id: serviceId, tenantId, active: true } });
    if (!service) return jsonError("Service introuvable", 404);

    // Acompte: la règle des 30 % du prix du service est appliquée côté serveur
    // (la valeur cliente est plafonnée — un client malveillant ne peut pas réserver en payant moins)
    const depositAmount = Math.max(0, Math.min(parsed.data.depositAmount ?? 0, Math.round(service.price * DEPOSIT_RATE)));

    const resource = await db.resource.findFirst({ where: { id: resourceId, tenantId, active: true } });
    if (!resource) return jsonError("Praticienne introuvable", 404);

    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) return jsonError("Utilisatrice introuvable", 404);
    }

    // Paiement wallet immédiat: garde AVANT toute écriture (userId + solde).
    if (depositAmount > 0 && paymentMethod === "wallet") {
      if (!userId) return jsonError("Wallet : userId requis", 400);
      const w = await ensureWallet(userId);
      if (!w) return jsonError("Wallet indisponible", 400);
      if (w.balance < depositAmount) return jsonError("Solde wallet insuffisant", 400);
    }

    // ─── Booking atomique: vérification anti-overbooking + création RDV + paiement dans la même transaction ───
    let isOverlapConflict = false;
    let created: { appointment: Appointment; payment: Payment | null; confirmToken: string | null };

    try {
      created = await db.$transaction(async (tx) => {
        // 1. Vérification atomique anti-chevauchement (anti-TOCTOU sous concurrence)
        const sameDay = await tx.appointment.findMany({
          where: {
            resourceId,
            status: { notIn: ["cancelled", "no_show"] },
            startAt: { gte: new Date(start.getTime() - 24 * 3_600_000), lte: dayEnd(start) },
          },
          select: { startAt: true, durationMin: true },
        });

        if (sameDay.some((a) => overlaps(start, service.durationMin, a.startAt, a.durationMin))) {
          isOverlapConflict = true;
          throw new Error("CONFLICT_OVERLAP");
        }

        let appointment = await tx.appointment.create({
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
          include: APPT_INCLUDE,
        });

        // Synchronisation App↔Institut: une cliente de l'app qui
        // réserve apparaît immédiatement dans le CRM de l'institut (fiche
        // liée userId + miroir peau) et le RDV porte clientProfileId —
        // comptes RDV/visites de la fiche 360° et relances alimentés d'office.
        if (userId) {
          const u = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, phone: true, skinType: true, fitzpatrick: true },
          });
          if (u) {
            const profile = await ensureClientProfile(tx, tenantId, u);
            if (profile) {
              appointment = await tx.appointment.update({
                where: { id: appointment.id },
                data: { clientProfileId: profile.id },
                include: APPT_INCLUDE,
              });
            }
          }
        }

        // Acompte (simulation MoMo) → Payment en attente de confirmation
        let payment: Payment | null = null;
        let confirmToken: string | null = null;
        if (depositAmount > 0) {
          if (paymentMethod === "wallet") {
            // Paiement wallet immédiat: débit direct + confirmation du RDV
            // (pas de code de confirmation — succès instantané).
            const w = await ensureWallet(userId!, tx);
            if (!w) throw new Error("Wallet indisponible");
            const wtx = await debitWallet(w.id, depositAmount, "payment", appointment.id, tx);
            payment = await tx.payment.create({
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
            appointment = await tx.appointment.update({
              where: { id: appointment.id },
              data: { paymentId: payment.id, status: "confirmed", depositAmount },
              include: APPT_INCLUDE,
            });
          } else {
            // MoMo (wave/orange): Payment pending porteur du code de
            // confirmation (contrat 63-b: token brut renvoyé, hash stocké).
            const { token, tokenHash } = newConfirmToken();
            confirmToken = token;
            payment = await tx.payment.create({
              data: {
                userId: userId ?? null,
                purpose: "appointment_deposit",
                method: paymentMethod ?? "wave",
                amount: depositAmount,
                ref: genRef("PAY"),
                metaJson: JSON.stringify({ appointmentId: appointment.id }),
                confirmTokenHash: tokenHash,
              },
            });
            appointment = await tx.appointment.update({
              where: { id: appointment.id },
              data: { paymentId: payment.id },
              include: APPT_INCLUDE,
            });
          }
        }

        return { appointment, payment, confirmToken };
      });
    } catch (err: any) {
      if (isOverlapConflict || err?.message === "CONFLICT_OVERLAP") {
        return jsonError("Ce créneau est déjà réservé pour cette praticienne", 409);
      }
      throw err;
    }

    const appointment = created.appointment;
    const payment = created.payment;

    await notify({
      userId: userId ?? null,
      tenantId,
      channel: "sms",
      toPhone: clientPhone,
      message: depositAmount > 0
        ? `Kènè : RDV en attente de confirmation d'acompte — ${service.name} chez ${tenant.name}. Réf ${appointment.id.slice(-6).toUpperCase()}.`
        : `Kènè : demande de RDV ${service.name} chez ${tenant.name} enregistrée. Confirmation à venir.`,
    });

    // Rappel automatique J-1 (24 h avant) — créé dès que le RDV est confirmé
    // (paiement wallet immédiat). Le path MoMo le crée à la confirmation du
    // paiement; le filtre GET /api/notifications masque celui d'un RDV annulé.
    if (appointment.status === "confirmed" && userId && new Date(start).getTime() > Date.now() + 24 * 3_600_000) {
      const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
      const first = (u?.name.split(/\s+/)[0] ?? clientName).trim();
      await notify({
        userId,
        tenantId,
        channel: "whatsapp",
        toPhone: clientPhone,
        message: `Kènè ✨ ${first}, petit rappel : ${service.name} chez ${tenant.name} le ${new Date(start).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Préviens-nous si tu dois déplacer, sinon on t'attend avec plaisir !`,
        status: "scheduled",
        scheduledAt: new Date(new Date(start).getTime() - 24 * 3_600_000),
        metaJson: JSON.stringify({ apptId: appointment.id }),
      });
    }

    const paymentOut = payment
      ? created.confirmToken
        ? paymentWithConfirmToken(payment, created.confirmToken)
        : serializePayment(payment)
      : undefined;

    let paymentUrl: string | null = null;
    let saspayLaunchUrl: string | null = null;
    let winipayerLaunchUrl: string | null = null;
    let waveLaunchUrl: string | null = null;

    if (payment && depositAmount > 0 && appointment.status !== "confirmed") {
      const hasSaspay = Boolean(process.env.SASPAY_API_KEY?.trim());
      const hasWiniPayer = Boolean(process.env.WINIPAYER_MERCHANT_UUID && process.env.WINIPAYER_MERCHANT_TOKEN);

      // 1. Passerelle Live SasPay (multi-opérateurs Wave, Orange, MTN, Moov, Carte)
      if (hasSaspay && (paymentMethod === "saspay" || paymentMethod === "wave" || paymentMethod === "orange" || paymentMethod === "mtn" || paymentMethod === "moov" || paymentMethod === "winipayer" || !paymentMethod)) {
        const sasSession = await createSaspayCheckoutSession({
          paymentId: payment.id,
          amount: depositAmount,
          description: `Acompte RDV Kènè - ${service.name} chez ${tenant.name}`,
          customerName: clientName,
          customerPhone: clientPhone,
        });
        if (sasSession.checkoutUrl) {
          paymentUrl = sasSession.checkoutUrl;
          saspayLaunchUrl = sasSession.checkoutUrl;
          try {
            await db.payment.update({
              where: { id: payment.id },
              data: { metaJson: JSON.stringify({ appointmentId: appointment.id, saspayId: sasSession.id }) },
            });
          } catch {}
        }
      }

      // 2. Repli WiniPayer (si explicitement demandé ou SasPay non configuré)
      if (!paymentUrl && (hasWiniPayer && (paymentMethod === "winipayer" || paymentMethod === "wave" || paymentMethod === "orange" || paymentMethod === "mtn" || paymentMethod === "moov"))) {
        const winiSession = await createWiniPayerPaymentSession({
          paymentId: payment.id,
          amount: depositAmount,
          description: `Acompte RDV Kènè - ${service.name} chez ${tenant.name}`,
          clientName,
          clientPhone,
        });
        paymentUrl = winiSession.paymentUrl;
        winipayerLaunchUrl = winiSession.paymentUrl;
      }

      if (!paymentUrl && paymentMethod === "wave") {
        const waveSession = await createWaveCheckoutSession({
          paymentId: payment.id,
          amount: depositAmount,
          description: `Acompte RDV Kènè - ${service.name} chez ${tenant.name}`,
        });
        waveLaunchUrl = waveSession.waveLaunchUrl ?? paymentUrl;
        if (!paymentUrl) paymentUrl = waveSession.waveLaunchUrl;
      }
    }

    return NextResponse.json({
      appointment,
      payment: paymentOut,
      paymentUrl,
      saspayLaunchUrl,
      winipayerLaunchUrl,
      waveLaunchUrl,
    }, { status: 201 });
  } catch (err) {
    return serverError("appointments:post", err);
  }
}
