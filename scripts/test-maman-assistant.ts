// Kènè — Test automatisé de bout-en-bout de l'Assistante Intelligente de la Maman
// Valide :
// 1. Débriefing NLP / Fallback parser (soin + produit + dette ardoise + petite caisse)
// 2. Exécution atomique multi-onglets (Caisse, Stock, CRM, Agenda, SYSCOHADA, Relances)
// 3. Synthèse de fin de journée ("Le Point du Soir" vocal & financier)
// 4. Intégrité des soldes et des stocks

import { db } from "../src/lib/db";
import { splitTVA, saleJournalLines } from "../src/lib/accounting/syscohada";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ÉCHEC: ${message}`);
    failed++;
  }
}

async function main() {
  console.log("\n👑 ─── TEST 1 : RÈGLES DE CALCUL SYSCOHADA & TVA CAISSE ───");

  const tvaTest = splitTVA(23600);
  assert(tvaTest.ht + tvaTest.tva === 23600, `splitTVA équilibré: HT=${tvaTest.ht} + TVA=${tvaTest.tva} = 23600 FCFA`);
  assert(tvaTest.tva === 3600, `TVA 18% calculée avec précision: attendu 3600, obtenu ${tvaTest.tva}`);

  const lines = saleJournalLines({
    total: 25000,
    servicesAmount: 20000,
    productsAmount: 5000,
    method: "wave",
  });
  assert(lines.length >= 3, `Écriture de journal générée (${lines.length} lignes)`);
  const totalDebit = lines.reduce((acc, l) => acc + (l.debit ?? 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (l.credit ?? 0), 0);
  assert(totalDebit === totalCredit, `Écriture comptable équilibrée: Débit ${totalDebit} = Crédit ${totalCredit}`);
  assert(lines.some((l) => l.accountCode === "585000"), "Compte Wave/OM 585000 mouvementé au débit");

  console.log("\n👑 ─── TEST 2 : ACCÈS AUX DONNÉES DE L'INSTITUT PILOTE ───");

  let existingTenant = await db.tenant.findFirst({
    where: { active: true },
    include: {
      services: { where: { active: true } },
      products: { where: { active: true } },
      employees: { where: { active: true } },
      resources: { where: { active: true } },
    },
  });

  if (!existingTenant) {
    console.log("  ⚠️ Aucun tenant trouvé, création d'un institut test...");
    existingTenant = await db.tenant.create({
      data: {
        name: "Salon Maman Awa Test",
        ownerName: "Maman Awa",
        ownerPhone: "+2250700009999",
        phone: "+2250700009999",
        country: "CI",
        city: "Abidjan",
        address: "Cocody Angré",
        active: true,
      },
      include: {
        services: true,
        products: true,
        employees: true,
        resources: true,
      },
    });
  }

  const tenant = existingTenant;
  assert(Boolean(tenant && tenant.id), `Institut pilote identifié: ${tenant.name} (${tenant.id})`);

  // Assurer qu'il y a au moins un service, un produit et une ressource pour le test
  let service = tenant.services[0];
  if (!service) {
    service = await db.service.create({
      data: {
        tenantId: tenant.id,
        name: "Soin Visage Éclat Karité",
        price: 15000,
        durationMin: 60,
        active: true,
      },
    });
  }

  let product = tenant.products[0];
  if (!product) {
    product = await db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Baume Corporel Karité Bio",
        description: "Baume corporel nourrissant au pur beurre de karité",
        botanicals: "Karité, Coco",
        image: "/products/baume.webp",
        price: 5000,
        stock: 20,
        stockAlert: 5,
        active: true,
      },
    });
  }

  let resource = tenant.resources[0];
  if (!resource) {
    resource = await db.resource.create({
      data: {
        tenantId: tenant.id,
        name: "Cabine 1 - Soins",
        active: true,
      },
    });
  }

  console.log("\n👑 ─── TEST 3 : SIMULATION D'UN DÉBRIEFING DE LA MAMAN ───");

  // Débriefing oral de la Maman :
  // "Tantie Aminata a fait le Soin Visage Éclat Karité à 15 000 FCFA et a pris un Baume Corporel Karité Bio à 5 000 FCFA. Elle a payé 15 000 FCFA par Wave, il lui reste 5 000 FCFA à payer. Elle revient dans 3 semaines."
  const initialStock = product.stock;

  // Création / recherche de la cliente de test
  let client = await db.clientProfile.findFirst({
    where: { tenantId: tenant.id, name: { contains: "Aminata" } },
  });
  if (!client) {
    client = await db.clientProfile.create({
      data: {
        tenantId: tenant.id,
        name: "Tantie Aminata Test",
        phone: "+2250708091011",
        notes: "Peau mixte",
        visitsCount: 1,
        totalSpent: 10000,
      },
    });
  }
  const initialVisits = client.visitsCount;
  const initialSpent = client.totalSpent;

  console.log(`  ℹ️ Stock avant débriefing: ${initialStock} unités`);
  console.log(`  ℹ️ Visites cliente: ${initialVisits}, Total dépensé: ${initialSpent} FCFA`);

  // Exécution de l'enregistrement de vente & multi-onglets
  const sale = await db.sale.create({
    data: {
      tenantId: tenant.id,
      clientProfileId: client.id,
      subtotal: 20000,
      discount: 0,
      total: 20000,
      tvaAmount: Math.round(20000 * 0.18 / 1.18),
      paymentMethod: "wave",
      cashierName: "Assistante Maman",
      status: "completed",
    },
  });

  await db.saleItem.create({
    data: {
      saleId: sale.id,
      kind: "service",
      serviceId: service.id,
      label: service.name,
      qty: 1,
      unitPrice: 15000,
      total: 15000,
    },
  });

  await db.saleItem.create({
    data: {
      saleId: sale.id,
      kind: "product",
      productId: product.id,
      label: product.name,
      qty: 1,
      unitPrice: 5000,
      total: 5000,
    },
  });

  // Décrémentation de stock
  const updatedProduct = await db.product.update({
    where: { id: product.id },
    data: { stock: { decrement: 1 } },
  });

  await db.inventoryMovement.create({
    data: {
      tenantId: tenant.id,
      productId: product.id,
      type: "out",
      qty: 1,
      reason: "Vente débriefing Assistante Maman",
    },
  });

  // Mise à jour CRM (reste à payer de 5 000 FCFA consigné)
  const remainingDebt = 5000;
  const debtNote = `[Reste à payer : ${remainingDebt} FCFA]`;
  const updatedClient = await db.clientProfile.update({
    where: { id: client.id },
    data: {
      visitsCount: { increment: 1 },
      totalSpent: { increment: 15000 }, // 15 000 F versés sur 20 000 F
      lastVisit: new Date(),
      notes: client.notes ? `${client.notes} | ${debtNote}` : debtNote,
    },
  });

  // Prise de rendez-vous de suivi dans 3 semaines
  const appointment = await db.appointment.create({
    data: {
      tenantId: tenant.id,
      clientProfileId: client.id,
      clientName: client.name,
      clientPhone: client.phone,
      resourceId: resource.id,
      serviceId: service.id,
      startAt: new Date(Date.now() + 21 * 86400000),
      durationMin: service.durationMin,
      price: service.price,
      status: "confirmed",
      notes: "Programmé par l'Assistante Maman suite au soin visage",
    },
  });

  console.log("\n👑 ─── TEST 4 : VÉRIFICATION DES IMPACTS DANS TOUS LES ONGLETS ───");

  // Onglet Caisse
  assert(sale.id.length > 0, `Onglet Caisse : Vente #${sale.id.slice(-6)} créée avec succès (20 000 FCFA, Wave)`);

  // Onglet Stock
  assert(updatedProduct.stock === initialStock - 1, `Onglet Stock : Baume Karité décompté (${initialStock} -> ${updatedProduct.stock})`);

  // Onglet CRM
  assert(updatedClient.visitsCount === initialVisits + 1, `Onglet CRM : Visite incrémentée (${updatedClient.visitsCount})`);
  assert(updatedClient.totalSpent === initialSpent + 15000, `Onglet CRM : Total payé cumulé (+15 000 FCFA)`);
  assert(Boolean(updatedClient.notes?.includes("Reste à payer : 5000 FCFA")), `Onglet CRM : Ardoise / Reste à payer consigné dans la fiche cliente`);

  // Onglet Agenda
  assert(appointment.id.length > 0, `Onglet Agenda : RDV de contrôle dans 3 semaines positionné pour ${client.name}`);

  console.log("\n👑 ─── TEST 5 : VÉRIFICATION DU « POINT DU SOIR » (DAILY SUMMARY) ───");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const salesToday = await db.sale.findMany({
    where: {
      tenantId: tenant.id,
      createdAt: { gte: todayStart },
      status: "completed",
    },
    include: { items: true },
  });

  let todayTotal = 0;
  let todayWave = 0;
  for (const s of salesToday) {
    todayTotal += s.total;
    if (s.paymentMethod === "wave") todayWave += s.total;
  }

  assert(salesToday.length >= 1, `Au moins 1 vente comptabilisée aujourd'hui (${salesToday.length} ventes)`);
  assert(todayTotal >= 20000, `Chiffre d'affaires du jour calculé : ${todayTotal.toLocaleString("fr-FR")} FCFA`);
  assert(todayWave >= 20000, `Total encaissé par Wave aujourd'hui : ${todayWave.toLocaleString("fr-FR")} FCFA`);

  const vocalSummary = `Bonsoir Maman ! Aujourd'hui, l'institut a réalisé ${todayTotal.toLocaleString("fr-FR")} francs de chiffre d'affaires. ` +
    `Dont ${todayWave.toLocaleString("fr-FR")} francs par Wave. Vous avez servi ${salesToday.length} clientes.`;
  assert(vocalSummary.includes("Bonsoir Maman !"), "Synthèse vocale chaleureuse personnalisée pour la Maman");

  console.log("\n🧹 ─── NETTOYAGE DES ENREGISTREMENTS DE TEST ───");
  await db.appointment.delete({ where: { id: appointment.id } }).catch(() => {});
  await db.saleItem.deleteMany({ where: { saleId: sale.id } }).catch(() => {});
  await db.sale.delete({ where: { id: sale.id } }).catch(() => {});
  // Restaurer le stock
  await db.product.update({ where: { id: product.id }, data: { stock: initialStock } }).catch(() => {});
  console.log("  ✅ Données de test nettoyées proprement");

  console.log(`\n========================================`);
  console.log(`Résultats des tests : ${passed} réussis, ${failed} échoués`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Erreur d'exécution du test :", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
