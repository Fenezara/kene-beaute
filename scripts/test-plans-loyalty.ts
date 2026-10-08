import { PLAN_DEFS, planDefById, getPlanTierPrice, computeConsecutiveMonths, grantClientWelcomeTrial, grantProWelcomeTrial, getLoyaltyStatus, GRACE_PERIOD_MS } from "../src/lib/kene/plans";
import { db } from "../src/lib/db";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 TEST SUITE: SYSTÈME D'ABONNEMENT ET FIDÉLITÉ KÈNÈ");
  console.log("==================================================");

  // 1. Vérification des définitions des plans
  console.log("\n1. Vérification des offres et grilles tarifaires :");
  const kenePlus = planDefById("kene_plus")!;
  const starter = planDefById("pro_starter")!;
  const institut = planDefById("pro_institut")!;
  const complexe = planDefById("pro_complexe")!;

  if (!kenePlus || !starter || !institut || !complexe) {
    throw new Error("❌ Un des plans est manquant dans PLAN_DEFS");
  }

  console.log(`✓ Kènè+ : ${kenePlus.priceFcfa} F -> ${kenePlus.minPriceFcfa} F (30j trial)`);
  console.log(`✓ Pro Starter : ${starter.priceFcfa} F -> ${starter.minPriceFcfa} F (30j trial)`);
  console.log(`✓ Pro Institut : ${institut.priceFcfa} F -> ${institut.minPriceFcfa} F (30j trial)`);
  console.log(`✓ Pro Complexe : ${complexe.priceFcfa} F -> ${complexe.minPriceFcfa} F (30j trial)`);

  if (kenePlus.priceFcfa !== 5000 || kenePlus.minPriceFcfa !== 2500) throw new Error("Tarif Kènè+ erroné");
  if (starter.priceFcfa !== 10000 || starter.minPriceFcfa !== 5000) throw new Error("Tarif Starter erroné");
  if (institut.priceFcfa !== 20000 || institut.minPriceFcfa !== 10000) throw new Error("Tarif Institut erroné");
  if (complexe.priceFcfa !== 30000 || complexe.minPriceFcfa !== 20000) throw new Error("Tarif Complexe erroné");

  // 2. Vérification des paliers dégressifs
  console.log("\n2. Vérification du calcul dynamique des paliers (getPlanTierPrice) :");
  const clientTiers = [0, 1, 2, 3, 4, 5, 6, 10].map((m) => getPlanTierPrice("kene_plus", m));
  console.log("Paliers Kènè+ (Mois 1 à 6+) :", clientTiers);
  if (JSON.stringify(clientTiers) !== JSON.stringify([5000, 4500, 4000, 3500, 3000, 2500, 2500, 2500])) {
    throw new Error("❌ Paliers Kènè+ incorrects : " + JSON.stringify(clientTiers));
  }

  const starterTiers = [0, 1, 2, 3, 4, 5, 6, 10].map((m) => getPlanTierPrice("pro_starter", m));
  console.log("Paliers Pro Starter (Mois 1 à 6+) :", starterTiers);
  if (JSON.stringify(starterTiers) !== JSON.stringify([10000, 9000, 8000, 7000, 6000, 5000, 5000, 5000])) {
    throw new Error("❌ Paliers Pro Starter incorrects : " + JSON.stringify(starterTiers));
  }

  const institutTiers = [0, 1, 2, 3, 4, 5, 6, 10].map((m) => getPlanTierPrice("pro_institut", m));
  console.log("Paliers Pro Institut (Mois 1 à 6+) :", institutTiers);
  if (JSON.stringify(institutTiers) !== JSON.stringify([20000, 18000, 16000, 14000, 12000, 10000, 10000, 10000])) {
    throw new Error("❌ Paliers Pro Institut incorrects : " + JSON.stringify(institutTiers));
  }

  const complexeTiers = [0, 1, 2, 3, 4, 5, 6, 10].map((m) => getPlanTierPrice("pro_complexe", m));
  console.log("Paliers Pro Complexe (Mois 1 à 6+) :", complexeTiers);
  if (JSON.stringify(complexeTiers) !== JSON.stringify([30000, 28000, 26000, 24000, 22000, 20000, 20000, 20000])) {
    throw new Error("❌ Paliers Pro Complexe incorrects : " + JSON.stringify(complexeTiers));
  }

  // 3. Test de continuité et règle du mois sauté avec la BDD
  console.log("\n3. Test en base de données de la continuité et de la règle du mois sauté :");
  const testPhone = "+2250799887766";
  await db.subscription.deleteMany({ where: { user: { phone: testPhone } } });
  await db.user.deleteMany({ where: { phone: testPhone } });

  const testUser = await db.user.create({
    data: {
      phone: testPhone,
      name: "Test Fidélité",
      role: "client",
    },
  });

  // Nouveau client sans abonnement :
  let months = await computeConsecutiveMonths(testUser.id, "kene_plus");
  console.log(`✓ 0 abonnement en BDD -> consecutiveMonths = ${months} (attendu: 0)`);
  if (months !== 0) throw new Error("Attendu 0 pour nouvel utilisateur");

  // Mois 1 payé (actif)
  const now = new Date();
  const sub1Expiry = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const sub1 = await db.subscription.create({
    data: {
      userId: testUser.id,
      plan: "kene_plus",
      status: "active",
      priceFcfa: 5000,
      source: "wave",
      startedAt: now,
      expiresAt: sub1Expiry,
    },
  });

  months = await computeConsecutiveMonths(testUser.id, "kene_plus");
  console.log(`✓ 1 mois payé actif -> consecutiveMonths = ${months} (attendu: 1)`);
  if (months !== 1) throw new Error("Attendu 1");

  const nextPriceM2 = getPlanTierPrice("kene_plus", months);
  console.log(`✓ Prochain tarif après Mois 1 -> ${nextPriceM2} F (attendu: 4500 F)`);
  if (nextPriceM2 !== 4500) throw new Error("Attendu 4500 F pour Mois 2");

  // Mois 2 renouvelé
  const sub2Expiry = new Date(sub1Expiry.getTime() + 30 * 24 * 3600 * 1000);
  await db.subscription.update({ where: { id: sub1.id }, data: { status: "cancelled" } });
  await db.subscription.create({
    data: {
      userId: testUser.id,
      plan: "kene_plus",
      status: "active",
      priceFcfa: 4500,
      source: "wave",
      startedAt: sub1Expiry,
      expiresAt: sub2Expiry,
    },
  });

  months = await computeConsecutiveMonths(testUser.id, "kene_plus");
  console.log(`✓ 2 mois consécutifs -> consecutiveMonths = ${months} (attendu: 2)`);
  if (months !== 2) throw new Error("Attendu 2");

  // Test du mois sauté : expiration dans le passé (+10 jours > 5 jours de grâce)
  await db.subscription.deleteMany({ where: { userId: testUser.id } });
  const pastExpiry = new Date(now.getTime() - 10 * 24 * 3600 * 1000); // expiré il y a 10 jours
  await db.subscription.create({
    data: {
      userId: testUser.id,
      plan: "kene_plus",
      status: "expired",
      priceFcfa: 4500,
      source: "wave",
      startedAt: new Date(pastExpiry.getTime() - 30 * 24 * 3600 * 1000),
      expiresAt: pastExpiry,
    },
  });

  months = await computeConsecutiveMonths(testUser.id, "kene_plus");
  console.log(`✓ Abonnement expiré depuis 10 jours (> 5j grâce) -> consecutiveMonths = ${months} (attendu: 0 - réinitialisation)`);
  if (months !== 0) throw new Error("La règle du mois sauté aurait dû réinitialiser à 0");

  const resetPrice = getPlanTierPrice("kene_plus", months);
  console.log(`✓ Tarif après mois sauté -> ${resetPrice} F (attendu: 5000 F - Mois 1)`);
  if (resetPrice !== 5000) throw new Error("Le tarif aurait dû redémarrer à 5000 F");

  // 4. Test du Pass Découverte gratuit 30 jours (0 FCFA) pour Client et Pro
  console.log("\n4. Test des Pass Découverte 30 jours offerts (0 FCFA) :");
  await db.subscription.deleteMany({ where: { userId: testUser.id } });

  const clientTrial = await grantClientWelcomeTrial(testUser.id);
  console.log(`✓ Client Welcome Trial accordé : plan = ${clientTrial?.plan}, price = ${clientTrial?.priceFcfa} FCFA, source = ${clientTrial?.source}`);
  if (!clientTrial || clientTrial.plan !== "kene_plus" || clientTrial.priceFcfa !== 0) {
    throw new Error("Pass découverte client non conforme");
  }

  // Pour un compte Pro
  const testProPhone = "+2250788776655";
  await db.subscription.deleteMany({ where: { user: { phone: testProPhone } } });
  await db.user.deleteMany({ where: { phone: testProPhone } });

  const testPro = await db.user.create({
    data: {
      phone: testProPhone,
      name: "Patronne Test Pro",
      role: "pro",
    },
  });

  const proTrial = await grantProWelcomeTrial(testPro.id);
  console.log(`✓ Pro Welcome Trial accordé : plan = ${proTrial?.plan}, price = ${proTrial?.priceFcfa} FCFA, source = ${proTrial?.source}`);
  if (!proTrial || proTrial.plan !== "pro_complexe" || proTrial.priceFcfa !== 0) {
    throw new Error("Pass découverte pro non conforme");
  }

  // Nettoyage des comptes de test
  await db.subscription.deleteMany({ where: { userId: { in: [testUser.id, testPro.id] } } });
  await db.user.deleteMany({ where: { id: { in: [testUser.id, testPro.id] } } });

  console.log("\n==================================================");
  console.log("✅ TOUS LES TESTS UNITAIRES ET MÉTIER ONT RÉUSSI !");
  console.log("==================================================");
}

runTests()
  .catch((e) => {
    console.error("FATAL TEST FAILURE:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
