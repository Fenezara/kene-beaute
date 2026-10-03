// GET /api/pro/cosmetovigilance?tenantId= | POST — Signalement d'effets indésirables / cosmétovigilance cabine
// Conforme aux standards de vigilance cosmétique et traçabilité dermo-esthétique

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import type { CosmetovigilanceIncident } from "@/lib/kene/cosmetovigilance";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:cosmetovigilance:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const logs = await db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        entity: "cosmetovigilance_report",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const incidents: CosmetovigilanceIncident[] = logs
      .map((l) => {
        try {
          return JSON.parse(l.detailsJson ?? "{}");
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({ incidents });
  } catch (err) {
    return serverError("pro/cosmetovigilance:get", err);
  }
}

const PostSchema = z.object({
  tenantId: z.string().min(1),
  clientName: z.string().trim().min(2),
  clientPhone: z.string().optional(),
  clientProfileId: z.string().optional(),
  productOrServiceName: z.string().trim().min(2),
  batchNumber: z.string().optional(),
  reactionType: z.enum([
    "erytheme_persistant",
    "brulure_chimique",
    "oedeme_gonflement",
    "reaction_allergique",
    "hyperpigmentation_post_peeling",
    "desquamation_excessive",
    "autre",
  ]),
  severity: z.enum(["mineure", "moderee", "severe"]),
  symptoms: z.string().trim().min(5),
  actionTaken: z.string().trim().min(3),
  reportedBy: z.string().trim().min(2),
});

export async function POST(req: NextRequest) {
  // Rate-limit: 20 signalements / min par IP (AUTH_MUTATION — même que les mutations d'auth).
  const rl = rateLimit(rlKey(req, "pro:cosmetovigilance:post"), AUTH_MUTATION);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  try {
    const guard = guardProRole(req, "pro:cosmetovigilance:post");
    if (guard) return guard;

    const parsed = PostSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Données de signalement incomplètes", 400);

    const {
      tenantId,
      clientName,
      clientPhone,
      clientProfileId,
      productOrServiceName,
      batchNumber,
      reactionType,
      severity,
      symptoms,
      actionTaken,
      reportedBy,
    } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const now = new Date();
    const incident: CosmetovigilanceIncident = {
      id: `CV-${Date.now()}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      clientProfileId,
      clientName,
      clientPhone,
      productOrServiceName,
      batchNumber,
      reactionType,
      severity,
      symptoms,
      actionTaken,
      reportedBy,
      incidentDate: now.toISOString(),
      createdAt: now.toISOString(),
      status: "nouveau",
    };

    await db.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "incident_reported",
        entity: "cosmetovigilance_report",
        entityId: incident.id,
        detailsJson: JSON.stringify(incident),
      },
    });

    return NextResponse.json({ success: true, incident }, { status: 201 });
  } catch (err) {
    return serverError("pro/cosmetovigilance:post", err);
  }
}
