// Kènè — Suite de tests de validation des 5 axes de perfectionnement
// 1. Pilote Bluetooth ESC/POS (58mm / 80mm, flux binaire, encodage)
// 2. Caisse Offline-First (Persistance, file d'attente, réconciliation)
// 3. Ordonnance Dermo-Botanique PDF & Pass Cabine QR vectoriel
// 4. Relais WhatsApp Business (Formatage numéros CI/SN, modèles de messages)
// 5. Tableau de bord financier & métriques

import assert from "node:assert/strict";
import { buildEscPosBinary, isWebBluetoothSupported } from "../src/lib/hardware/bluetooth-escpos";
import { saveOfflineSale, getPendingOfflineSales, removeOfflineSale, isNetworkOnline } from "../src/lib/pos/offline-queue";
import { generatePrescriptionPdf } from "../src/lib/kene/dermo-prescription-pdf";
import {
  formatWhatsAppPhone,
  createWhatsAppLink,
  buildWhatsAppReceiptMessage,
  buildWhatsAppAppointmentMessage,
  buildWhatsAppDeliveryMessage,
} from "../src/lib/kene/whatsapp-relay";
import type { ThermalReceiptData } from "../src/lib/accounting/receipt-thermal";
import type { DiagnosisResult } from "../src/lib/kene/types";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  ✓ ${name}`);
        })
        .catch((err) => {
          failed++;
          console.error(`  ✗ ${name}:`, err.message);
        });
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}:`, err.message);
  }
}

