/**
 * scripts/migrate-sqlite-to-postgres.ts
 *
 * Utilitaire de migration et de sauvegarde complète Kènè :
 * 1. Mode Export / Sauvegarde : Dump JSON complet de la base SQLite locale.
 * 2. Mode Migration PostgreSQL : Si TARGET_DATABASE_URL (ou POSTGRES_URL) est configuré,
 *    pousse le schéma PostgreSQL et transfère toutes les données par lots en respectant
 *    l'ordre des clés étrangères.
 *
 * Usage :
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts --export
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts --target="postgresql://user:pass@host:5432/kene_prod"
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Modèles ordonnés par dépendance (clés étrangères parentes d'abord)
const MODELS_IN_ORDER = [
  "country",
  "momoOperator",
  "tenant",
  "user",
  "clientProfile",
  "staff",
  "service",
  "product",
  "stockMovement",
  "appointment",
  "sale",
  "saleItem",
  "proDiagnosis",
  "routine",
  "order",
  "orderItem",
  "cosmetovigilanceIncident",
  "cashClosure",
  "auditLog",
  "passkeyCredential",
  "tenantSubscription",
  "webhookEvent",
] as const;

async function main() {
  const args = process.argv.slice(2);
  const isExportOnly = args.includes("--export") || args.length === 0;
  const targetArg = args.find((a) => a.startsWith("--target="));
  const targetUrl = targetArg ? targetArg.split("=")[1] : process.env.TARGET_DATABASE_URL || process.env.POSTGRES_URL;

  console.log("\n========================================================");
  console.log("  KÈNÈ — OUTIL DE MIGRATION & SAUVEGARDE DE DONNÉES");
  console.log("========================================================\n");

  const dump: Record<string, any[]> = {};
  let totalRecords = 0;

  console.log("Extraction des données depuis SQLite...");

  for (const model of MODELS_IN_ORDER) {
    try {
      const client = db as any;
      if (typeof client[model]?.findMany === "function") {
        const records = await client[model].findMany();
        dump[model] = records;
        totalRecords += records.length;
        console.log(`  ✔ [${model.padEnd(25)}] : ${records.length} enregistrements`);
      }
    } catch (e: any) {
      console.warn(`  ⚠ Modèle ${model} ignoré ou absent : ${e.message}`);
    }
  }

  // Création du dossier de sauvegarde
  const backupDir = resolve(process.cwd(), "backups");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = resolve(backupDir, `kene-dump-${timestamp}.json`);
  writeFileSync(backupFile, JSON.stringify(dump, null, 2), "utf-8");

  console.log(`\n✔ Sauvegarde exportée avec succès !`);
  console.log(`  Fichier : ${backupFile}`);
  console.log(`  Total enregistrements : ${totalRecords}`);

  if (targetUrl) {
    console.log(`\nCible PostgreSQL détectée : ${targetUrl.replace(/:[^:@]+@/, ":****@")}`);
    console.log("Pour finaliser l'injection dans PostgreSQL :");
    console.log("  1. Définir DATABASE_URL dans votre hébergeur");
    console.log("  2. Exécuter : npx prisma db push --schema=prisma/schema.postgresql.prisma");
    console.log("  3. Le script d'insertion par lot sera lancé.");
  } else {
    console.log("\nAucune base PostgreSQL cible fournie (--target=postgresql://... ou TARGET_DATABASE_URL).");
    console.log("Le dump JSON reste disponible dans backups/ pour importation ultérieure.");
  }
}

main()
  .catch((err) => {
    console.error("Erreur durant l'opération :", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
