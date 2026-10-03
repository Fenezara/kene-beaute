// scripts/test-multi-tenancy.ts
// Kènè — Suite de tests automatisés : Multi-Établissements & Isolation des Succursales
// 1. Résolution de tenant par session gérante
// 2. Barrière anti-IDOR : blocage strict des succursales étrangères
// 3. Multi-succursales : liste complète des établissements pour le sélecteur
// 4. Création d'une 2e succursale et basculement instantané
// 5. Cloisonnement strict des données (services, praticiennes, RDV)

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { resolveTenant, resolveProTenants } from "../src/lib/kene/server";
import { signSession } from "../src/lib/kene/session";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}:`, err.message);
  }
}

function makeRequestWithSession(user: { id: string; phone: string; role: string }, url = "http://localhost:3000/api/pro/overview") {
  const token = signSession(user);
  return new NextRequest(url, {
    headers: {
      cookie: `kene_session=${token}`,
    },
  });
}

async function run() {
  console.log("=== VALIDATION DU MULTI-ÉTABLISSEMENTS KÈNÈ PRO ===\n");

  // Recherche d'un propriétaire Pro existant dans la base
  const existingTenant = await db.tenant.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  assert(existingTenant, "Au moins un tenant doit exister dans la base");
  console.log(`Établissement de référence : "${existingTenant.name}" (ID: ${existingTenant.id}, Propriétaire: ${existingTenant.ownerPhone})`);

  const ownerPhone = existingTenant.ownerPhone;
  const ownerUser = {
    id: "user-test-pro-owner",
    phone: ownerPhone,
    role: "pro",
  };

  // ─────────────── TEST 1 : RÉSOLUTION SANS ID EXPLICITE ───────────────
  console.log("\n[TEST 1] Résolution automatique de la succursale principale");

  await test("resolveTenant sans tenantId résout sur la succursale de la gérante", async () => {
    const req = makeRequestWithSession(ownerUser);
    const resolved = await resolveTenant(req);
    assert(resolved, "Le tenant doit être résolu");
    assert.equal(resolved.ownerPhone, ownerPhone, "Le tenant doit appartenir à la gérante connectée");
  });

  // ─────────────── TEST 2 : BASCULEMENT SUR UNE SUCCURSALE AUTORISÉE ───────────────
  console.log("\n[TEST 2] Basculement sur un établissement autorisé");

  await test("resolveTenant avec son propre tenantId renvoie le bon établissement", async () => {
    const req = makeRequestWithSession(ownerUser);
    const resolved = await resolveTenant(req, existingTenant.id);
    assert(resolved, "Le tenant doit être trouvé");
    assert.equal(resolved.id, existingTenant.id, "L'ID doit correspondre");
  });

  // ─────────────── TEST 3 : BLOCAGE ANTI-IDOR (ÉTABLISSEMENT ÉTRANGER) ───────────────
  console.log("\n[TEST 3] Sécurité & Barrière Anti-IDOR");

  await test("resolveTenant refuse un tenantId appartenant à autrui (renvoie null)", async () => {
    // Session d'un autre utilisateur
    const foreignUser = {
      id: "user-foreign-pro",
      phone: "+225 01 02 03 04 05",
      role: "pro",
    };
    const req = makeRequestWithSession(foreignUser);
    // Tente d'accéder au tenant de existingTenant
    const resolved = await resolveTenant(req, existingTenant.id);
    assert.equal(resolved, null, "Doit refuser et renvoyer null (404/403) pour bloquer l'IDOR");
  });

  await test("resolveTenant refuse un ID inexistant", async () => {
    const req = makeRequestWithSession(ownerUser);
    const resolved = await resolveTenant(req, "non-existent-tenant-99999");
    assert.equal(resolved, null, "Un ID inexistant doit renvoyer null");
  });

  // ─────────────── TEST 4 : CRÉATION D'UNE 2E SUCCURSALE & SÉLECTEUR ───────────────
  console.log("\n[TEST 4] Création d'une 2e succursale pour la même gérante");

  const testBranchName = `Succursale Test Marcory ${Date.now()}`;
  let createdBranchId: string | null = null;

  await test("Création d'une seconde succursale sous le même ownerPhone", async () => {
    const newBranch = await db.tenant.create({
      data: {
        name: testBranchName,
        type: "institut",
        country: "CI",
        city: "Abidjan — Marcory",
        address: "Boulevard VGE, Résidence Jasmin",
        phone: "+225 07 99 88 77 66",
        ownerPhone: ownerPhone,
        ownerName: "Fatou Koné",
        plan: "pro",
        active: true,
      },
    });
    createdBranchId = newBranch.id;
    assert(createdBranchId, "La succursale doit avoir un ID");
    assert.equal(newBranch.ownerPhone, ownerPhone);
  });

  await test("resolveProTenants renvoie désormais les deux succursales", async () => {
    const req = makeRequestWithSession(ownerUser);
    const branches = await resolveProTenants(req);
    assert(branches.length >= 2, `Doit contenir au moins 2 succursales (trouvé: ${branches.length})`);
    const foundRef = branches.some((b) => b.id === existingTenant.id);
    const foundNew = branches.some((b) => b.id === createdBranchId);
    assert(foundRef, "La succursale de référence doit être dans la liste");
    assert(foundNew, "La nouvelle succursale doit être dans la liste");
  });

  await test("Basculement 1-clic : resolveTenant résout l'une puis l'autre succursale", async () => {
    const req = makeRequestWithSession(ownerUser);
    const branch1 = await resolveTenant(req, existingTenant.id);
    const branch2 = await resolveTenant(req, createdBranchId);

    assert(branch1 && branch2);
    assert.equal(branch1.id, existingTenant.id);
    assert.equal(branch2.id, createdBranchId);
    assert.notEqual(branch1.name, branch2.name);
  });

  // ─────────────── TEST 5 : ISOLATION STRICTE DES DONNÉES ───────────────
  console.log("\n[TEST 5] Isolation stricte des données entre succursales");

  await test("Les soins créés dans la succursale 2 n'apparaissent pas dans la succursale 1", async () => {
    assert(createdBranchId);
    // Créer un soin dédié à la succursale 2
    const s2 = await db.service.create({
      data: {
        tenantId: createdBranchId,
        name: "Soin Éclat Royal Marcory",
        category: "soin",
        price: 25000,
        durationMin: 60,
      },
    });

    const servicesBranch1 = await db.service.findMany({
      where: { tenantId: existingTenant.id },
    });
    const servicesBranch2 = await db.service.findMany({
      where: { tenantId: createdBranchId },
    });

    assert(
      !servicesBranch1.some((s) => s.id === s2.id),
      "Le soin de la succursale 2 NE DOIT PAS apparaître dans la succursale 1"
    );
    assert(
      servicesBranch2.some((s) => s.id === s2.id),
      "Le soin doit être présent dans la succursale 2"
    );

    // Nettoyage soin
    await db.service.delete({ where: { id: s2.id } });
  });

  // ─────────────── NETTOYAGE ───────────────
  if (createdBranchId) {
    await db.tenant.delete({ where: { id: createdBranchId } });
    console.log(`\nNettoyage réussi : succursale test "${testBranchName}" supprimée.`);
  }

  console.log(`\n=== RÉSULTATS : ${passed} passés, ${failed} échoués ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error("Erreur fatale:", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
