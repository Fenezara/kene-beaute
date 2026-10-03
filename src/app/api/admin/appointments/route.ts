// GET /api/admin/appointments — Liste centralisée de tous les rendez-vous du réseau Kènè
// PATCH /api/admin/appointments — Mise à jour du statut d'un rendez-vous par l'administrateur
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { serverError, jsonError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest): NextResponse | null {
  const sess = sessionFromRequest(req);
  if (!sess) {
    return NextResponse.json(
      { error: "Console de gestion réservée aux comptes admin — reconnecte-toi" },
      { status: 401 },
    );
  }
  if (sess.role !== "admin") {
    return NextResponse.json({ error: "Console admin réservée aux comptes admin" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:appointments"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const guard = requireAdmin(req);
  if (guard) return guard;

  try {
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const status = req.nextUrl.searchParams.get("status")?.trim().toLowerCase() ?? "all";
    const tenantId = req.nextUrl.searchParams.get("tenantId")?.trim() ?? "";
    const limit = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get("limit") || 100)));

    const whereClause: any = {};

    if (status && status !== "all") {
      whereClause.status = status;
    }

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    if (q) {
      whereClause.OR = [
        { clientName: { contains: q } },
        { clientPhone: { contains: q } },
        { notes: { contains: q } },
        { service: { name: { contains: q } } },
        { tenant: { name: { contains: q } } },
        { tenant: { city: { contains: q } } },
      ];
    }

    const [appointments, totalCount, confirmedCount, completedCount, cancelledCount, pendingCount, noShowCount] =
      await Promise.all([
        db.appointment.findMany({
          where: whereClause,
          orderBy: { startAt: "desc" },
          take: limit,
          include: {
            tenant: { select: { id: true, name: true, city: true, address: true, phone: true } },
            service: { select: { id: true, name: true, durationMin: true, price: true } },
            resource: { select: { id: true, name: true } },
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        }),
        db.appointment.count(),
        db.appointment.count({ where: { status: "confirmed" } }),
        db.appointment.count({ where: { status: "completed" } }),
        db.appointment.count({ where: { status: "cancelled" } }),
        db.appointment.count({ where: { status: "pending" } }),
        db.appointment.count({ where: { status: "no_show" } }),
      ]);

    const totalDepositAmount = appointments.reduce((sum, a) => sum + (a.depositAmount || 0), 0);
    const totalVolume = appointments
      .filter((a) => a.status === "confirmed" || a.status === "completed")
      .reduce((sum, a) => sum + (a.price || 0), 0);

    return NextResponse.json({
      appointments,
      stats: {
        total: totalCount,
        confirmed: confirmedCount,
        completed: completedCount,
        cancelled: cancelledCount,
        pending: pendingCount,
        noShow: noShowCount,
        totalDepositAmount,
        totalVolume,
      },
    });
  } catch (err) {
    return serverError("admin/appointments:get", err);
  }
}

const PatchSchema = z.object({
  appointmentId: z.string().min(1),
  status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]),
});

export async function PATCH(req: NextRequest) {
  const guard = requireAdmin(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Corps de requête invalide", 400);
    }

    const { appointmentId, status } = parsed.data;

    const existing = await db.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!existing) {
      return jsonError("Rendez-vous introuvable", 404);
    }

    const updated = await db.appointment.update({
      where: { id: appointmentId },
      data: { status },
      include: {
        tenant: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
    });

    const sess = sessionFromRequest(req);
    void audit({
      kind: "admin_action",
      userId: sess?.userId,
      ip: clientIp(req),
      detail: `appointment_status_update:${appointmentId}:${existing.status}->${status}`,
    });

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    return serverError("admin/appointments:patch", err);
  }
}
