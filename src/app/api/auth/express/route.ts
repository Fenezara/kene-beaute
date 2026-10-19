// GET /api/auth/express — accès instantané en UNE requête GET.
//
// CONTRAT (mesuré en conditions réelles): chez certaines utilisatrices
// (préview intégrée en iframe), les POST sortants de la page n'atteignent
// JAMAIS le serveur — et pire, ils ne rejettent pas non plus: ils restent
// pendus ou reçoivent une réponse proxy (HTML 403) AVANT le serveur. Le
// pont GET (déclenché sur rejet réseau) ne s'armait donc jamais → le
// bouton « Explorer Kènè — sans inscription » tournait dans le vide. Ses
// GET, eux, traversent TOUJOURS.
//
// D'où ce contrat: l'accès express n'a BESOIN d'aucun POST. Un GET unique
// fait le login complet côté serveur (l'équivalent d'otp/request +
// otp/verify pour le compte découverte +2250701020304) et répond
// EXACTEMENT comme otp/verify: { user, tenant } + cookie de session signé
// posé sur la réponse.
//
// Garde-fous identiques aux autres routes d'auth: rate-limit IP (profil
// OTP_REQUEST, clé dédiée « express » pour ne pas consommer le quota SMS)
// et événement d'audit « express_login ».
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef } from "@/lib/kene/server";
import { setSessionCookie, sanitizeUser, sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, OTP_REQUEST } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";
import { KENE_ADMIN_PHONE } from "@/lib/kene/config";
import { grantClientWelcomeTrial, grantProWelcomeTrial } from "@/lib/kene/plans";

export const runtime = "nodejs";

/** Compte découverte seedé: Mariam Diallo, cliente championne. */
const EXPRESS_PHONE = "+2250701020304";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "express"), OTP_REQUEST);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de connexions rapides — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const requestedRole = req.nextUrl.searchParams.get("role") || "client";
    const newGuest = req.nextUrl.searchParams.get("newGuest") === "1";
    const currentSession = sessionFromRequest(req);

    // L'accès Pro et Admin par express login est strictement interdit sans session authentifiée préalable
    if (requestedRole === "pro" && currentSession?.role !== "pro" && currentSession?.role !== "admin") {
      return jsonError("L'accès à l'Espace Entreprise requiert une connexion avec vos identifiants d'institut", 403);
    }
    if (requestedRole === "admin" && currentSession?.role !== "admin") {
      return jsonError("L'accès à la Console Administrateur requiert une connexion administrateur", 403);
    }

    const targetRole = (requestedRole === "pro" && (currentSession?.role === "pro" || currentSession?.role === "admin"))
      ? "pro"
      : (requestedRole === "admin" && currentSession?.role === "admin")
      ? "admin"
      : "client";

    // ── ISOLATION STRICTE DES SESSIONS DÉCOUVERTE ──
    // Chaque invité reçoit son compte découverte unique et vierge.
    let user: Awaited<ReturnType<typeof db.user.create>> | null = null;

    if (targetRole === "client") {
      // Si une session cliente existait déjà et qu'on ne force pas un nouveau compte invité, on la recharge
      if (currentSession?.userId && !newGuest) {
        user = await db.user.findUnique({ where: { id: currentSession.userId } });
      }
      // Sinon on génère un compte invité unique et dédié à cet appareil
      if (!user) {
        const uniqueGuestPhone = `+22500${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
        user = await db.user.create({
          data: {
            phone: uniqueGuestPhone,
            name: "Nouvelle invitée",
            role: "client",
            referralCode: genRef("KENE"),
          },
        });
        await grantClientWelcomeTrial(user.id).catch(() => null);
      }
    } else {
      let phoneToUse = targetRole === "pro" ? "+2250709080706" : KENE_ADMIN_PHONE;
      let fallbackName = targetRole === "pro" ? "Fatou Koné" : "Fenezara";

      user = await db.user.findUnique({ where: { phone: phoneToUse } });
      if (!user) {
        user = await db.user.findFirst({ where: { role: targetRole } });
      }
      if (!user) {
        user = await db.user.create({
          data: {
            phone: phoneToUse,
            name: fallbackName,
            role: targetRole,
            referralCode: genRef("KENE"),
          },
        });
        if (user.role === "pro") {
          await grantProWelcomeTrial(user.id).catch(() => null);
        }
      }
    }

    if (!user) {
      return jsonError("Impossible d'initialiser la session", 500);
    }

    let ownerTenant = await db.tenant.findFirst({ where: { ownerPhone: user.phone } });
    if (!ownerTenant && (targetRole === "pro" || targetRole === "admin")) {
      ownerTenant = await db.tenant.findFirst({ where: { active: true } });
    }

    void audit({ kind: "express_login", phone: user.phone, userId: user.id, ip: clientIp(req), detail: `role:${targetRole}` });

    const response = NextResponse.json({
      user: sanitizeUser(user),
      tenant: ownerTenant ? { id: ownerTenant.id, name: ownerTenant.name } : null,
    });
    setSessionCookie(response, user);
    return response;
  } catch (err) {
    return serverError("auth/express", err);
  }
}

// Un POST ici n'a pas de sens (le login express EST le GET) — réponse
// explicite plutôt qu'un 405 muet si un ancien bundle appelait cette URL
// en POST.
export async function POST() {
  return jsonError("Accès instantané : appel GET uniquement", 405);
}
