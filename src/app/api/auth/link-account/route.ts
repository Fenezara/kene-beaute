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
import { genRef, jsonError, serverError } from "@/lib/kene/server";
import { setSessionCookie, sanitizeUser, sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";
import { hashPin } from "@/lib/kene/pin";
import { checkBotGuard } from "@/lib/kene/bot-guard";
import { grantClientWelcomeTrial } from "@/lib/kene/plans";
import { getDefaultCabinetTenant } from "@/lib/kene/tenant-defaults";
import { isVirtualGuestUser } from "@/lib/kene/guest";

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

    const session = sessionFromRequest(req);
    const currentUser = session?.userId
      ? await db.user.findUnique({ where: { id: session.userId } })
      : null;

    // Vérifier si ce numéro appartient déjà à un autre compte
    const existingWithPhone = await db.user.findUnique({ where: { phone: cleanPhone } });

    if (existingWithPhone && existingWithPhone.id !== currentUser?.id) {
      // Sécurité anti-prise de contrôle (Account Takeover) :
      // On n'émet JAMAIS un cookie de session pour un compte existant sans preuve d'identité (PIN ou OTP SMS).
      void audit({
        kind: "account_link_blocked",
        phone: cleanPhone,
        userId: currentUser?.id,
        ip: clientIp(req),
        detail: "existing_phone_requires_auth",
      });

      return NextResponse.json(
        {
          error: "Ce numéro est déjà associé à un compte Kènè. Connecte-toi avec ton code secret ou un code SMS.",
          requiresLogin: true,
          hasPin: Boolean(existingWithPhone.pinHash),
        },
        { status: 409 }
      );
    }

    let updatedUser;
    if (!currentUser) {
      // Invitée purement locale (zéro ligne créée lors de la simple exploration) → création directe du vrai compte
      const defaultTenant = await getDefaultCabinetTenant();
      updatedUser = await db.user.create({
        data: {
          phone: cleanPhone,
          name: parsed.data.name || "Membre Kènè",
          role: "client",
          referralCode: genRef("KENE"),
          pinHash: parsed.data.pin ? hashPin(parsed.data.pin) : null,
          consentHealth: true,
          consentTs: new Date(),
          selectedTenantId: defaultTenant?.id ?? null,
        },
      });
      await grantClientWelcomeTrial(updatedUser.id).catch(() => null);
    } else {
      const wasGuest = isVirtualGuestUser(currentUser);
      const updateData: {
        phone: string;
        name?: string;
        pinHash?: string;
        consentHealth?: boolean;
        consentTs?: Date;
      } = {
        phone: cleanPhone,
      };

      if (parsed.data.name) {
        updateData.name = parsed.data.name;
      } else if (wasGuest) {
        updateData.name = "Membre Kènè";
      }
      if (parsed.data.pin) {
        updateData.pinHash = hashPin(parsed.data.pin);
      }
      if (!currentUser.consentHealth) {
        updateData.consentHealth = true;
        updateData.consentTs = new Date();
      }

      updatedUser = await db.user.update({
        where: { id: currentUser.id },
        data: updateData,
      });
      if (wasGuest) {
        await grantClientWelcomeTrial(updatedUser.id).catch(() => null);
      }
    }

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
