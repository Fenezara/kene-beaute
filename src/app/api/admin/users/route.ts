// GET /api/admin/users?q=&role= — annuaire des comptes pour la modération
// ( — console de gestion). Liste avec recherche et filtre par rôle;
// chaque ligne: identité, rôle, ville, verrou (lockedAt/Reason), compteurs
// d'activité (commandes, diagnostics), institut pour les comptes pro.
//
// Sécurité: session admin EXIGÉE (401 sans cookie, 403 autre rôle) —
// l'annuaire livre des PII, aucun mode legacy anonyme.
// Contrat: 200 { users: AdminUserRow[] } · 401/403.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, slugify } from "@/lib/kene/server";
import { matchesSearch } from "@/lib/kene/search";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { requireAdmin } from "../tenants/route";
import { isDemoAccount } from "@/lib/kene/demo";
import { isDeletedUser, isVirtualGuestUser, purgeStaleVirtualGuests } from "@/lib/kene/guest";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:users"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — réessaie dans une minute");
  const guard = requireAdmin(req);
  if (guard) return guard;
  try {
    void purgeStaleVirtualGuests({ maxAgeDays: 7 }).catch(() => null);
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const role = req.nextUrl.searchParams.get("role")?.trim() ?? "";
    const type = req.nextUrl.searchParams.get("type")?.trim() || req.nextUrl.searchParams.get("scope")?.trim() || ""; // "real" | "guest" | "demo" | "archived" | ""

    const users = await db.user.findMany({
      // Hygiène: la console liste TOUT, mais l'avatar binaire ne part jamais.
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        city: true,
        createdAt: true,
        lockedAt: true,
        lockedReason: true,
        _count: { select: { orders: true, diagnoses: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Instituts des comptes pro: gérante (ownerPhone) ou employée (fiche).
    const employees = await db.employee.findMany({
      where: { active: true },
      select: { userId: true, tenant: { select: { name: true } } },
    });
    const tenants = await db.tenant.findMany({ select: { ownerPhone: true, name: true } });
    const tenantByOwner = new Map(tenants.map((t) => [t.ownerPhone, t.name]));
    const tenantByEmployee = new Map(employees.map((e) => [e.userId, e.tenant.name]));

    let rows = users.map((u) => {
      const isDemo = isDemoAccount(u.phone);
      const isArchived = isDeletedUser(u);
      const isVirtualGuest = !isDemo && !isArchived && isVirtualGuestUser(u);
      return {
        id: u.id,
        name: u.name,
        phone: u.phone,
        role: u.role,
        city: u.city,
        createdAt: u.createdAt.toISOString(),
        lockedAt: u.lockedAt?.toISOString() ?? null,
        lockedReason: u.lockedReason,
        orders: u._count.orders,
        diagnoses: u._count.diagnoses,
        tenantName:
          u.role === "pro" ? (tenantByOwner.get(u.phone) ?? tenantByEmployee.get(u.id) ?? null) : null,
        isDemo,
        isVirtualGuest,
        isArchived,
      };
    });

    if (type === "real") rows = rows.filter((u) => !u.isDemo && !u.isVirtualGuest && !u.isArchived);
    if (type === "guest") rows = rows.filter((u) => u.isVirtualGuest);
    if (type === "demo") rows = rows.filter((u) => u.isDemo);
    if (type === "archived") rows = rows.filter((u) => u.isArchived);
    if (role) rows = rows.filter((u) => u.role === role);
    if (q) {
      rows = rows.filter((u) =>
        matchesSearch(q, u.name, u.phone, u.city, u.tenantName)
      );
    }

    // Verrouillées d'abord (ce qui demande une action), puis ancienneté.
    rows.sort((a, b) => (b.lockedAt ? 1 : 0) - (a.lockedAt ? 1 : 0));

    return NextResponse.json({ users: rows });
  } catch (err) {
    return serverError("admin/users", err);
  }
}
