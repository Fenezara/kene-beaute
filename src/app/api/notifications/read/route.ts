// POST /api/notifications/read — { userId, ids? } marque les notifications
// ENVOYÉES comme lues (readAt = now). Sans ids → toutes les non lues de la
// cliente. Les rappels scheduled ne sont jamais marqués (pas encore reçus).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";

export const runtime = "nodejs";

const Body = z.object({
  userId: z.string().min(1),
  ids: z.array(z.string().min(1)).optional(), // ciblage précis (une notification)
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("userId requis", 400);

    const { userId, ids } = parsed.data;

    // Session signée (, migration douce): avec cookie, seules les
    // notifications de la session peuvent être marquées lues; sans cookie → legacy.
    const guard = guardUserClaim(req, "notifications:read", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const res = await db.notification.updateMany({
      where: {
        userId,
        status: "sent",
        readAt: null,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, updated: res.count });
  } catch (err) {
    return serverError("notifications/read", err);
  }
}
