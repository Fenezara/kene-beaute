// GET /api/pro/employees?tenantId= | POST — embauche (paie CI/SN) | PATCH — fiche employée
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, dayStart, dayEnd, genRef } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { hashPin, isValidPin } from "@/lib/kene/pin";

function parseEmployeePermissions(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

/** Enrichit chaque fiche du téléphone du compte app lié, statut code PIN et permissions. */
async function withAccountPhones<T extends { userId: string | null; permissions?: string | null }>(
  employees: T[],
): Promise<(T & { accountPhone: string | null; hasPin: boolean; pinLocked: boolean; permissions: string[] | null })[]> {
  const ids = [...new Set(employees.map((e) => e.userId).filter((u): u is string => !!u))];
  const users = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, phone: true, pinHash: true, pinLockedUntil: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return employees.map((e) => {
    const u = e.userId ? byId.get(e.userId) : null;
    return {
      ...e,
      accountPhone: u?.phone ?? null,
      hasPin: Boolean(u?.pinHash),
      pinLocked: Boolean(u?.pinLockedUntil && u.pinLockedUntil > new Date()),
      permissions: parseEmployeePermissions(e.permissions),
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    // Session signée (migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:employees:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const [employees, attendanceToday, leavesToday] = await Promise.all([
      db.employee.findMany({ where: { tenantId: tenant.id }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
      db.attendance.findMany({
        where: { employee: { tenantId: tenant.id }, date: { gte: dayStart(), lte: dayEnd() } },
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { checkIn: "asc" },
      }),
      // Congés approuvés couvrant aujourd'hui → pointage « Congé » (affichage).
      db.leaveRequest.findMany({
        where: { tenantId: tenant.id, status: "approved", startDate: { lte: new Date() }, endDate: { gte: new Date() } },
        select: { employeeId: true, endDate: true },
      }),
    ]);

    // Fusion : une employée en congé approuvé est « Congé » aujourd'hui,
    // même sans ligne de pointage (le congé prime sur le pointage).
    const onLeaveIds = new Set(leavesToday.map((l) => l.employeeId));
    const seen = new Set(attendanceToday.map((a) => a.employeeId));
    const rows = attendanceToday.map((a) =>
      onLeaveIds.has(a.employeeId) ? { ...a, status: "leave" } : a,
    );
    for (const emp of employees) {
      if (onLeaveIds.has(emp.id) && !seen.has(emp.id)) {
        rows.push({ id: `leave-${emp.id}`, date: new Date(), employeeId: emp.id, checkIn: null, checkOut: null, status: "leave", hours: 0, employee: { id: emp.id, name: emp.name } });
      }
    }

    return NextResponse.json({ employees: await withAccountPhones(employees), attendanceToday: rows });
  } catch (err) {
    return serverError("pro/employees:get", err);
  }
}

const Body = z.object({
  tenantId: z.string().min(1),
  name: z.string().trim().min(2),
  role: z.string().trim().min(2).max(60),
  contractType: z.string().trim().min(2).max(60).default("CDI"),
  country: z.enum(["CI", "SN"]).optional(),
  baseSalary: z.number().int().min(0),
  transport: z.number().int().min(0).optional(),
  housing: z.number().int().min(0).optional(),
  cadres: z.boolean().optional(),
  // — compte APP de l'employée: numéro → User (rôle pro) lié à cette
  // fiche. L'employée se connecte par OTP ou code secret PIN.
  phone: z.string().trim().min(6).max(30).optional(),
  // — code secret PIN initial de l'employée (4 à 6 chiffres)
  pin: z.string().trim().min(4).max(6).optional(),
  // — permissions granulaires personnalisées de l'employée (modules autorisés sur mesure)
  permissions: z.array(z.string()).nullable().optional(),
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

    const { tenantId, name, role, contractType, baseSalary, transport, housing, cadres, phone, pin, permissions } = parsed.data;

    if (pin && !isValidPin(pin)) {
      return jsonError("Le code PIN doit comporter 4 chiffres", 400);
    }

    // — compte APP optionnel: vérifications AVANT toute écriture.
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
        // Toujours promouvoir le compte en rôle pro et mettre à jour le nom et code PIN éventuel
        await db.user.update({
          where: { id: existing.id },
          data: {
            role: "pro",
            ...((!existing.name || existing.name === "Nouvelle cliente") ? { name } : {}),
            ...(pin ? { pinHash: hashPin(pin), pinFails: 0, pinLockedUntil: null } : {}),
          },
        });
        accountUserId = existing.id;
      } else {
        const created = await db.user.create({
          data: {
            phone: normalized,
            name: role,
            role: "pro",
            referralCode: genRef("KENE"),
            ...(pin ? { pinHash: hashPin(pin), pinFails: 0, pinLockedUntil: null } : {}),
          },
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
        permissions: permissions && permissions.length > 0 ? JSON.stringify(permissions) : null,
      },
    });

    return NextResponse.json(
      {
        employee: {
          ...employee,
          accountPhone: phone ?? null,
          permissions: parseEmployeePermissions(employee.permissions),
        },
        account: accountUserId ? { created: true, phone: phone } : null,
      },
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
  role: z.string().trim().min(2).max(60).optional(),
  contractType: z.string().trim().min(2).max(60).optional(),
  country: z.enum(["CI", "SN"]).optional(),
  baseSalary: z.number().int().min(0).optional(),
  transport: z.number().int().min(0).optional(),
  housing: z.number().int().min(0).optional(),
  cadres: z.boolean().optional(),
  cnpsNumber: z.string().trim().max(30).nullable().optional(),
  bankAccount: z.string().trim().max(60).nullable().optional(),
  phone: z.string().trim().min(6).max(30).nullable().optional(),
  // — mise à jour ou réinitialisation du code secret PIN (4 à 6 chiffres)
  pin: z.string().trim().min(4).max(6).optional(),
  // — permissions granulaires personnalisées de l'employée (modules autorisés sur mesure)
  permissions: z.array(z.string()).nullable().optional(),
  active: z.boolean().optional(),
  endDate: z.string().datetime().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:employees:patch");
    if (guard) return guard;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { tenantId, id, phone, pin, active, endDate, cnpsNumber, bankAccount, permissions, ...fields } = parsed.data;

    if (pin && !isValidPin(pin)) {
      return jsonError("Le code PIN doit comporter 4 chiffres", 400);
    }

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
          // Toujours promouvoir le compte en rôle pro et mettre à jour le nom
          await db.user.update({
            where: { id: existing.id },
            data: {
              role: "pro",
              ...((!existing.name || existing.name === "Nouvelle cliente") ? { name: fields.name ?? employee.name } : {}),
            },
          });
          accountUserId = existing.id;
        } else {
          const created = await db.user.create({
            data: { phone: normalized, name: fields.name ?? employee.name, role: "pro", referralCode: genRef("KENE") },
          });
          accountUserId = created.id;
        }
      }
    }

    // Mise à jour ou réinitialisation immédiate du code secret PIN
    if (pin && accountUserId) {
      await db.user.update({
        where: { id: accountUserId },
        data: {
          pinHash: hashPin(pin),
          pinFails: 0,
          pinLockedUntil: null,
        },
      });
    }

    const updated = await db.employee.update({
      where: { id },
      data: {
        ...fields,
        cnpsNumber,
        bankAccount,
        userId: accountUserId,
        ...(permissions !== undefined
          ? { permissions: permissions && permissions.length > 0 ? JSON.stringify(permissions) : null }
          : {}),
        ...(active !== undefined
          ? { active, endDate: active ? null : endDate ? new Date(endDate) : new Date() }
          : {}),
      },
    });

    const account = accountUserId
      ? await db.user.findUnique({ where: { id: accountUserId }, select: { phone: true } })
      : null;
    return NextResponse.json({
      employee: {
        ...updated,
        accountPhone: account?.phone ?? null,
        permissions: parseEmployeePermissions(updated.permissions),
      },
    });
  } catch (err) {
    return serverError("pro/employees:patch", err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:employees:delete");
    if (guard) return guard;

    const id = req.nextUrl.searchParams.get("id");
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    const permanent = req.nextUrl.searchParams.get("permanent") === "true";

    if (!id) return jsonError("Identifiant employé requis", 400);
    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee || employee.tenantId !== tenant.id) return jsonError("Employée introuvable", 404);

    const payslipsCount = await db.payslip.count({ where: { employeeId: id } });
    const attendanceCount = await db.attendance.count({ where: { employeeId: id } });

    // Si suppression définitive demandée ou aucune donnée comptable liée
    if (permanent || (payslipsCount === 0 && attendanceCount === 0)) {
      await db.employee.delete({ where: { id } });
      return NextResponse.json({ ok: true, deleted: true, message: "Fiche employée supprimée définitivement." });
    } else {
      // Archivage propre : désactive la fiche, fixe la date de sortie et détache le compte app
      await db.employee.update({
        where: { id },
        data: {
          active: false,
          endDate: new Date(),
          userId: null,
        },
      });
      return NextResponse.json({ ok: true, archived: true, message: "Fiche employée archivée et accès révoqué." });
    }
  } catch (err) {
    return serverError("pro/employees:delete", err);
  }
}
