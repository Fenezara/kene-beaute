// POST /api/diagnoses — pipeline asynchrone (t. 71) : ligne "pending" + 202
// en < 1 s, l'analyse VLM tourne dans le worker de fond (lib/kene/diag-jobs).
// Le front suit la progression via GET /api/diagnoses/[id] (poll 1,8 s).
// | GET ?userId= — historique (inchangé).
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
    const { userId, zone, image } = parsed.data;

    // Validation d'upload 2026 (t. 86-e) : MIME + taille + magic bytes —
    // une dataURL hostile ne rentre JAMAIS en base ni dans le moteur VLM.
    const upload = checkImageDataUrl(image);
    if (!upload.ok) {
      void audit({ kind: "upload_reject", userId, ip: clientIp(req), detail: upload.reason });
      return jsonError(`Photo refusée — ${upload.reason}`, 415);
    }
    // (fitzpatrick/allergies restent validés par le contrat zod — le worker
    // les relit depuis le profil de la cliente côté serveur.)

    // Garde de session (t. 71-b, intégration 71-e) : si un cookie de session
    // valide est présent, le userId revendiqué doit être celui de la session
    // (401 « Session invalide pour ce compte ») — sans cookie, comportement
    // historique conservé (session POC legacy + warning loggé).
    const guard = guardUserClaim(req, "diagnoses:create", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    // Quota d'abonnement (t. 71-c, intégration 71-e) : plan gratuit =
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
    const diagnosis = await db.diagnosis.create({
      data: { userId, zone, imageData: image, resultJson: "", status: "pending" },
    });

    // 2. Analyse VLM (10-45 s) : lancée en tâche de fond, on NE l'attend PAS
    //    (fire-and-forget — l'ancien await ici bloquait la réponse 20-45 s et
    //    déclenchait les 502 du gateway en fin de diagnostic).
    void processDiagnosisJob(diagnosis.id);

    // 3. Réponse immédiate 202 : payload { diagnosis } compatible 66-b, le
    //    champ status vaut "pending" au moment de la réponse — c'est le but.
    return NextResponse.json({ diagnosis }, { status: 202 });
  } catch (err) {
    return serverError("diagnoses", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);
    // Garde de session (t. 71-e) : claim query vs cookie si session présente.
    const guard = guardUserClaim(req, "diagnoses:get", userId);
    if (guard) return guard;
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
