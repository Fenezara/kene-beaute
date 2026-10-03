// PATCH /api/pro/clients/[id]/purchases/[itemId]?tenantId=
// Modification exclusive du prix d'un produit cosmétique acheté par la cliente,
// UNIQUEMENT au sein de son dossier patient.
// IMPORTANT : Ne modifie JAMAIS le prix du produit dans le catalogue général de l'institut.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

const PatchPriceBody = z.object({
  unitPrice: z.number().int().min(0).max(10_000_000),
  reason: z.string().trim().max(250).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const guard = guardProRole(req, "pro:clients:purchases:patch");
    if (guard) return guard;

    const { id: clientId, itemId } = await params;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const client = await db.clientProfile.findFirst({
      where: { id: clientId, tenantId: tenant.id },
    });
    if (!client) return jsonError("Fiche cliente introuvable dans cet institut", 404);

    const parsed = PatchPriceBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError("Prix unitaire invalide (nombre positif requis)", 400);
    }

    const { unitPrice, reason } = parsed.data;

    // Récupération de la ligne d'achat avec vérification de propriété
    const item = await db.saleItem.findUnique({
      where: { id: itemId },
      include: { sale: true },
    });

    if (!item) {
      return jsonError("Ligne d'achat cosmétique introuvable", 404);
    }

    if (item.sale.tenantId !== tenant.id || item.sale.clientProfileId !== client.id) {
      return jsonError("Cet achat n'appartient pas à cette cliente dans cet établissement", 403);
    }

    if (item.kind !== "product") {
      return jsonError("Seuls les achats de produits cosmétiques peuvent être ajustés dans le dossier patient", 400);
    }

    const newTotal = unitPrice * item.qty;

    // Mise à jour de la ligne d'achat pour cette cliente
    const updatedItem = await db.saleItem.update({
      where: { id: itemId },
      data: {
        unitPrice,
        total: newTotal,
        customPriceReason: reason && reason.length > 0 ? reason : "Ajusté dans le dossier patient",
      },
    });

    // Recalcul du sous-total et total de la vente parente
    const allSaleItems = await db.saleItem.findMany({
      where: { saleId: item.saleId },
      select: { total: true },
    });
    const newSubtotal = allSaleItems.reduce((acc, it) => acc + it.total, 0);
    const newSaleTotal = Math.max(0, newSubtotal - (item.sale.discount ?? 0));

    await db.sale.update({
      where: { id: item.saleId },
      data: {
        subtotal: newSubtotal,
        total: newSaleTotal,
      },
    });

    // Recalcul du total dépensé par la cliente sur toutes ses ventes finalisées
    const completedSales = await db.sale.findMany({
      where: { clientProfileId: client.id, status: "completed" },
      select: { total: true },
    });
    const newTotalSpent = completedSales.reduce((acc, s) => acc + s.total, 0);

    await db.clientProfile.update({
      where: { id: client.id },
      data: { totalSpent: newTotalSpent },
    });

    return NextResponse.json({
      success: true,
      item: updatedItem,
      saleTotal: newSaleTotal,
      clientTotalSpent: newTotalSpent,
    });
  } catch (err) {
    return serverError("pro/clients/[id]/purchases/[itemId] PATCH", err);
  }
}
