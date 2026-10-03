// GET /api/pro/sales/receipt — Retourne le ticket thermique HTML (80mm ou 58mm)
// Protégé: session pro/admin + isolation tenant. Rate-limit ADMIN_STATS (stats légères).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateThermalReceiptHtml, ThermalFormat } from "@/lib/accounting/receipt-thermal";
import { guardProRole } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { jsonError, serverError } from "@/lib/kene/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Garde 1 — rate-limit (30/min par IP)
  const rl = rateLimit(rlKey(req, "pro:sales:receipt"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  // Garde 2 — session pro/admin obligatoire
  const guard = guardProRole(req, "pro:sales:receipt:get");
  if (guard) return guard;

  try {
    const { searchParams } = req.nextUrl;
    const saleId = searchParams.get("id");
    const tenantId = searchParams.get("tenantId");
    const format = (searchParams.get("format") === "58mm" ? "58mm" : "80mm") as ThermalFormat;

    if (!saleId) {
      return jsonError("Paramètre 'id' manquant", 400);
    }

    const sale = await db.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        clientProfile: true,
      },
    });

    if (!sale) {
      return jsonError("Vente introuvable", 404);
    }

    if (tenantId && sale.tenantId !== tenantId) {
      return jsonError("Accès refusé", 403);
    }

    const tenant = await db.tenant.findUnique({
      where: { id: sale.tenantId },
    });

    const receiptHtml = generateThermalReceiptHtml(
      {
        tenantName: tenant?.name || "Kènè Salon & Spa",
        tenantAddress: [tenant?.city, tenant?.address].filter(Boolean).join(" - "),
        tenantPhone: tenant?.phone || undefined,
        tenantTaxId: undefined,
        receiptNumber: (sale.paymentRef || sale.id).slice(-8).toUpperCase(),
        createdAt: sale.createdAt,
        cashierName: sale.cashierName || "Caisse Principale",
        clientName: sale.clientProfile?.name || undefined,
        clientPhone: sale.clientProfile?.phone || undefined,
        items: (sale.items || []).map((it) => ({
          label: it.label,
          qty: it.qty,
          unitPrice: it.unitPrice,
          total: it.total,
          kind: it.kind === "product" ? "product" : "service",
        })),
        subtotal: sale.subtotal || sale.total,
        discount: sale.discount || 0,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        paymentRef: sale.paymentRef || undefined,
      },
      format
    );

    return new NextResponse(receiptHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    return serverError("pro/sales/receipt:get", err);
  }
}

