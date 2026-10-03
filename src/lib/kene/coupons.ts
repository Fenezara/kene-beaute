// Kènè — moteur de validation des coupons boutique (serveur).
// Source unique de vérité partagée par:
// • POST /api/coupons/validate (aperçu remise au checkout, SANS consommer)
// • POST /api/orders (application réelle + consommation à la commande)
// Règles d'usage du coupon (dans l'ordre, messages client prêts à l'emploi):
// 1. actif (pro peut désactiver à tout moment)
// 2. fenêtre de validité (startsAt / expiresAt)
// 3. quota global (usedCount < maxUses, si maxUses > 0)
// 4. UNE seule utilisation par cliente (CouponRedemption @@unique)
// 5. panier minimum (minOrder)
// Calcul de la remise (toujours bornée par le sous-total):
// • percent: round(subtotal × value / 100), value 5..90 %
// • fixed: min(value, subtotal), value 500..500 000 FCFA
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { xof } from "./format";
import { pushFeed } from "./realtime";

export const COUPON_CODE_RE = /^[A-Z0-9-]{4,24}$/;

export interface CouponCheck {
  ok: boolean;
  error?: string; // message FR prêt pour la cliente
  coupon?: {
    id: string;
    code: string;
    kind: "percent" | "fixed";
    value: number;
    label: string | null;
    expiresAt: string | null;
  };
  subtotal?: number;
  discount?: number;
  total?: number;
}

/** Normalise un code saisi: trim + uppercase (la casse ne doit jamais bloquer). */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function describe(c: { id: string; code: string; kind: string; value: number; label: string | null; expiresAt: Date | null }): CouponCheck["coupon"] {
  return { id: c.id, code: c.code, kind: c.kind as "percent" | "fixed", value: c.value, label: c.label, expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null };
}

/** Remise théorique — bornée au sous-total, jamais négative. */
export function couponDiscount(kind: string, value: number, subtotal: number): number {
  if (subtotal <= 0) return 0;
  const d = kind === "percent" ? Math.round((subtotal * value) / 100) : Math.min(value, subtotal);
  return Math.max(0, Math.min(d, subtotal));
}

/**
 * Vérifie un code pour un panier donné — ne consomme RIEN (lecture pure).
 * `userId` facultatif: sans id, la garde « déjà utilisée par toi » est sautée
 * (elle est recheckée à la commande, seule source qui compte).
 */
export async function checkCoupon(rawCode: string, subtotal: number, userId?: string | null): Promise<CouponCheck> {
  const code = normalizeCouponCode(rawCode);
  if (!COUPON_CODE_RE.test(code)) return { ok: false, error: "Code invalide — vérifie sa saisie" };

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) return { ok: false, error: "Code promo inconnu" };
  if (!coupon.active) return { ok: false, error: "Ce code promo n'est plus actif" };

  const now = new Date();
  if (coupon.startsAt > now) return { ok: false, error: "Ce code n'est pas encore actif" };
  if (coupon.expiresAt && coupon.expiresAt < now) {
    return { ok: false, error: "Ce code promo a expiré" };
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: "Ce code promo a atteint sa limite d'utilisations" };
  }
  if (userId) {
    const already = await db.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: coupon.id, userId } },
      select: { id: true },
    });
    if (already) return { ok: false, error: "Tu as déjà utilisé ce code promo 😉" };
  }
  if (subtotal < coupon.minOrder) {
    return { ok: false, error: `Ce code s'applique à partir de ${xof(coupon.minOrder)} d'achat` };
  }

  const discount = couponDiscount(coupon.kind, coupon.value, subtotal);
  if (discount <= 0) return { ok: false, error: "Remise nulle sur ce panier" };
  return { ok: true, coupon: describe(coupon), subtotal, discount, total: subtotal - discount };
}

