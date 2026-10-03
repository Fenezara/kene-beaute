// POST /api/auth/pin — { phone, pin, otpCode? } → définit ou réinitialise le code PIN
// GET /api/auth/pin?_g=… — pont GET
// Permet :
// 1) À une utilisatrice connectée de modifier son code PIN
// 2) À une utilisatrice ayant validé un OTP (création ou « Code oublié ? ») d'enregistrer son nouveau code PIN
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest, setSessionCookie, sanitizeUser } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { audit, clientIp, sha256Hex, hashEqual } from "@/lib/kene/audit";
import { hashPin, isValidPin } from "@/lib/kene/pin";

const Body = z.object({
  phone: z.string().min(5),
  pin: z.string().min(4).max(6),
  otpCode: z.string().length(6).optional(),
});

const normalizePhone = (raw: string) => raw.replace(/\s+/g, "").trim();

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:pin"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("phone et pin (4 à 6 chiffres) requis", 400);
    return await runSetPin(parsed.data, req);
  } catch (err) {
    return serverError("auth/pin", err);
  }
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:pin"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans quelques secondes");
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Paramètres requis — ${bridged.error}`, 400);
    return await runSetPin(bridged.data, req);
  } catch (err) {
    return serverError("auth/pin", err);
  }
}

async function runSetPin(data: z.infer<typeof Body>, req: NextRequest): Promise<NextResponse> {
  const phone = normalizePhone(data.phone);
  const { pin, otpCode } = data;
  const ip = clientIp(req);

  if (!isValidPin(pin)) {
    return jsonError("Le code secret doit comporter 4 chiffres", 400);
  }

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) {
    return jsonError("Compte non trouvé", 404);
  }

  // Vérification des droits : soit session valide, soit code OTP valide
  const session = sessionFromRequest(req);
  const isSessionAuth = session && (session.userId === user.id || session.phone === phone);

  if (!isSessionAuth) {
    // Si pas de session active, un code OTP valide et non expiré est impératif
    if (!otpCode) {
      return jsonError("Code OTP ou session requise pour définir le code secret", 401);
    }

    const otp = await db.otpCode.findFirst({
      where: {
        phone,
        createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
      },
      orderBy: { createdAt: "desc" },
    });

    const submittedHash = sha256Hex(otpCode);
    const storedHash = otp ? (/^[0-9a-f]{64}$/.test(otp.code) ? otp.code : sha256Hex(otp.code)) : null;

    if (!otp || !storedHash || !hashEqual(submittedHash, storedHash)) {
      void audit({ kind: "pin_change_failed", phone, userId: user.id, ip, detail: "code OTP invalide" });
      return jsonError("Code de vérification SMS invalide ou expiré", 400);
    }

    // Consomme l'OTP
    await db.otpCode.update({ where: { id: otp.id }, data: { used: true } });
  }

  // Hachage et enregistrement du nouveau PIN
  const newPinHash = hashPin(pin);
  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: {
      pinHash: newPinHash,
      pinFails: 0,
      pinLockedUntil: null,
    },
  });

  void audit({
    kind: "pin_change_success",
    phone,
    userId: user.id,
    ip,
    detail: isSessionAuth ? "modification via session" : "définition via OTP",
  });

  const response = NextResponse.json({
    ok: true,
    user: sanitizeUser(updatedUser),
    hasPin: true,
  });

  // Si l'utilisatrice n'était pas déjà connectée, on pose le cookie de session 365 jours
  setSessionCookie(response, updatedUser);

  return response;
}
