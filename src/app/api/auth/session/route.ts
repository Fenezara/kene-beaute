// GET /api/auth/session?userId= — validation de session au boot.
// La cliente (ou la gérante) repart avec son objet User Prisma complet, ou un
// 404 « Session expirée » si le compte n'existe plus → retour à l'onboarding.
// Contrat (t. 66) : 200 { user } · 400 userId manquant · 404 session expirée.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Léger : appelé une fois au boot — AUTH_MUTATION (20/min) suffit largement.
  const rl = rateLimit(rlKey(req, "auth:session"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de vérifications de session — réessaie dans quelques secondes");
  }
  try {
    const userId = req.nextUrl.searchParams.get("userId")?.trim();
    if (!userId) return jsonError("Identifiant de session requis", 400);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Session expirée", 404);

    return NextResponse.json({ user });
  } catch (err) {
    return serverError("auth/session", err);
  }
}
