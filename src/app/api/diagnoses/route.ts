// POST /api/diagnoses — analyse VLM d'une photo de peau | GET ?userId= — historique
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runDiagnosis } from "@/lib/ai/vlm";
import { BODY_ZONES } from "@/lib/kene/types";
import type { BodyZone } from "@/lib/kene/types";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DIAGNOSES_CREATE } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const zoneIds = BODY_ZONES.map((z2) => z2.id) as [string, ...string[]];

const Body = z.object({
  userId: z.string().min(1),
  zone: z.enum(zoneIds),
  image: z.string().startsWith("data:image/"),
  fitzpatrick: z.string().optional(),
  allergies: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Route coûteuse (photo → VLM) : 6/min par IP, AVANT toute désérialisation.
  const rl = rateLimit(rlKey(req, "diagnoses:create"), DIAGNOSES_CREATE);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Le moteur d'analyse est très sollicité — reprends dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return jsonError(
        issue?.path?.[0] === "zone"
          ? `Zone invalide (zones : ${zoneIds.join(", ")})`
          : issue?.path?.[0] === "image"
            ? "Image invalide (dataURL attendu)"
            : "Corps de requête invalide",
        400
      );
    }
    const { userId, zone, image, fitzpatrick, allergies } = parsed.data;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    // 1. Création du diagnostic en pending
    let diagnosis = await db.diagnosis.create({
      data: { userId, zone, imageData: image, resultJson: "", status: "pending" },
    });

    // 2. Analyse VLM (10-30 s possibles, fallback déterministe intégré)
    try {
      const result = await runDiagnosis({
        imageBase64: image,
        zone: zone as BodyZone,
        fitzpatrick,
        allergies,
      });
      diagnosis = await db.diagnosis.update({
        where: { id: diagnosis.id },
        data: {
          resultJson: JSON.stringify(result),
          scoreGlobal: result.score_global,
          status: "done",
          vlmUsed: result.source === "vlm",
        },
      });

      // Alerte dermatologique pour les nævi suspects (orientation ABCDE)
      if (zone === "naevi" && result.orientation_dermato) {
        await notify({
          userId,
          channel: "whatsapp",
          toPhone: user.phone,
          message: `⚠️ Kènè : votre analyse de nævi présente des signes suspects (${result.raison_orientation?.slice(0, 120) ?? "critères ABCDE"}). Nous vous recommandons de consulter un dermatologue sans délai. Prenez aussi RDV avec une dermo-conseillère partenaire via l'app.`,
        });
      }

      // Rappel automatique « contrôle de protocole » programmé à S+3 (annulé
      // si un nouveau scan survient — filtre GET /api/notifications).
      await notify({
        userId,
        channel: "whatsapp",
        toPhone: user.phone,
        message: `Kènè 🧴 ${(user.name.split(/\s+/)[0] ?? user.name).trim()}, ton protocole ${zone.replace("_", " ")} (score ${result.score_global}/100) suit son cours. Dans 3 semaines, refais ton diagnostic IA pour mesurer tes progrès et ajuster ta routine — ça prend 2 minutes.`,
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 21 * 86_400_000),
        metaJson: JSON.stringify({ diagId: diagnosis.id }),
      });
    } catch (err) {
      console.error("[kene:api:diagnoses] VLM échec:", err instanceof Error ? err.message : err);
      diagnosis = await db.diagnosis.update({
        where: { id: diagnosis.id },
        data: { status: "error" },
      });
    }

    return NextResponse.json({ diagnosis });
  } catch (err) {
    return serverError("diagnoses", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);
    // Historique borné (POC : 20 derniers — le front liste tout, sans
    // « charger plus » ; imageData conservé pour l'historique photos).
    const diagnoses = await db.diagnosis.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ diagnoses });
  } catch (err) {
    return serverError("diagnoses:get", err);
  }
}
