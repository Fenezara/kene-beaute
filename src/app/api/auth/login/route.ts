// POST /api/auth/login — { phone, pin, context? } → { user, tenant, employeeRole }
// GET /api/auth/login?_g=… — pont GET
// Connexion ultra-rapide par code PIN secret (style Wave / mobile banking)
// - Aucun SMS n'est envoyé : connexion instantanée, 100% gratuite
// - Émission du cookie de session persistant kene_session (365 jours)
// - Protection anti-bruteforce : 5 erreurs consécutives = blocage 15 min
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify, resolveUserProContext, phoneSuffix } from "@/lib/kene/server";
import { setSessionCookie, sanitizeUser } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, LOGIN_PIN } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { audit, clientIp, checkImpossibleTravel } from "@/lib/kene/audit";
import { hashPin, verifyPin } from "@/lib/kene/pin";
import { checkBotGuard } from "@/lib/kene/bot-guard";
import { genRef } from "@/lib/kene/server";
import { grantClientWelcomeTrial, grantProWelcomeTrial } from "@/lib/kene/plans";
import { sanitizePayload } from "@/lib/kene/security-sanitize";

const Body = z.object({
  phone: z.string().min(5),
  pin: z.string().min(4).max(6),
  mode: z.enum(["client", "pro"]).optional(),
  context: z.enum(["app", "console"]).optional(),
  _kene_bot_trap: z.string().optional(),
  _kene_ts: z.number().optional(),
});

const MAX_PIN_FAILS = 5;
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
    const raw = sanitizePayload(await req.json().catch(() => null));
    const botCheck = await checkBotGuard(req, raw);
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
    const pSuffix = phoneSuffix(phone);
    const allTenants = await db.tenant.findMany({ select: { id: true, ownerPhone: true } });
    const ownerTenantByPhone =
      allTenants.find((t) => t.ownerPhone === phone || (pSuffix.length >= 8 && phoneSuffix(t.ownerPhone) === pSuffix)) ?? null;

    if (mode === "pro" && !ownerTenantByPhone) {
      return jsonError(
        "Aucun compte gérante ou collaboratrice n'est rattaché à ce numéro dans l'institut. Vérifie le numéro enregistré sur ta fiche Équipe.",
        403
      );
    }

    const initialRole = ownerTenantByPhone ? "pro" : "client";
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
        void audit({ kind: "login_locked", phone, userId: user.id, ip, detail: "5 codes PIN erronés — verrou 15 min" });

        // Alerte de sécurité immédiate (WhatsApp)
        void notify({
          userId: user.id,
          channel: "whatsapp",
          toPhone: user.phone,
          message: `⚠️ Alerte Sécurité Kènè : 5 tentatives de code secret erronées ont été détectées sur votre compte. Votre accès a été temporairement verrouillé pendant 15 minutes par mesure de protection.`,
        }).catch(() => null);

        return rateLimitResponse(
          Math.ceil(PIN_LOCK_MS / 1000),
          "Plusieurs codes erronés — compte bloqué 15 minutes par sécurité. Une notification d'alerte a été transmise à votre numéro. Tu peux utiliser « Code oublié ? » pour réinitialiser par SMS.",
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

  // Vérification stricte de l'établissement (propriétaire officielle vs employée)
  const proCtx = await resolveUserProContext(user);
  let ownerTenant = proCtx.ownerTenant;
  const employeeLink = proCtx.employeeLink;
  const employeeRole = proCtx.employeeRole;
  const employeePermissions = proCtx.employeePermissions;

  // Seuls le propriétaire officiel (ownerPhone) et les employées actives ont le rôle "pro"
  if ((ownerTenant || employeeLink) && user.role !== "pro" && user.role !== "admin") {
    user = await db.user.update({ where: { id: user.id }, data: { role: "pro" } });
  } else if (!ownerTenant && !employeeLink && user.role === "pro") {
    // Ancien compte pro non rattaché (ex. ancienne gérante remplacée ou numéro non lié) -> retour au rôle client
    user = await db.user.update({ where: { id: user.id }, data: { role: "client" } });
  }

  if (mode === "pro" && !ownerTenant && !employeeLink && user.role !== "admin") {
    return jsonError(
      "Aucun compte gérante ou collaboratrice n'est rattaché à ce numéro dans l'institut. Utilise le numéro enregistré sur ta fiche Équipe.",
      403
    );
  }

  if (!ownerTenant && !employeeLink && user.role === "admin") {
    const firstActive = await db.tenant.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, active: true, suspendedReason: true, ownerPhone: true, phone: true, city: true, country: true, plan: true, themeTier: true },
    });
    if (firstActive) ownerTenant = firstActive;
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

  const country =
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-country") ||
    req.headers.get("x-geoip-country") ||
    null;

  void checkImpossibleTravel({
    userId: user.id,
    phone: user.phone,
    currentIp: ip,
    currentCountry: country,
  }).then((check) => {
    if (check.anomaly) {
      void notify({
        userId: user.id,
        channel: "whatsapp",
        toPhone: user.phone,
        message: `🚨 Alerte Sécurité Kènè : Une connexion à votre compte a été détectée depuis un emplacement inhabituel (${check.detail}). Si vous n'êtes pas à l'origine de cette action, modifiez immédiatement votre code PIN.`,
      }).catch(() => null);
    }
  });

  const geoTag = country ? ` [GEO:${country.toUpperCase()}]` : "";
  void audit({
    kind: "login_success",
    phone: user.phone,
    userId: user.id,
    ip,
    detail: `connexion PIN (${user.role})${geoTag}`,
  });

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

  const employeeName = proCtx.employeeName ?? (employeeLink ? employeeLink.name : null);

  const response = NextResponse.json({
    ok: true,
    user: {
      ...sanitizeUser(user),
      name: employeeName ?? user.name,
      employeeRole,
      employeePermissions,
      employeeName,
      tenantThemeTier: employerTenant?.themeTier ?? null,
    },
    tenant: ownerTenant
      ? { id: ownerTenant.id, name: ownerTenant.name, themeTier: ownerTenant.themeTier }
      : employeeLink
        ? { id: employeeLink.tenant.id, name: employeeLink.tenant.name, themeTier: employeeLink.tenant.themeTier }
        : null,
    employeeRole,
    employeePermissions,
    employeeName,
  });

  // Pose du cookie de session 365 jours
  setSessionCookie(response, user);
  return response;
}
