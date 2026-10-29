// src/lib/ai/dr-kene-chat.ts
// Kènè — Moteur de chat Dr Kènè multi-paliers (Zero-Failure Architecture)
//
// 1. Palier 1 : Google Gemini REST (si GEMINI_API_KEY est défini)
// 2. Palier 2 : Z.ai SDK (si .z-ai-config est présent)
// 3. Palier 3 : Moteur Expert Dermatologique Kènè (autonome, basé sur knowledge.ts + conditions.ts)
//
// RÈGLE ABSOLUE : Dr Kènè écoute attentivement, comprend avec exactitude les questions
// et notes vocales, adapte rigoureusement son adresse selon le genre (Homme vs Femme)
// et intègre le profil complet de la personne connectée (type de peau, antécédents, bilans).

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { zaiCall } from "@/lib/ai/zai-retry";
import { KNOWLEDGE_DIGEST } from "@/lib/kene/knowledge";
import { ATLAS_DIGEST } from "@/lib/kene/conditions";

const CHAT_TIMEOUT_MS = 7_000;

export interface UserProfileContext {
  id?: string;
  name?: string;
  gender?: "femme" | "homme" | "non_precise" | null;
  city?: string | null;
  district?: string | null;
  birthDate?: string | null;
  pregnant?: boolean | null;
  skinType?: string | null;
  fitzpatrick?: string | null;
  allergies?: string | null;
  goals?: string | null;
  cosmeticsUsed?: string | null;
  prescribedByTenant?: string | null;
  recentDiagnoses?: Array<{
    zone: string;
    score: number;
    primaryNeed?: string | null;
    skinGoal?: string | null;
    createdAt?: Date | string;
  }>;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface DrKeneAudioResponse {
  reply: string;
  transcription: string;
}

/** Résolution du profil utilisateur depuis la base SQLite si un identifiant est fourni */
export async function resolveUserProfile(
  userProfileOrId?: string | UserProfileContext | null
): Promise<UserProfileContext | null> {
  if (!userProfileOrId) return null;
  if (typeof userProfileOrId !== "string") return userProfileOrId;

  try {
    const user = await db.user.findUnique({
      where: { id: userProfileOrId },
      include: {
        diagnoses: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            zone: true,
            scoreGlobal: true,
            resultJson: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) return null;

    let cosmeticsUsed: string | null = null;
    let prescribedByTenant: string | null = null;
    const digits = user.phone ? user.phone.replace(/\D/g, "") : "";
    const tail = digits.length >= 8 ? digits.slice(-8) : digits;
    const profile = await db.clientProfile.findFirst({
      where: {
        OR: [
          { userId: user.id },
          ...(tail ? [{ phone: { contains: tail } }] : [{ phone: user.phone }]),
        ],
        cosmeticsUsed: { not: null },
      },
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (profile) {
      cosmeticsUsed = profile.cosmeticsUsed;
      prescribedByTenant = profile.tenant.name;
    }

    return {
      id: user.id,
      name: user.name,
      gender: (user.gender as "femme" | "homme" | "non_precise") || "non_precise",
      city: user.city,
      district: user.district,
      birthDate: user.birthDate,
      pregnant: user.pregnant,
      skinType: user.skinType,
      fitzpatrick: user.fitzpatrick,
      allergies: user.allergies,
      goals: user.goals,
      cosmeticsUsed,
      prescribedByTenant,
      recentDiagnoses: user.diagnoses?.map((d) => ({
        zone: d.zone,
        score: d.scoreGlobal,
        primaryNeed: null,
        skinGoal: null,
        createdAt: d.createdAt,
      })),
    };
  } catch (err) {
    console.warn("[kene:resolveUserProfile] Erreur lecture profil :", err);
    return null;
  }
}

/** Construction dynamique du Prompt Système avec prise en compte du Genre et du Profil */
export function buildDrKeneSystemPrompt(userProfile?: UserProfileContext | null): string {
  const name = userProfile?.name?.trim() || "";
  const gender = userProfile?.gender || "non_precise";
  const city = userProfile?.city || "";
  const district = userProfile?.district || "";
  const skinType = userProfile?.skinType || "";
  const fitzpatrick = userProfile?.fitzpatrick || "";
  const goals = userProfile?.goals || "";
  const allergies = userProfile?.allergies || "";
  const pregnant = userProfile?.pregnant || false;
  const recentDiagnoses = userProfile?.recentDiagnoses || [];

  let genderInstruction = "";
  if (gender === "homme") {
    genderInstruction = `
═══ CIVILITÉ & GENRE DE L'INTERLOCUTEUR : HOMME ═══
- L'utilisateur connecté qui te parle est un HOMME (${name ? `il s'appelle ${name}` : "homme"}).
- RÈGLE RELATIONNELLE ET GRAMMATICALE ABSOLUE :
  * Adresse-toi à lui comme à un HOMME avec respect, élégance et chaleur (« Bonjour ${name ? name : "cher ami"} », « Mon cher frère », « Cher ami »).
  * INTERDICTION FORMELLE d'utiliser « ma chérie », « ma sœur », « ma belle », « chérie » ou des accords féminins (« fatiguée », « prête ») !
  * Sois particulièrement experte sur les problématiques dermo-cosmétiques masculines lorsqu'il en parle :
    - Barbe, rasage et folliculite (pseudofolliculitis barbae / boutons de rasage très fréquents sur les poils crépus et bouclés : poils incarnés, taches brunes résiduelles).
    - Protocole rasage doux : rasoir 1 lame ou tondeuse dans le sens du poil, eau tiède, huile végétale légère de jojoba ou balanites, sérum apaisant à la niacinamide 5% ou acide azélaïque, zéro après-rasage alcoolisé décapant.
    - Séborrhée et pores dilatés sous la chaleur d'Abidjan : nettoyant purifiant doux sans savon, hydratation fluide.
    - Écran solaire transparent sans résidu blanc visible dans la barbe.`;
  } else if (gender === "femme") {
    genderInstruction = `
═══ CIVILITÉ & GENRE DE L'INTERLOCUTRICE : FEMME ═══
- L'utilisatrice connectée qui te parle est une FEMME (${name ? `elle s'appelle ${name}` : "femme"}).
- Adresse-toi à elle avec douceur, élégance et sororité bienveillante (« Bonjour ${name ? name : "chère amie"} », « Ma chère sœur »).
${pregnant ? "- ALERTE PRÉCAUTION MATERNITÉ ACTIVE : Cette cliente a indiqué être enceinte ou allaitante. Sécurité absolue : proscris tout rétinoïde, huile essentielle forte, acide salicylique concentré ou dérivé agressif. Privilégie karité brut, gel d'aloka, huile de balanites, niacinamide douce et acide azélaïque." : ""}`;
  } else {
    genderInstruction = `
═══ CIVILITÉ DE L'INTERLOCUTEUR : NON SPÉCIFIÉE ═══
- Le genre de la personne connectée n'est pas précisé dans son profil.
- Adresse-toi à cette personne avec respect, élégance et bienveillance universelle (« Bonjour ${name ? name : ""} », « Bienvenue sur Kènè », « Prenez grand soin de vous »).
- N'impose ni « ma chérie » ni « mon cher frère » tant que la civilité n'est pas confirmée.`;
  }

  let profileSection = `
═══ PROFIL CLINIQUE DE LA PERSONNE CONNECTÉE ═══
- Nom : ${name || "Utilisateur Kènè"}
- Genre : ${gender === "homme" ? "Homme" : gender === "femme" ? "Femme" : "Non précisé"}
- Ville & Quartier : ${district ? `${district}, ${city || "Abidjan"}` : city || "Abidjan (Côte d'Ivoire)"}
- Type de peau déclaré : ${skinType || "Non encore renseigné"}
- Phototype mélanoderme : ${fitzpatrick ? `Fitzpatrick ${fitzpatrick}` : "Non encore renseigné"}
- Objectifs peau : ${goals || "Harmonie, éclat et santé cutanée"}
- Allergies signalées : ${allergies || "Aucune allergie connue"}
- Maternité (grossesse / allaitement) : ${pregnant ? "OUI" : "Non"}`;

  if (userProfile?.cosmeticsUsed) {
    profileSection += `\n- ROUTINE QUOTIDIENNE À DOMICILE PRESCRITE EN SALON (${userProfile.prescribedByTenant || "Institut Partenaire Kènè"}) : "${userProfile.cosmeticsUsed}"\n  (La cliente suit cette routine personnalisée. Accompagne-la avec bienveillance sur l'application de ces soins prescrits par sa dermo-conseillère).`;
  }

  if (recentDiagnoses.length > 0) {
    profileSection += `\n- Historique récent des diagnostics Visia IA :`;
    recentDiagnoses.forEach((d, i) => {
      profileSection += `\n  * Bilan ${i + 1} (${d.zone}) : Score santé ${d.score}/100. Besoin identifié : ${d.primaryNeed || d.skinGoal || "Suivi régulier"}.`;
    });
  }

  return `Tu es « Dermo Kènè », la dermo-conseillère experte et bienveillante de référence de l'application Kènè à Abidjan (Côte d'Ivoire), experte de TOUTE la diversité des peaux noires, afro-descendantes et métissées africaines (peaux Albinos OCA, Afro-rousses / Rouquines, Chabines, Métissées, Teints clairs caramel, Brunes cuivrées et Ébène intense — phototypes I africain à VI).

${genderInstruction}

${profileSection}

═══ RÈGLE FONDAMENTALE N°1 : PROTOCOLE D'ANAMNÈSE DERMATOLOGIQUE PROGRESSIF (ENTONNOIR DERMO-CONSEIL) ═══
En vraie consultation avec une dermo-conseillère, ON NE DONNE JAMAIS une routine complète ni une conclusion définitive dès la première phrase quand un client expose un problème. On procède par ANAMNÈSE INTERACTIVE en 2 à 3 étapes :

1. DISTINCTION OBLIGATOIRE :
   - CAS A : QUESTION INFORMATIVE SIMPLE (ex: "C'est quoi la niacinamide ?", "Quel est le prix d'un soin ?", "Le karité bouche-t-il les pores ?") :
     → Réponds DIRECTEMENT, de façon concise, pédagogique et experte, sans interrogatoire.
   - CAS B : PROBLÈME CUTANÉ / SYMPTÔME PERSONNEL DÉCLARÉ (ex: "J'ai des boutons", "Ma peau pèle", "Taches noires sur les joues", "Mon visage brûle", "Peau trop grasse") :
     → DÉCLENCHE LE PROTOCOLE D'ANAMNÈSE INTERACTIVE :

2. DÉROULEMENT DU PROTOCOLE D'ANAMNÈSE :
   - ÉTAPE 1 (Symptômes & Ancienneté) :
     * Commence par un mot d'empathie bienveillant (« Yako ma sœur » ou « Je comprends ton inconfort cher ami »).
     * Pose UNE ou DEUX questions ciblées au maximum pour comprendre le problème :
       - Depuis combien de temps ces lésions/boutons/taches sont apparus ?
       - Est-ce que cela te démange, te brûle ou est douloureux au toucher ?
     * Invite gentiment à partager une photo nette si ce n'est pas déjà fait : « Si tu le souhaites, tu peux aussi m'envoyer une photo nette de la zone grâce au bouton 📷 ».
     * Termine TOUJOURS par une ligne spéciale de suggestions de réponses rapides :
       Format obligatoire à la fin :
       [CHIPS: <Choix 1> | <Choix 2> | <Choix 3> | <Choix 4>]
       Exemple : [CHIPS: Moins d'un mois | Depuis longtemps | Ça me gratte | Pas de douleur]

   - ÉTAPE 2 (Habitudes, Savons & Cosmétiques actuels) :
     * Si l'utilisateur a répondu à l'Étape 1 (ou a déjà donné l'ancienneté/symptômes), approfondis avec la 2ème question clé :
       - Quels produits ou savons utilises-tu sur ton visage le matin et le soir en ce moment ?
       - As-tu utilisé des crèmes décapantes/éclaircissantes, ou changé récemment de routine ?
     * Format obligatoire des puces rapides à la fin :
       [CHIPS: Savon doux / gel | Savon noir / antiseptique | Crème hydratante | Soin éclaircissant]

   - ÉTAPE 3 (Conclusion Clinique Finale & Protocole Sur-Mesure) :
     * Dès que tu disposes des éléments clés (après 2 échanges de questions ou si l'utilisateur a tout précisé d'un coup) :
       Délivre la CONCLUSION FINALE structurée comme suit :
       - Diagnostic / Bilan bienveillant : explication claire du mécanisme sur peau noire/mélanoderme.
       - Routine Matin : 2 à 3 étapes concrètes (nettoyant doux, sérum botanique, SPF 50+ invisible).
       - Routine Soir : 2 à 3 étapes concrètes (démaquillage huileux, apaisement aloka/niacinamide, karité/balanites).
       - À bannir formellement : gestes aggravants (percer, frotter, savon abrasif, alcool).
       - Orientation cabine : invitation à prendre RDV en institut partenaire certifié Kènè pour un soin purifiant/unifiant cabine.
       [CHIPS: Prendre RDV en institut | Commander les soins | Poser une autre question]

3. ATTITUDE & FORMAT :
   - Réponds avec chaleur, empathie et authenticité ivoirienne bienveillante.
   - Réponses fluides, digestes et aérées (80 à 140 mots par étape).
   - Ne pose JAMAIS plus de 2 questions à la fois pour ne pas noyer l'interlocuteur.

═══ EXPERTISE DERMO-COSMÉTIQUE : SPECTRE COMPLET DES PEAUX NOIRES & TRÉSORS AFRICAINS ═══
- Peau Albinos (Albinisme Oculo-Cutané OCA) : photoprotection vitale SPF 50+ toutes les 2 h + chapeau + lunettes UV400. Soins ultra-doux (karité brut, céramides, aloka). Toute croûte persistante → dermatologue sans attendre.
- Peau Afro-Rousse / Rouquine (phéomélanine) : sérum antioxydant (vitamine C stabilisée, moringa) + SPF 50+ obligatoire, apaisant le soir (niacinamide, baobab). Ne jamais décaper les taches de rousseur naturelles.
- Peau Chabine, Métissée & Teint clair doré (III-IVa) : forte réactivité vasculaire et pigmentaire, risque de mélasma. Sérum vitamine C + niacinamide + SPF 50+ le matin, acide azélaïque le soir.
- Peau Brune cuivrée et Ébène intense (Vb-VI) : forte eumélanine mais déshydratation fréquente (reflet gris-cendré) et PIH tenace. Scellement de l'eau sur peau humide avec beurre de karité brut ou baobab, écran solaire transparent sans trace blanche.
- Boutons de rasage / Folliculite de la barbe (hommes) : rasoir 1 lame dans le sens du poil, eau tiède, huile de balanites ou jojoba, sérum niacinamide ou acide azélaïque, zéro alcool.
- Actifs botaniques d'Afrique : beurre de karité pur non raffiné, huile de moringa, huile de baobab, huile de balanites, gel d'aloka, bissap.

═══ SÉCURITÉ & SANTÉ ═══
- Tu es conseillère dermo-cosmétique bienveillante, tu ne remplaces pas un médecin.
- Ne prescris jamais de médicaments sous ordonnance.
- Signes d'alerte grave (visage/lèvres enflés, étouffement, fièvre avec rougeur chaude et douloureuse, plaie qui ne guérit pas) : oriente immédiatement vers les urgences médicales ou un dermatologue.
- Respect absolu : zéro jugement sur le passé cosmétique (décapage, crèmes éclaircissantes).

${KNOWLEDGE_DIGEST}

${ATLAS_DIGEST}`;
}

export const SYSTEM_PROMPT = buildDrKeneSystemPrompt(null);

/** Nettoyage d'affichage : texte brut garanti pour la bulle de chat et le TTS, avec garantie anti-coupure */
export function tidyReply(raw: string): string {
  let cleaned = raw
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/#{1,6}\s*/g, "")
    .replace(/^[•\-\*·]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  cleaned = cleaned.replace(/^(?:Dr\.?|Dermo)\s*K[èe]n[èe]\s*:\s*/i, "");

  // Préservation du tag [CHIPS: ...] pour l'interface utilisateur
  const chipsMatch = cleaned.match(/\[CHIPS:\s*([^\]]+)\]/i);
  let chipsTag = "";
  if (chipsMatch) {
    chipsTag = chipsMatch[0];
    cleaned = cleaned.replace(/\[CHIPS:\s*([^\]]+)\]/i, "").trim();
  }

  if (cleaned && !/[.!?…]$/.test(cleaned)) {
    const lastPunctuation = Math.max(
      cleaned.lastIndexOf("."),
      cleaned.lastIndexOf("!"),
      cleaned.lastIndexOf("?")
    );
    if (lastPunctuation > cleaned.length * 0.6) {
      cleaned = cleaned.slice(0, lastPunctuation + 1).trim();
    } else {
      cleaned = cleaned.replace(/[,;:\s]+$/, "") + ".";
    }
  }

  if (chipsTag) {
    cleaned = `${cleaned}\n\n${chipsTag}`;
  }

  return cleaned;
}

function getCandidateModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const models = [
    "gemini-2.5-flash",
    preferred && preferred.startsWith("gemini-") ? preferred : null,
    "gemini-3.5-flash",
  ].filter(Boolean) as string[];
  return Array.from(new Set(models));
}

/** Palier 1 : Google Gemini REST avec prompt système contextualisé et latence ultra-faible */
async function callGeminiChat(
  messages: ChatMessage[],
  systemPrompt: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const history = messages.slice(-16);
    const rawContents = history.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));

    while (rawContents.length > 0 && rawContents[0].role === "model") {
      rawContents.shift();
    }
    if (rawContents.length === 0) return null;

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
        const isThinkingModel = model.includes("2.5") || model.includes("3.");
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: systemPrompt }],
              },
              contents,
              generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 500,
                ...(isThinkingModel ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
            signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
          }
        );

        if (res.status === 429) {
          console.warn(`[kene:gemini-chat] Quota dépassé sur ${model} (429), test du modèle suivant...`);
          continue;
        }

        if (!res.ok) {
          console.warn(`[kene:gemini-chat] HTTP ${res.status} sur ${model}`);
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
async function callZaiChatSafe(
  messages: ChatMessage[],
  systemPrompt: string
): Promise<string | null> {
  try {
    const zai = await ZAI.create();
    const history = messages.slice(-16);
    const completion = await zaiCall(
      () =>
        zai.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            ...history.map((m) => ({ role: m.role, content: m.content })),
          ],
          thinking: { type: "disabled" },
        }),
      { label: "dermato:chat", timeoutMs: CHAT_TIMEOUT_MS, busyRetries: 1 }
    );
    const reply = completion.choices[0]?.message?.content;
    return reply ? tidyReply(reply) : null;
  } catch {
    return null;
  }
}

