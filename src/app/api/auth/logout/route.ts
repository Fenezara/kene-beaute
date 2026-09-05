// POST /api/auth/logout — ferme la session signée : cookie `kene_session`
// effacé (Max-Age=0, httpOnly). Répond toujours { ok: true } en 200 — le
// nettoyage localStorage (panier, store) reste du côté client.
// (Câblage dans SettingsScreen / SettingsSection : posé par le main agent.)
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/kene/session";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
