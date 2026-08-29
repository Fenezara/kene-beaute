// POST /api/diagnoses — analyse VLM d'une photo de peau | GET ?userId= — historique
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runDiagnosis } from "@/lib/ai/vlm";
import { BODY_ZONES } from "@/lib/kene/types";
import type { BodyZone } from "@/lib/kene/types";
import { jsonError, serverError, notify } from "@/lib/kene/server";

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
    const diagnoses = await db.diagnosis.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ diagnoses });
  } catch (err) {
    return serverError("diagnoses:get", err);
  }
}
