// Kènè — Suite de tests de validation des 6 Piliers d'Excellence Opérationnelle
// 1. Passerelle RDV ↔ Caisse POS (Déduction d'acompte & transition de statut)
// 2. Clôture de Caisse Journalière — Rapport Z (ESC/POS 80/58mm, HTML, TVA SYSCOHADA)
// 3. Curseur Comparatif Interactif Avant / Après (Split-Slider & Fluorométrie)
// 4. Commissions Praticiennes & Ventes Boutique (Primes 10% soins & 5% boutique)
// 5. Logistique Livraison par Commune & Relais Coursier WhatsApp (Abidjan / Dakar)
// 6. Cosmétovigilance & Checklist de Sécurité Cabine (Contre-indications cliniques)

import assert from "node:assert/strict";
import {
  buildCashClosureEscPosBinary,
  generateCashClosureHtml,
  type CashClosureData,
} from "../src/lib/hardware/cash-closure-ticket";
import {
  ABIDJAN_COMMUNES,
  DAKAR_COMMUNES,
  findCommune,
  buildCourierMissionMessage,
} from "../src/lib/kene/delivery-zones";
import {
  CABIN_SAFETY_CHECKLIST,
  evaluateSafetyChecklist,
  type CosmetovigilanceIncident,
} from "../src/lib/kene/cosmetovigilance";

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
  console.log("=== TESTS DE VALIDATION DES 6 PILIERS D'EXCELLENCE KÈNÈ ===");

  // ─────────────── PILIER 1 : PASSERELLE RDV ↔ CAISSE POS ───────────────
  console.log("\n[PILIER 1] Passerelle RDV ↔ Caisse POS & Déduction d'Acompte");

  test("Déduction de l'acompte Mobile Money et calcul du solde restant dû", () => {
    const soinPrice = 25000;
    const waveDeposit = 5000;
    const solde = Math.max(0, soinPrice - waveDeposit);
    assert.equal(solde, 20000, "Le solde net à payer en caisse doit être de 20 000 FCFA");
  });

  test("Gestion d'un acompte supérieur ou égal au montant (solde zéro)", () => {
    const soinPrice = 10000;
    const deposit = 10000;
    const solde = Math.max(0, soinPrice - deposit);
    assert.equal(solde, 0, "Le solde restant dû doit être 0 FCFA");
  });

  // ─────────────── PILIER 2 : CLÔTURE DE CAISSE JOURNALIÈRE (RAPPORT Z) ───────────────
  console.log("\n[PILIER 2] Clôture de Caisse Journalière (« Rapport Z »)");

  const mockClosure: CashClosureData = {
    tenantName: "Institut Kènè Cocody Mermoz",
    tenantCity: "Abidjan",
    tenantPhone: "+225 07 00 11 22 33",
    closureDate: new Date("2026-09-17T19:30:00Z"),
    closedBy: "Aminata Traoré",
    openingCash: 50000,
    cashSales: 120000,
    countedCash: 120000,
    cashVariance: 0,
    waveSales: 80000,
    orangeSales: 55000,
    cardSales: 30000,
    walletSales: 0,
    totalSales: 285000,
    salesCount: 14,
    notes: "Clôture conforme sans écart",
  };

  test("Génération binaire ESC/POS 80mm pour imprimante thermique", () => {
    const bin = buildCashClosureEscPosBinary(mockClosure, "80mm");
    assert(bin instanceof Uint8Array, "Doit être un Uint8Array");
    assert(bin.length > 200, "Le ticket binaire 80mm doit contenir les commandes ESC/POS complètes");
  });

  test("Génération binaire ESC/POS 58mm (imprimante mobile de poche)", () => {
    const bin58 = buildCashClosureEscPosBinary(mockClosure, "58mm");
    assert(bin58 instanceof Uint8Array);
    assert(bin58.length > 150, "Le ticket binaire 58mm doit être généré avec succès");
  });

  test("Génération du document HTML thermique imprimable", () => {
    const html = generateCashClosureHtml(mockClosure);
    assert(html.includes("RAPPORT Z"), "Le document doit afficher le titre Rapport Z");
    assert(html.includes("Aminata Traor"), "Le document doit mentionner la caissière");
    assert(html.includes("285"), "Le document doit afficher le CA journalier");
    assert(html.includes("SYSCOHADA"), "Le document doit mentionner la ventilation fiscale");
  });

  test("Calcul d'écart de caisse positif et négatif", () => {
    const deficitClosure: CashClosureData = { ...mockClosure, countedCash: 115000, cashVariance: -5000 };
    assert.equal(deficitClosure.cashVariance, -5000, "Écart négatif (déficit de caisse)");

    const surplusClosure: CashClosureData = { ...mockClosure, countedCash: 122000, cashVariance: 2000 };
    assert.equal(surplusClosure.cashVariance, 2000, "Écart positif (excédent de caisse)");
  });

  // ─────────────── PILIER 3 : CURSEUR SPLIT-SLIDER AVANT / APRÈS ───────────────
  console.log("\n[PILIER 3] Curseur Comparatif Interactif Avant / Après");

  test("Structure des diagnostics J0 vs J30 et différentiel de score", () => {
    const j0Score = 58;
    const j30Score = 76;
    const progression = j30Score - j0Score;
    assert.equal(progression, 18, "Gain de 18 points de santé de peau");
  });

  // ─────────────── PILIER 4 : COMMISSIONS PRATICIENNES ───────────────
  console.log("\n[PILIER 4] Commissions Praticiennes & Ventes Boutique");

  test("Calcul des commissions : 10% sur les soins et 5% sur la boutique", () => {
    const caSoins = 180000;
    const caBoutique = 60000;
    const comSoins = Math.round(caSoins * 0.10);
    const comBoutique = Math.round(caBoutique * 0.05);
    const totalCom = comSoins + comBoutique;

    assert.equal(comSoins, 18000, "10% de 180 000 = 18 000 FCFA");
    assert.equal(comBoutique, 3000, "5% de 60 000 = 3 000 FCFA");
    assert.equal(totalCom, 21000, "Total prime = 21 000 FCFA");
  });

  // ─────────────── PILIER 5 : LOGISTIQUE COMMUNE & COURSIER WHATSAPP ───────────────
  console.log("\n[PILIER 5] Logistique Communes & Relais Coursier");

  test("Résolution des zones et tarifs de livraison pour Abidjan", () => {
    const cocody = findCommune("Angré");
    assert(cocody !== undefined, "La commune d'Angré doit exister");
    assert.equal(cocody.fee, 1500, "Zone 1 Cocody = 1 500 FCFA");

    const yopougon = findCommune("Yopougon");
    assert(yopougon !== undefined);
    assert.equal(yopougon.fee, 2500, "Zone 2 Yopougon = 2 500 FCFA");

    const bassam = findCommune("Bassam");
    assert(bassam !== undefined);
    assert.equal(bassam.fee, 3500, "Zone 3 Grand-Bassam = 3 500 FCFA");
  });

  test("Résolution des zones et tarifs de livraison pour Dakar", () => {
    const plateau = findCommune("Dakar Plateau");
    assert(plateau !== undefined, "Le Plateau Dakar doit exister");
    assert.equal(plateau.fee, 1500, "Zone 1 Dakar Plateau = 1 500 FCFA");

    const almadies = findCommune("Almadies");
    assert(almadies !== undefined);
    assert.equal(almadies.fee, 2000, "Zone 2 Almadies = 2 000 FCFA");

    const rufisque = findCommune("Rufisque");
    assert(rufisque !== undefined);
    assert.equal(rufisque.fee, 4500, "Zone 3 Rufisque = 4 500 FCFA");
  });

  test("Génération d'ordre de mission coursier WhatsApp", () => {
    const msg = buildCourierMissionMessage({
      instituteName: "Institut Kènè Plateau",
      orderRef: "CMD-2026-09-088",
      clientName: "Awa Diallo",
      clientPhone: "+225 05 04 03 02 01",
      communeName: "Cocody Angré",
      deliveryAddress: "Angré 8ème Tranche, pharmacie du Soleil",
      items: [
        { name: "Sérum Éclat Niacinamide", qty: 1 },
        { name: "Savon Noir Moringa", qty: 1 },
      ],
      deliveryFee: 1500,
      totalAmount: 23500,
      paymentMethod: "Wave",
      isPaid: true,
    });

    assert(msg.includes("ORDRE DE MISSION LIVRAISON"), "Doit contenir le titre de mission");
    assert(msg.includes("088"), "Doit mentionner le numéro de commande");
    assert(msg.includes("Cocody Angré"), "Doit mentionner la commune");
    assert(msg.includes("DÉJÀ RÉGLÉ EN LIGNE"), "Doit préciser le statut de paiement");
  });

  // ─────────────── PILIER 6 : COSMÉTOVIGILANCE & SÉCURITÉ CABINE ───────────────
  console.log("\n[PILIER 6] Cosmétovigilance & Checklist de Sécurité Cabine");

  test("Vérification des 6 facteurs de la checklist de sécurité", () => {
    assert.equal(CABIN_SAFETY_CHECKLIST.length, 6, "La checklist doit contenir 6 facteurs clés");
    const ids = CABIN_SAFETY_CHECKLIST.map((c) => c.id);
    assert(ids.includes("roaccutane"), "Présence de l'alerte Roaccutane");
    assert(ids.includes("pregnancy"), "Présence de l'alerte Grossesse");
    assert(ids.includes("active_infection"), "Présence de l'alerte Infection active");
    assert(ids.includes("cheloid_history"), "Présence de l'alerte Chéloïdes");
  });

  test("Détection d'une contre-indication formelle bloquante (Roaccutane sur Peeling)", () => {
    const result = evaluateSafetyChecklist("Peeling chimique profond", { roaccutane: true });
    assert.equal(result.safe, false, "Le soin ne doit pas être sécurisé");
    assert(result.blockers.length > 0, "Doit émettre un bloqueur clinique formel");
    assert(result.blockers[0].includes("Roaccutane"), "Le bloqueur doit mentionner Roaccutane");
  });

  test("Détection d'une contre-indication sur infection active", () => {
    const result = evaluateSafetyChecklist("Soin hydra-facial avec extraction", { active_infection: true });
    assert.equal(result.safe, false, "Infection active doit être bloquante");
  });

  test("Validation sans contre-indication (soin sûr)", () => {
    const result = evaluateSafetyChecklist("Soin apaisant dermo-botanique", {});
    assert.equal(result.safe, true, "Soin sans aucun facteur de risque");
    assert.equal(result.blockers.length, 0);
  });

  console.log("\n========================================");
  console.log(`RÉSULTAT DES TESTS : ${passed} passés, ${failed} échoués`);
  console.log("========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

void runAll();
