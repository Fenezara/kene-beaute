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
import { getActiveLeaveForEmployee, formatLeaveBlockedMessage } from "@/lib/kene/leaves";
import { DEPOSIT_RATE } from "@/lib/kene/format";
import { newConfirmToken, paymentWithConfirmToken, serializePayment } from "@/lib/kene/confirm-token";
import type { Appointment, Payment } from "@prisma/client";
import { guardUserClaim } from "@/lib/kene/session";
import { ensureClientProfile } from "@/lib/kene/client-link";
import { canonicalPhone } from "@/lib/kene/phone-normalize";
import { rateLimit, rlKey, rateLimitResponse, APPOINTMENTS_CREATE } from "@/lib/kene/rate-limit";
import { createWaveCheckoutSession } from "@/lib/payments/wave";
import { createWiniPayerPaymentSession } from "@/lib/payments/winipayer";
import { createSaspayCheckoutSession } from "@/lib/payments/saspay";
import { pushTenantFeed } from "@/lib/kene/realtime";

const CreateBody = z.object({
  tenantId: z.string().min(1),
  serviceId: z.string().optional(),
  serviceCategory: z.string().optional(),
  serviceName: z.string().optional(),
  resourceId: z.string().optional(),
  startAt: z.string().min(10),
  clientName: z.string().trim().min(1),
  clientPhone: z.string().trim().min(5),
  userId: z.string().optional(),
  notes: z.string().optional(),
  depositAmount: z.number().int().min(0).optional(),
  paymentMethod: z.enum(["wave", "orange", "mtn", "moov", "saspay", "winipayer", "wallet"]).optional(),
});

