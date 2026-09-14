// PATCH /api/admin/users/[id] — verrouiller / déverrouiller un compte
// (t. 128 — console de gestion, modération).
//
// { locked: true, reason } → le compte est refusé à la vérification OTP
// (403 avec le motif montré) et sa session existante s'éteint au prochain
// boot (auth/session → 404 « Session expirée »). { locked: false } rouvre.
//
// Protections: l'admin ne peut ni se verrouiller ELLE-MÊME ni verrouiller un
// autre compte admin — sinon la fondatrice pourrait se murer hors de sa
// propre console (et un compte admin verrouillé perdrait le pilotage de la
// plateforme). Les comptes pro d'un institut suspendu sont gérés par le
// levier institut, pas par le verrou individuel.
//
// Sécurité: session admin EXIGÉE (401 sans cookie, 403 autre rôle) + audit
// user_locked/user_unlocked (téléphone masqué dans le journal).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { requireAdmin } from "../../tenants/route";

export const runtime = "nodejs";

const Body = z.object({
  locked: z.boolean(),
  reason: z.string().trim().min(3, "Motif requis (min. 3 caractères)").max(280).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "admin:user:patch"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop d'actions — réessaie dans une minute");
  const guard = requireAdmin(req);
  if (guard) return guard;
  try {
    const { id } = await ctx.params;
    const raw = await req.json().catch(() => null);
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Requête invalide", 400);
    }
    const { locked, reason } = parsed.data;

    const sess = sessionFromRequest(req);
    // (requireAdmin garantit sess non null — TS a besoin du rappel)
    if (!sess) return jsonError("Session requise", 401);

    if (locked && id === sess.userId) {
      return jsonError("Tu ne peux pas verrouiller ton propre compte console", 400);
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) return jsonError("Compte introuvable", 404);

    if (locked && user.role === "admin") {
      return jsonError(
        "Un compte admin ne se verrouille pas depuis la console — retire ses droits côté base",
        400,
      );
    }
    if (locked && !reason) {
      return jsonError("Un motif est requis pour verrouiller (montré au compte à sa tentative de connexion)", 400);
    }

    const updated = await db.user.update({
      where: { id },
      data: locked
        ? { lockedAt: new Date(), lockedReason: reason ?? null }
        : { lockedAt: null, lockedReason: null },
    });

    void audit({
      kind: locked ? "user_locked" : "user_unlocked",
      userId: user.id,
      phone: user.phone,
      ip: clientIp(req),
      detail: `${user.name}${reason && locked ? ` — ${reason}` : ""}`,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        lockedAt: updated.lockedAt?.toISOString() ?? null,
        lockedReason: updated.lockedReason,
      },
    });
  } catch (err) {
    return serverError("admin/user:patch", err);
  }
}
