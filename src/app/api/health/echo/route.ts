// GET/POST /api/health/echo — balise de diagnostic réseau (t. 91).
// Objectif : déterminer EMPIRIQUEMENT quelles méthodes HTTP traversent la
// chaîne de préview de l'utilisatrice réelle (iframe de préview → gateway
// plateforme → Caddy :81 → Next :3000). Symptômes : ses GET arrivent
// (polls notifications visibles en dev.log), ses POST n'arrivent JAMAIS
// (zéro POST /api/dermato/chat, zéro otp/request de sa part sur toute la
// génération de log) → login ET chat cassés pour elle seule.
// La balise logge la méthode + marqueur : si les marqueurs GET arrivent et
// pas les POST, la chaîne externe bloque les POST → correctif requis côté
// transport. Route à retirer après diagnostic (temporaire).
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("m") ?? "?";
  console.log(`[kene:beacon] GET ${m} ua=${(req.headers.get("user-agent") ?? "?").slice(0, 80)}`);
  return NextResponse.json({ ok: true, method: "GET", m }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { m?: string };
  const m = body.m ?? "?";
  console.log(`[kene:beacon] POST ${m} ua=${(req.headers.get("user-agent") ?? "?").slice(0, 80)}`);
  return NextResponse.json({ ok: true, method: "POST", m }, { headers: { "Cache-Control": "no-store" } });
}
