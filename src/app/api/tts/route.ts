// Kènè — POST /api/tts : synthèse vocale (TTS z-ai-web-dev-sdk, backend only).
// Entrée { text ≤ 1200 (contrat), voice?, speed 0.5-2?, lang fr|dy|bq|bt } → audio/wav.
// lang = fr (défaut) | dy (dioula) | bq (baoulé) | bt (bété) :
// le texte est d'abord traduit par LLM (cache serveur), puis synthétisé.
// Cache mémoire FIFO plafonné (les narrations de diagnostic reviennent souvent).
// Garde temporelle : tout appel IA qui hang répond 502 FR au bout de 45 s.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, rlKey, rateLimitResponse, TTS } from "@/lib/kene/rate-limit";
import { withTimeout, TimeoutError } from "@/lib/kene/with-timeout";

export const runtime = "nodejs";

const VOICES = new Set(["tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo"]);
const LANG_NAME: Record<string, string> = {
  dy: "dioula ivoirien",
  bq: "baoulé (baoulé de Côte d'Ivoire)",
  bt: "bété (bété de Côte d'Ivoire)",
};
const TTS_TIMEOUT_MS = 45_000;
// Double bornage du texte : 1200 en validation (contrat externe), 1000 au
// moment de la synthèse — le SDK TTS plafonne l'input à ~1024 caractères,
// passer au-delà échouerait côté moteur (MAX_TEXT garde le message existant).
const MAX_TEXT_ZOD = 1200;
const MAX_TEXT = 1000; // < limite SDK (1024)
const CACHE_MAX_BYTES = 32 * 1024 * 1024; // ~15 narrations de 1 min
const TR_CACHE_MAX = 128; // traductions LLM mémorisées

/** Validation stricte du contrat (fini les casts manuels) : text borné,
 *  lang enum, speed borné 0.5-2, voix tolérée (fallback tongtong). */
const Body = z.object({
  text: z.string().min(1).max(MAX_TEXT_ZOD),
  voice: z.string().max(40).optional(),
  speed: z.number().min(0.5).max(2).optional(),
  lang: z.enum(["fr", "dy", "bq", "bt"]).optional(),
});

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

  const completion = await withTimeout(
    zai.chat.completions.create({
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
    }),
    TTS_TIMEOUT_MS,
    "tts:traduction",
  );
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
    const voiceRaw = parsed.data.voice ?? "tongtong";
    const voice = VOICES.has(voiceRaw) ? voiceRaw : "tongtong";
    const speed = parsed.data.speed ?? 1;
    const lang = parsed.data.lang ?? "fr";

    if (!text) return NextResponse.json({ error: "Texte requis" }, { status: 400 });
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: `Texte trop long (max ${MAX_TEXT} caractères)` }, { status: 400 });
    }

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

    const buf = await withTimeout(
      (async () => {
        const response = await zai.audio.tts.create({
          input: text,
          voice,
          speed,
          response_format: "wav",
          stream: false,
        });
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(new Uint8Array(arrayBuffer));
      })(),
      TTS_TIMEOUT_MS,
      "tts:synthese",
    );
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
    if (e instanceof TimeoutError) {
      // Moteur hangé → 502 (erreur amont), pas 500 : réessayable immédiatement.
      return NextResponse.json({ error: "Synthèse vocale indisponible, réessaie dans un instant" }, { status: 502 });
    }
    console.error("[api/tts]", e);
    return NextResponse.json({ error: "Synthèse vocale indisponible, réessaie dans un instant" }, { status: 500 });
  }
}
