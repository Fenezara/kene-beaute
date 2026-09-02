// GET /api/pro/sales?tenantId=&limit= | POST — vente caisse (POS) avec comptabilité + CRM auto
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { splitTVA, saleJournalLines } from "@/lib/accounting/syscohada";
import { jsonError, serverError, resolveTenant, createJournalEntry, recomputeClientRfm, genRef } from "@/lib/kene/server";
import { pushTenantFeed } from "@/lib/kene/realtime";

export async function GET(req: NextRequest) {
  try {
    const tenant = await resolveTenant(req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), 100) : 30;

    const sales = await db.sale.findMany({
      where: { tenantId: tenant.id },
      include: {
        items: true,
        clientProfile: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ sales });
  } catch (err) {
    return serverError("pro/sales:get", err);
  }
}

const Body = z.object({
  tenantId: z.string().min(1),
  items: z
    .array(z.object({ kind: z.enum(["service", "product"]), id: z.string().min(1), qty: z.number().int().min(1).max(50) }))
    .min(1),
  paymentMethod: z.enum(["wave", "orange", "cash", "card", "wallet"]),
  clientProfileId: z.string().optional(),
  discount: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, items, paymentMethod, discount } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    let clientProfile: Awaited<ReturnType<typeof db.clientProfile.findFirst>> = null;
    if (parsed.data.clientProfileId) {
      clientProfile = await db.clientProfile.findFirst({ where: { id: parsed.data.clientProfileId, tenantId } });
      if (!clientProfile) return jsonError("Fiche cliente introuvable", 404);
    }

    // Résolution des lignes (prestations + produits)
    const lines: { kind: "service" | "product"; serviceId?: string; productId?: string; label: string; qty: number; unitPrice: number; total: number }[] = [];
    for (const item of items) {
      if (item.kind === "service") {
        const service = await db.service.findFirst({ where: { id: item.id, tenantId, active: true } });
        if (!service) return jsonError(`Prestation introuvable : ${item.id}`, 404);
        lines.push({ kind: "service", serviceId: service.id, label: service.name, qty: item.qty, unitPrice: service.price, total: service.price * item.qty });
      } else {
        const product = await db.product.findFirst({ where: { id: item.id } });
        if (!product) return jsonError(`Produit introuvable : ${item.id}`, 404);
        if (product.stock < item.qty) return jsonError(`Stock insuffisant pour « ${product.name} » (${product.stock} dispo)`, 400);
        lines.push({ kind: "product", productId: product.id, label: product.name, qty: item.qty, unitPrice: product.price, total: product.price * item.qty });
      }
    }

    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const disc = Math.min(discount ?? 0, subtotal);
    const total = subtotal - disc;
    const { tva } = splitTVA(total);
    const servicesAmount = lines.filter((l) => l.kind === "service").reduce((s, l) => s + l.total, 0);
    const productsAmount = subtotal - servicesAmount;

    const sale = await db.sale.create({
      data: {
        tenantId,
        clientProfileId: clientProfile?.id ?? null,
        subtotal,
        discount: disc,
        total,
        tvaAmount: tva,
        paymentMethod,
        status: "completed",
        items: { create: lines.map(({ kind, serviceId, productId, label, qty, unitPrice, total: lineTotal }) => ({ kind, serviceId: serviceId ?? null, productId: productId ?? null, label, qty, unitPrice, total: lineTotal })) },
      },
      include: { items: true },
    });

    // Sorties de stock produits + mouvements
    for (const l of lines) {
      if (l.kind !== "product" || !l.productId) continue;
      await db.product.update({ where: { id: l.productId }, data: { stock: { decrement: l.qty } } });
      await db.inventoryMovement.create({
        data: { tenantId, productId: l.productId, type: "out", qty: l.qty, reason: `Vente POS ${sale.id.slice(-6).toUpperCase()}` },
      });
    }

    // Écriture comptable automatique (CA si espèces, sinon BQ)
    await createJournalEntry(tenantId, {
      journalCode: paymentMethod === "cash" ? "CA" : "BQ",
      date: new Date(),
      reference: genRef("VE"),
      description: `Vente caisse ${sale.id.slice(-6).toUpperCase()} — ${lines.length} ligne(s)${disc ? ` (remise ${disc})` : ""}`,
      sourceType: "sale",
      sourceId: sale.id,
      lines: saleJournalLines({ total, servicesAmount, productsAmount, method: paymentMethod }),
    });

    // CRM : visites, CA, dernier passage, RFM
    if (clientProfile) {
      await db.clientProfile.update({
        where: { id: clientProfile.id },
        data: { visitsCount: { increment: 1 }, totalSpent: { increment: total }, lastVisit: new Date() },
      });
      await recomputeClientRfm(clientProfile.id);
    }

    // Temps réel : le dashboard de l'institut (CA du jour, badge) se met à jour
    // sans reload — best-effort, le poll du service rattrape sinon.
    pushTenantFeed(tenantId);

    return NextResponse.json({ sale }, { status: 201 });
  } catch (err) {
    return serverError("pro/sales:post", err);
  }
}
