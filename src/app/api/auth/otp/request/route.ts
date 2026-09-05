// POST /api/auth/otp/request — {phone} → envoie (simule) un code OTP 6 chiffres
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, OTP_REQUEST } from "@/lib/kene/rate-limit";

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
        code,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    // OTP simulé : le code est renvoyé pour affichage « SMS simulé » dans l'UI
    return NextResponse.json({ ok: true, devCode: code });
  } catch (err) {
    return serverError("otp/request", err);
  }
}
