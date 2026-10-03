// POST /api/subscriptions/renew — génère la session de paiement (SasPay / WiniPayer)
// ou renouvelle directement l'abonnement.
// GET /api/subscriptions/renew?_g=… — pont GET pour les environnements mobiles.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { genRef, jsonError, serverError } from "@/lib/kene/server";
import { renewPlan, diagQuotaFor, planDefById, getActiveSubscription } from "@/lib/kene/plans";
import { rateLimit, rlKey, rateLimitResponse } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { createSaspayCheckoutSession } from "@/lib/payments/saspay";
import { createWiniPayerPaymentSession } from "@/lib/payments/winipayer";

export const runtime = "nodejs";

const Body = z.object({
  userId: z.string().min(1),
  plan: z.string().optional(),
  source: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "subscriptions:renew"), { limit: 25, windowMs: 60_000 });
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives — patiente quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide (userId)", 400);
    return await runRenew(parsed.data);
  } catch (err) {
    return serverError("subscriptions/renew", err);
  }
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "subscriptions:renew"), { limit: 25, windowMs: 60_000 });
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives — patiente quelques secondes");
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Requête invalide — ${bridged.error}`, 400);
    return await runRenew(bridged.data);
  } catch (err) {
    return serverError("subscriptions/renew", err);
  }
}

async function runRenew(data: z.infer<typeof Body>): Promise<NextResponse> {
  const { userId, plan, source } = data;

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return jsonError("Compte introuvable — reconnecte-toi", 404);

  const existing = await getActiveSubscription(userId);
  let targetPlan = plan || existing?.plan;
  if (!targetPlan) {
    const lastSub = await db.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    targetPlan = lastSub?.plan || (user.role === "pro" ? "pro_essentiel" : "kene_plus");
  }

  const def = planDefById(targetPlan);
  if (!def) return jsonError("Plan inconnu", 400);

  const hasSaspay = Boolean(process.env.SASPAY_API_KEY?.trim());
  const hasWiniPayer = Boolean(process.env.WINIPAYER_MERCHANT_UUID && process.env.WINIPAYER_MERCHANT_TOKEN);

  // Si SasPay ou WiniPayer est actif, on initie la passerelle de paiement en ligne réelle
  if (hasSaspay || hasWiniPayer) {
    const payment = await db.payment.create({
      data: {
        userId: user.id,
        amount: def.priceFcfa,
        purpose: "subscription_renew",
        status: "pending",
        method: source || "saspay",
        ref: genRef("PAY"),
        metaJson: JSON.stringify({
          userId: user.id,
          planId: def.id,
          source: source || "saspay",
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

  // Repli automatique si aucune passerelle de paiement en ligne n'est configurée (simulation/dev)
  try {
    const { subscription } = await renewPlan(userId, source ?? "winipayer", plan);
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
    if (err instanceof Error) return jsonError(err.message, 400);
    throw err;
  }
}
