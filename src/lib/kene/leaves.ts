// Kènè — Contrôle & Traçabilité des Congés du Personnel
// Règle d'entreprise stricte : une personne en congé ne peut pas intervenir dans les activités
// de l'institut (RDV cabine, pointage de présence, ventes caisse, diagnostics).

import { db } from "@/lib/db";
import { dayStart, dayEnd } from "@/lib/kene/server";
import { formatDate } from "@/lib/kene/format";

export interface ActiveLeaveInfo {
  employeeId: string;
  employeeName: string;
  startDate: Date;
  endDate: Date;
  type: string;
  reason?: string | null;
}

/**
 * Vérifie si un(e) employé(e) a un congé approuvé en cours pour une date donnée.
 * Recherche soit par ID d'employé, soit par nom dans le tenant (insensible à la casse).
 */
export async function getActiveLeaveForEmployee(
  target: { employeeId?: string; name?: string; resourceId?: string; tenantId: string },
  date: Date = new Date()
): Promise<ActiveLeaveInfo | null> {
  const d = new Date(date);
  const startOfDay = dayStart(d);
  const endOfDay = dayEnd(d);

  // 1. Si un resourceId est fourni, récupérer le nom de la ressource
  let resolvedName = target.name?.trim();
  if (target.resourceId && !resolvedName) {
    const res = await db.resource.findUnique({
      where: { id: target.resourceId },
      select: { name: true, tenantId: true },
    });
    if (res) resolvedName = res.name.trim();
  }

  // 2. Résoudre l'employeeId si nécessaire
  let targetEmployeeId = target.employeeId;
  if (!targetEmployeeId && resolvedName) {
    const employees = await db.employee.findMany({
      where: { tenantId: target.tenantId },
      select: { id: true, name: true },
    });
    const match = employees.find(
      (e) => e.name.trim().toLowerCase() === resolvedName!.toLowerCase()
    );
    if (match) {
      targetEmployeeId = match.id;
    }
  }

  if (!targetEmployeeId && !resolvedName) return null;

  // 3. Recherche du congé approuvé
  const leave = await db.leaveRequest.findFirst({
    where: {
      tenantId: target.tenantId,
      status: "approved",
      startDate: { lte: endOfDay },
      endDate: { gte: startOfDay },
      ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
    },
    include: { employee: { select: { id: true, name: true } } },
  });

  if (!leave) return null;

  return {
    employeeId: leave.employeeId,
    employeeName: leave.employee.name,
    startDate: leave.startDate,
    endDate: leave.endDate,
    type: leave.type,
    reason: leave.reason,
  };
}

/**
 * Récupère tous les employés actuellement en congé approuvé pour une date donnée dans un institut.
 */
export async function getEmployeesOnLeave(
  tenantId: string,
  date: Date = new Date()
): Promise<ActiveLeaveInfo[]> {
  const d = new Date(date);
  const leaves = await db.leaveRequest.findMany({
    where: {
      tenantId,
      status: "approved",
      startDate: { lte: dayEnd(d) },
      endDate: { gte: dayStart(d) },
    },
    include: { employee: { select: { id: true, name: true } } },
  });

  return leaves.map((l) => ({
    employeeId: l.employeeId,
    employeeName: l.employee.name,
    startDate: l.startDate,
    endDate: l.endDate,
    type: l.type,
    reason: l.reason,
  }));
}

/**
 * Formate un message d'erreur d'intervention bloquée pour congé
 */
export function formatLeaveBlockedMessage(
  leave: ActiveLeaveInfo,
  activityLabel = "intervenir dans les activités de l'entreprise"
): string {
  const startStr = formatDate(leave.startDate);
  const endStr = formatDate(leave.endDate);
  const typeLabel =
    leave.type === "maladie"
      ? "arrêt maladie"
      : leave.type === "maternite"
      ? "congé maternité"
      : "congé";

  return `${leave.employeeName} est actuellement en ${typeLabel} (du ${startStr} au ${endStr}) et ne peut plus ${activityLabel}.`;
}
