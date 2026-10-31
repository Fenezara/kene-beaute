// PATCH /api/pro/appointments/[id] — confirm | complete | cancel | no_show | reschedule
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { splitTVA, saleJournalLines } from "@/lib/accounting/syscohada";
import { jsonError, serverError, resolveTenant, overlaps, dayEnd, createJournalEntry, recomputeClientRfm, genRef, notify } from "@/lib/kene/server";
import { pushTenantFeed, pushFeed } from "@/lib/kene/realtime";
import { guardProRole } from "@/lib/kene/session";
import { getActiveLeaveForEmployee, formatLeaveBlockedMessage } from "@/lib/kene/leaves";

const Body = z.object({
  action: z.enum(["confirm", "complete", "cancel", "no_show", "reschedule"]),
  startAt: z.string().optional(),
  resourceId: z.string().optional(),
  paymentMethod: z.enum(["wave", "orange", "cash", "card"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session signée (, migration douce): avec cookie, la gestion du
    // RDV (confirm/complete/cancel/reschedule) exige un compte pro/admin.
    const guard = guardProRole(req, "pro:appointments:[id]:patch");
    if (guard) return guard;

    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("action invalide", 400);
    const { action, startAt, resourceId, paymentMethod } = parsed.data;

    const appointment = await db.appointment.findUnique({
      where: { id },
      include: { service: true, resource: true, clientProfile: true },
    });
    if (!appointment) return jsonError("Rendez-vous introuvable", 404);

    // Isolation multi-tenant stricte (anti-IDOR / BOLA) :
    // Une professionnelle ne peut modifier QUE les rendez-vous de son propre institut.
    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant || appointment.tenantId !== tenant.id) {
      return jsonError("Rendez-vous introuvable", 404);
    }

    // ── reschedule: déplacer le RDV (vérif chevauchement) ──
    if (action === "reschedule") {
      const newStart = startAt ? new Date(startAt) : appointment.startAt;
      if (startAt && Number.isNaN(newStart.getTime())) return jsonError("Date invalide", 400);
      let newResourceId = appointment.resourceId;
      let targetResourceName = appointment.resource.name;
      if (resourceId && resourceId !== appointment.resourceId) {
        const r = await db.resource.findFirst({ where: { id: resourceId, tenantId: appointment.tenantId, active: true } });
        if (!r) return jsonError("Praticienne introuvable", 404);
        newResourceId = r.id;
        targetResourceName = r.name;
      }

      // Règle d'entreprise : une personne en congé ne peut pas être assignée
      const leaveOnDate = await getActiveLeaveForEmployee(
        { tenantId: appointment.tenantId, resourceId: newResourceId, name: targetResourceName },
        newStart
      );
      if (leaveOnDate) {
        return jsonError(formatLeaveBlockedMessage(leaveOnDate, "déplacer un rendez-vous"), 400);
      }
      const others = await db.appointment.findMany({
        where: {
          resourceId: newResourceId,
          status: { notIn: ["cancelled", "no_show"] },
          id: { not: appointment.id },
          startAt: { gte: new Date(newStart.getTime() - 24 * 3_600_000), lte: dayEnd(newStart) },
        },
        select: { startAt: true, durationMin: true },
      });
      if (others.some((a) => overlaps(newStart, appointment.durationMin, a.startAt, a.durationMin))) {
        return jsonError("Créneau indisponible pour cette praticienne", 409);
      }
      const updated = await db.appointment.update({
        where: { id },
        data: { startAt: newStart, resourceId: newResourceId, status: "confirmed" },
      });
      if (appointment.userId || appointment.clientPhone) {
        await notify({
          userId: appointment.userId,
          tenantId: appointment.tenantId,
          channel: "whatsapp",
          toPhone: appointment.clientPhone,
          message: `Kènè : votre rendez-vous pour le soin « ${appointment.service.name} » a été réajusté par l'institut ${tenant.name} 🗓️ Nouveau créneau confirmé : le ${new Date(newStart).toLocaleDateString("fr-FR")} à ${new Date(newStart).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`,
        });
      }
      // Temps réel: autres postes/onglets Pro + dashboard + cliente rafraîchis
      pushTenantFeed(appointment.tenantId);
      pushFeed(appointment.userId);
      return NextResponse.json({ appointment: updated });
    }

    // ── confirm / cancel / no_show: changement de statut simple avec notification synchronisée ──
    if (action === "confirm") {
      const updated = await db.appointment.update({ where: { id }, data: { status: "confirmed" } });
      if (appointment.userId || appointment.clientPhone) {
        await notify({
          userId: appointment.userId,
          tenantId: appointment.tenantId,
          channel: "whatsapp",
          toPhone: appointment.clientPhone,
          message: `Kènè : votre RDV pour le soin « ${appointment.service.name} » a été confirmé par l'institut ${tenant.name} ✅ Rendez-vous le ${new Date(appointment.startAt).toLocaleDateString("fr-FR")} à ${new Date(appointment.startAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`,
        });
      }
      pushTenantFeed(appointment.tenantId);
      pushFeed(appointment.userId);
      return NextResponse.json({ appointment: updated });
    }
    if (action === "cancel") {
      const updated = await db.appointment.update({ where: { id }, data: { status: "cancelled" } });
      if (appointment.userId || appointment.clientPhone) {
        await notify({
          userId: appointment.userId,
          tenantId: appointment.tenantId,
          channel: "whatsapp",
          toPhone: appointment.clientPhone,
          message: `Kènè : votre RDV « ${appointment.service.name} » chez ${tenant.name} a été annulé. Contactez l'institut ou reprogrammez un créneau sur votre espace Kènè.`,
        });
      }
      pushTenantFeed(appointment.tenantId);
      return NextResponse.json({ appointment: updated });
    }
    if (action === "no_show") {
      const updated = await db.appointment.update({ where: { id }, data: { status: "no_show" } });
      if (appointment.userId || appointment.clientPhone) {
        await notify({
          userId: appointment.userId,
          tenantId: appointment.tenantId,
          channel: "whatsapp",
          toPhone: appointment.clientPhone,
          message: `Kènè : nous avons constaté votre absence lors de votre RDV « ${appointment.service.name} » chez ${tenant.name}. Prenez soin de vous et recontactez l'institut pour convenir d'un nouveau créneau 🌿`,
        });
      }
      pushTenantFeed(appointment.tenantId);
      return NextResponse.json({ appointment: updated });
    }

    // ── complete: statut + vente caisse auto + écriture comptable + CRM ──
    if (appointment.status === "completed") return jsonError("Rendez-vous déjà terminé", 400);

    const method = paymentMethod ?? "cash";
    const price = appointment.price || appointment.service.price;
    const deposit = appointment.depositAmount || 0;
    const remainingToPay = Math.max(0, price - deposit);

    const sale = await db.sale.create({
      data: {
        tenantId: appointment.tenantId,
        clientProfileId: appointment.clientProfileId,
        subtotal: price,
        total: price,
        tvaAmount: splitTVA(price).tva,
        paymentMethod: deposit > 0 && remainingToPay === 0 ? "online" : method,
        cashierName: appointment.resource.name,
        status: "completed",
        items: {
          create: [
            {
              kind: "service",
              serviceId: appointment.serviceId,
              label: deposit > 0 ? `${appointment.service.name} (Acompte ${deposit} F déduit)` : appointment.service.name,
              qty: 1,
              unitPrice: price,
              total: price,
            },
          ],
        },
      },
      include: { items: true },
    });

    // Écriture comptable CA (espèces) / BQ (monétique & mobile money) sur le montant réellement encaissé en caisse
    if (remainingToPay > 0) {
      await createJournalEntry(appointment.tenantId, {
        journalCode: method === "cash" ? "CA" : "BQ",
        date: new Date(),
        reference: genRef("VE"),
        description: deposit > 0
          ? `Solde RDV ${appointment.clientName} — ${appointment.service.name} (Acompte ${deposit} F réglé en ligne)`
          : `Encaissement RDV ${appointment.clientName} — ${appointment.service.name}`,
        sourceType: "sale",
        sourceId: sale.id,
        lines: saleJournalLines({ total: remainingToPay, servicesAmount: remainingToPay, productsAmount: 0, method }),
      });
    }

    // Mise à jour CRM (visites, CA, RFM)
    if (appointment.clientProfileId) {
      await db.clientProfile.update({
        where: { id: appointment.clientProfileId },
        data: { visitsCount: { increment: 1 }, totalSpent: { increment: price }, lastVisit: new Date() },
      });
      const client = await recomputeClientRfm(appointment.clientProfileId);
      if (client?.userId) {
        await notify({
          userId: client.userId,
          tenantId: appointment.tenantId,
          channel: "sms",
          toPhone: client.phone,
          message: `Kènè : merci pour votre visite — ${appointment.service.name} 🌿 Prenez soin de vous, à très vite.`,
        });
      }
    }

    const updated = await db.appointment.update({ where: { id }, data: { status: "completed" } });
    return NextResponse.json({ appointment: updated, sale });
  } catch (err) {
    return serverError("pro/appointments/[id]", err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = guardProRole(req, "pro:appointments:[id]:delete");
    if (guard) return guard;

    const { id } = await params;
    const appointment = await db.appointment.findUnique({ where: { id } });
    if (!appointment) return jsonError("Rendez-vous introuvable", 404);

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant || appointment.tenantId !== tenant.id) {
      return jsonError("Rendez-vous introuvable", 404);
    }

    await db.appointment.delete({ where: { id } });

    pushTenantFeed(appointment.tenantId);
    if (appointment.userId) pushFeed(appointment.userId);

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err) {
    return serverError("pro/appointments:[id]:delete", err);
  }
}
