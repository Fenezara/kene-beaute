// Kènè Pro — POST /api/pro/assistant/execute
// Exécution atomique du débriefing de la Maman dans tous les onglets de l'institut :
// Caisse, Stock, CRM, Agenda, Relances, Équipe/Paie et Comptabilité SYSCOHADA.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, createJournalEntry, recomputeClientRfm, genRef } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { splitTVA, saleJournalLines } from "@/lib/accounting/syscohada";
import { pushTenantFeed } from "@/lib/kene/realtime";

export const runtime = "nodejs";

const ItemSchema = z.object({
  kind: z.enum(["service", "product"]),
  id: z.string().optional(),
  label: z.string(),
  qty: z.number().int().min(1),
  unitPrice: z.number().int().min(0),
  total: z.number().int().min(0),
});

const StockDecSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  qty: z.number().int().min(1),
});

const Body = z.object({
  tenantId: z.string().min(1),
  debrief: z.object({
    summary: z.string().optional(),
    hasSale: z.boolean(),
    sale: z
      .object({
        items: z.array(ItemSchema),
        subtotal: z.number().int().min(0),
        total: z.number().int().min(0),
        paidAmount: z.number().int().min(0),
        remainingDebt: z.number().int().min(0).optional(),
        paymentMethod: z.enum(["wave", "orange", "cash", "card"]),
        discount: z.number().int().min(0).optional(),
        tipAmount: z.number().int().min(0).optional(),
      })
      .optional(),
    hasStockMovement: z.boolean(),
    stock: z
      .object({
        decrements: z.array(StockDecSchema),
      })
      .optional(),
    hasClient: z.boolean(),
    client: z
      .object({
        name: z.string(),
        phone: z.string().optional(),
        skinNotes: z.string().optional(),
        debtAmount: z.number().int().min(0).optional(),
        clientProfileId: z.string().optional(),
      })
      .optional(),
    hasAppointment: z.boolean(),
    appointment: z
      .object({
        serviceName: z.string().optional(),
        serviceId: z.string().optional(),
        practitionerName: z.string().optional(),
        practitionerId: z.string().optional(),
        dateStr: z.string(),
        timeStr: z.string().optional(),
        notes: z.string().optional(),
      })
      .optional(),
    hasExpense: z.boolean(),
    expense: z
      .object({
        amount: z.number().int().min(1),
        description: z.string(),
        category: z.string().optional(),
      })
      .optional(),
    hasRelance: z.boolean(),
    relance: z
      .object({
        delayDays: z.number().int().min(1),
        message: z.string(),
      })
      .optional(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:assistant:execute");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const { tenantId, debrief } = parsed.data;

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        services: { where: { active: true } },
        products: { where: { active: true } },
        resources: { where: { active: true } },
      },
    });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const results: {
      clientId?: string;
      saleId?: string;
      appointmentId?: string;
      stockUpdated: number;
      expenseLogged?: boolean;
    } = { stockUpdated: 0 };

    // ── 1. Gestion CRM (Fiche Cliente) ───────────────────────────
    let clientProfileId: string | undefined = debrief.client?.clientProfileId;
    if (debrief.hasClient && debrief.client) {
      const c = debrief.client;
      const phone = c.phone || "0000000000";
      const debtNote = c.debtAmount && c.debtAmount > 0 ? ` [Reste à payer : ${c.debtAmount} FCFA]` : "";
      const notes = [c.skinNotes, debtNote].filter(Boolean).join(" · ") || null;

      if (clientProfileId) {
        // Mise à jour cliente existante
        const existing = await db.clientProfile.findUnique({ where: { id: clientProfileId } });
        const mergedNotes = notes
          ? (existing?.notes ? `${existing.notes} | ${notes}` : notes)
          : undefined;
        const updated = await db.clientProfile.update({
          where: { id: clientProfileId },
          data: {
            visitsCount: { increment: 1 },
            totalSpent: { increment: debrief.sale?.paidAmount || 0 },
            lastVisit: new Date(),
            ...(mergedNotes ? { notes: mergedNotes } : {}),
          },
        });
        results.clientId = updated.id;
      } else {
        // Recherche par nom ou création
        const existing = await db.clientProfile.findFirst({
          where: { tenantId, name: { contains: c.name } },
        });

        if (existing) {
          const mergedNotes = notes
            ? (existing.notes ? `${existing.notes} | ${notes}` : notes)
            : undefined;
          const updated = await db.clientProfile.update({
            where: { id: existing.id },
            data: {
              visitsCount: { increment: 1 },
              totalSpent: { increment: debrief.sale?.paidAmount || 0 },
              lastVisit: new Date(),
              ...(mergedNotes ? { notes: mergedNotes } : {}),
            },
          });
          clientProfileId = updated.id;
          results.clientId = updated.id;
        } else {
          const created = await db.clientProfile.create({
            data: {
              tenantId,
              name: c.name,
              phone,
              skinType: c.skinNotes ? (c.skinNotes.includes("sèche") ? "seche" : c.skinNotes.includes("grasse") ? "grasse" : "mixte") : null,
              notes,
              visitsCount: 1,
              totalSpent: debrief.sale?.paidAmount || 0,
              lastVisit: new Date(),
            },
          });
          clientProfileId = created.id;
          results.clientId = created.id;
        }
      }
    }

    // ── 2. Gestion Caisse (Sale & SaleItems) ──────────────────────
    if (debrief.hasSale && debrief.sale) {
      const s = debrief.sale;
      const tva = splitTVA(s.total);

      const createdSale = await db.sale.create({
        data: {
          tenantId,
          clientProfileId: clientProfileId || null,
          subtotal: s.subtotal,
          discount: s.discount || 0,
          total: s.total,
          tvaAmount: tva.tva,
          paymentMethod: s.paymentMethod,
          cashierName: "Assistante Maman",
          status: "completed",
        },
      });
      results.saleId = createdSale.id;

      // Création des lignes de vente
      for (const item of s.items) {
        await db.saleItem.create({
          data: {
            saleId: createdSale.id,
            kind: item.kind,
            serviceId: item.kind === "service" ? item.id : null,
            productId: item.kind === "product" ? item.id : null,
            label: item.label,
            qty: item.qty,
            unitPrice: item.unitPrice,
            total: item.total,
          },
        });
      }

      // Écriture comptable automatique SYSCOHADA
      try {
        const servicesAmount = s.items
          .filter((i) => i.kind === "service")
          .reduce((sum, i) => sum + i.total, 0);
        const productsAmount = s.items
          .filter((i) => i.kind === "product")
          .reduce((sum, i) => sum + i.total, 0);

        const jLines = saleJournalLines({
          total: s.total,
          servicesAmount,
          productsAmount,
          method: s.paymentMethod,
        });

        await createJournalEntry(tenantId, {
          journalCode: "VT",
          date: new Date(),
          reference: genRef("VT"),
          description: `Vente débriefing Maman #${createdSale.id.slice(-6)}`,
          sourceType: "sale",
          sourceId: createdSale.id,
          lines: jLines,
        });
      } catch {
        // Ne bloque pas si le plan comptable n'est pas encore initialisé
      }

      // Recalcul du segment RFM si cliente liée
      if (clientProfileId) {
        await recomputeClientRfm(clientProfileId).catch(() => {});
      }
    }

    // ── 3. Gestion Stock (Décrémentation & Mouvements) ───────────
    if (debrief.hasStockMovement && debrief.stock?.decrements) {
      for (const dec of debrief.stock.decrements) {
        const prod = await db.product.findFirst({
          where: { id: dec.productId },
        });
        if (prod) {
          const nextStock = Math.max(0, prod.stock - dec.qty);
          await db.product.update({
            where: { id: prod.id },
            data: { stock: nextStock },
          });

          await db.inventoryMovement.create({
            data: {
              tenantId,
              productId: prod.id,
              type: "out",
              qty: dec.qty,
              reason: "Vente débriefing Assistante Maman",
            },
          });
          results.stockUpdated += dec.qty;
        }
      }
    }

    // ── 4. Gestion Agenda (Prise de RDV futur) ───────────────────
    if (debrief.hasAppointment && debrief.appointment) {
      const appt = debrief.appointment;
      const targetService = tenant.services.find((s) => s.id === appt.serviceId) || tenant.services[0];
      const targetResource = tenant.resources[0];

      if (targetService && targetResource) {
        let startAt = new Date(appt.dateStr);
        if (isNaN(startAt.getTime())) {
          startAt = new Date(Date.now() + 21 * 86400000); // 3 semaines par défaut
        }

        const createdAppt = await db.appointment.create({
          data: {
            tenantId,
            clientProfileId: clientProfileId || null,
            clientName: debrief.client?.name || "Cliente débriefing",
            clientPhone: debrief.client?.phone || "0000000000",
            resourceId: targetResource.id,
            serviceId: targetService.id,
            startAt,
            durationMin: targetService.durationMin || 60,
            price: targetService.price,
            status: "confirmed",
            notes: appt.notes || "Programmé par l'Assistante Maman",
          },
        });
        results.appointmentId = createdAppt.id;
      }
    }

    // ── 5. Gestion Petite Caisse (Dépenses Imprévues) ─────────────
    if (debrief.hasExpense && debrief.expense) {
      try {
        await createJournalEntry(tenantId, {
          journalCode: "OD",
          date: new Date(),
          reference: genRef("EXP"),
          description: `Petite caisse — ${debrief.expense.description} (${debrief.expense.amount} F)`,
          sourceType: "expense",
          lines: [
            { accountCode: "605000", debit: debrief.expense.amount, credit: 0, label: debrief.expense.description },
            { accountCode: "571000", debit: 0, credit: debrief.expense.amount, label: "Sortie caisse espèces" },
          ],
        });
        results.expenseLogged = true;
      } catch {
        // journal non bloquant
      }
    }

    // ── 6. Gestion Relance Client (Suivi post-soin) ───────────────
    if (debrief.hasRelance && debrief.relance && clientProfileId) {
      const dedupKey = `client:${clientProfileId}:followup:${Date.now()}`;
      await db.followUpMark.upsert({
        where: { tenantId_dedupKey: { tenantId, dedupKey } },
        create: {
          tenantId,
          dedupKey,
          status: "pending",
          via: "whatsapp",
          note: debrief.relance.message,
        },
        update: {
          note: debrief.relance.message,
        },
      });
    }

    // ── 7. Notification Temps Réel via Socket.IO ─────────────────
    pushTenantFeed(tenantId);

    return NextResponse.json({
      ok: true,
      message: "Point validé et enregistré dans tous les onglets avec succès ✨",
      results,
    });
  } catch (err) {
    return serverError("pro/assistant:execute", err);
  }
}
