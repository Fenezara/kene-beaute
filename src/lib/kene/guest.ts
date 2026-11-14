// Kènè — Gestion unifiée des comptes invités temporaires (+22500…), comptes RGPD supprimés
// et fusion/promotion propre vers les vrais comptes inscrits.

import type { NextRequest } from "next/server";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/kene/audit";
import { sessionFromRequest } from "@/lib/kene/session";
import { grantClientWelcomeTrial } from "@/lib/kene/plans";

export const VIRTUAL_GUEST_PHONE_PREFIX = "+22500";
export const DELETED_USER_PHONE_PREFIX = "deleted:";
export const ARCHIVED_PROFILE_PHONE_PREFIX = "archived:";

const gPurge = globalThis as typeof globalThis & { __keneLastGuestPurgeAt?: number };
const PURGE_THROTTLE_MS = 6 * 3_600_000;

export function isDeletedUser(u?: { phone?: string | null; name?: string | null } | null): boolean {
  if (!u) return false;
  return (
    u.name === "Compte supprimé" ||
    Boolean(u.phone?.startsWith(DELETED_USER_PHONE_PREFIX)) ||
    Boolean(u.phone?.startsWith(ARCHIVED_PROFILE_PHONE_PREFIX))
  );
}

export function isVirtualGuestUser(u?: { id?: string | null; phone?: string | null; name?: string | null } | null): boolean {
  if (!u || isDeletedUser(u)) return false;
  if (u.id === "guest" || u.id?.startsWith("guest_")) return true;
  if (u.name === "Nouvelle invitée" || u.name === "guest") return true;
  if (u.phone?.startsWith(VIRTUAL_GUEST_PHONE_PREFIX)) return true;
  return false;
}

export function generateDeletedPhone(userId: string): string {
  return `${DELETED_USER_PHONE_PREFIX}${userId.slice(-6)}:${Date.now().toString(36)}`;
}

export function generateArchivedProfilePhone(profileId: string): string {
  return `${ARCHIVED_PROFILE_PHONE_PREFIX}${profileId.slice(-6)}:${Date.now().toString(36)}`;
}

/** Clause Prisma excluant comptes démo, invités virtuels (+22500…) et comptes purgés RGPD. */
export function realRegisteredUsersWhere(demoPhones: string[]) {
  return {
    AND: [
      { phone: { notIn: demoPhones } },
      { NOT: { phone: { startsWith: VIRTUAL_GUEST_PHONE_PREFIX } } },
      { NOT: { phone: { startsWith: DELETED_USER_PHONE_PREFIX } } },
      { NOT: { phone: { startsWith: ARCHIVED_PROFILE_PHONE_PREFIX } } },
      { name: { notIn: ["Nouvelle invitée", "guest", "Compte supprimé"] } },
    ],
  };
}

/** Retourne l'utilisateur invité temporaire lié au cookie HTTP s'il s'agit bien d'un guest client virtuel. */
export async function findCookieVirtualGuest(req: NextRequest): Promise<User | null> {
  const sess = sessionFromRequest(req);
  if (!sess?.userId) return null;
  const candidate = await db.user.findUnique({ where: { id: sess.userId } });
  if (!candidate) return null;
  if (candidate.role !== "client" || candidate.pinHash) return null;
  if (!isVirtualGuestUser(candidate)) return null;
  return candidate;
}

/** Promeut sur place une session invitée temporaire (+22500…) en vrai compte client permanent (zéro orphelin). */
export async function promoteGuestUserInPlace(
  guestUserId: string,
  data: {
    phone: string;
    name: string;
    role?: string;
    pinHash?: string | null;
    selectedTenantId?: string | null;
    consentHealth?: boolean;
    consentTs?: Date | null;
  }
): Promise<User> {
  const updated = await db.user.update({
    where: { id: guestUserId },
    data: {
      phone: data.phone,
      name: data.name,
      role: data.role ?? "client",
      pinHash: data.pinHash ?? undefined,
      pinFails: 0,
      pinLockedUntil: null,
      selectedTenantId: data.selectedTenantId ?? undefined,
      consentHealth: data.consentHealth ?? undefined,
      consentTs: data.consentTs ?? undefined,
    },
  });

  if (updated.role === "client") {
    await grantClientWelcomeTrial(updated.id).catch(() => null);
  }
  void audit({
    kind: "account_linked",
    phone: updated.phone,
    userId: updated.id,
    detail: "guest_auto_promoted_on_signup",
  });
  return updated;
}

