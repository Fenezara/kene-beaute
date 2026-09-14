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
import { setSessionCookie } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, OTP_REQUEST } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";

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
    // Parité stricte avec otp/verify: find-or-create + rôle lié à un éventuel
    // institut possédé par le numéro (nul pour le compte découverte, mais le
    // champ reste dans la réponse — zéro casse côté front).
    const ownerTenant = await db.tenant.findFirst({ where: { ownerPhone: EXPRESS_PHONE } });

    let user = await db.user.findUnique({ where: { phone: EXPRESS_PHONE } });
    if (!user) {
      // La base est vide (reset): l'accès express doit marcher quand même —
      // on crée le compte minimal; le seed complet reste la source des
      // données riches.
      user = await db.user.create({
        data: {
          phone: EXPRESS_PHONE,
          name: "Mariam Diallo",
          role: ownerTenant ? "pro" : "client",
          referralCode: genRef("KENE"),
        },
      });
    }

    void audit({ kind: "express_login", phone: EXPRESS_PHONE, userId: user.id, ip: clientIp(req) });

    const response = NextResponse.json({
      user,
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
