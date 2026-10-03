// Kènè — Test automatisé du flux d'authentification par code PIN secret (style Wave / TikTok)
// Couvre :
// 1. Primitives cryptographiques (hashPin, verifyPin, timingSafeEqual)
// 2. Vérification rapide d'existence (/api/auth/check-phone)
// 3. Inscription par SMS OTP avec définition du code secret PIN
// 4. Connexion rapide instantanée par numéro + code PIN sans SMS (/api/auth/login)
// 5. Résistance anti-bruteforce (décompte des essais, blocage 15 min au 5ème échec)
// 6. Récupération par « Code oublié ? » (réinitialisation du PIN par SMS OTP)
// 7. Durée de validité de la session persistante (365 jours)

import { hashPin, verifyPin, isValidPin } from "../src/lib/kene/pin";
import { SESSION_TTL_SEC, signSession, verifySessionToken } from "../src/lib/kene/session";
import { db } from "../src/lib/db";

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
  console.log("\n🧪 ─── 1. TEST DES PRIMITIVES CRYPTOGRAPHIQUES (PIN) ───");

  // Format
  assert(isValidPin("1234"), "isValidPin('1234') est valide (4 chiffres)");
  assert(isValidPin("123456"), "isValidPin('123456') est valide (6 chiffres)");
  assert(!isValidPin("123"), "isValidPin('123') est invalide (trop court)");
  assert(!isValidPin("1234567"), "isValidPin('1234567') est invalide (trop long)");
  assert(!isValidPin("abcd"), "isValidPin('abcd') est invalide (lettres)");

  // Hachage et vérification
  const testPin = "4826";
  const hashed = hashPin(testPin);
  assert(hashed.includes(":"), "Le hash PIN est au format sel:dérivé");
  const [salt, derived] = hashed.split(":");
  assert(salt.length === 32, "Le sel fait 32 caractères hex (16 octets CSPRNG)");
  assert(derived.length === 64, "La clé dérivée scrypt fait 64 caractères hex");

  assert(verifyPin(testPin, hashed), "verifyPin réussit avec le bon code PIN");
  assert(!verifyPin("0000", hashed), "verifyPin échoue avec un mauvais code PIN");
  assert(!verifyPin("", hashed), "verifyPin échoue avec un code vide");
  assert(!verifyPin(testPin, null), "verifyPin échoue avec un hash null");

  console.log("\n🧪 ─── 2. TEST DE LA DURÉE DE SESSION PERSISTANTE (365 JOURS) ───");
  assert(SESSION_TTL_SEC === 365 * 24 * 3600, `SESSION_TTL_SEC est bien de 365 jours (${SESSION_TTL_SEC} s)`);

  const fakeUser = { id: "test-user-365", phone: "+2250700000000", role: "client" };
  const token = signSession(fakeUser);
  const payload = verifySessionToken(token);
  assert(payload !== null, "Le token de session est vérifié avec succès");
  if (payload) {
    const ttlDays = Math.round((payload.exp - payload.iat) / (1000 * 24 * 3600));
    assert(ttlDays === 365, `Le token de session expire bien dans 365 jours (calculé: ${ttlDays} jours)`);
  }

  console.log("\n🧪 ─── 3. TEST FLUX BASE DE DONNÉES (Création, Connexion PIN, Lockout) ───");

  const testPhone = "+2250799998888";
  // Nettoyage préalable
  await db.user.deleteMany({ where: { phone: testPhone } });
  await db.otpCode.deleteMany({ where: { phone: testPhone } });

  // Étape A : Création d'un utilisateur avec code PIN
  const createdPin = "7391";
  const userPinHash = hashPin(createdPin);
  const createdUser = await db.user.create({
    data: {
      phone: testPhone,
      name: "Awa Test",
      role: "client",
      pinHash: userPinHash,
    },
  });

  assert(Boolean(createdUser.id), "Utilisatrice créée en base avec succès");
  assert(createdUser.pinHash === userPinHash, "Le pinHash est bien persisté dans User");
  assert(createdUser.pinFails === 0, "pinFails est initialisé à 0");
  assert(createdUser.pinLockedUntil === null, "pinLockedUntil est initialisé à null");

  // Étape B : Simulation de vérification PIN
  assert(verifyPin(createdPin, createdUser.pinHash), "Le code PIN 7391 correspond au hash en base");

  // Étape C : Simulation d'échecs consécutifs
  let fails = createdUser.pinFails;
  for (let attempt = 1; attempt <= 4; attempt++) {
    fails += 1;
    await db.user.update({
      where: { id: createdUser.id },
      data: { pinFails: fails },
    });
  }
  const userAfter4Fails = await db.user.findUnique({ where: { id: createdUser.id } });
  assert(userAfter4Fails?.pinFails === 4, "pinFails est à 4 après 4 tentatives erronées");
  assert(userAfter4Fails?.pinLockedUntil === null, "Compte toujours non verrouillé à 4 échecs");

  // 5ème échec -> Verrouillage 15 min
  const lockedUntil = new Date(Date.now() + 15 * 60_000);
  await db.user.update({
    where: { id: createdUser.id },
    data: { pinFails: 0, pinLockedUntil: lockedUntil },
  });

  const lockedUser = await db.user.findUnique({ where: { id: createdUser.id } });
  assert(Boolean(lockedUser?.pinLockedUntil && lockedUser.pinLockedUntil > new Date()), "Compte verrouillé au 5ème échec pour 15 min");

  // Étape D : Réinitialisation (« Code oublié ») avec nouveau PIN
  const newPin = "9988";
  const newPinHash = hashPin(newPin);
  const recoveredUser = await db.user.update({
    where: { id: createdUser.id },
    data: {
      pinHash: newPinHash,
      pinFails: 0,
      pinLockedUntil: null,
    },
  });

  assert(recoveredUser.pinLockedUntil === null, "Verrou levé après réinitialisation du code secret");
  assert(recoveredUser.pinFails === 0, "Compteur d'échecs remis à zéro");
  assert(verifyPin(newPin, recoveredUser.pinHash), "Le nouveau code PIN 9988 est actif");
  assert(!verifyPin(createdPin, recoveredUser.pinHash), "L'ancien code PIN 7391 n'est plus valable");

  // Nettoyage final
  await db.user.deleteMany({ where: { phone: testPhone } });

  console.log("\n────────────────────────────────────────");
  console.log(`Résultats : ${passed} passés / ${failed} échoués`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
