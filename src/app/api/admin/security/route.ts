// GET /api/admin/security — visionneuse « Sécurité » de la console admin (t. 86-d)
// Journal d'audit + posture : les 80 événements les plus récents (ts desc) et
// les compteurs 24 h.
//
// Garde : même mécanique de session que /api/admin/stats (cookie signé
// kene_session, HMAC-SHA256), mais STRICT — la route est nouvelle (aucun
// consommateur antérieur), et le journal expose des IP : pas de mode legacy
// public possible. Sans session admin valide → 403 franc.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

type SecurityEventDto = {
  id: string;
  ts: string; // ISO
  kind: string;
  phone: string | null;
  ip: string | null;
  detail: string | null;
};

type SecurityPayload = {
  events: SecurityEventDto[];
  stats: { total: number; last24h: number; failedLogins24h: number; locked24h: number };
};

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:security"), ADMIN_STATS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Journal très sollicité — reprends dans quelques secondes");
  }
  try {
    // Garde stricte (cf. en-tête) : session signée avec rôle admin, sinon 403.
    const sess = sessionFromRequest(req);
    if (!sess || sess.role !== "admin") {
      return NextResponse.json({ error: "Console admin réservée aux comptes admin" }, { status: 403 });
    }

    const since24h = new Date(Date.now() - 24 * 3_600_000);
    const [events, total, last24h, failedLogins24h, locked24h] = await Promise.all([
      db.securityEvent.findMany({ orderBy: { ts: "desc" }, take: 80 }),
      db.securityEvent.count(),
      db.securityEvent.count({ where: { ts: { gte: since24h } } }),
      db.securityEvent.count({ where: { kind: "login_failed", ts: { gte: since24h } } }),
      db.securityEvent.count({ where: { kind: "login_locked", ts: { gte: since24h } } }),
    ]);

    const payload: SecurityPayload = {
      events: events.map((e) => ({
        id: e.id,
        ts: e.ts.toISOString(),
        kind: e.kind,
        phone: e.phone, // déjà masqué à l'écriture (audit())
        ip: e.ip,
        detail: e.detail,
      })),
      stats: { total, last24h, failedLogins24h, locked24h },
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError("admin/security", err);
  }
}
