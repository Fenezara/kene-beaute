// GET /api/shop/products?category=&q= — boutique Kènè (produits marketplace, tenantId null)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, slugify } from "@/lib/kene/server";

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get("category")?.trim().toLowerCase() ?? "";
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

    const all = await db.product.findMany({
      where: { tenantId: null, active: true, stock: { gt: 0 } },
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
