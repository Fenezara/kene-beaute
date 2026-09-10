// Kènè — POST /api/asr : transcription vocale (ASR z-ai-web-dev-sdk, backend only).
// Entrée { audio: base64 (webm/opus enregistré côté client, ~≤5 Mo décodé),
//          mimeType? (informatif — le moteur détecte le format lui-même) }
// → { text: string } (transcription trimée ; "" si silence).
//
// FORMAT (constaté sur le moteur, 2026-09) : SEULS WAV et WebM sont acceptés
// (« Audio format conversion failed: unsupported audio format: unknown,
//   only WAV and WebM are supported » en erreur amont). MediaRecorder produit
// du webm/opus sur Chrome/Android/Firefox → envoyé tel quel ; Safari enregistre
// en mp4/aac, ré-encodé en WAV mono côté CLIENT avant l'envoi (ChatScreen,
// helper toAsrBlob). Un audio dans un autre format remonte en 400 propre.
//
// Garde temporelle : 25 s (maxDuration 30) — un moteur qui hang répond 502 FR.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, rlKey, rateLimitResponse, ASR } from "@/lib/kene/rate-limit";
import { zaiCall, UpstreamBusyError } from "@/lib/ai/zai-retry";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // ~5 Mo décodés (12 s d'opus ≈ 40 Ko : très large)
const ASR_TIMEOUT_MS = 25_000;
// Base64 d'un payload de 5 Mo ≈ 6,99 M caractères (4/3 par octet).
const Body = z.object({
  audio: z.string().min(1).max(Math.ceil(MAX_BYTES / 3) * 4),
  mimeType: z.string().max(60).optional(), // accepté pour traçabilité, non transmis
});

export async function POST(req: NextRequest) {
  // Bucket dédié micro-chat : 10/min — une conversation parlée humaine ≪.
  const rl = rateLimit(rlKey(req, "asr"), ASR);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Transcription très sollicitée — reprends dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.[0];
      if (field === "audio") {
        // Base64 trop long ≈ audio > 5 Mo décodé → 413 ; absent/vide → 400.
        const tooBig = issue?.code === "too_big";
        return NextResponse.json(
          { error: tooBig ? "Enregistrement trop volumineux (max 5 Mo)" : "Audio requis" },
          { status: tooBig ? 413 : 400 },
        );
      }
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    // Décodage base64 (Node tolère les caractères parasites → on borne par la
    // taille réelle décodée, puis on renormalise avant l'envoi au moteur).
    const buf = Buffer.from(parsed.data.audio, "base64");
    if (buf.length < 100) {
      return NextResponse.json({ error: "Audio illisible — réenregistre ton message" }, { status: 400 });
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: "Enregistrement trop volumineux (max 5 Mo)" }, { status: 413 });
    }

    const zai = await ZAI.create();
    // t. 87 — zaiCall : retry backoff sur 429 amont (quota machine partagé
    // chat/VLM/ASR/TTS) — le vocal ne meurt plus sur un refus temporaire.
    const r = await zaiCall(
      () => zai.audio.asr.create({ file_base64: buf.toString("base64") }),
      { label: "asr:transcription", timeoutMs: ASR_TIMEOUT_MS, busyRetries: 2 },
    );
    const text = typeof r?.text === "string" ? r.text.trim() : "";
    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof UpstreamBusyError) {
      // Quota amont saturé même après retries → 502 honnête (réessayable),
      // JAMAIS un 500 « erreur interne » pour un refus temporaire.
      return NextResponse.json({ error: "Transcription très sollicitée — réessaie dans quelques secondes" }, { status: 502 });
    }
    // Le moteur rejette en 400 les formats non supportés (ex. mp4/aac non
    // converti côté client) → 400 propre plutôt qu'un 500 générique.
    const msg = e instanceof Error ? e.message : String(e);
    if (/status 400|Audio format/i.test(msg)) {
      return NextResponse.json({ error: "Audio illisible — réenregistre ton message" }, { status: 400 });
    }
    console.error("[kene:api:asr]", e);
    return NextResponse.json({ error: "Transcription indisponible — réessaie dans un instant" }, { status: 502 });
  }
}
