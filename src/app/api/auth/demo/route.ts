// GET /api/auth/demo — connexion démo en UNE requête GET (t. 92).
//
// INCIDENT (mesuré en dev.log) : chez l'utilisatrice réelle (préview iframe),
// les POST sortant de la page n'atteignent JAMAIS le serveur — et pire, ils
// ne rejettent pas non plus : ils restent pendus ou reçoivent une réponse
// proxy (HTML 403) AVANT le serveur. Le pont GET t. 91 (déclenché sur rejet
// réseau) ne s'armait donc jamais → « Découvrir la démo » tournait dans le
// vide. Ses GET, eux, traversent TOUJOURS (polls, beacons : 16 GET / 0 POST).
//
// D'où ce contrat : la démo n'a BESOIN d'aucun POST. Un GET unique fait le
// login complet côté serveur (l'équivalent d'otp/request + otp/verify pour
// le compte Mariam +2250701020304) et répond EXACTEMENT comme otp/verify :
// { user, tenant } + cookie de session signé posé sur la réponse.
//
// Garde-fous identiques aux autres routes d'auth : rate-limit IP (profil
// OTP_REQUEST, clé dédiée « demo » pour ne pas consommer le quota SMS) et
// événement d'audit « demo_login ».
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef } from "@/lib/kene/server";
import { setSessionCookie } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, OTP_REQUEST } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";

/** Compte démo fleuri (PRD) : Mariam Diallo, cliente championne seedée. */
const DEMO_PHONE = "+2250701020304";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "demo"), OTP_REQUEST);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de connexions démo — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    // Parité stricte avec otp/verify : find-or-create + rôle lié à un éventuel
    // institut possédé par le numéro (nul pour la démo cliente, mais le champ
    // reste dans la réponse — zéro casse côté front).
    const ownerTenant = await db.tenant.findFirst({ where: { ownerPhone: DEMO_PHONE } });

    let user = await db.user.findUnique({ where: { phone: DEMO_PHONE } });
    if (!user) {
      // La base est vide (reset) : la démo doit marcher quand même — on crée
      // le compte minimal ; le seed complet reste la source des données riches.
      user = await db.user.create({
        data: {
          phone: DEMO_PHONE,
          name: "Mariam Diallo",
          role: ownerTenant ? "pro" : "client",
          referralCode: genRef("KENE"),
        },
      });
    }

    void audit({ kind: "demo_login", phone: DEMO_PHONE, userId: user.id, ip: clientIp(req) });

    const response = NextResponse.json({
      user,
      tenant: ownerTenant ? { id: ownerTenant.id, name: ownerTenant.name } : null,
    });
    setSessionCookie(response, user);
    return response;
  } catch (err) {
    return serverError("auth/demo", err);
  }
}

// Un POST ici n'a pas de sens (le login démo EST le GET) — réponse explicite
// plutôt qu'un 405 muet si un ancien bundle appelait cette URL en POST.
export async function POST() {
  return jsonError("Route démo : appel GET uniquement", 405);
}
