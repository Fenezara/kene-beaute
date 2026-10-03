// src/lib/kene/account-deletion.ts — Purge et anonymisation de compte conforme 2026
// Conforme RGPD (Art. 17 - Droit à l'oubli), ARTCI (Loi ivoirienne n° 2013-450)
// et respect des obligations comptables et fiscales SYSCOHADA (conservation 10 ans).
import { db } from "@/lib/db";
import { audit } from "@/lib/kene/audit";

export interface PurgeResult {
  ok: boolean;
  message?: string;
}

export async function anonymizeAndPurgeUser(
  userId: string,
  options: {
    reason?: string;
    triggeredBy: "self" | "admin";
    adminId?: string;
    ip?: string;
  }
): Promise<PurgeResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return { ok: false, message: "Compte introuvable" };
  }

  // Protection vitale : Ne jamais permettre la suppression du dernier compte admin
  if (user.role === "admin") {
    const adminCount = await db.user.count({ where: { role: "admin", lockedAt: null } });
    if (adminCount <= 1) {
      return {
        ok: false,
        message: "Action impossible : le dernier administrateur de la plateforme ne peut pas être supprimé.",
      };
    }
  }

  // 1. Purge PHYSIQUE des données intimes de santé et vie privée (Droit à l'oubli)
  // Supprime tous les diagnostics IA (contenant les photos base64 visage/corps et analyses VLM)
  await db.diagnosis.deleteMany({
    where: { userId },
  });

  // Supprime le Passeport de Peau public (QR code)
  await db.skinPassport.deleteMany({
    where: { userId },
  });

  // Supprime les passkeys biométriques (WebAuthn)
  await db.passkeyCredential.deleteMany({
    where: { userId },
  });

  // Supprime les notifications personnelles
  await db.notification.deleteMany({
    where: { userId },
  });

  // Supprime les consentements RGPD / santé
  await db.consent.deleteMany({
    where: { userId },
  });

  // 2. Anonymisation des commandes de boutique (conformité fiscale SYSCOHADA)
  // On efface les adresses de livraison et numéros de téléphone du coursier
  // tout en conservant les montants, les articles et le statut de paiement pour le grand livre comptable.
  await db.order.updateMany({
    where: { userId },
    data: {
      deliveryAddress: null,
      deliveryPhone: null,
      deliveryNotes: null,
      deliveryArea: null,
    },
  });

  // 3. Détachement des profils salons CRM
  // La cliente est détachée des CRM d'instituts tout en conservant les ventes de caisse du salon
  await db.clientProfile.updateMany({
    where: { userId },
    data: {
      userId: null,
    },
  });

  // 4. Anonymisation de l'utilisateur
  // Le numéro de téléphone est randomisé pour libérer le vrai numéro
  // (permet à l'utilisatrice de se réinscrire proprement plus tard si elle le souhaite)
  const anonymizedPhone = `+22500${Date.now().toString().slice(-8)}`;
  await db.user.update({
    where: { id: userId },
    data: {
      name: "Compte supprimé",
      phone: anonymizedPhone,
      avatarData: null,
      pinHash: null,
      pinFails: 0,
      pinLockedUntil: null,
      allergies: null,
      goals: null,
      skinType: null,
      fitzpatrick: null,
      consentHealth: false,
      consentTs: null,
      lockedAt: new Date(),
      lockedReason:
        options.reason ||
        (options.triggeredBy === "self" ? "Supprimé par l'utilisatrice" : "Supprimé par l'administration"),
    },
  });

  // 5. Journal d'audit de sécurité
  void audit({
    kind: "user_deleted",
    userId,
    ip: options.ip,
    detail: `Suppression & anonymisation (${options.triggeredBy}): ${
      options.reason || "Droit à l'effacement"
    }`,
  });

  return { ok: true };
}