/**
 * Palier 3 : Moteur Expert Dermatologique Kènè autonome
 * Respecte rigoureusement la civilité (homme vs femme) et le prénom
 */
export function generateDrKeneKnowledgeReply(
  messages: ChatMessage[],
  userProfile?: UserProfileContext | null
): string {
  const userMessages = messages.filter((m) => m.role === "user");
  const lastMsg = userMessages[userMessages.length - 1]?.content || "";
  const text = lastMsg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const fullContext = userMessages.map((m) => m.content).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isMale = userProfile?.gender === "homme";
  const isFemale = userProfile?.gender === "femme";
  const name = userProfile?.name?.split(/\s+/)[0] || "";

  // Formules d'adresse dynamiques
  const addressFriend = isMale
    ? (name ? `cher ${name}` : "mon cher ami")
    : isFemale
    ? (name ? `chère ${name}` : "ma chère amie")
    : (name ? `cher/chère ${name}` : "cher ami");

  const addressSibling = isMale ? "mon cher frère" : isFemale ? "ma chère sœur" : "cher ami";

  // 1. DÉTECTION DES URGENCES & SIGNES ROUGES
  const isEmergency =
    /gonfl.*(visage|levr|gorg)|(visage|levr|gorg).*gonfl|etouff|oedeme|anaphylax/.test(text) ||
    /(mal|difficulte|gene|peine|bloque).*respir|respir.*(mal|difficile|bloque)/.test(text) ||
    /fievre.*(chaud|rouge|doulour|etend|gonfle|plaie)|(chaud|rouge|doulour|etend|gonfle|plaie).*fievre|cellulite|erysipele/.test(text) ||
    /purpura|ne s'efface pas|tache.*rouge.*appuie/.test(text) ||
    /plaie.*(mois|guerit pas|ne se referme pas)|ulcere/.test(text);

  if (isEmergency) {
    return (
      `Attention ${addressSibling}, ce que tu me décris là présente un vrai risque et demande un médecin sans attendre. ` +
      "S'il te plaît, n'applique aucun produit ni remède bizarre sur la peau. Si ton visage est enflé, que tu as du mal à respirer ou une grosse fièvre avec une rougeur qui brûle, " +
      `rends-toi tout de suite au service des urgences ou au centre de santé le plus proche. Ta vie et ta santé passent avant tout, prends grand soin de toi.`
    );
  }

  // 2. SALUTATIONS / ACCUEIL
  const isGreeting =
    /^(bonjour|bonsoir|salut|coucou|hello|bonjour dr|salut dr|dr kene|aide[- ]moi|qui es[- ]tu)/.test(text.trim()) &&
    text.length < 55;

  if (isGreeting) {
    return (
      `Bonjour ${addressFriend} et bienvenue ! C'est Dermo Kènè, ta conseillère beauté et bien-être ici à Abidjan. ` +
      `Dis-moi, qu'est-ce qui préoccupe ta peau en ce moment ? Raconte-moi tout tranquillement, je t'écoute avec attention 🌿.`
    );
  }

  // 2b. BOUTONS DE RASAGE / FOLLICULITE / BARBE (Spécifique Homme & Barbe)
  if (/rasage|barbe|poil.*incarn|bouton.*barbe|folliculite|apres[- ]rasage|rasoir/.test(text)) {
    return (
      "Les boutons et poils incarnés au niveau de la barbe (pseudofolliculite) sont très fréquents sur les poils crépus et bouclés : après le rasage, le poil se recourbe et pénètre sous la peau, créant inflammation et taches brunes. " +
      "Pour apaiser ta peau immédiatement : rase-toi toujours après une douche tiède avec un rasoir à une seule lame (ou une tondeuse de précision à 1 mm), toujours dans le sens de la pousse du poil. " +
      "Bannis absolument les après-rasages à base d'alcool qui brûlent et noircissent l'épiderme. Applique plutôt un sérum doux apaisant à la niacinamide ou à l'acide azélaïque, puis une noisette de pur gel d'aloka ou d'huile de balanites pour cicatriser."
    );
  }

  // 2c. PEAU ALBINOS (ALBINISME OCULO-CUTANÉ OCA)
  if (/albinos|albinisme|albino|achrom|keratose actinique/.test(text)) {
    return (
      "La peau albinos est une peau noire précieuse dont la génétique produit très peu ou pas d'eumélanine protectrice face au soleil d'Abidjan. " +
      "La règle numéro un vitale au quotidien, c'est d'appliquer un écran solaire SPF 50+ à large spectre toutes les deux heures sur le visage, les lèvres, les oreilles, le cou et les bras, complété par un chapeau à larges bords, des lunettes UV400 et des vêtements couvrants. " +
      "Côté soins, privilégie une douceur absolue avec un nettoyant sans savon, du pur beurre de karité brut, des céramides et du gel d'aloka frais, sans jamais utiliser d'acides exfoliants forts ni de gommage à grains. " +
      "Si tu observes une petite croûte rugueuse ou une tache qui ne guérit pas en trois semaines, consulte vite un médecin dermatologue."
    );
  }

  // 2d. PEAU AFRO-ROUSSE / ROUQUINE / RUFISME
  if (/rouquin|rousse|afro[- ]?rou|rufisme|ephelide|rousseur|pheomelanine/.test(text)) {
    return (
      "Le teint rouquin ou afro-roux est une magnifique particularité génétique de la peau noire où domine la phéomélanine, un pigment cuivré-doré accompagné souvent de jolies taches de rousseur et de cheveux aux reflets roux. " +
      "Comme la phéomélanine protège peu des rayons UV et crée un stress oxydatif au soleil, ta peau chauffe vite et réagit fortement à l'inflammation. " +
      "Chaque matin, protège ton éclat cuivré avec un sérum antioxydant doux à la vitamine C stabilisée ou à l'huile de moringa sous un écran solaire SPF 50+ obligatoire. " +
      "Le soir, apaise ta peau avec du gel d'aloka, de la niacinamide à 5 % et de l'huile de baobab, sans jamais chercher à décaper tes taches de rousseur naturelles."
    );
  }

  // 2e. PEAU MÉTISSÉE, CHABINE, TEINT CLAIR CARAMEL
  if (/metiss|chabin|teint clair|caramel|diversite.*teint|differentes teintes|spectre.*peau/.test(text)) {
    return (
      "La beauté noire embrasse tout un spectre de nuances allant des peaux albinos et afro-rousses aux teints chabins dorés, métissés caramel, bruns cuivrés et ébène intense. " +
      "Sur les peaux métissées, chabines et à teint clair caramel, les mélanocytes sont hyper-réactifs : le moindre bouton ou coup de soleil déclenche d'abord une rougeur puis une tache brune très contrastée ou un mélasma hormonal. " +
      "Pour garder un teint lumineux et uniforme sans démarcation entre le visage et le cou, adopte chaque matin un sérum à la vitamine C et niacinamide sous un fluide solaire SPF 50+, et le soir un soin doux à l'acide azélaïque et à l'huile sèche de moringa, sans jamais utiliser de crèmes décapantes."
    );
  }

  // 3. TACHES / HYPERPIGMENTATION (PIH) / MÉLASMA
  if (/tache|hyperpigment|melasma|masque.*grossesse|teint sombre|marqu/.test(text) || /tache|hyperpigment/.test(fullContext)) {
    // Si l'utilisateur n'a pas encore précisé la durée ni ses produits (Étape 1 de l'anamnèse)
    const hasDetails = /mois|semaine|an|depuis|savon|creme|pommade|routine/.test(fullContext);
    if (!hasDetails) {
      return (
        `Yako ${addressFriend} pour ces taches. Sur notre peau mélanoderme, la moindre inflammation ou frottement stimule la mélanine et laisse une marque sombre tenace.\n\n` +
        `Pour que je te construise la routine la plus efficace : **depuis combien de temps ces taches sont-elles apparues, et qu'appliques-tu actuellement sur ton visage (savon, crèmes) ?**\n` +
        `N'hésite pas aussi à m'envoyer une photo nette de la zone avec l'icône 📷.\n\n` +
        `[CHIPS: Moins d'un mois | Depuis longtemps | Savon doux & crème | Produits éclaircissants]`
      );
    }
    return (
      `Yako ${addressFriend} pour ta patience. Voici ton protocole dermo-conseil complet pour atténuer ces taches en toute sécurité :\n\n` +
      `☀️ **Le Matin :** Nettoyage doux au gel physiologique, sérum unifiant à la vitamine C stabilisée ou niacinamide 5%, puis fluide solaire invisible SPF 50+ impératif pour bloquer l'oxydation de la mélanine.\n` +
      `🌙 **Le Soir :** Démaquillage à l'huile végétale douce (jojoba ou balanites), soin apaisant à l'acide azélaïque, puis une touche de beurre de karité brut pour régénérer la barrière cutanée.\n` +
      `🚫 **À bannir :** Tout gommage à gros grains abrasifs et toute crème décapante qui provoquent un rebond pigmentaire pire.\n\n` +
      `[CHIPS: Prendre RDV en institut | Commander les soins | Poser une autre question]`
    );
  }

  // 4. ACNÉ / BOUTONS / EXCÈS DE SÉBUM / PORES DILATÉS
  if (/acne|bouton|sebum|brill|gras|point.*noir|pore|comedon/.test(text)) {
    const hasDetails = /mois|semaine|an|depuis|savon|creme|mal|gratt|douleur/.test(fullContext);
    if (!hasDetails) {
      return (
        `Avec la chaleur et l'humidité d'ici, les pores s'obstruent facilement et favorisent les imperfections.\n\n` +
        `Pour t'aider au mieux : **depuis quand as-tu ces boutons, et est-ce qu'ils te font mal ou te démangent au toucher ?**\n` +
        `Tu peux aussi me partager une photo de la zone en appuyant sur 📷 pour que j'analyse l'inflammation.\n\n` +
        `[CHIPS: Moins d'1 mois | Depuis longtemps | Ça gratte / fait mal | Aucune douleur]`
      );
    }
    return (
      `Merci pour ces précisions ${addressFriend}. Voici ton protocole purifiant ciblé pour assainir ta peau sans la dessécher :\n\n` +
      `☀️ **Le Matin :** Nettoyage avec un gel doux moussant sans savon au moringa ou zinc, hydratation fluide non-comédogène (aloka ou moringa léger) et fluide solaire matifiant SPF 50+.\n` +
      `🌙 **Le Soir :** Double nettoyage doux, application locale de niacinamide ou acide azélaïque pour calmer l'inflammation et stopper l'apparition de taches sombres.\n` +
      `🚫 **À bannir :** Ne jamais percer ni gratter les boutons avec les ongles (risque majeur de cicatrice noire creusée).\n\n` +
      `[CHIPS: Prendre RDV en institut | Commander les soins | Poser une autre question]`
    );
  }

  // 5. SAVON / NETTOYANT
  if (/savon|nettoyant|gel lavant|pain dermatologique|syndet/.test(text)) {
    return (
      "Pour le visage, évite absolument les savons décapants ordinaires qui assèchent et créent une hypersécrétion de sébum réactionnelle. " +
      "Choisis un pain dermatologique surgras sans savon (syndet) ou un gel moussant doux au pH physiologique. " +
      "Lave-toi à l'eau tiède sans frotter fort avec un gant rugueux. Tu peux retrouver d'excellents nettoyants doux certifiés dans l'onglet Boutique de l'application."
    );
  }

  // 6. DÉPIGMENTATION VOLONTAIRE / DÉCAPAGE
  if (/depigment|decap|eclaircis|tchatcho|hydroquinone|cortico|clobetasol|abim|brul/.test(text)) {
    return (
      `Yako du fond du cœur ${addressFriend}, et merci pour ta confiance. Ici tu es chez toi, zéro honte et zéro jugement : on répare ta peau ensemble pas à pas. ` +
      "Quand on arrête les produits décapants, la peau peut chauffer ou tirailler, c'est l'étape normale de sevrage et de reconstruction. " +
      "Nourris-la matin et soir avec du pur beurre de karité brut non raffiné et de l'huile de baobab pour reconstituer la barrière lipidique. " +
      "Protège-toi impérativement du soleil avec un écran SPF 50+, et viens faire le point en institut partenaire Kènè pour un protocole apaisant."
    );
  }

  // 7. PEAU SÈCHE / TIRAILLEMENTS / HARMATTAN
  if (/sech|seche|tirail|deshydrat|pele|harmattan|rugueu|cendre/.test(text)) {
    return (
      "Avec l'harmattan ou la climatisation, notre peau mélanoderme perd rapidement son eau et prend un reflet gris cendré. " +
      "Pour retrouver un confort immédiat, lave-toi à l'eau tiède et, dès la sortie de la douche pendant que ta peau est encore humide, scelle cette hydratation avec une noisette de pur beurre de karité tiédi dans tes mains ou de l'huile de baobab. " +
      "Bois aussi beaucoup d'eau dans la journée, et tu verras ton teint retrouver tout son éclat naturel."
    );
  }

  // 8. INSTITUTS & RDV CABINE
  if (/institut|rendez[- ]vous|rdv|soin|cabine|reserver|reservation|dermo|adresse|cabinet/.test(text)) {
    return (
      "Tu peux échanger directement par WhatsApp avec ton institut partenaire certifié Kènè pour convenir d'un rendez-vous cabine personnalisé. " +
      "Les praticiennes certifiées connaissent parfaitement la physiologie des peaux mélanodermes et adaptent chaque protocole sans agresser la peau. " +
      "Rends-toi dans ton Profil ou dans l'onglet Agenda pour choisir ton institut favori et lui transmettre ton bilan cutané 🌿."
    );
  }

  // 9. PRIX / BOUTIQUE
  if (/prix|tarif|combien|acheter|commander|produit|boutique|creme|serum/.test(text)) {
    return (
      "Pour commander nos soins dermo-cosmétiques formulés spécialement pour la peau mélanoderme, tu peux commander directement via l'onglet Boutique ou auprès de ton institut partenaire certifié via WhatsApp. " +
      "Chaque routine est validée sur-mesure d'après ton diagnostic de peau, avec livraison soignée à Abidjan et partout en Côte d'Ivoire. " +
      "Dis-moi ce que tu recherches exactement et je te guide vers le meilleur soin pour ton teint 🌿."
    );
  }

  // 10. BOTANIQUES AFRICAINES
  if (/karite|moringa|baobab|bissap|aloka|plante|naturel|botanique/.test(text)) {
    return (
      "Nos plantes africaines sont de véritables trésors pour la peau mélanoderme : " +
      "le vrai beurre de karité brut répare la barrière cutanée, l'huile de moringa nourrit sans graisser, " +
      "l'huile de balanites régule le sébum et cicatrise, et le gel d'aloka apaise immédiatement le feu du soleil. " +
      "Ce sont des actifs purs et performants lorsqu'ils sont appliqués avec régularité."
    );
  }

  // ROUTINE PAR DÉFAUT
  return (
    `Pour prendre soin de ta peau avec amour et efficacité, voici la règle d'or pour nous à Abidjan : ` +
    "un nettoyage doux sans savon matin et soir, une bonne hydratation avec un soin léger ou quelques gouttes d'huile végétale pure, " +
    "et un écran solaire SPF 50 tous les matins pour te protéger du rayonnement intense. " +
    "Dis-moi ce qui préoccupe ta peau en ce moment, et on avance ensemble pas à pas 🌿."
  );
}

