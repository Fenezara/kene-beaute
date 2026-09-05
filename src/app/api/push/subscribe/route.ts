// POST /api/push/subscribe — { userId, subscription: { endpoint, keys: { p256dh, auth } } }
// Enregistre l'abonnement Push API du navigateur (rappels même app fermée,
// t. 60-e). Upsert par endpoint : delete existant puis create — simple et sûr
// (un endpoint n'appartient qu'à un seul appareil/utilisatrice, jamais de
// doublon si la clé VAPID a changé ou si on se réabonne).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rateLimitResponse, rlKey } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

const SUBSCRIBE = { limit: 20, windowMs: 60_000 } as const;

const Body = z.object({
  userId: z.string().min(1).max(64),
  subscription: z.object({
    // Le push service du navigateur impose https (FCM, Mozilla autopush…).
    endpoint: z
      .string()
      .min(12)
      .max(2048)
      .refine((v) => v.startsWith("https://"), "endpoint doit être une URL https"),
    keys: z.object({
      p256dh: z.string().min(16).max(256),
      auth: z.string().min(8).max(256),
    }),
  }),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "push:subscribe"), SUBSCRIBE);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop d'inscriptions aux rappels — réessaie dans un instant");

  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Abonnement push invalide (endpoint https et clés requis)", 400);

    const { userId, subscription } = parsed.data;
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    await db.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
    await db.pushSubscription.create({
      data: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("push/subscribe", err);
  }
}
