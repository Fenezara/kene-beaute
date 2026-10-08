// GET /api/subscriptions?userId= — état des abonnements Kènè pour l'écran
// « Abonnement » (cliente) et la section Pro « Abonnement & facturation ».
// Réponse: { plan, plans, quota, subscription }:
// · plan: plan courant ("gratuit" si aucune ligne active non expirée);
// · plans: PLAN_DEFS filtrés par l'audience du user ("client" si role ≠ pro);
// · quota: diagQuotaFor(userId) — gating 1 diagnostic/mois (gratuit) vs
// illimité (Kènè+), branché côté POST /api/diagnoses par le main agent;
// · subscription: ligne active sérialisée (null si aucune) — date
// d'expiration pour la carte « déjà abonnée ».
// PAIEMENT SIMULÉ POC — l'argent est simulé, comme le reste du POC.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { PLAN_DEFS, diagQuotaFor, getActiveSubscription, grantClientWelcomeTrial, grantProWelcomeTrial, getLoyaltyStatus } from "@/lib/kene/plans";
import { rateLimit, rlKey, rateLimitResponse, WALLET_TOPUP } from "@/lib/kene/rate-limit";

export async function GET(req: NextRequest) {
  // Pattern rate-limit d'une route existante (wallet/topup): la
  // lecture est bon marché mais reste bornée (anti-scan du userId).
  const rl = rateLimit(rlKey(req, "subscriptions:read"), WALLET_TOPUP);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — patiente quelques secondes");

  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("Identifiant de session requis", 400);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Compte introuvable — reconnecte-toi", 404);

    // Audience: l'espace Pro vit sur les comptes entreprise (rôle "pro");
    // tout le reste (cliente, admin) voit les offres clientes.
    // L'écran client peut forcer audience=client (même si le user est pro dans l'espace Beauté).
    const audienceParam = req.nextUrl.searchParams.get("audience");
    const audience = audienceParam === "client" ? "client" : audienceParam === "pro" ? "pro" : (user.role === "pro" ? "pro" : "client");

    const tenantId = req.nextUrl.searchParams.get("tenantId");

    let sub = await getActiveSubscription(userId);
    if (audience === "client" && sub && sub.plan !== "kene_plus") {
      // Pour la vue cliente, un abonnement pro ne fait pas foi de Kènè+
      sub = null;
    }

    if (!sub && audience === "pro" && user.role === "pro") {
      // Si l'utilisateur est pro (ou employé) sans sub directe, vérifier le tenant et sa gérante
      const tenant = tenantId
        ? await db.tenant.findUnique({ where: { id: tenantId } })
        : await db.tenant.findFirst({ where: { ownerPhone: user.phone, active: true } });
      if (tenant) {
        const ownerUser = await db.user.findUnique({ where: { phone: tenant.ownerPhone } });
        if (ownerUser && ownerUser.id !== userId) {
          sub = await getActiveSubscription(ownerUser.id);
        }
      }

      // Si toujours aucun abonnement actif : accorder le mois d'essai pro 30j 100% gratuit !
      if (!sub) {
        const proTrial = await grantProWelcomeTrial(userId, tenant?.id);
        if (proTrial) sub = proTrial;
      }
    }

    if (!sub && audience === "client") {
      const trial = await grantClientWelcomeTrial(userId);
      if (trial) sub = trial;
    }

    const quota = await diagQuotaFor(userId);

    const activePlanId = sub?.plan ?? (audience === "pro" ? "pro_starter" : "kene_plus");
    const activeLoyalty = await getLoyaltyStatus(userId, activePlanId);

    const plansWithLoyalty = await Promise.all(
      PLAN_DEFS.filter((p) => p.audience === audience).map(async (p) => {
        const loyalty = await getLoyaltyStatus(userId, p.id);
        return {
          ...p,
          consecutiveMonths: loyalty.consecutiveMonths,
          currentTierPrice: loyalty.currentTierPrice,
          nextTierPrice: loyalty.nextTierPrice,
          isTrial: loyalty.isTrial,
          trialDaysLeft: loyalty.trialDaysLeft,
        };
      })
    );

    const isSubTrial = sub
      ? sub.source === "welcome_trial" || sub.source === "welcome_offer" || sub.priceFcfa === 0
      : false;
    const trialDaysLeft = sub && isSubTrial
      ? Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)))
      : 0;

    return NextResponse.json({
      plan: sub?.plan ?? (audience === "pro" ? "pro_starter" : "gratuit"),
      plans: plansWithLoyalty,
      quota,
      loyalty: activeLoyalty,
      subscription: sub
        ? {
            id: sub.id,
            plan: sub.plan,
            status: sub.status,
            priceFcfa: sub.priceFcfa,
            source: sub.source,
            isTrial: isSubTrial,
            trialDaysLeft,
            startedAt: sub.startedAt,
            expiresAt: sub.expiresAt,
          }
        : null,
    });
  } catch (err) {
    return serverError("subscriptions", err);
  }
}
