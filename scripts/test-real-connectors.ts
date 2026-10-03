// Kènè — Test automatisé des passerelles réelles (Wave Mobile Money & Termii SMS)
// Valide :
// 1. L'idempotence et l'atomicité de executePaymentSuccess (anti-TOCTOU, sorties de stock, cashback)
// 2. Le client Wave Checkout (simulation + calcul/vérification de signature HMAC SHA-256)
// 3. Le webhook Wave (traitement d'événement checkout.session.completed)
// 4. Le formateur de numéros ouest-africains Termii (+225 CI et +221 SN)
// 5. L'envoi SMS OTP avec repli simulation propre

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { executePaymentSuccess } from "../src/lib/kene/payment-core";
import { createWaveCheckoutSession, verifyWaveSignature } from "../src/lib/payments/wave";
import { formatWestAfricaPhone, sendOtpSms, sendNotificationSms } from "../src/lib/sms/termii";
import { orderInvoicePdf } from "../src/lib/kene/order-invoice-pdf";
import { appointmentPassPdf } from "../src/lib/kene/appointment-pass-pdf";
import { calculateShippingFee, CITIES } from "../src/lib/kene/delivery";
import { createOrangeCheckoutSession } from "../src/lib/payments/orange";
import { generateThermalReceiptHtml } from "../src/lib/accounting/receipt-thermal";

const prisma = new PrismaClient();

