// Kènè — code de confirmation des paiements MoMo (t. 63-c).
// Contrat figé avec le front (63-b) : toute route qui crée un Payment
// `pending` (orders POST wave/orange, appointments POST acompte wave/orange,
// wallet/topup) génère un token, stocke son sha256 dans
// `payment.confirmTokenHash` et renvoie le token BRUT dans la réponse
// (`payment.confirmToken`). Le paiement wallet (instantané, succès direct)
// n'a PAS de token. La confirmation (POST /api/payments/confirm) exige
// { paymentId, confirmToken } — un paymentId seul ne suffit plus.
import crypto from "node:crypto";
import type { Payment } from "@prisma/client";

/** Génère un code de confirmation : token BRUT (à renvoyer au client, jamais
 * stocké) + hash sha256 hex (à persister dans payment.confirmTokenHash). */
export function newConfirmToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(24).toString("hex");
  return { token, tokenHash: sha256Hex(token) };
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** Comparaison du token fourni avec le hash stocké — timing-safe (les deux
 * côtés sont des digests sha256 de 32 octets ; longueurs inégales → false
 * sans révéler où ni quand ça diffère). */
export function confirmTokenMatches(rawToken: string, storedHash: string): boolean {
  const digest = Buffer.from(sha256Hex(rawToken), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (digest.length === 0 || stored.length !== digest.length) return false;
  return crypto.timingSafeEqual(digest, stored);
}

/** Sérialisation publique d'un Payment : le hash stocké ne sort JAMAIS de la
 * base — le token brut n'apparaît que dans la réponse de création. */
export function serializePayment(payment: Payment): Omit<Payment, "confirmTokenHash"> {
  const { confirmTokenHash: _hidden, ...rest } = payment;
  return rest;
}

/** Paiement fraîchement créé (pending) : hash retiré, token brut ajouté —
 * le front (63-b) relira `payment.confirmToken` pour confirmer. */
export function paymentWithConfirmToken(payment: Payment, token: string): Omit<Payment, "confirmTokenHash"> & { confirmToken: string } {
  return { ...serializePayment(payment), confirmToken: token };
}