/**
 * Transfère les éventuels diagnostics/commandes/consentements d'un invité temporaire (+22500…)
 * vers le vrai compte authentifié, puis supprime définitivement l'enregistrement virtuel.
 */
export async function transferAndDeleteGuestUser(guestUserId: string, targetUserId: string): Promise<void> {
  if (!guestUserId || !targetUserId || guestUserId === targetUserId) return;
  try {
    const guest = await db.user.findUnique({
      where: { id: guestUserId },
      select: { id: true, phone: true, name: true, role: true, pinHash: true },
    });
    if (!guest || guest.role !== "client" || guest.pinHash || !isVirtualGuestUser(guest)) return;

    await Promise.all([
      db.diagnosis.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } }),
      db.order.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } }),
      db.appointment.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } }),
      db.consent.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } }),
    ]);

    const targetPassport = await db.skinPassport.findUnique({ where: { userId: targetUserId }, select: { id: true } });
    if (!targetPassport) {
      await db.skinPassport.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    } else {
      await db.skinPassport.deleteMany({ where: { userId: guestUserId } });
    }

    await db.notification.deleteMany({ where: { userId: guestUserId } });
    await db.couponRedemption.deleteMany({ where: { userId: guestUserId } });
    await db.wallet.deleteMany({ where: { userId: guestUserId, balance: 0 } });
    await db.clientProfile.updateMany({ where: { userId: guestUserId }, data: { userId: null } });

    await db.user.delete({ where: { id: guestUserId } });

    void audit({
      kind: "account_linked",
      userId: targetUserId,
      detail: `guest_absorbed_and_deleted:${guest.phone}`,
    });
  } catch {
    // Non-bloquant : ne jamais casser un login réussi si une relation secondaire bloque
  }
}

/**
 * Purge automatique (TTL par défaut 7 jours) des comptes invités virtuels (+22500… / Nouvelle invitée)
 * restés vides (0 diagnostic, 0 commande, 0 RDV, 0 abonnement, sans PIN).
 */
export async function purgeStaleVirtualGuests(opts: { maxAgeDays?: number; force?: boolean } = {}): Promise<number> {
  const now = Date.now();
  if (!opts.force && gPurge.__keneLastGuestPurgeAt && now - gPurge.__keneLastGuestPurgeAt < PURGE_THROTTLE_MS) {
    return 0;
  }
  gPurge.__keneLastGuestPurgeAt = now;

  try {
    const maxAgeDays = opts.maxAgeDays ?? 7;
    const cutoff = new Date(now - maxAgeDays * 86_400_000);
    const stale = await db.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { phone: { startsWith: VIRTUAL_GUEST_PHONE_PREFIX } },
              { name: "Nouvelle invitée" },
              { name: "guest" },
            ],
          },
          { role: "client" },
          { pinHash: null },
          { name: { not: "Compte supprimé" } },
          { createdAt: { lt: cutoff } },
          { diagnoses: { none: {} } },
          { orders: { none: {} } },
          { appointments: { none: {} } },
          { subscriptions: { none: {} } },
          { reviews: { none: {} } },
        ],
      },
      select: { id: true },
      take: 250,
    });

    if (stale.length === 0) return 0;
    const ids = stale.map((s) => s.id);

    await Promise.all([
      db.notification.deleteMany({ where: { userId: { in: ids } } }),
      db.consent.deleteMany({ where: { userId: { in: ids } } }),
      db.skinPassport.deleteMany({ where: { userId: { in: ids } } }),
      db.passkeyCredential.deleteMany({ where: { userId: { in: ids } } }),
      db.couponRedemption.deleteMany({ where: { userId: { in: ids } } }),
      db.wallet.deleteMany({ where: { userId: { in: ids }, balance: 0 } }),
      db.clientProfile.updateMany({ where: { userId: { in: ids } }, data: { userId: null } }),
    ]);

    const res = await db.user.deleteMany({
      where: { id: { in: ids }, wallet: { is: null } },
    });
    return res.count;
  } catch {
    return 0;
  }
}
