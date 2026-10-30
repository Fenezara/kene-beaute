// Kènè — Institut de référence par défaut ("Cabinet LA DERMO")
import { db } from "@/lib/db";

export const DEFAULT_TENANT_NAME = "Cabinet LA DERMO";

/**
 * Retourne l'institut partenaire de référence "Cabinet LA DERMO"
 * afin qu'il soit coché/sélectionné par défaut pour les nouvelles clientes.
 */
export async function getDefaultCabinetTenant() {
  try {
    const dermo = await db.tenant.findFirst({
      where: {
        active: true,
        OR: [
          { name: { contains: "LA DERMO", mode: "insensitive" } },
          { name: { contains: "DERMO", mode: "insensitive" } },
        ],
      },
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
    if (dermo) return dermo;
    return await db.tenant.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
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
  } catch {
    return null;
  }
}
