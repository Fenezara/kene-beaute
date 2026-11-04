// Kènè — Institut de référence par défaut
import { db } from "@/lib/db";

export const DEFAULT_TENANT_NAME = "Cabinet LA DERMO";

/**
 * Retourne null par défaut pour les nouvelles clientes ou invités,
 * afin qu'ils choisissent librement leur institut dans la liste sans affiliation forcée.
 */
export async function getDefaultCabinetTenant(): Promise<{ id: string; name: string } | null> {
  return null;
}
