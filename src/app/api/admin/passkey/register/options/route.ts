// POST /api/admin/passkey/register/options — étape 1 de l'enregistrement
// d'un passkey (t. 130). GET ponté (?_g=… — même payload, la préview de la
// fondatrice peut bloquer les POST).
//
// Session admin + ÉLÉVATION fraîche exigées (ajouter un authenticator est
// un acte sensible — on re-confirme l'identité juste avant, ASVS V2.7).
// Répond { options } (PublicKeyCredentialCreationOptionsJSON) — le front
// appelle startRegistration() puis POST /api/admin/passkey/register/verify.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest, guardAdminElevated } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { rpFromRequest } from "@/lib/kene/webauthn";
import { generateRegistrationOptions } from "@simplewebauthn/server";

export const runtime = "nodejs";

/** Payload vide ({} — le pont GET transporte un objet vide). */
const Body = z.object({});

async function runOptions(req: NextRequest): Promise<NextResponse> {
  const guard = guardAdminElevated(req);
  if (guard) return guard;
  const sess = sessionFromRequest(req);
  if (!sess) return jsonError("Session requise", 401);

  const rp = rpFromRequest(req);
  if (!rp) return jsonError("Origine de la requête illisible — réessaie depuis la console", 400);

  const user = await db.user.findUnique({ where: { id: sess.userId } });
  if (!user) return jsonError("Compte introuvable", 404);

  // Hygiène: purge des défis expirés (tous numéros/tous usages).
  await db.webauthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const existing = await db.passkeyCredential.findMany({ where: { userId: user.id } });
  const options = await generateRegistrationOptions({
    rpName: "Console Kènè",
    rpID: rp.rpID,
    userName: user.phone,
    userDisplayName: user.name,
    userID: Buffer.from(user.id, "utf8"),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (c.transports.split(",").filter(Boolean) as never) : undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });

  // Défi stocké 5 min, consommé par register/verify.
  await db.webauthnChallenge.create({
    data: {
      phone: sess.phone,
      challenge: options.challenge,
      purpose: "register",
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });

  return NextResponse.json({ options });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:reg:opt"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  try {
    return await runOptions(req);
  } catch (err) {
    return serverError("admin/passkey/register/options", err);
  }
}

// Pont GET (payload vide transporté en _g — « {} »).
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:reg:opt"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Paramètre _g requis — ${bridged.error}`, 400);
    return await runOptions(req);
  } catch (err) {
    return serverError("admin/passkey/register/options", err);
  }
}