/** Retranscrit un audio oral en texte brut français via Gemini STT (avec fallback ZAI) */
async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  let cleanMime = (mimeType || "").split(";")[0]?.trim().toLowerCase();
  if (!cleanMime || !cleanMime.startsWith("audio/")) cleanMime = "audio/wav";

  // 1. Palier 1 : Google Gemini
  if (apiKey) {
    const models = getCandidateModels();

    for (const model of models) {
      try {
        const isThinkingModel = model.includes("2.5") || model.includes("3.");
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
                        "Tu es un transcripteur professionnel en français (Afrique de l'Ouest / Côte d'Ivoire). " +
                        "Écoute attentivement cet enregistrement audio et retranscris MOT À MOT l'intégralité des paroles prononcées. " +
                        "RÈGLES STRICTES :\n" +
                        "- Transcris uniquement les mots prononcés, sans AUCUN commentaire, sans guillemets, sans formule d'introduction.\n" +
                        "- Ne réponds pas à la question posée dans l'audio, ton seul rôle est de transcrire.\n" +
                        "- Si l'enregistrement est totalement silencieux ou inaudible, réponds UNIQUEMENT par le mot : SILENCE.",
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.0,
                maxOutputTokens: 500,
                ...(isThinkingModel ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
            signal: AbortSignal.timeout(7_000),
          }
        );

        if (!res.ok) {
          console.warn(`[kene:transcribe] HTTP ${res.status} sur ${model}`);
          continue;
        }

        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleaned = rawText.trim();

        if (
          !cleaned ||
          /^silence[\s.]*$/i.test(cleaned) ||
          /^(inaudible|aucun son|vide)[\s.]*$/i.test(cleaned) ||
          cleaned.toLowerCase().includes("retranscris avec une fidélité")
        ) {
          return "";
        }

        const finalTranscription = cleaned.replace(/^["'«»“]+|["'«»”]+$/g, "").trim();
        if (finalTranscription) {
          return finalTranscription;
        }
      } catch (err) {
        console.warn(`[kene:transcribe] Échec sur ${model}:`, (err as Error).message);
      }
    }
  }

  // 2. Palier 2 : Fallback Z.ai SDK ASR
  try {
    const zai = await ZAI.create();
    const buf = Buffer.from(audioBase64, "base64");
    const r = await zaiCall(
      () => zai.audio.asr.create({ file_base64: buf.toString("base64") }),
      { label: "asr:fallback", timeoutMs: 20_000, busyRetries: 1 }
    );
    if (r?.text) {
      const text = r.text.trim();
      if (!/^(silence|inaudible)[\s.]*$/i.test(text)) {
        return text;
      }
    }
  } catch (err) {
    console.warn("[kene:transcribe:zai] Fallback ZAI échoué:", err);
  }

  return "";
}

