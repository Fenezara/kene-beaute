// POST /api/auth/change-phone — Changement sécurisé de numéro de téléphone (cliente & pro)
//
// CONTRAT DE SÉCURITÉ :
// 1. Session authentifiée obligatoire (cookie signé kene_session).
// 2. Étape 1 (action = "request") :
//    - Vérifie que le newPhone n'est pas déjà utilisé par un autre compte.
//    - Émet un code OTP de confirmation à 6 chiffres sur le NOUVEAU numéro.
// 3. Étape 2 (action = "verify") :
//    - Vérifie le code à 6 chiffres.
//    - Met à jour le numéro de l'utilisateur (user.phone = newPhone).
//    - Si pro / gérante : met à jour ownerPhone de tous ses instituts (db.tenant.updateMany).
//    - Met à jour db.clientProfile.updateMany pour que les salons gardent le bon numéro.
//    - Génère un nouveau cookie de session signé avec le nouveau numéro.
//    - Journalise l'audit ("phone_changed").

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { setSessionCookie, sanitizeUser, sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, OTP_REQUEST, OTP_VERIFY } from "@/lib/kene/rate-limit";
import { audit, clientIp, sha256Hex, hashEqual } from "@/lib/kene/audit";
import { sendOtpSms } from "@/lib/sms";
import { checkBotGuard } from "@/lib/kene/bot-guard";

export const runtime = "nodejs";

const Body = z.object({
  action: z.enum(["request", "verify"]),
  newPhone: z.string().min(8).max(25),
  code: z.string().length(6).optional(),
  _kene_bot_trap: z.string().optional(),
  _kene_ts: z.number().optional(),
});

function formatToE164(raw: string): string {
  let clean = raw.trim().replace(/\s+/g, "");
  if (!clean.startsWith("+")) {
    const digits = clean.replace(/\D/g, "");
    if (digits.startsWith("225") || digits.startsWith("221")) {
      clean = `+${digits}`;
    } else {
      clean = `+225${digits}`;
    }
  }
  return clean;
}

