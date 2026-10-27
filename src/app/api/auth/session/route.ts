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
import { jsonError, serverError, resolveUserProContext } from "@/lib/kene/server";
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
    // 1) Cookie de session valide prioritaire, ou repli sur ?userId= persisté côté client
    // (évite toute déconnexion intempestive à la réouverture de l'app ou après redémarrage conteneur)
    const sess = sessionFromRequest(req);
    const queryUserId = req.nextUrl.searchParams.get("userId")?.trim() || null;
    const targetUserId =
      sess?.userId ??
      (queryUserId && queryUserId !== "guest" && !queryUserId.startsWith("guest_") && !queryUserId.startsWith("pro_offline") && !queryUserId.startsWith("client_")
        ? queryUserId
        : null);

    if (targetUserId) {
      let user = await db.user.findUnique({
        where: { id: targetUserId },
        include: { selectedTenant: { select: { id: true, name: true, city: true, phone: true, ownerPhone: true, address: true, country: true } } },
      });
      if (!user) return jsonError("Session expirée", 404);
      if (user.lockedAt) return jsonError("Session expirée", 404);
      // Un compte invité temporaire (+22500...) sans cookie valide ne doit pas être restauré
      if (!sess && user.phone.startsWith("+22500")) {
        return jsonError("Session expirée ou absente", 401);
      }

      const proCtx = await resolveUserProContext(user);
      const ownerTenant = proCtx.ownerTenant;
      const emp = proCtx.employeeLink;
      const employeeRole = proCtx.employeeRole;
      const employeePermissions = proCtx.employeePermissions;

      if ((ownerTenant || emp) && user.role !== "pro" && user.role !== "admin") {
        await db.user.update({ where: { id: user.id }, data: { role: "pro" } });
        user.role = "pro";
      } else if (!ownerTenant && !emp && user.role === "pro") {
        await db.user.update({ where: { id: user.id }, data: { role: "client" } });
        user.role = "client";
      }

      const tenant = (user.role === "pro" || user.role === "admin")
        ? (ownerTenant ?? (emp ? emp.tenant : null))
        : null;

      const employeeName = proCtx.employeeName ?? (emp ? emp.name : null);

      // Récupération de la routine quotidienne prescrite par l'institut (accessible côté client quel que soit le rôle)
      let cosmeticsUsed: string | null = null;
      let prescribedByTenant: string | null = null;
      const digits = user.phone.replace(/\D/g, "");
      const tail = digits.length >= 8 ? digits.slice(-8) : digits;
      const profile = await db.clientProfile.findFirst({
        where: {
          OR: [
            { userId: user.id },
            ...(tail ? [{ phone: { contains: tail } }] : [{ phone: user.phone }]),
          ],
          cosmeticsUsed: { not: null },
          NOT: { cosmeticsUsed: "" },
        },
        include: { tenant: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      if (profile && profile.cosmeticsUsed && profile.cosmeticsUsed.trim()) {
        cosmeticsUsed = profile.cosmeticsUsed;
        prescribedByTenant = profile.tenant.name;
      }

      const res = NextResponse.json({
        user: {
          ...sanitizeUser(user),
          name: employeeName ?? user.name,
          employeeRole,
          employeePermissions,
          employeeName,
          cosmeticsUsed,
          prescribedByTenant,
          tenantThemeTier: tenant?.themeTier ?? null,
        },
        tenant: tenant ? { id: tenant.id, name: tenant.name, themeTier: tenant.themeTier } : null,
        employeeRole,
        employeePermissions,
        employeeName,
      });
      setSessionCookie(res, user);
      return res;
    }

    // 2) Absence de cookie et de userId valide -> non authentifié
    return jsonError("Session expirée ou absente", 401);
  } catch (err) {
    return serverError("auth/session", err);
  }
}
