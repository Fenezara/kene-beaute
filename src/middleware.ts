// src/middleware.ts — Sécurité périmètre Kènè.
//
// Code EDGE-SAFE uniquement (runtime Edge de Next 16 App Router): AUCUNE API
// Node ici — ni fs, ni node:crypto, rien que des Web APIs standard (URL, headers).
//
// Deux rôles:
// 1. EN-TÊTES DE SÉCURITÉ 2026 sur TOUTES les réponses (pages HTML, routes
// /api/*, chunks /_next/*, fichiers /public: sw.js, manifest, icônes).
// Ce middleware est la SOURCE UNIQUE des en-têtes (l'ancien bloc
// headers de next.config.ts a été retiré pour éviter les doublons).
// 2. GARDE CSRF/Origin: toute requête MUTANTE (non GET/HEAD/OPTIONS) vers
// /api/* portant un Origin d'un host différent du nôtre est coupée en
// 403 JSON AVANT d'atteindre les handlers.
//
// ⚠️ CONTRAINTE PRÉVIEW (à ne jamais briser): l'app vit dans une iframe de
// préview sandbox derrière le gateway Caddy (:81). Aucun en-tête d'interdiction de frame,
// et la CSP garde `frame-ancestors *` — tout blocage de frame casserait la préview.

import { NextRequest, NextResponse } from "next/server";

export const config = {
  // Toutes les routes: pages, /api/*, /_next/*, /public — chaque réponse
  // passe par le middleware et repart avec les en-têtes de sécurité.
  matcher: "/:path*",
};

// Content-Security-Policy — directives strictes à une exception assumée:
// frame-ancestors * (iframe de préview sandbox, cf. en-tête de fichier).
// Justifications des assouplissements apparents:
// - script-src 'unsafe-eval': requis par React Refresh / HMR de Next 16
// en dev (Turbopack évalue du code à chaud).
// - script/style 'unsafe-inline': scripts et styles injectés par Next
// lui-même + animations inline de
// framer-motion.
// - connect-src ws: wss:: le client socket.io se branche via l'URL
// relative io("/?XTransformPort=3030") à
// travers le gateway (WebSocket).
// - img/media/font/worker blob:
// et data:: photos de diagnostic en preview data-URL/
// blob côté client + audio TTS servi en
// blob + bulles d'avatars en data-URL.
// - manifest-src 'self': PWA (public/manifest.json).
// - object-src 'none', base-uri et form-action 'self': aucun plugin, aucune
// soumission de formulaire hors du domaine.
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob: data:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' ws: wss:; " +
  "worker-src 'self' blob:; " +
  "manifest-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'; " +
  "frame-ancestors *";

// En-têtes posés sur CHAQUE réponse (403 CSRF inclus — un refus aussi est
// une réponse durcie). ⚠️ Aucun en-tête d'interdiction de frame ici: l'iframe de préview
// sandbox l'interdit (frame-ancestors * dans la CSP fait le travail).
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Content-Security-Policy", CONTENT_SECURITY_POLICY],
  // Ignoré par les navigateurs en HTTP de dev — actif dès qu'on sert en
  // HTTPS (standard 2026: 2 ans, sous-domaines inclus).
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  // camera/micro autorisés pour le diagnostic de peau (photo/scan) et l'ASR
  // vocal; bluetooth et usb autorisés pour l'impression thermique directe (ESC/POS POS)
  // et les périphériques de caisse; le reste verrouillé.
  [
    "Permissions-Policy",
    "camera=(self), microphone=(self), bluetooth=(self), usb=(self), geolocation=(self), payment=(), serial=(), idle-detection=()",
  ],
  ["X-DNS-Prefetch-Control", "off"],
  // COOP « same-origin-allow-popups »: isole le contexte browsing tout en
  // laissant window.open / liens target=_blank fonctionner (paiements, OAuth).
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
  // CORP « cross-origin »: permet à l'iframe de préview sandbox (et aux
  // contextes webview/localhost) de charger les ressources sans blocage.
  ["Cross-Origin-Resource-Policy", "cross-origin"],
];

// En-têtes supplémentaires pour les réponses /api/* : on interdit tout cache
// intermédiaire (proxies, CDN) pour les données sensibles (sessions, bilans,
// diagnostics, salaires…). Posés EN PLUS des SECURITY_HEADERS de base.
const API_CACHE_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Cache-Control", "no-store, max-age=0"],
  ["Pragma", "no-cache"],
];

/** Pose les en-têtes de sécurité sur une réponse (quelle qu'elle soit). */
function applySecurityHeaders(res: NextResponse, isApi = false): NextResponse {
  for (const [key, value] of SECURITY_HEADERS) {
    res.headers.set(key, value);
  }
  if (isApi) {
    for (const [key, value] of API_CACHE_HEADERS) {
      res.headers.set(key, value);
    }
  }
  return res;
}

