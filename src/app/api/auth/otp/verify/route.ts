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
import { jsonError, serverError, genRef, notify, resolveUserProContext, phoneSuffix } from "@/lib/kene/server";
import { setSessionCookie, sanitizeUser } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, OTP_VERIFY } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { audit, clientIp, sha256Hex, hashEqual } from "@/lib/kene/audit";
import { hashPin } from "@/lib/kene/pin";
import { grantClientWelcomeTrial, grantProWelcomeTrial } from "@/lib/kene/plans";
import { checkBotGuard } from "@/lib/kene/bot-guard";
import { getDefaultCabinetTenant } from "@/lib/kene/tenant-defaults";

const Body = z.object({
  phone: z.string().min(5),
  code: z.string().length(6),
  name: z.string().trim().min(1).optional(),
  pin: z.string().min(4).max(6).optional(),
  context: z.enum(["app", "console"]).optional(),
  _kene_bot_trap: z.string().optional(),
  _kene_ts: z.number().optional(),
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
    const raw = await req.json().catch(() => null);
    const botCheck = await checkBotGuard(req, raw);
    if (!botCheck.ok && botCheck.response) return botCheck.response;

    const parsed = Body.safeParse(raw);
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
  const { code, name, pin } = data;
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
  const pSuffix = phoneSuffix(phone);
  const allTenants = await db.tenant.findMany({ select: { id: true, name: true, active: true, suspendedReason: true, ownerPhone: true } });
  const ownerTenantByPhone =
    allTenants.find((t) => t.ownerPhone === phone || (pSuffix.length >= 8 && phoneSuffix(t.ownerPhone) === pSuffix)) ?? null;

  let user = await db.user.findUnique({ where: { phone } });

  const willBeAdmin = (user?.role ?? "client") === "admin";
  if (data.context === "console") {
    if (!willBeAdmin) {
      void audit({ kind: "login_failed", phone, ip, detail: "lien console — compte non admin" });
      return jsonError("Ce lien ouvre la Console Kènè — ton compte vit dans l'app Kènè", 403);
    }
  }

  if (!user) {
    const isPro = Boolean(ownerTenantByPhone);
    const defaultTenant = !isPro ? await getDefaultCabinetTenant() : null;
    user = await db.user.create({
      data: {
        phone,
        name: name || "Nouvelle cliente",
        role: isPro ? "pro" : "client",
        referralCode: genRef("KENE"),
        pinHash: pin ? hashPin(pin) : null,
        selectedTenantId: defaultTenant?.id ?? null,
      },
    });
    if (user.role === "client") {
      await grantClientWelcomeTrial(user.id).catch(() => null);
    } else if (user.role === "pro") {
      await grantProWelcomeTrial(user.id, ownerTenantByPhone?.id).catch(() => null);
    }
  }

  const proCtx = await resolveUserProContext(user);
  const ownerTenant = proCtx.ownerTenant;
  const employeeLink = proCtx.employeeLink;
  const employeeRole = proCtx.employeeRole;
  const employeePermissions = proCtx.employeePermissions;

  {
    const updateData: { name?: string; role?: string; pinHash?: string; pinFails?: number; pinLockedUntil?: null } = {};
    if (name && (!user.name || user.name === "Nouvelle cliente")) {
      updateData.name = name;
    }
    if ((ownerTenant || employeeLink) && user.role !== "pro" && user.role !== "admin") {
      updateData.role = "pro";
    } else if (!ownerTenant && !employeeLink && user.role === "pro") {
      updateData.role = "client";
    }
    if (pin) {
      updateData.pinHash = hashPin(pin);
      updateData.pinFails = 0;
      updateData.pinLockedUntil = null;
    }
    if (Object.keys(updateData).length > 0) {
      user = await db.user.update({ where: { id: user.id }, data: updateData });
    }
  }

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

  if (user.role === "admin") {
    const when = new Date().toLocaleString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    void notify({
      userId: user.id,
      channel: "console",
      toPhone: user.phone,
      message: `🔐 Connexion console confirmée — ${when} · IP ${ip}`,
    });
  }

  const employeeName = proCtx.employeeName ?? (employeeLink ? employeeLink.name : null);

  const response = NextResponse.json({
    user: {
      ...sanitizeUser(user),
      name: employeeName ?? user.name,
      employeeRole,
      employeePermissions,
      employeeName,
    },
    hasPin: Boolean(user.pinHash),
    tenant: ownerTenant
      ? { id: ownerTenant.id, name: ownerTenant.name }
      : employeeLink
        ? { id: employeeLink.tenant.id, name: employeeLink.tenant.name }
        : null,
    employeeRole,
    employeePermissions,
    employeeName,
  });
  setSessionCookie(response, user);
  return response;
}
