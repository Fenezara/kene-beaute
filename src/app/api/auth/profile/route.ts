// PATCH /api/auth/profile — {userId, name?, city?, skinType?, fitzpatrick?, allergies?, goals?}
// GET /api/auth/profile?_g=… — pont (même payload JSON en query): la
// sauvegarde du questionnaire d'inscription (nom, type de peau, phototype,
// allergies, objectifs) fait partie de la CRÉATION DE COMPTE cliente — elle
// doit passer même chez les préviews qui bloquent les POST/PATCH.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { checkPhoto } from "@/lib/kene/photo";

const Body = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  city: z.string().trim().optional().nullable(),
  skinType: z.string().trim().optional().nullable(),
  fitzpatrick: z.string().trim().optional().nullable(),
  allergies: z.string().trim().optional().nullable(),
  goals: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  // — photo de profil: data URL (nouvelle photo) ou null (retrait).
  // La donnée lourde ne revient JAMAIS dans la réponse: seul `hasAvatar`
  // est renvoyé, l'UI charge /api/media/user/:id.
  avatarData: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:profile"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de mises à jour d'affilée — réessaie dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    // Session signée (migration douce): avec cookie, le profil ne peut
    // bouger que pour le compte de la session; sans cookie → legacy.
    const guard = guardUserClaim(req, "auth/profile:patch", parsed.data.userId);
    if (guard) return guard;
    return await runProfile(parsed.data);
  } catch (err) {
    return serverError("auth/profile", err);
  }
}

// Pont GET — voir src/lib/kene/get-bridge.ts. MÊMES garde-fous.
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:profile"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de mises à jour d'affilée — réessaie dans quelques secondes");
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Corps de requête invalide — ${bridged.error}`, 400);
    const guard = guardUserClaim(req, "auth/profile:get", bridged.data.userId);
    if (guard) return guard;
    return await runProfile(bridged.data);
  } catch (err) {
    return serverError("auth/profile", err);
  }
}

/** Cœur partagé PATCH/GET. */
async function runProfile(data: z.infer<typeof Body>): Promise<NextResponse> {
  const { userId, goals, avatarData, ...rest } = data;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError("Utilisatrice introuvable", 404);

  // — la photo passe par la validation partagée (format + poids)
  if (avatarData !== undefined) {
    const check = checkPhoto(avatarData, "photo de profil");
    if (!check.ok) return jsonError(check.error, 400);
  }

  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) update[key] = value;
  }
  if (goals !== undefined) update.goals = JSON.stringify(goals);
  if (avatarData !== undefined) update.avatarData = avatarData;

  const updated = await db.user.update({ where: { id: userId }, data: update });

  // MIROIR PEAU → CRM: le type de peau / phototype déclaré par la
  // cliente dans SON app doit se répercuter À CHAUD sur toutes ses
  // fiches ClientProfile (un par institut) — sinon l'institut consulte
  // un miroir périmé jusqu'au prochain RDV/commande (ensureClientProfile
  // ne resynchronise qu'à cette occasion).
  if (update.skinType !== undefined || update.fitzpatrick !== undefined) {
    await db.clientProfile.updateMany({
      where: { userId },
      data: {
        ...(update.skinType !== undefined ? { skinType: (update.skinType as string | null) ?? null } : {}),
        ...(update.fitzpatrick !== undefined ? { fitzpatrick: (update.fitzpatrick as string | null) ?? null } : {}),
      },
    });
  }

  const { avatarData: _ad, ...safe } = updated;
  return NextResponse.json({ user: { ...safe, hasAvatar: Boolean(_ad) } });
}
