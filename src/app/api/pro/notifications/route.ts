// GET /api/pro/notifications?tenantId= — fil de notifications de l'institut
// Liste les notifications adressées au salon (nouveaux RDV, annulations, commandes,
// alertes stocks, avis clientes, partages de dossiers cutanés).
// POST /api/pro/notifications/read — { tenantId, ids? } marque les notifications comme lues.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:notifications:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          channel: true,
          toPhone: true,
          message: true,
          status: true,
          metaJson: true,
          readAt: true,
          createdAt: true,
        },
      }),
      db.notification.count({
        where: {
          tenantId: tenant.id,
          readAt: null,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        channel: n.channel,
        toPhone: n.toPhone,
        message: n.message,
        status: n.status,
        metaJson: n.metaJson,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
      unread: unreadCount,
    });
  } catch (err) {
    return serverError("pro/notifications:get", err);
  }
}
