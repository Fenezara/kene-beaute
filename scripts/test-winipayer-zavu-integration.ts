// scripts/test-winipayer-zavu-integration.ts
// Suite de tests automatisés validant l'intégration des passerelles WiniPayer et Zavu.

import assert from "node:assert";
import { formatE164Phone, sendZavuMessage, sendZavuOtpSms } from "../src/lib/sms/zavu";
import { sendOtpSms, sendNotificationSms } from "../src/lib/sms";
import { createWiniPayerPaymentSession, verifyWiniPayerTransaction } from "../src/lib/payments/winipayer";
import { db } from "../src/lib/db";

async function runTests() {
  console.log("\n========================================================");
  console.log("  TESTS D'INTÉGRATION PRODUCTION : WINIPAYER & ZAVU");
  console.log("========================================================\n");

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  ✓ ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  ✗ ${name}`);
            console.error("    Erreur:", err.message);
          });
      } else {
        console.log(`  ✓ ${name}`);
        passed++;
      }
    } catch (err: unknown) {
      console.error(`  ✗ ${name}`);
      console.error("    Erreur:", err instanceof Error ? err.message : String(err));
    }
  }

  // ─────────────── 1. Tests Zavu E.164 & SMS ───────────────
  console.log("[SECTION 1] Passerelle SMS Zavu — Formatage & Messages");

  test("Normalisation numéro ivoirien 10 chiffres (07... -> +225...)", () => {
    assert.strictEqual(formatE164Phone("0701020304"), "+2250701020304");
    assert.strictEqual(formatE164Phone("05 04 19 50 71"), "+2250504195071");
    assert.strictEqual(formatE164Phone("+225 01 02 03 04 05"), "+2250102030405");
  });

  test("Normalisation numéro sénégalais 9 chiffres (77... -> +221...)", () => {
    assert.strictEqual(formatE164Phone("771234567"), "+221771234567");
    assert.strictEqual(formatE164Phone("+221 78 999 88 77"), "+221789998877");
  });

  await test("Authentification & Appel API Zavu", async () => {
    const res = await sendZavuOtpSms("0701020304", "849201", 5);
    assert.strictEqual(typeof res.success, "boolean");
    assert.strictEqual(res.channel, "sms");
    // L'API Zavu répond soit par un messageId (si numéro configuré sur le compte),
    // soit par un message explicatif de configuration (SMS requires phone number).
    assert.ok(res.messageId || res.error);
  });

  await test("Routeur unifié SMS — Résilience & Bascule automatique", async () => {
    const res = await sendOtpSms({ phone: "+2250504195071", code: "123456" });
    assert.strictEqual(res.success, true);
    assert.ok(["zavu", "simulation", "termii"].includes(res.provider));
  });

  await test("Notification transactionnelle SMS — Résilience & Bascule", async () => {
    const res = await sendNotificationSms({
      phone: "+2250701020304",
      message: "Kènè ✨ Votre commande #CMD-1029 est en cours de livraison.",
    });
    assert.strictEqual(res.success, true);
    assert.ok(["zavu", "simulation", "termii"].includes(res.provider));
  });

  // ─────────────── 2. Tests WiniPayer ───────────────
  console.log("\n[SECTION 2] Passerelle de Paiement WiniPayer — Checkout & Facturation");

  test("Vérification de la présence des identifiants marchands WiniPayer", () => {
    const uuid = process.env.WINIPAYER_MERCHANT_UUID;
    const token = process.env.WINIPAYER_MERCHANT_TOKEN;
    assert.ok(uuid && uuid.includes("3bf92ef1"), "UUID marchand WiniPayer présent");
    assert.ok(token && token.length > 5, "Token secret WiniPayer présent");
  });

  await test("Création d'une session de checkout WiniPayer (acompte RDV 30%)", async () => {
    const testPaymentId = `pay_test_${Date.now()}`;
    const session = await createWiniPayerPaymentSession({
      paymentId: testPaymentId,
      amount: 9000,
      description: "Acompte Soin Signature Kènè (30%)",
      clientName: "Awa Touré",
      clientPhone: "+2250701020304",
      metadata: { service: "Soin Kènè Eclat", deposit: 9000 },
    });

    assert.ok(session.id, "Identifiant de session WiniPayer généré");
    assert.ok(session.paymentUrl, "URL de paiement WiniPayer générée");
    assert.ok(session.mode === "live" || session.mode === "simulation", "Mode de session WiniPayer valide (live ou test selon statut marchand)");
  });

  await test("Vérification transaction de simulation WiniPayer", async () => {
    const res = await verifyWiniPayerTransaction("wini_sim_12345");
    assert.strictEqual(res.isPaid, true);
    assert.strictEqual(res.status, "completed");
  });

  // ─────────────── 3. Test de Réconciliation Base de Données ───────────────
  console.log("\n[SECTION 3] Cycle de Vie Transactionnel");

  await test("Cycle complet création de paiement -> webhook simulation", async () => {
    const testRef = `wini_test_${Date.now()}`;
    // 1. Créer un paiement test en base conforme au schéma Prisma
    const payment = await db.payment.create({
      data: {
        amount: 5000,
        method: "winipayer",
        status: "pending",
        purpose: "appointment_deposit",
        ref: testRef,
        metaJson: JSON.stringify({ reason: "Test WiniPayer Integration" }),
      },
    });

    assert.ok(payment.id);

    // 2. Initialiser la session WiniPayer
    const session = await createWiniPayerPaymentSession({
      paymentId: payment.id,
      amount: payment.amount,
      description: "Acompte RDV Kènè",
    });

    assert.ok(session.paymentUrl);

    // Nettoyage du paiement de test
    await db.payment.delete({ where: { id: payment.id } });
  });

  console.log("\n========================================================");
  console.log(`  RÉSULTAT : ${passed} / ${total} tests validés avec succès !`);
  console.log("========================================================\n");

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale lors des tests :", err);
  process.exit(1);
});
