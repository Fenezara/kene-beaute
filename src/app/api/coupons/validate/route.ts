// POST /api/coupons/validate — {code, userId?, subtotal} : aperçu de remise
// au checkout SANS consommer le coupon (la consommation a lieu à la commande).
// Toutes les gardes métier vivent dans lib/kene/coupons (source unique).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { checkCoupon } from "@/lib/kene/coupons";

const Body = z.object({
  code: z.string().trim().min(1).max(40),
  userId: z.string().min(1).optional(),
  subtotal: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("code et subtotal requis", 400);
    const { code, userId, subtotal } = parsed.data;

    // Session signée (t. 71-b, migration douce) : avec cookie, l'aperçu de
    // remise se calcule pour le compte de la session ; sans userId dans le
    // corps (invitée) ou sans cookie → legacy (comportement conservé).
    const guard = guardUserClaim(req, "coupons:validate", userId);
    if (guard) return guard;

    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return jsonError("Utilisatrice introuvable", 404);
    }

    const check = await checkCoupon(code, subtotal, userId ?? null);
    if (!check.ok) return jsonError(check.error ?? "Code promo invalide", 400);

    return NextResponse.json({
      ok: true,
      coupon: check.coupon,
      subtotal: check.subtotal,
      discount: check.discount,
      total: check.total,
    });
  } catch (err) {
    return serverError("coupons/validate", err);
  }
}
