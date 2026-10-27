// src/lib/kene/client-link.ts — Synchronisation App cliente ↔ espace entreprise.
//
// Chaînon d'or Kènè: assure l'identité unique et la parité absolue des données
// (noms, numéros de téléphone normalisés, diagnostics, historique RDV et routine)
// entre l'application mobile de la cliente et la console Kènè Pro de l'institut.
import type { Prisma, User } from "@prisma/client";
import { canonicalPhone, phoneMatchKey, arePhonesMatching } from "@/lib/kene/phone-normalize";

type Tx = Prisma.TransactionClient;

/** Le miroir cliente (profil app) reporté sur la fiche CRM de l'institut. */
const skinMirror = (u: Partial<Pick<User, "skinType" | "fitzpatrick" | "district" | "birthDate" | "pregnant" | "preferredChannel" | "beautyBudget">>) => ({
  skinType: u.skinType ?? undefined,
  fitzpatrick: u.fitzpatrick ?? undefined,
  district: u.district ?? undefined,
  birthDate: u.birthDate ?? undefined,
  pregnant: u.pregnant ?? undefined,
  preferredChannel: u.preferredChannel ?? undefined,
  beautyBudget: u.beautyBudget ?? undefined,
});

const isGenericName = (name?: string | null): boolean => {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return (
    n === "" ||
    n === "nouvelle cliente" ||
    n === "nouvelle invitée" ||
    n.startsWith("membre ") ||
    n.includes("??") ||
    n === "guest" ||
    n === "ma peau" ||
    n === "collaboratrice" ||
    n === "estheticienne"
  );
};

/**
 * Trouve ou crée la fiche CRM d'une cliente de l'app pour CE tenant, et synchronise
 * son nom réel, son numéro canonique et son miroir peau.
 * Idempotent, élimine les doublons automatiquement.
 */
export async function ensureClientProfile(
  tx: Tx,
  tenantId: string,
  user: Pick<User, "id" | "name" | "phone"> & Partial<Pick<User, "skinType" | "fitzpatrick" | "district" | "birthDate" | "pregnant" | "preferredChannel" | "beautyBudget">>,
): Promise<{ id: string } | null> {
  const normPhone = canonicalPhone(user.phone);
  const matchKey = phoneMatchKey(user.phone);

  // 1) Recherche de toutes les fiches existantes pour ce tenant (par userId OU par numéro)
  const roster = await tx.clientProfile.findMany({
    where: { tenantId },
    select: { id: true, userId: true, name: true, phone: true },
  });

  const matchingProfiles = roster.filter(
    (p) => (user.id && p.userId === user.id) || arePhonesMatching(p.phone, user.phone)
  );

  if (matchingProfiles.length > 0) {
    const primary = matchingProfiles[0];

    // Résolution du meilleur nom : priorité au nom réel s'il n'est pas générique
    let resolvedName = user.name;
    if (isGenericName(resolvedName) && !isGenericName(primary.name)) {
      resolvedName = primary.name;
    }

    // Mise à jour de la fiche principale
    const updated = await tx.clientProfile.update({
      where: { id: primary.id },
      data: {
        userId: user.id && !user.id.startsWith("guest") && !user.id.startsWith("auto") ? user.id : primary.userId,
        name: resolvedName,
        phone: normPhone || primary.phone,
        ...skinMirror(user),
      },
      select: { id: true },
    });

    // Fusion des doublons s'il en existe plusieurs pour ce même tenant
    if (matchingProfiles.length > 1) {
      for (let i = 1; i < matchingProfiles.length; i++) {
        const dup = matchingProfiles[i];
        if (dup.id !== primary.id) {
          // Réassigner les RDV, ventes et diagnostics vers la fiche principale
          await tx.appointment.updateMany({
            where: { clientProfileId: dup.id },
            data: { clientProfileId: primary.id },
          }).catch(() => null);

          await tx.sale.updateMany({
            where: { clientProfileId: dup.id },
            data: { clientProfileId: primary.id },
          }).catch(() => null);

          await tx.proDiagnosis.updateMany({
            where: { clientProfileId: dup.id },
            data: { clientProfileId: primary.id },
          }).catch(() => null);

          await tx.clientProfile.delete({
            where: { id: dup.id },
          }).catch(() => null);
        }
      }
    }

    return updated;
  }

  // 2) Premier contact: création de la fiche liée d'office, prête pour CRM et fiche 360°
  const created = await tx.clientProfile.create({
    data: {
      tenantId,
      userId: user.id && !user.id.startsWith("guest") && !user.id.startsWith("auto") ? user.id : null,
      name: user.name,
      phone: normPhone || user.phone,
      skinType: user.skinType,
      fitzpatrick: user.fitzpatrick,
      district: user.district,
      birthDate: user.birthDate,
      pregnant: user.pregnant ?? false,
      preferredChannel: user.preferredChannel ?? "whatsapp",
      beautyBudget: user.beautyBudget,
      rfmSegment: "Nouveau",
      notes: "Cliente app Kènè — fiche synchronisée automatiquement.",
    },
    select: { id: true },
  });

  return created;
}
