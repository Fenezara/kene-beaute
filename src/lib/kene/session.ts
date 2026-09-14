// Kènè — Sessions signées serveur: fin du « session = localStorage
// falsifiable côté client ». Token maison `base64url(JSON payload) + "." +
// HMAC-SHA256`, transporté par un cookie httpOnly — zéro dépendance externe
// (pas de lib jwt: node:crypto suffit).
//
// Migration DOUCE: les routes gardées vérifient la session UNIQUEMENT si le
// cookie est présent (strict-if-cookie); une session ouverte avant ce
// sprint (localStorage, pas encore de cookie) conserve le comportement
// historique + un warning par route (voir warnLegacyNoCookie).
//
// Persistance « comme TikTok »: 90 jours — la cliente reste connectée sur
// son appareil, même après avoir vidé le localStorage (le SessionKeeper
// interroge /api/auth/session, qui lit le cookie en priorité).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "kene_session";
export const SESSION_TTL_SEC = 90 * 24 * 3600; // 90 jours (clientes / pros)

// t. 130 — OWASP Session Management / ASVS V3: une session À PRIVILÈGES vit
// quelques HEURES, pas des semaines. La console peut suspendre un institut
// et verrouiller des comptes → sa session expire après 8 h d'inactivité
// connectée (reconnexion par passkey ou code, ~ le rythme d'une journée de
// pilotage). Les clientes et gérantes gardent leurs 90 jours « comme TikTok ».
export const ADMIN_SESSION_TTL_SEC = 8 * 3600;

const SESSION_TTL_MS = SESSION_TTL_SEC * 1000;
const ADMIN_SESSION_TTL_MS = ADMIN_SESSION_TTL_SEC * 1000;

/** TTL de session selon le rôle (admin = courte, autres = 90 j). */
export function sessionTtlSecForRole(role: string): number {
  return role === "admin" ? ADMIN_SESSION_TTL_SEC : SESSION_TTL_SEC;
}

// ─────────────── Élévation admin (step-up, t. 130) ───────────────
// ASVS V2.7: les actions sensibles (suspendre un institut, verrouiller un
// compte, enregistrer un passkey) exigent une preuve d'identité FRAÎCHE.
// Le cookie `kene_admin_elevated` est un jeton signé (même HMAC que la
// session) valable 5 minutes: posé par /api/admin/elevate après vérification
// d'un code OTP frais, vérifié par les routes de gestion avant d'écrire.
export const ELEVATION_COOKIE = "kene_admin_elevated";
export const ELEVATION_TTL_SEC = 5 * 60;
const ELEVATION_TTL_MS = ELEVATION_TTL_SEC * 1000;

type ElevationPayload = { uid: string; exp: number };

// Secret de signature ( — durcissement 2026):
// 1) KENE_SESSION_SECRET (env) prime TOUJOURS si fourni (≥ 16 chars);
// 2) sinon: secret aléatoire de 48 octets, généré au premier démarrage et
// persisté dans db/.kene-session-secret (mode 0600, hors public/) — il
// survit aux redéploiements (sessions 90 j préservées) et reste UNIQUE
// par environnement, contrairement à l'ancienne constante partagée;
// 3) repli déterministe UNIQUEMENT si le fs est indisponible (théorique).
// Effet de bord documenté: la migration depuis l'ancien secret invalide
// les cookies d'avant ce sprint — les clientes se reconnectent une fois.
function loadSessionSecret(): string {
  const env = process.env.KENE_SESSION_SECRET;
  if (env && env.length >= 16) return env;
  try {
    const file = join(process.cwd(), "db", ".kene-session-secret");
    if (existsSync(file)) {
      const v = readFileSync(file, "utf8").trim();
      if (v.length >= 32) return v;
    }
    const fresh = randomBytes(48).toString("base64url");
    mkdirSync(join(process.cwd(), "db"), { recursive: true });
    writeFileSync(file, `${fresh}\n`, { mode: 0o600 });
    return fresh;
  } catch {
    console.warn("[kene:session] fs indisponible — repli secret éphémère (sessions non persistantes)");
    return "kene-session-secret-poc";
  }
}
const SECRET = loadSessionSecret();

/** Ce que signe la route de connexion (colonnes User minimales). */
export type SessionUserInput = { id: string; phone: string; role: string };

/** Payload signé — `uid`/`phone`/`role` + horodatages (ms epoch). */
type SessionPayload = { uid: string; phone: string; role: string; iat: number; exp: number };

