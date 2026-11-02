// POST /api/referral/redeem — { userId, code }: échange du code d'une amie
// Zéro cash, zéro produit physique. 100% logiciel et abonnements santé Kènè+:
// - La filleule reçoit immédiatement 30 jours de Kènè+ offerts.
// - La marraine progresse sur ses paliers (5 amies = 1 mois offert, etc.).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet, notify } from "@/lib/kene/server";
import { FILLEUL_GIFT_DAYS, calculateGrantedMonths, getReferralProgress } from "@/lib/kene/referral";
import { grantGiftDays } from "@/lib/kene/plans";
import { guardUserClaim } from "@/lib/kene/session";
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

  let parrainWallet =
    (await db.wallet.findUnique({ where: { referralCode: code } })) ??
    (await db.wallet.findUnique({ where: { referralCode: rawCode.trim() } }));
  if (!parrainWallet) return jsonError("Code inconnu — vérifie auprès de ton amie", 404);

  const parrain = await db.user.findUnique({ where: { id: parrainWallet.userId } });
  if (!parrain) return jsonError("Code inconnu — vérifie auprès de ton amie", 404);
  if (parrain.referredBy === user.id) return jsonError("Ce code ne peut pas être utilisé (échange croisé)", 400);

  // 1. Enregistre le rattachement
  await db.user.update({ where: { id: user.id }, data: { referredBy: parrain.id } });

  // 2. Offre 30 jours de Kènè+ à la FILLEULE
  let filleulGiftDays = 0;
  try {
    const filleulGift = await grantGiftDays(user.id, "kene_plus", FILLEUL_GIFT_DAYS, "filleul_welcome");
    filleulGiftDays = FILLEUL_GIFT_DAYS;
  } catch (e) {
    // Si la filleule a déjà un abonnement spécifique
  }

  // 3. Calcul du nouveau total d'amies pour la marraine
  const priorFilleulsCount = await db.user.count({ where: { referredBy: parrain.id } });
  const previousMonths = calculateGrantedMonths(priorFilleulsCount - 1);
  const newMonths = calculateGrantedMonths(priorFilleulsCount);

  let parrainBonusDays = 0;
  // Si le nouveau total franchit un palier de mois (ex: 5 amies = 1er mois, etc.)
  if (newMonths > previousMonths && parrain.role === "client") {
    const monthsDiff = newMonths - previousMonths;
    parrainBonusDays = monthsDiff * 30;
    try {
      const parrainGift = await grantGiftDays(parrain.id, "kene_plus", parrainBonusDays, "referral_tier_reward");
      const progress = getReferralProgress(priorFilleulsCount);
      await notify({
        userId: parrain.id,
        channel: "whatsapp",
        toPhone: parrain.phone,
        message: `Félicitations ${parrain.name} ! 🌟 Grâce à l'arrivée de ${user.name}, tu as réuni ${priorFilleulsCount} amies et débloqué le palier ${progress.tierName} ! +${parrainBonusDays} jours d'abonnement Kènè+ viennent d'être ajoutés à ton compte 💛`,
      });
    } catch {
      // Ignorer si déjà sur un plan supérieur
    }
  } else {
    // Notification de progression sans palier
    const progress = getReferralProgress(priorFilleulsCount);
    const needed = progress.neededForNext;
    await notify({
      userId: parrain.id,
      channel: "whatsapp",
      toPhone: parrain.phone,
      message: `Kènè : ${user.name} a rejoint avec ton code ! 🌸 Tu as maintenant ${priorFilleulsCount} amie(s) dans ton cercle. Plus que ${needed} pour débloquer votre prochain mois Kènè+ offert !`,
    });
  }

  // 4. Notification bienvenue filleule
  await notify({
    userId: user.id,
    channel: "sms",
    toPhone: user.phone,
    message: `Bienvenue sur Kènè ${user.name} ! 30 jours d'abonnement Kènè+ te sont offerts par ${parrain.name} pour réaliser ton diagnostic de peau 🌿`,
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "referral_redeem",
      entity: "subscription",
      entityId: user.id,
      detailsJson: JSON.stringify({
        parrainId: parrain.id,
        filleulId: user.id,
        code,
        filleulGiftDays,
        parrainBonusDays,
        totalInvitees: priorFilleulsCount,
      }),
    },
  });

  return NextResponse.json({
    ok: true,
    giftDays: FILLEUL_GIFT_DAYS,
    parrain: { id: parrain.id, name: parrain.name },
    parrainGiftDays: parrainBonusDays,
  });
}
