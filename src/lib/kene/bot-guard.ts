// src/lib/kene/bot-guard.ts — Bouclier Anti-Robots Invisible pour Kènè.
// Protège les routes d'authentification (OTP, PIN, Inscription) contre les
// scrapers, bots de force brute, scripts d'épuisement SMS et navigateurs headless.
// 100% invisible pour les vraies clientes : zéro captcha, zéro friction.

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
 * Analyse une requête entrante pour détecter les robots et scripts automatisés.
 * @param req La requête Next.js
 * @param body Le payload JSON ou objet soumis
 */
export function checkBotGuard(req: NextRequest, body?: Record<string, unknown> | null): BotGuardResult {
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
    // Ce champ invisible est ignoré par les humains, mais systématiquement rempli par les bots
    const trapValue = body._kene_bot_trap ?? body.hp_check ?? body.website_url;
    if (typeof trapValue === "string" && trapValue.trim().length > 0) {
      void audit({
        kind: "security_alert",
        ip,
        detail: `bot_honeypot_triggered:trap_length=${trapValue.length}`,
      });
      // Réponse silencieuse ou 403 pour décourager le robot
      return {
        ok: false,
        reason: "Activité automatisée détectée (pot de miel)",
        response: jsonError("Requête non autorisée", 403),
      };
    }

    // 3. Contrôle du temps de saisie humain (Human Timing Check)
    // Une vraie cliente prend au moins 500 ms à 1 seconde pour interagir avec l'écran
    const clientTs = Number(body._kene_ts);
    if (Number.isFinite(clientTs) && clientTs > 0) {
      const elapsedMs = Date.now() - clientTs;
      // Si la soumission s'est produite en moins de 400 millisecondes depuis l'ouverture du formulaire
      if (elapsedMs > 0 && elapsedMs < 400) {
        void audit({
          kind: "security_alert",
          ip,
          detail: `bot_timing_too_fast:elapsed=${elapsedMs}ms`,
        });
        return {
          ok: false,
          reason: "Vitesse de soumission anormale",
          response: jsonError("Veuillez patienter quelques instants avant de valider", 429),
        };
      }
    }
  }

  return { ok: true };
}