/** Session vérifiée, forme consommée par les routes. */
export type KeneSession = { userId: string; phone: string; role: string };

// ─────────────── Signature / vérification ───────────────

const hmacOf = (data: string): Buffer => createHmac("sha256", SECRET).update(data).digest();

/** Signe une session: `base64url(JSON payload) + "." + HMAC-SHA256(base64url)`.
 * Le TTL dépend du rôle: admin → 8 h (OWASP session à privilèges), autres
 * → 90 jours. La forme du payload reste STRICTEMENT identique. */
export function signSession(user: SessionUserInput): string {
  const iat = Date.now();
  const payload: SessionPayload = {
    uid: user.id,
    phone: user.phone,
    role: user.role,
    iat,
    exp: iat + (user.role === "admin" ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmacOf(body).toString("base64url")}`;
}

/** Signe un jeton d'élévation admin (uid + exp, même HMAC que la session). */
export function signElevation(userId: string): string {
  const payload: ElevationPayload = { uid: userId, exp: Date.now() + ELEVATION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmacOf(body).toString("base64url")}`;
}

/** Vérifie un jeton d'élévation: signature + exp strict → uid ou null. */
export function verifyElevationToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const expected = hmacOf(body);
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ElevationPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

/** Élévation valide pour CETTE session? (cookie signé + uid identique). */
export function elevationFromRequest(req: NextRequest): { userId: string } | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const kv = part.trim();
    if (!kv.startsWith(`${ELEVATION_COOKIE}=`)) continue;
    const uid = verifyElevationToken(decodeURIComponent(kv.slice(ELEVATION_COOKIE.length + 1)));
    return uid ? { userId: uid } : null;
  }
  return null;
}

function isPayloadShape(v: unknown): v is SessionPayload {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.uid === "string" && p.uid.length > 0 &&
    typeof p.phone === "string" &&
    typeof p.role === "string" && p.role.length > 0 &&
    typeof p.iat === "number" && Number.isFinite(p.iat) &&
    typeof p.exp === "number" && Number.isFinite(p.exp)
  );
}

/**
 * Vérifie un token: signature en timingSafeEqual (longueurs comparées avant —
 * timingSafeEqual throw sinon), payload shape validé, `exp` STRICT (exp <= now
 * → null). Tout token invalide, falsifié ou expiré → null, jamais d'exception.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (typeof token !== "string" || token.length === 0) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const expected = hmacOf(body);
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length) return null;
    if (!timingSafeEqual(given, expected)) return null;
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!isPayloadShape(payload)) return null;
    if (payload.exp <= Date.now()) return null; // exp strict
    return payload;
  } catch {
    return null;
  }
}

// ─────────────── Lecture depuis la requête ───────────────

/** Extrait `kene_session` du header Cookie (parse manuel — pas de next/headers,
 * compatible route handlers). Valeur décodée si URL-encodée. */
function sessionTokenFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const kv = part.trim();
    if (!kv.startsWith(`${SESSION_COOKIE}=`)) continue;
    const raw = kv.slice(SESSION_COOKIE.length + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/** Session signée portée par le cookie de la requête, ou null (absent/invalide/expiré). */
export function sessionFromRequest(req: NextRequest): KeneSession | null {
  const token = sessionTokenFromCookieHeader(req.headers.get("cookie"));
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  return { userId: payload.uid, phone: payload.phone, role: payload.role };
}

/** Alias canonique de sessionFromRequest: `{ userId, phone, role } | null`. */
export function requireUser(req: NextRequest): KeneSession | null {
  return sessionFromRequest(req);
}

// ─────────────── Pose / retrait du cookie ───────────────

/** Pose le cookie de session sur la réponse — TTL selon le rôle
 * (admin: 8 h — OWASP session à privilèges; autres: 90 jours). */
export function setSessionCookie(res: NextResponse, user: SessionUserInput): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: signSession(user),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Sandbox en HTTP — passer à `secure: true` derrière HTTPS en prod.
    secure: false,
    maxAge: sessionTtlSecForRole(user.role),
  });
}

/** Pose le cookie d'élévation admin (5 min) sur la réponse — step-up validé. */
export function setElevationCookie(res: NextResponse, userId: string): void {
  res.cookies.set({
    name: ELEVATION_COOKIE,
    value: signElevation(userId),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false, // idem session: true derrière HTTPS en prod
    maxAge: ELEVATION_TTL_SEC,
  });
}

