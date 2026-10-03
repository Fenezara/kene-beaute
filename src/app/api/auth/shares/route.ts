// POST /api/auth/shares — consentement explicite de partage des self-scans
// Kènè vers UN institut: { userId, tenantId, granted }.
// La cliente accorde (case à la réservation ou carte « Partage » du profil)
// ou révoque (carte « Partage ») — chaque décision est horodatée (historique
// RGPD / loi ivoirienne n°2013-450), seule la DERNIÈRE compte côté institut.
// GET /api/auth/shares?userId= — instituts où la cliente a une fiche CRM
// (RDV ou commande) + état de son partage + volume de scans concerné.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { recordScanShare, SHARE_SCANS_TYPE } from "@/lib/kene/share-consent";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const guard = guardUserClaim(req, "auth/shares:get", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    // Instituts où la cliente a une fiche CRM (réservation, commande ou caisse).
    const profiles = await db.clientProfile.findMany({
      where: { userId },
      select: {
        tenantId: true,
        visitsCount: true,
        lastVisit: true,
        tenant: { select: { id: true, name: true, city: true, active: true, photoData: true } },
      },
      orderBy: { lastVisit: "desc" },
    });

    const consents = await db.consent.findMany({
      where: { userId, type: SHARE_SCANS_TYPE, tenantId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { tenantId: true, granted: true },
    });
    const grantedByTenant = new Map<string, boolean>();
    for (const c of consents) {
      if (c.tenantId && !grantedByTenant.has(c.tenantId)) grantedByTenant.set(c.tenantId, c.granted);
    }

    const scansTotal = await db.diagnosis.count({ where: { userId, status: "done" } });

    return NextResponse.json({
      scansTotal,
      shares: profiles.map((p) => ({
        tenantId: p.tenant.id,
        name: p.tenant.name,
        city: p.tenant.city,
        active: p.tenant.active,
        hasPhoto: Boolean(p.tenant.photoData),
        granted: grantedByTenant.get(p.tenant.id) ?? false,
        visitsCount: p.visitsCount,
        lastVisit: p.lastVisit,
      })),
    });
  } catch (err) {
    return serverError("auth/shares:get", err);
  }
}

const Body = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  granted: z.boolean(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:shares"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de mises à jour d'affilée — réessaie dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { userId, tenantId, granted } = parsed.data;

    const guard = guardUserClaim(req, "auth/shares:post", userId);
    if (guard) return guard;

    // La cliente ne peut partager qu'avec un institut dont elle est cliente
    // (fiche CRM créée par un RDV, une commande ou la caisse) — jamais avec
    // un institut au hasard.
    const profile = await db.clientProfile.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
    if (!profile) return jsonError("Aucune fiche cliente chez cet institut", 404);

    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    await recordScanShare({ userId, tenantId, granted, ip });

    await db.auditLog.create({
      data: {
        tenantId,
        userId,
        action: granted ? "share_scans_granted" : "share_scans_revoked",
        entity: "consent",
        detailsJson: JSON.stringify({ type: SHARE_SCANS_TYPE, via: "app" }),
      },
    });

    return NextResponse.json({ ok: true, tenantId, granted });
  } catch (err) {
    return serverError("auth/shares:post", err);
  }
}
