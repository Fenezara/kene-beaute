// PATCH /api/auth/profile — {userId, name?, city?, skinType?, fitzpatrick?, allergies?, goals?}
// GET /api/auth/profile?_g=… — pont (même payload JSON en query): la
// sauvegarde du questionnaire d'inscription (nom, type de peau, phototype,
// allergies, objectifs) fait partie de la CRÉATION DE COMPTE cliente — elle
// doit passer même chez les préviews qui bloquent les POST/PATCH.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim, sanitizeUser } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { checkPhoto } from "@/lib/kene/photo";
import { ensureClientProfile } from "@/lib/kene/client-link";
import { canonicalPhone, phoneMatchKey } from "@/lib/kene/phone-normalize";

const Body = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  gender: z.enum(["femme", "homme", "non_precise"]).optional().nullable(),
  city: z.string().trim().optional().nullable(),
  district: z.string().trim().max(100).optional().nullable(),
  birthDate: z.string().trim().max(20).optional().nullable(),
  pregnant: z.boolean().optional().nullable(),
  preferredChannel: z.string().trim().max(20).optional().nullable(),
  beautyBudget: z.string().trim().max(100).optional().nullable(),
  skinType: z.string().trim().optional().nullable(),
  fitzpatrick: z.string().trim().optional().nullable(),
  allergies: z.string().trim().optional().nullable(),
  selectedTenantId: z.string().trim().optional().nullable(),
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

export async function POST(req: NextRequest) {
  return PATCH(req);
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

  // MIROIR CLIENTE → CRM: le nom, type de peau, phototype, quartier, anniversaire,
  // maternité et préférences déclarés par la cliente se répercutent À CHAUD sur
  // toutes ses fiches ClientProfile auprès des instituts partenaires.
  const profileSync: Record<string, unknown> = {};
  if (update.name !== undefined) profileSync.name = update.name;
  if (update.gender !== undefined) profileSync.gender = update.gender;
  if (update.skinType !== undefined) profileSync.skinType = update.skinType;
  if (update.fitzpatrick !== undefined) profileSync.fitzpatrick = update.fitzpatrick;
  if (update.district !== undefined) profileSync.district = update.district;
  if (update.birthDate !== undefined) profileSync.birthDate = update.birthDate;
  if (update.pregnant !== undefined) profileSync.pregnant = update.pregnant;
  if (update.preferredChannel !== undefined) profileSync.preferredChannel = update.preferredChannel;
  if (update.beautyBudget !== undefined) profileSync.beautyBudget = update.beautyBudget;

  const userPhone = user.phone;
  const matchKey = phoneMatchKey(userPhone);

  if (Object.keys(profileSync).length > 0) {
    await db.clientProfile.updateMany({
      where: {
        OR: [
          { userId },
          ...(matchKey.length >= 8 ? [{ phone: { contains: matchKey.slice(-8) } }] : [{ phone: userPhone }]),
        ],
      },
      data: profileSync,
    });
  }

  // Connexion de la cliente à l'institut choisi
  if (update.selectedTenantId !== undefined && update.selectedTenantId) {
    if (user.phone.startsWith("+22500") || user.id === "guest" || user.id.startsWith("guest_") || user.name === "Nouvelle invitée") {
      return jsonError("Inscription requise : un utilisateur en mode invité ne peut pas rattacher son profil à un institut partenaire.", 403);
    }
    const tenantIdStr = String(update.selectedTenantId);
    await ensureClientProfile(db, tenantIdStr, {
      id: userId,
      name: (update.name as string | undefined) ?? user.name,
      phone: user.phone,
      skinType: (update.skinType as string | undefined) ?? user.skinType,
      fitzpatrick: (update.fitzpatrick as string | undefined) ?? user.fitzpatrick,
      district: (update.district as string | undefined) ?? user.district,
      birthDate: (update.birthDate as string | undefined) ?? user.birthDate,
      pregnant: (update.pregnant as boolean | undefined) ?? user.pregnant,
      preferredChannel: (update.preferredChannel as string | undefined) ?? user.preferredChannel,
      beautyBudget: (update.beautyBudget as string | undefined) ?? user.beautyBudget,
    }).catch(() => null);
  }

  const refreshed = await db.user.findUnique({
    where: { id: userId },
    include: {
      selectedTenant: { select: { id: true, name: true, city: true, phone: true, ownerPhone: true, address: true, country: true } },
    },
  });

  return NextResponse.json({ user: sanitizeUser(refreshed ?? updated) });
}
