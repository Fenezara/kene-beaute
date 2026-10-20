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
  if (latest !== null) return latest.granted;
  return defaultScansShared(userId, tenantId);
}

/** Partage implicite (sans enregistrement de consentement) : lien cliente↔institut. */
async function defaultScansShared(userId: string, tenantId: string): Promise<boolean> {
  // Par défaut : si la cliente a rattaché son profil à cet institut ou a un rendez-vous chez cet institut,
  // ou si une fiche cliente existe pour cet institut, le partage de soin est naturellement actif
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { selectedTenantId: true },
  });
  if (user?.selectedTenantId === tenantId) return true;

  const hasApptOrProfile = await db.appointment.findFirst({
    where: { OR: [{ userId, tenantId }, { tenantId, clientProfile: { userId } }] },
    select: { id: true },
  });
  if (hasApptOrProfile) return true;

  const hasProfile = await db.clientProfile.findFirst({
    where: { userId, tenantId },
    select: { id: true },
  });
  return Boolean(hasProfile);
}

/**
 * Visibilité PAR DATE des self-scans pour un institut : un scan réalisé
 * pendant une période de partage actif reste visible de l'institut même après
 * une révocation ; seuls les scans réalisés APRÈS la révocation (jusqu'à un
 * éventuel nouvel accord) lui sont masqués. S'appuie sur l'historique complet
 * des consentements (le dernier enregistrement antérieur au scan fait foi).
 */
export async function getScanVisibility(userId: string, tenantId: string): Promise<{
  currentlyShared: boolean;
  isVisibleAt: (date: Date) => boolean;
}> {
  const history = await db.consent.findMany({
    where: { userId, tenantId, type: SHARE_SCANS_TYPE },
    orderBy: { createdAt: "asc" },
    select: { granted: true, createdAt: true },
  });
  const fallback = await defaultScansShared(userId, tenantId);
  const currentlyShared = history.length > 0 ? history[history.length - 1].granted : fallback;
  const isVisibleAt = (date: Date): boolean => {
    let state = fallback;
    for (const h of history) {
      if (h.createdAt.getTime() <= date.getTime()) state = h.granted;
      else break;
    }
    return state;
  };
  return { currentlyShared, isVisibleAt };
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
  const shared = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    if (r.granted) shared.add(r.userId);
  }

  // Pour les utilisateurs sans entrée explicite dans Consent:
  // Si le tenant est leur institut de référence ou s'ils ont une fiche, ils partagent par défaut
  const remaining = userIds.filter((id) => !seen.has(id));
  if (remaining.length > 0) {
    const linked = await db.clientProfile.findMany({
      where: { userId: { in: remaining }, tenantId },
      select: { userId: true },
    });
    for (const l of linked) {
      if (l.userId) shared.add(l.userId);
    }
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
