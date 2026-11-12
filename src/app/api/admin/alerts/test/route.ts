// POST /api/admin/alerts/test — envoie une alerte de test sur tous les canaux configurés.
import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { alertChannelsStatus, sendAdminAlert } from "@/lib/kene/admin-alerts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:alerts:test"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Patiente quelques secondes");
  const sess = sessionFromRequest(req);
  if (!sess || sess.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  }
  const channels = alertChannelsStatus();
  const { sent } = await sendAdminAlert(
    {
      key: `test:${Date.now()}`,
      title: "Test des alertes administrateur",
      severity: "info",
      lines: ["Si vous recevez ce message, les alertes Kènè fonctionnent ✅"],
    },
    { force: true },
  );
  return NextResponse.json({ ok: sent.length > 0, sent, channels });
}
