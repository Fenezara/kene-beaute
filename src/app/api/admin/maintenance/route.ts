// GET /api/admin/maintenance — Lire l'état du mode maintenance
// POST /api/admin/maintenance — Activer/Désactiver et configurer l'affiche
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMaintenanceConfig, setMaintenanceConfig } from "@/lib/kene/maintenance";
import { guardAdminRole, sessionFromRequest } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";
import { jsonError, serverError } from "@/lib/kene/server";

export const dynamic = "force-dynamic";

const UpdateBody = z.object({
  enabled: z.boolean(),
  message: z.string().trim().min(5).max(500).optional(),
  estimatedEnd: z.string().trim().max(100).nullable().optional(),
  emergencyPhone: z.string().trim().max(30).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const guard = guardAdminRole(req, "admin:maintenance:get");
    if (guard) return guard;

    const config = getMaintenanceConfig();
    return NextResponse.json({ config });
  } catch (err) {
    return serverError("admin/maintenance:get", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = guardAdminRole(req, "admin:maintenance:post");
    if (guard) return guard;

    const session = await sessionFromRequest(req);
    const body = await req.json().catch(() => null);
    const parsed = UpdateBody.safeParse(body);
    if (!parsed.success) {
      return jsonError("Paramètres de maintenance invalides", 400);
    }

    const { enabled, message, estimatedEnd, emergencyPhone } = parsed.data;
    const authorName = session?.phone ? `Admin ${session.phone}` : "Administrateur";

    const updated = setMaintenanceConfig(
      {
        enabled,
        ...(message ? { message } : {}),
        estimatedEnd: estimatedEnd !== undefined ? estimatedEnd : undefined,
        ...(emergencyPhone ? { emergencyPhone } : {}),
      },
      authorName
    );

    // Audit log
    void audit({
      kind: enabled ? "maintenance_enabled" : "maintenance_disabled",
      userId: session?.userId,
      phone: session?.phone,
      ip: clientIp(req),
      detail: enabled
        ? `Mode maintenance ACTIVÉ par ${authorName}. Fin estimée: ${estimatedEnd || "non précisée"}`
        : `Mode maintenance DÉSACTIVÉ par ${authorName}. Plateforme en ligne.`,
    });

    return NextResponse.json({ success: true, config: updated });
  } catch (err) {
    return serverError("admin/maintenance:post", err);
  }
}
