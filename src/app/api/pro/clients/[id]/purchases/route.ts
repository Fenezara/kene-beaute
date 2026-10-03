// POST /api/pro/clients/[id]/purchases?tenantId=
// Enregistrement direct d'un achat de produit cosmétique dans le dossier patient
// avec prix sur-mesure pour cette cliente.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

const PostPurchaseBody = z.object({
  productId: z.string().optional().nullable(),
  label: z.string().trim().min(1).max(120),
  unitPrice: z.number().int().min(0).max(10_000_000),
  qty: z.number().int().min(1).max(50).default(1),
  paymentMethod: z.enum(["cash", "wave", "orange", "card", "wallet"]).default("cash"),
  reason: z.string().trim().max(250).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = guardProRole(req, "pro:clients:purchases:post");
    if (guard) return guard;

    const { id: clientId } = await params;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const client = await db.clientProfile.findFirst({
      where: { id: clientId, tenantId: tenant.id },
    });
    if (!client) return jsonError("Fiche cliente introuvable dans cet institut", 404);

    const parsed = PostPurchaseBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError("Données de l'achat invalides", 400);
    }

    const { productId, label, unitPrice, qty, paymentMethod, reason } = parsed.data;
    const total = unitPrice * qty;

    let resolvedProductId: string | null = null;
    let resolvedLabel = label;

    if (productId) {
      const product = await db.product.findUnique({ where: { id: productId } });
      if (product) {
        resolvedProductId = product.id;
        resolvedLabel = label || product.name;
        // Décrémente le stock si positif
        if (product.stock >= qty) {
          await db.product.update({
            where: { id: product.id },
            data: { stock: { decrement: qty } },
          });
        }
      }
    }

    const sale = await db.sale.create({
      data: {
        tenantId: tenant.id,
        clientProfileId: client.id,
        subtotal: total,
        discount: 0,
        total,
        paymentMethod,
        cashierName: "Dossier patient",
        status: "completed",
        items: {
          create: [
            {
              kind: "product",
              productId: resolvedProductId,
              label: resolvedLabel,
              qty,
              unitPrice,
              total,
              customPriceReason: reason && reason.length > 0 ? reason : "Enregistré dans le dossier patient",
            },
          ],
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                botanicals: true,
                category: true,
                brandLine: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // Mise à jour du profil client
    await db.clientProfile.update({
      where: { id: client.id },
      data: {
        totalSpent: { increment: total },
        visitsCount: { increment: 1 },
        lastVisit: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      sale,
    });
  } catch (err) {
    return serverError("pro/clients/[id]/purchases POST", err);
  }
}
