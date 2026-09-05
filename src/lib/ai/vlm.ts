// Kènè — Service de diagnostic de peau par VLM (glm-4.6v via z-ai-web-dev-sdk)
// IMPORTANT : backend uniquement.
import ZAI from "z-ai-web-dev-sdk";
import type { VisionMessage } from "z-ai-web-dev-sdk";
import type { BodyZone, DiagnosisResult, Indicator, ZoneMark } from "@/lib/kene/types";
import { ZONE_INDICATORS } from "@/lib/kene/types";
import { severityFromPercent } from "@/lib/kene/format";
import { withTimeout } from "@/lib/kene/with-timeout";

/** Délai de garde des appels VLM (45 s) : un SDK qui hang bascule sur le
 *  chemin de fallback existant au lieu de laisser le diagnostic en pending. */
const VLM_TIMEOUT_MS = 45_000;

/** Garde de type minimale (runtime safe) pour les réponses JSON du VLM. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Prompt VLM spécialisé peaux mélanodermes (Fitzpatrick IV–VI) — PRD §7.5 */
function buildPrompt(zone: BodyZone, knownFitz?: string, allergies?: string): string {
  const indicateurs = ZONE_INDICATORS[zone];
  return `Tu es un moteur d'analyse cutanée spécialisé dans les peaux mélanodermes africaines (phototypes Fitzpatrick IV à VI), pour la plateforme Kènè.

Analyse cette photo de zone corporelle : « ${zone} ».
${knownFitz ? `Profil déclarée par la cliente : phototype Fitzpatrick ${knownFitz}.` : ""}
${allergies ? `Allergies déclarées : ${allergies}.` : ""}

Contexte dermatologique clé : sur peau mélanoderme, privilégier la détection des taches post-inflammatoires (PIH), mélasma, acné mixte, dermatosis papulosa nigra (DPN), kératose, poils incarnés, et nævi suspects (règle ABCDE). Éviter les biais des outils occidentaux (ne pas confondre pigmentation naturelle avec pathologie).

Évalue UNIQUEMENT ces indicateurs pour cette zone : ${indicateurs.join(" | ")}.

Réponds STRICTEMENT en JSON valide (sans markdown, sans texte autour) avec ce schéma :
{
  "score_global": <entier 0-100, 100 = peau en excellente santé>,
  "fitzpatrick_estime": "IV" | "V" | "VI" | "III",
  "indicateurs": [
    { "nom": "<nom exact de la liste>", "pourcentage": <entier 0-100, 100 = excellent>, "note": "<observation courte>" }
  ],
  "zones_marquages": [
    { "label": "<zone concernée>", "x": <0-100>, "y": <0-100>, "w": <8-30>, "h": <8-30>, "severite": <0-3> }
  ],
  "recommandations": {
    "resume": "<2 phrases max, ton bienveillant>",
    "routine_matin": ["<étape 1>", "..."],
    "routine_soir": ["<étape 1>", "..."],
    "botaniques_conseillees": ["<ex: Karité, Moringa, Baobab, Aloka, Bissap>"],
    "produits": ["<type de produit adapté>"],
    "soins_conseilles": ["<soin en institut adapté>"],
    "conseils_hygiene_vie": ["<conseil hygiène de vie>"]
  },
  "orientation_dermato": <true si lésion suspecte ABCDE ou signe grave>,
  "raison_orientation": "<si true, justification clinique>",
  "abcde": [
    { "critere": "A", "intitule": "Asymétrie", "alerte": <bool>, "detail": "<observation>" }
  ]
}

Règles : 5 à 8 zones_marquages maximum ; jamais de diagnostic médical définitif ; si la photo ne montre pas de peau humaine, mets score_global à 0 avec orientation_dermato=false et resume expliquant le problème.`;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function clamp(n: unknown, min: number, max: number, dflt: number): number {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  if (Number.isNaN(v)) return dflt;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function coerceArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Transforme la réponse brute du VLM en DiagnosisResult validé */
export function normalizeVlmResult(raw: unknown, zone: BodyZone): DiagnosisResult | null {
  if (!isRecord(raw)) return null;
  const o: Record<string, unknown> = raw;
  const indicateursList = ZONE_INDICATORS[zone];
  const indicateursIn = coerceArray<Record<string, unknown>>(o.indicateurs);
  const indicateurs: Indicator[] = indicateursList.map((nom) => {
    const found = indicateursIn.find((i) => i && String(i.nom).toLowerCase().includes(nom.toLowerCase().slice(0, 10)));
    const pct = clamp(found?.pourcentage, 0, 100, 70);
    return {
      nom,
      pourcentage: pct,
      severite: severityFromPercent(pct),
      note: found?.note ? String(found.note).slice(0, 160) : undefined,
    };
  });
  if (indicateurs.length === 0) return null;

  const marquages: ZoneMark[] = coerceArray<Record<string, unknown>>(o.zones_marquages)
    .slice(0, 8)
    .map((m) => ({
      label: String(m?.label ?? "zone").slice(0, 40),
      x: clamp(m?.x, 2, 95, 50),
      y: clamp(m?.y, 2, 95, 50),
      w: clamp(m?.w, 8, 35, 18),
      h: clamp(m?.h, 8, 35, 18),
      severite: clamp(m?.severite, 0, 3, 1),
    }));

  const recIn: Record<string, unknown> = isRecord(o.recommandations) ? o.recommandations : {};
  const recommandations = {
    resume: String(recIn.resume ?? "Analyse terminée. Votre peau présente un équilibre général correct avec des zones d'attention détaillées ci-dessous."),
    routine_matin: coerceArray<string>(recIn.routine_matin).slice(0, 6).map(String),
    routine_soir: coerceArray<string>(recIn.routine_soir).slice(0, 6).map(String),
    botaniques_conseillees: coerceArray<string>(recIn.botaniques_conseilles).slice(0, 6).map(String),
    produits: coerceArray<string>(recIn.produits).slice(0, 8).map(String),
    soins_conseilles: coerceArray<string>(recIn.soins_conseilles).slice(0, 6).map(String),
    conseils_hygiene_vie: coerceArray<string>(recIn.conseils_hygiene_vie).slice(0, 6).map(String),
  };

  const abcde = coerceArray<Record<string, unknown>>(o.abcde).map((c) => ({
    critere: String(c?.critere ?? "").slice(0, 1),
    intitule: String(c?.intitule ?? ""),
    alerte: Boolean(c?.alerte),
    detail: String(c?.detail ?? "").slice(0, 200),
  }));

  const validScore = indicateurs.reduce((s, i) => s + i.pourcentage, 0) / indicateurs.length;
  const scoreGlobal = clamp(o.score_global, 0, 100, Math.round(validScore));

  return {
    score_global: scoreGlobal,
    fitzpatrick_estime: ["III", "IV", "V", "VI"].includes(String(o.fitzpatrick_estime)) ? String(o.fitzpatrick_estime) : undefined,
    zone,
    indicateurs,
    zones_marquages: marquages,
    recommandations,
    orientation_dermato: Boolean(o.orientation_dermato) || abcde.some((c) => c.alerte),
    raison_orientation: o.raison_orientation ? String(o.raison_orientation).slice(0, 300) : undefined,
    abcde: abcde.length ? abcde : undefined,
    avertissement:
      "Estimation IA éducative — ne constitue pas un diagnostic médical. En cas de lésion évolutive, consultez un dermatologue.",
    source: "vlm",
  };
}

/** Fallback déterministe si le VLM échoue (POC toujours fonctionnel) */
export function fallbackResult(zone: BodyZone, seed: number): DiagnosisResult {
  const rand = (i: number) => {
    const x = Math.sin(seed * 97.13 + i * 41.7) * 10000;
    return x - Math.floor(x);
  };
  const names = ZONE_INDICATORS[zone];
  const indicateurs: Indicator[] = names.map((nom, i) => {
    const pct = Math.round(45 + rand(i) * 50);
    return { nom, pourcentage: pct, severite: severityFromPercent(pct) };
  });
  const score = Math.round(indicateurs.reduce((s, i) => s + i.pourcentage, 0) / indicateurs.length);
  const marquages: ZoneMark[] = [
    { label: "Zone T", x: 50, y: 32, w: 34, h: 22, severite: Math.min(3, Math.round(rand(1) * 3)) },
    { label: "Joue gauche", x: 28, y: 52, w: 20, h: 20, severite: Math.min(3, Math.round(rand(2) * 3)) },
    { label: "Joue droite", x: 72, y: 52, w: 20, h: 20, severite: Math.min(3, Math.round(rand(3) * 3)) },
    { label: "Menton", x: 50, y: 74, w: 18, h: 14, severite: Math.min(3, Math.round(rand(4) * 3)) },
  ].slice(0, zone === "visage" ? 4 : 2);

  return {
    score_global: score,
    fitzpatrick_estime: "V",
    zone,
    indicateurs,
    zones_marquages: marquages,
    recommandations: {
      resume:
        "Analyse simulée (mode secours). Votre peau montre une hydratation correcte avec des zones de pigmentation à surveiller — routine adaptative proposée.",
      routine_matin: ["Nettoyant doux sans savon", "Brume hydratante aloka", "Sérum vitamine C stabilisé", "Crème solaire SPF 50 teintée"],
      routine_soir: ["Démaquillant huileux karité", "Nettoyant doux", "Sérum niacinamide 5 %", "Baume réparateur nuit"],
      botaniques_conseillees: ["Karité", "Moringa", "Baobab", "Bissap"],
      produits: ["Sérum Éclat Moringa", "Baume Nuit Karité"],
      soins_conseilles: ["Soin éclat mélanoderme en institut"],
      conseils_hygiene_vie: ["Boire 1,5 L d'eau/jour", "Dormir 7-8 h", "Éviter le percutané maison non stérile"],
    },
    orientation_dermato: false,
    avertissement: "Mode secours : résultat simulé car le moteur IA est momentanément indisponible.",
    source: "fallback",
  };
}

/** Appel principal — VLM glm-4.6v avec fallback */
export async function runDiagnosis(opts: {
  imageBase64: string; // data URL complète
  zone: BodyZone;
  fitzpatrick?: string;
  allergies?: string;
}): Promise<DiagnosisResult> {
  const { imageBase64, zone, fitzpatrick, allergies } = opts;
  const seed = Date.now() % 1000;
  try {
    const zai = await ZAI.create();
    const messages: VisionMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: buildPrompt(zone, fitzpatrick, allergies) },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      },
    ];
    const response = await withTimeout(
      zai.chat.completions.createVision({
        model: "glm-4.6v",
        messages,
        thinking: { type: "disabled" },
      }),
      VLM_TIMEOUT_MS,
      "vlm:vision",
    );
    const raw = response.choices[0]?.message?.content ?? "";
    const json = extractJson(raw);
    const normalized = normalizeVlmResult(json, zone);
    if (normalized && (normalized.indicateurs?.length ?? 0) > 0) {
      return normalized;
    }
    return fallbackResult(zone, seed);
  } catch (err) {
    console.error("[kene:vlm] diagnostic fallback:", (err as Error).message);
    return fallbackResult(zone, seed);
  }
}

