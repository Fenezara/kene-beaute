// POST /api/push/dispatch — { secret, userId } — route INTERNE (notify-service),
// jamais appelée par le navigateur. Web Push VAPID: envoie la
// dernière notification non lue de la cliente vers TOUTES ses PushSubscription
// (elle la reçoit même application fermée — le service worker affiche la
// notification système). Un abonnement obsolète (404/410 du push service ou
// domaine mort) est purgé et n'interrompt jamais les autres envois.
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sendNotification, setVapidDetails, WebPushError } from "web-push";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rateLimitResponse, rlKey } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

const DISPATCH = { limit: 60, windowMs: 60_000 } as const;
const BODY_MAX = 140; // corps de notification système — court, le fil reste dans l'app

const Body = z.object({
  secret: z.string().min(1),
  userId: z.string().min(1).max(64),
});

/** Un endpoint mort ne reviendra pas: 404/410 du push service, ou domaine
 * push inexistant/injoignable (ENOTFOUND…) — on purge, l'envoi vers les
 * autres abonnements continue. */
function isStaleEndpoint(err: unknown): boolean {
  if (err instanceof WebPushError) return err.statusCode === 404 || err.statusCode === 410;
  const msg = err instanceof Error ? err.message : "";
  return /ENOTFOUND|ECONNREFUSED|EHOSTUNREACH/.test(msg);
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "push:dispatch"), DISPATCH);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Dispatch trop sollicité — réessaie dans un instant");

  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("secret et userId requis", 400);

    const { userId } = parsed.data;
    const secret = process.env.PUSH_SECRET?.trim();
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        console.error("[push:dispatch] PUSH_SECRET non configuré en production");
        return jsonError("Configuration manquante", 500);
      }
    }
    const expectedSecret = secret || "kene-push-secret";
    const bufA = Buffer.from(parsed.data.secret);
    const bufB = Buffer.from(expectedSecret);
    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      return jsonError("Interdit", 403);
    }

    const publicKey =
      process.env.VAPID_PUBLIC_KEY?.trim() ||
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:contact@kene-beaute.com";
    if (!publicKey || !privateKey) {
      // VAPID non configuré: rien à envoyer, mais la route reste verte
      // (le notify-service ne doit jamais crasher là-dessus).
      return NextResponse.json({ sent: 0, failed: 0 });
    }
    setVapidDetails(subject, publicKey, privateKey);

    // Dernière notification non lue (même définition que le badge: sent + readAt null)
    const [notification, subscriptions] = await Promise.all([
      db.notification.findFirst({
        where: { userId, status: "sent", readAt: null },
        orderBy: { createdAt: "desc" },
        select: { message: true, metaJson: true },
      }),
      db.pushSubscription.findMany({ where: { userId } }),
    ]);

    if (!notification || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0 });
    }

    let isProTeam = false;
    try {
      if (notification.metaJson) {
        const meta = JSON.parse(notification.metaJson) as { type?: string };
        if (meta.type === "team_message" || meta.type === "pos_handoff" || meta.type === "stock_alert") {
          isProTeam = true;
        }
      }
    } catch {}

    const body =
      notification.message.length > BODY_MAX
        ? `${notification.message.slice(0, BODY_MAX - 1).trimEnd()}…`
        : notification.message;
    const payload = JSON.stringify({
      title: isProTeam ? "🔔 Kènè Team Live" : "Kènè",
      body,
      url: isProTeam ? "/?space=pro" : "/",
    });

    let sent = 0;
    let failed = 0;
    for (const sub of subscriptions) {
      try {
        await sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        failed++;
        if (isStaleEndpoint(err)) {
          // Purge silencieuse: la base ne garde jamais un endpoint mort.
          await db.pushSubscription
            .deleteMany({ where: { endpoint: sub.endpoint } })
            .catch(() => undefined);
        }
        console.warn(
          `[kene:push:dispatch] échec ${sub.endpoint.slice(0, 48)}… —`,
          err instanceof Error ? err.message : err
        );
      }
    }

    return NextResponse.json({ sent, failed });
  } catch (err) {
    return serverError("push/dispatch", err);
  }
}
