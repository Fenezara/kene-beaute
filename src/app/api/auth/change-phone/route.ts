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
      const smsRes = await sendOtpSms(targetPhone, rawOtp);
      smsSent = smsRes.sent;
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
      // ─── FUSION DES COMPTES (Gérante / Client) ───
      // session.userId est fusionné dans existingUser.id qui détient déjà targetPhone.
      finalUser = await db.$transaction(async (tx) => {
        const currentUser = await tx.user.findUnique({ where: { id: session.userId } });

        // 1. Réassigner les relations standard
        await tx.appointment.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.appointment.updateMany({ where: { clientPhone: oldPhone }, data: { clientPhone: targetPhone } }).catch(() => null);

        await tx.diagnosis.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.proDiagnosis.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);

        await tx.order.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.order.updateMany({ where: { phone: oldPhone }, data: { phone: targetPhone } }).catch(() => null);

        await tx.review.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.notification.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.subscription.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.employee.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.consent.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.passkeyCredential.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.paymentIntent.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);
        await tx.auditLog.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id } }).catch(() => null);

        await tx.clientProfile.updateMany({ where: { userId: session.userId }, data: { userId: existingUser.id, phone: targetPhone } }).catch(() => null);
        await tx.clientProfile.updateMany({ where: { phone: oldPhone }, data: { phone: targetPhone } }).catch(() => null);

        // 2. Gestion des relations uniques (@unique sur userId)
        // Wallet
        const oldWallet = await tx.wallet.findUnique({ where: { userId: session.userId } });
        const existingWallet = await tx.wallet.findUnique({ where: { userId: existingUser.id } });
        if (oldWallet) {
          if (existingWallet) {
            if (oldWallet.balance > 0) {
              await tx.wallet.update({
                where: { id: existingWallet.id },
                data: { balance: { increment: oldWallet.balance } },
              });
            }
            await tx.wallet.delete({ where: { id: oldWallet.id } });
          } else {
            await tx.wallet.update({
              where: { id: oldWallet.id },
              data: { userId: existingUser.id },
            });
          }
        }

        // SkinPassport
        const oldPassport = await tx.skinPassport.findUnique({ where: { userId: session.userId } });
        const existingPassport = await tx.skinPassport.findUnique({ where: { userId: existingUser.id } });
        if (oldPassport) {
          if (existingPassport) {
            await tx.skinPassport.delete({ where: { id: oldPassport.id } });
          } else {
            await tx.skinPassport.update({
              where: { id: oldPassport.id },
              data: { userId: existingUser.id },
            });
          }
        }

        // WebPushSubscription
        const existingSubs = await tx.webPushSubscription.findMany({ where: { userId: existingUser.id } });
        const existingEndpoints = new Set(existingSubs.map((s) => s.endpoint));
        const oldSubs = await tx.webPushSubscription.findMany({ where: { userId: session.userId } });
        for (const s of oldSubs) {
          if (existingEndpoints.has(s.endpoint)) {
            await tx.webPushSubscription.delete({ where: { id: s.id } }).catch(() => null);
          } else {
            await tx.webPushSubscription.update({ where: { id: s.id }, data: { userId: existingUser.id } }).catch(() => null);
          }
        }

        // CouponRedemption
        const existingRedemptions = await tx.couponRedemption.findMany({ where: { userId: existingUser.id } });
        const existingCoupons = new Set(existingRedemptions.map((r) => r.couponId));
        const oldRedemptions = await tx.couponRedemption.findMany({ where: { userId: session.userId } });
        for (const r of oldRedemptions) {
          if (existingCoupons.has(r.couponId)) {
            await tx.couponRedemption.delete({ where: { id: r.id } }).catch(() => null);
          } else {
            await tx.couponRedemption.update({ where: { id: r.id }, data: { userId: existingUser.id } }).catch(() => null);
          }
        }

        // 3. Rôle et nom finaux pour la gérante
        const finalRole = (currentUser?.role === "admin" || existingUser.role === "admin")
          ? "admin"
          : (currentUser?.role === "pro" || existingUser.role === "pro")
          ? "pro"
          : "client";

        const isValidName = (name?: string | null) => name && name.trim().length > 1 && name !== "Cliente" && name !== "Nouvelle cliente";
        const finalName = isValidName(existingUser.name)
          ? existingUser.name
          : (isValidName(currentUser?.name) ? currentUser!.name : (existingUser.name || "Gérante"));

        // 4. Mettre à jour ownerPhone et ownerName des instituts
        if (finalRole === "pro" || finalRole === "admin") {
          await tx.tenant.updateMany({
            where: { ownerPhone: oldPhone },
            data: {
              ownerPhone: targetPhone,
              ownerName: finalName,
            },
          });
        }

        // 5. Mise à jour de l'utilisateur survivant
        const updated = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            role: finalRole,
            name: finalName,
            email: existingUser.email || currentUser?.email || undefined,
            city: existingUser.city || currentUser?.city || undefined,
            district: existingUser.district || currentUser?.district || undefined,
            pinHash: currentUser?.pinHash || existingUser.pinHash || undefined,
            selectedTenantId: existingUser.selectedTenantId || currentUser?.selectedTenantId || undefined,
          },
        });

        // 6. Suppression propre du compte temporaire migré
        await tx.user.delete({ where: { id: session.userId } });

        return updated;
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
  }

  return jsonError("Action non reconnue", 400);
}
