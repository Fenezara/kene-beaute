// src/lib/ai/dr-kene-chat.ts
// Kènè — Moteur de chat Dr Kènè multi-paliers (Zero-Failure Architecture)
//
// 1. Palier 1 : Google Gemini REST (si GEMINI_API_KEY est défini)
// 2. Palier 2 : Z.ai SDK (si .z-ai-config est présent)
// 3. Palier 3 : Moteur Expert Dermatologique Kènè (autonome, basé sur knowledge.ts + conditions.ts)
//
// RÈGLE ABSOLUE : Dr Kènè écoute attentivement, comprend avec exactitude les textes
// et notes vocales, et répond directement et précisément à la question posée.

import ZAI from "z-ai-web-dev-sdk";
import { zaiCall } from "@/lib/ai/zai-retry";
import { KNOWLEDGE_DIGEST } from "@/lib/kene/knowledge";
import { ATLAS_DIGEST } from "@/lib/kene/conditions";

const CHAT_TIMEOUT_MS = 30_000;

export const SYSTEM_PROMPT = `Tu es « Dermo Kènè », la dermo-conseillère et grande sœur bienveillante de référence de l'application Kènè à Abidjan (Côte d'Ivoire), experte dévouée de la peau noire et métissée africaine (phototypes Fitzpatrick IV à VI).

═══ RÈGLE FONDAMENTALE N°1 : COMPRÉHENSION EXACTE & RÉPONSE PERTINENTE (ÉCOUTE ACTIVE) ═══
- Réponds TOUJOURS avec exactitude, précision et clarté à la QUESTION EXACTE ou au PROPOS posé par l'utilisatrice.
- Ne réponds JAMAIS à côté de la plaque ni avec un discours générique préfabriqué.
- Analyse attentivement ce que l'utilisatrice te dit ou te demande :
  * Si elle te pose une question précise (ex: choix d'un savon, utilisation du rétinol ou de la niacinamide, fréquence d'un gommage, prix d'un soin, prise de rendez-vous, institut, peau qui pèle, cernes, vergetures) : réponds DIRECTEMENT sur ce sujet précis dès la première phrase avec des explications concrètes et adaptées à la peau noire.
  * Si elle partage une inquiétude cutanée ou une souffrance (acné, taches sombres, brûlures après décapage, démangeaisons, alopécie) : commence par un mot de réconfort chaleureux (« Yako ma chérie », « Ne t'inquiète pas, on est ensemble »), puis donne le protocole de soin doux adapté.
  * Si c'est le tout premier message ou une salutation (« Bonjour », « Salut ») : salue avec douceur (« Bonjour ma chérie », « Coucou ma sœur ») et demande-lui ce qui préoccupe sa peau aujourd'hui.
  * Si c'est la suite d'une conversation (messages précédents déjà échangés) : NE RÉPÈTE PAS les salutations (« Bonjour ») ni les mêmes généralités à chaque réplique ! Enchaîne directement et naturellement sur ce qu'elle vient de dire comme dans une vraie conversation.
  * Pour les soins en cabine et instituts : rappelle qu'elle peut prendre rendez-vous auprès de nos instituts partenaires certifiés Kènè à Abidjan (comme le Cabinet LA DERMO) directement dans l'onglet « Instituts / RDV » de l'application.
  * Pour les cosmétiques et soins recommandés : elle peut les retrouver directement dans l'onglet « Boutique » de l'application.
  * Adapte la longueur : fais des réponses complètes mais digestes (généralement entre 60 et 130 mots selon la question). Ne meuble pas inutilement avec des redondances si la question est simple.

═══ IDENTITÉ & TONALITÉ : GRANDE SŒUR EXPERTE D'ABIDJAN ═══
- Tu t'exprimes avec le cœur, la chaleur humaine et le parler vrai d'une grande sœur d'Abidjan :
  * Chaleureuse, respectueuse, complice et bienveillante.
  * Français ivoirien fluide, élégant et naturel (touches douces : « ma chérie », « ma sœur », « deh », « doucement doucement », « on est ensemble »).
  * Bannis tout ton froid, distant, condescendant ou impersonnel.
- STYLE D'ÉCRITURE :
  * Pas de listes à puces robotiques (pas de « • », de tirets d'énumération ou de 1. 2. 3.).
  * Privilégie 1 à 2 paragraphes fluides, bien rythmés, avec une ponctuation naturelle pour une lecture agréable et une narration vocale fluide.
  * RÈGLE D'OR : Termine TOUJOURS complètement et rigoureusement chaque phrase et pensée par un point final.

═══ EXPERTISE DERMO-COSMÉTIQUE PEAUX NOIRES & TRÉSORS AFRICAINS ═══
- Connais parfaitement les spécificités de la peau noire (Fitzpatrick IV-VI) :
  * Tendance forte à l'hyperpigmentation post-inflammatoire (la moindre agression ou bouton laisse une tache sombre).
  * Vulnérabilité aux gommages à gros grains et décapants qui stimulent la mélanogénèse réactionnelle.
  * Besoin d'un écran solaire invisible sans traces blanches de fantôme (SPF 50).
  * Barrière lipidique spécifique : valorise nos trésors botaniques purs d'Afrique de l'Ouest (beurre de karité brut non raffiné, huile de moringa, huile de baobab, aloe vera / aloka doux, eau florale de bissap).
  * Actifs cosmétiques modernes recommandés : niacinamide (éclat et séborégulation), acide azélaïque (taches et rougeurs), acide salicylique doux (pores et sébum), vitamine C stabilisée, céramides, acide hyaluronique.

═══ RÈGLES DE SÉCURITÉ & SANTÉ ═══
- Tu es une conseillère bienveillante en dermo-cosmétique, tu ne remplaces pas un médecin.
- Tu ne prescris JAMAIS de médicaments soumis à ordonnance (antibiotiques oraux, corticoïdes, etc.).
- Face à un signe d'alerte grave (visage ou lèvres enflés, étouffement, grosse fièvre avec rougeur chaude et douloureuse, plaie étendue qui ne cicatrise pas) : oriente immédiatement vers un service d'urgence médicale ou un centre de santé.
- Respect absolu de la personne : zéro jugement sur le passé cosmétique (décapage, crèmes éclaircissantes). Offre un accompagnement bienveillant vers la réparation et la régénération de la peau.

${KNOWLEDGE_DIGEST}

${ATLAS_DIGEST}`;

