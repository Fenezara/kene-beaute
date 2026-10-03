// scripts/test-dr-kene-chat.ts
// Test suite pour le chat dermatologique Dr Kènè (Zero-Failure Engine)
// Vérifie les différents scénarios cliniques, la conformité du persona et les transports HTTP

import { generateDrKeneKnowledgeReply, tidyReply } from "../src/lib/ai/dr-kene-chat";
import { expertVisualTriage, triageLesion } from "../src/lib/ai/vlm";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

async function runTests() {
  console.log("=== 1. Test des Réponses Thématiques Dr Kènè ===");

  // 1. Salutations
  const replyGreeting = generateDrKeneKnowledgeReply([{ role: "user", content: "Bonjour Dr Kènè !" }]);
  assert(replyGreeting.includes("Dr Kènè"), "Salutations : mentionne Dr Kènè");
  assert(replyGreeting.includes("mélanodermes") || replyGreeting.includes("noires"), "Salutations : positionnement peaux noires/mélanodermes");

  // 2. Taches / Hyperpigmentation
  const replySpots = generateDrKeneKnowledgeReply([{ role: "user", content: "J'ai des vilaines taches noires après mes boutons sur le visage." }]);
  assert(replySpots.toLowerCase().includes("hyperpigmentation") || replySpots.toLowerCase().includes("taches"), "Taches : aborde l'hyperpigmentation");
  assert(replySpots.includes("solaire") || replySpots.includes("SPF"), "Taches : rappelle la photoprotection");
  assert(replySpots.includes("institut"), "Taches : propose l'institut partenaire");

  // 3. Acné & excès de sébum
  const replyAcne = generateDrKeneKnowledgeReply([{ role: "user", content: "J'ai plein de boutons et la peau très grasse avec la chaleur." }]);
  assert(replyAcne.toLowerCase().includes("pores") || replyAcne.toLowerCase().includes("sebum") || replyAcne.toLowerCase().includes("bouton"), "Acné : explique sébum/pores/chaleur");
  assert(replyAcne.includes("perce jamais"), "Acné : met en garde contre le perçage des boutons");

  // 4. Dépigmentation / Tchatcho
  const replyDepig = generateDrKeneKnowledgeReply([{ role: "user", content: "J'utilisais des crèmes éclaircissantes décapantes et ma peau est brûlée et abîmée..." }]);
  assert(replyDepig.includes("aucun jugement") || replyDepig.includes("confiance"), "Dépigmentation : accueil chaleureux sans aucun jugement");
  assert(replyDepig.includes("karité") || replyDepig.includes("baobab"), "Dépigmentation : prescrit la réparation avec karité/baobab");
  assert(replyDepig.includes("solaire") || replyDepig.includes("SPF"), "Dépigmentation : insiste sur la protection solaire");

  // 5. Peau sèche & Harmattan
  const replyDry = generateDrKeneKnowledgeReply([{ role: "user", content: "Avec l'harmattan ma peau tire, elle pèle et devient toute grise." }]);
  assert(replyDry.includes("karité") || replyDry.includes("baobab"), "Sécheresse : conseille le karité ou baobab");
  assert(replyDry.includes("cendré") || replyDry.includes("tirail"), "Sécheresse : reconnaît le tiraillement ou l'aspect cendré");

  // 6. Cheveux & Alopécie
  const replyHair = generateDrKeneKnowledgeReply([{ role: "user", content: "Mes tempes se dégarnissent à cause de mes tresses trop serrées." }]);
  assert(replyHair.toLowerCase().includes("traction") || replyHair.toLowerCase().includes("tempe"), "Cheveux : identifie l'alopécie de traction");
  assert(replyHair.includes("ricin") || replyHair.includes("baobab") || replyHair.includes("dermatologue"), "Cheveux : conseils adaptés (massage huile / dermato)");

  // 7. Botaniques africaines
  const replyBotanicals = generateDrKeneKnowledgeReply([{ role: "user", content: "Parle-moi du moringa et du beurre de karité pour la peau." }]);
  assert(replyBotanicals.includes("karité") && replyBotanicals.includes("moringa"), "Botaniques : présente le karité et le moringa");

  // 8. Signes rouges / Urgence
  const replyEmergency = generateDrKeneKnowledgeReply([{ role: "user", content: "Mon visage a gonflé d'un coup et j'ai du mal à respirer !" }]);
  assert(replyEmergency.toLowerCase().includes("urgent") || replyEmergency.toLowerCase().includes("urgence") || replyEmergency.toLowerCase().includes("hopital"), "Urgence : alerte immédiate et orientation urgences");
  assert(!replyEmergency.includes("institut"), "Urgence : ne dérive pas vers un institut cosmétique quand il y a danger vital");

  console.log("\n=== 2. Test des Contraintes Persona ===");
  // Texte brut sans markdown
  const testMarkdown = tidyReply("Voici du **gras**, un titre ## Titre et une liste :\n- item 1\n* item 2");
  assert(!testMarkdown.includes("**"), "tidyReply : élimine les astérisques de gras");
  assert(!testMarkdown.includes("##"), "tidyReply : élimine les dièses de titre");
  assert(testMarkdown.includes("• item 1"), "tidyReply : harmonise les puces en •");

  // Longueur et structure
  const wordCount = replySpots.split(/\s+/).length;
  assert(wordCount <= 160, `Longueur : ${wordCount} mots (≤ 160 mots attendu pour concision)`);

  console.log("\n=== 3. Test HTTP Live /api/dermato/chat (POST & GET bridge) ===");
  try {
    // Test POST
    const postRes = await fetch("http://localhost:3000/api/dermato/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Que faire pour avoir un teint éclatant ?" }],
      }),
    });
    const postJson = await postRes.json();
    assert(postRes.status === 200, `POST /api/dermato/chat : status HTTP 200 (obtenu: ${postRes.status})`);
    assert(typeof postJson.reply === "string" && postJson.reply.length > 20, "POST /api/dermato/chat : reply non vide");

    // Test GET bridge (?_g=...)
    const bridgePayload = encodeURIComponent(
      JSON.stringify({
        messages: [{ role: "user", content: "Bonjour Dr Kènè via le pont GET" }],
      })
    );
    const getRes = await fetch(`http://localhost:3000/api/dermato/chat?_g=${bridgePayload}`);
    const getJson = await getRes.json();
    assert(getRes.status === 200, `GET /api/dermato/chat?_g=... : status HTTP 200 (obtenu: ${getRes.status})`);
    assert(typeof getJson.reply === "string" && getJson.reply.length > 20, "GET bridge : reply non vide");
  } catch (err) {
    assert(false, `Erreur réseau test live : ${(err as Error).message}`);
  }

  console.log("\n=== 4. Test Triage Photo Dr Kènè (Zero-Failure Engine & /api/dermato/photo) ===");
  // Test direct expertVisualTriage
  const validPngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const mockImage2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9Qz8DAwMTAwAAACAEBAPWv2nAAAAAASUVORK5CYII=";
  
  const directTriage1 = expertVisualTriage(validPngDataUrl);
  assert(["vert", "jaune", "rouge"].includes(directTriage1.niveau), `expertVisualTriage 1 : niveau valide (${directTriage1.niveau})`);
  assert(directTriage1.message.length > 30, "expertVisualTriage 1 : message consistant et réconfortant");
  assert(!directTriage1.message.includes("momentanément indisponible"), "expertVisualTriage 1 : AUCUN message d'erreur générique");
  assert(!directTriage1.message.includes("**"), "expertVisualTriage 1 : compatible TTS (aucun markdown asterisque)");

  const directTriage2 = expertVisualTriage(mockImage2);
  assert(["vert", "jaune", "rouge"].includes(directTriage2.niveau), `expertVisualTriage 2 : niveau valide (${directTriage2.niveau})`);
  assert(directTriage2.message.length > 30, "expertVisualTriage 2 : message consistant");

  // Test direct triageLesion (asynchrone, fallback automatique vers Tier 3 si pas de VLM distant)
  const vlmTriage = await triageLesion(validPngDataUrl);
  assert(["vert", "jaune", "rouge"].includes(vlmTriage.niveau), `triageLesion : niveau valide (${vlmTriage.niveau})`);
  assert(!vlmTriage.message.includes("momentanément indisponible"), "triageLesion : ne renvoie JAMAIS le message d'indisponibilité");
  assert(vlmTriage.message.length > 30, "triageLesion : message clinique riche");

  // Test HTTP Live POST /api/dermato/photo
  try {
    const photoRes = await fetch("http://localhost:3000/api/dermato/photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: validPngDataUrl,
      }),
    });
    const photoJson = await photoRes.json();
    assert(photoRes.status === 200, `POST /api/dermato/photo : HTTP 200 (obtenu: ${photoRes.status})`);
    assert(["vert", "jaune", "rouge"].includes(photoJson.niveau), `POST /api/dermato/photo : niveau valide (${photoJson.niveau})`);
    assert(typeof photoJson.message === "string" && photoJson.message.length > 30, "POST /api/dermato/photo : message présent");
    assert(!photoJson.message.includes("momentanément indisponible"), "POST /api/dermato/photo : message autonome sans panne");
  } catch (err) {
    assert(false, `Erreur HTTP POST /api/dermato/photo : ${(err as Error).message}`);
  }

  console.log(`\n========================================`);
  console.log(`RÉSULTAT DES TESTS : ${passed} passés, ${failed} échoués`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test execution error:", e);
  process.exit(1);
});
