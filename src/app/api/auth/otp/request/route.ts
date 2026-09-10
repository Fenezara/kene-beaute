// POST /api/auth/otp/request — {phone} → envoie (simule) un code OTP 6 chiffres
// Durcissement t. 86-d : le code est stocké HACHÉ (sha256 hex) dans OtpCode.code
// — plus jamais de code en clair en base. La réponse renvoie `devCode` (le code
// brut) UNIQUEMENT hors production : en development, le flux démo « Entrer comme
// Mariam » et les E2E continuent de fonctionner à l'identique.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, OTP_REQUEST } from "@/lib/kene/rate-limit";
import { audit, clientIp, sha256Hex } from "@/lib/kene/audit";

const Body = z.object({ phone: z.string().min(5) });

const normalizePhone = (raw: string) => raw.replace(/\s+/g, "").trim();

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "otp:request"), OTP_REQUEST);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de demandes de code — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Numéro de téléphone requis", 400);
    const phone = normalizePhone(parsed.data.phone);

    // Hygiène (t. 63-d) : purge des codes expirés de TOUS les numéros avant
    // toute création — la table OtpCode grossissait sinon indéfiniment (41
    // codes morts relevés en base). deleteMany ciblé, aucune erreur bloquante.
    await db.otpCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    // Invalide les anciens codes non utilisés pour ce numéro
    await db.otpCode.updateMany({ where: { phone, used: false }, data: { used: true } });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.otpCode.create({
      data: {
        phone,
        code: sha256Hex(code), // t. 86-d : seul le hash touche la base
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    // Journal d'audit : numéro MASQUÉ (le masquage vit dans audit()), + IP
    void audit({ kind: "otp_request", phone, ip: clientIp(req) });

    // OTP simulé : le code brut n'existe qu'en mémoire de réponse, et
    // UNIQUEMENT hors production — en prod, il part par SMS et ne revient
    // jamais dans le body (le front affiche alors la zone de saisie seule).
    const payload: { ok: true; devCode?: string } = { ok: true };
    if (process.env.NODE_ENV !== "production") payload.devCode = code;
    return NextResponse.json(payload);
  } catch (err) {
    return serverError("otp/request", err);
  }
}
