// GET /api/pro/employees?tenantId= | POST — embauche (paie CI/SN)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, dayStart, dayEnd } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:employees:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [employees, attendanceToday] = await Promise.all([
      db.employee.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
      db.attendance.findMany({
        where: { employee: { tenantId: tenant.id }, date: { gte: dayStart(), lte: dayEnd() } },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { checkIn: "asc" },
      }),
    ]);

    return NextResponse.json({ employees, attendanceToday });
  } catch (err) {
    return serverError("pro/employees:get", err);
  }
}

const Body = z.object({
  tenantId: z.string().min(1),
  name: z.string().trim().min(2),
  role: z.enum(["estheticienne", "dermo_conseillere", "caissiere", "manager"]),
  contractType: z.enum(["CDI", "CDD", "Stage"]).default("CDI"),
  country: z.enum(["CI", "SN"]).optional(),
  baseSalary: z.number().int().min(30000),
  transport: z.number().int().min(0).optional(),
  housing: z.number().int().min(0).optional(),
  cadres: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Session signée (t. 71-b, migration douce) : avec cookie, l'embauche
    // exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:employees:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const tenant = await db.tenant.findUnique({ where: { id: parsed.data.tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const { tenantId, name, role, contractType, baseSalary, transport, housing, cadres } = parsed.data;
    const employee = await db.employee.create({
      data: {
        tenantId,
        name,
        role,
        contractType,
        country: parsed.data.country ?? (tenant.country === "SN" ? "SN" : "CI"),
        baseSalary,
        transport: transport ?? 0,
        housing: housing ?? 0,
        cadres: cadres ?? false,
      },
    });

    return NextResponse.json({ employee }, { status: 201 });
  } catch (err) {
    return serverError("pro/employees:post", err);
  }
}
