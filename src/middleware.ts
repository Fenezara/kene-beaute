// src/middleware.ts — Sécurité périmètre Kènè (t. 86-c).
//
// Code EDGE-SAFE uniquement (runtime Edge de Next 16 App Router) : AUCUNE API
// Node ici — ni fs, ni node:crypto, rien que des Web APIs standard (URL, headers).
//
// Deux rôles :
//  1. EN-TÊTES DE SÉCURITÉ 2026 sur TOUTES les réponses (pages HTML, routes
//     /api/*, chunks /_next/*, fichiers /public : sw.js, manifest, icônes).
//     Ce middleware est la SOURCE UNIQUE des en-têtes (l'ancien bloc
//     headers() de next.config.ts a été retiré pour éviter les doublons).
//  2. GARDE CSRF/Origin : toute requête MUTANTE (non GET/HEAD/OPTIONS) vers
//     /api/* portant un Origin d'un host différent du nôtre est coupée en
//     403 JSON AVANT d'atteindre les handlers.
//
// ⚠️ CONTRAINTE PRÉVIEW (à ne jamais briser) : l'app vit dans une iframe de
// préview sandbox derrière le gateway Caddy (:81). On ne pose JAMAIS de
// X-Frame-Options, et la CSP garde `frame-ancestors *` — tout blocage de
// frame casserait la préview.

import { NextRequest, NextResponse } from "next/server";

export const config = {
  // Toutes les routes : pages, /api/*, /_next/*, /public — chaque réponse
  // passe par le middleware et repart avec les en-têtes de sécurité.
  matcher: "/:path*",
};

// Content-Security-Policy — directives strictes à une exception assumée :
// frame-ancestors * (iframe de préview sandbox, cf. en-tête de fichier).
// Justifications des assouplissements apparents :
//  - script-src 'unsafe-eval'      : requis par React Refresh / HMR de Next 16
//                                     en dev (Turbopack évalue du code à chaud).
//  - script/style 'unsafe-inline'  : scripts et styles injectés par Next
//                                     lui-même + animations inline de
//                                     framer-motion.
//  - connect-src ws: wss:          : le client socket.io se branche via l'URL
//                                     relative io("/?XTransformPort=3030") à
//                                     travers le gateway (WebSocket).
//  - img/media/font/worker blob:
//    et data:                      : photos de diagnostic en preview data-URL/
//                                     blob côté client + audio TTS servi en
//                                     blob + bulles d'avatars en data-URL.
//  - manifest-src 'self'           : PWA (public/manifest.json).
//  - object-src 'none', base-uri et form-action 'self' : aucun plugin, aucune
//     soumission de formulaire hors du domaine.
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
// une réponse durcie). ⚠️ AUCUN X-Frame-Options ici : l'iframe de préview
// sandbox l'interdit (frame-ancestors * dans la CSP fait le travail).
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Content-Security-Policy", CONTENT_SECURITY_POLICY],
  // Ignoré par les navigateurs en HTTP de dev — actif dès qu'on sert en
  // HTTPS (standard 2026 : 2 ans, sous-domaines inclus).
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  // camera/micro autorisés pour le diagnostic de peau (photo/scan) et l'ASR
  // vocal ; tout le reste (paiement, USB, série, bluetooth, idle-detection)
  // verrouillé.
  [
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), idle-detection=()",
  ],
  ["X-DNS-Prefetch-Control", "off"],
  // COOP « same-origin-allow-popups » : isole le contexte browsing tout en
  // laissant window.open / liens target=_blank fonctionner (paiements, OAuth).
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
];

/** Pose les en-têtes de sécurité sur une réponse (quelle qu'elle soit). */
function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [key, value] of SECURITY_HEADERS) {
    res.headers.set(key, value);
  }
  return res;
}

/** Découpe un header Host (« localhost:81 », « [::1]:3000 ») en hostname + port. */
function splitHostHeader(raw: string): { hostname: string; port: string } {
  const h = raw.trim().toLowerCase();
  if (h === "") return { hostname: "", port: "" };
  // IPv6 littéral : [::1]:3000
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
 * Garde CSRF/Origin : true = l'origine déclarée ne correspond PAS à cette
 * requête → 403.
 *
 * ARBITRE PRINCIPAL — Sec-Fetch-Site (t. 96) : en-tête posé par le navigateur
 * lui-même (non forgeable en JS — spec Fetch « forbidden header »). La chaîne
 * de préview de la fondatrice traverse un gateway externe qui RÉÉCRIT le Host
 * (Origin = domaine plateforme ≠ Host vu par Next) : la comparaison littérale
 * Origin↔Host rejetait en 403 silencieux TOUT ses POST — diagnostic, login
 * pavé, inscription — alors que son navigateur émettait des requêtes
 * parfaitement same-origin. On fait donc confiance à Sec-Fetch-Site :
 *  - « same-origin » / « same-site » / « none » → REQUÊTE LÉGITIME, on passe ;
 *  - « cross-site » → vrai CSRF (page attaquante) → refus ;
 *  - absent (curl, serveur→serveur, vieux clients) → repli sur la comparaison
 *    Origin↔Host historique ci-dessous (le garde-fou reste entier pour les
 *    clients non-navigateur qui forgent Origin).
 *
 * Repli historique — comparaison host==host robuste :
 *  - le schéma (http/https) est IGNORÉ (le gateway peut terminer le TLS en
 *    amont) ;
 *  - hostname : header Host en priorité (véridique côté navigateur, impossible
 *    à forger depuis du JS), repli X-Forwarded-Host, repli URL Next ;
 *  - port : port explicite du Host (accès direct :3000), sinon port PUBLIC du
 *    X-Forwarded-Host — le gateway Caddy réécrit le Host SANS son port
 *    (« localhost ») mais transmet l'original complet dans X-Forwarded-Host
 *    (« localhost:81 ») —, sinon port implicite du schéma réel
 *    (X-Forwarded-Proto puis protocole de l'URL), en tolérant 80/443
 *    implicites des deux côtés ;
 *  - Origin absent, vide ou « null » (iframes sandbox, clients legacy) :
 *    on laisse passer — la compatibilité préview prime, et les cookies
 *    SameSite + sessions signées gardent le reste couvert.
 */
function isExternalOrigin(req: NextRequest, reqUrl: URL): boolean {
  const origin = (req.headers.get("origin") ?? "").trim().toLowerCase();
  if (origin === "" || origin === "null") return false;

  // 1) Arbitre navigateur (non forgeable) : seul un VRAI cross-site est coupé.
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

  // Host cible : header Host (source de vérité navigateur), complété par
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

export function middleware(req: NextRequest) {
  const method = req.method.toUpperCase();
  const path = req.nextUrl.pathname;

  // 1) Garde CSRF/Origin — AVANT tout : les écritures /api/* d'une origine
  //    externe ne doivent JAMAIS atteindre les handlers.
  if (
    path.startsWith("/api/") &&
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS"
  ) {
    const reqUrl = new URL(req.url);
    if (isExternalOrigin(req, reqUrl)) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Requête refusée (origine externe)" }, { status: 403 }),
      );
    }
  }

  // 2) En-têtes de sécurité sur TOUTES les réponses.
  return applySecurityHeaders(NextResponse.next());
}
