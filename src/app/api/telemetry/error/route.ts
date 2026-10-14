// POST /api/telemetry/error — Réception des incidents et erreurs applicatives
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit, clientIp } from "@/lib/kene/audit";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

const ErrorSchema = z.object({
  scope: z.string().max(100),
  message: z.string().max(500),
  stack: z.string().max(2500).optional(),
  url: z.string().max(300).optional(),
  userAgent: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "telemetry:error"), AUTH_MUTATION);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  try {
    let body: unknown = null;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    const parsed = ErrorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const { scope, message, url, userAgent } = parsed.data;

    // Détection succincte de l'appareil (Tablette / Mobile / Ordinateur)
    let deviceHint = "PC";
    const ua = (userAgent || "").toLowerCase();
    if (ua.includes("tablet") || ua.includes("ipad") || (ua.includes("android") && !ua.includes("mobile"))) {
      deviceHint = "Tablette";
    } else if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) {
      deviceHint = "Mobile";
    }

    // Traçabilité dans le journal d'audit sécurité/incidents de la Console
    await audit({
      kind: "client_error",
      ip: clientIp(req),
      detail: `[${scope}] (${deviceHint}) ${message.slice(0, 100)}`,
    });

    // Relais externe instantané (Webhook Telegram / Slack / Discord / WhatsApp)
    const webhook = process.env.ALERT_WEBHOOK_URL;
    if (webhook) {
      void fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🚨 **[KÈNÈ ERREUR APPLICATIVE]**\n• **Écran / Scope** : ${scope}\n• **Appareil** : ${deviceHint}\n• **Message** : ${message}\n• **URL** : ${url ?? "—"}\n• **Date** : ${new Date().toLocaleString("fr-FR")}`,
        }),
      }).catch(() => null);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("[api/telemetry/error] Erreur de consignation :", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
