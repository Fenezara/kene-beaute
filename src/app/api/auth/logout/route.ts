// POST /api/auth/logout — ferme la session signée: cookie `kene_session`
// effacé (Max-Age=0, httpOnly). Répond toujours { ok: true } en 200 — le
// nettoyage localStorage (panier, store) reste du côté client.
// (Câblage dans SettingsScreen / SettingsSection: posé par le main agent.)
//: événement `logout` au journal d'audit (userId si session lisible,
// IP) — fire-and-forget, le journal ne peut pas faire échouer la déconnexion.
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, clearElevationCookie, sessionFromRequest } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const sess = sessionFromRequest(req);
    void audit({ kind: "logout", userId: sess?.userId, ip: clientIp(req) });
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    // t. 130 — l'élévation (step-up console) meurt avec la session.
    clearElevationCookie(res);
    return res;
  } catch {
    const fallback = NextResponse.json({ ok: true });
    clearSessionCookie(fallback);
    clearElevationCookie(fallback);
    return fallback;
  }
}
