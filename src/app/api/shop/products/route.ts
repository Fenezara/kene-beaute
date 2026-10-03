// GET /api/shop/products?category=&q= — boutique marketplace Kènè:
// Seules les entreprises partenaires (instituts, cabinets, spas) vendent des
// produits. Le fondateur (Dermo TIC) est une entreprise de développement
// d'applications et ne vend aucun produit. Chaque produit est rattaché à son
// entreprise vendeuse (`tenant`).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, slugify } from "@/lib/kene/server";

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get("category")?.trim().toLowerCase() ?? "";
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

    const all = await db.product.findMany({
      where: {
        active: true,
        stock: { gt: 0 },
        // Seules les entreprises enregistrées vendent des produits:
        tenantId: { not: null },
        tenant: { active: true },
      },
      include: { tenant: { select: { id: true, name: true, city: true, type: true, photoData: true } } },
      orderBy: { name: "asc" },
    });

    // — la photo réelle (photoData, data URL lourde) ne part JAMAIS
    // dans le payload: un booléen hasPhoto suffit, l'UI charge
    // /api/media/product/:id (photo institut) qui prime sur le visuel studio.
    const products = all
      .filter((p) => !category || p.category.toLowerCase() === category)
      .filter((p) => !q || slugify(p.name).includes(slugify(q)) || slugify(p.description).includes(slugify(q)))
      .map((p) => {
        const { photoData, tenant, ...rest } = p;
        return {
          ...rest,
          hasPhoto: Boolean(photoData),
          tenant: tenant
            ? { id: tenant.id, name: tenant.name, city: tenant.city, type: tenant.type, hasPhoto: Boolean(tenant.photoData) }
            : null,
        };
      });

    return NextResponse.json({ products });
  } catch (err) {
    return serverError("shop/products", err);
  }
}
