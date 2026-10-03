/**
 * Kènè — Validation Automatisée des 3 Nouveaux Piliers :
 * 1. Écosystème Parrainage & "Fils d'Or" (Kente Gamifié)
 * 2. Géolocalisation & Découverte des Salons Partenaires (Haversine)
 * 3. Campagnes de Relances & Rétention CRM Automatisées (SMS & WhatsApp)
 */

import { computeBenefits, seedOf, GOLD_TIERS } from "../src/lib/kene/gold-threads";
import { getTenantCoords, haversineKm } from "../src/app/api/institutes/route";
import { buildRelanceMessage, FollowUpKind } from "../src/lib/kene/followups";
import { sendNotificationSms } from "../src/lib/sms";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ÉCHEC: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n==================================================================");
  console.log("  TEST DE VALIDATION DES 3 NOUVEAUX PILIERS D'EXCELLENCE KÈNÈ");
  console.log("==================================================================\n");

  // ─────────────────────────────────────────────────────────────
  // 1. ÉCOSYSTÈME PARRAINAGE & FILS D'OR (KENTE GAMIFIÉ)
  // ─────────────────────────────────────────────────────────────
  console.log("[AXE 1] Fils d'Or & Paliers de Privilèges Kente");

  const seed1 = seedOf("user_aminata_123");
  const seed2 = seedOf("user_aminata_123");
  const seed3 = seedOf("user_fatou_456");
  assert(seed1 === seed2, "La graine FNV-1a est parfaitement déterministe pour une même utilisatrice");
  assert(seed1 !== seed3, "Des utilisatrices différentes reçoivent des pagnes kente distincts");

  const b0 = computeBenefits(0);
  assert(b0.length === 4 && b0.every((b) => !b.unlocked), "0 fil : aucun privilège débloqué");

  const b1 = computeBenefits(1);
  assert(b1[0].unlocked && !b1[1].unlocked, "1 fil : palier Initié débloqué (+500 FCFA)");

  const b5 = computeBenefits(7);
  assert(b5[0].unlocked && b5[1].unlocked && !b5[2].unlocked, "7 fils : Tisseuse d'Or débloqué (-10% Soin cabine)");

  const b20 = computeBenefits(25);
  assert(b20.every((b) => b.unlocked), "25 fils : tous les privilèges y compris Maîtresse du Métier débloqués");

  // ─────────────────────────────────────────────────────────────
  // 2. GÉOLOCALISATION & SALONS PARTENAIRES (HAVERSINE)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[AXE 2] Géolocalisation & Proximité Salons");

  const coordsCocody = getTenantCoords("Abidjan — Cocody", "Rue des Jardins");
  assert(coordsCocody.lat > 5.3 && coordsCocody.lat < 5.4, "Coordonnées Cocody Abidjan résolues");

  const coordsAlmadies = getTenantCoords("Dakar — Almadies", "Route de Ngor");
  assert(coordsAlmadies.lat > 14.7 && coordsAlmadies.lat < 14.8, "Coordonnées Almadies Dakar résolues");

  const distCocodyMarcory = haversineKm(5.3599, -3.987, 5.3044, -3.9825);
  assert(distCocodyMarcory >= 5.0 && distCocodyMarcory <= 7.5, `Distance Cocody ↔ Marcory réaliste (~${distCocodyMarcory} km)`);

  const distAbidjanDakar = haversineKm(5.3599, -3.987, 14.7436, -17.5147);
  assert(distAbidjanDakar > 1500 && distAbidjanDakar < 2200, `Distance Abidjan ↔ Dakar réaliste (~${distAbidjanDakar} km)`);

  // Tri par proximité simulé
  const userPos = { lat: 5.36, lng: -3.98 }; // Proche Cocody
  const salons = [
    { name: "Institut Baobab Dakar", coords: coordsAlmadies },
    { name: "Éclat d'Abidjan Cocody", coords: coordsCocody },
  ];
  const sorted = salons
    .map((s) => ({ ...s, dist: haversineKm(userPos.lat, userPos.lng, s.coords.lat, s.coords.lng) }))
    .sort((a, b) => a.dist - b.dist);
  assert(sorted[0].name === "Éclat d'Abidjan Cocody", "Le salon le plus proche est trié en première position");

  // ─────────────────────────────────────────────────────────────
  // 3. CAMPAGNES DE RELANCES & RÉTENTION CRM AUTOMATISÉES
  // ─────────────────────────────────────────────────────────────
  console.log("\n[AXE 3] Campagnes de Relances CRM Automatisées (SMS & WhatsApp)");

  const kinds: FollowUpKind[] = ["post_protocol", "post_soin", "post_purchase", "inactive"];
  for (const kind of kinds) {
    const msg = buildRelanceMessage(kind, {
      clientName: "Aminata Traoré",
      detail: "Sérum Kinkeliba & Karité",
      dueAt: "2026-10-01",
      tenantName: "Institut Kènè Cocody",
    });
    assert(msg.includes("Aminata") && msg.length > 25, `Message de relance [${kind}] généré avec succès`);
  }

  // Test du routeur SMS pour relance
  const smsResult = await sendNotificationSms({
    phone: "+2250709080706",
    message: "Bonjour Aminata ! Votre relance de soin est prête chez Institut Kènè Cocody.",
  });
  assert(smsResult.success, `Envoi notification SMS réussi (provider: ${smsResult.provider})`);

  // ─────────────────────────────────────────────────────────────
  // RÉCAPITULATIF
  // ─────────────────────────────────────────────────────────────
  console.log("\n==================================================================");
  console.log(`RÉSULTAT DES TESTS : ${passed} passés, ${failed} échoués`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
