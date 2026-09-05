// Kènè — rate limiting API (lib serveur, importable par les route handlers).
// Fenêtre glissante en mémoire (pas de Redis — POC mono-process) :
// Map de buckets { hits: timestamps[] }, purgée paresseusement à l'appel
// (aucun setInterval → aucun timer qui fuit, rien ne survit en attente).
import { NextResponse } from "next/server";

// ─────────────── Presets par famille de routes sensibles ───────────────
// OTP_REQUEST : spéc 5/15 min, relevé à 10/15 min — le flux démo Kènè
// (bouton « Démo — Entrer comme Mariam ») appelle otp/request automatiquement
// et des tests répétés doivent rester fluides.
export const OTP_REQUEST = { limit: 10, windowMs: 15 * 60_000 } as const;
export const OTP_VERIFY = { limit: 12, windowMs: 15 * 60_000 } as const;
export const DERMATO = { limit: 30, windowMs: 60_000 } as const;
export const PAYMENTS = { limit: 12, windowMs: 60_000 } as const;
export const PAYMENTS_CONFIRM = { limit: 20, windowMs: 60_000 } as const; // confirm MoMo (t. 63-c)
export const ORDERS_CREATE = { limit: 12, windowMs: 60_000 } as const; // commande boutique (t. 63-c)
export const WALLET_TOPUP = { limit: 8, windowMs: 60_000 } as const; // recharge wallet (t. 63-c)
export const APPOINTMENTS_CREATE = { limit: 12, windowMs: 60_000 } as const; // réservation RDV (t. 63-c)
export const APPOINTMENT_CANCEL = { limit: 12, windowMs: 60_000 } as const; // annulation RDV (t. 63-c)
export const REFERRAL_REDEEM = { limit: 5, windowMs: 3_600_000 } as const;
export const TTS = { limit: 12, windowMs: 60_000 } as const;
export const AUTH_MUTATION = { limit: 20, windowMs: 60_000 } as const;

// ── Routes coûteuses (t. 63-d) ──
// VLM client : un scan = une photo analysée par le moteur vision → 6/min
// couvre largement un parcours humain et protège le coût IA.
export const DIAGNOSES_CREATE = { limit: 6, windowMs: 60_000 } as const;
// Diagnostic en institut : praticienne en cabine, rythme humain → 10/min.
export const PRO_DIAGNOSES = { limit: 10, windowMs: 60_000 } as const;
// Diffusion coupon = mass-notification vers TOUTES les clientes → très strict.
export const COUPONS_DIFFUSE = { limit: 4, windowMs: 60_000 } as const;
// Stats admin : scan complet de la base (cachées TTL 60 s côté route) → 30/min.
export const ADMIN_STATS = { limit: 30, windowMs: 60_000 } as const;

export type RateLimitOpts = { limit?: number; windowMs?: number };
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

type Bucket = { hits: number[]; windowMs: number };
type RlStore = { buckets: Map<string, Bucket>; lastPurgeMs: number };

const PURGE_EVERY_MS = 5 * 60_000; // purge des buckets inertes, toutes les 5 min d'activité

// État sur globalThis : survit aux rechargements de modules en dev (HMR
// Turbopack) et reste un singleton même si la lib est bundlée plusieurs fois.
const g = globalThis as typeof globalThis & { __keneRateLimitStore?: RlStore };
const store: RlStore = (g.__keneRateLimitStore ??= { buckets: new Map(), lastPurgeMs: 0 });

/** Supprime les buckets sans hit récent (appelé paresseusement, jamais via timer). */
function purgeInertBuckets(now: number): void {
  for (const [key, bucket] of store.buckets) {
    const fresh = bucket.hits.filter((t) => t > now - bucket.windowMs);
    if (fresh.length === 0) store.buckets.delete(key);
    else if (fresh.length !== bucket.hits.length) bucket.hits = fresh;
  }
}

/** Vérifie (et consomme) un hit pour `key`. Fenêtre glissante : les hits plus
 *  vieux que windowMs sortent du décompte, un slot se libère dès expiration
 *  du hit le plus ancien. Thread-safe mono-process (JS single-threaded). */
export function rateLimit(key: string, opts?: RateLimitOpts): RateLimitResult {
  const limit = opts?.limit ?? 30;
  const windowMs = opts?.windowMs ?? 60_000;
  const now = Date.now();

  if (now - store.lastPurgeMs > PURGE_EVERY_MS) {
    store.lastPurgeMs = now;
    purgeInertBuckets(now);
  }

  const bucket = store.buckets.get(key);
  const hits = bucket ? bucket.hits.filter((t) => t > now - windowMs) : [];

  if (hits.length >= limit) {
    // Le hit le plus ancien expire le premier → délai réel de déblocage.
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    store.buckets.set(key, { hits, windowMs });
    return { ok: false, remaining: 0, retryAfterSec };
  }

  hits.push(now);
  store.buckets.set(key, { hits, windowMs });
  return { ok: true, remaining: Math.max(0, limit - hits.length), retryAfterSec: 0 };
}

/** Clé de limiting par IP : x-forwarded-for (première IP de la chaîne, derrière
 *  le gateway Caddy) sinon x-real-ip, sinon "local" (accès direct :3000). */
export function rlKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")?.trim()) || "local";
  return `${scope}:${ip}`;
}

/** Réponse 429 standard Kènè : body JSON { error, retryAfterSec } + header
 *  Retry-After (repris par le front pour formater le délai). */
export function rateLimitResponse(retryAfterSec: number, message: string): NextResponse {
  return NextResponse.json({ error: message, retryAfterSec }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSec) },
  });
}
