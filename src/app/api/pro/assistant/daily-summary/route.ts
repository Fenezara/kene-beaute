// Kènè Pro — GET /api/pro/assistant/daily-summary
// Le « Point du Soir » : Bilan chiffré et vocal de fin de journée pour la Maman
// Calcule l'encaissement du jour (Wave, Orange, Espèces), clientes servies et alertes stock.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:assistant:daily-summary");
    if (guard) return guard;

    const tenantId = req.nextUrl.searchParams.get("tenantId");
    if (!tenantId) return jsonError("tenantId requis", 400);

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        products: { where: { active: true } },
      },
    });
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Début de journée locale (00:00:00)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const salesToday = await db.sale.findMany({
      where: {
        tenantId,
        createdAt: { gte: todayStart },
        status: "completed",
      },
      include: {
        items: true,
      },
    });

    let total = 0;
    let waveTotal = 0;
    let orangeTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let servicesCount = 0;
    let productsCount = 0;

    for (const sale of salesToday) {
      total += sale.total;
      if (sale.paymentMethod === "wave") waveTotal += sale.total;
      else if (sale.paymentMethod === "orange") orangeTotal += sale.total;
      else if (sale.paymentMethod === "cash") cashTotal += sale.total;
      else if (sale.paymentMethod === "card") cardTotal += sale.total;

      for (const it of sale.items) {
        if (it.kind === "service") servicesCount += it.qty;
        else if (it.kind === "product") productsCount += it.qty;
      }
    }

    // Produits en alerte de stock
    const lowStockProducts = tenant.products
      .filter((p) => p.stock <= p.stockAlert)
      .map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        stockAlert: p.stockAlert,
      }));

    // Clients uniques aujourd'hui
    const uniqueClientsCount = new Set(salesToday.map((s) => s.clientProfileId).filter(Boolean)).size;

    // Synthèse vocale chaleureuse pour la Maman
    const vocalSummary = `Bonsoir Maman ! Aujourd'hui, l'institut a réalisé ${total.toLocaleString("fr-FR")} francs de chiffre d'affaires. ` +
      `Dont ${waveTotal.toLocaleString("fr-FR")} francs par Wave, ${orangeTotal.toLocaleString("fr-FR")} francs par Orange Money, et ${cashTotal.toLocaleString("fr-FR")} francs en espèces au comptoir. ` +
      `Vous avez servi ${salesToday.length} clientes. ` +
      (lowStockProducts.length > 0
        ? `Attention Maman, il y a ${lowStockProducts.length} produit${lowStockProducts.length > 1 ? "s" : ""} en fin de stock à recommander.`
        : "Tous les stocks sont bien approvisionnés. Repose-toi bien !");

    return NextResponse.json({
      summary: {
        total,
        waveTotal,
        orangeTotal,
        cashTotal,
        cardTotal,
        salesCount: salesToday.length,
        uniqueClientsCount,
        servicesCount,
        productsCount,
        lowStockProducts,
        vocalSummary,
      },
    });
  } catch (err) {
    return serverError("pro/assistant:daily-summary", err);
  }
}