/** Nettoyage d'affichage : texte brut garanti pour la bulle de chat et le TTS, avec garantie anti-coupure */
export function tidyReply(raw: string): string {
  let cleaned = raw
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // retirer gras markdown
    .replace(/(\*|_)(.*?)\1/g, "$2")   // retirer italique markdown
    .replace(/#{1,6}\s*/g, "")          // retirer dièses de titres markdown
    .replace(/^[•\-\*·]\s+/gm, "")      // supprimer les puces mécaniques
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Retirer un éventuel préfixe "Dr Kènè :" ou "Dermo Kènè :"
  cleaned = cleaned.replace(/^(?:Dr\.?|Dermo)\s*K[èe]n[èe]\s*:\s*/i, "");

  // Sécurité anti-coupure : si le modèle s'est arrêté brutalement sans ponctuation finale
  if (cleaned && !/[.!?…✨]$/.test(cleaned)) {
    const lastPunctuation = Math.max(
      cleaned.lastIndexOf("."),
      cleaned.lastIndexOf("!"),
      cleaned.lastIndexOf("?"),
    );
    if (lastPunctuation > cleaned.length * 0.6) {
      cleaned = cleaned.slice(0, lastPunctuation + 1).trim();
    } else {
      cleaned = cleaned.replace(/[,;:\s]+$/, "") + ".";
    }
  }

  return cleaned;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function getCandidateModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const models = [
    preferred && preferred !== "gemini-1.5-flash" && preferred !== "gemini-2.0-flash" ? preferred : null,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-pro",
  ].filter(Boolean) as string[];
  return Array.from(new Set(models));
}

/** Palier 1 : Google Gemini REST avec cascade de modèles */
async function callGeminiChat(messages: ChatMessage[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const history = messages.slice(-16);

    const rawContents = history.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));

    // Google Gemini REST exige impérativement que le premier tour provienne du rôle 'user'
    while (rawContents.length > 0 && rawContents[0].role === "model") {
      rawContents.shift();
    }
    if (rawContents.length === 0) return null;

    // Fusionner les messages consécutifs du même rôle pour garantir une alternance stricte user / model
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
    for (const item of rawContents) {
      const last = contents[contents.length - 1];
      if (last && last.role === item.role) {
        last.parts.push(...item.parts);
      } else {
        contents.push({ role: item.role, parts: [...item.parts] });
      }
    }

    const models = getCandidateModels();

    for (const model of models) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
            contents,
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 2500,
            },
          }),
          signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
        });

        if (res.status === 429) {
          console.warn(`[kene:gemini-chat] Quota dépassé sur ${model} (429), passage au modèle suivant...`);
          continue;
        }

        if (!res.ok) {
          console.warn(`[kene:gemini-chat] HTTP ${res.status} sur ${model}: ${await res.text().catch(() => "")}`);
          continue;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return tidyReply(text);
      } catch (err) {
        console.warn(`[kene:gemini-chat] Échec appel Gemini sur ${model}:`, (err as Error).message);
      }
    }
    return null;
  } catch (err) {
    console.warn("[kene:gemini-chat] Gemini chat call failed:", (err as Error).message);
    return null;
  }
}

