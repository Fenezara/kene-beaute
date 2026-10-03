// GET /api/appointments/pass?id= — Téléchargement du Pass Rendez-Vous & Reçu d'acompte officiel en PDF
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { appointmentPassPdf } from "@/lib/kene/appointment-pass-pdf";

export async function GET(req: NextRequest) {
  try {
    const apptId = req.nextUrl.searchParams.get("id")?.trim() || req.nextUrl.searchParams.get("appointmentId")?.trim();
    if (!apptId) {
      return jsonError("Identifiant de rendez-vous (id) requis", 400);
    }

    const appt = await db.appointment.findUnique({
      where: { id: apptId },
      include: {
        service: true,
        tenant: true,
        resource: true,
        user: true,
      },
    });

    if (!appt) {
      return jsonError("Rendez-vous introuvable", 404);
    }

    // Sécurité : l'utilisatrice propriétaire ou le pro de l'institut du RDV peut accéder au pass
    if (appt.userId) {
      const guard = guardUserClaim(req, "appointments:pass", appt.userId);
      if (guard) {
        const proTenant = await resolveTenant(req, appt.tenantId);
        if (!proTenant || proTenant.id !== appt.tenantId) {
          return guard;
        }
      }
    }

    let paymentData: { ref: string; method: string } | null = null;
    if (appt.paymentId) {
      const payment = await db.payment.findUnique({ where: { id: appt.paymentId } });
      if (payment) {
        paymentData = {
          ref: payment.ref,
          method: payment.method,
        };
      }
    }

    const passData = {
      appointment: {
        id: appt.id,
        startAt: appt.startAt,
        durationMin: appt.durationMin,
        status: appt.status,
        price: appt.price,
        depositAmount: appt.depositAmount,
        clientName: appt.clientName,
        clientPhone: appt.clientPhone,
        notes: appt.notes,
      },
      service: {
        name: appt.service.name,
        category: appt.service.category,
        durationMin: appt.service.durationMin,
        price: appt.service.price,
        description: appt.service.description,
      },
      tenant: {
        name: appt.tenant.name,
        city: appt.tenant.city,
        address: appt.tenant.address,
        phone: appt.tenant.phone,
      },
      resource: {
        name: appt.resource.name,
        role: appt.resource.role,
      },
      user: appt.user
        ? {
            id: appt.user.id,
            name: appt.user.name,
            phone: appt.user.phone,
            skinType: appt.user.skinType,
          }
        : null,
      payment: paymentData,
    };

    const pdf = appointmentPassPdf(passData);
    const filename = `kene-pass-rdv-${appt.id.slice(-6).toUpperCase()}.pdf`;

    return new NextResponse(Buffer.from(pdf.data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdf.data.byteLength),
        "Cache-Control": "private, no-transform, max-age=3600",
      },
    });
  } catch (err) {
    return serverError("appointments:pass", err);
  }
}
