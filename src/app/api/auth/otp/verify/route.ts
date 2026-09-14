// POST /api/auth/otp/verify — {phone, code, name?} → { user }
// GET /api/auth/otp/verify?_g=… — pont (même payload JSON en query)
// Durcissement:
// • le code soumis est haché (sha256) puis comparé au hash stocké via
// timingSafeEqual — jamais de comparaison de clair, jamais d'oracle de
// timing (les codes créés avant ce sprint, en clair en base, restent
// vérifiables: hashés à la volée avant la même comparaison constante);
// • compteur d'échecs par téléphone (Map globalThis, comme le rate-limit):
// 5 échecs → verrouillage 15 min de CE numéro (429 FR clair) + événement
// login_locked; le succès remet le compteur à zéro;
// • chaque issue est journalisée (login_success / login_failed / login_locked).
// Le format des réponses succès (payload user + cookie signé posé par
// setSessionCookie) reste STRICTEMENT identique.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef } from "@/lib/kene/server";
import { setSessionCookie } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, OTP_VERIFY } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { audit, clientIp, sha256Hex, hashEqual } from "@/lib/kene/audit";

const Body = z.object({
  phone: z.string().min(5),
  code: z.string().length(6),
  name: z.string().trim().min(1).optional(),
});

// ─────────────── Verrouillage par numéro (5 échecs → 15 min) ───────────────
// État sur globalThis: survit aux rechargements de modules en dev (HMR
// Turbopack) et reste un singleton même si la route est bundlée plusieurs
// fois. Purge paresseuse à la lecture — zéro timer, zéro fuite.
const OTP_MAX_FAILS = 5;
const OTP_LOCK_MS = 15 * 60_000;

type OtpFailEntry = { fails: number; lockedUntil: number; lastFail: number };
const gLock = globalThis as typeof globalThis & { __keneOtpFails?: Map<string, OtpFailEntry> };
const otpFails: Map<string, OtpFailEntry> = (gLock.__keneOtpFails ??= new Map());

/** Verrou actif sur ce numéro? Purge paresseuse: compteur inactif depuis
 * 15 min ou verrou expiré → l'entrée sort de la Map (retour à zéro propre). */
function phoneLocked(phone: string): number {
  const entry = otpFails.get(phone);
  if (!entry) return 0;
  // `lastFail?? 0`: une entrée héritée d'un module antérieur (champ absent
  // après HMR) est traitée comme périmée — purge nette, retour à zéro.
  if (Date.now() - (entry.lastFail ?? 0) > OTP_LOCK_MS) {
    otpFails.delete(phone);
    return 0;
  }
  return entry.lockedUntil > Date.now() ? entry.lockedUntil : 0;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "otp:verify"), OTP_VERIFY);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de tentatives de code — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("phone et code (6 chiffres) requis", 400);
    return await runVerify(parsed.data, req);
  } catch (err) {
    return serverError("otp/verify", err);
  }
}

// Pont GET — voir src/lib/kene/get-bridge.ts: certaines préviews
// bloqueuses laissent passer les GET mais jamais les POST (login impossible
// chez l'utilisatrice). MÊMES garde-fous que le POST (rate-limit, verrouillage
// par numéro, audit, cookie de session posé sur la réponse).
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "otp:verify"), OTP_VERIFY);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de tentatives de code — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`phone et code (6 chiffres) requis — ${bridged.error}`, 400);
    return await runVerify(bridged.data, req);
  } catch (err) {
    return serverError("otp/verify", err);
  }
}