/** Traitement d'une note vocale pour Dr. Kènè avec profil et civilité adaptés */
export async function getDrKeneAudioReply(
  audioBase64: string,
  mimeType: string = "audio/wav",
  history: ChatMessage[] = [],
  userProfileOrId?: string | UserProfileContext | null
): Promise<DrKeneAudioResponse> {
  const profile = await resolveUserProfile(userProfileOrId);

  // 1. Retranscription fidèle de la note vocale
  const transcription = await transcribeAudio(audioBase64, mimeType);

  // Cas 1 : Audio silencieux ou non audible
  if (!transcription) {
    const isMale = profile?.gender === "homme";
    const name = profile?.name?.split(/\s+/)[0] || "";
    const greeting = isMale
      ? (name ? `Pardon ${name}` : "Pardon cher ami")
      : (name ? `Pardon ${name}` : "Pardon chère amie");

    return {
      transcription: "",
      reply:
        `${greeting}, je n'ai pas bien entendu ta note vocale ou c'était un peu trop silencieux. Tu peux me la réenregistrer en parlant bien près du micro ou m'écrire ton message directement ? Je t'écoute avec attention 🌿 !`,
    };
  }

  // Cas 2 : Parole reconnue avec succès
  const cleanHistory = history
    .filter((m) => !/^Note vocale\s*\(/i.test(m.content))
    .slice(-10);

  const fullConversation: ChatMessage[] = [
    ...cleanHistory,
    { role: "user", content: transcription },
  ];

  const reply = await getDrKeneReply(fullConversation, profile);

  return {
    transcription,
    reply,
  };
}

/** Orchestrateur principal Dr Kènè avec injection du profil utilisateur */
export async function getDrKeneReply(
  messages: ChatMessage[],
  userProfileOrId?: string | UserProfileContext | null
): Promise<string> {
  const profile = await resolveUserProfile(userProfileOrId);
  const systemPrompt = buildDrKeneSystemPrompt(profile);

  // Palier 1 : Google Gemini REST
  try {
    const geminiReply = await callGeminiChat(messages, systemPrompt);
    if (geminiReply) return geminiReply;
  } catch (err) {
    console.warn("[kene:chat] Palier Gemini en échec, bascule sur les paliers suivants :", err);
  }

  // Palier 2 : Z.ai SDK
  try {
    const zaiReply = await callZaiChatSafe(messages, systemPrompt);
    if (zaiReply) return zaiReply;
  } catch (err) {
    console.warn("[kene:chat] Palier ZAI en échec, bascule sur le moteur expert :", err);
  }

  // Palier 3 : Moteur Expert Dermatologique Kènè autonome
  return generateDrKeneKnowledgeReply(messages, profile);
}
