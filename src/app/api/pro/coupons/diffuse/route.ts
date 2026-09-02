// POST /api/pro/coupons/diffuse — {tenantId, couponId} : pousse le code promo
// à toutes les clientes (role client) : notification + cloche TEMPS RÉEL
// (tâche 33) + audit. Idempotence : pas de double diffusion d'un même coupon
// (une notification existe déjà avec metaJson.couponId = id).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { diffuseCoupon } from "@/lib/kene/coupons";

const Body = z.object({
  tenantId: z.string().min(1),
  couponId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("tenantId et couponId requis", 400);
    const { tenantId, couponId } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const coupon = await db.coupon.findFirst({ where: { id: couponId, OR: [{ tenantId }, { tenantId: null }] } });
    if (!coupon) return jsonError("Coupon introuvable", 404);
    // Un coupon maison (tenantId null) ne se diffuse pas depuis un institut —
    // l'UI le désactive, l'API l'impose (jamais de confiance au seul client)
    if (coupon.tenantId === null) return jsonError("Coupon maison Kènè — diffusion réservée à l'administration", 403);
    if (!coupon.active) return jsonError("Active le coupon avant de le diffuser", 400);

    // Idempotence : déjà diffusé ?
    const already = await db.notification.findFirst({
      where: { metaJson: { contains: `"couponId":"${coupon.id}"` } },
      select: { id: true },
    });
    if (already) return jsonError("Ce coupon a déjà été diffusé aux clientes", 400);

    const count = await diffuseCoupon(coupon, tenant.name);
    return NextResponse.json({ ok: true, clients: count });
  } catch (err) {
    return serverError("pro/coupons/diffuse", err);
  }
}