/** Palier 2 : Z.ai SDK (si configuré) */
async function callZaiChatSafe(messages: ChatMessage[]): Promise<string | null> {
  try {
    const zai = await ZAI.create();
    const history = messages.slice(-16);
    const completion = await zaiCall(
      () =>
        zai.chat.completions.create({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...history.map((m) => ({ role: m.role, content: m.content })),
          ],
          thinking: { type: "disabled" },
        }),
      { label: "dermato:chat", timeoutMs: CHAT_TIMEOUT_MS, busyRetries: 1 }
    );
    const reply = completion.choices[0]?.message?.content;
    return reply ? tidyReply(reply) : null;
  } catch {
    // Si .z-ai-config absent ou indisponible, passage immédiat au palier suivant
    return null;
  }
}

/**
 * Palier 3 : Moteur Expert Dermatologique Kènè
 * Tonalité 100% ivoirienne et africaine, authentique et chaleureuse.
 */
export function generateDrKeneKnowledgeReply(messages: ChatMessage[], _userId?: string): string {
  const userMessages = messages.filter((m) => m.role === "user");
  const lastMsg = userMessages[userMessages.length - 1]?.content || "";
  const text = lastMsg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const fullContext = userMessages.map((m) => m.content).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. DÉTECTION DES URGENCES & SIGNES ROUGES
  const isEmergency =
    /gonfl.*(visage|levr|gorg)|(visage|levr|gorg).*gonfl|etouff|oedeme|anaphylax/.test(text) ||
    /(mal|difficulte|gene|peine|bloque).*respir|respir.*(mal|difficile|bloque)/.test(text) ||
    /fievre.*(chaud|rouge|doulour|etend|gonfle|plaie)|(chaud|rouge|doulour|etend|gonfle|plaie).*fievre|cellulite|erysipele/.test(text) ||
    /purpura|ne s'efface pas|tache.*rouge.*appuie/.test(text) ||
    /plaie.*(mois|guerit pas|ne se referme pas)|ulcere/.test(text);

  if (isEmergency) {
    return (
      "Attention ma chère sœur, ce que tu me décris là présente un vrai risque et demande un médecin sans attendre. " +
      "S'il te plaît, n'applique aucun produit ni remède bizarre sur la peau. Si ton visage est enflé, que tu as du mal à respirer ou une grosse fièvre avec une rougeur qui brûle, " +
      "rends-toi tout de suite au service des urgences ou au centre de santé le plus proche. Ta vie et ta santé passent avant tout ma chérie, prends grand soin de toi."
    );
  }

  // 2. SALUTATIONS / ACCUEIL
  const isGreeting =
    /^(bonjour|bonsoir|salut|coucou|hello|bonjour dr|salut dr|dr kene|aide[- ]moi|qui es[- ]tu)/.test(text.trim()) &&
    text.length < 55;

  if (isGreeting) {
    return (
      "Bonjour ma chérie et sois la bienvenue ! C'est Dermo Kènè, ta grande sœur et conseillère beauté ici à Abidjan. " +
      "Dis-moi, qu'est-ce qui fatigue ta peau en ce moment ? Raconte-moi tout tranquillement, je suis là pour toi et je t'écoute avec le cœur ✨."
    );
  }

  // 3. TACHES / HYPERPIGMENTATION (PIH) / MÉLASMA
  if (/tache|hyperpigment|melasma|masque.*grossesse|teint sombre|marqu/.test(text) || /tache|hyperpigment/.test(fullContext)) {
    return (
      "Yako ma chérie pour les taches ! Tu sais, sur notre peau noire, dès qu'il y a un petit bouton, une blessure ou un frottement, la mélanine monte d'un coup et laisse une tache sombre. " +
      "Ne panique surtout pas, ça s'en va avec un peu de patience. Le secret numéro un à Abidjan, c'est de mettre un bon écran solaire SPF 50 tous les matins pour que le soleil ne vienne pas fixer la noirceur des taches. " +
      "Le soir, utilise un soin doux à la niacinamide et ne fais jamais de gommages durs qui agressent le visage. " +
      "Tu peux aussi réserver un soin éclat dans nos instituts partenaires certifiés Kènè ici à Abidjan ✨."
    );
  }

  // 4. ACNÉ / BOUTONS / EXCÈS DE SÉBUM / PORES DILATÉS
  if (/acne|bouton|sebum|brill|gras|point.*noir|pore|comedon/.test(text)) {
    return (
      "Ah ma sœur, avec la sueur, l'humidité et la chaleur d'Abidjan là, le sébum s'accumule vite et bouche les pores, c'est pour ça que les boutons sortent. " +
      "Mon conseil d'amie : lave ton visage matin et soir avec un gel très doux sans savon, et surtout ne perce jamais les boutons avec tes ongles, sinon ça va laisser des taches noires qui vont durer. " +
      "Mets une hydratation légère comme le gel d'aloka pur ou quelques gouttes d'huile de moringa. " +
      "Si des gros boutons te font mal, une consultation avec une dermo-conseillère en institut partenaire t'aidera à assainir tout ça en douceur."
    );
  }

  // 5. SAVON / NETTOYANT / GEL NETTOYANT
  if (/savon|nettoyant|gel lavant|pain dermatologique|syndet/.test(text)) {
    return (
      "Pour le visage, ma chérie, évite absolument les savons décapants ordinaires qui assèchent et font rebondir le sébum. " +
      "Choisis un pain dermatologique surgras sans savon (syndet) ou un gel moussant doux au pH neutre. " +
      "Lave-toi avec de l'eau tiède sans frotter fort avec un gant rugueux. Tu peux retrouver d'excellents nettoyants doux certifiés dans l'onglet Boutique de l'application."
    );
  }

  // 6. DÉPIGMENTATION VOLONTAIRE / DÉCAPAGE / PEAU ABÎMÉE / TCHATCHO
  if (/depigment|decap|eclaircis|tchatcho|hydroquinone|cortico|clobetasol|abim|brul/.test(text)) {
    return (
      "Yako du fond du cœur ma chérie, et merci pour ta confiance. Ici tu es chez toi, zéro honte et zéro jugement : on va réparer ta peau ensemble doucement doucement. " +
      "Quand on arrête les produits éclaircissants ou le tchatcho, la peau peut chauffer ou foncer un peu, c'est l'étape normale de guérison. " +
      "Nourris-la matin et soir avec notre vrai beurre de karité pur non raffiné et un peu d'huile de baobab pour reconstruire sa barrière protectrice. " +
      "Protège-toi toujours du soleil avec un écran solaire, et viens faire le point avec un dermatologue bienveillant ou dans un de nos instituts partenaires pour un protocole réparateur."
    );
  }

  // 7. PEAU SÈCHE / TIRAILLEMENTS / HARMATTAN
  if (/sech|seche|tirail|deshydrat|pele|harmattan|rugueu|cendre/.test(text)) {
    return (
      "C'est vrai qu'avec l'harmattan ou la climatisation à Abidjan, notre peau noire s'assèche vite et prend un reflet gris cendré. " +
      "Pour retrouver un confort immédiat, lave-toi à l'eau tiède et, dès la sortie de la douche pendant que ta peau est encore un peu humide, scelle cette eau avec une bonne noisette de pur beurre de karité tiédi dans tes mains ou de l'huile de baobab. " +
      "Bois aussi beaucoup d'eau dans la journée deh, et tu vas voir comment ton teint va briller naturellement."
    );
  }

  // 8. CHEVEUX / ALOPÉCIE DE TRACTION / TEMPES
  if (/cheveu|alopecie|traction|tempe|chute|tresse|tissage|cuir chevelu/.test(text)) {
    return (
      "Yako ma sœur ! La perte de cheveux sur les tempes là, c'est très souvent les nattes trop tirées ou les mèches lourdes qui fatiguent la racine. " +
      "Libère tes cheveux des coiffures serrées pendant quelques semaines pour laisser tes follicules respirer. " +
      "Le soir, masse doucement la lisière avec quelques gouttes d'huile de ricin ou de baobab pour faire circuler le sang. " +
      "Si ça te gratte fort ou qu'il y a des croûtes, consulte vite un médecin dermatologue pour ne pas perdre définitivement tes repousses."
    );
  }

  // 9. DÉMANGEAISONS / ECZÉMA / MYCOSES / TACHES BLANCHES
  if (/gratt|demange|eczema|dartre|mycose|champignon|pityriasis|tache blanche|tache claire/.test(text)) {
    return (
      "Yako pour les démangeaisons ma chérie ! Avec l'humidité de chez nous, les petites plaques claires et les mycoses arrivent très vite. " +
      "Sèche toujours bien tout ton corps après le bain et porte des habits légers en coton. " +
      "Lave-toi avec un savon surgras doux et apaise avec un peu de karité pur, sans jamais aller acheter une pommade corticoïde bizarre au marché sans ordonnance. " +
      "Si toute la maison se gratte ou que ça s'étend, consulte un médecin pour prendre un bon traitement adapté."
    );
  }

  // 10. INSTITUTS / RENDEZ-VOUS / SOINS EN CABINE
  if (/institut|rendez[- ]vous|rdv|soin|cabine|reserver|reservation|dermo|adresse|cabinet/.test(text)) {
    return (
      "Tu peux prendre ton rendez-vous directement dans l'application Kènè auprès de nos instituts partenaires certifiés à Abidjan, notamment le Cabinet LA DERMO. " +
      "Les praticiennes d'ici connaissent parfaitement la peau noire et adaptent le protocole de soin à ton phototype sans agresser la peau. " +
      "Rends-toi simplement dans l'onglet « Instituts » de l'application pour choisir ton créneau et ton soin préféré tranquillement ✨."
    );
  }

  // 11. BOUTIQUE / PRIX / ACHAT PRODUITS
  if (/prix|tarif|combien|acheter|commander|produit|boutique|creme|serum/.test(text)) {
    return (
      "Pour commander nos soins dermo-cosmétiques formulés spécialement pour la peau mélanoderme, tu peux te rendre directement dans l'onglet « Boutique » de l'application. " +
      "Tous les prix en FCFA y sont indiqués en toute transparence, avec livraison rapide partout à Abidjan et en Côte d'Ivoire. " +
      "Dis-moi ce que tu cherches exactement et je te guide vers le meilleur soin pour ton teint ✨."
    );
  }

  // 12. BOTANIQUES AFRICAINES
  if (/karite|moringa|baobab|bissap|aloka|plante|naturel|botanique/.test(text)) {
    return (
      "Nos plantes de chez nous sont de véritables bénédictions pour la peau mélanoderme ! " +
      "Le vrai beurre de karité brut répare tout le corps, l'huile de moringa fait briller le teint sans le rendre gras, " +
      "le baobab protège la peau fragile et le gel d'aloka apaise le feu du soleil instantanément. " +
      "Ce sont nos richesses naturelles africaines, simples, pures et très efficaces quand on les applique avec amour et régularité."
    );
  }

  // 13. ROUTINE & RÉPONSE GÉNÉRALE BIENVEILLANTE
  return (
    "Pour prendre soin de ta peau avec amour, voici la règle d'or pour nous à Abidjan : " +
    "un nettoyage doux sans savon matin et soir, une bonne hydratation avec un gel léger ou quelques gouttes d'huile végétale pure, " +
    "et un écran solaire SPF 50 tous les matins pour te protéger du soleil fort. " +
    "Dis-moi ce qui te préoccupe en particulier sur ton visage ou ton corps, et on avance ensemble pas à pas ✨."
  );
}

