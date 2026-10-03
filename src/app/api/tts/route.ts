// Kènè — POST /api/tts: synthèse vocale naturelle haute fidélité (Palier 1 : EdgeTTS Neural, Palier 2 : ZAI SDK, Palier 3 : Fallback navigateur).
// Voix par défaut : fr-FR-DeniseNeural (voix humaine, chaleureuse, naturelle, sans intonation robotique).
// Entrée { text ≤ 1200 (contrat), voice?, speed 0.5-2?, lang fr|dy|bq|bt } → audio/mpeg ou audio/wav.
// lang = fr (défaut) | dy (dioula) | bq (baoulé) | bt (bété):
// le texte est d'abord traduit par LLM (cache serveur), puis synthétisé.
// Cache mémoire FIFO plafonné (les narrations de diagnostic reviennent souvent).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, rlKey, rateLimitResponse, TTS } from "@/lib/kene/rate-limit";
import { zaiCall, UpstreamBusyError } from "@/lib/ai/zai-retry";

export const runtime = "nodejs";

const NEURAL_VOICES = new Set([
  "fr-FR-DeniseNeural",
  "fr-FR-EloiseNeural",
  "fr-FR-VivienneMultilingualNeural",
  "fr-FR-HenriNeural",
]);
const DEFAULT_NEURAL_VOICE = "fr-FR-DeniseNeural";

const LANG_NAME: Record<string, string> = {
  dy: "dioula ivoirien",
  bq: "baoulé (baoulé de Côte d'Ivoire)",
  bt: "bété (bété de Côte d'Ivoire)",
  wo: "wolof (wolof du Sénégal)",
};
const TTS_TIMEOUT_MS = 45_000;
const MAX_TEXT_ZOD = 4000;
const MAX_TEXT = 3500;
const CACHE_MAX_BYTES = 32 * 1024 * 1024; // ~32 Mo de cache audio
const TR_CACHE_MAX = 128; // traductions LLM mémorisées

const Body = z.object({
  text: z.string().min(1).max(MAX_TEXT_ZOD),
  voice: z.string().max(60).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  lang: z.enum(["fr", "dy", "bq", "bt", "wo"]).optional(),
});

type Entry = { buf: Buffer; bytes: number; contentType: string };
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

