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
import { genRef, jsonError, serverError } from "@/lib/kene/server";
import { activatePlan, diagQuotaFor, planDefById } from "@/lib/kene/plans";
import { rateLimit, rlKey, rateLimitResponse } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { createSaspayCheckoutSession } from "@/lib/payments/saspay";
import { createWiniPayerPaymentSession } from "@/lib/payments/winipayer";

const Body = z.object({
  userId: z.string().min(1),
  plan: z.string().min(1),
  source: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "subscriptions:activate"), { limit: 25, windowMs: 60_000 });
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
  const rl = rateLimit(rlKey(req, "subscriptions:activate"), { limit: 25, windowMs: 60_000 });
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

  const hasSaspay = Boolean(process.env.SASPAY_API_KEY?.trim());
  const hasWiniPayer = Boolean(process.env.WINIPAYER_MERCHANT_UUID && process.env.WINIPAYER_MERCHANT_TOKEN);

  // Si le plan est payant et qu'une passerelle est configurée
  if (def.priceFcfa > 0 && (hasSaspay || hasWiniPayer)) {
    const payment = await db.payment.create({
      data: {
        userId: user.id,
        amount: def.priceFcfa,
        purpose: "subscription_activate",
        status: "pending",
        method: data.source || "saspay",
        ref: genRef("PAY"),
        metaJson: JSON.stringify({
          userId: user.id,
          planId: def.id,
          source: data.source || "saspay",
        }),
      },
    });

    let checkoutUrl: string | null = null;
    let saspayLaunchUrl: string | null = null;
    let winipayerLaunchUrl: string | null = null;

    if (hasSaspay) {
      const sasSession = await createSaspayCheckoutSession({
        paymentId: payment.id,
        amount: payment.amount,
        description: `Abonnement ${def.name} (30 jours)`,
        customerName: user.name,
        customerEmail: user.email ?? undefined,
        customerPhone: user.phone,
      });
      if (sasSession.checkoutUrl) {
        checkoutUrl = sasSession.checkoutUrl;
        saspayLaunchUrl = sasSession.checkoutUrl;
        await db.payment.update({
          where: { id: payment.id },
          data: {
            metaJson: JSON.stringify({
              userId: user.id,
              planId: def.id,
              saspayId: sasSession.id,
            }),
          },
        });
      }
    }

    if (!checkoutUrl && hasWiniPayer) {
      const wpSession = await createWiniPayerPaymentSession({
        paymentId: payment.id,
        amount: payment.amount,
        description: `Abonnement ${def.name} (30 jours)`,
        clientName: user.name,
        clientPhone: user.phone,
      });
      checkoutUrl = wpSession.paymentUrl;
      winipayerLaunchUrl = wpSession.paymentUrl;
    }

    if (checkoutUrl) {
      return NextResponse.json({
        paymentId: payment.id,
        checkoutUrl,
        paymentUrl: checkoutUrl,
        saspayLaunchUrl,
        winipayerLaunchUrl,
        mode: "redirect",
      });
    }
  }

  // Repli automatique si paiement gratuit ou passerelle non configurée
  const { subscription } = await activatePlan(userId, plan, data.source ?? "winipayer");
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
