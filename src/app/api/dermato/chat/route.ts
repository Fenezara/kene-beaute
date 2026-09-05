// POST /api/dermato/chat — chat LLM dermatologique (peaux mélanodermes)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DERMATO } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1)
    .max(40),
  userId: z.string().optional(),
});

const SYSTEM_PROMPT =
  "Tu es l'assistante dermatologique Kènè, éducatrice cutanée pour peaux mélanodermes africaines (Fitzpatrick IV-VI). Tu réponds en français chaleureux, tu éduques (PIH, mélasma, acné, keloids, DPN), tu recommandes des botaniques africains (karité, moringa, baobab, bissap, aloka/aloès, néré), tu ne prescris JAMAIS de médicament ni corticoïde, tu orientes vers un dermatologue en cas de gravité et vers un RDV en institut partenaire via l'app Kènè. Réponses courtes (max 150 mots), 1 ou 2 emojis maximum.";

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
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
      thinking: { type: "disabled" },
    });
    const reply = completion.choices[0]?.message?.content;
    if (!reply) return jsonError("Assistant momentanément indisponible", 502);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[kene:api:dermato/chat]", err instanceof Error ? err.message : err);
    return serverError("dermato/chat", err);
  }
}
