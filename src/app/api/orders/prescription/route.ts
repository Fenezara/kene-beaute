// POST /api/orders/prescription — Commande directe d'un produit prescrit sur ordonnance beauté
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { pushTenantFeed } from "@/lib/kene/realtime";
import { guardUserClaim } from "@/lib/kene/session";
import { getDefaultCabinetTenant } from "@/lib/kene/tenant-defaults";

const Body = z.object({
  userId: z.string().min(1),
  productName: z.string().min(1),
  price: z.number().int().min(0).optional(),
  posology: z.string().optional(),
  moment: z.string().optional(),
  tenantId: z.string().optional(),
  tenantName: z.string().optional(),
  deliveryPhone: z.string().optional(),
  deliveryAddress: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null);
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return jsonError("Corps de requête invalide", 400);
    }

    const { userId, productName, price = 15000, posology, moment, tenantId, deliveryPhone, deliveryAddress } = parsed.data;

    const guard = guardUserClaim(req, "orders:prescription", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, selectedTenantId: true },
    });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    // Résolution du salon partenaire (Cabinet LA DERMO par défaut)
    let tenant: { id: string; name: string; phone?: string | null } | null = null;
    if (tenantId) {
      tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    }
    if (!tenant && user.selectedTenantId) {
      tenant = await db.tenant.findUnique({ where: { id: user.selectedTenantId } });
    }
    if (!tenant) {
      tenant = await getDefaultCabinetTenant();
    }
    if (!tenant) {
      return jsonError("Aucun institut partenaire disponible", 404);
    }

    // Recherche ou création automatique du produit sous cet institut
    const allProducts = await db.product.findMany({
      where: {
        tenantId: tenant.id,
      },
    });
    let product = allProducts.find((p) => p.name.trim().toLowerCase() === productName.trim().toLowerCase()) ?? null;

    if (!product) {
      product = await db.product.create({
        data: {
          tenantId: tenant.id,
          name: productName,
          price: price > 0 ? price : 15000,
          stock: 50,
          active: true,
          category: "visage",
          description: `Soin prescrit en ordonnance beauté (${moment || "quotidien"}). ${posology || ""}`,
          botanicals: "[]",
          image: "/products/creme-visage.webp",
        },
      });
    }

    const itemPrice = price > 0 ? price : product.price;

    // Création de la commande réelle chez l'institut
    const order = await db.order.create({
      data: {
        userId: user.id,
        subtotal: itemPrice,
        total: itemPrice,
        status: "pending",
        deliveryPhone: deliveryPhone || user.phone,
        deliveryAddress: deliveryAddress || "Retrait en institut ou livraison à convenir",
        deliveryNotes: `Commande issue de l'ordonnance beauté Kènè · ${productName}${posology ? ` (${posology})` : ""}`,
        items: {
          create: [
            {
              productId: product.id,
              label: productName,
              qty: 1,
              unitPrice: itemPrice,
              total: itemPrice,
            },
          ],
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, tenantId: true } },
          },
        },
      },
    });

    const ref = order.id.slice(-6).toUpperCase();

    // Notification et push temps-réel à l'institut
    pushTenantFeed(tenant.id);

    notify({
      userId: user.id,
      tenantId: tenant.id,
      channel: "whatsapp",
      toPhone: user.phone,
      message: `${user.name} a commandé « ${productName} » (${itemPrice.toLocaleString("fr-FR")} FCFA) depuis son ordonnance beauté (Réf #${ref}).`,
    });

    return NextResponse.json(
      {
        ok: true,
        order,
        message: `Commande #${ref} transmise avec succès à « ${tenant.name} » !`,
      },
      { status: 201 }
    );
  } catch (err) {
    return serverError("orders:prescription", err);
  }
}
