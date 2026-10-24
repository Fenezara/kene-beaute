// POST /api/diagnoses — pipeline asynchrone: ligne "pending" + 202
// en < 1 s, l'analyse VLM tourne dans le worker de fond (lib/kene/diag-jobs).
// Le front suit la progression via GET /api/diagnoses/[id] (poll 1,8 s).
// | GET?userId= — historique (inchangé).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { BODY_ZONES } from "@/lib/kene/types";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DIAGNOSES_CREATE } from "@/lib/kene/rate-limit";
import { processDiagnosisJob } from "@/lib/kene/diag-jobs";
import { guardUserClaim } from "@/lib/kene/session";
import { diagQuotaFor, planDefById } from "@/lib/kene/plans";
import { checkImageDataUrl } from "@/lib/kene/upload";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";
// La route ne fait plus tourner le VLM (worker de fond) → 10 s suffit large.
export const maxDuration = 10;

const zoneIds = BODY_ZONES.map((z2) => z2.id) as [string, ...string[]];

const Body = z.object({
  userId: z.string().min(1),
  zone: z.enum(zoneIds),
  image: z.string().startsWith("data:image/").optional(),
  images: z.array(z.string().startsWith("data:image/")).min(1).max(5).optional(),
  fitzpatrick: z.string().optional(),
  allergies: z.string().optional(),
}).refine((data) => Boolean(data.image || (data.images && data.images.length > 0)), {
  message: "Au moins une image requise (image ou images)",
  path: ["image"],
});

export async function POST(req: NextRequest) {
  // Route coûteuse (photo → VLM): 6/min par IP, AVANT toute désérialisation.
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
            : issue?.message ?? "Corps de requête invalide",
        400
      );
    }
    const { userId, zone } = parsed.data;
    const rawImages: string[] = parsed.data.images && parsed.data.images.length > 0
      ? parsed.data.images
      : parsed.data.image
      ? [parsed.data.image]
      : [];

    // Validation d'upload 2026: MIME + taille + magic bytes pour chaque photo
    for (let i = 0; i < rawImages.length; i++) {
      const upload = checkImageDataUrl(rawImages[i]);
      if (!upload.ok) {
        void audit({ kind: "upload_reject", userId, ip: clientIp(req), detail: upload.reason });
        return jsonError(`Photo ${i + 1} refusée — ${upload.reason}`, 415);
      }
    }
    // (fitzpatrick/allergies restent validés par le contrat zod — le worker
    // les relit depuis le profil de la cliente côté serveur.)

    // Garde de session (, intégration 71-e): si un cookie de session
    // valide est présent, le userId revendiqué doit être celui de la session
    // (401 « Session invalide pour ce compte ») — sans cookie, comportement
    // historique conservé (session POC legacy + warning loggé).
    const guard = guardUserClaim(req, "diagnoses:create", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    // Quota d'abonnement (, intégration 71-e): plan gratuit =
    // 1 diagnostic/mois, Kènè+ = illimité. Le 403 est distinct du 401 session
    // → le front l'interprète comme un quota atteint et propose l'activation
    // Kènè+ (upsell vers l'écran Abonnement), pas un simple échec.
    const quota = await diagQuotaFor(userId);
    if (quota.remaining <= 0) {
      const plus = planDefById("kene_plus");
      const price = plus ? `${plus.priceFcfa.toLocaleString("fr-FR")} FCFA/mois` : "2 500 FCFA/mois";
      return NextResponse.json(
        {
          error: `Ton diagnostic gratuit de ce mois est déjà utilisé. Active Kènè+ (${price}) pour des analyses illimitées.`,
          quotaExceeded: true,
          quota,
        },
        { status: 403 },
      );
    }

    // 1. Création du diagnostic en pending — ligne immédiatement visible
    // dans l'historique et suivable par le poll.
    const imageData = rawImages.length === 1 ? rawImages[0] : JSON.stringify(rawImages);
    const diagnosis = await db.diagnosis.create({
      data: { userId, zone, imageData, resultJson: "", status: "pending" },
    });

    // 2. Analyse VLM (10-45 s): lancée en tâche de fond, on NE l'attend PAS
    // (fire-and-forget — l'ancien await ici bloquait la réponse 20-45 s et
    // déclenchait les 502 du gateway en fin de diagnostic).
    void processDiagnosisJob(diagnosis.id);

    // 3. Réponse immédiate 202: payload { diagnosis } compatible 66-b, le
    // champ status vaut "pending" au moment de la réponse — c'est le but.
    return NextResponse.json({ diagnosis }, { status: 202 });
  } catch (err) {
    return serverError("diagnoses", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);
    // Garde de session: claim query vs cookie si session présente.
    const guard = guardUserClaim(req, "diagnoses:get", userId);
    if (guard) return guard;
    const full = req.nextUrl.searchParams.get("full") === "1";
    const light = !full;
    // Historique borné (20 récents). L'imageData est transmise pour afficher les aperçus et la fiche résultat sans écran blanc.
    const [selfScans, proDiags, userRecord] = await Promise.all([
      db.diagnosis.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          userId: true,
          zone: true,
          imageData: true,
          resultJson: true,
          scoreGlobal: true,
          status: true,
          createdAt: true,
        },
      }),
      db.proDiagnosis.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          zone: true,
          photoData: true,
          resultJson: true,
          scoreGlobal: true,
          createdAt: true,
          tenant: { select: { name: true } },
          practitioner: true,
        },
      }),
      db.user.findUnique({
        where: { id: userId },
        select: { id: true, phone: true, selectedTenantId: true },
      }),
    ]);

    // Récupération de la routine quotidienne prescrite par l'institut (cosmeticsUsed)
    let cosmeticsUsed: string | null = null;
    let instituteName: string | null = null;

    if (userRecord) {
      const digits = userRecord.phone.replace(/\D/g, "");
      const tail = digits.length >= 8 ? digits.slice(-8) : digits;
      const profiles = await db.clientProfile.findMany({
        where: {
          OR: [
            { userId: userRecord.id },
            ...(tail ? [{ phone: { contains: tail } }] : [{ phone: userRecord.phone }]),
          ],
        },
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });

      const withRoutine = profiles.find((p) => p.cosmeticsUsed && p.cosmeticsUsed.trim() !== "");
      if (withRoutine) {
        cosmeticsUsed = withRoutine.cosmeticsUsed;
        instituteName = withRoutine.tenant.name;
        // Rapprochement automatique s'il manquait
        if (!withRoutine.userId) {
          await db.clientProfile.update({
            where: { id: withRoutine.id },
            data: { userId: userRecord.id },
          }).catch(() => null);
        }
      } else if (profiles.length > 0) {
        instituteName = profiles[0].tenant.name;
      }
    }

    const diagnoses = [
      ...selfScans.map((s) => ({
        ...s,
        imageData: (s.imageData as string | undefined) ?? "",
      })),
      ...proDiags.map((p) => ({
        id: p.id,
        userId,
        zone: p.zone,
        imageData: (p.photoData as string | undefined) ?? "",
        resultJson: p.resultJson,
        scoreGlobal: p.scoreGlobal,
        status: "done" as const,
        createdAt: p.createdAt,
        institut: p.tenant.name,
        practitioner: p.practitioner ?? null,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    return NextResponse.json({
      diagnoses,
      cosmeticsUsed,
      instituteName,
    });
  } catch (err) {
    return serverError("diagnoses:get", err);
  }
}
