// POST /api/appointments/[id]/cancel — annulation + remboursement acompte (politique PRD §8.6)
// t. 63-c : le remboursement part TOUJOURS vers le VRAI propriétaire du RDV
// (appointment.userId), jamais vers un userId fourni dans le corps ; une
// userId cliente qui ne correspond pas au propriétaire → 403. Refund wallet +
// passage en annulé partagent une même prisma.$transaction.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cancellationRefund } from "@/lib/kene/rfm";
import { jsonError, serverError, ensureWallet, creditWallet, notify } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, APPOINTMENT_CANCEL } from "@/lib/kene/rate-limit";

const Body = z.object({ userId: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "appointments:cancel"), APPOINTMENT_CANCEL);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop d'annulations à la suite — patiente quelques secondes");
  }
  try {
    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    // Session signée (t. 71-b, migration douce) : avec cookie, le userId du
    // corps doit être celui de la session — la garde propriétaire (403 juste
    // après) reste la barrière métier ; sans cookie → legacy.
    const guard = guardUserClaim(req, "appointments:cancel", parsed.data.userId);
    if (guard) return guard;

    const appointment = await db.appointment.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!appointment) return jsonError("Rendez-vous introuvable", 404);
    if (appointment.status === "cancelled") return jsonError("Rendez-vous déjà annulé", 400);

    // Appartenance (POC : userId fourni par le client, mais au moins le refund
    // ne part plus vers un tiers) : seule la propriétaire du RDV peut l'annuler.
    if (parsed.data.userId !== appointment.userId) {
      return jsonError("Ce rendez-vous ne t'appartient pas", 403);
    }

    const hoursBefore = (appointment.startAt.getTime() - Date.now()) / 3_600_000;
    const { rate, label } = cancellationRefund(hoursBefore);

    // ─── Refund + annulation atomiques ───
    const { updated, refundAmount } = await db.$transaction(async (tx) => {
      let refundAmount = 0;
      // Le remboursement va au VRAI propriétaire du RDV (jamais au body).
      if (appointment.depositAmount > 0 && rate > 0 && appointment.userId) {
        refundAmount = Math.round(appointment.depositAmount * rate);
        const wallet = await ensureWallet(appointment.userId, tx);
        if (wallet) {
          await creditWallet(wallet.id, refundAmount, "refund", appointment.id, tx);
        } else {
          refundAmount = 0; // wallet impossible → pas de crédit effectif
        }
      }
      const updated = await tx.appointment.update({
        where: { id },
        data: { status: "cancelled" },
      });
      return { updated, refundAmount };
    });

    await notify({
      userId: appointment.userId,
      tenantId: appointment.tenantId,
      channel: "whatsapp",
      toPhone: appointment.clientPhone,
      message:
        refundAmount > 0
          ? `Kènè : votre RDV « ${appointment.clientName} » a été annulé. ${label} : ${refundAmount} FCFA crédités sur votre wallet Kènè.`
          : `Kènè : votre RDV a été annulé. ${label}.`,
    });

    return NextResponse.json({ appointment: updated, refund: { amount: refundAmount, label } });
  } catch (err) {
    return serverError("appointments/cancel", err);
  }
}
