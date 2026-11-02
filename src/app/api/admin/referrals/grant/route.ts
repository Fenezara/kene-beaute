// POST /api/admin/referrals/grant — Créditer des mois/jours d'abonnement Kènè+ à une ambassadrice
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { grantGiftDays } from "@/lib/kene/plans";
import { requireAdmin } from "../../tenants/route";
import { sessionFromRequest } from "@/lib/kene/session";

export const runtime = "nodejs";

const Body = z.object({
  userId: z.string().min(1),
  months: z.number().int().min(1).max(24),
  reason: z.string().min(3).max(100),
});

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req);
  if (guard) return guard;

  const sess = sessionFromRequest(req);
  const adminId = sess?.userId ?? "admin";

  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("userId, months (1 à 24) et reason requis", 400);

    const { userId, months, reason } = parsed.data;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const days = months * 30;
    const planId = user.role === "pro" ? "starter" : "kene_plus";

    const gift = await grantGiftDays(user.id, planId, days, "console_gift");

    // Notification WhatsApp à l'ambassadrice
    await notify({
      userId: user.id,
      channel: "whatsapp",
      toPhone: user.phone,
      message: `Félicitations ${user.name} ! 🌟 L'équipe Kènè vient de t'offrir +${months} mois (${days} jours) d'abonnement pour te remercier de ton engagement comme ambassadrice. Actif jusqu'au ${gift.subscription.expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} 💛`,
    });

    // Journal d'audit
    await db.auditLog.create({
      data: {
        userId: adminId,
        action: "referral_admin_grant",
        entity: "subscription",
        entityId: user.id,
        detailsJson: JSON.stringify({
          grantedTo: user.id,
          userName: user.name,
          months,
          days,
          reason,
          expiresAt: gift.subscription.expiresAt.toISOString(),
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      months,
      days,
      expiresAt: gift.subscription.expiresAt.toISOString(),
    });
  } catch (err) {
    return serverError("admin/referrals/grant", err);
  }
}
