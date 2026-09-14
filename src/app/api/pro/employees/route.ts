// GET /api/pro/employees?tenantId= | POST — embauche (paie CI/SN) | PATCH — fiche employée
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, dayStart, dayEnd, genRef } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

/** Enrichit chaque fiche du téléphone du compte app lié (relation clé brute). */
async function withAccountPhones<T extends { userId: string | null }>(
  employees: T[],
): Promise<(T & { accountPhone: string | null })[]> {
  const ids = [...new Set(employees.map((e) => e.userId).filter((u): u is string => !!u))];
  const users = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, phone: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u.phone]));
  return employees.map((e) => ({ ...e, accountPhone: e.userId ? byId.get(e.userId) ?? null : null }));
}

export async function GET(req: NextRequest) {
  try {
    // Session signée (migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:employees:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [employees, attendanceToday] = await Promise.all([
      db.employee.findMany({ where: { tenantId: tenant.id }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
      db.attendance.findMany({
        where: { employee: { tenantId: tenant.id }, date: { gte: dayStart(), lte: dayEnd() } },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { checkIn: "asc" },
      }),
    ]);

    return NextResponse.json({ employees: await withAccountPhones(employees), attendanceToday });
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
  // — compte APP de l'employée: numéro → User (rôle pro) lié à cette
  // fiche. L'employée se connecte par OTP et voit les sections de son poste.
  phone: z.string().trim().min(6).max(30).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Session signée (, migration douce): avec cookie, l'embauche
    // exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:employees:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);

    const tenant = await db.tenant.findUnique({ where: { id: parsed.data.tenantId } });
    if (!tenant) return jsonError("Institut introuvable", 404);

    const { tenantId, name, role, contractType, baseSalary, transport, housing, cadres, phone } = parsed.data;

    // — compte APP optionnel: vérifications AVANT toute écriture.
    // Normalisation canonique de l'app: numéro local (8+ chiffres) →
    // +<indicatif pays du tenant><10 derniers chiffres>; un numéro déjà
    // complet (+…) est pris tel quel.
    let accountUserId: string | null = null;
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) {
        return jsonError("Téléphone invalide (8 à 15 chiffres)", 400);
      }
      const cc = (parsed.data.country ?? (tenant.country === "SN" ? "SN" : "CI")) === "SN" ? "221" : "225";
      const normalized = phone.startsWith("+") ? phone : `+${cc}${digits.slice(-10)}`;
      const existing = await db.user.findUnique({ where: { phone: normalized } });
      if (existing) {
        const ownedTenant = await db.tenant.findFirst({ where: { ownerPhone: normalized } });
        if (ownedTenant) {
          return jsonError("Ce numéro est déjà gérante d'un institut — compte employé impossible", 409);
        }
        const alreadyEmployee = await db.employee.findFirst({ where: { userId: existing.id } });
        if (alreadyEmployee && alreadyEmployee.tenantId !== tenantId) {
          return jsonError("Ce numéro est déjà employée dans un autre institut", 409);
        }
        accountUserId = existing.id;
      } else {
        const created = await db.user.create({
          data: { phone: normalized, name, role: "pro", referralCode: genRef("KENE") },
        });
        accountUserId = created.id;
      }
    }

    const employee = await db.employee.create({
      data: {
        tenantId,
        name,
        role,
        userId: accountUserId,
        contractType,
        country: parsed.data.country ?? (tenant.country === "SN" ? "SN" : "CI"),
        baseSalary,
        transport: transport ?? 0,
        housing: housing ?? 0,
        cadres: cadres ?? false,
      },
    });

    return NextResponse.json(
      { employee, account: accountUserId ? { created: true, phone: phone } : null },
      { status: 201 },
    );
  } catch (err) {
    return serverError("pro/employees:post", err);
  }
}

/* ── PATCH — édition de fiche employée (gérante/manager) : identité, contrat,
 *   salaire, matricule CNPS/IPRES, compte app, sortie / réintégration. ── */
const PatchBody = z.object({
  tenantId: z.string().min(1),
  id: z.string().min(1),
  name: z.string().trim().min(2).optional(),
  role: z.enum(["estheticienne", "dermo_conseillere", "caissiere", "manager"]).optional(),
  contractType: z.enum(["CDI", "CDD", "Stage"]).optional(),
  country: z.enum(["CI", "SN"]).optional(),
  baseSalary: z.number().int().min(30000).optional(),
  transport: z.number().int().min(0).optional(),
  housing: z.number().int().min(0).optional(),
  cadres: z.boolean().optional(),
  cnpsNumber: z.string().trim().max(30).nullable().optional(),
  bankAccount: z.string().trim().max(60).nullable().optional(),
  phone: z.string().trim().min(6).max(30).nullable().optional(),
  active: z.boolean().optional(),
  endDate: z.string().datetime().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:employees:patch");
    if (guard) return guard;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, id, phone, active, endDate, cnpsNumber, bankAccount, ...fields } = parsed.data;

    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee || employee.tenantId !== tenant.id) return jsonError("Employée introuvable", 404);

    // Relier / délier le compte app (mêmes règles qu'à l'embauche).
    let accountUserId = employee.userId;
    if (phone !== undefined) {
      if (phone === null || phone === "") {
        accountUserId = null; // déliaison explicite
      } else {
        const digits = phone.replace(/\D/g, "");
        if (digits.length < 8 || digits.length > 15) {
          return jsonError("Téléphone invalide (8 à 15 chiffres)", 400);
        }
        const cc = (fields.country ?? employee.country) === "SN" ? "221" : "225";
        const normalized = phone.startsWith("+") ? phone : `+${cc}${digits.slice(-10)}`;
        const existing = await db.user.findUnique({ where: { phone: normalized } });
        if (existing) {
          const ownedTenant = await db.tenant.findFirst({ where: { ownerPhone: normalized } });
          if (ownedTenant) {
            return jsonError("Ce numéro est déjà gérante d'un institut — compte employé impossible", 409);
          }
          const alreadyEmployee = await db.employee.findFirst({ where: { userId: existing.id } });
          if (alreadyEmployee && alreadyEmployee.id !== employee.id) {
            return jsonError("Ce numéro est déjà liée à une autre fiche employée", 409);
          }
          accountUserId = existing.id;
        } else {
          const created = await db.user.create({
            data: { phone: normalized, name: fields.name ?? employee.name, role: "pro", referralCode: genRef("KENE") },
          });
          accountUserId = created.id;
        }
      }
    }

    const updated = await db.employee.update({
      where: { id },
      data: {
        ...fields,
        cnpsNumber,
        bankAccount,
        userId: accountUserId,
        ...(active !== undefined
          ? { active, endDate: active ? null : endDate ? new Date(endDate) : new Date() }
          : {}),
      },
    });

    const account = accountUserId
      ? await db.user.findUnique({ where: { id: accountUserId }, select: { phone: true } })
      : null;
    return NextResponse.json({ employee: { ...updated, accountPhone: account?.phone ?? null } });
  } catch (err) {
    return serverError("pro/employees:patch", err);
  }
}
