// src/lib/kene/client-link.ts — Synchronisation App cliente ↔ espace entreprise.
//
// Chaînon manquant réparé: quand une cliente de l'APP réserve un RDV chez un
// institut ou commande un produit d'une entreprise, sa fiche CRM
// (ClientProfile, scopée tenant) doit exister ET être LIÉE à son compte User
// (userId). C'est ce lien qui alimente:
// - le CRM de l'entreprise (fiche, RFM, visites);
// - la fiche 360° pro: ses self-scans app (diagnoses via client.userId);
// - l'historique client: les diagnostics réalisés EN institut
// (ProDiagnosis.userId posé par la route pro).
// Isolation garantie par construction: la fiche vit DANS le périmètre du
// tenant — aucune entreprise ne voit les clientes d'un autre institut.
import type { Prisma, User } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Le miroir peau (questionnaire app) reporté sur la fiche CRM. */
const skinMirror = (u: Pick<User, "skinType" | "fitzpatrick">) => ({
  skinType: u.skinType ?? undefined,
  fitzpatrick: u.fitzpatrick ?? undefined,
});

/**
 * Trouve ou crée la fiche CRM d'une cliente de l'app pour CE tenant, et pose
 * le lien userId. Ordre de résolution:
 * 1. fiche déjà liée à ce compte (tenantId + userId) → miroir peau rafraîchi;
 * 2. fiche existante au même numéro (créée en caisse « cliente express ») →
 * le compte est LIÉ (userId) + miroir peau;
 * 3. création: fiche liée d'office, note « app Kènè ».
 * Idempotent: appelé à chaque réservation/commande, ne crée jamais de doublon
 * (comparaison sur les 10 derniers chiffres du numéro — cf. pro/clients POST).
 */
export async function ensureClientProfile(
  tx: Tx,
  tenantId: string,
  user: Pick<User, "id" | "name" | "phone" | "skinType" | "fitzpatrick">,
): Promise<{ id: string } | null> {
  // 1) Déjà liée à ce compte pour ce tenant?
  const byUser = await tx.clientProfile.findFirst({
    where: { tenantId, userId: user.id },
    select: { id: true },
  });
  if (byUser) {
    await tx.clientProfile.update({
      where: { id: byUser.id },
      data: skinMirror(user),
    });
    return byUser;
  }

  // 2) Fiche « caisse » au même numéro → on LIÉ le compte (le miroir peau
  // suit, la fiche garde son historique ventes/RDV).
  const tail = user.phone.replace(/\D/g, "").slice(-10);
  if (tail.length >= 8) {
    const roster = await tx.clientProfile.findMany({
      where: { tenantId },
      select: { id: true, phone: true },
    });
    const same = roster.find((c) => c.phone.replace(/\D/g, "").endsWith(tail));
    if (same) {
      const linked = await tx.clientProfile.update({
        where: { id: same.id },
        data: { userId: user.id, ...skinMirror(user) },
        select: { id: true },
      });
      return linked;
    }
  }

  // 3) Premier contact: fiche liée, prête pour le CRM et la fiche 360°.
  const created = await tx.clientProfile.create({
    data: {
      tenantId,
      userId: user.id,
      name: user.name,
      phone: user.phone,
      skinType: user.skinType,
      fitzpatrick: user.fitzpatrick,
      rfmSegment: "Nouveau",
      notes: "Cliente app Kènè — fiche créée automatiquement à son premier contact (réservation ou commande).",
    },
    select: { id: true },
  });
  return created;
}
