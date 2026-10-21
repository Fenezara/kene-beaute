// Kènè — Journal d'audit sécurité: traçabilité des événements
// sensibles (OTP, connexions, verrouillages, paiements, accès console…).
//
// Principes:
// • le journal ne doit JAMAIS faire échouer une route: audit avale ses
// erreurs (console.warn "[kene:audit]") et renvoie une promesse qui ne
// rejette pas — l'appelant peut `void audit(...)` en fire-and-forget;
// • `phone` est TOUJOURS masqué avant stockage (defense in depth: le
// masquage vit ICI, dans audit, pas chez l'appelant) — jamais de
// numéro complet en base;
// • `kind`/`detail` tronqués (64/180) — pas de data client volumineuse;
// • prune paresseux (> 90 j) au plus toutes les 30 min, via un compteur
// globalThis (pattern du rate-limit: survit au HMR, zéro timer).
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
const RETENTION_MS = 90 * 24 * 3_600_000; // journal léger: 90 jours

const g = globalThis as typeof globalThis & { __keneAuditLastPrune?: number };

/** Écrit un événement dans le journal. Fire-and-forget friendly:
 * `void audit({ kind: "login_success",... })`. Échecs avalés (warn). */
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

/** Prune paresseux: si 30 min se sont écoulées depuis la dernière passe,
 * supprime (en tâche de fond, jamais bloquante) les événements de + 90 j. */
function maybePrune(): void {
  const now = Date.now();
  if (now - (g.__keneAuditLastPrune ?? 0) < PRUNE_EVERY_MS) return;
  g.__keneAuditLastPrune = now;
  void db.securityEvent
    .deleteMany({ where: { ts: { lt: new Date(now - RETENTION_MS) } } })
    .catch(() => undefined);
}

// ─────────────── Anonymisation ───────────────

/** Masque un téléphone: garde pays + 2 chiffres de l'opérateur, milieu en •, 2 derniers.
 * « +2250701020304 » → « +225 07•••••04 » — 5 pastilles fixes, la longueur
 * réelle du numéro n'est jamais révélée. Trop court → tout masqué. */
export function maskPhone(phone: string): string {
  const clean = phone.replace(/[\s.\-()]/g, "").trim();
  if (clean.length < 6) return "•••••";
  let country = "";
  let rest = clean;
  if (clean.startsWith("+225") || clean.startsWith("225")) {
    country = "+225";
    rest = clean.replace(/^\+?225/, "");
  } else if (clean.startsWith("+221") || clean.startsWith("221")) {
    country = "+221";
    rest = clean.replace(/^\+?221/, "");
  } else if (clean.startsWith("+")) {
    country = clean.slice(0, 4);
    rest = clean.slice(4);
  } else if (/^0[157]\d{8}$/.test(clean)) {
    country = "+225";
    rest = clean;
  }
  if (rest.length < 4) return `${country ? country + " " : ""}•••••`;
  return `${country ? country + " " : ""}${rest.slice(0, 2)}•••••${rest.slice(-2)}`;
}

// ─────────────── Réseau ───────────────

/** IP cliente: x-forwarded-for (première IP, derrière le gateway Caddy)
 * sinon x-real-ip sinon "local" (accès direct:3000) — même logique que
 * rlKey, sans préfixe de scope. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")?.trim()) || "local";
}

// ─────────────── Hachage OTP (durcissement) ───────────────

/** sha256 hex — utilisée par otp/request (stockage du code haché) et
 * otp/verify (hash du code soumis avant comparaison). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Comparaison à temps constant de DEUX hashes sha256 hex (64 chars chacun →
 * buffers de même longueur). Longueurs inégales/vides → false sans lever.
 * Comparer hash-à-hash, JAMAIS hash-à-clair. */
export function hashEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─────────────── BOUCLIER 5 : DÉTECTION DE VITESSE / IMPOSSIBLE TRAVEL ───────────────

/**
 * Détecte les anomalies de déplacement impossible (Impossible Travel / Velocity Check).
 * Si une connexion survient depuis un pays ou un réseau distant dans un délai physiquement
 * impossible (< 60 min entre deux pays différents), un événement de haute sévérité est consigné.
 */
export async function checkImpossibleTravel(opts: {
  userId: string;
  phone: string;
  currentIp: string;
  currentCountry?: string | null;
}): Promise<{ anomaly: boolean; detail?: string }> {
  try {
    const lastLogin = await db.securityEvent.findFirst({
      where: {
        userId: opts.userId,
        kind: "login_success",
      },
      orderBy: { ts: "desc" },
    });

    if (!lastLogin || !lastLogin.ip) return { anomaly: false };

    const diffMinutes = (Date.now() - lastLogin.ts.getTime()) / (60 * 1000);

    // Au-delà de 4 heures, le déplacement physique entre pays est plausible
    if (diffMinutes > 240) return { anomaly: false };

    // Comparaison des pays géolocalisés (headers Edge/CDN)
    const prevCountryMatch = lastLogin.detail?.match(/\[GEO:([A-Z]{2})\]/);
    const prevCountry = prevCountryMatch ? prevCountryMatch[1] : null;

    if (opts.currentCountry && prevCountry && opts.currentCountry !== prevCountry) {
      if (diffMinutes < 60) {
        const detail = `Saut géographique impossible: ${prevCountry} -> ${opts.currentCountry} en ${Math.round(diffMinutes)} min`;
        await audit({
          kind: "impossible_travel",
          userId: opts.userId,
          phone: opts.phone,
          ip: opts.currentIp,
          detail,
        });
        return { anomaly: true, detail };
      }
    }

    // Comparaison des sous-réseaux IP en rafale (< 3 minutes)
    if (lastLogin.ip !== opts.currentIp && lastLogin.ip !== "local" && opts.currentIp !== "local") {
      const prevSubnet = lastLogin.ip.split(".").slice(0, 2).join(".");
      const currSubnet = opts.currentIp.split(".").slice(0, 2).join(".");
      if (prevSubnet && currSubnet && prevSubnet !== currSubnet && diffMinutes < 3) {
        const detail = `Changement d'IP distant suspect: ${lastLogin.ip} -> ${opts.currentIp} en ${Math.round(diffMinutes)} min`;
        await audit({
          kind: "velocity_anomaly",
          userId: opts.userId,
          phone: opts.phone,
          ip: opts.currentIp,
          detail,
        });
        return { anomaly: true, detail };
      }
    }

    return { anomaly: false };
  } catch {
    return { anomaly: false };
  }
}

