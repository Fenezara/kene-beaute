// GET /api/auth/session?userId= — validation de session au boot.
// La cliente (ou la gérante) repart avec son objet User Prisma complet, ou un
// 404 « Session expirée » si le compte n'existe plus → retour à l'onboarding.
// Contrat: 200 { user } · 400 userId manquant · 404 session expirée.
//
// — session signée: le cookie `kene_session` est lu EN PRIORITÉ;
// au boot, même localStorage vidé, le SessionKeeper repart du cookie (90 j,
// « rester connectée comme TikTok »). Le repli query userId conserve les
// sessions POC ouvertes avant ce sprint (pas encore de cookie).
//
// — incident « La Dermo ne passe pas »: une gérante pro qui se
// reconnecte (nouvel appareil, storage vidé, repli 409 de l'onboarding)
// n'avait AUCUN moyen de retrouver SON institut — l'espace Pro tombait sur le
// « premier tenant de la base ». La réponse embarque désormais `tenant
// { id, name }` pour les comptes pro propriétaires (shape lue par readSession
// depuis: additive, aucun front cassé).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest, setSessionCookie, sanitizeUser } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Léger: appelé une fois au boot — AUTH_MUTATION (20/min) suffit largement.
  const rl = rateLimit(rlKey(req, "auth:session"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de vérifications de session — réessaie dans quelques secondes");
  }
  try {
    // 1) Cookie de session valide → user FRAIS rechargé depuis la base par uid
    // (même shape JSON { user } — rien ne casse côté SessionKeeper).
    const sess = sessionFromRequest(req);
    if (sess) {
      const user = await db.user.findUnique({ where: { id: sess.userId } });
      if (!user) return jsonError("Session expirée", 404);
      // t. 128 — modération Console: un compte verrouillé (ou un institut
      // suspendu) ne doit pas restaurer sa session au boot. 404 « Session
      // expirée » → le SessionKeeper fait une déconnexion douce (zéro casse
      // front: le refus de connexion détaillé viendra du verify OTP).
      if (user.lockedAt) return jsonError("Session expirée", 404);
      let emp = await db.employee.findFirst({ where: { userId: user.id, active: true } });
      if (emp && user.role !== "pro") {
        await db.user.update({ where: { id: user.id }, data: { role: "pro" } });
        user.role = "pro";
      }
      const tenant = user.role === "pro"
        ? (await db.tenant.findFirst({ where: { ownerPhone: user.phone } })) ??
          (emp ? await db.tenant.findUnique({ where: { id: emp.tenantId } }) : null)
        : null;
      if (tenant && !tenant.active) return jsonError("Session expirée", 404);
      const res = NextResponse.json({ user: sanitizeUser(user), tenant: tenant ? { id: tenant.id, name: tenant.name } : null, employeeRole: emp ? emp.role : null });
      setSessionCookie(res, user);
      return res;
    }

    // 2) Absence de cookie de session valide -> non authentifié (zéro résurrection zombie)
    return jsonError("Session expirée ou absente", 401);
  } catch (err) {
    return serverError("auth/session", err);
  }
}
