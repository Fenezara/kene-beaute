// Kènè — POST /api/tts : synthèse vocale (TTS z-ai-web-dev-sdk, backend only).
// Entrée { text ≤ 1000, voice?, speed? } → audio/wav.
// Cache mémoire FIFO plafonné (les narrations de diagnostic reviennent souvent).
import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";

const VOICES = new Set(["tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo"]);
const MAX_TEXT = 1000; // < limite SDK (1024)
const CACHE_MAX_BYTES = 32 * 1024 * 1024; // ~15 narrations de 1 min

type Entry = { buf: Buffer; bytes: number };
const cache = new Map<string, Entry>(); // Map = ordre d'insertion → éviction FIFO
let cacheBytes = 0;

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function audioResponse(buf: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => null);
    const b = (body ?? {}) as { text?: unknown; voice?: unknown; speed?: unknown };
    const text = typeof b.text === "string" ? b.text.trim() : "";
    const voiceRaw = typeof b.voice === "string" ? b.voice : "tongtong";
    const voice = VOICES.has(voiceRaw) ? voiceRaw : "tongtong";
    const speedNum = Number(b.speed);

    if (!text) return NextResponse.json({ error: "Texte requis" }, { status: 400 });
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: `Texte trop long (max ${MAX_TEXT} caractères)` }, { status: 400 });
    }
    const speed = Number.isFinite(speedNum) ? Math.min(2, Math.max(0.5, speedNum)) : 1;

    // cache hit
    const key = fnv1a(`${voice}|${speed}|${text}`);
    const hit = cache.get(key);
    if (hit) return audioResponse(hit.buf);

    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: text,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });
    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(new Uint8Array(arrayBuffer));
    if (buf.length < 100) {
      return NextResponse.json({ error: "Audio vide renvoyé par le moteur" }, { status: 502 });
    }

    // stockage + éviction FIFO par plafond mémoire
    cache.set(key, { buf, bytes: buf.length });
    cacheBytes += buf.length;
    while (cacheBytes > CACHE_MAX_BYTES && cache.size > 1) {
      const first = cache.keys().next().value;
      if (first === undefined) break;
      const e = cache.get(first);
      cache.delete(first);
      if (e) cacheBytes -= e.bytes;
    }
    return audioResponse(buf);
  } catch (e) {
    console.error("[api/tts]", e);
    return NextResponse.json({ error: "Synthèse vocale indisponible, réessaie dans un instant" }, { status: 500 });
  }
}
