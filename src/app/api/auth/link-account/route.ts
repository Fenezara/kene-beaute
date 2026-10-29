// POST /api/auth/link-account — { phone, name?, pin? }
// Permet à une utilisatrice en session Découverte/Guest d'associer son vrai numéro de téléphone (WhatsApp).
//
// CONTRAT UX PROGRESSIVE ONBOARDING:
// - Si le numéro existe déjà : on fusionne la session avec le compte existant (ou on l'invite à se reconnecter avec son PIN/OTP).
// - Si le numéro est nouveau : on met à jour le numéro de l'utilisateur courant, son nom, et optionnellement son code PIN.
// - Le cookie de session est immédiatement rafraîchi avec le nouveau téléphone.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { setSessionCookie, sanitizeUser, sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";
import { hashPin } from "@/lib/kene/pin";
import { checkBotGuard } from "@/lib/kene/bot-guard";

const Body = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().trim().min(2).optional(),
  pin: z.string().min(4).max(6).optional(),
  _kene_bot_trap: z.string().optional(),
  _kene_ts: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "auth:link-account"), AUTH_MUTATION);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives rapides. Réessaie dans un instant.");
  }

  try {
    const raw = await req.json().catch(() => null);
    const botCheck = await checkBotGuard(req, raw);
    if (!botCheck.ok && botCheck.response) return botCheck.response;

    const session = sessionFromRequest(req);
    if (!session) {
      return jsonError("Session requise pour lier un compte", 401);
    }

    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Numéro de téléphone invalide (10 chiffres)", 400);
    }

    // Normalisation E.164 (+225...)
    let cleanPhone = parsed.data.phone.trim().replace(/\s+/g, "");
    if (!cleanPhone.startsWith("+")) {
      const digits = cleanPhone.replace(/\D/g, "");
      cleanPhone = digits.startsWith("225") ? `+${digits}` : `+225${digits}`;
    }

    const currentUserId = session.userId;
    const currentUser = await db.user.findUnique({ where: { id: currentUserId } });
    if (!currentUser) {
      return jsonError("Utilisatrice introuvable", 404);
    }

    // Vérifier si ce numéro appartient déjà à un autre compte
    const existingWithPhone = await db.user.findUnique({ where: { phone: cleanPhone } });

    if (existingWithPhone && existingWithPhone.id !== currentUserId) {
      // Le numéro existe déjà : on bascule la session vers ce compte existant
      // et on peut rattacher les diagnostics temporaires de l'invitée au compte existant !
      await db.diagnosis.updateMany({
        where: { userId: currentUserId },
        data: { userId: existingWithPhone.id },
      }).catch(() => null);

      await db.appointment.updateMany({
        where: { userId: currentUserId },
        data: { userId: existingWithPhone.id },
      }).catch(() => null);

      if (parsed.data.name && (!existingWithPhone.name || existingWithPhone.name === "Nouvelle cliente")) {
        await db.user.update({
          where: { id: existingWithPhone.id },
          data: { name: parsed.data.name },
        }).catch(() => null);
      }

      void audit({
        kind: "account_linked",
        phone: cleanPhone,
        userId: existingWithPhone.id,
        ip: clientIp(req),
        detail: "fusion_guest_to_existing",
      });

      const response = NextResponse.json({
        ok: true,
        user: sanitizeUser(existingWithPhone),
        message: "Compte rattaché avec succès !",
      });
      setSessionCookie(response, existingWithPhone);
      return response;
    }

    // Nouveau numéro : mise à jour directe du compte en cours
    const updateData: {
      phone: string;
      name?: string;
      pinHash?: string;
    } = {
      phone: cleanPhone,
    };

    if (parsed.data.name) {
      updateData.name = parsed.data.name;
    }
    if (parsed.data.pin) {
      updateData.pinHash = hashPin(parsed.data.pin);
    }

    const updatedUser = await db.user.update({
      where: { id: currentUserId },
      data: updateData,
    });

    void audit({
      kind: "account_linked",
      phone: cleanPhone,
      userId: updatedUser.id,
      ip: clientIp(req),
      detail: "guest_promoted_to_permanent",
    });

    const response = NextResponse.json({
      ok: true,
      user: sanitizeUser(updatedUser),
      message: "Numéro enregistré avec succès !",
    });
    setSessionCookie(response, updatedUser);
    return response;
  } catch (err) {
    return serverError("auth/link-account", err);
  }
}
