// POST /api/admin/passkey/login/verify — étape 2: la connexion console par
// PASSKEY (t. 130), PRÉ-AUTH. GET ponté (le payload d'assertion tient en
// query, ~1 ko).
//
// { phone, response } → vérifie l'assertion WebAuthn contre CHAQUE appareil
// enregistré du compte (défi fraî de login/options, origine + rpID attendus,
// compteur anti-rejeu). En cas de succès:
// • gardes de modération (compte verrouillé) — l'admin n'a pas d'institut;
// • session admin posée (TTL court 8 h — OWASP session à privilèges);
// • audit login_success « passkey » + notification de connexion console;
// • réponse IDENTIQUE à otp/verify ({ user, tenant: null, employeeRole: null }).
//
// Échec → message FR clair, audit login_failed, AUCUNE session.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { setSessionCookie } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, PASSKEY_LOGIN } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { rpFromRequest } from "@/lib/kene/webauthn";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON, type WebAuthnCredential } from "@simplewebauthn/server";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";

const Body = z.object({
  phone: z.string().min(5),
  response: z.object({}).passthrough(), // AuthenticationResponseJSON — validé par SimpleWebAuthn
});

const normalizePhone = (raw: string) => raw.replace(/\s+/g, "").trim();

async function runVerify(data: z.infer<typeof Body>, req: NextRequest): Promise<NextResponse> {
  const phone = normalizePhone(data.phone);
  const ip = clientIp(req);
  const rp = rpFromRequest(req);
  if (!rp) return jsonError("Origine de la requête illisible — recharge la page console", 400);

  const user = await db.user.findUnique({ where: { phone } });
  const creds = user && user.role === "admin" ? await db.passkeyCredential.findMany({ where: { userId: user.id } }) : [];

  // Garde de modération (t. 128): un compte console verrouillé ne se rouvre
  // pas, même par passkey.
  if (user?.lockedAt) {
    void audit({
      kind: "login_locked",
      phone,
      userId: user.id,
      ip,
      detail: `compte verrouillé (passkey)${user.lockedReason ? ` — ${user.lockedReason}` : ""}`,
    });
    return jsonError(
      user.lockedReason
        ? `Compte verrouillé par la Console Kènè — ${user.lockedReason}`
        : "Compte verrouillé par la Console Kènè — contacte le support",
      403,
    );
  }

  const challenge = await db.webauthnChallenge.findFirst({
    where: { phone, purpose: "login", expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!user || creds.length === 0 || !challenge) {
    void audit({ kind: "login_failed", phone, ip, detail: "passkey — aucun appareil ou cérémonie expirée" });
    return jsonError("Connexion par passkey impossible — utilise le code à 6 chiffres", 400);
  }

  // Essaie l'assertion contre CHAQUE appareil enregistré.
  let matched: { db: (typeof creds)[number]; newCounter: number } | null = null;
  let lastError = "";
  for (const cred of creds) {
    const webCred: WebAuthnCredential = {
      id: cred.credentialId,
      publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
      counter: cred.counter,
      transports: cred.transports ? cred.transports.split(",").filter(Boolean) : undefined,
    };
    try {
      const verification = await verifyAuthenticationResponse({
        response: data.response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: webCred,
      });
      if (verification.verified) {
        matched = { db: cred, newCounter: verification.authenticationInfo.newCounter };
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 120) : "erreur";
    }
  }

  if (!matched) {
    void audit({ kind: "login_failed", phone, userId: user.id, ip, detail: `passkey rejeté${lastError ? ` — ${lastError}` : ""}` });
    return jsonError("Passkey non reconnu — réessaie ou utilise le code à 6 chiffres", 400);
  }

  // Succès: défi consommé, compteur anti-rejeu mis à jour, appareil daté.
  await db.webauthnChallenge.delete({ where: { id: challenge.id } });
  await db.passkeyCredential.update({
    where: { id: matched.db.id },
    data: { counter: matched.newCounter, lastUsedAt: new Date() },
  });

  void audit({ kind: "login_success", phone, userId: user.id, ip, detail: "passkey" });

  // Alerte de connexion console (comme pour la connexion par code).
  const when = new Date().toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  void notify({
    userId: user.id,
    channel: "console",
    toPhone: user.phone,
    message: `🔐 Connexion console par passkey — ${when} · IP ${ip}`,
  });

  // Session admin (TTL court 8 h) — payload identique à otp/verify.
  const response = NextResponse.json({ user, tenant: null, employeeRole: null });
  setSessionCookie(response, user);
  return response;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:login:verify"), PASSKEY_LOGIN);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives — réessaie dans quelques minutes");
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Téléphone et réponse passkey requis", 400);
    return await runVerify(parsed.data, req);
  } catch (err) {
    return serverError("admin/passkey/login/verify", err);
  }
}

// Pont GET — même payload.
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:login:verify"), PASSKEY_LOGIN);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives — réessaie dans quelques minutes");
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Téléphone et réponse passkey requis — ${bridged.error}`, 400);
    return await runVerify(bridged.data, req);
  } catch (err) {
    return serverError("admin/passkey/login/verify", err);
  }
}
