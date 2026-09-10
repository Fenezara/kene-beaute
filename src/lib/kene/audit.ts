// Kènè — Journal d'audit sécurité (t. 86-d) : traçabilité des événements
// sensibles (OTP, connexions, verrouillages, paiements, accès console…).
//
// Principes :
//  • le journal ne doit JAMAIS faire échouer une route : audit() avale ses
//    erreurs (console.warn "[kene:audit]") et renvoie une promesse qui ne
//    rejette pas — l'appelant peut `void audit(...)` en fire-and-forget ;
//  • `phone` est TOUJOURS masqué avant stockage (defense in depth : le
//    masquage vit ICI, dans audit(), pas chez l'appelant) — jamais de
//    numéro complet en base ;
//  • `kind`/`detail` tronqués (64/180) — pas de data client volumineuse ;
//  • prune paresseux (> 90 j) au plus toutes les 30 min, via un compteur
//    globalThis (pattern du rate-limit : survit au HMR, zéro timer).
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

// ─────────────── Événement ───────────────

export type AuditEvent = {
  kind: string;
  phone?: string; // BRUT côté appelant — masqué ici avant stockage
  userId?: string;
  ip?: string;
  detail?: string; // court, sans secret
};

const KIND_MAX = 64;
const DETAIL_MAX = 180;
const PRUNE_EVERY_MS = 30 * 60_000; // au plus une passe de prune / 30 min
const RETENTION_MS = 90 * 24 * 3_600_000; // journal léger : 90 jours

const g = globalThis as typeof globalThis & { __keneAuditLastPrune?: number };

/** Écrit un événement dans le journal. Fire-and-forget friendly :
 *  `void audit({ kind: "login_success", ... })`. Échecs avalés (warn). */
export async function audit(evt: AuditEvent): Promise<void> {
  try {
    maybePrune();
    await db.securityEvent.create({
      data: {
        kind: (evt.kind || "unknown").slice(0, KIND_MAX),
        phone: evt.phone ? maskPhone(evt.phone) : null,
        userId: evt.userId ? evt.userId.slice(0, KIND_MAX) : null,
        ip: evt.ip ? evt.ip.slice(0, KIND_MAX) : null,
        detail: evt.detail ? evt.detail.slice(0, DETAIL_MAX) : null,
      },
    });
  } catch (err) {
    console.warn("[kene:audit] écriture impossible :", err instanceof Error ? err.message : err);
  }
}

/** Prune paresseux : si 30 min se sont écoulées depuis la dernière passe,
 *  supprime (en tâche de fond, jamais bloquante) les événements de + 90 j. */
function maybePrune(): void {
  const now = Date.now();
  if (now - (g.__keneAuditLastPrune ?? 0) < PRUNE_EVERY_MS) return;
  g.__keneAuditLastPrune = now;
  void db.securityEvent
    .deleteMany({ where: { ts: { lt: new Date(now - RETENTION_MS) } } })
    .catch(() => undefined);
}

// ─────────────── Anonymisation ───────────────

/** Masque un téléphone : garde pays + 2 chiffres, milieu en •, 2 derniers.
 *  « +2250701020304 » → « +225 07•••••04 » — 5 pastilles fixes, la longueur
 *  réelle du numéro n'est jamais révélée. Trop court → tout masqué. */
export function maskPhone(phone: string): string {
  const clean = phone.replace(/[\s.\-()]/g, "").trim();
  if (clean.length < 6) return "•••••";
  let country = "";
  let rest = clean;
  if (clean.startsWith("+")) {
    // Kènè opère en CI (+225) / SN (+221) — pays à 3 chiffres
    country = clean.slice(0, 4);
    rest = clean.slice(4);
  }
  if (rest.length < 5) return `${country ? country + " " : ""}•••••`;
  return `${country ? country + " " : ""}${rest.slice(0, 2)}•••••${rest.slice(-2)}`;
}

// ─────────────── Réseau ───────────────

/** IP cliente : x-forwarded-for (première IP, derrière le gateway Caddy)
 *  sinon x-real-ip sinon "local" (accès direct :3000) — même logique que
 *  rlKey, sans préfixe de scope. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")?.trim()) || "local";
}

// ─────────────── Hachage OTP (durcissement t. 86-d) ───────────────

/** sha256 hex — utilisée par otp/request (stockage du code haché) et
 *  otp/verify (hash du code soumis avant comparaison). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Comparaison à temps constant de DEUX hashes sha256 hex (64 chars chacun →
 *  buffers de même longueur). Longueurs inégales/vides → false sans lever.
 *  Comparer hash-à-hash, JAMAIS hash-à-clair. */
export function hashEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
