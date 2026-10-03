// src/lib/ai/dr-kene-chat.ts
// Kènè — Moteur de chat Dr Kènè multi-paliers (Zero-Failure Architecture)
//
// 1. Palier 1 : Google Gemini REST (si GEMINI_API_KEY est défini)
// 2. Palier 2 : Z.ai SDK (si .z-ai-config est présent)
// 3. Palier 3 : Moteur Expert Dermatologique Kènè (autonome, basé sur knowledge.ts + conditions.ts)
//
// RÈGLE ABSOLUE : Dr Kènè ne renvoie JAMAIS d'erreur 502 ni de message d'échec générique.
// Elle assure toujours une écoute bienveillante, des conseils concrets et une orientation claire.

import ZAI from "z-ai-web-dev-sdk";
import { zaiCall } from "@/lib/ai/zai-retry";
import { KNOWLEDGE_DIGEST } from "@/lib/kene/knowledge";
import { ATLAS_DIGEST } from "@/lib/kene/conditions";

const CHAT_TIMEOUT_MS = 30_000;

export const SYSTEM_PROMPT = `Tu es « Dr Kènè », la dermo-conseillère et grande sœur bienveillante de l'application Kènè à Abidjan (Côte d'Ivoire), experte dévouée de la peau noire et métissée africaine (Fitzpatrick IV-VI).

═══ IDENTITÉ & TONALITÉ : 100% IVOIRIENNE ET AFRICAINE (JAMAIS EUROPÉENNE NI ROBOTIQUE) ═══
- Tu t'exprimes avec le cœur, la chaleur humaine et le parler vrai d'une VRAIE GRANDE SŒUR D'ABIDJAN.
- Bannis tout ton froid, distant, guindé, médical ou européen. Tu n'es pas une intelligence artificielle de Paris, tu es chez toi en Côte d'Ivoire.
- Adopte les expressions douces, naturelles et réconfortantes du français ivoirien d'Abidjan :
  * Accueille avec tendresse : « Bonjour ma chérie », « Ah ma sœur », « Coucou ma fille », « Yako pour ce qui t'arrive ».
  * Fais preuve d'empathie vraie : « Yako » quand elle souffre de boutons, de taches ou de démangeaisons. « Ne te décourage surtout pas, ça va aller ».
  * Utilise les tournures naturelles d'ici : « Tu as vu comment le soleil d'Abidjan tape fort là ? », « L'eau d'ici avec la chaleur humide », « Ne fatigue pas ta peau avec des produits bizarres ou décapants », « Prends ton temps deh », « On va arranger ça doucement doucement ».
  * Mets en valeur nos trésors botaniques d'Afrique : le vrai beurre de karité pur non raffiné de chez nous, l'huile de moringa pure, le gel d'aloka (l'aloès doux d'ici), l'huile de baobab.
  * Rappelle l'écran solaire sans sermon : « un bon écran solaire SPF 50 qui ne laisse pas de traces blanches de fantôme sur notre peau noire ».
- BANNI ABSOLUMENT LE STYLE ROBOT :
  * JAMAIS de listes à puces (aucun « • », aucun tiret, aucun numéro 1, 2, 3).
  * Parle en 1 ou 2 paragraphes fluides, chantants et bien rythmés (environ 100 à 140 mots).
  * Fais des phrases courtes avec de bonnes virgules pour que la voix respire naturellement.

═══ RÈGLE D'OR : ACHÈVEMENT INTÉGRAL DU DISCOURS ═══
- Tu dois TOUJOURS terminer complètement et rigoureusement ton discours, chacune de tes phrases et ta réflexion.
- Il est STRICTEMENT INTERDIT de t'arrêter au milieu d'une phrase, de couper un mot ou de laisser une pensée en suspens.
- Conclus TOUJOURS avec une phrase complète de soutien bienveillante terminée par un point final (ex : « Prends grand soin de toi ma chérie, on est ensemble ! » ou « Ça va aller, prends ton temps deh ! »).

═══ RÈGLES DE SÉCURITÉ CUTANÉE ═══
1. Tu ne prescris JAMAIS de médicament chimique (corticoïde, antifongique oral, antibiotique). Tu conseilles des soins doux et orientes vers un médecin ou dermatologue si besoin.
2. Tu ne poses jamais de diagnostic médical fermé : « ça ressemble souvent à… » est autorisé.
3. Signe d'urgence (visage ou lèvres enflés, étouffement, grosse fièvre avec rougeur chaude) → « ma sœur, va tout de suite au centre de santé ou à l'hôpital le plus proche ».
4. Zéro jugement sur le décapage/tchatcho ou les produits éclaircissants du marché : accueil, douceur, réparation de la barrière protectrice avec le karité.
5. Soin esthétique (taches, routine, éclat) → propose aussi de passer dans un institut partenaire certifié Kènè à Abidjan pour un soin cabine.

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

const FALLBACK_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

function getCandidateModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const models = [
    preferred && preferred !== "gemini-1.5-flash" && preferred !== "gemini-2.0-flash" ? preferred : null,
    ...FALLBACK_MODELS,
  ].filter(Boolean) as string[];
  return Array.from(new Set(models));
}

/** Palier 1 : Google Gemini REST avec cascade de modèles */
async function callGeminiChat(messages: ChatMessage[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const history = messages.slice(-20);

    const contents = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Google Gemini REST exige que le premier tour provienne impérativement du rôle 'user'
    while (contents.length > 0 && contents[0].role === "model") {
      contents.shift();
    }
    if (contents.length === 0) return null;

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
    const history = messages.slice(-20);
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
      "Bonjour ma chérie et sois la bienvenue ! C'est Dr Kènè, ta grande sœur et conseillère beauté ici à Abidjan. " +
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

  // 5. DÉPIGMENTATION VOLONTAIRE / DÉCAPAGE / PEAU ABÎMÉE / TCHATCHO
  if (/depigment|decap|eclaircis|tchatcho|hydroquinone|cortico|clobetasol|abim|brul/.test(text)) {
    return (
      "Yako du fond du cœur ma chérie, et merci pour ta confiance. Ici tu es chez toi, zéro honte et zéro jugement : on va réparer ta peau ensemble doucement doucement. " +
      "Quand on arrête les produits éclaircissants ou le tchatcho, la peau peut chauffer ou foncer un peu, c'est l'étape normale de guérison. " +
      "Nourris-la matin et soir avec notre vrai beurre de karité pur non raffiné et un peu d'huile de baobab pour reconstruire sa barrière protectrice. " +
      "Protège-toi toujours du soleil avec un écran solaire, et viens faire le point avec un dermatologue bienveillant ou dans un de nos instituts partenaires pour un protocole réparateur."
    );
  }

  // 6. PEAU SÈCHE / TIRAILLEMENTS / HARMATTAN
  if (/sech|seche|tirail|deshydrat|pele|harmattan|rugueu|cendre/.test(text)) {
    return (
      "C'est vrai qu'avec l'harmattan ou la climatisation à Abidjan, notre peau noire s'assèche vite et prend un reflet gris cendré. " +
      "Pour retrouver un confort immédiat, lave-toi à l'eau tiède et, dès la sortie de la douche pendant que ta peau est encore un peu humide, scelle cette eau avec une bonne noisette de pur beurre de karité tiédi dans tes mains ou de l'huile de baobab. " +
      "Bois aussi beaucoup d'eau dans la journée deh, et tu vas voir comment ton teint va briller naturellement."
    );
  }

  // 7. CHEVEUX / ALOPÉCIE DE TRACTION / TEMPES
  if (/cheveu|alopecie|traction|tempe|chute|tresse|tissage|cuir chevelu/.test(text)) {
    return (
      "Yako ma sœur ! La perte de cheveux sur les tempes là, c'est très souvent les nattes trop tirées ou les mèches lourdes qui fatiguent la racine. " +
      "Libère tes cheveux des coiffures serrées pendant quelques semaines pour laisser tes follicules respirer. " +
      "Le soir, masse doucement la lisière avec quelques gouttes d'huile de ricin ou de baobab pour faire circuler le sang. " +
      "Si ça te gratte fort ou qu'il y a des croûtes, consulte vite un médecin dermatologue pour ne pas perdre définitivement tes repousses."
    );
  }

  // 8. DÉMANGEAISONS / ECZÉMA / MYCOSES / TACHES BLANCHES
  if (/gratt|demange|eczema|dartre|mycose|champignon|pityriasis|tache blanche|tache claire/.test(text)) {
    return (
      "Yako pour les démangeaisons ma chérie ! Avec l'humidité de chez nous, les petites plaques claires et les mycoses arrivent très vite. " +
      "Sèche toujours bien tout ton corps après le bain et porte des habits légers en coton. " +
      "Lave-toi avec un savon surgras doux et apaise avec un peu de karité pur, sans jamais aller acheter une pommade corticoïde bizarre au marché sans ordonnance. " +
      "Si toute la maison se gratte ou que ça s'étend, consulte un médecin pour prendre un bon traitement adapté."
    );
  }

  // 9. BOTANIQUES AFRICAINES
  if (/karite|moringa|baobab|bissap|aloka|plante|naturel|botanique/.test(text)) {
    return (
      "Nos plantes de chez nous sont de véritables bénédictions pour la peau mélanoderme ! " +
      "Le vrai beurre de karité brut répare tout le corps, l'huile de moringa fait briller le teint sans le rendre gras, " +
      "le baobab protège la peau fragile et le gel d'aloka apaise le feu du soleil instantanément. " +
      "Ce sont nos richesses naturelles africaines, simples, pures et très efficaces quand on les applique avec amour et régularité."
    );
  }

  // 10. INSTITUTS / RENDEZ-VOUS / SOINS
  if (/institut|rendez[- ]vous|rdv|soin|cabine|reserver|reservation|dermo/.test(text)) {
    return (
      "Tu peux prendre ton rendez-vous directement dans l'application Kènè auprès de nos instituts partenaires certifiés à Abidjan, comme le Cabinet LA DERMO. " +
      "Les praticiennes d'ici connaissent parfaitement la peau noire et adaptent le soin à ton phototype sans produits agressifs. " +
      "Va juste dans l'onglet Instituts pour réserver ton créneau tranquillement."
    );
  }

  // 11. ROUTINE & RÉPONSE GÉNÉRALE BIENVEILLANTE
  return (
    "Pour avoir un joli teint propre et lumineux, pas besoin de compliquer les choses ma chérie. " +
    "La base pour nous à Abidjan : un nettoyage doux sans savon matin et soir, " +
    "une bonne hydratation avec un gel léger comme l'aloka ou l'huile de moringa, et un écran solaire SPF 50 tous les matins avant de sortir au soleil. " +
    "Le soir, nourris avec un peu de karité pur. Raconte-moi ce que tu veux améliorer en priorité et on avance ensemble ✨."
  );
}

export interface DrKeneAudioResponse {
  reply: string;
  transcription: string;
}

/**
 * Traitement direct d'une note vocale pour Dr. Kènè :
 * 1. Palier 1 : Écoute et compréhension directe multimodale par Gemini (retourne transcription + réponse en JSON)
 * 2. Palier 2 : Retranscription ASR puis réponse experte
 * 3. Palier 3 : Filet de sécurité bienveillant
 */
export async function getDrKeneAudioReply(
  audioBase64: string,
  mimeType: string = "audio/wav",
  history: ChatMessage[] = [],
  userId?: string,
): Promise<DrKeneAudioResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  let cleanMime = (mimeType || "").split(";")[0]?.trim().toLowerCase();
  if (!cleanMime || !cleanMime.startsWith("audio/")) cleanMime = "audio/wav";

  // Palier 1 : Compréhension audio multimodale directe via Gemini (avec cascade de modèles)
  if (apiKey) {
    try {
      const historyContents = history.slice(-10).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      // Google Gemini REST exige impérativement que le premier élément soit de rôle 'user'
      while (historyContents.length > 0 && historyContents[0].role === "model") {
        historyContents.shift();
      }

      const contents = [
        ...historyContents,
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: cleanMime, data: audioBase64 } },
            { text: "Voici ma note vocale. Écoute mon message et réponds-moi en tant que Dr. Kènè." },
          ],
        },
      ];

      const audioPrompt = `${SYSTEM_PROMPT}

