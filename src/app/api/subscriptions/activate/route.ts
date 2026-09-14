// POST /api/subscriptions/activate — active un plan payant Kènè
// (cliente « Kènè+ », pro « Essentiel » / « Complexe ») après paiement
// mobile money SIMULÉ (Wave / Orange Money / MTN MoMo).
// GET /api/subscriptions/activate?_g=… — pont (même payload JSON en
// query): l'activation d'un plan fait partie du parcours d'inscription
// (PlanScreen) — elle doit passer même chez les préviews qui bloquent les POST.
// PAIEMENT SIMULÉ (POC): source = "momo_sim", aucun débit réel — le front
// affiche « paiement en mode essai » à chaque étape (honnêteté absolue:
// l'argent est simulé, comme le reste du POC).
// Garde d'audience: un compte CLIENT ne peut pas activer pro_essentiel /
// pro_complexe, un compte PRO ne peut pas activer kene_plus (isolation des
// espaces — chaque rôle paye pour son propre espace).
// Idempotent: même plan déjà actif non expirée → 200 avec l'existante.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { activatePlan, diagQuotaFor, planDefById } from "@/lib/kene/plans";
import { rateLimit, rlKey, rateLimitResponse, WALLET_TOPUP } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";

const Body = z.object({
  userId: z.string().min(1),
  plan: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Pattern rate-limit d'une route existante (wallet/topup,): le
  // flux argent simulé reste borné 8/min par IP.
  const rl = rateLimit(rlKey(req, "subscriptions:activate"), WALLET_TOPUP);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop d'activations à la suite — patiente quelques secondes");
  }

  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide (userId, plan)", 400);
    return await runActivate(parsed.data);
  } catch (err) {
    return activateError(err);
  }
}

// Pont GET — voir src/lib/kene/get-bridge.ts. MÊMES garde-fous.
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "subscriptions:activate"), WALLET_TOPUP);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop d'activations à la suite — patiente quelques secondes");
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Corps de requête invalide (userId, plan) — ${bridged.error}`, 400);
    return await runActivate(bridged.data);
  } catch (err) {
    return activateError(err);
  }
}

/** Traduction d'erreur partagée POST/GET. */
function activateError(err: unknown): NextResponse {
  if (err instanceof Error && (err.message === "Plan inconnu" || err.message === "Utilisatrice introuvable")) {
    // Double garde (lib + route): plan/user re-validés au cas où.
    return jsonError(err.message, err.message === "Plan inconnu" ? 400 : 404);
  }
  return serverError("subscriptions/activate", err);
}

/** Cœur partagé POST/GET. */
async function runActivate(data: z.infer<typeof Body>): Promise<NextResponse> {
  const { userId, plan } = data;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError("Compte introuvable — reconnecte-toi", 404);

  const def = planDefById(plan);
  if (!def) return jsonError("Plan inconnu", 400);

  // Cohérence d'audience avec le rôle: offres pro réservées aux comptes
  // entreprise, Kènè+ réservé aux comptes clientes (et console).
  if (def.audience === "pro" && user.role !== "pro") {
    return jsonError("Ce plan est réservé aux comptes entreprise (espace Pro)", 400);
  }
  if (def.audience === "client" && user.role === "pro") {
    return jsonError("Ce plan est réservé aux comptes clientes Kènè", 400);
  }

  // activatePlan: idempotent (même plan actif → existante), création
  // transactionnelle + notification WhatsApp simulée à la création seule.
  const { subscription } = await activatePlan(userId, plan);
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
}
