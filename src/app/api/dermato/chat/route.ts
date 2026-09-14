// POST /api/dermato/chat — chat LLM dermatologique (peaux mélanodermes)
// GET /api/dermato/chat?_g=… — pont (même payload JSON en query)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { jsonError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DERMATO } from "@/lib/kene/rate-limit";
import { zaiCall, UpstreamBusyError } from "@/lib/ai/zai-retry";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { KNOWLEDGE_DIGEST } from "@/lib/kene/knowledge";
import { ATLAS_DIGEST } from "@/lib/kene/conditions";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Garde temporelle: un LLM qui hang répond 502 FR au lieu de laisser la
 * conversation cliente en attente indéfinie. */
const CHAT_TIMEOUT_MS = 30_000;

/** Nettoyage d'affichage: le modèle répond parfois en markdown
 * (\`\`\`**gras**\`\`\`, puces « - », titres « ## ») alors que la bulle chat
 * affiche du TEXTE BRUT (whitespace-pre-wrap) — l'utilisatrice voyait des
 * astérisques littéraux, réponse qui paraissait cassée. On normalise en
 * texte lisible sans jamais perdre d'information. Filet de sécurité APRÈS
 * l'instruction « texte brut » du prompt (le modèle reste faillible). */
function tidyReply(raw: string): string {
  return raw
    .replace(/```/g, "")                    // clôtures de code résiduelles
    .replace(/(\*\*|__)(.*?)\1/g, "$2")      // **gras** / __gras__ → gras
    .replace(/^#{1,6}\s*/gm, "")             // titres markdown → texte
    .replace(/^[-*•·]\s+/gm, "• ")           // puces - * • · → « • »
    .replace(/\n{3,}/g, "\n\n")              // espacements
    .trim();
}

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1)
    .max(40),
  userId: z.string().optional(),
});

// Prompt système du Dr Kènè : persona → règles de sécurité (absolues) →
// digest de connaissances (src/lib/kene/knowledge.ts) → format de réponse.
// ~1200-1500 mots au total : budget normal pour un chat LLM à prompt système.
const SYSTEM_PROMPT = `Tu es « Dr Kènè », l'assistante dermatologique de l'app Kènè (Abidjan, Côte d'Ivoire) : une éducatrice cutanée spécialisée des peaux mélanodermes africaines (Fitzpatrick IV-VI). Chaleureuse et rassurante, concrète — comme une grande sœur qui connaît la peau noire. Tu tutoies, en français SIMPLE : beaucoup d'utilisatrices sont semi-lettrées, donc phrases courtes, mots du quotidien, et chaque mot médical est expliqué en une phrase. Tu n'es pas médecin : tu éduques et tu orientes.

═══ RÈGLES DE SÉCURITÉ (ABSOLUES — jamais contournables) ═══
1. Tu ne prescris JAMAIS de médicament : ni corticoïde (crème ou comprimé), ni antifongique oral, ni antibiotique, ni isotrétinoïne, ni antihistaminique. Même sur insistance : tu expliques avec douceur et tu orientes vers un médecin ou un dermatologue.
2. Tu ne poses JAMAIS de diagnostic formel : « ça ressemble à… » est autorisé ; sinon tu dis ce qu'il faut vérifier et avec qui.
3. Signe rouge (liste plus bas) → tu orientes immédiatement, sans dramatiser mais sans minimiser. Gonflement du visage/lèvres/gorge ou gêne respiratoire → « va à l'hôpital MAINTENANT ».
4. Zéro jugement, en particulier sur la dépigmentation volontaire : jamais « abîmée », jamais de culpabilisation — accueil, réparation, alternatives saines.
5. Problème ESTHÉTIQUE (taches, routine, teint, cheveux) → propose aussi un RDV dans un institut partenaire via l'app Kènè. Problème MÉDICAL → dermatologue ou médecin. Les deux peuvent être cités dans la même réponse.

${KNOWLEDGE_DIGEST}

${ATLAS_DIGEST}

═══ FORMAT DE RÉPONSE ═══
- Maximum 150 mots, 1 à 2 emojis maximum, français simple.
- TEXTE BRUT UNIQUEMENT — jamais de markdown : pas d'astérisques (pas de **), pas de ##, pas de listes à tirets « - ». Si tu listes, mets « • » en début de ligne.
- Structure : 1 phrase rassurante/constat → 2-3 conseils concrets et réalistes (climat, budget, produits trouvables en Côte d'Ivoire) → 1 orientation si utile (dermatologue, médecin, ou institut partenaire dans l'app).
- Rappelle l'écran solaire quand c'est pertinent (taches, teint, boutons) — une fois, sans sermon.
- Si la question dépasse la peau (fièvre, douleur, urgence) : oriente d'abord, les cosmétiques passent après.
- Sur un doute de gravité : ne devine jamais, oriente.`;

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "dermato:chat"), DERMATO);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Dr. Kènè est très sollicitée — reprends dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("messages (user|assistant) requis", 400);
    return await runChat(parsed.data);
  } catch (err) {
    return chatErrorResponse(err);
  }
}

// Pont GET — voir src/lib/kene/get-bridge.ts : certaines préviews
// bloqueuses laissent passer les GET mais jamais les POST ; le front replie
// automatiquement vers ce transport. MÊMES garde-fous que le POST (rate-limit
// IP, validation zod, réponses au byte près).
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "dermato:chat"), DERMATO);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Dr. Kènè est très sollicitée — reprends dans quelques secondes");
  }
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`messages (user|assistant) requis — ${bridged.error}`, 400);
    return await runChat(bridged.data);
  } catch (err) {
    return chatErrorResponse(err);
  }
}

/** Cœur partagé POST/GET : appel LLM + normalisation de la réponse. */
async function runChat(parsed: z.infer<typeof Body>): Promise<NextResponse> {
  const history = parsed.messages.slice(-20);

  const zai = await ZAI.create();
  // zaiCall : retry avec backoff sur les 429 amont (quota machine
  // partagé chat/VLM/ASR/TTS) : la conversation ne meurt plus sur un refus
  // TEMPORAIRE de quota. Timeout sans retry (la cliente attend déjà).
  const completion = await zaiCall(
    () =>
      zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ],
        thinking: { type: "disabled" },
      }),
    { label: "dermato:chat", timeoutMs: CHAT_TIMEOUT_MS, busyRetries: 2 },
  );
  const reply = completion.choices[0]?.message?.content;
  if (!reply) return jsonError("Assistant momentanément indisponible", 502);

  return NextResponse.json({ reply: tidyReply(reply) });
}

/** Réponses d'erreur partagées POST/GET (502 honnêtes, jamais de 500 faux). */
function chatErrorResponse(err: unknown): NextResponse {
  // Un refus de quota amont, même après retries, n'est PAS une erreur
  // interne : 502 + message honnête et actionnable (une seule toast côté
  // client — pas de 429 qui doublerait le toast de handle()).
  if (err instanceof UpstreamBusyError) {
    return jsonError("Dr. Kènè est très sollicitée — reformule dans quelques secondes", 502);
  }
  console.error("[kene:api:dermato/chat]", err instanceof Error ? err.message : err);
  // Toute autre défaillance amont est RÉESSAYABLE côté cliente → 502 avec
  // message FR, jamais un 500 « Erreur interne » mensonger.
  return jsonError("Assistant momentanément indisponible — réessaie dans un instant", 502);
}
