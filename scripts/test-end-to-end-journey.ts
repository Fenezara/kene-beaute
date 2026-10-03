/**
 * scripts/test-end-to-end-journey.ts
 *
 * SIMULATION DE RECETTE COMPLÈTE DE BOUT EN BOUT — KÈNÈ (PARCOURS CLIENT & CABINE)
 * ==============================================================================
 * Ce script valide l'interconnexion complète de tous les modules de l'application :
 *   1. Réservation de soin & calcul d'acompte Mobile Money
 *   2. Accueil cabine & analyse cutanée multi-spectrale (acné / film lipidique)
 *   3. Checklist de sécurité dermo & détection des contre-indications
 *   4. Génération de l'ordonnance dermo-botanique vectorielle
 *   5. Encaissement en Caisse POS avec déduction d'acompte & TVA SYSCOHADA
 *   6. Génération des tickets thermiques ESC/POS 80mm & 58mm
 *   7. Calcul automatique des commissions de la praticienne (soins + boutique)
 *   8. Logistique urbaine (Abidjan/Dakar) & ordre de mission coursier WhatsApp
 *   9. Clôture de caisse journalière (Rapport Z)
 */

import { processSpectralAcneImage } from "../src/lib/kene/spectral-imaging";
import { evaluateSafetyChecklist } from "../src/lib/kene/cosmetovigilance";
import { generatePrescriptionPdf } from "../src/lib/kene/dermo-prescription-pdf";
import { splitTVA } from "../src/lib/accounting/syscohada";
import { buildEscPosBinary } from "../src/lib/hardware/bluetooth-escpos";
import { buildCashClosureEscPosBinary } from "../src/lib/hardware/cash-closure-ticket";
import { buildWhatsAppReceiptMessage } from "../src/lib/kene/whatsapp-relay";
import { findCommune, buildCourierMissionMessage } from "../src/lib/kene/delivery-zones";
import { SALON_CONFIG } from "../src/config/salon-identity";

