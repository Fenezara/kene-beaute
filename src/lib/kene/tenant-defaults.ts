// Kènè — Institut de référence par défaut ("Cabinet LA DERMO")
import { db } from "@/lib/db";

export const DEFAULT_TENANT_NAME = "Cabinet LA DERMO";

/**
 * Retourne l'institut partenaire de référence "Cabinet LA DERMO"
 * afin qu'il soit coché/sélectionné par défaut pour les nouvelles clientes.
 */
export async function getDefaultCabinetTenant() {
  try {
    const all = await db.tenant.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        city: true,
        phone: true,
        ownerPhone: true,
        address: true,
        country: true,
      },
    });

    const dermo = all.find((t) => t.name.toLowerCase().includes("dermo")) ?? all[0] ?? null;
    return dermo;
  } catch {
    return null;
  }
}
