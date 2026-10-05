// POST /api/auth/check-phone — { phone } → vérifie l'existence d'un compte et s'il a un code PIN
// GET /api/auth/check-phone?_g=… — pont GET
// Permet d'aiguiller instantanément l'utilisatrice :
// - Si hasPin: true → pavé PIN (connexion instantanée style Wave sans SMS)
// - Si hasPin: false / compte absent → SMS OTP (création de compte ou initialisation du code PIN)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
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

async function runCheck(data: z.infer<typeof Body>): Promise<NextResponse> {
  const phone = normalizePhone(data.phone);
  const user = await db.user.findUnique({
    where: { phone },
    select: {
      id: true,
      name: true,
      role: true,
      pinHash: true,
      pinLockedUntil: true,
      lockedAt: true,
    },
  });

  if (!user) {
    const ownerTenant = await db.tenant.findFirst({
      where: { ownerPhone: phone, active: true },
      select: { id: true, name: true },
    });
    return NextResponse.json({
      ok: true,
      exists: false,
      hasPin: false,
      role: ownerTenant ? "pro" : "client",
      tenant: ownerTenant ?? null,
      maskedPhone: maskPhone(phone),
    });
  }

  // Vérifier si ce compte est une employée active d'un institut
  const employeeLink = await db.employee.findFirst({
    where: { userId: user.id, active: true },
    include: { tenant: { select: { id: true, name: true, active: true } } },
  });

  const ownerTenant = await db.tenant.findFirst({
    where: { ownerPhone: phone, active: true },
    select: { id: true, name: true },
  });

  // Auto-promotion en rôle 'pro' si rattaché à une fiche employée
  if (employeeLink && user.role !== "pro") {
    await db.user.update({ where: { id: user.id }, data: { role: "pro" } });
    user.role = "pro";
  }

  const effectiveRole = user.role === "admin" ? "admin" : (ownerTenant || employeeLink || user.role === "pro") ? "pro" : "client";

  // Vérifier si le compte est temporairement bloqué suite à des erreurs de PIN
  const isPinLocked = Boolean(user.pinLockedUntil && user.pinLockedUntil > new Date());

  return NextResponse.json({
    ok: true,
    exists: true,
    hasPin: Boolean(user.pinHash),
    isPinLocked,
    isAccountLocked: Boolean(user.lockedAt),
    name: user.name && user.name !== "Nouvelle cliente" ? user.name : undefined,
    role: effectiveRole,
    isEmployee: Boolean(employeeLink),
    employeeRole: employeeLink?.role ?? null,
    tenant: ownerTenant ?? (employeeLink?.tenant ? { id: employeeLink.tenant.id, name: employeeLink.tenant.name } : null),
    maskedPhone: maskPhone(phone),
  });
}