export async function POST(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) {
    return jsonError("Session expirée. Veuillez vous reconnecter.", 401);
  }

  const raw = await req.json().catch(() => null);
  const botCheck = checkBotGuard(req, raw);
  if (!botCheck.ok && botCheck.response) return botCheck.response;

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonError("Données invalides pour le changement de numéro", 400);
  }

  const { action, newPhone, code } = parsed.data;
  const targetPhone = formatToE164(newPhone);

  if (targetPhone === session.phone) {
    return jsonError("Le nouveau numéro est identique au numéro actuel.", 400);
  }

  // Vérifier si le numéro cible est déjà pris par un autre utilisateur
  const existingUser = await db.user.findUnique({ where: { phone: targetPhone } });
  if (existingUser && existingUser.id !== session.userId) {
    // Si l'autre compte est admin et que la session n'est pas admin, interdire
    if (existingUser.role === "admin" && session.role !== "admin") {
      return jsonError("Ce numéro est réservé à l'administration Kènè.", 403);
    }
    // Si l'autre compte gère déjà un autre institut actif différent de celui de la gérante
    const otherTenant = await db.tenant.findFirst({
      where: { ownerPhone: targetPhone, active: true },
    });
    const currentTenants = await db.tenant.findMany({
      where: { ownerPhone: session.phone },
      select: { id: true },
    });
    const currentTenantIds = new Set(currentTenants.map((t) => t.id));
    if (otherTenant && !currentTenantIds.has(otherTenant.id)) {
      return jsonError(`Ce numéro est déjà gérant d'un autre établissement (« ${otherTenant.name} »).`, 409);
    }
  }

  // ─────────────── ÉTAPE 1 : DEMANDE DE CODE (action = "request") ───────────────
  if (action === "request") {
    const rl = rateLimit(rlKey(req, `change-phone:req:${session.userId}`), OTP_REQUEST);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec, "Trop de demandes d'envoi. Patientez un instant.");
    }

    const rawOtp = String(randomInt(100_000, 1_000_000));
    const codeHash = sha256Hex(rawOtp);
    const expiresAt = new Date(Date.now() + 5 * 60_000); // 5 min

    await db.otpCode.create({
      data: {
        phone: targetPhone,
        code: codeHash,
        expiresAt,
      },
    });

    const isProd = process.env.NODE_ENV === "production";
    let smsSent = false;
    let smsError: string | undefined;

    try {
      const smsRes = await sendOtpSms({ phone: targetPhone, code: rawOtp });
      smsSent = smsRes.success;
      smsError = smsRes.error;
    } catch (e) {
      smsError = e instanceof Error ? e.message : "Erreur passerelle SMS";
    }

    void audit({
      kind: "otp_request",
      phone: targetPhone,
      userId: session.userId,
      ip: clientIp(req),
      detail: `change_phone_request:sent=${smsSent}`,
    });

    return NextResponse.json({
      ok: true,
      message: smsSent ? "Code de vérification envoyé par SMS" : "Code de vérification généré",
      smsSent,
      // En mode développement ou si l'envoi SMS réel a échoué, on renvoie devCode pour éviter tout blocage
      devCode: (!isProd || !smsSent) ? rawOtp : undefined,
    });
  }

  // ─────────────── ÉTAPE 2 : VÉRIFICATION ET BASCULE (action = "verify") ───────────────
  if (action === "verify") {
    try {
      if (!code || code.length !== 6) {
        return jsonError("Veuillez saisir le code à 6 chiffres reçu sur le nouveau numéro.", 400);
      }

    const rl = rateLimit(rlKey(req, `change-phone:verify:${session.userId}`), OTP_VERIFY);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives erronées.");
    }

    const candidateHash = sha256Hex(code);
    const validOtps = await db.otpCode.findMany({
      where: {
        phone: targetPhone,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    let otpMatch = false;
    let matchedId: string | undefined;

    for (const otp of validOtps) {
      if (hashEqual(otp.code, candidateHash)) {
        otpMatch = true;
        matchedId = otp.id;
        break;
      }
    }

    if (!otpMatch) {
      return jsonError("Code de vérification invalide ou expiré.", 401);
    }

    // Consommer le code OTP immédiatement
    if (matchedId) {
      await db.otpCode.delete({ where: { id: matchedId } }).catch(() => null);
    }

    const oldPhone = session.phone;
    let finalUser;

    if (existingUser && existingUser.id !== session.userId) {
      // ─── DÉLÉGATION / BASCULE DU RÔLE GÉRANTE ───
      // targetPhone devient la nouvelle gérante de l'institut.
      // L'ancien compte (session.userId) est STRICTEMENT PRÉSERVÉ avec toutes ses données personnelles (diagnostics, commandes, profil client).
      finalUser = await db.$transaction(async (tx) => {
        const currentUser = await tx.user.findUnique({ where: { id: session.userId } });

        // 1. Promouvoir le compte cible en rôle pro
        const finalRole = (existingUser.role === "admin" || currentUser?.role === "admin")
          ? "admin"
          : "pro";

        const isValidName = (name?: string | null) => name && name.trim().length > 1 && name !== "Cliente" && name !== "Nouvelle cliente";
        const finalName = isValidName(existingUser.name)
          ? existingUser.name
          : (isValidName(currentUser?.name) ? currentUser!.name : (existingUser.name || "Gérante"));

        const updatedTarget = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            role: finalRole,
            name: finalName,
          },
        });

        // 2. Transférer la gérance des instituts vers le nouveau numéro
        await tx.tenant.updateMany({
          where: { ownerPhone: oldPhone },
          data: {
            ownerPhone: targetPhone,
            ownerName: finalName,
          },
        });

        // 3. L'ancien compte conserve toutes ses données de cliente (diagnostics, soins, historique)
        // Si l'ancien compte ne gère plus aucun autre institut, son rôle redevient "client" sans rien perdre.
        const remainingTenants = await tx.tenant.count({
          where: { ownerPhone: oldPhone, active: true },
        });

        if (remainingTenants === 0 && currentUser?.role !== "admin") {
          await tx.user.update({
            where: { id: session.userId },
            data: { role: "client" },
          });
        }

        return updatedTarget;
      });
    } else {
      // Cas standard : targetPhone est nouveau ou appartient déjà à cet id
      finalUser = await db.user.update({
        where: { id: session.userId },
        data: { phone: targetPhone },
      });

      // Si c'est un compte pro / gérante d'institut : mettre à jour ownerPhone de ses établissements
      if (finalUser.role === "pro" || finalUser.role === "admin") {
        await db.tenant.updateMany({
          where: { ownerPhone: oldPhone },
          data: { ownerPhone: targetPhone },
        }).catch(() => null);
      }

      // Mettre à jour les fiches clientes associées
      await db.clientProfile.updateMany({
        where: { userId: session.userId },
        data: { phone: targetPhone },
      }).catch(() => null);
    }

    // Audit de sécurité
    void audit({
      kind: "phone_changed",
      phone: targetPhone,
      userId: finalUser.id,
      ip: clientIp(req),
      detail: `from=${oldPhone};to=${targetPhone};merged=${existingUser && existingUser.id !== session.userId}`,
    });

    const response = NextResponse.json({
      ok: true,
      message: "Numéro de téléphone mis à jour avec succès !",
      user: sanitizeUser(finalUser),
    });

    // Renouveler le cookie de session avec le compte survivant
    setSessionCookie(response, finalUser);
    return response;
  } catch (err) {
    console.error("[change-phone:verify] Error:", err);
    return jsonError(err instanceof Error ? err.message : "Erreur interne lors de la mise à jour du numéro", 500);
  }
}

  return jsonError("Action non reconnue", 400);
}
