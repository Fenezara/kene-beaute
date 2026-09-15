// POST /api/subscriptions/renew — renouvelle l'abonnement ACTIF de
// l'utilisatrice pour 30 jours supplémentaires (t. 138 — le moment
// échéance: la carte J-3 de l'accueil et le rappel automatique mènent ici
// en deux tapes depuis l'onglet Abonnement).
// Paiement mobile money SIMULÉ (source "momo_sim", prix plein du plan) —
// même honnêteté que l'activation: aucun débit réel, mode essai.
// Discipline IFRS 15 (t. 135): l'ancienne ligne est clôturée, la nouvelle
// période se RACCORDE après l'échéance courante — jamais d'écrasement.
// Contrat: 200 { subscription, quota } · 400 (aucun abonnement actif) · 404.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { renewPlan, diagQuotaFor } from "@/lib/kene/plans";
import { rateLimit, rlKey, rateLimitResponse, WALLET_TOPUP } from "@/lib/kene/rate-limit";
import { guardUserClaim } from "@/lib/kene/session";

export const runtime = "nodejs";

const Body = z.object({
  userId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Flux argent simulé borné 8/min par IP (même budget que l'activation).
  const rl = rateLimit(rlKey(req, "subscriptions:renew"), WALLET_TOPUP);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de renouvellements à la suite — patiente quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide (userId)", 400);
    const { userId } = parsed.data;

    // Session signée: on ne renouvelle QUE le compte de la session (même
    // garde que referral/redeem — pas de renouvellement à la place d'une autre).
    const guard = guardUserClaim(req, "subscriptions:renew", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Compte introuvable — reconnecte-toi", 404);

    try {
      const { subscription } = await renewPlan(userId);
      const quota = await diagQuotaFor(userId);
      return NextResponse.json({
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          priceFcfa: subscription.priceFcfa,
          source: subscription.source,
          startedAt: subscription.startedAt,
          expiresAt: subscription.expiresAt,
        },
        quota,
      });
    } catch (err) {
      // Messages FR de la lib (plan inconnu / aucun abonnement actif).
      if (err instanceof Error) return jsonError(err.message, 400);
      throw err;
    }
  } catch (err) {
    return serverError("subscriptions/renew", err);
  }
}
