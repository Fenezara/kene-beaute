// POST /api/dermato/chat — chat LLM dermatologique (peaux mélanodermes)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DERMATO } from "@/lib/kene/rate-limit";
import { withTimeout, TimeoutError } from "@/lib/kene/with-timeout";
import { KNOWLEDGE_DIGEST } from "@/lib/kene/knowledge";
import { ATLAS_DIGEST } from "@/lib/kene/conditions";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Garde temporelle : un LLM qui hang répond 502 FR au lieu de laisser la
 *  conversation cliente en attente indéfinie. */
const CHAT_TIMEOUT_MS = 30_000;

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
    const history = parsed.data.messages.slice(-20);

    const zai = await ZAI.create();
    const completion = await withTimeout(
      zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ],
        thinking: { type: "disabled" },
      }),
      CHAT_TIMEOUT_MS,
      "dermato:chat",
    );
    const reply = completion.choices[0]?.message?.content;
    if (!reply) return jsonError("Assistant momentanément indisponible", 502);

    return NextResponse.json({ reply });
  } catch (err) {
    if (err instanceof TimeoutError) return jsonError("Assistant momentanément indisponible", 502);
    console.error("[kene:api:dermato/chat]", err instanceof Error ? err.message : err);
    return serverError("dermato/chat", err);
  }
}
