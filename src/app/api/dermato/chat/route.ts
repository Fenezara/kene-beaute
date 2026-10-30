// POST /api/dermato/chat — chat dermatologique Dr Kènè (peaux mélanodermes)
// Supporte à la fois les messages textuels et les notes vocales directes (audio multimodal).
// GET /api/dermato/chat?_g=… — pont GET (même payload JSON en query)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DERMATO } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { voiceQuotaFor } from "@/lib/kene/plans";
import { audit } from "@/lib/kene/audit";
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
  userName: z.string().max(100).optional(),
  userGender: z.enum(["femme", "homme", "non_precise"]).optional(),
  audio: z.string().min(1).max(15 * 1024 * 1024).optional(), // audio en base64 pour note vocale directe (jusqu'à 15 Mo)
  mimeType: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "dermato:chat"), DERMATO);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      "Dermo Kènè est très sollicitée — reprends dans quelques secondes",
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
      "Dermo Kènè est très sollicitée — reprends dans quelques secondes",
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

/** Cœur partagé POST/GET : traitement texte ou audio direct pour Dermo Kènè */
async function runChat(parsed: z.infer<typeof Body>): Promise<NextResponse> {
  const profileOrId = {
    id: parsed.userId || undefined,
    name: parsed.userName || undefined,
    gender: parsed.userGender || "non_precise",
  };

  // Cas 1 : Note vocale directe (l'audio est envoyé directement à Dermo Kènè)
  if (parsed.audio) {
    if (parsed.userId) {
      const vQuota = await voiceQuotaFor(parsed.userId);
      if (vQuota.remaining <= 0) {
        return NextResponse.json(
          {
            error: "Tu as utilisé tes 5 consultations vocales gratuites ce mois-ci avec l'Orbe 3D. Active Kènè+ (2 500 FCFA/mois) pour des échanges vocaux illimités 24h/24, ou écris-moi en texte !",
            quotaExceeded: true,
            quota: vQuota,
          },
          { status: 403 },
        );
      }
      void audit({ kind: "orbe_voice", userId: parsed.userId });
    }

    const audioResult = await getDrKeneAudioReply(
      parsed.audio,
      parsed.mimeType || "audio/wav",
      parsed.messages ?? [],
      profileOrId,
    );
    return NextResponse.json({
      reply: audioResult.reply,
      transcription: audioResult.transcription,
    });
  }

  // Cas 2 : Message texte standard
  const messages = parsed.messages ?? [{ role: "user", content: "Bonjour Dermo Kènè" }];
  const reply = await getDrKeneReply(messages, profileOrId);
  return NextResponse.json({ reply });
}

/** Filet de sécurité absolu */
function chatFallbackResponse(err: unknown, parsed?: z.infer<typeof Body>): NextResponse {
  console.warn(
    "[kene:api:dermato/chat] Bascule sur le filet de sécurité expert :",
    err instanceof Error ? err.message : err,
  );
  const fallbackProfile = {
    id: parsed?.userId || undefined,
    name: parsed?.userName || undefined,
    gender: parsed?.userGender || "non_precise",
  };
  const reply = generateDrKeneKnowledgeReply(
    parsed?.messages ?? [{ role: "user", content: "conseil" }],
    fallbackProfile,
  );
  return NextResponse.json({ reply });
}