/** Découpe un header Host (« localhost:81 », « [::1]:3000 ») en hostname + port. */
function splitHostHeader(raw: string): { hostname: string; port: string } {
  const h = raw.trim().toLowerCase();
  if (h === "") return { hostname: "", port: "" };
  // IPv6 littéral: [::1]:3000
  if (h.startsWith("[")) {
    const close = h.indexOf("]");
    if (close === -1) return { hostname: h, port: "" };
    const rest = h.slice(close + 1);
    return {
      hostname: h.slice(1, close),
      port: rest.startsWith(":") ? rest.slice(1) : "",
    };
  }
  const colon = h.lastIndexOf(":");
  if (colon === -1) return { hostname: h, port: "" };
  return { hostname: h.slice(0, colon), port: h.slice(colon + 1) };
}

/** Port implicite d'un schéma (80 → http, 443 → https). */
function implicitPort(scheme: string): string {
  return scheme === "https" ? "443" : "80";
}

/**
 * Garde CSRF/Origin: true = l'origine déclarée ne correspond PAS à cette
 * requête → 403.
 *
 * ARBITRE PRINCIPAL — Sec-Fetch-Site: en-tête posé par le navigateur
 * lui-même (non forgeable en JS — spec Fetch « forbidden header »). La chaîne
 * de préview de la fondatrice traverse un gateway externe qui RÉÉCRIT le Host
 * (Origin = domaine plateforme ≠ Host vu par Next): la comparaison littérale
 * Origin↔Host rejetait en 403 silencieux TOUT ses POST — diagnostic, login
 * pavé, inscription — alors que son navigateur émettait des requêtes
 * parfaitement same-origin. On fait donc confiance à Sec-Fetch-Site:
 * - « same-origin » / « same-site » / « none » → REQUÊTE LÉGITIME, on passe;
 * - « cross-site » → vrai CSRF (page attaquante) → refus;
 * - absent (curl, serveur→serveur, vieux clients) → repli sur la comparaison
 * Origin↔Host historique ci-dessous (le garde-fou reste entier pour les
 * clients non-navigateur qui forgent Origin).
 *
 * Repli historique — comparaison host==host robuste:
 * - le schéma (http/https) est IGNORÉ (le gateway peut terminer le TLS en
 * amont);
 * - hostname: header Host en priorité (véridique côté navigateur, impossible
 * à forger depuis du JS), repli X-Forwarded-Host, repli URL Next;
 * - port: port explicite du Host (accès direct:3000), sinon port PUBLIC du
 * X-Forwarded-Host — le gateway Caddy réécrit le Host SANS son port
 * (« localhost ») mais transmet l'original complet dans X-Forwarded-Host
 * (« localhost:81 »), sinon port implicite du schéma réel
 * (X-Forwarded-Proto puis protocole de l'URL), en tolérant 80/443
 * implicites des deux côtés;
 * - Origin absent, vide ou « null » (iframes sandbox, clients legacy):
 * on laisse passer — la compatibilité préview prime, et les cookies
 * SameSite + sessions signées gardent le reste couvert.
 */
function isExternalOrigin(req: NextRequest, reqUrl: URL): boolean {
  const origin = (req.headers.get("origin") ?? "").trim().toLowerCase();
  if (origin === "" || origin === "null") return false;

  // 1) Arbitre navigateur (non forgeable): seul un VRAI cross-site est coupé.
  const fetchSite = (req.headers.get("sec-fetch-site") ?? "").trim().toLowerCase();
  if (fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none") {
    return false;
  }
  if (fetchSite === "cross-site") {
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    // Origin présent mais imparsable ≠ origine de navigateur honnête → refus.
    return true;
  }

  // Host cible: header Host (source de vérité navigateur), complété par
  // X-Forwarded-Host (posé par le gateway, porte le host:port public complet
  // quand Caddy réécrit le Host sans le port), repli final sur l'URL Next.
  const hostParts = splitHostHeader(req.headers.get("host") ?? "");
  const forwardedParts = splitHostHeader(req.headers.get("x-forwarded-host") ?? "");
  const reqHostname = (
    hostParts.hostname ||
    forwardedParts.hostname ||
    reqUrl.hostname
  ).toLowerCase();
  // Schéma réel de la requête (X-Forwarded-Proto posé par le gateway).
  const forwardedProto = (req.headers.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const reqPort =
    hostParts.port ||
    forwardedParts.port ||
    implicitPort(forwardedProto || reqUrl.protocol.replace(":", ""));

  const originHostname = originUrl.hostname.toLowerCase();
  const originPort = originUrl.port || implicitPort(originUrl.protocol.replace(":", ""));

  const sameHost = originHostname === reqHostname;
  const samePort = originPort === reqPort;

  return !(sameHost && samePort);
}

// Rate limiter global en mémoire Edge pour le trafic /api/* (défense en profondeur anti-DDoS)
const GLOBAL_API_LIMIT = 200; // 200 requêtes / minute par IP
const GLOBAL_API_WINDOW_MS = 60_000;
const globalRateLimitStore = new Map<string, number[]>();
let lastGlobalPurgeMs = 0;

function checkGlobalApiRateLimit(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (now - lastGlobalPurgeMs > 60_000) {
    lastGlobalPurgeMs = now;
    for (const [key, hits] of globalRateLimitStore.entries()) {
      const valid = hits.filter((t) => t > now - GLOBAL_API_WINDOW_MS);
      if (valid.length === 0) globalRateLimitStore.delete(key);
      else globalRateLimitStore.set(key, valid);
    }
  }

  const hits = globalRateLimitStore.get(ip) || [];
  const validHits = hits.filter((t) => t > now - GLOBAL_API_WINDOW_MS);
  if (validHits.length >= GLOBAL_API_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((validHits[0] + GLOBAL_API_WINDOW_MS - now) / 1000));
    return { ok: false, retryAfter };
  }
  validHits.push(now);
  globalRateLimitStore.set(ip, validHits);
  return { ok: true, retryAfter: 0 };
}

