// POST /api/auth/pin — { phone, pin, otpCode? } → définit ou réinitialise le code PIN
// GET /api/auth/pin?_g=… — pont GET
// Permet :
// 1) À une utilisatrice connectée de modifier son code PIN
// 2) À une utilisatrice ayant validé un OTP (création ou « Code oublié ? ») d'enregistrer son nouveau code PIN
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { sessionFromRequest, setSessionCookie, sanitizeUser } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { audit, clientIp, sha256Hex, hashEqual } from "@/lib/kene/audit";
import { hashPin, isValidPin, verifyPin } from "@/lib/kene/pin";
import { sanitizePayload } from "@/lib/kene/security-sanitize";

const Body = z.object({
  phone: z.string().min(5),
  pin: z.string().min(4).max(6),
  oldPin: z.string().min(4).max(6).optional(),
  otpCode: z.string().length(6).optional(),
});

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
  const rl = rateLimit(rlKey(req, "auth:pin"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans quelques secondes");
  }
  try {
    const raw = sanitizePayload(await req.json().catch(() => null));
    const parsed = Body.safeParse(raw);
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
  const { pin, otpCode } = data;
  const ip = clientIp(req);

  if (!isValidPin(pin)) {
    return jsonError("Le code secret doit comporter 4 chiffres", 400);
  }

  const { user: foundUser, normalizedPhone: phone } = await findUserByPhoneFlexible(data.phone);
  const session = sessionFromRequest(req);

  let user = foundUser;
  if (!user && session?.userId) {
    user = await db.user.findUnique({ where: { id: session.userId } });
  }

  if (!user) {
    return jsonError("Compte non trouvé", 404);
  }

  // Vérification du verrouillage temporaire anti-brute force
  if (process.env.NODE_ENV === "production" && user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
    const remainingSec = Math.max(1, Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 1000));
    void audit({ kind: "pin_change_locked", phone: user.phone, userId: user.id, ip, detail: "compte verrouillé par tentatives erronées" });
    return rateLimitResponse(
      remainingSec,
      `Compte temporairement bloqué suite à plusieurs codes erronés. Réessaie dans ${Math.ceil(remainingSec / 60)} min.`,
    );
  }

  // Vérification des droits : soit session valide, soit code OTP valide
  const isSessionAuth = Boolean(
    session && (
      session.userId === user.id ||
      session.phone === user.phone ||
      (session.phone && user.phone && normalizePhone(session.phone).slice(-8) === normalizePhone(user.phone).slice(-8))
    )
  );

  if (isSessionAuth) {
    // Si l'utilisateur possède déjà un code secret, il doit fournir son ancien code
    // OU un code OTP de secours en cas d'oubli
    if (user.pinHash) {
      if (data.oldPin) {
        if (!verifyPin(data.oldPin, user.pinHash)) {
          const nextFails = (user.pinFails || 0) + 1;
          if (nextFails >= 5) {
            const lockedUntil = new Date(Date.now() + 15 * 60_000);
            await db.user.update({
              where: { id: user.id },
              data: { pinFails: 0, pinLockedUntil: lockedUntil },
            });
            void audit({ kind: "login_locked", phone, userId: user.id, ip, detail: "5 anciens codes PIN erronés — verrou 15 min" });
            void notify({
              userId: user.id,
              channel: "whatsapp",
              toPhone: user.phone,
              message: `⚠️ Alerte Sécurité Kènè : 5 tentatives erronées de modification de code secret détectées. Votre accès a été temporairement bloqué pendant 15 minutes.`,
            }).catch(() => null);
            return rateLimitResponse(15 * 60, "Plusieurs codes erronés — compte bloqué 15 minutes par mesure de sécurité.");
          }
          await db.user.update({
            where: { id: user.id },
            data: { pinFails: nextFails },
          });
          void audit({ kind: "pin_change_failed", phone, userId: user.id, ip, detail: `ancien code secret incorrect (${nextFails}/5)` });
          return jsonError(`L'ancien code secret est incorrect (il te reste ${5 - nextFails} tentative${5 - nextFails > 1 ? "s" : ""})`, 400);
        }
      } else if (otpCode) {
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

        await db.otpCode.update({ where: { id: otp.id }, data: { used: true } });
      } else {
        return jsonError("Ancien code secret ou code SMS requis pour modifier le code secret", 400);
      }
    }
  } else {
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