export interface DrKeneAudioResponse {
  reply: string;
  transcription: string;
}

/**
 * Retranscrit un audio oral en texte brut français via Gemini STT haute précision.
 * Détecte les silences et élimine les hallucinations.
 */
async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "";

  let cleanMime = (mimeType || "").split(";")[0]?.trim().toLowerCase();
  if (!cleanMime || !cleanMime.startsWith("audio/")) cleanMime = "audio/wav";

  const models = getCandidateModels();

  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: cleanMime, data: audioBase64 } },
                  {
                    text:
                      "Écoute très attentivement cet enregistrement audio en français (Afrique de l'Ouest / Côte d'Ivoire). " +
                      "Retranscris avec une fidélité absolue, mot à mot, l'intégralité des paroles prononcées par la personne. " +
                      "RÈGLES STRICTES :\n" +
                      "- Retranscris uniquement les propos prononcés, sans AUCUN commentaire, sans guillemets, sans formule d'introduction.\n" +
                      "- Si l'enregistrement est totalement silencieux, ne contient que du souffle, du bruit de fond sans parole compréhensible, ou est inaudible, réponds UNIQUEMENT par le mot : SILENCE.",
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1000,
            },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );

      if (!res.ok) {
        console.warn(`[kene:transcribe] HTTP ${res.status} sur ${model}`);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = rawText.trim();

      // Détection de silence ou audio inaudible
      if (
        !cleaned ||
        /^silence[\s.]*$/i.test(cleaned) ||
        /^(inaudible|aucun son|vide)[\s.]*$/i.test(cleaned) ||
        cleaned.toLowerCase().includes("retranscris avec une fidélité")
      ) {
        return "";
      }

      // Nettoyer d'éventuels guillemets
      const finalTranscription = cleaned.replace(/^["'«»“]+|["'«»”]+$/g, "").trim();
      if (finalTranscription) {
        return finalTranscription;
      }
    } catch (err) {
      console.warn(`[kene:transcribe] Échec sur ${model}:`, (err as Error).message);
    }
  }

  return "";
}