const APPT_INCLUDE = {
  tenant: { select: { id: true, name: true, city: true, country: true, phone: true, address: true } },
  service: { select: { id: true, name: true, category: true, durationMin: true, price: true, description: true } },
  resource: { select: { id: true, name: true, role: true, color: true } },
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

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, name: true, selectedTenantId: true },
    });

    const since = new Date();
    since.setDate(since.getDate() - 90); // 90 jours pour couvrir tous les RDV récents et futurs

    const userDigits = user?.phone ? user.phone.replace(/\D/g, "") : "";
    const phoneFilter = userDigits.length >= 8 ? userDigits.slice(-8) : "";

    // 1. Instituts avec lesquels la cliente partage ses données de peau
    const sharedConsents = await db.consent.findMany({
      where: { userId, type: "share_scans", granted: true, tenantId: { not: null } },
      select: { tenantId: true },
    });
    const sharedTenantIds = new Set<string>();
    if (user?.selectedTenantId) sharedTenantIds.add(user.selectedTenantId);
    for (const c of sharedConsents) {
      if (c.tenantId) sharedTenantIds.add(c.tenantId);
    }

    // 2. Fiches CRM clientes associées à cette utilisatrice
    const profiles = await db.clientProfile.findMany({
      where: {
        OR: [
          { userId },
          ...(user?.phone ? [{ phone: user.phone }, { phone: user.phone.replace(/\s+/g, "") }] : []),
          ...(phoneFilter ? [{ phone: { contains: phoneFilter } }] : []),
        ],
      },
      select: { id: true, tenantId: true },
    });
    for (const p of profiles) {
      if (p.tenantId) sharedTenantIds.add(p.tenantId);
    }

    const orClauses: Array<Record<string, unknown>> = [{ userId }];

    // Par ID de fiche profil client
    const profileIds = profiles.map((p) => p.id);
    if (profileIds.length > 0) {
      orClauses.push({ clientProfileId: { in: profileIds } });
    }

    // Par téléphone sous divers formats
    if (user?.phone) {
      const rawPhone = user.phone.trim();
      orClauses.push({ clientPhone: rawPhone });
      orClauses.push({ clientPhone: user.phone });
      orClauses.push({ clientPhone: rawPhone.replace(/\s+/g, "") });
      orClauses.push({ clientPhone: rawPhone.replace(/^\+225/, "").trim() });
      if (phoneFilter) {
        orClauses.push({ clientPhone: { contains: phoneFilter } });
      }
    }

    // Par institut partenaire partagé (si le RDV a été saisi à l'institut sous le nom ou téléphone de la cliente)
    if (sharedTenantIds.size > 0) {
      const tenantIds = Array.from(sharedTenantIds);
      if (phoneFilter) {
        orClauses.push({
          tenantId: { in: tenantIds },
          clientPhone: { contains: phoneFilter },
        });
      }
      if (user?.name && user.name.trim().length >= 3) {
        orClauses.push({
          tenantId: { in: tenantIds },
          clientName: { contains: user.name.trim() },
        });
      }
    }

    const appointments = await db.appointment.findMany({
      where: {
        OR: orClauses,
        startAt: { gte: since },
      },
      include: APPT_INCLUDE,
      orderBy: { startAt: "asc" },
    });

    // Backfill automatique du userId sur TOUS les RDV reconnus
    const toBackfill = appointments.filter((a) => a.userId !== userId).map((a) => a.id);
    if (toBackfill.length > 0) {
      await db.appointment.updateMany({
        where: { id: { in: toBackfill } },
        data: { userId },
      }).catch(() => null);
    }

    // Lier également les fiches clientProfile orphelines reconnues
    const profileIdsToLink = appointments
      .map((a) => a.clientProfileId)
      .filter((id): id is string => Boolean(id));
    if (profileIdsToLink.length > 0) {
      await db.clientProfile.updateMany({
        where: { id: { in: profileIdsToLink }, userId: null },
        data: { userId },
      }).catch(() => null);
    }

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
    const { tenantId, serviceId, serviceCategory, serviceName, resourceId, startAt, clientName, clientPhone, userId, notes, paymentMethod } = parsed.data;

    // Session signée (, migration douce): avec cookie, le userId
    // éventuel du corps doit être celui de la session (réservation pour soi);
    // sans cookie → legacy (walk-in sans compte: userId facultatif, inchangé).
    const guard = guardUserClaim(req, "appointments:post", userId);
    if (guard) return guard;

    const start = new Date(startAt);
    if (Number.isNaN(start.getTime())) return jsonError("Date de début invalide", 400);

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.active) return jsonError("Institut introuvable", 404);

    let service = serviceId ? await db.service.findFirst({ where: { id: serviceId, tenantId, active: true } }) : null;
    if (!service) {
      const cat = (serviceCategory || serviceId || "").toLowerCase().replace(/^srv_/, "");
      const sName = (serviceName || "").toLowerCase();
      service = await db.service.findFirst({
        where: {
          tenantId,
          active: true,
          OR: [
            ...(cat ? [{ category: { contains: cat } }] : []),
            ...(sName ? [{ name: { contains: sName } }] : []),
          ],
        },
      });
      if (!service) {
        service = await db.service.findFirst({ where: { tenantId, active: true } });
      }
      if (!service) {
        return jsonError("Aucun service de soin actif trouvé pour cet institut partenaire", 400);
      }
    }

    // Acompte: la règle des 30 % du prix du service est appliquée côté serveur
    const depositAmount = Math.max(0, Math.min(parsed.data.depositAmount ?? 0, Math.round(service.price * DEPOSIT_RATE)));

    let resource = resourceId ? await db.resource.findFirst({ where: { id: resourceId, tenantId, active: true } }) : null;
    if (!resource) {
      resource = await db.resource.findFirst({ where: { tenantId, active: true } });
    }
    if (!resource) {
      resource = await db.resource.create({
        data: {
          tenantId,
          name: "Équipe Cabine Kènè",
          role: "estheticienne",
          active: true,
        },
      });
    }

    // Règle d'entreprise : une personne en congé ne peut pas être réservée
    const leave = await getActiveLeaveForEmployee(
      { tenantId, resourceId: resource.id, name: resource.name },
      start
    );
    if (leave) {
      const altResource = await db.resource.findFirst({
        where: { tenantId, active: true, id: { not: resource.id } },
      });
      if (altResource) {
        const altLeave = await getActiveLeaveForEmployee({ tenantId, resourceId: altResource.id, name: altResource.name }, start);
        if (!altLeave) {
          resource = altResource;
        }
      }
    }

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

    const pendingCutoff = new Date(Date.now() - 30 * 60 * 1000);
    const activeAppointmentFilter = {
      OR: [
        { status: { in: ["confirmed", "completed"] } },
        { status: "pending", createdAt: { gte: pendingCutoff } },
      ],
    };

    try {
      created = await db.$transaction(async (tx) => {
        let targetResourceId = resource.id;
        const sameDay = await tx.appointment.findMany({
          where: {
            resourceId: targetResourceId,
            ...activeAppointmentFilter,
            startAt: { gte: new Date(start.getTime() - 24 * 3_600_000), lte: dayEnd(start) },
          },
          select: { startAt: true, durationMin: true },
        });

        if (sameDay.some((a) => overlaps(start, service.durationMin, a.startAt, a.durationMin))) {
          const otherResources = await tx.resource.findMany({
            where: { tenantId, active: true, id: { not: targetResourceId } },
          });
          let foundFree = false;
          for (const other of otherResources) {
            const otherDay = await tx.appointment.findMany({
              where: {
                resourceId: other.id,
                ...activeAppointmentFilter,
                startAt: { gte: new Date(start.getTime() - 24 * 3_600_000), lte: dayEnd(start) },
              },
              select: { startAt: true, durationMin: true },
            });
            if (!otherDay.some((a) => overlaps(start, service.durationMin, a.startAt, a.durationMin))) {
              targetResourceId = other.id;
              foundFree = true;
              break;
            }
          }
          if (!foundFree) {
            isOverlapConflict = true;
            throw new Error("CONFLICT_OVERLAP");
          }
        }

        const normClientPhone = canonicalPhone(clientPhone);

        // Synchronisation App↔Institut: création / mise à jour de la fiche client CRM
        let effectiveUser = userId
          ? await tx.user.findUnique({
              where: { id: userId },
              select: { id: true, name: true, phone: true, skinType: true, fitzpatrick: true, district: true, birthDate: true, pregnant: true, preferredChannel: true, beautyBudget: true, selectedTenantId: true },
            })
          : null;

        if (!effectiveUser && clientPhone) {
          const digits = normClientPhone.replace(/\D/g, "");
          effectiveUser = await tx.user.findFirst({
            where: {
              OR: [
                { phone: normClientPhone },
                { phone: clientPhone },
                ...(digits.length >= 8 ? [{ phone: { contains: digits.slice(-8) } }] : []),
              ],
            },
            select: { id: true, name: true, phone: true, skinType: true, fitzpatrick: true, district: true, birthDate: true, pregnant: true, preferredChannel: true, beautyBudget: true, selectedTenantId: true },
          });
        }

        const effectiveName = effectiveUser && !effectiveUser.name.startsWith("Nouvelle ") && !effectiveUser.name.startsWith("Membre ") && !effectiveUser.name.includes("??")
          ? effectiveUser.name
          : clientName;

        let profileId: string | null = null;
        if (effectiveUser) {
          if (!effectiveUser.selectedTenantId) {
            await tx.user.update({
              where: { id: effectiveUser.id },
              data: { selectedTenantId: tenantId },
            }).catch(() => null);
          }
          const profile = await ensureClientProfile(tx, tenantId, effectiveUser);
          if (profile) profileId = profile.id;
        } else if (clientPhone) {
          const profile = await ensureClientProfile(tx, tenantId, {
            id: `guest_${Date.now()}`,
            name: effectiveName,
            phone: normClientPhone,
          });
          if (profile) profileId = profile.id;
        }

        let appointment = await tx.appointment.create({
          data: {
            tenantId,
            serviceId: service.id,
            resourceId: targetResourceId,
            userId: effectiveUser?.id ?? userId ?? null,
            clientProfileId: profileId,
            clientName: effectiveName,
            clientPhone: normClientPhone,
            startAt: start,
            durationMin: service.durationMin,
            status: "pending",
            price: service.price,
            depositAmount: 0,
            notes: notes ?? null,
          },
          include: APPT_INCLUDE,
        });

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
        message: `Kènè 🌿 ${first}, petit rappel : ${service.name} chez ${tenant.name} le ${new Date(start).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Préviens-nous si tu dois déplacer, sinon on t'attend avec plaisir !`,
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

    pushTenantFeed(tenantId);

    return NextResponse.json({
      ok: true,
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
