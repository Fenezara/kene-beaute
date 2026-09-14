// src/lib/kene/share-consent.ts — Partage des self-scans Kènè vers un institut.
//
// Le compte de données: chaque self-scan (photo + scores + indicateurs) reste
// la propriété de la cliente. Un institut ne voit son historique de scans
// dans le CRM (fiche 360°, Jumeau de Peau, Fil du Temps), sur la fiche de
// consultation imprimée et dans les relances « Le Fil du Retour » QUE si elle
// a donné un consentement EXPLICITE pour CET institut — accordé depuis son
// app (case à la réservation ou carte « Partage » du profil), révocable à
// tout moment. Le miroir peau (type + phototype, questionnaire du compte)
// reste partagé au moment de la réservation: c'est le contexte minimal du
// soin, couvert par le consentement santé de l'inscription et les
// consentements signés en institut.
//
// Stockage: Consent(type="share_scans", tenantId=<institut>). Le DERNIER
// enregistrement gagne (l'historique des accords/révocations est conservé —
// exigence de traçabilité RGPD / loi ivoirienne n°2013-450).
import { db } from "@/lib/db";

export const SHARE_SCANS_TYPE = "share_scans";

/**
 * La cliente a-t-elle partagé ses self-scans avec CET institut ?
 * (dernier consentement share_scans de la paire cliente↔institut)
 */
export async function isScansShared(userId: string, tenantId: string): Promise<boolean> {
  const latest = await db.consent.findFirst({
    where: { userId, tenantId, type: SHARE_SCANS_TYPE },
    orderBy: { createdAt: "desc" },
    select: { granted: true },
  });
  return latest?.granted ?? false;
}

/**
 * Version lot: parmi ces clientes (ids de comptes app), lesquelles ont
 * partagé leurs self-scans avec CET institut ? Utilisé par les relances —
 * un scan non partagé ne doit même pas exister dans le calcul (sinon la
 * relance « contrôle post-protocole » révélerait le scan).
 */
export async function sharedScanUserIds(userIds: string[], tenantId: string): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.consent.findMany({
    where: { userId: { in: userIds }, tenantId, type: SHARE_SCANS_TYPE },
    orderBy: { createdAt: "desc" },
    select: { userId: true, granted: true },
  });
  // Le PREMIER enregistrement rencontré par cliente (le plus récent) gagne —
  // les suivants sont l'historique des accords/révocations.
  const shared = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    if (r.granted) shared.add(r.userId);
  }
  return shared;
}

/** Enregistre un accord ou une révocation (horodaté, IP conservée). */
export async function recordScanShare(opts: {
  userId: string;
  tenantId: string;
  granted: boolean;
  ip?: string | null;
}): Promise<void> {
  await db.consent.create({
    data: {
      userId: opts.userId,
      tenantId: opts.tenantId,
      type: SHARE_SCANS_TYPE,
      granted: opts.granted,
      ip: opts.ip ?? null,
    },
  });
}
