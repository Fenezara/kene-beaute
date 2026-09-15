// POST /api/referral/redeem — { userId, code }: échange du code d'une amie
// GET /api/referral/redeem?_g=… — pont (même payload JSON en query):
// le parrainage fait partie du questionnaire d'inscription d'une nouvelle
// cliente — il doit passer même chez les préviews qui bloquent les POST.
// Effets: filleule reçoit son cadeau de bienvenue immédiatement, parrain notifié,
// le parrain sera récompensé à la première commande PAYÉE de la filleule.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet, creditWallet, notify } from "@/lib/kene/server";
import { FILLEUL_GIFT, PARRAIN_REWARD, filleulGiftRefId } from "@/lib/kene/referral";
import { grantGiftDays } from "@/lib/kene/plans";
import { guardUserClaim } from "@/lib/kene/session";
import { xof } from "@/lib/kene/format";
import { rateLimit, rlKey, rateLimitResponse, REFERRAL_REDEEM } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";

const Body = z.object({
  userId: z.string().min(1),
  code: z.string().trim().min(4).max(40),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "referral:redeem"), REFERRAL_REDEEM);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de tentatives de code parrain — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("userId et code requis (4 à 40 caractères)", 400);
    return await runRedeem(parsed.data, req);
  } catch (err) {
    return serverError("referral/redeem", err);
  }
}

// Pont GET — voir src/lib/kene/get-bridge.ts. MÊMES garde-fous
// (rate-limit, session signée via cookie, validations zod).
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "referral:redeem"), REFERRAL_REDEEM);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de tentatives de code parrain — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`userId et code requis (4 à 40 caractères) — ${bridged.error}`, 400);
    return await runRedeem(bridged.data, req);
  } catch (err) {
    return serverError("referral/redeem", err);
  }
}

/** Cœur partagé POST/GET. */
async function runRedeem(data: z.infer<typeof Body>, req: NextRequest): Promise<NextResponse> {
  const { userId, code: rawCode } = data;
  const code = rawCode.toUpperCase().trim();

  // Session signée (, migration douce): avec cookie, le code ne
  // s'échange que pour le compte de la session; sans cookie → legacy.
  const guard = guardUserClaim(req, "referral:redeem", userId);
  if (guard) return guard;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError("Utilisatrice introuvable", 404);
  if (user.referredBy) return jsonError("Tu es déjà parrainée — un seul code par cliente 😉", 400);

  const myWallet = await ensureWallet(userId);
  if (!myWallet) return jsonError("Wallet introuvable", 404);
  if (myWallet.referralCode.toUpperCase() === code) {
    return jsonError("Ce code est le tien — partage-le à une amie ! 💛", 400);
  }

  // Codes stockés en casse variable (seed « MARIAM-KENE », générés « KENE-XXXX ») → essais exacts
  let parrainWallet =
    (await db.wallet.findUnique({ where: { referralCode: code } })) ??
    (await db.wallet.findUnique({ where: { referralCode: rawCode.trim() } }));
  if (!parrainWallet) return jsonError("Code inconnu — vérifie auprès de ton amie", 404);

  const parrain = await db.user.findUnique({ where: { id: parrainWallet.userId } });
  if (!parrain) return jsonError("Code inconnu — vérifie auprès de ton amie", 404);
  if (parrain.referredBy === user.id) return jsonError("Ce code ne peut pas être utilisé (échange croisé)", 400);

  // Enregistre le fil + cadeau de bienvenue filleule (une seule fois via referredBy)
  await db.user.update({ where: { id: user.id }, data: { referredBy: parrain.id } });
  const wallet = await creditWallet(myWallet.id, FILLEUL_GIFT, "referral", filleulGiftRefId(user.id));

  // t. 138 — AMBASSADRICES: la marraine CLIENTE reçoit 30 jours de Kènè+
  // offerts dès que sa filleule rejoint (geste 0 F TRACÉ source
  // "referral_gift" — jamais d'écrasement, IFRS 15 comme l'offre Console).
  // Les comptes pro/admin ne reçoivent pas le cadeau (leur plan vit dans
  // l'espace Pro) ; l'échec « plan différent actif » (impossible pour une
  // cliente en pratique) est absorbé sans casser l'échange.
  let referralGift: { until: string } | null = null;
  if (parrain.role === "client") {
    try {
      const gift = await grantGiftDays(parrain.id, "kene_plus", 30, "referral_gift");
      referralGift = { until: gift.subscription.expiresAt.toISOString() };
      await notify({
        userId: parrain.id,
        channel: "whatsapp",
        toPhone: parrain.phone,
        message: `Kènè : ${user.name} a rejoint avec ton code 🎁 30 jours de Kènè+ offerts — actifs jusqu'au ${gift.subscription.expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} 💛`,
      });
    } catch {
      // Pas de cadeau (plan différent actif) — l'échange reste valide.
    }
  }

  await notify({
    userId: parrain.id,
    channel: "whatsapp",
    toPhone: parrain.phone,
    message: `Kènè : ${user.name} a rejoint la communauté avec ton code 🧡 Tu recevras ${xof(PARRAIN_REWARD)} dès sa première commande.`,
  });
  await notify({
    userId: user.id,
    channel: "sms",
    toPhone: user.phone,
    message: `Kènè : bienvenue ${user.name} ! Cadeau de bienvenue de ${xof(FILLEUL_GIFT)} crédité sur ton wallet 💛`,
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "referral_redeem",
      entity: "wallet",
      entityId: myWallet.id,
      detailsJson: JSON.stringify({ parrainId: parrain.id, filleulId: user.id, code, gift: FILLEUL_GIFT, kenePlusGiftDays: referralGift ? 30 : 0 }),
    },
  });

  return NextResponse.json({
    ok: true,
    gift: FILLEUL_GIFT,
    wallet,
    parrain: { id: parrain.id, name: parrain.name },
    // Mention du cadeau Kènè+ pour l'écran de confirmation filleule.
    parrainGiftDays: referralGift ? 30 : 0,
  });
}
