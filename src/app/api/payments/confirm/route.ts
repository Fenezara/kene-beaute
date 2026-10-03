// POST /api/payments/confirm — confirme un paiement MoMo (code de confirmation)
// et déclenche les effets métier.:
// • le paiement n'est confirmé QU'AVEC son code (confirmToken) — un simple
// paymentId ne suffit plus (fin du « mint anonyme » de wallet/cashback);
// • le passage pending → success est un updateMany CONDITIONNEL (anti-TOCTOU:
// deux confirmations concurrentes ne passent qu'une seule fois);
// • TOUS les effets consécutifs (crédit wallet topup, commande/acompte payé,
// cashback, décrément stock + InventoryMovement, notifications) partagent
// UNE seule prisma.$transaction — plus de panne partielle (commande payée
// sans stock décrémenté).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { xof } from "@/lib/kene/format";
import { confirmTokenMatches, serializePayment } from "@/lib/kene/confirm-token";
import { guardUserClaim } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, PAYMENTS_CONFIRM } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";
import { executePaymentSuccess } from "@/lib/kene/payment-core";

const Body = z.object({
  paymentId: z.string().min(1),
  // absent/vide → message dédié (contrat 63-b: le front passe r.payment.confirmToken)
  confirmToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "payments:confirm"), PAYMENTS_CONFIRM);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes de paiement — patiente quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { paymentId } = parsed.data;
    const confirmToken = parsed.data.confirmToken?.trim();
    if (!confirmToken) return jsonError("Code de confirmation requis", 400);

    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return jsonError("Paiement introuvable", 404);

    // Session signée: avec cookie, seul le compte propriétaire du
    // paiement (payment.userId) peut le confirmer; sans cookie → legacy
    // (le code de confirmation reste la barrière anti-mint de).
    const guard = guardUserClaim(req, "payments:confirm", payment.userId ?? undefined);
    if (guard) return guard;

    if (!payment.confirmTokenHash) {
      return jsonError("Paiement sans code de confirmation — recommence l'opération", 400);
    }
    if (!confirmTokenMatches(confirmToken, payment.confirmTokenHash)) {
      return jsonError("Code de confirmation invalide", 400);
    }

    // Anti-TOCTOU + atomicité: le flip pending → success et TOUS les effets
    // métier sont délégués au cœur transactionnel idempotent executePaymentSuccess.
    const outcome = await executePaymentSuccess(paymentId);
    if (!outcome.success) {
      if (outcome.reason === "already_confirmed") return jsonError("Paiement déjà confirmé", 400);
      return jsonError("Paiement introuvable", 404);
    }

    //: journal d'audit — userId + montant dans le détail (court).
    void audit({
      kind: "payment_confirm",
      userId: outcome.payment.userId ?? undefined,
      ip: clientIp(req),
      detail: `${outcome.payment.purpose} · ${xof(outcome.payment.amount)}`,
    });

    return NextResponse.json({
      payment: serializePayment(outcome.payment),
      order: outcome.order ?? undefined,
      wallet: outcome.wallet ?? undefined,
    });
  } catch (err) {
    return serverError("payments/confirm", err);
  }
}