/**
 * Consomme le coupon POUR DE VRAI (à la commande uniquement):
 * validation complète (course-safe) + création de la rédemption +
 * incrément du compteur. En cas de course (2 commandes simultanées), la
 * contrainte @@unique [couponId, userId] fait échouer la 2ᵉ → erreur propre.
 * `tx` facultatif: consommé dans la transaction de la commande.
 */
export async function redeemCoupon(
  couponId: string,
  userId: string,
  subtotal: number,
  orderId: string,
  tx?: Prisma.TransactionClient
): Promise<{ ok: true; discount: number } | { ok: false; error: string }> {
  const client = tx ?? db;
  const coupon = await client.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) return { ok: false, error: "Code promo inconnu" };
  if (!coupon.active) return { ok: false, error: "Ce code promo n'est plus actif" };
  const now = new Date();
  if (coupon.startsAt > now) return { ok: false, error: "Ce code n'est pas encore actif" };
  if (coupon.expiresAt && coupon.expiresAt < now) return { ok: false, error: "Ce code promo a expiré" };
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: "Ce code promo a atteint sa limite d'utilisations" };
  }
  if (subtotal < coupon.minOrder) {
    return { ok: false, error: `Ce code s'applique à partir de ${xof(coupon.minOrder)} d'achat` };
  }
  const discount = couponDiscount(coupon.kind, coupon.value, subtotal);
  if (discount <= 0) return { ok: false, error: "Remise nulle sur ce panier" };

  try {
    await client.couponRedemption.create({ data: { couponId, userId, orderId, discount } });
  } catch {
    // contrainte unique → déjà utilisée par cette cliente
    return { ok: false, error: "Tu as déjà utilisé ce code promo 😉" };
  }
  await client.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
  return { ok: true, discount };
}

/* ── Diffusion: prévient toutes les clientes (notification + push live) ── */

export function couponPitch(c: { code: string; kind: string; value: number; minOrder: number; expiresAt: Date | null }): string {
  const off = c.kind === "percent" ? `-${c.value} %` : `-${xof(c.value)}`;
  const min = c.minOrder > 0 ? ` dès ${xof(c.minOrder)} d'achat` : "";
  const until = c.expiresAt ? ` jusqu'au ${c.expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : "";
  return `Kènè 🎁 Code promo ${c.code} : ${off} sur la boutique${min}${until}. Applique-le au moment de payer !`;
}

/**
 * Diffuse un coupon auprès des clientes (role client): notifications
 * createMany + push temps réel par utilisatrice (le canal de la).
 * Fire-and-forget friendly: renvoie le nombre de clientes notifiées.
 */
export async function diffuseCoupon(
  coupon: { id: string; code: string; kind: string; value: number; minOrder: number; expiresAt: Date | null; tenantId: string | null },
  tenantName: string
): Promise<number> {
  const clients = await db.user.findMany({
    where: { role: "client" },
    select: { id: true, phone: true },
  });
  if (clients.length === 0) return 0;

  const pitch = couponPitch(coupon);
  const message = coupon.tenantId ? `${pitch} Offre de ${tenantName}.` : pitch;

  await db.notification.createMany({
    data: clients.map((c) => ({
      userId: c.id,
      tenantId: coupon.tenantId,
      channel: "whatsapp",
      toPhone: c.phone,
      message,
      status: "sent",
      metaJson: JSON.stringify({ couponId: coupon.id }),
    })),
  });

  // Push temps réel (best-effort): la cloche des clientes en ligne s'illumine
  for (const c of clients) {
    pushFeed(c.id);
  }
  // notify factice pour la forme? Non: createMany + pushFeed ci-dessus
  // couvrent tout — mais l'audit reste utile côté pro:
  await db.auditLog.create({
    data: {
      userId: null,
      action: "coupon_diffuse",
      entity: "coupon",
      entityId: coupon.id,
      detailsJson: JSON.stringify({ code: coupon.code, clients: clients.length }),
    },
  });
  return clients.length;
}
