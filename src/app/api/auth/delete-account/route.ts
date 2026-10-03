// POST /api/auth/delete-account — Suppression autonome du compte utilisateur
// Conforme Apple App Store Guideline 5.1.1(v) et Google Play Store Data Safety
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { clientIp } from "@/lib/kene/audit";
import { verifyPin } from "@/lib/kene/pin";
import { anonymizeAndPurgeUser } from "@/lib/kene/account-deletion";

const Body = z.object({
  pin: z.string().min(4).max(6).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = sessionFromRequest(req);
    if (!session || !session.userId) {
      return jsonError("Session expirée ou non autorisée", 401);
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return jsonError("Compte introuvable", 404);
    }

    const json = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    const pin = parsed.success ? parsed.data.pin : undefined;

    // Si l'utilisatrice a configuré un code secret PIN, la vérification est requise
    if (user.pinHash) {
      if (!pin) {
        return jsonError("Code secret PIN requis pour confirmer la suppression", 400);
      }
      const isPinValid = verifyPin(pin, user.pinHash);
      if (!isPinValid) {
        return jsonError("Code secret PIN incorrect", 400);
      }
    }

    const ip = clientIp(req);
    const result = await anonymizeAndPurgeUser(user.id, {
      triggeredBy: "self",
      ip,
    });

    if (!result.ok) {
      return jsonError(result.message || "Impossible de supprimer le compte", 400);
    }

    // Réponse avec effacement immédiat du cookie de session
    const res = NextResponse.json({
      ok: true,
      message: "Ton compte et tes données personnelles ont été supprimés conformément aux normes de confidentialité.",
    });

    res.cookies.set("kene_session", "", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      expires: new Date(0),
    });

    return res;
  } catch (err) {
    return serverError("auth/delete-account", err);
  }
}