// ─────────────────────────── BOUCLIER 1 : HONEYPOT & IP JAIL (MICRO-FAIL2BAN) ───────────────────────────
// Détecte les scans malveillants automatisés (robots vulnérabilités, sondes WordPress, .env, .git)
// et place instantanément l'adresse IP en isolement complet pendant 30 minutes.
const HONEYPOT_PROBES_REGEX =
  /(?:\/\.env(?:\.|$|\/)|\/\.git(?:\.|$|\/)|\/\.aws|\/\.ssh|\/wp-admin|\/wp-login\.php|\/xmlrpc\.php|\/phpmyadmin|\/pma|\/cgi-bin|\/actuator|\/solr|\/boaform|\/eval-stdin\.php|\/config\.php|\/setup\.php)/i;

const IP_JAIL_MS = 30 * 60_000; // 30 minutes de mise en quarantaine
const jailedIpsStore = new Map<string, number>();
let lastJailPurgeMs = 0;

function extractClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

function checkIpJail(ip: string): { jailed: boolean } {
  if (ip === "local") return { jailed: false };
  const now = Date.now();
  if (now - lastJailPurgeMs > 60_000) {
    lastJailPurgeMs = now;
    for (const [key, expiresAt] of jailedIpsStore.entries()) {
      if (expiresAt <= now) jailedIpsStore.delete(key);
    }
  }
  const expiresAt = jailedIpsStore.get(ip);
  if (expiresAt && expiresAt > now) {
    return { jailed: true };
  }
  if (expiresAt) {
    jailedIpsStore.delete(ip);
  }
  return { jailed: false };
}

function jailIp(ip: string): void {
  if (ip === "local") return;
  jailedIpsStore.set(ip, Date.now() + IP_JAIL_MS);
}

// ─────────────────────────── BOUCLIER 2 : ANTI-JSON BOMB & TAILLE PAYLOAD ───────────────────────────
const MAX_GENERAL_PAYLOAD_BYTES = 1024 * 1024; // 1 MB pour les requêtes API standards
const MAX_MEDIA_PAYLOAD_BYTES = 16 * 1024 * 1024; // 16 MB pour les audios vocaux, photos diagnostic & médias

