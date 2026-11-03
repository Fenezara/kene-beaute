// POST /api/pro/sales/refund — Annulation / Remboursement sécurisé d'un reçu de vente
// Réservé à la Direction (Admin ou Propriétaire / Gérante d'institut avec validation PIN)
// Réintègre automatiquement les produits en stock, contre-passe l'écriture SYSCOHADA et trace l'audit.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { refundSaleJournalLines } from "@/lib/accounting/syscohada";
import { jsonError, serverError, resolveTenant, createJournalEntry, genRef, phoneSuffix } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";
import { verifyPin } from "@/lib/kene/pin";
import { audit, clientIp } from "@/lib/kene/audit";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { sanitizePayload } from "@/lib/kene/security-sanitize";

export const runtime = "nodejs";

const Body = z.object({
  saleId: z.string().min(1),
  tenantId: z.string().min(1),
  reason: z.string().trim().min(3).max(200),
  pin: z.string().trim().min(4).max(6).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "pro:sales:refund"), AUTH_MUTATION);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives d'annulation");

  try {
    const guard = guardProRole(req, "pro:sales:refund");
    if (guard) return guard;

    const raw = sanitizePayload(await req.json().catch(() => null));
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Données d'annulation invalides. Motif requis (min 3 caractères).", 400);
    }

    const { saleId, tenantId, reason, pin } = parsed.data;

    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable ou non autorisé", 404);

    const sess = sessionFromRequest(req);
    if (!sess) return jsonError("Session requise", 401);

    // 1. Vérification de l'habilitation (Propriétaire / Gérante ou Admin)
    const isAdmin = sess.role === "admin";
    const userSuffix = sess.phone ? phoneSuffix(sess.phone) : "";
    const isOwnerPhone = Boolean(
      tenant.ownerPhone &&
        (tenant.ownerPhone === sess.phone ||
          (userSuffix.length >= 8 && phoneSuffix(tenant.ownerPhone) === userSuffix))
    );

    // Si pas admin et pas ownerPhone, on refuse directement
    if (!isAdmin && !isOwnerPhone) {
      return jsonError("Action strictement réservée à la direction de l'établissement.", 403);
    }

    // 2. Vérification du code PIN de la Gérante
    // On récupère le user de la gérante pour vérifier son code secret
    const ownerUser = await db.user.findFirst({
      where: {
        OR: [
          { phone: sess.phone },
          ...(tenant.ownerPhone ? [{ phone: tenant.ownerPhone }] : []),
        ],
      },
      select: { id: true, name: true, pinHash: true, pinLockedUntil: true },
    });

    if (ownerUser?.pinLockedUntil && ownerUser.pinLockedUntil > new Date()) {
      return jsonError("Code PIN temporairement verrouillé suite à trop d'échecs. Réessaie dans quelques minutes.", 403);
    }

    // Si un code PIN est configuré sur le compte de direction, il est obligatoirement vérifié
    if (ownerUser?.pinHash) {
      if (!pin) {
        return jsonError("Code PIN de la direction requis pour autoriser l'annulation.", 400);
      }
      const isPinValid = verifyPin(pin, ownerUser.pinHash);
      if (!isPinValid) {
        await db.user.update({
          where: { id: ownerUser.id },
          data: { pinFails: { increment: 1 } },
        });
        return jsonError("Code PIN de la direction incorrect.", 401);
      }
      // Reset fails on success
      await db.user.update({
        where: { id: ownerUser.id },
        data: { pinFails: 0, pinLockedUntil: null },
      });
    }

    // 3. Récupération de la vente à annuler
    const sale = await db.sale.findUnique({
      where: { id: saleId },
      include: { items: true, clientProfile: true },
    });

    if (!sale) return jsonError("Vente introuvable", 404);
    if (sale.tenantId !== tenant.id) return jsonError("Cette vente n'appartient pas à cet institut", 403);

    if (sale.status === "refunded") {
      return jsonError("Cette vente a déjà été annulée et remboursée.", 400);
    }

    // 4. Passage du statut de la vente à "refunded"
    const updatedSale = await db.sale.update({
      where: { id: sale.id },
      data: {
        status: "refunded",
      },
      include: {
        items: true,
        clientProfile: { select: { id: true, name: true, phone: true } },
      },
    });

    // 5. Réintégration des stocks pour les produits physiques
    for (const item of sale.items) {
      if (item.kind === "product" && item.productId) {
        const prod = await db.product.findUnique({ where: { id: item.productId } });
        if (prod) {
          await db.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.qty } },
          });
          await db.inventoryMovement.create({
            data: {
              tenantId: tenant.id,
              productId: item.productId,
              type: "in",
              qty: item.qty,
              reason: `Annulation vente #${sale.id.slice(-6).toUpperCase()} : ${reason.slice(0, 60)}`,
            },
          });
        }
      }
    }

    // 6. Contre-passation comptable SYSCOHADA (Avoir / Annulation)
    const servicesAmount = sale.items
      .filter((it) => it.kind === "service")
      .reduce((sum, it) => sum + (it.unitPrice * it.qty), 0);
    const productsAmount = sale.items
      .filter((it) => it.kind === "product")
      .reduce((sum, it) => sum + (it.unitPrice * it.qty), 0);

    const validMethod = (["wave", "orange", "cash", "card", "wallet"].includes(sale.paymentMethod)
      ? sale.paymentMethod
      : "cash") as "wave" | "orange" | "cash" | "card" | "wallet";

    await createJournalEntry(tenant.id, {
      journalCode: validMethod === "cash" ? "CA" : "BQ",
      date: new Date(),
      reference: genRef("AV"), // Avoir
      description: `Annulation vente #${sale.id.slice(-6).toUpperCase()} — Motif: ${reason.slice(0, 50)}`,
      sourceType: "refund",
      sourceId: sale.id,
      lines: refundSaleJournalLines({
        total: sale.total,
        servicesAmount,
        productsAmount,
        method: validMethod,
      }),
    });

    // 7. Audit log de sécurité
    void audit({
      kind: "sale_refunded",
      ip: clientIp(req),
      detail: `[Tenant:${tenant.id}] Vente #${sale.id.slice(-6).toUpperCase()} annulée (${sale.total} FCFA) par ${sess.phone || sess.userId} • Motif: ${reason}`,
    });

    return NextResponse.json({
      ok: true,
      sale: updatedSale,
      message: `Vente #${sale.id.slice(-6).toUpperCase()} annulée avec succès. Produits réintégrés en stock.`,
    });
  } catch (err) {
    return serverError("pro/sales/refund", err);
  }
}
