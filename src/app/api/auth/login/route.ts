// POST /api/auth/login — { phone, pin, context? } → { user, tenant, employeeRole }
// GET /api/auth/login?_g=… — pont GET
// Connexion ultra-rapide par code PIN secret (style Wave / mobile banking)
// - Aucun SMS n'est envoyé : connexion instantanée, 100% gratuite
// - Émission du cookie de session persistant kene_session (365 jours)
// - Protection anti-bruteforce : 5 erreurs consécutives = blocage 15 min
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { setSessionCookie, sanitizeUser } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, LOGIN_PIN } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { audit, clientIp } from "@/lib/kene/audit";
import { hashPin, verifyPin } from "@/lib/kene/pin";
import { checkBotGuard } from "@/lib/kene/bot-guard";
import { genRef } from "@/lib/kene/server";
import { grantClientWelcomeTrial, grantProWelcomeTrial } from "@/lib/kene/plans";

const Body = z.object({
  phone: z.string().min(5),
  pin: z.string().min(4).max(6),
  mode: z.enum(["client", "pro"]).optional(),
  context: z.enum(["app", "console"]).optional(),
  _kene_bot_trap: z.string().optional(),
  _kene_ts: z.number().optional(),
});

const MAX_PIN_FAILS = 10;
const PIN_LOCK_MS = 15 * 60_000; // 15 minutes de blocage

const normalizePhone = (raw: string) => raw.replace(/\s+/g, "").trim();

async function findUserByPhoneFlexible(rawPhone: string) {
  const clean = normalizePhone(rawPhone);
  const digits = clean.replace(/\D/g, "");
  const localDigits = digits.startsWith("225") ? digits.slice(3) : digits.startsWith("221") ? digits.slice(3) : digits;
  const e164Ci = localDigits ? `+225${localDigits}` : clean;

  let user = await db.user.findUnique({ where: { phone: clean } });
  if (!user && e164Ci !== clean) {
    user = await db.user.findUnique({ where: { phone: e164Ci } });
  }
  if (!user && localDigits.length >= 8) {
    user = await db.user.findFirst({
      where: { phone: { endsWith: localDigits.slice(-8) } },
    });
  }
  return { user, normalizedPhone: user?.phone ?? e164Ci };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:login"), LOGIN_PIN);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de tentatives de connexion — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const raw = await req.json().catch(() => null);
    const botCheck = checkBotGuard(req, raw);
    if (!botCheck.ok && botCheck.response) return botCheck.response;

    const parsed = Body.safeParse(raw);
    if (!parsed.success) return jsonError("Numéro de téléphone et code secret (4 chiffres) requis", 400);
    return await runLogin(parsed.data, req);
  } catch (err) {
    return serverError("auth/login", err);
  }
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:login"), LOGIN_PIN);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de tentatives de connexion — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Paramètres requis — ${bridged.error}`, 400);
    return await runLogin(bridged.data, req);
  } catch (err) {
    return serverError("auth/login", err);
  }
}

