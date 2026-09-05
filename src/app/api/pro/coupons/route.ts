// GET /api/pro/coupons?tenantId= | POST création | PATCH activation/désactivation
// Coupons boutique : la pro crée (code auto PROMO-XXXX ou personnalisé), suit
// les utilisations, coupe à tout moment — et diffuse via /diffuse (tâche 33).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { COUPON_CODE_RE, normalizeCouponCode } from "@/lib/kene/coupons";
import { guardProRole } from "@/lib/kene/session";

export const runtime = "nodejs";

/* Statut dérivé (affichage pro) : actif | programmé | expiré | épuisé | inactif */
function statusOf(c: { active: boolean; startsAt: Date; expiresAt: Date | null; maxUses: number; usedCount: number }): string {
  const now = new Date();
  if (!c.active) return "inactif";
  if (c.startsAt > now) return "programmé";
  if (c.expiresAt && c.expiresAt < now) return "expiré";
  if (c.maxUses > 0 && c.usedCount >= c.maxUses) return "épuisé";
  return "actif";
}

export async function GET(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:coupons:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const coupons = await db.coupon.findMany({
      where: { OR: [{ tenantId: tenant.id }, { tenantId: null }] },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    });

    return NextResponse.json({
      coupons: coupons.map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        code: c.code,
        label: c.label,
        kind: c.kind,
        value: c.value,
        minOrder: c.minOrder,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        startsAt: c.startsAt.toISOString(),
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
        active: c.active,
        status: statusOf(c),
        redemptions: c._count.redemptions,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return serverError("pro/coupons:get", err);
  }
}

const CreateBody = z.object({
  tenantId: z.string().min(1),
  code: z.string().trim().max(24).optional(), // vide → PROMO-XXXX auto
  label: z.string().trim().max(80).optional(),
  kind: z.enum(["percent", "fixed"]),
  value: z.number().int().min(1),
  minOrder: z.number().int().min(0).max(1_000_000).optional(),
  maxUses: z.number().int().min(0).max(10_000).optional(), // 0 = illimité
  expiresAt: z.string().datetime().optional(), // ISO
});

function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I/O/0/1 : lisibilité
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `PROMO-${s}`;
}

export async function POST(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : avec cookie, la création de
    // coupon exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:coupons:post");
    if (guard) return guard;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, label, kind, value, minOrder, maxUses, expiresAt } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Bornes métier : 5..90 % ou 500..500 000 FCFA
    if (kind === "percent" && (value < 5 || value > 90)) {
      return jsonError("Pourcentage entre 5 et 90 %", 400);
    }
    if (kind === "fixed" && (value < 500 || value > 500_000)) {
      return jsonError("Montant entre 500 et 500 000 FCFA", 400);
    }

    // Code : personnalisé (normalisé) ou auto-généré, unique en base
    let code = parsed.data.code ? normalizeCouponCode(parsed.data.code) : "";
    if (code && !COUPON_CODE_RE.test(code)) {
      return jsonError("Code invalide (4 à 24 caractères : A-Z, chiffres, tirets)", 400);
    }
    if (!code) {
      for (let i = 0; i < 6; i++) {
        const candidate = genCode();
        const exists = await db.coupon.findUnique({ where: { code: candidate }, select: { id: true } });
        if (!exists) {
          code = candidate;
          break;
        }
      }
      if (!code) return jsonError("Génération de code impossible — réessaie", 500);
    } else {
      const exists = await db.coupon.findUnique({ where: { code }, select: { id: true } });
      if (exists) return jsonError(`Le code ${code} existe déjà`, 400);
    }

    const exp = expiresAt ? new Date(expiresAt) : null;
    if (exp && exp.getTime() < Date.now()) return jsonError("Date d'expiration déjà passée", 400);

    const coupon = await db.coupon.create({
      data: {
        tenantId,
        code,
        label: label || null,
        kind,
        value,
        minOrder: minOrder ?? 0,
        maxUses: maxUses ?? 0,
        expiresAt: exp,
        active: true,
      },
    });

    return NextResponse.json({ coupon }, { status: 201 });
  } catch (err) {
    return serverError("pro/coupons:post", err);
  }
}

const PatchBody = z.object({
  tenantId: z.string().min(1),
  id: z.string().min(1),
  active: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : avec cookie, l'activation/
    // désactivation exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:coupons:patch");
    if (guard) return guard;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, id, active } = parsed.data;

    const coupon = await db.coupon.findFirst({ where: { id, OR: [{ tenantId }, { tenantId: null }] } });
    if (!coupon) return jsonError("Coupon introuvable", 404);
    // Un coupon maison (tenantId null) ne se gère pas depuis un institut
    if (coupon.tenantId === null) return jsonError("Coupon maison Kènè — non modifiable ici", 403);

    const updated = await db.coupon.update({ where: { id }, data: { active } });
    return NextResponse.json({ coupon: updated });
  } catch (err) {
    return serverError("pro/coupons:patch", err);
  }
}
