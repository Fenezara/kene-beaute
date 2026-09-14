// GET /api/shop/products?category=&q= — boutique marketplace Kènè (t. 113) :
// produits MAISON Kènè (tenantId null) ET produits des INSTITUTS actifs —
// chaque produit porte son vendeur (`tenant` : id, nom, ville, type) pour que
// la cliente choisisse et navigue PAR INSTITUT. Les instituts inactifs ou en
// rupture totale (stock 0) restent naturellement absents du catalogue.
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
        // marketplace : la maison (tenantId null) + les instituts actifs
        OR: [{ tenantId: null }, { tenant: { active: true } }],
      },
      include: { tenant: { select: { id: true, name: true, city: true, type: true } } },
      orderBy: { name: "asc" },
    });

    const products = all
      .filter((p) => !category || p.category.toLowerCase() === category)
      .filter((p) => !q || slugify(p.name).includes(slugify(q)) || slugify(p.description).includes(slugify(q)));

    return NextResponse.json({ products });
  } catch (err) {
    return serverError("shop/products", err);
  }
}
