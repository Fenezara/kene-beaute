// Kènè — Sécurisation & Idempotence des Webhooks Fintech
// Enregistre chaque identifiant de transaction externe (Wave, Orange, WiniPayer, Africa's Talking)
// pour garantir qu'un renvoi automatique (retry réseau) ne déclenche JAMAIS une double exécution.

import { db } from "@/lib/db";

export interface ClaimWebhookResult {
  isDuplicate: boolean;
}

/**
 * Tente de réserver le traitement d'un événement webhook de façon atomique.
 * Renvoie { isDuplicate: true } si l'événement a déjà été traité par Kènè.
 */
export async function claimWebhookEvent(
  provider: "wave" | "orange" | "winipayer" | "africastalking" | "saspay",
  eventId: string
): Promise<ClaimWebhookResult> {
  if (!eventId) return { isDuplicate: false };

  try {
    await db.webhookEvent.create({
      data: {
        provider,
        eventId,
      },
    });
    return { isDuplicate: false };
  } catch (err: any) {
    // Code Prisma P2002 = violation de contrainte d'unicité (@@unique([provider, eventId]))
    if (err?.code === "P2002" || /unique constraint|UNIQUE constraint/i.test(err?.message || "")) {
      console.info(`[Webhook Idempotency] Doublon détecté et bloqué : provider=${provider}, eventId=${eventId}`);
      return { isDuplicate: true };
    }
    // En cas d'indisponibilité transitoire, on ne bloque pas le flux principal
    return { isDuplicate: false };
  }
}
