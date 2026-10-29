// src/lib/kene/bot-guard.ts — Bouclier Anti-Robots & Cloudflare Turnstile pour Kènè.
// Protège les routes d'authentification (OTP, PIN, Inscription) contre les
// scrapers, bots de force brute, scripts d'épuisement SMS et navigateurs headless.
// 100% invisible pour les vraies clientes : zéro captcha bloquant, zéro friction.

import { NextRequest } from "next/server";
import { jsonError } from "@/lib/kene/server";
import { clientIp, audit } from "@/lib/kene/audit";

/** Signatures d'outils et de scripts d'automatisation à bloquer immédiatement */
const BOT_USER_AGENTS = [
  /python-requests/i,
  /aiohttp/i,
  /httpx/i,
  /scrapy/i,
  /go-http-client/i,
  /java\//i,
  /apache-httpclient/i,
  /node-fetch/i,
  /postmanruntime/i,
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
];

export interface BotGuardResult {
  ok: boolean;
  reason?: string;
  response?: ReturnType<typeof jsonError>;
}

/**
 * Vérifie un jeton Cloudflare Turnstile auprès de l'API Cloudflare
 * https://challenges.cloudflare.com/turnstile/v0/siteverify
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip?: string
): Promise<{ ok: boolean; reason?: string }> {
  // Clé secrète configurée dans l'environnement, sinon clé de test Cloudflare invisible par défaut
  const secretKey =
    process.env.TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000BB";

  // Si aucun jeton n'a été fourni
  if (!token) {
    // Si la vérification Turnstile est strictement obligatoire (ex. configurée en prod via TURNSTILE_ENFORCE=true)
    if (process.env.TURNSTILE_ENFORCE === "true") {
      return { ok: false, reason: "Vérification de sécurité Turnstile requise (jeton absent)" };
    }
    // Sinon, tolérance par défaut (le bouclier User-Agent + Honeypot protège déjà)
    return { ok: true };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (ip && ip !== "local") {
      formData.append("remoteip", ip);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(4000), // 4 secondes max
    });

    if (!res.ok) {
      console.warn(`[turnstile] Réponse HTTP Cloudflare inattendue (${res.status})`);
      return { ok: true }; // Tolérance réseau pour ne pas bloquer les utilisateurs
    }

    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (!data.success) {
      const errDetail = data["error-codes"]?.join(", ") || "token_invalide";
      return { ok: false, reason: `Échec du contrôle de sécurité robot Turnstile (${errDetail})` };
    }

    return { ok: true };
  } catch (err) {
    console.warn("[turnstile] Erreur réseau lors de la vérification:", err);
    return { ok: true }; // Résilience : en cas de coupure externe Cloudflare, le service continue
  }
}

/**
 * Analyse une requête entrante pour détecter les robots et scripts automatisés.
 * 1. Filtre les User-Agents malveillants / scrapers
 * 2. Vérifie le pot de miel (Honeypot)
 * 3. Valide le jeton temporel anti-rejeu
 * 4. Valide le jeton Cloudflare Turnstile (en-tête x-turnstile-token ou champ payload)
 */
export async function checkBotGuard(
  req: NextRequest,
  body?: Record<string, unknown> | null
): Promise<BotGuardResult> {
  const ua = req.headers.get("user-agent") || "";
  const ip = clientIp(req);

  // 1. Détection par User-Agent de script / automate
  for (const botRegex of BOT_USER_AGENTS) {
    if (botRegex.test(ua)) {
      void audit({
        kind: "security_alert",
        ip,
        detail: `bot_blocked_ua:${ua.slice(0, 50)}`,
      });
      return {
        ok: false,
        reason: "Accès refusé pour les scripts automatisés",
        response: jsonError("Requête invalide", 403),
      };
    }
  }

  if (body && typeof body === "object") {
    // 2. Détection par Pot de Miel (Honeypot)
    const trapValue = body._kene_bot_trap ?? body.hp_check ?? body.website_url;
    if (typeof trapValue === "string" && trapValue.trim().length > 0) {
      void audit({
        kind: "security_alert",
        ip,
        detail: `bot_honeypot_triggered:trap_length=${trapValue.length}`,
      });
      return {
        ok: false,
        reason: "Activité automatisée détectée (pot de miel)",
        response: jsonError("Requête non autorisée", 403),
      };
    }

    // 3. Contrôle de fraîcheur du jeton temporel (anti-rejeu > 24h)
    const clientTs = Number(body._kene_ts);
    if (Number.isFinite(clientTs) && clientTs > 0) {
      const elapsedMs = Date.now() - clientTs;
      if (elapsedMs > 24 * 3600_000) {
        void audit({
          kind: "security_alert",
          ip,
          detail: `bot_expired_ts:elapsed=${elapsedMs}ms`,
        });
        return {
          ok: false,
          reason: "Jeton temporel expiré",
          response: jsonError("Session expirée, veuillez réessayer", 400),
        };
      }
    }
  }

  // 4. Contrôle Cloudflare Turnstile
  const turnstileToken =
    req.headers.get("x-turnstile-token") ||
    (body && typeof body === "object"
      ? (body._turnstile_token as string) ||
        (body.turnstileToken as string) ||
        (body["cf-turnstile-response"] as string)
      : null);

  const turnstileResult = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileResult.ok) {
    void audit({
      kind: "security_alert",
      ip,
      detail: `turnstile_verification_failed:${turnstileResult.reason}`,
    });
    return {
      ok: false,
      reason: turnstileResult.reason,
      response: jsonError(turnstileResult.reason || "Vérification de sécurité requise", 403),
    };
  }

  return { ok: true };
}
