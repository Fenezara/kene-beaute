// GET /api/admin/tenants/[id] · PATCH /api/admin/tenants/[id] — fiche de
// gestion d'un institut (t. 128 — console de gestion).
//
// GET: fiche complète LECTURE SEULE: identité, KPIs (CA boutique/POS 30 j,
// commandes, clientes CRM, diagnostics cabine, RDV à venir), équipe active,
// top produits vendus, 5 dernières ventes et commandes, prochains RDV.
// Jamais de photoData binaire dans le payload (servie par /api/media).
//
// PATCH: les leviers de gestion — { active?, reason?, commissionRate?, plan? }
//   ⚠ t. 130 — STEP-UP: ce PATCH exige une session admin + une ÉLÉVATION
//   fraîche (< 5 min, code confirmé) — ASVS V2.7 sur les actions sensibles.
// • active=false + reason (requis): SUSPENSION — l'institut quitte la vitrine
//   (annuaire, boutique, réservations), ses comptes pro sont refusés à la
//   connexion (verify) et ses sessions ouvertes se ferment (resolveTenant +
//   auth/session). Réversible à 100%: les données restent intactes.
// • active=true: RÉACTIVATION (purge suspendedAt/Reason).
// • commissionRate: 0..0.30 (Kènè prélève sur les ventes boutique de
//   l'institut — appliqué aux futures commandes, le passé est figé).
// • plan: trial | pro | business.
// La gérante est notifiée sur son compte app à chaque décision.
//
// Sécurité: session admin EXIGÉE (401 sans cookie, 403 autre rôle) — ces
// écritures n'ont PAS de mode legacy anonyme. Audit syscô pour chaque geste.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { sessionFromRequest, guardAdminElevated } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { requireAdmin } from "../route";

export const runtime = "nodejs";

