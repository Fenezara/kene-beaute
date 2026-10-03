// GET /api/admin/passkey — appareils passkey enregistrés sur le compte
// console de la session (t. 130 — carte « Passkey » de l'onglet Sécurité).
//
// Session admin (pas d'élévation: simple lecture du propre compte).
// Jamais de clé publique dans le payload — seulement étiquette, type
// d'appareil, sauvegarde cloud, dates.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:list"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  const sess = sessionFromRequest(req);
  if (!sess) return jsonError("Session requise — ouvre la Console Kènè via son lien dédié", 401);
  if (sess.role !== "admin") return jsonError("Console admin réservée aux comptes admin", 403);
  try {
    const creds = await db.passkeyCredential.findMany({
      where: { userId: sess.userId },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        transports: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ credentials: creds });
  } catch (err) {
    return serverError("admin/passkey", err);
  }
}
