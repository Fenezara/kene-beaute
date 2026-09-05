// POST /api/push/unsubscribe — { endpoint } : supprime l'abonnement push
// (désactivation « Rappels sur mon téléphone » ou purge côté navigateur).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { requireUser, warnLegacyNoCookie } from "@/lib/kene/session";
import { rateLimit, rateLimitResponse, rlKey } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

const UNSUBSCRIBE = { limit: 20, windowMs: 60_000 } as const;

const Body = z.object({
  endpoint: z
    .string()
    .min(12)
    .max(2048)
    .refine((v) => v.startsWith("https://"), "endpoint doit être une URL https"),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "push:unsubscribe"), UNSUBSCRIBE);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de demandes — réessaie dans un instant");

  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("endpoint https requis", 400);

    // Session signée (t. 71-b, migration douce) : le corps ne porte pas de
    // userId → l'appartenance se lit sur l'abonnement lui-même. Avec cookie,
    // seul le compte propriétaire de l'endpoint peut le retirer ; sans cookie
    // → legacy (comportement conservé).
    const sess = requireUser(req);
    if (sess) {
      const sub = await db.pushSubscription.findFirst({
        where: { endpoint: parsed.data.endpoint },
        select: { userId: true },
      });
      if (sub && sub.userId !== sess.userId) return jsonError("Session invalide pour ce compte", 401);
    } else {
      warnLegacyNoCookie("push:unsubscribe");
    }

    await db.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("push/unsubscribe", err);
  }
}