/** Cœur partagé POST/GET. */
async function runVerify(data: z.infer<typeof Body>, req: NextRequest): Promise<NextResponse> {
  const phone = data.phone.replace(/\s+/g, "").trim();
  const { code, name } = data;
  const ip = clientIp(req);

  // Verrouillage: numéro bloqué par ses 5 échecs → 429 direct
  const lockedUntil = phoneLocked(phone);
  if (lockedUntil > 0) {
    return rateLimitResponse(
      Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)),
      "Trop de tentatives — réessaie dans quelques minutes",
    );
  }

  const otp = await db.otpCode.findFirst({
    where: { phone, used: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  // Comparaison hash-à-hash, à temps constant. Un code stocké avant 
  // (en clair, 6 chiffres) est haché à la volée — même chemin, même timing.
  const submittedHash = sha256Hex(code);
  const storedHash = otp ? (/^[0-9a-f]{64}$/.test(otp.code) ? otp.code : sha256Hex(otp.code)) : null;

  if (!otp || !storedHash || !hashEqual(submittedHash, storedHash)) {
    const entry = otpFails.get(phone) ?? { fails: 0, lockedUntil: 0, lastFail: Date.now() };
    entry.fails += 1;
    entry.lastFail = Date.now();
    if (entry.fails >= OTP_MAX_FAILS) {
      entry.lockedUntil = entry.lastFail + OTP_LOCK_MS;
      entry.fails = 0; // après le verrou, 5 nouvelles chances
      otpFails.set(phone, entry);
      void audit({ kind: "login_locked", phone, ip, detail: "5 codes erronés — verrou 15 min" });
      return rateLimitResponse(
        Math.ceil(OTP_LOCK_MS / 1000),
        "Trop de tentatives — réessaie dans quelques minutes",
      );
    }
    otpFails.set(phone, entry);
    void audit({ kind: "login_failed", phone, ip, detail: otp ? "code invalide" : "code expiré ou absent" });
    return jsonError("Code invalide ou expiré", 400);
  }

  // Succès: compteur du numéro remis à zéro, code consommé
  otpFails.delete(phone);
  await db.otpCode.update({ where: { id: otp.id }, data: { used: true } });

  // Le téléphone d'une propriétaire d'institut → rôle pro
  const ownerTenant = await db.tenant.findFirst({ where: { ownerPhone: phone } });

  let user = await db.user.findUnique({ where: { phone } });
  // — EMPLOYÉE de l'app (compte créé par sa gérante via l'embauche):
  // sa fiche Employee liée donne l'institut de son EMPLOYEUR + son poste.
  const employeeLink = user
    ? await db.employee.findFirst({
        where: { userId: user.id, active: true },
        // t. 128 — active/suspendedReason servis à la garde modération
        // ci-dessous; la réponse JSON finale n'embarque QUE id/name.
        include: { tenant: { select: { id: true, name: true, active: true, suspendedReason: true } } },
      })
    : null;
  if (!user) {
    user = await db.user.create({
      data: {
        phone,
        name: name || "Nouvelle cliente",
        role: ownerTenant || employeeLink ? "pro" : "client",
        referralCode: genRef("KENE"),
      },
    });
  } else if (name && (!user.name || user.name === "Nouvelle cliente")) {
    user = await db.user.update({ where: { id: user.id }, data: { name } });
  } else if (employeeLink && user.role !== "pro") {
    // compte pré-existant (cliente) devenu employée: rôle pro
    user = await db.user.update({ where: { id: user.id }, data: { role: "pro" } });
  }

  // ── t. 128 — Modération Console Kènè (AVANT de poser le cookie) ──
  // 1) Compte VERROUILLÉ manuellement: connexion refusée, motif montré.
  //    (un compte créé au fil de l'eau ne peut pas être verrouillé: lockedAt
  //    n'existe que posé par la console — le if couvre donc les comptes
  //    existants uniquement, jamais une inscription fraîche.)
  if (user.lockedAt) {
    void audit({
      kind: "login_locked",
      phone,
      userId: user.id,
      ip,
      detail: `compte verrouillé par la Console${user.lockedReason ? ` — ${user.lockedReason}` : ""}`,
    });
    return jsonError(
      user.lockedReason
        ? `Compte verrouillé par la Console Kènè — ${user.lockedReason}`
        : "Compte verrouillé par la Console Kènè — contacte le support",
      403,
    );
  }
  // 2) Compte PRO d'un institut SUSPENDU (gérante ou employée): connexion
  //    refusée jusqu'à réactivation — une suspension ferme l'opération.
  //    L'admin, elle, n'est jamais concernée (aucun institut lui appartient).
  const employerTenant = ownerTenant ?? (employeeLink ? employeeLink.tenant : null);
  if (employerTenant && !employerTenant.active) {
    void audit({
      kind: "login_locked",
      phone,
      userId: user.id,
      ip,
      detail: `institut suspendu — ${employerTenant.name}`,
    });
    return jsonError(
      `${employerTenant.name} est suspendu${employerTenant.suspendedReason ? ` — ${employerTenant.suspendedReason}` : ""}. Contacte la Console Kènè.`,
      403,
    );
  }

  void audit({ kind: "login_success", phone, userId: user.id, ip });

  // Session signée: cookie httpOnly 90 j posé à la connexion —
  // le payload JSON reste STRICTEMENT identique (zéro casse SessionKeeper).
  // — incident « La Dermo ne passe pas »: la réponse embarque
  // `tenant { id, name }` pour une gérante (l'onboarding entre DIRECTEMENT
  // dans son espace avec le bon institut — plus de « premier tenant de la
  // base » sur le dashboard d'une autre). Additif: les fronts qui l'ignorent
  // ne changent pas de comportement.
  // — une EMPLOYÉE reçoit l'institut de son employeur + son poste
  // (`employeeRole`): le front ouvre l'espace Pro filtré sur ses sections.
  const response = NextResponse.json({
    user,
    tenant: ownerTenant
      ? { id: ownerTenant.id, name: ownerTenant.name }
      : employeeLink
        ? { id: employeeLink.tenant.id, name: employeeLink.tenant.name }
        : null,
    employeeRole: employeeLink ? employeeLink.role : null,
  });
  setSessionCookie(response, user);
  return response;
}
