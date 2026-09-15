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
import { toCsv, csvDate, type CsvCell } from "@/lib/accounting/csv";
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

    // t. 140 — EXPORT CSV instituts: le réseau au complet avec ses KPIs de
    // gestion (CA 30 j, commission, plan, équipe) — hors recherche éventuelle.
    if (req.nextUrl.searchParams.get("format") === "csv") {
      const PLAN: Record<string, string> = { trial: "Essai", pro: "Pro", business: "Business" };
      const rowsCsv: CsvCell[][] = [
        ["Console Kènè — Instituts partenaires"],
        ["Réseau complet avec KPIs de gestion (CA 30 jours, commission, plan, équipe)"],
        [`Édité le ${csvDate(new Date())} · ${rows.length} instituts · montants en FCFA`],
        [],
        ["Institut", "Ville", "Pays", "Gérante", "Téléphone", "Plan", "Commission", "CA boutique 30 j", "CA caisse 30 j", "CA total 30 j", "Commandes 30 j", "En attente", "Clientes CRM", "Employés", "Produits", "Statut"],
      ];
      let totB = 0;
      let totP = 0;
      for (const r of [...rows].sort((a, b) => b.caBoutique30 + b.caPos30 - (a.caBoutique30 + a.caPos30))) {
        totB += r.caBoutique30;
        totP += r.caPos30;
        rowsCsv.push([
          r.name,
          r.city,
          r.country,
          r.ownerName,
          r.ownerPhone,
          PLAN[r.plan] ?? r.plan,
          `${(r.commissionRate * 100).toFixed(1).replace(".", ",")} %`,
          r.caBoutique30,
          r.caPos30,
          r.caBoutique30 + r.caPos30,
          r.orders30,
          r.pendingOrders,
          r.clientsCrm,
          r.employees,
          r.products,
          r.active ? "En ligne" : "Suspendu",
        ]);
      }
      rowsCsv.push(
        [],
        ["TOTAUX", "", "", "", "", "", "", totB, totP, totB + totP],
        ["CA boutique = commandes app payées/livrées de SES produits · CA caisse = ventes completed (POS)"],
      );
      const stamp = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}`;
      return new NextResponse(toCsv(rowsCsv), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="kene-instituts-${stamp}.csv"`,
          "X-Rows-Count": String(rows.length),
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ tenants: filtered });
  } catch (err) {
    return serverError("admin/tenants", err);
  }
}
