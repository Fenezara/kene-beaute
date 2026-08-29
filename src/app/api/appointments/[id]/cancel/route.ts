// POST /api/appointments/[id]/cancel — annulation + remboursement acompte (politique PRD §8.6)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cancellationRefund } from "@/lib/kene/rfm";
import { jsonError, serverError, ensureWallet, creditWallet, notify } from "@/lib/kene/server";

const Body = z.object({ userId: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const appointment = await db.appointment.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!appointment) return jsonError("Rendez-vous introuvable", 404);
    if (appointment.status === "cancelled") return jsonError("Rendez-vous déjà annulé", 400);

    const hoursBefore = (appointment.startAt.getTime() - Date.now()) / 3_600_000;
    const { rate, label } = cancellationRefund(hoursBefore);

    let refundAmount = 0;
    if (appointment.depositAmount > 0 && rate > 0 && parsed.data.userId) {
      refundAmount = Math.round(appointment.depositAmount * rate);
      const wallet = await ensureWallet(parsed.data.userId);
      if (wallet) {
        await creditWallet(wallet.id, refundAmount, "refund", appointment.id);
      }
    }

    const updated = await db.appointment.update({
      where: { id },
      data: { status: "cancelled" },
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
