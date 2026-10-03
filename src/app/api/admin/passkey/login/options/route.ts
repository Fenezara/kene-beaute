// POST /api/admin/passkey/login/options — étape 1 de la connexion console
// par PASSKEY (t. 130), PRÉ-AUTH (aucune session requise). GET ponté.
//
// { phone } → si ce numéro est un compte admin NON verrouillé avec au moins
// un appareil enregistré: { passkey: true, options } (défis d'authentification
// WebAuthn) — le front lance la cérémonie (empreinte/Face ID/clé) puis POST
// /api/admin/passkey/login/verify. Sinon: { passkey: false } SANS RÉVÉLER
// pourquoi (pas d'énumération de comptes — la réponse est identique pour un
// numéro inconnu, une cliente, une gérante ou une admin sans appareil: le
// front bascule alors sur le flux code).
//
// Rate-limit PASSKEY_LOGIN (12/15 min par IP — même discipline que l'OTP).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, PASSKEY_LOGIN } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { rpFromRequest } from "@/lib/kene/webauthn";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

export const runtime = "nodejs";

const Body = z.object({ phone: z.string().min(5) });

const normalizePhone = (raw: string) => raw.replace(/\s+/g, "").trim();

async function runOptions(rawPhone: string, req: NextRequest): Promise<NextResponse> {
  const phone = normalizePhone(rawPhone);
  const rp = rpFromRequest(req);
  if (!rp) return jsonError("Origine de la requête illisible — recharge la page console", 400);

  // Hygiène: purge des défis expirés.
  await db.webauthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const user = await db.user.findUnique({ where: { phone } });
  const creds =
    user && user.role === "admin" && !user.lockedAt
      ? await db.passkeyCredential.findMany({ where: { userId: user.id } })
      : [];

  // Pas admin / pas d'appareil / verrouillé → réponse NEUTRE (le front
  // continue par code — otp/verify contexte console arbitrera).
  if (creds.length === 0) return NextResponse.json({ passkey: false });

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (c.transports.split(",").filter(Boolean) as never) : undefined,
    })),
    userVerification: "preferred",
    timeout: 60_000,
  });

  await db.webauthnChallenge.create({
    data: {
      phone,
      challenge: options.challenge,
      purpose: "login",
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });

  return NextResponse.json({ passkey: true, options });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:login:opt"), PASSKEY_LOGIN);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives — réessaie dans quelques minutes");
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Numéro de téléphone requis", 400);
    return await runOptions(parsed.data.phone, req);
  } catch (err) {
    return serverError("admin/passkey/login/options", err);
  }
}

// Pont GET — même payload.
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:login:opt"), PASSKEY_LOGIN);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives — réessaie dans quelques minutes");
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Numéro de téléphone requis — ${bridged.error}`, 400);
    return await runOptions(bridged.data.phone, req);
  } catch (err) {
    return serverError("admin/passkey/login/options", err);
  }
}