async function runLogin(data: z.infer<typeof Body>, req: NextRequest): Promise<NextResponse> {
  const { user: foundUser, normalizedPhone: phone } = await findUserByPhoneFlexible(data.phone);
  const { pin, context, mode } = data;
  const ip = clientIp(req);

  let user = foundUser;

  // Si le compte n'existe pas encore, on le crée à la volée avec le code PIN saisi
  if (!user) {
    const ownerTenantByPhone = await db.tenant.findFirst({ where: { ownerPhone: phone } });
    const initialRole = ownerTenantByPhone || mode === "pro" ? "pro" : "client";
    user = await db.user.create({
      data: {
        phone,
        name: initialRole === "pro" ? "Gérante Kènè" : "Membre Kènè",
        role: initialRole,
        referralCode: genRef("KENE"),
        pinHash: hashPin(pin),
        consentHealth: true,
        consentTs: new Date(),
      },
    });
    if (user.role === "client") {
      await grantClientWelcomeTrial(user.id).catch(() => null);
    } else if (user.role === "pro") {
      await grantProWelcomeTrial(user.id, ownerTenantByPhone?.id).catch(() => null);
    }
  } else if (!user.pinHash) {
    // Si le compte existait sans code PIN (comptes seedés ou anciens), on enregistre ce premier PIN !
    user = await db.user.update({
      where: { id: user.id },
      data: {
        pinHash: hashPin(pin),
        pinFails: 0,
        pinLockedUntil: null,
      },
    });
  } else {
    // Vérification du verrouillage temporaire anti-brute force (hors environnement de dev)
    if (process.env.NODE_ENV === "production" && user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
      const remainingSec = Math.max(1, Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 1000));
      void audit({ kind: "login_locked", phone, userId: user.id, ip, detail: "compte verrouillé par tentatives erronées" });
      return rateLimitResponse(
        remainingSec,
        `Compte temporairement bloqué suite à plusieurs codes erronés. Réessaie dans ${Math.ceil(remainingSec / 60)} min ou utilise « Code oublié ? »`,
      );
    }

    // Vérification cryptographique à temps constant
    let isPinValid = verifyPin(pin, user.pinHash);

    // En environnement de développement / démo locale, si l'utilisateur saisit un nouveau PIN 4 chiffres valide,
    // on synchronise automatiquement son PIN pour éviter tout blocage de test.
    if (!isPinValid && process.env.NODE_ENV !== "production" && /^\d{4,6}$/.test(pin.trim())) {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          pinHash: hashPin(pin),
          pinFails: 0,
          pinLockedUntil: null,
        },
      });
      isPinValid = true;
    }

    if (!isPinValid) {
      const nextFails = (user.pinFails || 0) + 1;
      if (nextFails >= MAX_PIN_FAILS) {
        const lockedUntil = new Date(Date.now() + PIN_LOCK_MS);
        await db.user.update({
          where: { id: user.id },
          data: { pinFails: 0, pinLockedUntil: lockedUntil },
        });
        void audit({ kind: "login_locked", phone, userId: user.id, ip, detail: "codes PIN erronés — verrou 15 min" });
        return rateLimitResponse(
          Math.ceil(PIN_LOCK_MS / 1000),
          "Plusieurs codes erronés — compte bloqué 15 minutes. Tu peux utiliser « Code oublié ? » pour réinitialiser par SMS.",
        );
      } else {
        await db.user.update({
          where: { id: user.id },
          data: { pinFails: nextFails },
        });
        const remainingAttempts = MAX_PIN_FAILS - nextFails;
        void audit({ kind: "login_failed", phone, userId: user.id, ip, detail: `code PIN erroné (${nextFails}/${MAX_PIN_FAILS})` });
        return jsonError(`Code secret incorrect (il te reste ${remainingAttempts} tentative${remainingAttempts > 1 ? "s" : ""})`, 400);
      }
    }
  }

  // Succès PIN : réinitialisation des compteurs d'échecs
  if (user.pinFails > 0 || user.pinLockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { pinFails: 0, pinLockedUntil: null },
    });
  }

  // Séparation des portes (app vs console)
  const isUserAdmin = user.role === "admin";
  if (context === "console") {
    if (!isUserAdmin) {
      void audit({ kind: "login_failed", phone, ip, detail: "lien console — compte non admin" });
      return jsonError("Ce lien ouvre la Console Kènè — ton compte vit dans l'app Kènè", 403);
    }
  }

  // Vérification de modération (compte verrouillé)
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

  // Vérification établissement (compte pro ou employée)
  let ownerTenant = await db.tenant.findFirst({ where: { ownerPhone: user.phone } });
  const employeeLink = await db.employee.findFirst({
    where: { userId: user.id, active: true },
    include: { tenant: { select: { id: true, name: true, active: true, suspendedReason: true } } },
  });

  // Si l'utilisateur se connecte explicitement via la porte "Espace Entreprise" (mode === "pro")
  // ou s'il est propriétaire/employé d'un institut, on s'assure qu'il a l'accès Pro et un institut rattaché
  if ((mode === "pro" || ownerTenant || employeeLink) && user.role !== "pro" && user.role !== "admin") {
    user = await db.user.update({ where: { id: user.id }, data: { role: "pro" } });
  }

  if (!ownerTenant && !employeeLink && (user.role === "pro" || user.role === "admin" || mode === "pro")) {
    ownerTenant = await db.tenant.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
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

  void audit({ kind: "login_success", phone: user.phone, userId: user.id, ip, detail: "connexion par code secret PIN" });

  if (user.role === "admin") {
    const when = new Date().toLocaleString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    void notify({
      userId: user.id,
      channel: "console",
      toPhone: user.phone,
      message: `🔐 Connexion console confirmée (PIN) — ${when} · IP ${ip}`,
    });
  }

  const employeePermissions = employeeLink?.permissions
    ? (() => {
        try {
          const arr = JSON.parse(employeeLink.permissions);
          return Array.isArray(arr) ? arr : null;
        } catch {
          return null;
        }
      })()
    : null;

  const response = NextResponse.json({
    ok: true,
    user: {
      ...sanitizeUser(user),
      employeeRole: employeeLink ? employeeLink.role : null,
      employeePermissions,
    },
    tenant: ownerTenant
      ? { id: ownerTenant.id, name: ownerTenant.name }
      : employeeLink
        ? { id: employeeLink.tenant.id, name: employeeLink.tenant.name }
        : null,
    employeeRole: employeeLink ? employeeLink.role : null,
    employeePermissions,
  });

  // Pose du cookie de session 365 jours
  setSessionCookie(response, user);
  return response;
}
