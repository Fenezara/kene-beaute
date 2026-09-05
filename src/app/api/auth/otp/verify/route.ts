// POST /api/auth/otp/verify — {phone, code, name?} → { user }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, OTP_VERIFY } from "@/lib/kene/rate-limit";

const Body = z.object({
  phone: z.string().min(5),
  code: z.string().length(6),
  name: z.string().trim().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "otp:verify"), OTP_VERIFY);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      `Trop de tentatives de code — réessaie dans ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))} min`,
    );
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("phone et code (6 chiffres) requis", 400);
    const phone = parsed.data.phone.replace(/\s+/g, "").trim();
    const { code, name } = parsed.data;

    const otp = await db.otpCode.findFirst({
      where: { phone, code, used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) return jsonError("Code invalide ou expiré", 400);
    await db.otpCode.update({ where: { id: otp.id }, data: { used: true } });

    // Le téléphone d'une propriétaire d'institut → rôle pro
    const ownerTenant = await db.tenant.findFirst({ where: { ownerPhone: phone } });

    let user = await db.user.findUnique({ where: { phone } });
    if (!user) {
      user = await db.user.create({
        data: {
          phone,
          name: name || "Nouvelle cliente",
          role: ownerTenant ? "pro" : "client",
          referralCode: genRef("KENE"),
        },
      });
    } else if (name && (!user.name || user.name === "Nouvelle cliente")) {
      user = await db.user.update({ where: { id: user.id }, data: { name } });
    }

    return NextResponse.json({ user });
  } catch (err) {
    return serverError("otp/verify", err);
  }
}
