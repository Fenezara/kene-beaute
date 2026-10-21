// POST /api/auth/check-phone — { phone } → vérifie l'existence d'un compte et s'il a un code PIN
// GET /api/auth/check-phone?_g=… — pont GET
// Permet d'aiguiller instantanément l'utilisatrice :
// - Si hasPin: true → pavé PIN (connexion instantanée style Wave sans SMS)
// - Si hasPin: false / compte absent → SMS OTP (création de compte ou initialisation du code PIN)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveUserProContext, phoneSuffix } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { maskPhone } from "@/lib/kene/audit";

const Body = z.object({
  phone: z.string().min(5),
});

const normalizePhone = (raw: string) => raw.replace(/\s+/g, "").trim();

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:check-phone"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Numéro de téléphone requis", 400);
    return await runCheck(parsed.data);
  } catch (err) {
    return serverError("auth/check-phone", err);
  }
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:check-phone"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans quelques secondes");
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Numéro de téléphone requis — ${bridged.error}`, 400);
    return await runCheck(bridged.data);
  } catch (err) {
    return serverError("auth/check-phone", err);
  }
}

async function findUserFlexible(rawPhone: string) {
  const clean = normalizePhone(rawPhone);
  const digits = clean.replace(/\D/g, "");
  const localDigits = digits.startsWith("225") ? digits.slice(3) : digits.startsWith("221") ? digits.slice(3) : digits;
  const e164Ci = localDigits ? `+225${localDigits}` : clean;

  let user = await db.user.findUnique({
    where: { phone: clean },
    select: {
      id: true,
      phone: true,
      name: true,
      role: true,
      pinHash: true,
      pinLockedUntil: true,
      lockedAt: true,
    },
  });

  if (!user && e164Ci !== clean) {
    user = await db.user.findUnique({
      where: { phone: e164Ci },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        pinHash: true,
        pinLockedUntil: true,
        lockedAt: true,
      },
    });
  }

  if (!user && localDigits.length >= 8) {
    user = await db.user.findFirst({
      where: { phone: { endsWith: localDigits.slice(-8) } },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        pinHash: true,
        pinLockedUntil: true,
        lockedAt: true,
      },
    });
  }

  return { user, normalizedPhone: user?.phone ?? e164Ci };
}

async function runCheck(data: z.infer<typeof Body>): Promise<NextResponse> {
  const { user, normalizedPhone: phone } = await findUserFlexible(data.phone);

  if (!user) {
    const pSuffix = phoneSuffix(phone);
    const allTenants = await db.tenant.findMany({ where: { active: true }, select: { id: true, name: true, ownerPhone: true } });
    const ownerTenant =
      allTenants.find((t) => t.ownerPhone === phone || (pSuffix.length >= 8 && phoneSuffix(t.ownerPhone) === pSuffix)) ?? null;
    return NextResponse.json({
      ok: true,
      exists: false,
      hasPin: true,
      needsPinSetup: true,
      role: ownerTenant ? "pro" : "client",
      tenant: ownerTenant ? { id: ownerTenant.id, name: ownerTenant.name } : null,
      maskedPhone: maskPhone(phone),
    });
  }

  const proCtx = await resolveUserProContext(user);
  const employeeLink = proCtx.employeeLink;
  const ownerTenant = proCtx.ownerTenant;
  const employeeRole = proCtx.employeeRole;
  const employeePermissions = proCtx.employeePermissions;

  // Auto-promotion en rôle 'pro' si rattaché à une fiche employée ou propriétaire
  if ((employeeLink || ownerTenant) && user.role !== "pro" && user.role !== "admin") {
    await db.user.update({ where: { id: user.id }, data: { role: "pro" } });
    user.role = "pro";
  } else if (!employeeLink && !ownerTenant && user.role === "pro") {
    await db.user.update({ where: { id: user.id }, data: { role: "client" } });
    user.role = "client";
  }

  const effectiveRole = user.role === "admin" ? "admin" : (ownerTenant || employeeLink) ? "pro" : "client";

  // Vérifier si le compte est temporairement bloqué suite à des erreurs de PIN
  const isPinLocked = Boolean(user.pinLockedUntil && user.pinLockedUntil > new Date());

  return NextResponse.json({
    ok: true,
    exists: true,
    hasPin: true,
    needsPinSetup: !user.pinHash,
    isPinLocked,
    isAccountLocked: Boolean(user.lockedAt),
    name: (employeeLink?.name) || (user.name && user.name !== "Nouvelle cliente" && !user.name.startsWith("Membre ") ? user.name : undefined),
    role: effectiveRole,
    isEmployee: Boolean(employeeLink),
    employeeRole,
    employeePermissions,
    employeeName: employeeLink?.name ?? null,
    tenant: ownerTenant ? { id: ownerTenant.id, name: ownerTenant.name } : (employeeLink?.tenant ? { id: employeeLink.tenant.id, name: employeeLink.tenant.name } : null),
    maskedPhone: maskPhone(user.phone),
  });
}