export function middleware(req: NextRequest) {
  const method = req.method.toUpperCase();
  const path = req.nextUrl.pathname;
  const ip = extractClientIp(req);

  // A) VÉRIFICATION IP JAIL : si l'IP a touché un pot de miel précédemment, rejet immédiat
  if (checkIpJail(ip).jailed) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Accès refusé par la politique de sécurité" }, { status: 403 }),
      path.startsWith("/api/")
    );
  }

  // B) DÉTECTION DU POT DE MIEL (HONEYPOT) : mise en prison immédiate de l'IP attaquante
  if (HONEYPOT_PROBES_REGEX.test(path)) {
    jailIp(ip);
    return applySecurityHeaders(
      NextResponse.json({ error: "Accès interdit" }, { status: 403 }),
      true
    );
  }

  // C) GARDE-FOU ANTI-JSON BOMB : vérification de la taille du payload HTTP
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    const rawContentLength = req.headers.get("content-length");
    if (rawContentLength) {
      const contentLength = parseInt(rawContentLength, 10);
      if (!Number.isNaN(contentLength)) {
        const isMediaUpload =
          path.startsWith("/api/dermato/chat") ||
          path.startsWith("/api/asr") ||
          path.startsWith("/api/tts") ||
          path.startsWith("/api/pro/assistant") ||
          path.startsWith("/api/dermato/photo") ||
          path.startsWith("/api/media") ||
          path.startsWith("/api/pro/institutes/media") ||
          path.startsWith("/api/pro/institute-photo") ||
          path.startsWith("/api/pro/diagnoses") ||
          path.startsWith("/api/diag");
        const maxAllowed = isMediaUpload ? MAX_MEDIA_PAYLOAD_BYTES : MAX_GENERAL_PAYLOAD_BYTES;
        if (contentLength > maxAllowed) {
          return applySecurityHeaders(
            NextResponse.json(
              { error: "Charge utile trop volumineuse (taille maximale autorisée dépassée)" },
              { status: 413 }
            ),
            true
          );
        }
      }
    }
  }

  // 0) LIEN DÉDIÉ CONSOLE (t. 130) — « /console » ouvre la Console Kènè:
  // rewrite TRANSPARENT vers la page unique « / » (aucune route de page
  // supplémentaire — le navigateur garde /console en barre d'adresse, le
  // client détecte l'entrée par location.pathname et monte l'écran de
  // connexion console). Séparation des portes: la vitrine publique ne
  // connecte plus les comptes admin (otp/verify refuse le rôle admin en
  // contexte « app »), et /console n'ouvre QUE les comptes admin.
  if (path === "/console" || path === "/console/") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const res = NextResponse.rewrite(url);
    res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return applySecurityHeaders(res);
  }

  // 0-bis) PORTE DÉDIÉE CODE PIN (/pin) — écran dédié de saisie du code secret
  // (standard Wave / mobile banking): rewrite transparent vers « / », URL
  // /pin conservée dans la barre d'adresse du client, préservation des query params.
  if (path === "/pin" || path === "/pin/") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    const res = NextResponse.rewrite(url);
    res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return applySecurityHeaders(res);
  }

  // 0-ter) PORTE DÉDIÉE ESPACE PRO (/pro) — accès direct à la gestion institut & Assistante Maman
  if (path === "/pro" || path === "/pro/") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    const res = NextResponse.rewrite(url);
    res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return applySecurityHeaders(res);
  }

  // 1-bis) Désactiver le cache HTTP sur /sw.js, la page d'accueil et les chunks /_next/
  // (en mode Turbopack/dev les noms de chunks sont basés sur le chemin de fichier : un max-age long bloque les mises à jour UI)
  if (
    path === "/sw.js" ||
    path === "/" ||
    path === "" ||
    path.startsWith("/_next/")
  ) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return applySecurityHeaders(res);
  }

  // 1-ter) Cache optimisé haute performance uniquement pour les images et polices statiques
  if (/\.(webp|png|jpg|jpeg|svg|woff2|ico)$/i.test(path)) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=86400");
    return applySecurityHeaders(res, false);
  }

  // Detecte si la route est une API (pour Cache-Control: no-store).
  const isApi = path.startsWith("/api/");

  // 1-quater) BOUCLIER ANTI-ROBOTS PÉRIMÉTRIQUE : bloque les scripts et scrapers bruts sur les routes sensibles
  if (path.startsWith("/api/auth/")) {
    const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
    if (
      ua.includes("python-requests") ||
      ua.includes("aiohttp") ||
      ua.includes("scrapy") ||
      ua.includes("go-http-client") ||
      ua.includes("postmanruntime") ||
      ua.includes("headlesschrome") ||
      ua.includes("puppeteer")
    ) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Requête automatisée non autorisée" }, { status: 403 }),
        true,
      );
    }
  }

  // 1-quinquies) GARDE-FOU GLOBAL ANTI-DDoS API (Périmètre Middleware)
  // Coupe les rafales excessives (> 200 req/min) avant d'atteindre le runtime Node ou la base.
  // Exemptions : surveillance /api/health et webhooks bancaires entrants.
  if (isApi && !path.startsWith("/api/health") && !path.includes("/webhook")) {
    const rl = checkGlobalApiRateLimit(ip);
    if (!rl.ok) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Débit de requêtes trop élevé — patientez un instant", retryAfterSec: rl.retryAfter },
          { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
        ),
        true
      );
    }
  }

  // 1) Garde CSRF/Origin — AVANT tout: les écritures /api/* d'une origine
  // externe ne doivent JAMAIS atteindre les handlers.
  if (
    isApi &&
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS"
  ) {
    const reqUrl = new URL(req.url);
    if (isExternalOrigin(req, reqUrl)) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Requête refusée (origine externe)" }, { status: 403 }),
        true, // c'est une réponse API: no-store
      );
    }
  }

  // 2) En-têtes de sécurité sur TOUTES les réponses.
  return applySecurityHeaders(NextResponse.next(), isApi);
}