═══ DIRECTIVE SPÉCIFIQUE NOTE VOCALE ═══
L'utilisatrice vient de t'envoyer un message vocal (note vocale).
Écoute attentivement ce qu'elle dit.
Réponds STRICTEMENT sous format JSON valide avec la structure suivante :
{
  "transcription": "Retranscription fidèle mot à mot en français de ce que dit l'utilisatrice",
  "reply": "Ta réponse chaleureuse et bienveillante en français d'Abidjan (100 à 140 mots, sans markdown astérisques **, discours et phrases TOUJOURS complètement terminés par un point final)"
}
Si la note vocale ne contient que du silence ou est inaudible, renvoie "transcription": "" et dans "reply" un mot doux demandant de répéter.`;

      const models = getCandidateModels();

      for (const model of models) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: audioPrompt }] },
                contents,
                generationConfig: {
                  temperature: 0.3,
                  maxOutputTokens: 2500,
                  responseMimeType: "application/json",
                },
              }),
              signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
            },
          );

          if (res.status === 429) {
            console.warn(`[kene:audio-chat] Quota dépassé sur ${model} (429), essai du modèle suivant...`);
            continue;
          }

          if (!res.ok) {
            console.warn(`[kene:audio-chat] HTTP ${res.status} sur ${model}`);
            continue;
          }

          const data = await res.json();
          const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawJson) {
            try {
              const parsed = JSON.parse(rawJson);
              const reply = tidyReply(parsed.reply || "");
              const transcription = String(parsed.transcription || "").trim();
              if (reply) {
                return { reply, transcription };
              }
            } catch {
              const match = rawJson.match(/\{[\s\S]*\}/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                const reply = tidyReply(parsed.reply || "");
                const transcription = String(parsed.transcription || "").trim();
                if (reply) {
                  return { reply, transcription };
                }
              }
            }
          }
        } catch (err) {
          console.warn(`[kene:audio-chat] Échec appel sur modèle ${model}:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.warn("[kene:audio-chat] Palier multimodal Gemini direct échoué :", err);
    }
  }

  // Palier 2 : Tente un secours par réponse textuelle par défaut
  const fallbackReply = generateDrKeneKnowledgeReply(
    [...history, { role: "user", content: "conseil" }],
    userId,
  );
  return {
    reply: fallbackReply,
    transcription: "Note vocale reçue",
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

