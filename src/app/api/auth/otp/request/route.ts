// POST /api/auth/otp/request — {phone} → envoie (simule) un code OTP 6 chiffres
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";

const Body = z.object({ phone: z.string().min(5) });

const normalizePhone = (raw: string) => raw.replace(/\s+/g, "").trim();

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Numéro de téléphone requis", 400);
    const phone = normalizePhone(parsed.data.phone);

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
