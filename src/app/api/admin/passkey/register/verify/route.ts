// POST /api/admin/passkey/register/verify — étape 2 de l'enregistrement
// (t. 130). GET ponté (?_g=… — le payload d'attestation tient en query).
//
// { name?, response } → vérifie la cérémonie WebAuthn (défi fraî du register/
// options, origine et rpID attendus), puis ENREGISTRE l'appareil:
// clé publique, compteur anti-rejeu, type d'appareil, sauvegarde cloud.
// Session admin + élévation exigées (les mêmes que register/options — la
// cérémonie complète se joue dans la fenêtre de 5 min du step-up).
// Audit passkey_registered + notification console.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { sessionFromRequest, guardAdminElevated } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { rpFromRequest } from "@/lib/kene/webauthn";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  response: z.object({}).passthrough(), // RegistrationResponseJSON — validé par SimpleWebAuthn
});

async function runVerify(data: z.infer<typeof Body>, req: NextRequest): Promise<NextResponse> {
  const guard = guardAdminElevated(req);
  if (guard) return guard;
  const sess = sessionFromRequest(req);
  if (!sess) return jsonError("Session requise", 401);

  const rp = rpFromRequest(req);
  if (!rp) return jsonError("Origine de la requête illisible — réessaie depuis la console", 400);

  const user = await db.user.findUnique({ where: { id: sess.userId } });
  if (!user) return jsonError("Compte introuvable", 404);

  // Défi d'enregistrement fraîchement émis pour CE numéro (< 5 min).
  const challenge = await db.webauthnChallenge.findFirst({
    where: { phone: sess.phone, purpose: "register", expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) {
    return jsonError("Cérémonie expirée — relance l'enregistrement de l'appareil", 400);
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: data.response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      void audit({ kind: "passkey_register_failed", userId: user.id, phone: user.phone, ip: clientIp(req), detail: "cérémonie rejetée" });
      return jsonError("Enregistrement refusé par la vérification — réessaie", 400);
    }

    const info = verification.registrationInfo;
    const credential = info.credential;

    // Défi consommé.
    await db.webauthnChallenge.delete({ where: { id: challenge.id } });

    // Upsert par credentialId (ré-enregistrer un appareil déjà connu = update).
    const saved = await db.passkeyCredential.upsert({
      where: { credentialId: credential.id },
      create: {
        credentialId: credential.id,
        userId: user.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports?.join(",") ?? null,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        name: data.name ?? null,
      },
      update: {
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports?.join(",") ?? null,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });

    void audit({
      kind: "passkey_registered",
      userId: user.id,
      phone: user.phone,
      ip: clientIp(req),
      detail: `${data.name ?? "Appareil"} · ${info.credentialDeviceType}`,
    });
    void notify({
      userId: user.id,
      channel: "console",
      toPhone: user.phone,
      message: `🔐 Nouvel appareil autorisé sur la console — ${data.name ?? "appareil sans étiquette"}. Si ce n'était pas toi, retire-le dans Sécurité.`,
    });

    return NextResponse.json({
      ok: true,
      credential: {
        id: saved.id,
        name: saved.name,
        deviceType: saved.deviceType,
        backedUp: saved.backedUp,
        createdAt: saved.createdAt,
      },
    });
  } catch (err) {
    void audit({
      kind: "passkey_register_failed",
      userId: user.id,
      phone: user.phone,
      ip: clientIp(req),
      detail: err instanceof Error ? err.message.slice(0, 120) : "erreur inconnue",
    });
    return jsonError("Enregistrement impossible — l'appareil ou le navigateur a refusé la cérémonie", 400);
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:reg:verify"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Réponse d'enregistrement invalide", 400);
    return await runVerify(parsed.data, req);
  } catch (err) {
    return serverError("admin/passkey/register/verify", err);
  }
}

// Pont GET — même payload (le JSON d'attestation tient en query, ~1-3 ko).
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:passkey:reg:verify"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Réponse d'enregistrement invalide — ${bridged.error}`, 400);
    return await runVerify(bridged.data, req);
  } catch (err) {
    return serverError("admin/passkey/register/verify", err);
  }
}