const Body = z.object({
  active: z.boolean().optional(),
  reason: z.string().trim().min(3, "Motif requis (min. 3 caractères)").max(280).optional(),
  commissionRate: z
    .number({ message: "Commission invalide (nombre attendu)" })
    .min(0, "Commission entre 0 et 30 %")
    .max(0.3, "Commission entre 0 et 30 %")
    .optional(),
  plan: z.enum(["trial", "pro", "business"]).optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "admin:tenant"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  const guard = requireAdmin(req);
  if (guard) return guard;
  try {
    const { id } = await ctx.params;
    const t = await db.tenant.findUnique({ where: { id } });
    if (!t) return jsonError("Institut introuvable", 404);

    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const now = new Date();
    const items = await db.orderItem.findMany({
      where: {
        product: { tenantId: t.id },
        order: { status: { in: ["paid", "delivered"] }, createdAt: { gte: since30 } },
      },
      select: { total: true, orderId: true, qty: true, product: { select: { id: true, name: true } } },
    });
    const orders30 = new Set(items.map((i) => i.orderId)).size;
    const caBoutique30 = items.reduce((s, i) => s + i.total, 0);
    // Top produits vendus 30 j (par CA)
    const byProduct = new Map<string, { name: string; qty: number; ca: number }>();
    for (const i of items) {
      const key = i.product?.id ?? "?";
      const cur = byProduct.get(key) ?? { name: i.product?.name ?? "—", qty: 0, ca: 0 };
      cur.qty += i.qty;
      cur.ca += i.total;
      byProduct.set(key, cur);
    }
    const topProducts = [...byProduct.values()].sort((a, b) => b.ca - a.ca).slice(0, 5);

    const [sales30, pendingOrders, clientsCrm, team, proDiag30, upcoming, lastSales, lastOrders] =
      await Promise.all([
        db.sale.aggregate({
          where: { tenantId: t.id, status: "completed", createdAt: { gte: since30 } },
          _sum: { total: true },
        }),
        db.order.count({
          where: { status: "pending", items: { some: { product: { tenantId: t.id } } } },
        }),
        db.clientProfile.count({ where: { tenantId: t.id } }),
        db.employee.findMany({
          where: { tenantId: t.id, active: true },
          select: { name: true, role: true },
          orderBy: { name: "asc" },
        }),
        db.proDiagnosis.count({ where: { tenantId: t.id, createdAt: { gte: since30 } } }),
        db.appointment.count({
          where: { tenantId: t.id, startAt: { gte: now }, status: { in: ["booked", "confirmed"] } },
        }),
        db.sale.findMany({
          where: { tenantId: t.id },
          select: { id: true, total: true, createdAt: true, clientProfile: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        db.order.findMany({
          where: { items: { some: { product: { tenantId: t.id } } } },
          select: {
            id: true,
            status: true,
            total: true,
            createdAt: true,
            user: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);

    return NextResponse.json({
      tenant: {
        id: t.id,
        name: t.name,
        type: t.type,
        city: t.city,
        country: t.country,
        address: t.address,
        phone: t.phone,
        ownerName: t.ownerName,
        ownerPhone: t.ownerPhone,
        plan: t.plan,
        commissionRate: t.commissionRate,
        rating: t.rating,
        reviewCount: t.reviewCount,
        description: t.description,
        openingHour: t.openingHour,
        closingHour: t.closingHour,
        active: t.active,
        suspendedAt: t.suspendedAt?.toISOString() ?? null,
        suspendedReason: t.suspendedReason,
        createdAt: t.createdAt.toISOString(),
        caBoutique30,
        caPos30: sales30._sum.total ?? 0,
        orders30,
        pendingOrders,
        clientsCrm,
        employees: team.length,
        products: await db.product.count({ where: { tenantId: t.id, active: true } }),
        proDiag30,
        upcomingAppointments: upcoming,
        team: team.map((e) => ({ name: e.name, role: e.role })),
        topProducts,
        lastSales: lastSales.map((s) => ({
          id: s.id,
          total: s.total,
          clientName: s.clientProfile?.name ?? "Cliente express",
          createdAt: s.createdAt.toISOString(),
        })),
        lastOrders: lastOrders.map((o) => ({
          id: o.id,
          status: o.status,
          total: o.total,
          clientName: o.user?.name ?? "—",
          createdAt: o.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    return serverError("admin/tenant", err);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "admin:tenant:patch"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop d'actions — réessaie dans une minute");
  // t. 130 — step-up: session admin + élévation fraîche (garde complète:
  // 401 sans session, 403 autre rôle, 403 elevation_required sinon).
  const guard = guardAdminElevated(req);
  if (guard) return guard;
  try {
    const { id } = await ctx.params;
    const raw = await req.json().catch(() => null);
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Requête invalide", 400);
    }
    const { active, reason, commissionRate, plan } = parsed.data;
    if (active === undefined && commissionRate === undefined && plan === undefined) {
      return jsonError("Rien à modifier — fournis active, commissionRate ou plan", 400);
    }
    if (active === false && !reason) {
      return jsonError("Un motif est requis pour suspendre un institut (montré à la gérante)", 400);
    }

    const t = await db.tenant.findUnique({ where: { id } });
    if (!t) return jsonError("Institut introuvable", 404);

    const data: Record<string, unknown> = {};
    const ip = clientIp(req);

    // ── Suspension / réactivation ──
    if (active !== undefined && active !== t.active) {
      if (!active) {
        data.active = false;
        data.suspendedAt = new Date();
        data.suspendedReason = reason ?? null;
      } else {
        data.active = true;
        data.suspendedAt = null;
        data.suspendedReason = null;
      }
    }

    // ── Commission ──
    if (commissionRate !== undefined && commissionRate !== t.commissionRate) {
      data.commissionRate = commissionRate;
    }

    // ── Plan ──
    if (plan !== undefined && plan !== t.plan) {
      data.plan = plan;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, changed: false, message: "Aucun changement appliqué" });
    }

    const updated = await db.tenant.update({ where: { id }, data });

    // Notifications à la gérante (compte app lié par ownerPhone) + audit.
    // La gérante retrouve le message dans son fil de notifications —
    // la suspension n'est JAMAIS silencieuse.
    const ownerUser = await db.user.findUnique({ where: { phone: t.ownerPhone } });
    const notifyOwner = (message: string) =>
      ownerUser
        ? void notify({
            userId: ownerUser.id,
            tenantId: t.id,
            channel: "app",
            toPhone: ownerUser.phone,
            message,
          })
        : null;

    if (data.active === false) {
      notifyOwner(
        `🛑 ${t.name} a été suspendu par la Console Kènè${reason ? ` — ${reason}` : ""}. Ton équipe ne peut plus se connecter et l'institut a quitté la vitrine Kènè. Contacte-nous pour régulariser la situation.`,
      );
      void audit({
        kind: "tenant_suspended",
        userId: ownerUser?.id,
        ip,
        detail: `${t.name}${reason ? ` — ${reason}` : ""}`,
      });
    } else if (data.active === true) {
      notifyOwner(
        `✅ ${t.name} est de retour en ligne sur Kènè — bienvenue ! Tes clientes peuvent de nouveau réserver et commander.`,
      );
      void audit({ kind: "tenant_reactivated", userId: ownerUser?.id, ip, detail: t.name });
    }
    if (data.commissionRate !== undefined) {
      notifyOwner(
        `💰 Commission Kènè mise à jour : ${String(Math.round((updated.commissionRate as number) * 1000) / 10).replace(".", ",")} % sur tes ventes boutique (appliquée aux prochaines commandes).`,
      );
      void audit({
        kind: "tenant_commission",
        userId: ownerUser?.id,
        ip,
        detail: `${t.name} → ${String(Math.round((updated.commissionRate as number) * 1000) / 10).replace(".", ",")} %`,
      });
    }
    if (data.plan !== undefined) {
      void audit({ kind: "tenant_plan", userId: ownerUser?.id, ip, detail: `${t.name} → ${updated.plan}` });
    }

    return NextResponse.json({
      ok: true,
      changed: true,
      tenant: {
        id: updated.id,
        name: updated.name,
        active: updated.active,
        commissionRate: updated.commissionRate,
        plan: updated.plan,
        suspendedAt: updated.suspendedAt?.toISOString() ?? null,
        suspendedReason: updated.suspendedReason,
      },
    });
  } catch (err) {
    return serverError("admin/tenant:patch", err);
  }
}
