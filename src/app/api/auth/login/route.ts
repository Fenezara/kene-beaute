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
import { verifyPin } from "@/lib/kene/pin";

const Body = z.object({
  phone: z.string().min(5),
  pin: z.string().min(4).max(6),
  context: z.enum(["app", "console"]).optional(),
});

const MAX_PIN_FAILS = 5;
const PIN_LOCK_MS = 15 * 60_000; // 15 minutes de blocage

const normalizePhone = (raw: string) => raw.replace(/\s+/g, "").trim();

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:login"), LOGIN_PIN);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de tentatives de connexion — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
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
  const phone = normalizePhone(data.phone);
  const { pin, context } = data;
  const ip = clientIp(req);

  const user = await db.user.findUnique({
    where: { phone },
  });

  if (!user) {
    void audit({ kind: "login_failed", phone, ip, detail: "compte inexistant" });
    return jsonError("Numéro ou code secret incorrect", 400);
  }

  if (!user.pinHash) {
    void audit({ kind: "login_failed", phone, ip, detail: "aucun code secret configuré" });
    return jsonError("Aucun code secret configuré sur ce compte. Connecte-toi via SMS pour en créer un.", 400);
  }

  // Vérification du verrouillage temporaire anti-brute force
  if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
    const remainingSec = Math.max(1, Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 1000));
    void audit({ kind: "login_locked", phone, userId: user.id, ip, detail: "compte verrouillé par tentatives erronées" });
    return rateLimitResponse(
      remainingSec,
      `Compte temporairement bloqué suite à plusieurs codes erronés. Réessaie dans ${Math.ceil(remainingSec / 60)} min ou utilise « Code oublié ? »`,
    );
  }

  // Vérification cryptographique à temps constant
  const isPinValid = verifyPin(pin, user.pinHash);

  if (!isPinValid) {
    const nextFails = (user.pinFails || 0) + 1;
    if (nextFails >= MAX_PIN_FAILS) {
      const lockedUntil = new Date(Date.now() + PIN_LOCK_MS);
      await db.user.update({
        where: { id: user.id },
        data: { pinFails: 0, pinLockedUntil: lockedUntil },
      });
      void audit({ kind: "login_locked", phone, userId: user.id, ip, detail: "5 codes PIN erronés — verrou 15 min" });
      return rateLimitResponse(
        Math.ceil(PIN_LOCK_MS / 1000),
        "5 codes erronés — compte bloqué 15 minutes. Tu peux utiliser « Code oublié ? » pour réinitialiser par SMS.",
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
  const ownerTenant = await db.tenant.findFirst({ where: { ownerPhone: phone } });
  const employeeLink = await db.employee.findFirst({
    where: { userId: user.id, active: true },
    include: { tenant: { select: { id: true, name: true, active: true, suspendedReason: true } } },
  });

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

  void audit({ kind: "login_success", phone, userId: user.id, ip, detail: "connexion par code secret PIN" });

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

  const response = NextResponse.json({
    ok: true,
    user: sanitizeUser(user),
    tenant: ownerTenant
      ? { id: ownerTenant.id, name: ownerTenant.name }
      : employeeLink
        ? { id: employeeLink.tenant.id, name: employeeLink.tenant.name }
        : null,
    employeeRole: employeeLink ? employeeLink.role : null,
  });

  // Pose du cookie de session 365 jours
  setSessionCookie(response, user);
  return response;
}
