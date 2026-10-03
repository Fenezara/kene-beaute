// GET /api/orders/invoice?id= — Téléchargement de la facture / reçu officiel de commande boutique en PDF
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { orderInvoicePdf } from "@/lib/kene/order-invoice-pdf";

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("id")?.trim() || req.nextUrl.searchParams.get("orderId")?.trim();
    if (!orderId) {
      return jsonError("Identifiant de commande (id) requis", 400);
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: {
                tenant: true,
              },
            },
          },
        },
        user: true,
        payment: true,
      },
    });

    if (!order) {
      return jsonError("Commande introuvable", 404);
    }

    // Sécurité : l'utilisatrice propriétaire ou le pro de l'institut vendeur peut accéder à la facture
    const guard = guardUserClaim(req, "orders:invoice", order.userId);
    if (guard) {
      const proTenant = await resolveTenant(req);
      const isVendorTenant = proTenant && order.items.some((i) => i.product?.tenantId === proTenant.id);
      if (!isVendorTenant) {
        return guard;
      }
    }

    // Institut vendeur (si tous les produits proviennent d'un même institut)
    const productTenants = order.items
      .map((i) => i.product?.tenant)
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const firstTenant = productTenants.length > 0 ? productTenants[0] : null;

    const invoiceData = {
      order: {
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        deliveryCity: order.deliveryCity,
        deliveryArea: order.deliveryArea,
        deliveryAddress: order.deliveryAddress,
        deliveryPhone: order.deliveryPhone,
        discount: order.discount,
        couponCode: order.couponCode,
        cashback: order.cashback,
        total: order.total,
        paymentId: order.paymentId,
      },
      items: order.items.map((it) => ({
        id: it.id,
        label: it.label,
        qty: it.qty,
        unitPrice: it.unitPrice,
        total: it.total,
        botanicals: it.product?.botanicals ?? null,
      })),
      user: {
        id: order.user.id,
        name: order.user.name,
        phone: order.user.phone,
        city: order.user.city ?? null,
      },
      tenant: firstTenant
        ? {
            id: firstTenant.id,
            name: firstTenant.name,
            city: firstTenant.city,
            address: firstTenant.address,
            phone: firstTenant.phone,
          }
        : null,
      payment: order.payment
        ? {
            id: order.payment.id,
            ref: order.payment.ref,
            method: order.payment.method,
            status: order.payment.status,
            confirmedAt: order.payment.confirmedAt,
          }
        : null,
    };

    const pdf = orderInvoicePdf(invoiceData);
    const filename = `kene-recu-${order.id.slice(-6).toUpperCase()}.pdf`;

    return new NextResponse(Buffer.from(pdf.data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdf.data.byteLength),
        "Cache-Control": "private, no-transform, max-age=3600",
      },
    });
  } catch (err) {
    return serverError("orders:invoice", err);
  }
}
