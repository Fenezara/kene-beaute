// Kènè — POST /api/asr: transcription vocale multi-paliers (Zero-Failure Architecture).
//
// 1. Palier 1 : Google Gemini Multimodal Audio STT (si GEMINI_API_KEY défini)
//    - Reçoit l'audio en base64 (WAV, WebM, MP4, OGG, etc.) via inlineData
//    - Modèle haute fidélité en français pour l'Afrique de l'Ouest
// 2. Palier 2 : Z.ai SDK ASR (si .z-ai-config présent)
// 3. Palier 3 : Détection silence / audio inaudible -> réponse propre { text: "" } sans crash 502
//
// Garde temporelle: 25 s (maxDuration 30).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, rlKey, rateLimitResponse, ASR } from "@/lib/kene/rate-limit";
import { zaiCall, UpstreamBusyError } from "@/lib/ai/zai-retry";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // ~5 Mo décodés (12 s d'opus ≈ 40 Ko: très large)
const ASR_TIMEOUT_MS = 25_000;

// Base64 d'un payload de 5 Mo ≈ 6,99 M caractères (4/3 par octet).
const Body = z.object({
  audio: z.string().min(1).max(Math.ceil(MAX_BYTES / 3) * 4),
  mimeType: z.string().max(80).optional(),
});

/** Nettoyage d'affichage de la transcription : texte brut mot à mot */
function cleanTranscriptionText(raw: string): string {
  const cleaned = raw
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/^["'«»“]+|["'«»”]+$/g, "")
    .trim();

  // Si le modèle a transcrit mot pour mot "silence" ou n'a détecté aucune parole
  if (
    /^(silence|inaudible|vide|aucun son)[\s.]*$/i.test(cleaned) ||
    cleaned.toLowerCase().includes("retranscris") ||
    cleaned.toLowerCase().includes("aucun son")
  ) {
    return "";
  }
  return cleaned;
}

/** Palier 1 : Google Gemini Multimodal Audio */
async function callGeminiAsr(buf: Buffer, mimeType?: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model =
    process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== "gemini-1.5-flash"
      ? process.env.GEMINI_MODEL
      : "gemini-2.5-flash";

  // Normalisation du mimeType pour Gemini (ex: "audio/webm;codecs=opus" -> "audio/webm")
  let cleanMime = (mimeType || "").split(";")[0]?.trim().toLowerCase();
  if (!cleanMime || !cleanMime.startsWith("audio/")) {
    cleanMime = "audio/wav";
  }

  const base64Audio = buf.toString("base64");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "Tu es un système de transcription automatique de la parole (Speech-to-Text / ASR) en français pour des utilisateurs en Côte d'Ivoire et Afrique de l'Ouest. " +
                "Ton rôle est de retranscrire avec exactitude, mot à mot, ce qui est prononcé dans l'enregistrement audio. " +
                "N'ajoute AUCUN commentaire, AUCUNE formule de politesse, AUCUNE explication, AUCUN guillemet, AUCUN tiret. " +
                "Si l'enregistrement ne contient que du silence, un bruit de fond sans parole ou est inaudible, réponds UNIQUEMENT par : SILENCE.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: cleanMime,
                  data: base64Audio,
                },
              },
              {
                text: "Écoute cet enregistrement et retranscris mot à mot ce qui est prononcé en français. Si silencieux, réponds SILENCE.",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 1000,
        },
      }),
      signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(`[kene:api:asr:gemini] HTTP ${res.status}: ${errText.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return cleanTranscriptionText(raw);
}

/** Palier 2 : Z.ai SDK (si configuré) */
async function callZaiAsr(buf: Buffer): Promise<string | null> {
  try {
    const zai = await ZAI.create();
    const r = await zaiCall(
      () => zai.audio.asr.create({ file_base64: buf.toString("base64") }),
      { label: "asr:transcription", timeoutMs: ASR_TIMEOUT_MS, busyRetries: 1 },
    );
    const text = typeof r?.text === "string" ? cleanTranscriptionText(r.text) : "";
    return text;
  } catch (err) {
    console.warn("[kene:api:asr:zai]", (err as Error).message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  // Bucket dédié micro-chat: 10/min — une conversation parlée humaine ≪.
  const rl = rateLimit(rlKey(req, "asr"), ASR);
  if (!rl.ok) {
    return rateLimitResponse(
      rl.retryAfterSec,
      "Transcription très sollicitée — reprends dans quelques secondes",
    );
  }

  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.[0];
      if (field === "audio") {
        const tooBig = issue?.code === "too_big";
        return NextResponse.json(
          { error: tooBig ? "Enregistrement trop volumineux (max 5 Mo)" : "Audio requis" },
          { status: tooBig ? 413 : 400 },
        );
      }
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    // Décodage base64
    const buf = Buffer.from(parsed.data.audio, "base64");
    if (buf.length < 100) {
      return NextResponse.json(
        { error: "Audio illisible — réenregistre ton message" },
        { status: 400 },
      );
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "Enregistrement trop volumineux (max 5 Mo)" },
        { status: 413 },
      );
    }

    // 1. Palier 1 : Google Gemini Multimodal Audio
    let text = await callGeminiAsr(buf, parsed.data.mimeType);

    // 2. Palier 2 : Z.ai SDK fallback si Gemini n'a rien renvoyé
    if (text === null) {
      text = await callZaiAsr(buf);
    }

    // 3. Si aucun moteur n'est disponible ou les deux ont échoué
    if (text === null) {
      console.error("[kene:api:asr] Tous les paliers ASR ont échoué");
      return NextResponse.json(
        { error: "Transcription temporairement indisponible — réessaie dans un instant" },
        { status: 502 },
      );
    }

    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof UpstreamBusyError) {
      return NextResponse.json(
        { error: "Transcription très sollicitée — réessaie dans quelques secondes" },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/status 400|Audio format/i.test(msg)) {
      return NextResponse.json(
        { error: "Audio illisible — réenregistre ton message" },
        { status: 400 },
      );
    }
    console.error("[kene:api:asr]", e);
    return NextResponse.json(
      { error: "Transcription indisponible — réessaie dans un instant" },
      { status: 502 },
    );
  }
}
