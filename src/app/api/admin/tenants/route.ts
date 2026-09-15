// GET /api/admin/tenants?q= — instituts partenaires avec KPIs de gestion
// (t. 128 — console de gestion). Liste COMPLETE (actifs ET suspendus) triée
// par CA 30 jours, chaque ligne portant: identité, statut, commission, plan,
// CA boutique + POS 30 j, commandes en cours, clientes CRM, équipe, catalogue.
//
// Sécurité (écriture = lecture sensible ici): contrairement aux routes
// admin/stats|security (lecture agrégée, legacy anonyme toléré + rate-limit),
// la gestion des instituts EXIGE une session admin — PAS de comportement
// legacy sans cookie. 401 sans cookie, 403 pour un autre rôle.
// Contrat: 200 { tenants: AdminTenantRow[] } · 401/403.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, slugify } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

/** Garde stricte (t. 128): la gestion exige un cookie admin signé. */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const sess = sessionFromRequest(req);
  if (!sess) {
    return NextResponse.json(
      { error: "Console de gestion réservée aux comptes admin — reconnecte-toi" },
      { status: 401 },
    );
  }
  if (sess.role !== "admin") {
    return NextResponse.json({ error: "Console admin réservée aux comptes admin" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:tenants"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  const guard = requireAdmin(req);
  if (guard) return guard;
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const tenants = await db.tenant.findMany({ orderBy: { createdAt: "asc" } });

    const rows = await Promise.all(
      tenants.map(async (t) => {
        // CA boutique 30 j (commandes payées/livrées de SES produits) + panier
        // moyen. Les orderItems portent le total — on déduplique les commandes.
        const items = await db.orderItem.findMany({
          where: {
            product: { tenantId: t.id },
            order: { status: { in: ["paid", "delivered"] }, createdAt: { gte: since30 } },
          },
          select: { total: true, orderId: true },
        });
        const caBoutique30 = items.reduce((s, i) => s + i.total, 0);
        const orders30 = new Set(items.map((i) => i.orderId)).size;

        const [sales30, pendingOrders, clientsCrm, employees, products] = await Promise.all([
          db.sale.aggregate({
            where: { tenantId: t.id, status: "completed", createdAt: { gte: since30 } },
            _sum: { total: true },
          }),
          db.order.count({
            where: { status: "pending", items: { some: { product: { tenantId: t.id } } } },
          }),
          db.clientProfile.count({ where: { tenantId: t.id } }),
          db.employee.count({ where: { tenantId: t.id, active: true } }),
          db.product.count({ where: { tenantId: t.id, active: true } }),
        ]);

        return {
          id: t.id,
          name: t.name,
          city: t.city,
          country: t.country,
          phone: t.phone,
          ownerName: t.ownerName,
          ownerPhone: t.ownerPhone,
          plan: t.plan,
          commissionRate: t.commissionRate,
          rating: t.rating,
          reviewCount: t.reviewCount,
          active: t.active,
          suspendedAt: t.suspendedAt?.toISOString() ?? null,
          suspendedReason: t.suspendedReason,
          createdAt: t.createdAt.toISOString(),
          caBoutique30,
          caPos30: sales30._sum.total ?? 0,
          orders30,
          pendingOrders,
          clientsCrm,
          employees,
          products,
        };
      }),
    );

    // Recherche insensible casse/accents (pattern SQLite du projet)
    const filtered = q
      ? rows.filter((r) =>
          [r.name, r.city, r.ownerName, r.ownerPhone, r.phone]
            .some((f) => f && (f.toLowerCase().includes(q) || slugify(f).includes(slugify(q)))),
        )
      : rows;

    // Tri: CA total 30 j décroissant — la console montre d'abord ce qui vit.
    filtered.sort((a, b) => b.caBoutique30 + b.caPos30 - (a.caBoutique30 + a.caPos30));

    return NextResponse.json({ tenants: filtered });
  } catch (err) {
    return serverError("admin/tenants", err);
  }
}
