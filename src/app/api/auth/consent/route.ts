// POST /api/auth/consent — {userId, types?} → consentement données de santé
// GET /api/auth/consent?_g=… — pont (même payload JSON en query): les
// préviews bloqueuses de POST ne doivent pas empêcher l'inscription d'un
// compte (le consentement santé fait partie du questionnaire d'onboarding).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sanitizeUser } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";

const Body = z.object({
  userId: z.string().min(1),
  types: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:consent"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de mises à jour d'affilée — réessaie dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    return await runConsent(parsed.data, req);
  } catch (err) {
    return serverError("auth/consent", err);
  }
}

// Pont GET — voir src/lib/kene/get-bridge.ts. MÊMES garde-fous.
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:consent"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de mises à jour d'affilée — réessaie dans quelques secondes");
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Corps de requête invalide — ${bridged.error}`, 400);
    return await runConsent(bridged.data, req);
  } catch (err) {
    return serverError("auth/consent", err);
  }
}

/** Cœur partagé POST/GET. */
async function runConsent(parsed: z.infer<typeof Body>, req: NextRequest): Promise<NextResponse> {
  const { userId } = parsed;
  const types = parsed.types?.length ? parsed.types : ["health_data"];

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError("Utilisatrice introuvable", 404);

  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  await db.consent.createMany({
    data: types.map((type) => ({ userId, type, granted: true, ip: ip ?? null })),
  });
  const updated = await db.user.update({
    where: { id: userId },
    data: { consentHealth: true, consentTs: new Date() },
  });

  return NextResponse.json({ user: sanitizeUser(updated) });
}