/**
 * Traitement direct d'une note vocale pour Dr. Kènè :
 * 1. Écoute et transcription haute fidélité ASR
 * 2. Compréhension clinique et réponse sur-mesure de Dr. Kènè
 */
export async function getDrKeneAudioReply(
  audioBase64: string,
  mimeType: string = "audio/wav",
  history: ChatMessage[] = [],
  userId?: string,
): Promise<DrKeneAudioResponse> {
  // 1. Retranscription fidèle de la note vocale
  const transcription = await transcribeAudio(audioBase64, mimeType);

  // Cas 1 : Audio silencieux ou non audible
  if (!transcription) {
    return {
      transcription: "",
      reply:
        "Pardon ma chérie, je n'ai pas bien entendu ta note vocale ou c'était un peu trop silencieux. Tu peux me la réenregistrer en parlant bien près du micro ou m'écrire ton message directement ? Je t'écoute avec attention ✨ !",
    };
  }

  // Cas 2 : Parole reconnue avec succès
  // Filtrer les anciens messages génériques "Note vocale" de l'historique
  const cleanHistory = history
    .filter((m) => !/^Note vocale\s*\(/i.test(m.content))
    .slice(-10);

  const fullConversation: ChatMessage[] = [
    ...cleanHistory,
    { role: "user", content: transcription },
  ];

  // Obtenir la réponse experte, ciblée et chaleureuse de Dr. Kènè
  const reply = await getDrKeneReply(fullConversation, userId);

  return {
    transcription,
    reply,
  };
}

/**
 * Orchestrateur principal Dr Kènè
 * Garantit une réponse de qualité sans jamais lever d'erreur bloquante.
 */
export async function getDrKeneReply(messages: ChatMessage[], userId?: string): Promise<string> {
  // Palier 1 : Google Gemini
  try {
    const geminiReply = await callGeminiChat(messages);
    if (geminiReply) return geminiReply;
  } catch (err) {
    console.warn("[kene:chat] Palier Gemini en échec, bascule sur les paliers suivants :", err);
  }

  // Palier 2 : Z.ai SDK
  try {
    const zaiReply = await callZaiChatSafe(messages);
    if (zaiReply) return zaiReply;
  } catch (err) {
    console.warn("[kene:chat] Palier ZAI en échec, bascule sur le moteur expert :", err);
  }

  // Palier 3 : Moteur Expert Dermatologique Kènè
  return generateDrKeneKnowledgeReply(messages, userId);
}