async function runAll() {
  console.log("=== TESTS DE VALIDATION DES 5 AXES DE PERFECTIONNEMENT KÈNÈ ===");

  // ─────────────── AXE 1 : BLUETOOTH ESC/POS ───────────────
  console.log("\n[AXE 1] Pilote Thermique ESC/POS Direct");

  test("Détection support Web Bluetooth en environnement Node", () => {
    assert.equal(isWebBluetoothSupported(), false, "Doit renvoyer false sans crash côté serveur");
  });

  const receiptMock: ThermalReceiptData = {
    tenantName: "Institut Kènè Cocody",
    tenantAddress: "Cocody Mermoz, Rue C12",
    tenantPhone: "+225 07 08 09 10 11",
    receiptNumber: "TK-98214A",
    createdAt: new Date("2026-09-16T14:30:00Z"),
    cashierName: "Awa Touré",
    clientName: "Mariam Diallo",
    items: [
      { label: "Soin Éclat Kinkeliba", qty: 1, unitPrice: 15000, total: 15000, kind: "service" },
      { label: "Beurre de Karité Korhogo", qty: 2, unitPrice: 4000, total: 8000, kind: "product" },
    ],
    subtotal: 23000,
    discount: 3000,
    total: 20000,
    paymentMethod: "wave",
    paymentRef: "WAV-20260916-1234",
  };

  test("Génération binaire ESC/POS 80mm", () => {
    const bytes = buildEscPosBinary(receiptMock, "80mm");
    assert.ok(bytes instanceof Uint8Array, "Doit retourner un Uint8Array");
    assert.ok(bytes.length > 100, "Le buffer doit contenir des octets");
    // Initialisation ESC @ (0x1B, 0x40)
    assert.equal(bytes[0], 0x1b);
    assert.equal(bytes[1], 0x40);
    // Découpe papier en fin de flux (0x1D, 0x56)
    assert.equal(bytes[bytes.length - 4], 0x1d);
    assert.equal(bytes[bytes.length - 3], 0x56);
  });

  test("Génération binaire ESC/POS 58mm (format compact)", () => {
    const bytes58 = buildEscPosBinary(receiptMock, "58mm");
    assert.ok(bytes58.length > 50);
  });

  // ─────────────── AXE 2 : CAISSE OFFLINE-FIRST ───────────────
  console.log("\n[AXE 2] Caisse POS Offline-First & Résilience Réseau");

  test("Statut réseau par défaut", () => {
    assert.equal(isNetworkOnline(), true);
  });

  await test("Enregistrement d'une vente hors-ligne dans la file", async () => {
    const saved = await saveOfflineSale({
      tenantId: "tenant-cocody-01",
      items: [{ kind: "service", id: "srv-1", label: "Gommage Baobab", unitPrice: 12000, qty: 1 }],
      paymentMethod: "cash",
      total: 12000,
    });
    assert.ok(saved.localId.startsWith("off_"), "L'ID local doit commencer par off_");
    assert.equal(saved.synced, false);
    assert.equal(saved.total, 12000);

    const pending = await getPendingOfflineSales("tenant-cocody-01");
    assert.ok(pending.some((s) => s.localId === saved.localId), "La vente doit être dans la file d'attente");

    // Nettoyage après test
    await removeOfflineSale(saved.localId);
    const after = await getPendingOfflineSales("tenant-cocody-01");
    assert.ok(!after.some((s) => s.localId === saved.localId), "La vente doit être retirée");
  });

  // ─────────────── AXE 3 : ORDONNANCE DERMO-BOTANIQUE PDF & QR ───────────────
  console.log("\n[AXE 3] Ordonnance Dermo-Botanique PDF & QR Pass Cabine");

  const diagMock: DiagnosisResult = {
    score_global: 84,
    fitzpatrick_estime: "Phototype V",
    indicateurs: [
      { nom: "Hydratation profonde", pourcentage: 82, severite: 0 },
      { nom: "Homogénéité pigmentaire", pourcentage: 74, severite: 1 },
      { nom: "Barrière lipidique", pourcentage: 88, severite: 0 },
    ],
    recommandations: {
      resume: "Excellente réactivité aux huiles végétales pures et antioxydants locaux.",
      routine_matin: ["Nettoyage doux au savon noir surgras", "Hydrolat de Kinkeliba tonifiant", "Sérum protecteur mélanine"],
      routine_soir: ["Démaquillage à l'huile de baobab", "Application beurre de karité de Korhogo"],
      botaniques_conseillees: ["Kinkeliba", "Moringa", "Karité de Korhogo", "Huile de Baobab"],
      produits: ["Sérum Moringa antioxydant", "Baume Karité pur de Korhogo"],
      soins_conseilles: ["Soin Éclat Kinkeliba en cabine", "Massage relaxant au beurre tiède"],
      conseils_hygiene_vie: ["Boire 2L d'eau par jour", "Éviter les savons décapants"],
    },
    zones_marquages: [],
    zone: "visage",
    orientation_dermato: false,
    source: "vlm",
    avertissement: "Document d'orientation cosmétique.",
  };

  test("Génération de l'Ordonnance PDF vectorielle avec QR Code scannable", () => {
    const pdf = generatePrescriptionPdf({
      userName: "Mariam Diallo",
      userPhone: "+225 07 08 09 10 11",
      zone: "visage",
      createdAt: new Date(),
      diagnosisResult: diagMock,
      passUrl: "https://kene.app/pro?clientPass=diag-123456",
    });

    assert.ok(pdf.data instanceof Uint8Array);
    assert.ok(pdf.data.length > 500, "Le fichier PDF doit avoir une taille valide");
    assert.equal(pdf.pages, 1, "L'ordonnance doit tenir sur une seule page prestige");

    // Vérification de l'en-tête PDF standard %PDF-1.4
    const header = Buffer.from(pdf.data.slice(0, 8)).toString("ascii");
    assert.ok(header.startsWith("%PDF-"), "Doit débuter par la signature magique PDF");
  });

  // ─────────────── AXE 4 : RELAIS WHATSAPP BUSINESS ───────────────
  console.log("\n[AXE 4] Relais WhatsApp Business & Liens Directs");

  test("Formatage numéro Côte d'Ivoire (10 chiffres)", () => {
    const phone = formatWhatsAppPhone("07 08 09 10 11", "CI");
    assert.equal(phone, "2250708091011");
  });

  test("Formatage numéro Sénégal (9 chiffres)", () => {
    const phone = formatWhatsAppPhone("77 123 45 67", "SN");
    assert.equal(phone, "221771234567");
  });

  test("Génération message ticket WhatsApp dématérialisé", () => {
    const msg = buildWhatsAppReceiptMessage({
      tenantName: "Institut Kènè",
      receiptNumber: "TK-123456",
      clientName: "Mariam",
      items: [{ label: "Soin Kinkeliba", qty: 1, total: 15000 }],
      total: 15000,
      paymentMethod: "Wave",
    });
    assert.ok(msg.includes("Mariam"));
    assert.ok(msg.includes("TK-123456"));
    assert.ok(/15[\s\u00A0\u202F]000/.test(msg));
    assert.ok(msg.includes("FCFA"));
  });

  test("Génération message rappel rendez-vous WhatsApp", () => {
    const msg = buildWhatsAppAppointmentMessage({
      clientName: "Aïcha",
      tenantName: "Kènè Spa Plateau",
      serviceName: "Rituel Éclat",
      dateStr: "18 septembre 2026",
      timeStr: "15h30",
      addressOrLandmark: "Face Immeuble CCIA",
    });
    assert.ok(msg.includes("Aïcha"));
    assert.ok(msg.includes("Rituel Éclat"));
    assert.ok(msg.includes("15h30"));
  });

  test("Génération message livraison urbaine WhatsApp", () => {
    const msg = buildWhatsAppDeliveryMessage({
      clientName: "Fatou",
      orderNumber: "CMD-8871",
      deliveryZone: "Cocody",
      deliveryAddress: "Cité des Cadres, Villa 42",
      total: 25000,
      isPaid: true,
      carrierPhone: "05 05 05 05 05",
    });
    assert.ok(msg.includes("Fatou"));
    assert.ok(msg.includes("CMD-8871"));
    assert.ok(msg.includes("Cocody"));
    assert.ok(msg.includes("Commande déjà réglée en ligne"));
  });

  test("Construction lien wa.me encodé", () => {
    const link = createWhatsAppLink("0708091011", "Bonjour Kènè !", "CI");
    assert.ok(link.startsWith("https://wa.me/2250708091011?text="));
    assert.ok(link.includes("Bonjour%20K%C3%A8n%C3%A8%20!"));
  });

  // ─────────────── BILAN ───────────────
  console.log(`\n========================================`);
  console.log(`RÉSULTAT DES TESTS : ${passed} passés, ${failed} échoués`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch((e) => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});
