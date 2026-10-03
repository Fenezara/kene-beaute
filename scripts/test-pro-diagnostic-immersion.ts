// Kènè — Test Suite : Immersion 3D, Multi-Spectral, Projection & Diagnostic Pro
import { BODY_ZONES, SPECTRAL_VIEWS, type BodyZone, type Indicator } from "../src/lib/kene/types";
import { parseProDiagnosis, defaultAnswers, questionnaireProgress } from "../src/lib/kene/questionnaire";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ÉCHEC : ${msg}`);
    failed++;
  }
}

console.log("=== 1. Test des Zones Anatomiques & Pondérations Cliniques ===");
assert(BODY_ZONES.length === 6, "6 zones anatomiques déclarées");
const zonesExpected: BodyZone[] = ["visage", "dos", "cuir_chevelu", "mains", "barbe", "naevi"];
zonesExpected.forEach((z) => {
  const found = BODY_ZONES.find((bz) => bz.id === z);
  assert(!!found, `Zone "${z}" correctement répertoriée avec label "${found?.label}"`);
  assert((found?.weight ?? 0) > 0, `Poids clinique valide pour "${z}" (${found?.weight})`);
});

console.log("\n=== 2. Test de la Répartition des Couches pour la Descente 3D (Scroll) ===");
const sampleIndicators: Indicator[] = [
  { nom: "Hydratation", pourcentage: 75, severite: 1 },
  { nom: "Barrière cutanée", pourcentage: 80, severite: 1 },
  { nom: "Éclat / Teint", pourcentage: 65, severite: 2 },
  { nom: "Élasticité / Fermeté", pourcentage: 70, severite: 1 },
  { nom: "Taches PIH", pourcentage: 55, severite: 2 },
  { nom: "Pores dilatés", pourcentage: 60, severite: 2 },
  { nom: "Sébum profond", pourcentage: 50, severite: 2 },
  { nom: "Densité lipidique", pourcentage: 85, severite: 1 },
  { nom: "Volume", pourcentage: 90, severite: 0 },
];

function layerize(inds: Indicator[]) {
  const sorted = [...inds].sort((a, b) => b.pourcentage - a.pourcentage);
  return {
    epiderme: sorted.slice(0, 3),
    derme: sorted.slice(3, 6),
    hypoderme: sorted.slice(6, 9),
  };
}

const layers = layerize(sampleIndicators);
assert(layers.epiderme.length === 3, "Couche Épiderme : 3 orbes lumineuses allouées");
assert(layers.derme.length === 3, "Couche Derme (Collagène) : 3 orbes lumineuses allouées");
assert(layers.hypoderme.length === 3, "Couche Hypoderme (Adipeux) : 3 orbes lumineuses allouées");
assert(layers.epiderme[0].pourcentage >= layers.derme[0].pourcentage, "Ordonnancement décroissant des orbes lumineuses");

console.log("\n=== 3. Test des Modes Multi-Spectraux VISIA-like ===");
assert(SPECTRAL_VIEWS.length === 4, "4 modes spectraux disponibles");
const spectralIds = SPECTRAL_VIEWS.map((s) => s.id);
assert(spectralIds.includes("standard"), "Mode Standard (Lumière neutre) présent");
assert(spectralIds.includes("pigment"), "Mode Pigmentation (Mélanine & PIH) présent");
assert(spectralIds.includes("inflammation"), "Mode Inflammation (Vascularisation) présent");
assert(spectralIds.includes("acne"), "Mode Acné (Porphyrines & Sébum) présent");

console.log("\n=== 4. Test de la Projection Cutanée Évolutive (J0, J14, J30, J60) ===");
function calculateProjection(scoreJ0: number, assiduite = 100) {
  const coef = assiduite / 100;
  const scoreJ14 = Math.min(96, Math.round(scoreJ0 + ((10 * (100 - scoreJ0)) / 45) * coef));
  const scoreJ30 = Math.min(97, Math.round(scoreJ0 + ((20 * (100 - scoreJ0)) / 45) * coef));
  const scoreJ60 = Math.min(98, Math.round(scoreJ0 + ((28 * (100 - scoreJ0)) / 45) * coef));
  return { scoreJ0, scoreJ14, scoreJ30, scoreJ60 };
}

const proj = calculateProjection(60, 100);
assert(proj.scoreJ0 === 60, "J0 correspond au score initial (60)");
assert(proj.scoreJ14 > proj.scoreJ0, `J14 montre une progression (+${proj.scoreJ14 - proj.scoreJ0} pts)`);
assert(proj.scoreJ30 > proj.scoreJ14, `J30 cycle épidermique amplifie le résultat (+${proj.scoreJ30 - proj.scoreJ14} pts)`);
assert(proj.scoreJ60 > proj.scoreJ30, `J60 consolidation dermo-botanique maximale (${proj.scoreJ60}/100)`);
assert(proj.scoreJ60 <= 100, "Le score projeté reste rigoureusement plafonné ≤ 100");

console.log("\n=== 5. Test du Formattage WhatsApp de l'Ordonnance Cabine ===");
function buildWhatsAppDiagUrl(clientName: string, phone: string, score: number, zone: string) {
  const digits = phone.replace(/\D/g, "");
  const target =
    digits.startsWith("225") || digits.startsWith("221")
      ? digits
      : digits.length === 10
      ? `225${digits}`
      : digits.length === 9
      ? `221${digits}`
      : digits;
  const text = `Bonjour ${clientName.split(" ")[0]} 🌸\n\nVoici votre bilan de peau personnalisé :\n\n📊 Score santé : ${score}/100\n📍 Zone : ${zone}\n\nRetrouvez vos progrès sur Kènè !`;
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
}

const waCI = buildWhatsAppDiagUrl("Aminata Touré", "07 05 04 03 02", 72, "Visage");
assert(waCI.startsWith("https://wa.me/2250705040302"), "Formatage numéro Côte d'Ivoire (+225) correct");
assert(waCI.includes("Aminata"), "Prénom de la cliente correctement inséré");
assert(waCI.includes("72%2F100") || waCI.includes("72/100"), "Score 72/100 inclus dans le message");

const waSN = buildWhatsAppDiagUrl("Fatou Sow", "77 123 45 67", 81, "Dos");
assert(waSN.startsWith("https://wa.me/221771234567"), "Formatage numéro Sénégal (+221) correct");

console.log("\n=== 6. Test Questionnaire Dermatologique & Vigiliance ===");
const answers = defaultAnswers();
const progress = questionnaireProgress(answers);
assert(typeof progress === "number", "Progression du questionnaire calculable");
const fakeResultJson = JSON.stringify({
  score_global: 54,
  zone: "visage",
  indicateurs: sampleIndicators,
  recommandations: {
    resume: "Peau à tendance grasse avec taches PIH",
    routine_matin: ["Nettoyant doux", "Sérum Moringa", "Protection solaire"],
    routine_soir: ["Démaquillage", "Huile de Baobab"],
    botaniques_conseillees: ["Moringa", "Baobab"],
    produits: ["Sérum Éclat Moringa"],
    soins_conseilles: ["Soin Détox Cabine"],
    conseils_hygiene_vie: ["Boire 1.5L d'eau"],
  },
  questionnaire: {
    score: 52,
    flags: [{ level: "danger", label: "Antécédent dépigmentation" }],
    answered: 10,
    total: 10,
    photoUsed: true,
  },
});
const parsed = parseProDiagnosis(fakeResultJson);
assert(!!parsed, "Parsing de résultat pro valide");
assert(parsed?.questionnaire.flags.some((f) => f.level === "danger") === true, "Détection correcte du drapeau danger (vigilance)");

console.log(`\n========================================`);
console.log(`RÉSULTAT DES TESTS : ${passed} passés, ${failed} échoués`);
console.log(`========================================`);

if (failed > 0) process.exit(1);
