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
import { jsonError, serverError, notify } from "@/lib/kene/server";
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

    // 1. Tous les instituts partenaires actifs
    const allTenants = await db.tenant.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        city: true,
        active: true,
        photoData: true,
        phone: true,
        ownerPhone: true,
        country: true,
      },
      orderBy: { name: "asc" },
    });

    // 2. Fiches profils de la cliente si déjà existantes
    const profiles = await db.clientProfile.findMany({
      where: { userId },
      select: {
        tenantId: true,
        visitsCount: true,
        lastVisit: true,
      },
    });
    const profileMap = new Map(profiles.map((p) => [p.tenantId, p]));

    // 3. Consentements accordés
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
      shares: allTenants.map((t) => {
        const prof = profileMap.get(t.id);
        return {
          tenantId: t.id,
          name: t.name,
          city: t.city,
          active: t.active,
          hasPhoto: Boolean(t.photoData),
          phone: t.phone,
          ownerPhone: t.ownerPhone,
          country: t.country,
          granted: grantedByTenant.get(t.id) ?? false,
          visitsCount: prof?.visitsCount ?? 0,
          lastVisit: prof?.lastVisit ?? null,
        };
      }),
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

    const userObj = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, city: true, fitzpatrick: true },
    });
    if (!userObj) return jsonError("Utilisatrice introuvable", 404);
    if (userObj.phone.startsWith("+22500") || userObj.id === "guest" || userObj.id.startsWith("guest_") || userObj.name === "Nouvelle invitée") {
      return jsonError("Inscription requise : un utilisateur en mode invité ne peut pas partager ses données avec un institut.", 403);
    }

    // Création automatique de la fiche si elle n'existe pas encore
    let profile = await db.clientProfile.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
    if (!profile) {
      const u = userObj;
      profile = await db.clientProfile.create({
        data: {
          userId,
          tenantId,
          name: u?.name || "Cliente Kènè",
          phone: u?.phone || "00000000",
          district: u?.city || undefined,
          fitzpatrick: u?.fitzpatrick ? String(u.fitzpatrick) : undefined,
          notes: "Liaison et consentement de partage accordés par la cliente sur Kènè",
        },
        select: { id: true },
      });
    }

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

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { phone: true, ownerPhone: true },
    });
    const toPhone = tenant?.phone || tenant?.ownerPhone || "00000000";

    await notify({
      tenantId,
      channel: "in_app",
      toPhone,
      message: granted
        ? `🌿 ${userObj.name || "Une cliente"} a partagé ses bilans de peau avec votre institut.`
        : `🔒 ${userObj.name || "Une cliente"} a retiré l'accès à ses bilans de peau.`,
      metaJson: JSON.stringify({ type: "client_share", granted, userId, clientId: profile.id }),
    }).catch(() => null);

    return NextResponse.json({ ok: true, tenantId, granted });
  } catch (err) {
    return serverError("auth/shares:post", err);
  }
}