/** Triage photo dans le chat dermato (vert/jaune/rouge) */
export async function triageLesion(imageBase64: string): Promise<{ niveau: "vert" | "jaune" | "rouge"; message: string }> {
  try {
    const zai = await ZAI.create();
    const messages: VisionMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Tu es l'assistant triage Kènè. Analyse cette photo de lésion cutanée sur peau mélanoderme. Réponds STRICTEMENT en JSON: {"niveau":"vert"|"jaune"|"rouge","message":"<3 phrases max en français, ton rassurant, avec conseil botanique africain si vert, appel à une dermo-conseillère si jaune, urgence dermatologique si rouge>"}. Vert = bénin/soin routine. Jaune = avis dermo-conseillère requis. Rouge = signes ABCDE suspects → consultation immédiate.`,
          },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      },
    ];
    const response = await withTimeout(
      zai.chat.completions.createVision({
        model: "glm-4.6v",
        messages,
        thinking: { type: "disabled" },
      }),
      VLM_TIMEOUT_MS,
      "vlm:triage",
    );
    const raw = response.choices[0]?.message?.content ?? "{}";
    const json = extractJson(raw);
    const niveauRaw = isRecord(json) ? String(json.niveau ?? "") : "";
    const niveau: "vert" | "jaune" | "rouge" = niveauRaw === "vert" || niveauRaw === "rouge" ? niveauRaw : "jaune";
    const message =
      isRecord(json) && typeof json.message === "string" && json.message.trim()
        ? json.message
        : "Photo reçue. Un examen plus approfondi est recommandé : je vous oriente vers une dermo-conseillère Kènè.";
    return { niveau, message };
  } catch {
    return {
      niveau: "jaune",
      message: "La photo a bien été reçue, mais l'analyse IA est momentanément indisponible. Je vous conseille de prendre rendez-vous avec une dermo-conseillère partenaire Kènè pour un avis fiable.",
    };
  }
}
