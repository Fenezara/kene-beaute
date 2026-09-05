// GET /api/auth/session?userId= — validation de session au boot.
// La cliente (ou la gérante) repart avec son objet User Prisma complet, ou un
// 404 « Session expirée » si le compte n'existe plus → retour à l'onboarding.
// Contrat (t. 66) : 200 { user } · 400 userId manquant · 404 session expirée.
//
// t. 71-b — session signée : le cookie `kene_session` est lu EN PRIORITÉ ;
// au boot, même localStorage vidé, le SessionKeeper repart du cookie (90 j,
// « rester connectée comme TikTok »). Le repli query userId conserve les
// sessions POC ouvertes avant ce sprint (pas encore de cookie).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Léger : appelé une fois au boot — AUTH_MUTATION (20/min) suffit largement.
  const rl = rateLimit(rlKey(req, "auth:session"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de vérifications de session — réessaie dans quelques secondes");
  }
  try {
    // 1) Cookie de session valide → user FRAIS rechargé depuis la base par uid
    //    (même shape JSON { user } — rien ne casse côté SessionKeeper).
    const sess = sessionFromRequest(req);
    if (sess) {
      const user = await db.user.findUnique({ where: { id: sess.userId } });
      if (!user) return jsonError("Session expirée", 404);
      return NextResponse.json({ user });
    }

    // 2) Legacy (session POC d'avant ce sprint, sans cookie) : repli query userId.
    const userId = req.nextUrl.searchParams.get("userId")?.trim();
    if (!userId) return jsonError("Identifiant de session requis", 400);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Session expirée", 404);

    return NextResponse.json({ user });
  } catch (err) {
    return serverError("auth/session", err);
  }
}
