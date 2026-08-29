// POST /api/auth/consent — {userId, types?} → consentement données de santé
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";

const Body = z.object({
  userId: z.string().min(1),
  types: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { userId } = parsed.data;
    const types = parsed.data.types?.length ? parsed.data.types : ["health_data"];

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    await db.consent.createMany({
      data: types.map((type) => ({ userId, type, granted: true, ip: ip ?? null })),
    });
    const updated = await db.user.update({
      where: { id: userId },
      data: { consentHealth: true, consentTs: new Date() },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return serverError("auth/consent", err);
  }
}