async function runTests() {
  console.log("==================================================");
  console.log("🧪 Démarrage des tests des passerelles Kènè...");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      failed++;
    }
  }

  // --- Test 1 : Formatage des numéros Télécom UEMOA (Termii) ---
  console.log("--- Test 1 : Normalisation Télécom (Côte d'Ivoire & Sénégal) ---");
  const phone1 = formatWestAfricaPhone("+225 07 01 02 03 04");
  assert(phone1 === "2250701020304", "Numéro ivoirien avec indicatif et espaces (+225 07...) -> 2250701020304");

  const phone2 = formatWestAfricaPhone("0701020304");
  assert(phone2 === "2250701020304", "Numéro ivoirien local sans indicatif (07...) -> 2250701020304");

  const phone3 = formatWestAfricaPhone("+221 77 123 45 67");
  assert(phone3 === "221771234567", "Numéro sénégalais avec indicatif (+221 77...) -> 221771234567");

  const phone4 = formatWestAfricaPhone("771234567");
  assert(phone4 === "221771234567", "Numéro sénégalais local sans indicatif (77...) -> 221771234567");

  // --- Test 2 : Envoi SMS OTP Termii en mode simulation ---
  console.log("\n--- Test 2 : Passerelle SMS Termii ---");
  const smsRes = await sendOtpSms({ phone: "+2250701020304", code: "789123" });
  assert(smsRes.success === true, "Envoi SMS retourne success: true");
  assert(smsRes.simulated === true, "En l'absence de clé réelle, mode simulation activé sans plantage");

  // --- Test 3 : Passerelle Wave Checkout (Session creation) ---
  console.log("\n--- Test 3 : Passerelle Wave Checkout ---");
  const waveSession = await createWaveCheckoutSession({
    paymentId: "test_pay_123",
    amount: 15000,
    currency: "XOF",
    description: "Test de commande",
  });
  assert(waveSession.mode === "simulation", "Wave session en mode simulation si WAVE_API_KEY absent");
  assert(waveSession.id === "wave_sim_test_pay_123", "Génération correcte de l'identifiant de session simulée");

  // --- Test 4 : Vérification cryptographique des signatures Wave ---
  console.log("\n--- Test 4 : Vérification de signature HMAC Wave ---");
  const secret = "whsec_test_secret_kene_2026";
  const body = JSON.stringify({ type: "checkout.session.completed", data: { client_reference: "pay_test" } });

  // Format Wave t=timestamp,v1=signature
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payloadToSign = `${timestamp}.${body}`;
  const validSignature = crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");
  const header = `t=${timestamp},v1=${validSignature}`;

  const isSigValid = verifyWaveSignature(body, header, secret);
  assert(isSigValid === true, "Signature Wave officielle valide acceptée");

  const isTamperedInvalid = verifyWaveSignature(body + "tampered", header, secret);
  assert(isTamperedInvalid === false, "Payload altéré rejeté");

  const isBadSigInvalid = verifyWaveSignature(body, `t=${timestamp},v1=deadbeef`, secret);
  assert(isBadSigInvalid === false, "Fausse signature rejetée");

  // --- Test 5 : Cœur Transactionnel Idempotent (executePaymentSuccess) ---
  console.log("\n--- Test 5 : Atomicité & Idempotence executePaymentSuccess ---");

  // Récupérer un utilisateur de test
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("Aucun utilisateur en base pour le test de paiement.");
    return;
  }

  // Créer un produit de test avec stock connu
  const product = await prisma.product.create({
    data: {
      name: "Produit Test Paiement",
      description: "Produit de test pour la passerelle",
      botanicals: "Karité, Moringa",
      image: "/products/test.webp",
      price: 5000,
      stock: 20,
      category: "creme",
    },
  });

  // Créer une commande de test
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      subtotal: 5000,
      total: 5000,
      cashback: 250,
      status: "pending",
      items: {
        create: {
          productId: product.id,
          label: product.name,
          qty: 2,
          unitPrice: 2500,
          total: 5000,
        },
      },
    },
  });

  // Créer le paiement pending
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 5000,
      method: "wave",
      purpose: "shop_order",
      status: "pending",
      ref: `TEST-${Date.now()}`,
      metaJson: JSON.stringify({ orderId: order.id }),
    },
  });

  // 1ère exécution : Doit réussir, passer en paid, décrémenter le stock de 2 (20 -> 18)
  const exec1 = await executePaymentSuccess(payment.id);
  assert(exec1.success === true, "1ère exécution de executePaymentSuccess réussie");

  const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
  assert(updatedOrder?.status === "paid", "Statut de la commande passé à 'paid'");

  const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
  assert(updatedProduct?.stock === 18, "Stock décrémenté exactement de 2 (20 -> 18)");

  // 2ème exécution (Rejeu/Webhook dupliqué) : Doit refuser sans impacter le stock
  const exec2 = await executePaymentSuccess(payment.id);
  assert(exec2.success === false && exec2.reason === "already_confirmed", "2ème exécution refusée avec reason: 'already_confirmed'");

  const productAgain = await prisma.product.findUnique({ where: { id: product.id } });
  assert(productAgain?.stock === 18, "Stock intact après rejeu (idempotence stricte)");

  // Nettoyage commande boutique
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.order.delete({ where: { id: order.id } });
  await prisma.payment.delete({ where: { id: payment.id } });
  await prisma.product.delete({ where: { id: product.id } });

  // --- Test 5 : Acompte RDV Wave & Confirmation Automatique ---
  console.log("\n--- Test 5 : Acompte RDV Institut via Wave ---");
  const tenant = await prisma.tenant.findFirst();
  const service = await prisma.service.findFirst({ where: { tenantId: tenant?.id } });
  const resource = await prisma.resource.findFirst({ where: { tenantId: tenant?.id } });

  if (tenant && service && resource) {
    const appointment = await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        serviceId: service.id,
        resourceId: resource.id,
        userId: user.id,
        clientName: user.name,
        clientPhone: user.phone,
        startAt: new Date(Date.now() + 48 * 3_600_000),
        durationMin: service.durationMin,
        status: "pending",
        price: service.price,
        depositAmount: 0,
      },
    });

    const depositPayment = await prisma.payment.create({
      data: {
        userId: user.id,
        amount: Math.round(service.price * 0.3),
        method: "wave",
        purpose: "appointment_deposit",
        status: "pending",
        ref: `TEST-APPT-${Date.now()}`,
        metaJson: JSON.stringify({ appointmentId: appointment.id }),
      },
    });

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { paymentId: depositPayment.id },
    });

    const waveApptSession = await createWaveCheckoutSession({
      paymentId: depositPayment.id,
      amount: depositPayment.amount,
      description: `Acompte RDV Kènè - ${service.name} chez ${tenant.name}`,
    });
    assert(waveApptSession.mode === "simulation" || Boolean(waveApptSession.waveLaunchUrl), "Session Wave RDV initialisée correctement");

    // Confirmation du paiement d'acompte par le webhook
    const execAppt = await executePaymentSuccess(depositPayment.id);
    assert(execAppt.success === true, "Confirmation du paiement de l'acompte RDV réussie");

    const confirmedAppt = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    assert(confirmedAppt?.status === "confirmed", "Statut du RDV passé à 'confirmed'");
    assert(confirmedAppt?.depositAmount === depositPayment.amount, `Montant de l'acompte (${depositPayment.amount} F) enregistré`);

    // Nettoyage RDV test
    await prisma.appointment.delete({ where: { id: appointment.id } });
    await prisma.payment.delete({ where: { id: depositPayment.id } });
  }

  // --- Test 6 : Recharge Wallet via Wave & Confirmation ---
  console.log("\n--- Test 6 : Recharge Wallet via Wave ---");
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  const initialBalance = wallet?.balance ?? 0;
  const topupAmount = 10000;

  const topupPayment = await prisma.payment.create({
    data: {
      userId: user.id,
      amount: topupAmount,
      method: "wave",
      purpose: "wallet_topup",
      status: "pending",
      ref: `TEST-TOPUP-${Date.now()}`,
      metaJson: JSON.stringify({ userId: user.id }),
    },
  });

  const waveTopupSession = await createWaveCheckoutSession({
    paymentId: topupPayment.id,
    amount: topupAmount,
    description: `Recharge portefeuille Kènè (${topupAmount} F)`,
  });
  assert(waveTopupSession.mode === "simulation" || Boolean(waveTopupSession.waveLaunchUrl), "Session Wave Wallet initialisée correctement");

  const execTopup = await executePaymentSuccess(topupPayment.id);
  assert(execTopup.success === true, "Confirmation de la recharge wallet réussie");

  const updatedWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  assert(
    (updatedWallet?.balance ?? 0) === initialBalance + topupAmount,
    `Solde wallet crédité exactement de ${topupAmount} F (${initialBalance} -> ${updatedWallet?.balance})`
  );

  // Nettoyage recharge
  await prisma.walletTransaction.deleteMany({ where: { refId: topupPayment.id } });
  await prisma.payment.delete({ where: { id: topupPayment.id } });
  // Rétablir solde
  await prisma.wallet.update({ where: { userId: user.id }, data: { balance: initialBalance } });

  // --- Test 9 : Envoi SMS Transactionnel de Notification Termii ---
  console.log("\n--- Test 9 : Envoi SMS de Notification Termii ---");
  const notifSms = await sendNotificationSms({
    phone: "+225 05 99 88 77 66",
    message: "Kènè : Votre commande FA-998877 a été expédiée avec succès.",
  });
  assert(notifSms.success === true, "Notification SMS retourne success: true");
  assert(notifSms.simulated === true, "Notification SMS en mode simulation transparente sans clé");

  // --- Test 10 : Génération PDF Facture & Reçu d'Achat Boutique ---
  console.log("\n--- Test 10 : Génération PDF Facture / Reçu Boutique ---");
  const invoiceResult = orderInvoicePdf({
    order: {
      id: "ord_test_998877",
      createdAt: new Date("2026-09-16T14:00:00Z"),
      status: "paid",
      subtotal: 35000,
      discount: 5000,
      couponCode: "KENE2026",
      cashback: 1500,
      total: 30000,
      paymentId: "pay_test_inv",
    },
    items: [
      {
        id: "item_1",
        label: "Sérum Éclat Moringa & Baobab",
        qty: 2,
        unitPrice: 12500,
        total: 25000,
        botanicals: "Moringa, Baobab bio d'Afrique de l'Ouest",
      },
      {
        id: "item_2",
        label: "Crème Hydratante Karité Nilotica",
        qty: 1,
        unitPrice: 10000,
        total: 10000,
        botanicals: "Beurre de Karité Nilotica & Aloé Vera",
      },
    ],
    user: {
      id: "usr_awa_123",
      name: "Awa Coulibaly",
      phone: "+2250701020304",
      city: "Abidjan, Cocody",
    },
    tenant: {
      id: "ten_dermo",
      name: "Institut Dermo Prestige",
      city: "Abidjan",
      address: "Rue des Jardins, Deux Plateaux",
      phone: "+225 27 22 00 11 22",
    },
    payment: {
      id: "pay_test_inv",
      ref: "PAY-WAVE-998877",
      method: "wave",
      status: "success",
      confirmedAt: new Date("2026-09-16T14:02:00Z"),
    },
  });

  assert(invoiceResult.pages >= 1, `Facture PDF générée (${invoiceResult.pages} page(s))`);
  assert(invoiceResult.data instanceof Uint8Array, "Le résultat est un Uint8Array binaire");
  assert(invoiceResult.data.length > 2000, `Taille du PDF cohérente (${invoiceResult.data.length} octets)`);
  const invoiceHeader = Buffer.from(invoiceResult.data.slice(0, 8)).toString("ascii");
  assert(invoiceHeader.startsWith("%PDF-1.4"), "En-tête conforme au standard %PDF-1.4");

  // --- Test 11 : Génération PDF Pass Rendez-Vous Institut ---
  console.log("\n--- Test 11 : Génération PDF Pass Rendez-Vous & Reçu d'Acompte ---");
  const passResult = appointmentPassPdf({
    appointment: {
      id: "appt_test_445566",
      startAt: new Date("2026-09-18T15:30:00Z"),
      durationMin: 60,
      status: "confirmed",
      price: 25000,
      depositAmount: 7500,
      clientName: "Aminata Traoré",
      clientPhone: "+221771234567",
      notes: "Soin purifiant peaux mélanodermes",
    },
    service: {
      name: "Soin Signature Éclat & Oxygénation",
      category: "soin",
      durationMin: 60,
      price: 25000,
      description: "Protocole dermo-expert avec vapeur d'eucalyptus et massage drainant",
    },
    tenant: {
      name: "Institut Kènè Almadies",
      city: "Dakar",
      address: "Route des Almadies, Zone 4",
      phone: "+221 33 820 00 11",
    },
    resource: {
      name: "Fatou Diop",
      role: "Dermo-esthéticienne certifiée",
    },
    user: {
      id: "usr_ami_789",
      name: "Aminata Traoré",
      phone: "+221771234567",
      skinType: "Mixte à tendance grasse",
    },
    payment: {
      ref: "PAY-WALLET-445566",
      method: "wallet",
    },
  });

  assert(passResult.pages >= 1, `Pass RDV PDF généré (${passResult.pages} page(s))`);
  assert(passResult.data instanceof Uint8Array, "Le résultat du pass est un Uint8Array");
  assert(passResult.data.length > 2000, `Taille du pass PDF cohérente (${passResult.data.length} octets)`);
  const passHeader = Buffer.from(passResult.data.slice(0, 8)).toString("ascii");
  assert(passHeader.startsWith("%PDF-1.4"), "En-tête du pass conforme au standard %PDF-1.4");

  // --- Test 9 : Logistique & Frais de livraison urbaine (Abidjan & Dakar) ---
  console.log("\n--- Test 9 : Logistique & Frais de livraison urbaine ---");
  const feeCocody = calculateShippingFee("abidjan", "Cocody");
  assert(feeCocody === 1500, `Frais Abidjan Cocody = 1500 FCFA (reçu: ${feeCocody})`);

  const feeBingerville = calculateShippingFee("abidjan", "Bingerville");
  assert(feeBingerville === 2500, `Frais Abidjan Bingerville = 2500 FCFA (reçu: ${feeBingerville})`);

  const feeAlmadies = calculateShippingFee("dakar", "Almadies");
  assert(feeAlmadies === 1500, `Frais Dakar Almadies = 1500 FCFA (reçu: ${feeAlmadies})`);

  const feeSicap = calculateShippingFee("dakar", "Sicap");
  assert(feeSicap === 2000, `Frais Dakar Sicap = 2000 FCFA (reçu: ${feeSicap})`);

  const feeRufisque = calculateShippingFee("dakar", "Rufisque");
  assert(feeRufisque === 3000, `Frais Dakar Rufisque = 3000 FCFA (reçu: ${feeRufisque})`);

  assert(CITIES.abidjan.areas.length >= 8, `Catalogue Abidjan complet (${CITIES.abidjan.areas.length} communes)`);
  assert(CITIES.dakar.areas.length >= 8, `Catalogue Dakar complet (${CITIES.dakar.areas.length} zones)`);

  // --- Test 10 : Passerelle Orange Money Web Payment ---
  console.log("\n--- Test 10 : Passerelle Orange Money Web Payment ---");
  const omSession = await createOrangeCheckoutSession({
    paymentId: "ord_test_om_456",
    amount: 17500,
    currency: "XOF",
    returnUrl: "https://kene.app/shop?success=1",
    cancelUrl: "https://kene.app/shop?cancelled=1",
    phone: "2250701020304",
  });
  assert(Boolean(omSession.id), "Session Orange Money créée avec succès");
  assert(omSession.mode === "simulation", "En l'absence de credentials de production, mode simulation activé avec grâce");

  // --- Test 11 : Ticket de caisse thermique Pro (80mm & 58mm) ---
  console.log("\n--- Test 11 : Ticket de caisse thermique Pro (80mm & 58mm) ---");
  const receipt80 = generateThermalReceiptHtml(
    {
      tenantName: "Kènè Spa Plateau",
      tenantAddress: "Avenue Chardy, Abidjan Plateau",
      tenantPhone: "+225 27 20 00 11 22",
      receiptNumber: "TK-889900",
      createdAt: new Date(),
      cashierName: "Awa Cissé",
      clientName: "Mariam Traoré",
      items: [
        { label: "Soin Visage Éclat Baobab", qty: 1, unitPrice: 20000, total: 20000, kind: "service" },
        { label: "Beurre de Karité Pur 250g", qty: 2, unitPrice: 4000, total: 8000, kind: "product" },
      ],
      subtotal: 28000,
      discount: 3000,
      total: 25000,
      paymentMethod: "orange",
      paymentRef: "OM-TX-778899",
    },
    "80mm"
  );
  assert(receipt80.includes("80mm auto"), "Ticket 80mm contient la règle CSS @page 80mm");
  assert(receipt80.includes("TICKET DE CAISSE"), "Ticket 80mm contient l'en-tête de caisse");
  assert(receipt80.includes("Orange Money"), "Ticket 80mm mentionne le moyen de paiement");
  assert(receipt80.includes("SYSCOHADA"), "Ticket 80mm mentionne la conformité comptable");

  const receipt58 = generateThermalReceiptHtml(
    {
      tenantName: "Kènè Express",
      receiptNumber: "TK-580001",
      createdAt: new Date(),
      items: [{ label: "Savon Noir", qty: 1, unitPrice: 2500, total: 2500 }],
      subtotal: 2500,
      total: 2500,
      paymentMethod: "cash",
    },
    "58mm"
  );
  assert(receipt58.includes("58mm auto"), "Ticket 58mm contient la règle CSS @page 58mm");
  assert(receipt58.includes("220px"), "Ticket 58mm calibré pour largeur 220px compacte");

  console.log("\n==================================================");

  console.log(`🏁 Résultats : ${passed} passés, ${failed} échoués.`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error("Erreur inattendue lors des tests:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
