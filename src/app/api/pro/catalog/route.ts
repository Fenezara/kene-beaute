// GET /api/pro/catalog?tenantId= | POST — création service/produit | PATCH — mise à jour partielle
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:catalog:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [services, products] = await Promise.all([
      db.service.findMany({ where: { tenantId: tenant.id }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
      db.product.findMany({ where: { tenantId: tenant.id }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    ]);
    return NextResponse.json({ services, products });
  } catch (err) {
    return serverError("pro/catalog:get", err);
  }
}

const CreateBody = z.object({
  tenantId: z.string().min(1),
  type: z.enum(["service", "product"]),
  data: z.object({
    name: z.string().trim().min(1),
    category: z.string().optional(),
    durationMin: z.number().int().min(5).max(240).optional(),
    price: z.number().int().min(0),
    commissionPct: z.number().min(0).max(100).optional(),
    description: z.string().optional(),
    botanicals: z.string().optional(),
    stock: z.number().int().min(0).optional(),
    stockAlert: z.number().int().min(0).optional(),
    image: z.string().optional(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : avec cookie, la création
    // service/produit exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:catalog:post");
    if (guard) return guard;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide (name + price requis)", 400);
    const { tenantId, type, data } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    if (type === "service") {
      const item = await db.service.create({
        data: {
          tenantId,
          name: data.name,
          category: data.category ?? "soin",
          durationMin: data.durationMin ?? 60,
          price: data.price,
          commissionPct: data.commissionPct ?? 10,
          description: data.description ?? null,
          botanicals: data.botanicals ?? null,
        },
      });
      return NextResponse.json({ item }, { status: 201 });
    }

    const item = await db.product.create({
      data: {
        tenantId,
        name: data.name,
        category: data.category ?? "soin",
        price: data.price,
        stock: data.stock ?? 0,
        stockAlert: data.stockAlert ?? 8,
        description: data.description ?? "",
        botanicals: data.botanicals ?? "",
        image: data.image ?? "/products/serum-moringa.webp",
      },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return serverError("pro/catalog:post", err);
  }
}

const PatchBody = z.object({
  tenantId: z.string().min(1),
  type: z.enum(["service", "product"]),
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

const SERVICE_FIELDS = ["name", "category", "durationMin", "price", "commissionPct", "description", "botanicals", "active"];
const PRODUCT_FIELDS = ["name", "category", "price", "stock", "stockAlert", "description", "botanicals", "image", "active", "compareAt"];

export async function PATCH(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : avec cookie, la mise à jour
    // catalogue exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:catalog:patch");
    if (guard) return guard;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, type, id, data } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    if (type === "service") {
      const service = await db.service.findFirst({ where: { id, tenantId } });
      if (!service) return jsonError("Service introuvable", 404);
      const update: Record<string, unknown> = {};
      for (const key of SERVICE_FIELDS) if (key in data) update[key] = data[key];
      const item = await db.service.update({ where: { id }, data: update });
      return NextResponse.json({ item });
    }

    const product = await db.product.findFirst({ where: { id, tenantId } });
    if (!product) return jsonError("Produit introuvable", 404);

    const update: Record<string, unknown> = {};
    for (const key of PRODUCT_FIELDS) if (key in data) update[key] = data[key];

    // Ajustement de stock tracé par un mouvement d'inventaire « adjust »
    if (typeof data.stock === "number" && data.stock !== product.stock) {
      const delta = data.stock - product.stock;
      await db.inventoryMovement.create({
        data: { tenantId, productId: id, type: "adjust", qty: delta, reason: "Ajustement catalogue (stock réel)" },
      });
    }

    const item = await db.product.update({ where: { id }, data: update });
    return NextResponse.json({ item });
  } catch (err) {
    return serverError("pro/catalog:patch", err);
  }
}
