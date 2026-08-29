// PATCH /api/auth/profile — {userId, name?, city?, skinType?, fitzpatrick?, allergies?, goals?}
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";

const Body = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  city: z.string().trim().optional().nullable(),
  skinType: z.string().trim().optional().nullable(),
  fitzpatrick: z.string().trim().optional().nullable(),
  allergies: z.string().trim().optional().nullable(),
  goals: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { userId, goals, ...rest } = parsed.data;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) data[key] = value;
    }
    if (goals !== undefined) data.goals = JSON.stringify(goals);

    const updated = await db.user.update({ where: { id: userId }, data });
    return NextResponse.json({ user: updated });
  } catch (err) {
    return serverError("auth/profile", err);
  }
}
