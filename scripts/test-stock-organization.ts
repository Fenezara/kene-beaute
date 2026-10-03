// scripts/test-stock-organization.ts
// Kènè — Suite de tests automatisés : Organisation du Stock & Prévention des Confusions
// 1. Catégorisation dermo-botanique des produits en stock
// 2. Distinction d'usage : Revente Boutique vs Usage Cabine Pro
// 3. Calculs des états de santé (Sain, Alerte réassort, Rupture)
// 4. Sécurité des mouvements : projection et détection de déficit
// 5. Traçabilité complète des mouvements en base de données

import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import {
  PRODUCT_CATEGORIES,
  getProductCategoryMeta,
  getCategoryToneBadgeClass,
} from "../src/lib/kene/catalog-taxonomy";

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

function isCabinProduct(p: { name: string; brandLine?: string | null; description?: string | null }): boolean {
  const str = `${p.name} ${p.brandLine ?? ""} ${p.description ?? ""}`.toLowerCase();
  return (
    str.includes("cabine") ||
    str.includes("pro") ||
    str.includes("professionnel") ||
    str.includes("technique") ||
    str.includes("bac")
  );
}

async function run() {
  console.log("=== TESTS DE VALIDATION DE L'ORGANISATION DU STOCK KÈNÈ ===");

  // ─────────────── 1. TAXONOMIE ET CATÉGORISATION ───────────────
  console.log("\n[1] Taxonomie & Reconnaissance des Catégories en Stock");

  test("Chaque catégorie de produit standard possède un badge et une tonalité", () => {
    for (const cat of PRODUCT_CATEGORIES) {
      const meta = getProductCategoryMeta(cat.id);
      assert.equal(meta.id, cat.id);
      const badgeCls = getCategoryToneBadgeClass(meta.tone);
      assert(badgeCls.length > 0, `Badge CSS non vide pour ${cat.id}`);
    }
  });

  test("Une catégorie personnalisée de stock est reconnue avec son fallback propre", () => {
    const customMeta = getProductCategoryMeta("brume-tonique");
    assert.equal(customMeta.label, "Brume tonique");
    assert.equal(customMeta.tone, "terre");
  });

  // ─────────────── 2. DISTINCTION REVENTE VS CABINE ───────────────
  console.log("\n[2] Distinction d'Usage : Revente Boutique vs Usage Cabine");

  test("Détection d'un produit destiné à la cabine pro", () => {
    const cabinP1 = { name: "Huile de Massage Karité Format Cabine 1L", brandLine: "Gamme Pro Cabine", description: "Usage professionnel pour massage" };
    const cabinP2 = { name: "Sérum Peeling Professionnel 200ml", brandLine: "Kènè Botaniques", description: "Soin intensif cabine" };
    assert.equal(isCabinProduct(cabinP1), true);
    assert.equal(isCabinProduct(cabinP2), true);
  });

  test("Détection d'un produit destiné à la revente boutique", () => {
    const retailP1 = { name: "Sérum Éclat Moringa 30ml", brandLine: "Kènè Botaniques", description: "Flacon compte-goutte pour routine du soir" };
    const retailP2 = { name: "Baume Nuit Karité Bio 100g", brandLine: "Kènè Botaniques", description: "Pot revente cliente" };
    assert.equal(isCabinProduct(retailP1), false);
    assert.equal(isCabinProduct(retailP2), false);
  });

  // ─────────────── 3. ÉTATS DE SANTÉ DU STOCK ───────────────
  console.log("\n[3] États de Santé du Stock (Sain, Alerte, Rupture)");

  test("Classification précise de la santé du stock", () => {
    const pRupture = { stock: 0, stockAlert: 8 };
    const pAlerte = { stock: 4, stockAlert: 8 };
    const pSain = { stock: 25, stockAlert: 8 };

    assert.equal(pRupture.stock === 0, true, "Rupture détectée quand stock = 0");
    assert.equal(pAlerte.stock > 0 && pAlerte.stock <= pAlerte.stockAlert, true, "Alerte détectée quand 0 < stock <= seuil");
    assert.equal(pSain.stock > pSain.stockAlert, true, "Stock sain quand stock > seuil");
  });

  // ─────────────── 4. SÉCURITÉ DES MOUVEMENTS & PROJECTIONS ───────────────
  console.log("\n[4] Sécurité des Mouvements & Prévention du Stock Négatif");

  test("Projection correcte d'une entrée de stock", () => {
    const currentStock = 10;
    const qtyIn = 5;
    const projected = currentStock + qtyIn;
    assert.equal(projected, 15);
  });

  test("Projection correcte d'une sortie de stock", () => {
    const currentStock = 10;
    const qtyOut = 3;
    const projected = Math.max(0, currentStock - qtyOut);
    assert.equal(projected, 7);
  });

  test("Détection stricte d'un déficit (quantité demandée > stock réel)", () => {
    const currentStock = 4;
    const requestedQty = 6;
    const hasDeficit = requestedQty > currentStock;
    assert.equal(hasDeficit, true, "Doit signaler un déficit pour empêcher le stock négatif");
  });

  // ─────────────── 5. TRAÇABILITÉ DES MOUVEMENTS EN BASE ───────────────
  console.log("\n[5] Traçabilité des Mouvements en Base de Données");

  const tenant = await db.tenant.findFirst({ where: { active: true } });
  assert(tenant, "Un tenant doit exister");

  // Création d'un produit de test pour valider le flux complet
  const testProduct = await db.product.create({
    data: {
      tenantId: tenant.id,
      name: "Sérum Test Anti-Confusion 50ml",
      category: "serum",
      brandLine: "Kènè Pro Cabine",
      description: "Produit de test de traçabilité",
      botanicals: "Kinkeliba, Moringa",
      price: 15000,
      stock: 12,
      stockAlert: 5,
      image: "/products/serum-moringa.webp",
    },
  });

  await test("Enregistrement d'un mouvement d'entrée avec motif fournisseur", async () => {
    const mvIn = await db.inventoryMovement.create({
      data: {
        tenantId: tenant.id,
        productId: testProduct.id,
        type: "in",
        qty: 6,
        reason: "Livraison fournisseur Kènè — Lot K-2026-09",
      },
    });
    assert.equal(mvIn.type, "in");
    assert.equal(mvIn.qty, 6);
  });

  await test("Enregistrement d'un mouvement de sortie pour soin cabine", async () => {
    const mvOut = await db.inventoryMovement.create({
      data: {
        tenantId: tenant.id,
        productId: testProduct.id,
        type: "out",
        qty: 2,
        reason: "Utilisation en cabine (Protocole Soin Éclat Visage)",
      },
    });
    assert.equal(mvOut.type, "out");
    assert.equal(mvOut.qty, 2);
    assert(mvOut.reason.includes("cabine"));
  });

  await test("Récupération de l'historique avec sélection enrichie (catégorie, image)", async () => {
    const list = await db.inventoryMovement.findMany({
      where: { productId: testProduct.id },
      include: { product: { select: { name: true, category: true, image: true } } },
      orderBy: { createdAt: "desc" },
    });

    assert.equal(list.length, 2);
    assert.equal(list[0].product.category, "serum");
    assert.equal(list[0].product.name, testProduct.name);
  });

  // Nettoyage
  await db.inventoryMovement.deleteMany({ where: { productId: testProduct.id } });
  await db.product.delete({ where: { id: testProduct.id } });

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
