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
import { PLAN_DEFS, diagQuotaFor, getActiveSubscription } from "@/lib/kene/plans";
import { rateLimit, rlKey, rateLimitResponse, WALLET_TOPUP } from "@/lib/kene/rate-limit";

export async function GET(req: NextRequest) {
  // Pattern rate-limit d'une route existante (wallet/topup,): la
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
    const audience = user.role === "pro" ? "pro" : "client";

    const [sub, quota] = await Promise.all([
      getActiveSubscription(userId),
      diagQuotaFor(userId),
    ]);

    return NextResponse.json({
      plan: sub?.plan ?? "gratuit",
      plans: PLAN_DEFS.filter((p) => p.audience === audience),
      quota,
      subscription: sub
        ? {
            id: sub.id,
            plan: sub.plan,
            status: sub.status,
            priceFcfa: sub.priceFcfa,
            source: sub.source,
            startedAt: sub.startedAt,
            expiresAt: sub.expiresAt,
          }
        : null,
    });
  } catch (err) {
    return serverError("subscriptions", err);
  }
}
