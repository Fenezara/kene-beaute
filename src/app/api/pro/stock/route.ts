// GET /api/pro/stock?tenantId= | POST — mouvement d'inventaire (in / out / loss)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, notify } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:stock:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [products, movements] = await Promise.all([
      db.product.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
      db.inventoryMovement.findMany({
        where: { tenantId: tenant.id },
        include: { product: { select: { name: true, category: true, image: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      products: products.map((p) => ({ ...p, alert: p.stock <= p.stockAlert })),
      movements,
    });
  } catch (err) {
    return serverError("pro/stock:get", err);
  }
}

const Body = z.object({
  tenantId: z.string().min(1),
  productId: z.string().min(1),
  type: z.enum(["in", "out", "loss"]),
  qty: z.number().int().min(1),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Session signée (, migration douce): avec cookie, le mouvement
    // d'inventaire exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:stock:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, productId, type, qty, reason } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const product = await db.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) return jsonError("Produit introuvable", 404);

    const movement = await db.inventoryMovement.create({
      data: {
        tenantId,
        productId,
        type,
        qty,
        reason: reason ?? { in: "Réception fournisseur", out: "Sortie manuelle", loss: "Perte / casse" }[type],
      },
    });

    const updated = await db.product.update({
      where: { id: productId },
      data: { stock: type === "in" ? { increment: qty } : { decrement: qty } },
    });

    if (type !== "in" && updated.stock <= updated.stockAlert) {
      await notify({
        tenantId,
        channel: "whatsapp",
        toPhone: tenant.phone,
        message: `⚠️ Kènè Stock : « ${updated.name} » est à ${updated.stock} unités (seuil d'alerte ${updated.stockAlert}). Pensez à réapprovisionner.`,
      });
    }

    return NextResponse.json({ product: updated, movement }, { status: 201 });
  } catch (err) {
    return serverError("pro/stock:post", err);
  }
}