/** Nettoyage du texte pour une lecture orale fluide et humaine (retire balises, listes et emojis) */
function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/[•\-\*#]/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    // Retire les émojis qui provoquent la lecture de descriptions robotiques
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Synthèse par voix neurale Microsoft Azure / Edge (qualité humaine ultra-naturelle) */
async function synthesizeWithEdgeTts(
  text: string,
  voiceName: string = DEFAULT_NEURAL_VOICE,
  speed: number = 1,
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  const selectedVoice = NEURAL_VOICES.has(voiceName) ? voiceName : DEFAULT_NEURAL_VOICE;

  let rateStr = "-4%";
  if (speed && speed !== 1) {
    const pct = Math.round((speed - 1) * 100) - 4;
    rateStr = pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

  await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    rate: rateStr,
    pitch: "-1Hz",
    volume: "100%",
  });

  const { audioStream } = tts.toStream(text);
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        reject(new Error("Timeout synthèse vocale EdgeTTS"));
      }
    }, 40_000);

    const onDone = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      }
    };

    audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    audioStream.on("end", onDone);
    audioStream.on("close", onDone);
    audioStream.on("error", (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

/** Traduction LLM du texte narratif vers une langue ivoirienne (orthographe latine).
 * Multi-paliers : Gemini REST → Z.ai SDK → erreur */
async function translateLocal(text: string, lang: string): Promise<string> {
  const key = fnv1a(`${lang}|${text}`);
  const hit = trCache.get(key);
  if (hit) return hit;

  const trSystemPrompt =
    `Tu traduis des phrases orales d'une application de beauté (diagnostic de peau) du français vers le ${LANG_NAME[lang]}. ` +
    "Règles : phrases très courtes et parlées ; orthographe latine simple lisible par un moteur de synthèse vocale français ; " +
    "garde les nombres en toutes lettres ; garde les noms propres tels quels ; ne traduis pas le nom « Kènè ». " +
    "Réponds UNIQUEMENT avec la traduction, sans guillemets ni commentaire.";

  let out: string | null = null;

  // Palier 1 : Gemini REST
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && !out) {
    try {
      const model = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== "gemini-1.5-flash") ? process.env.GEMINI_MODEL : "gemini-3.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: trSystemPrompt }] },
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
          }),
          signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (raw) out = raw.trim().replace(/^["'«»]+|["'«»]+$/g, "");
      }
    } catch {
      // Gemini échoué, bascule sur ZAI
    }
  }

  // Palier 2 : Z.ai SDK
  if (!out) {
    try {
      const zai = await ZAI.create();
      const completion = await zaiCall(
        () =>
          zai.chat.completions.create({
            messages: [
              { role: "system", content: trSystemPrompt },
              { role: "user", content: text },
            ],
            thinking: { type: "disabled" },
          }),
        { label: "tts:traduction", timeoutMs: TTS_TIMEOUT_MS, busyRetries: 1 },
      );
      const raw = (completion.choices[0]?.message?.content ?? "").trim().replace(/^["'«»]+|["'«»]+$/g, "");
      if (raw) out = raw;
    } catch {
      // ZAI échoué aussi
    }
  }

  if (!out) throw new Error("Traduction vide");

  trCache.set(key, out);
  while (trCache.size > TR_CACHE_MAX) {
    const first = trCache.keys().next().value;
    if (first === undefined) break;
    trCache.delete(first);
  }
  return out;
}

function audioResponse(buf: Buffer, contentType = "audio/mpeg"): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "tts"), TTS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Synthèse vocale très sollicitée — reprends dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.[0];
      if (field === "text") {
        return NextResponse.json(
          { error: issue?.code === "too_small" ? "Texte requis" : `Texte trop long (max ${MAX_TEXT_ZOD} caractères)` },
          { status: 400 },
        );
      }
      if (field === "lang") {
        return NextResponse.json({ error: "Langue invalide (fr, dy, bq ou bt)" }, { status: 400 });
      }
      if (field === "speed") {
        return NextResponse.json({ error: "Vitesse invalide (0,5 à 2)" }, { status: 400 });
      }
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }
    let text = parsed.data.text.trim();
    const voiceRaw = parsed.data.voice ?? DEFAULT_NEURAL_VOICE;
    const voice = NEURAL_VOICES.has(voiceRaw) ? voiceRaw : DEFAULT_NEURAL_VOICE;
    const speed = parsed.data.speed ?? 1;
    const lang = parsed.data.lang ?? "fr";

    if (!text) return NextResponse.json({ error: "Texte requis" }, { status: 400 });
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: `Texte trop long (max ${MAX_TEXT} caractères)` }, { status: 400 });
    }

    // Traduction vers une langue locale (avant synthèse) — multi-paliers
    if (lang !== "fr") {
      try {
        text = await translateLocal(text, lang);
      } catch {
        return NextResponse.json(
          { error: `Traduction ${lang === "dy" ? "dioula" : lang === "bq" ? "baoulé" : lang === "wo" ? "wolof" : "bété"} indisponible — réessaie dans un instant` },
          { status: 502 },
        );
      }
    }

    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return NextResponse.json({ error: "Texte requis" }, { status: 400 });

    // cache hit (après traduction : la clé porte le texte nettoyé synthétisé)
    const key = fnv1a(`${voice}|${speed}|${lang}|${cleanText}`);
    const hit = cache.get(key);
    if (hit) return audioResponse(hit.buf, hit.contentType);

    // Palier 1 : Voix humaine neurale haute fidélité (Microsoft Azure Neural via MsEdgeTTS)
    // Voix naturelle, chaleureuse, vivante, avec respirations et intonations réalistes
    try {
      const edgeBuf = await synthesizeWithEdgeTts(cleanText, voice, speed);
      if (edgeBuf && edgeBuf.length > 500) {
        cache.set(key, { buf: edgeBuf, bytes: edgeBuf.length, contentType: "audio/mpeg" });
        cacheBytes += edgeBuf.length;
        while (cacheBytes > CACHE_MAX_BYTES && cache.size > 1) {
          const first = cache.keys().next().value;
          if (first === undefined) break;
          const e = cache.get(first);
          cache.delete(first);
          if (e) cacheBytes -= e.bytes;
        }
        return audioResponse(edgeBuf, "audio/mpeg");
      }
    } catch (edgeErr) {
      console.warn("[api/tts] Palier 1 EdgeTTS indisponible, essai du palier ZAI :", (edgeErr as Error).message);
    }

    // Palier 2 : ZAI SDK (si disponible)
    try {
      const zai = await ZAI.create();
      const buf = await zaiCall(
        () =>
          (async () => {
            const response = await zai.audio.tts.create({
              input: cleanText,
              voice: "tongtong",
              speed,
              response_format: "wav",
              stream: false,
            });
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(new Uint8Array(arrayBuffer));
          })(),
        { label: "tts:synthese", timeoutMs: TTS_TIMEOUT_MS, busyRetries: 2 },
      );
      if (buf && buf.length >= 100) {
        cache.set(key, { buf, bytes: buf.length, contentType: "audio/wav" });
        cacheBytes += buf.length;
        while (cacheBytes > CACHE_MAX_BYTES && cache.size > 1) {
          const first = cache.keys().next().value;
          if (first === undefined) break;
          const e = cache.get(first);
          cache.delete(first);
          if (e) cacheBytes -= e.bytes;
        }
        return audioResponse(buf, "audio/wav");
      }
    } catch (zaiErr) {
      if (zaiErr instanceof UpstreamBusyError) {
        console.warn("[api/tts] ZAI busy, fallback browser TTS");
      }
    }

    // Palier 3 : Fallback navigateur
    return NextResponse.json({ fallback: "browser", text: cleanText, lang }, { status: 200 });
  } catch (e) {
    console.error("[api/tts] Unexpected error:", e);
    return NextResponse.json({ error: "Synthèse vocale indisponible, réessaie dans un instant" }, { status: 502 });
  }
}