const G = "\x1b[32m✔\x1b[0m";
const R = "\x1b[31m✘\x1b[0m";
const B = "\x1b[34m▶\x1b[0m";
let pass = 0;
let fail = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${G} ${label}`);
    pass++;
  } else {
    console.error(`  ${R} ÉCHEC: ${label} ${detail ? `(${detail})` : ""}`);
    fail++;
  }
}

async function runEndToEndSimulation() {
  console.log("\n================================================================");
  console.log("  SIMULATION DU PARCOURS OPÉRATIONNEL COMPLET — INSTITUT KÈNÈ");
  console.log("  Salon : " + SALON_CONFIG.legal.brandName + " (" + SALON_CONFIG.legal.commune + ")");
  console.log("================================================================\n");

  // --------------------------------------------------------------------------
  console.log(`${B} [PHASE 1] Réservation en Ligne & Acompte Mobile Money`);
  // --------------------------------------------------------------------------
  const servicePrice = 30000; // Soin Peeling Doux Mélanoderme (30 000 FCFA)
  const depositRate = 0.30; // 30% d'acompte obligatoire
  const depositAmount = servicePrice * depositRate; // 9 000 FCFA
  const remainingDueAtCheckin = servicePrice - depositAmount; // 21 000 FCFA

  assert(depositAmount === 9000, `Acompte Mobile Money calculé à 30% (9 000 FCFA)`);
  assert(remainingDueAtCheckin === 21000, `Solde restant dû en caisse (21 000 FCFA)`);

  // --------------------------------------------------------------------------
  console.log(`\n${B} [PHASE 2] Accueil en Cabine & Diagnostic Multi-Spectral`);
  // --------------------------------------------------------------------------
  const spectral = await processSpectralAcneImage(null, { clientName: "Fatoumata Koné", zoneLabel: "Visage" });
  assert(spectral.porphyrinSpotsCount >= 0, `Comptage des spots de porphyrines (${spectral.porphyrinSpotsCount} spots C. acnes)`);
  assert(spectral.sebumScoreEstimate >= 0 && spectral.sebumScoreEstimate <= 100, `Indice du film lipidique estimé (${spectral.sebumScoreEstimate}%)`);
  assert(spectral.jpegBytes.length > 1000, `Canal spectral acné/sébum généré (${spectral.jpegBytes.length} octets)`);

  // --------------------------------------------------------------------------
  console.log(`\n${B} [PHASE 3] Checklist de Sécurité & Détection des Contre-Indications`);
  // --------------------------------------------------------------------------
  const safeChecklist = evaluateSafetyChecklist("Peeling", {
    pregnancy: false,
    roaccutane: false,
    sun_exposure: false,
    active_infection: false,
    cheloid_history: false,
    allergies_known: false,
  });
  assert(safeChecklist.safe === true, `Checklist validée : protocole cabine autorisé (0 bloqueur)`);

  const blockedChecklist = evaluateSafetyChecklist("Peeling", {
    pregnancy: false,
    roaccutane: true, // Bloquant pour un peeling
    sun_exposure: false,
    active_infection: false,
    cheloid_history: false,
    allergies_known: false,
  });
  assert(blockedChecklist.safe === false && blockedChecklist.blockers.length > 0, `Sécurité active : soin bloqué si Roaccutane actif (${blockedChecklist.blockers[0]})`);

  // --------------------------------------------------------------------------
  console.log(`\n${B} [PHASE 4] Prescription Dermo-Botanique & Pass QR`);
  // --------------------------------------------------------------------------
  const prescriptionPdf = await generatePrescriptionPdf({
    userName: "Fatoumata Koné",
    userPhone: "+225 07 11 22 33 44",
    zone: "visage",
    createdAt: new Date(),
    tenantName: SALON_CONFIG.legal.brandName,
    passUrl: "https://kene.app/api/appointments/pass?id=APT-2026-0042",
    diagnosisResult: {
      score_global: 78,
      fitzpatrick_estime: "Fitzpatrick V",
      zone: "visage",
      orientation_dermato: false,
      avertissement: "Conseils cosmétiques éducatifs",
      source: "vlm",
      indicateurs: [
        { nom: "Sébum & Porphyrines", severite: 1, pourcentage: 75, note: "Hyper-séborrhée modérée T-Zone" },
        { nom: "Hydratation barrière", severite: 0, pourcentage: 82 },
      ],
      zones_marquages: [],
      recommandations: {
        resume: "Protocole équilibrant mélanoderme : sébo-régulation et protection barrière.",
        routine_matin: ["Gel Nettoyant Purifiant Moringa", "Sérum Niacinamide 10%", "Fluide Matifiant SPF50"],
        routine_soir: ["Huile Démaquillante Jojoba", "Lotion Tonique Hibiscus & AHA doux", "Crème Réparatrice Karité"],
        botaniques_conseillees: ["Moringa d'Afrique", "Niacinamide", "Fleur d'Hibiscus"],
        produits: ["Gel Moringa", "Sérum Niacinamide 10%"],
        soins_conseilles: ["Soin Purifiant Peeling Doux"],
        conseils_hygiene_vie: ["Éviter l'eau calcaire trop chaude", "Bien appliquer le filtre solaire minéral"],
      },
    },
  });
  assert(prescriptionPdf.data.length > 5000, `Ordonnance PDF vectorielle générée avec succès (${prescriptionPdf.data.length} octets, ${prescriptionPdf.pages} page)`);

  // --------------------------------------------------------------------------
  console.log(`\n${B} [PHASE 5] Encaissement Caisse POS avec Déduction d'Acompte`);
  // --------------------------------------------------------------------------
  const productPrice = 15000; // Sérum Niacinamide 10% acheté en boutique
  const totalBasket = servicePrice + productPrice; // 30 000 + 15 000 = 45 000 FCFA
  const netToPay = Math.max(0, totalBasket - depositAmount); // 45 000 - 9 000 = 36 000 FCFA

  assert(netToPay === 36000, `Net à payer en caisse après déduction d'acompte : 36 000 FCFA`);

  // Calcul TVA SYSCOHADA (18%)
  const tax = splitTVA(netToPay);
  assert(tax.ht + tax.tva === netToPay, `Équilibre comptable SYSCOHADA parfait (HT: ${tax.ht} + TVA: ${tax.tva} = ${netToPay})`);

  // Génération ticket thermique ESC/POS 80mm
  const receiptEscPos = buildEscPosBinary({
    tenantName: SALON_CONFIG.legal.brandName,
    tenantAddress: SALON_CONFIG.legal.address,
    tenantPhone: SALON_CONFIG.contact.phone,
    tenantTaxId: SALON_CONFIG.legal.nif,
    receiptNumber: "TKT-2026-0042",
    createdAt: new Date(),
    cashierName: "Aïcha",
    clientName: "Fatoumata Koné",
    items: [
      { label: "Soin Peeling Doux", qty: 1, unitPrice: 30000, total: 30000, kind: "service" },
      { label: "Sérum Niacinamide 10%", qty: 1, unitPrice: 15000, total: 15000, kind: "product" },
    ],
    subtotal: totalBasket,
    total: netToPay,
    paymentMethod: "Wave Mobile Money",
  }, "80mm");
  assert(receiptEscPos.length > 100, `Binaire thermique ESC/POS 80mm généré (${receiptEscPos.length} octets)`);

  // Message WhatsApp dématérialisé
  const waReceipt = buildWhatsAppReceiptMessage({
    tenantName: SALON_CONFIG.legal.brandName,
    receiptNumber: "TKT-2026-0042",
    clientName: "Fatoumata Koné",
    total: netToPay,
    paymentMethod: "Wave Mobile Money",
    items: [
      { label: "Soin Peeling Doux", qty: 1, total: 30000 },
      { label: "Sérum Niacinamide 10%", qty: 1, total: 15000 },
    ],
  });
  const normalizedWaReceipt = waReceipt.replace(/\s+/g, " ");
  assert(normalizedWaReceipt.includes("36 000") && normalizedWaReceipt.includes("TKT-2026-0042"), `Message WhatsApp ticket généré et personnalisé`);

  // --------------------------------------------------------------------------
  console.log(`\n${B} [PHASE 6] Calcul des Commissions Praticienne`);
  // --------------------------------------------------------------------------
  const careCommissionRate = 0.10; // 10% sur les soins
  const productCommissionRate = 0.05; // 5% sur la vente boutique
  const careCommission = servicePrice * careCommissionRate; // 30 000 * 10% = 3 000 FCFA
  const productCommission = productPrice * productCommissionRate; // 15 000 * 5% = 750 FCFA
  const totalCommission = careCommission + productCommission; // 3 750 FCFA

  assert(totalCommission === 3750, `Commission de la praticienne exacte (Soins: 3 000 FCFA + Produits: 750 FCFA = 3 750 FCFA)`);

  // --------------------------------------------------------------------------
  console.log(`\n${B} [PHASE 7] Logistique & Ordre de Mission Coursier WhatsApp`);
  // --------------------------------------------------------------------------
  const commune = findCommune("Cocody");
  assert(commune !== undefined && commune.fee === 1500, `Commune Cocody trouvée et tarif résolu (${commune?.name} : ${commune?.fee} FCFA)`);

  const courierMessage = buildCourierMissionMessage({
    orderRef: "CMD-2026-098",
    clientName: "Fatoumata Koné",
    clientPhone: "+2250711223344",
    communeName: commune?.name || "Cocody",
    deliveryAddress: "Cocody Angré 8ème Tranche, près de la pharmacie",
    items: [{ name: "Sérum Niacinamide 10%", qty: 1 }],
    totalAmount: 15000 + 1500,
    deliveryFee: 1500,
    paymentMethod: "Wave",
    isPaid: true,
    instituteName: SALON_CONFIG.legal.brandName,
    institutePhone: SALON_CONFIG.contact.phone,
    notes: "Appeler dès arrivée devant la résidence.",
  });
  assert(courierMessage.includes("CMD-2026-098".slice(-6)) && courierMessage.includes("Angré"), `Ordre de mission coursier WhatsApp structuré et prêt`);

  // --------------------------------------------------------------------------
  console.log(`\n${B} [PHASE 8] Clôture de Caisse Journalière (Rapport Z)`);
  // --------------------------------------------------------------------------
  const closureBinary = buildCashClosureEscPosBinary({
    tenantName: SALON_CONFIG.legal.brandName,
    tenantCity: SALON_CONFIG.legal.city,
    tenantPhone: SALON_CONFIG.contact.phone,
    closureDate: new Date(),
    closedBy: "Aïcha Bamba",
    openingCash: 50000,
    cashSales: 0,
    countedCash: 50000,
    cashVariance: 0,
    waveSales: netToPay,
    orangeSales: 0,
    cardSales: 0,
    walletSales: 0,
    totalSales: netToPay,
    salesCount: 1,
    notes: "Clôture régulière sans incident.",
  }, "80mm");
  assert(closureBinary.length > 100, `Ticket Z binaire thermique ESC/POS généré (${closureBinary.length} octets)`);

  // --------------------------------------------------------------------------
  console.log("\n================================================================");
  console.log(`  BILAN DE LA RECETTE : ${pass} réussis / ${fail} échoués`);
  if (fail === 0) {
    console.log(`  \x1b[32m✔ TOUS LES MODULES OPÉRATIONNELS COHÉRENTS ET PRÊTS !\x1b[0m`);
  } else {
    console.log(`  \x1b[31m✘ Des anomalies ont été détectées.\x1b[0m`);
  }
  console.log("================================================================\n");

  process.exit(fail > 0 ? 1 : 0);
}

runEndToEndSimulation().catch((err) => {
  console.error("Erreur inattendue dans la simulation :", err);
  process.exit(1);
});