/** Efface le cookie d'élévation (déconnexion / expiration de secours). */
export function clearElevationCookie(res: NextResponse): void {
  res.cookies.set({
    name: ELEVATION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 0,
  });
}

/** Efface le cookie de session (Max-Age=0) sur la réponse de logout. */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Sandbox en HTTP — `secure: true` derrière HTTPS en prod.
    secure: false,
    maxAge: 0,
  });
}

// ─────────────── Gardes « migration douce » (strict-if-cookie) ───────────────

function sessionError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// Dédup du warning legacy: UNE fois par process ET par route (survit au HMR
// via globalThis, pattern du rate-limit) — pas de spam en dev.log.
const g = globalThis as typeof globalThis & { __keneLegacyWarned?: Set<string> };
const legacyWarned: Set<string> = (g.__keneLegacyWarned ??= new Set());

/** Session ouverte avant l'ère des cookies signés: log une fois. */
export function warnLegacyNoCookie(routePath: string): void {
  if (legacyWarned.has(routePath)) return;
  legacyWarned.add(routePath);
  console.warn("[kene:session] requête sans cookie (legacy)", routePath);
}

/**
 * Garde routes cliente: SI un cookie de session valide est présent, le userId
 * revendiqué (body POST/PATCH ou query GET) doit être celui de la session →
 * sinon 401 « Session invalide pour ce compte ». SANS cookie: session legacy
 * d'avant ce sprint → comportement historique conservé (+ warning).
 * Retourne la réponse à renvoyer, ou null si la requête passe.
 */
export function guardUserClaim(
  req: NextRequest,
  routePath: string,
  claimed: string | null | undefined,
): NextResponse | null {
  const sess = sessionFromRequest(req);
  if (sess) {
    if (claimed && claimed !== sess.userId) {
      return sessionError("Session invalide pour ce compte", 401);
    }
    return null;
  }
  warnLegacyNoCookie(routePath);
  return null;
}

/**
 * Garde /api/pro/**: exige une session signée de rôle « pro » (ou « admin »).
 * Fin du mode legacy sans cookie: le port 3000 étant exposé, les routes pro
 * (données clientes, paie, caisse) ne sont plus accessibles anonymement.
 * Le notify-service, lui, passe par /api/pro/live avec son secret de service
 * (x-notify-secret) — il ne transite pas par cette garde.
 */
export function guardProRole(req: NextRequest, routePath: string): NextResponse | null {
  const sess = sessionFromRequest(req);
  if (sess) {
    if (sess.role !== "pro" && sess.role !== "admin") {
      return sessionError("Espace entreprise réservé aux comptes pro", 403);
    }
    return null;
  }
  warnLegacyNoCookie(routePath);
  return sessionError("Session requise — reconnecte-toi à l'espace entreprise", 401);
}

/**
 * Garde /api/admin/** (t. 130 — fermeture du legacy): une session admin
 * VALIDE est TOUJOURS exigée — sans cookie → 401 (fin du comportement
 * historique permissif qui laissait passer les requêtes anonymes avec un
 * simple warning). Autre rôle → 403.
 */
export function guardAdminRole(req: NextRequest, routePath: string): NextResponse | null {
  void routePath;
  const sess = sessionFromRequest(req);
  if (!sess) {
    return sessionError("Session requise — ouvre la Console Kènè via son lien dédié", 401);
  }
  if (sess.role !== "admin") {
    return sessionError("Console admin réservée aux comptes admin", 403);
  }
  return null;
}

/**
 * Garde des actions SENSIBLES de la console (t. 130 — step-up ASVS V2.7):
 * session admin + élévation fraîche (< 5 min, cookie signé posé par
 * /api/admin/elevate). Sinon 403 `elevation_required` — le front ouvre le
 * dialogue de confirmation par code puis rejoue l'action.
 */
export function guardAdminElevated(
  req: NextRequest,
): NextResponse | null {
  const sess = sessionFromRequest(req);
  if (!sess) {
    return sessionError("Session requise — ouvre la Console Kènè via son lien dédié", 401);
  }
  if (sess.role !== "admin") {
    return sessionError("Console admin réservée aux comptes admin", 403);
  }
  const elev = elevationFromRequest(req);
  if (!elev || elev.userId !== sess.userId) {
    return NextResponse.json(
      {
        error: "Confirmation d'identité requise — entre un code frais pour continuer",
        code: "elevation_required",
        retryAfterSec: 0,
      },
      { status: 403 },
    );
  }
  return null;
}
