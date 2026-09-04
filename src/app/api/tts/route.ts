// Kènè — POST /api/tts : synthèse vocale (TTS z-ai-web-dev-sdk, backend only).
// Entrée { text ≤ 1000, voice?, speed?, lang? } → audio/wav.
// lang = fr (défaut) | dy (dioula) | bq (baoulé) | bt (bété) :
// le texte est d'abord traduit par LLM (cache serveur), puis synthétisé.
// Cache mémoire FIFO plafonné (les narrations de diagnostic reviennent souvent).
import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";

const VOICES = new Set(["tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo"]);
const LANGS = new Set(["fr", "dy", "bq", "bt"]);
const LANG_NAME: Record<string, string> = {
  dy: "dioula ivoirien",
  bq: "baoulé (baoulé de Côte d'Ivoire)",
  bt: "bété (bété de Côte d'Ivoire)",
};
const MAX_TEXT = 1000; // < limite SDK (1024)
const CACHE_MAX_BYTES = 32 * 1024 * 1024; // ~15 narrations de 1 min
const TR_CACHE_MAX = 128; // traductions LLM mémorisées

type Entry = { buf: Buffer; bytes: number };
const cache = new Map<string, Entry>(); // Map = ordre d'insertion → éviction FIFO
let cacheBytes = 0;
const trCache = new Map<string, string>(); // hash(text|lang) → traduction

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** Traduction LLM du texte narratif vers une langue ivoirienne (orthographe latine). */
async function translateLocal(zai: Awaited<ReturnType<typeof ZAI.create>>, text: string, lang: string): Promise<string> {
  const key = fnv1a(`${lang}|${text}`);
  const hit = trCache.get(key);
  if (hit) return hit;

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          `Tu traduis des phrases orales d'une application de beauté (diagnostic de peau) du français vers le ${LANG_NAME[lang]}. ` +
          "Règles : phrases très courtes et parlées ; orthographe latine simple lisible par un moteur de synthèse vocale français ; " +
          "garde les nombres en toutes lettres ; garde les noms propres tels quels ; ne traduis pas le nom « Kènè ». " +
          "Réponds UNIQUEMENT avec la traduction, sans guillemets ni commentaire.",
      },
      { role: "user", content: text },
    ],
    thinking: { type: "disabled" },
  });
  const out = (completion.choices[0]?.message?.content ?? "").trim().replace(/^["'«»]+|["'«»]+$/g, "");
  if (!out) throw new Error("Traduction vide");

  trCache.set(key, out);
  while (trCache.size > TR_CACHE_MAX) {
    const first = trCache.keys().next().value;
    if (first === undefined) break;
    trCache.delete(first);
  }
  return out;
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
    const b = (body ?? {}) as { text?: unknown; voice?: unknown; speed?: unknown; lang?: unknown };
    let text = typeof b.text === "string" ? b.text.trim() : "";
    const voiceRaw = typeof b.voice === "string" ? b.voice : "tongtong";
    const voice = VOICES.has(voiceRaw) ? voiceRaw : "tongtong";
    const speedNum = Number(b.speed);
    const lang = typeof b.lang === "string" && LANGS.has(b.lang) ? b.lang : "fr";

    if (!text) return NextResponse.json({ error: "Texte requis" }, { status: 400 });
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: `Texte trop long (max ${MAX_TEXT} caractères)` }, { status: 400 });
    }
    const speed = Number.isFinite(speedNum) ? Math.min(2, Math.max(0.5, speedNum)) : 1;

    // Traduction vers une langue locale (avant synthèse)
    const zai = await ZAI.create();
    if (lang !== "fr") {
      try {
        text = await translateLocal(zai, text, lang);
      } catch {
        return NextResponse.json(
          { error: `Traduction ${lang === "dy" ? "dioula" : lang === "bq" ? "baoulé" : "bété"} indisponible — réessaie dans un instant` },
          { status: 502 },
        );
      }
    }

    // cache hit (après traduction : la clé porte le texte synthétisé)
    const key = fnv1a(`${voice}|${speed}|${lang}|${text}`);
    const hit = cache.get(key);
    if (hit) return audioResponse(hit.buf);

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
