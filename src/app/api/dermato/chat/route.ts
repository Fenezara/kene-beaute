// POST /api/dermato/chat — chat dermatologique Dr Kènè (peaux mélanodermes)
// Supporte à la fois les messages textuels et les notes vocales directes (audio multimodal).
// GET /api/dermato/chat?_g=… — pont GET (même payload JSON en query)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DERMATO } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import {
  getDrKeneReply,
  getDrKeneAudioReply,
  generateDrKeneKnowledgeReply,
} from "@/lib/ai/dr-kene-chat";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(40)
    .optional(),
  userId: z.string().optional(),
  audio: z.string().min(1).max(7 * 1024 * 1024).optional(), // audio en base64 pour note vocale directe
  mimeType: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "dermato:chat"), DERMATO);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      "Dr. Kènè est très sollicitée — reprends dans quelques secondes",
    );
  }
  let parsedData: z.infer<typeof Body> | undefined;
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("messages ou audio requis", 400);
    parsedData = parsed.data;
    if (!parsedData.audio && (!parsedData.messages || parsedData.messages.length === 0)) {
      return jsonError("messages ou audio requis", 400);
    }
    return await runChat(parsedData);
  } catch (err) {
    return chatFallbackResponse(err, parsedData);
  }
}

// Pont GET — voir src/lib/kene/get-bridge.ts
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "dermato:chat"), DERMATO);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      "Dr. Kènè est très sollicitée — reprends dans quelques secondes",
    );
  }
  let parsedData: z.infer<typeof Body> | undefined;
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`messages ou audio requis — ${bridged.error}`, 400);
    parsedData = bridged.data;
    if (!parsedData.audio && (!parsedData.messages || parsedData.messages.length === 0)) {
      return jsonError("messages ou audio requis", 400);
    }
    return await runChat(bridged.data);
  } catch (err) {
    return chatFallbackResponse(err, parsedData);
  }
}

/** Cœur partagé POST/GET : traitement texte ou audio direct pour Dr. Kènè */
async function runChat(parsed: z.infer<typeof Body>): Promise<NextResponse> {
  // Cas 1 : Note vocale directe (l'audio est envoyé directement à Dr. Kènè)
  if (parsed.audio) {
    const audioResult = await getDrKeneAudioReply(
      parsed.audio,
      parsed.mimeType || "audio/wav",
      parsed.messages ?? [],
      parsed.userId,
    );
    return NextResponse.json({
      reply: audioResult.reply,
      transcription: audioResult.transcription,
    });
  }

  // Cas 2 : Message texte standard
  const messages = parsed.messages ?? [{ role: "user", content: "Bonjour Dr. Kènè" }];
  const reply = await getDrKeneReply(messages, parsed.userId);
  return NextResponse.json({ reply });
}

/** Filet de sécurité absolu */
function chatFallbackResponse(err: unknown, parsed?: z.infer<typeof Body>): NextResponse {
  console.warn(
    "[kene:api:dermato/chat] Bascule sur le filet de sécurité expert :",
    err instanceof Error ? err.message : err,
  );
  const reply = generateDrKeneKnowledgeReply(
    parsed?.messages ?? [{ role: "user", content: "conseil" }],
    parsed?.userId,
  );
  return NextResponse.json({ reply });
}
