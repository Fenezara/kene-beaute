// GET /api/pro/resources?tenantId= — liste des praticiennes actives de l'institut
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

/** Nettoie le nom de la praticienne pour n'afficher UNIQUEMENT que son nom / prénom */
export function cleanPractitionerName(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\s*[-—–]\s*(esthéticienne|estheticienne|dermo[- ]?conseillère|dermo[- ]?conseillere|praticienne|coiffeuse|masseuse|soignante|prestataire|manager|caissière|caissiere|employée|employee).*$/i, "")
    .replace(/\s*\((esthéticienne|estheticienne|dermo[- ]?conseillère|dermo[- ]?conseillere|praticienne|coiffeuse|masseuse|soignante).*?\)/i, "")
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:resources:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    // 1. Récupérer les ressources actives existantes
    const resources = await db.resource.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
    });

    // 2. Synchroniser avec les employées praticiennes actives
    const employees = await db.employee.findMany({
      where: {
        tenantId: tenant.id,
        active: true,
        role: { in: ["estheticienne", "dermo_conseillere", "praticienne", "masseuse", "coiffeuse"] },
      },
    });

    const existingNames = new Set(resources.map((r) => cleanPractitionerName(r.name).toLowerCase()));
    const toCreate: Array<{ tenantId: string; name: string; role: string; color: string; active: boolean }> = [];

    const PALETTE = ["#C8951E", "#3F7D3F", "#9E2045", "#2B6CB0", "#805AD5", "#DD6B20"];
    let colorIdx = resources.length;

    for (const emp of employees) {
      const clean = cleanPractitionerName(emp.name);
      if (clean && !existingNames.has(clean.toLowerCase())) {
        existingNames.add(clean.toLowerCase());
        toCreate.push({
          tenantId: tenant.id,
          name: clean,
          role: emp.role || "estheticienne",
          color: PALETTE[colorIdx % PALETTE.length],
          active: true,
        });
        colorIdx++;
      }
    }

    if (toCreate.length > 0) {
      await db.resource.createMany({ data: toCreate }).catch(() => null);
    }

    // 3. Re-charger la liste unifiée et filtrer strictement les praticiennes
    const allResources = await db.resource.findMany({
      where: {
        tenantId: tenant.id,
        active: true,
      },
      orderBy: { name: "asc" },
    });

    // Exclure caissières, managers, etc.
    const nonPractitionerRoles = new Set(["caissiere", "manager", "admin", "comptable", "securite"]);
    const practitioners = allResources
      .filter((r) => !nonPractitionerRoles.has(r.role?.toLowerCase() || ""))
      .map((r) => ({
        id: r.id,
        name: cleanPractitionerName(r.name),
        role: r.role,
        color: r.color,
      }));

    return NextResponse.json({ resources: practitioners });
  } catch (err) {
    return serverError("pro/resources:get", err);
  }
}
