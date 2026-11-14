// POST /api/pro/diagnoses — diagnostic en institut: questionnaire ± photo (VLM)
// GET /api/pro/diagnoses?tenantId=&clientId= — historique institut + KPIs
// L'entreprise réalise le diagnostic au sein de sa structure: la praticienne
// mène l'entretien (questionnaire structuré), prend éventuellement une photo
// en cabine → le moteur fusionne déclaratif (38 %) et observation VLM (62 %),
// sauvegarde dans le CRM et notifie la cliente si elle est sur l'app Kènè.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runDiagnosis } from "@/lib/ai/vlm";
import { BODY_ZONES } from "@/lib/kene/types";
import type { BodyZone } from "@/lib/kene/types";
import {
  scoreQuestionnaire,
  mergeResults,
  missingRequired,
  missingRequiredForZones,
  getQuestionsForZone,
  getQuestionsForZones,
  buildMultiZoneSynthesis,
  summarizeQuestionnaireContextForVlm,
  QUESTIONS,
} from "@/lib/kene/questionnaire";
import type { QAnswers } from "@/lib/kene/questionnaire";
import { recommend4SpectralSlots } from "@/lib/kene/types";
import { jsonError, serverError, notify, resolveTenant } from "@/lib/kene/server";
import { pushTenantFeed, pushFeed } from "@/lib/kene/realtime";
import { guardProRole } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, PRO_DIAGNOSES } from "@/lib/kene/rate-limit";
import { checkImageDataUrl } from "@/lib/kene/upload";
import { getActiveLeaveForEmployee, formatLeaveBlockedMessage } from "@/lib/kene/leaves";
import { canonicalPhone } from "@/lib/kene/phone-normalize";
import { proDiagQuotaFor } from "@/lib/kene/plans";

export const runtime = "nodejs";
export const maxDuration = 60;

const zoneIds = BODY_ZONES.map((z2) => z2.id) as [string, ...string[]];

const answerValue = z.union([z.string().max(400), z.array(z.string().max(80)).max(12)]);

const Body = z.object({
  tenantId: z.string().min(1),
  zone: z.enum(zoneIds).optional(), // Zone principale ou première zone
  zones: z.array(z.enum(zoneIds)).min(1).max(6).optional(), // Liste Multi-Zones de la séance
  answers: z.record(z.string(), answerValue),
  clientProfileId: z.string().optional(),
  client: z.object({ name: z.string().min(2).max(80), phone: z.string().min(8).max(20) }).optional(),
  photo: z.string().startsWith("data:image/").optional(),
  photos: z.array(z.string().startsWith("data:image/")).max(5).optional(),
  // Photos mappées par zone en mode Multi-Zones
  photosByZone: z.record(z.string(), z.array(z.string().startsWith("data:image/"))).optional(),
  practitioner: z.string().max(80).optional(),
  sessionId: z.string().optional(), // Identifiant unifié de séance cabine
  // Consentements recueillis en cabine — obligatoires avant tout
  // diagnostic: photos ET données de peau. La fiche papier porte la
  // signature; ici la trace numérique horodatée.
  consent: z.object({ photo: z.boolean(), data: z.boolean() }),
});

/** Réponses admissibles uniquement pour les questions déclarées de la zone ou des zones (anti-spam). */
function sanitizeAnswers(answers: QAnswers, zones: BodyZone[] = ["visage"]): QAnswers {
  const out: QAnswers = {};
  const ids = new Set(getQuestionsForZones(zones).map((q) => q.id));
  for (const [k, v] of Object.entries(answers)) {
    if (!ids.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 400);
    else if (Array.isArray(v)) out[k] = v.slice(0, 12).map((x) => String(x).slice(0, 80));
  }
  return out;
}

export async function POST(req: NextRequest) {
  // Route coûteuse (questionnaire ± photo VLM en cabine): 10/min par IP.
  const rl = rateLimit(rlKey(req, "pro:diagnoses"), PRO_DIAGNOSES);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Diagnostic en institut très sollicité — reprends dans quelques secondes");
  }
  try {
    // Session signée (migration douce): avec cookie, le diagnostic
    // en institut exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:diagnoses:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return jsonError(
        issue?.path?.[0] === "zone"
          ? `Zone invalide (zones : ${zoneIds.join(", ")})`
          : issue?.path?.[0] === "photo" || issue?.path?.[0] === "photos"
            ? "Photo invalide (dataURL attendu)"
            : "Corps de requête invalide",
        400
      );
    }
    const requestedZones: BodyZone[] =
      parsed.data.zones && parsed.data.zones.length > 0
        ? (parsed.data.zones as BodyZone[])
        : parsed.data.zone
        ? [parsed.data.zone as BodyZone]
        : ["visage"];
    const primaryZone = requestedZones[0] || "visage";
    const sessionId = parsed.data.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const isMultiZone = requestedZones.length > 1;

    const { photo, photos, photosByZone, practitioner } = parsed.data;
    if (!parsed.data.consent?.photo || !parsed.data.consent?.data) {
      return jsonError("Les consentements de la cliente (photos + données de peau) doivent être recueillis avant le diagnostic — cochez les deux cases à l'étape cliente", 400);
    }

    // Validation des photos (globales ou par zone)
    const rawPhotosMap: Record<BodyZone, string[]> = {} as any;
    for (const z of requestedZones) {
      const zPhotos = photosByZone?.[z] || (z === primaryZone ? (photos && photos.length > 0 ? photos : photo ? [photo] : []) : []);
      for (let i = 0; i < zPhotos.length; i++) {
        const upload = checkImageDataUrl(zPhotos[i]);
        if (!upload.ok) {
          return jsonError(`Photo ${i + 1} de la zone ${z} refusée — ${upload.reason}`, 415);
        }
      }
      rawPhotosMap[z] = zPhotos;
    }

    const answers = sanitizeAnswers(parsed.data.answers as QAnswers, requestedZones);

    const tenant = await resolveTenant(req, parsed.data.tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Contrôle du quota de bilans cutanés IA en cabine (3 offerts/mois sans abonnement, illimité avec abonnement Pro)
    const diagQuota = await proDiagQuotaFor(tenant.id);
    if (diagQuota.remaining <= 0) {
      return NextResponse.json(
        {
          error: "Votre institut a utilisé ses 3 bilans de peau cabine gratuits ce mois-ci. Activez votre formule Kènè Pro (Starter, Institut ou Complexe) pour réaliser des diagnostics dermo-biométriques illimités avec vos clientes !",
          quotaExceeded: true,
          quota: diagQuota,
        },
        { status: 403 }
      );
    }

    // Règle d'entreprise : une praticienne en congé ne peut pas réaliser de diagnostic cabine
    if (practitioner && practitioner.trim().length > 0) {
      const onLeave = await getActiveLeaveForEmployee(
        { tenantId: tenant.id, name: practitioner.trim() },
        new Date()
      );
      if (onLeave) {
        return jsonError(formatLeaveBlockedMessage(onLeave, "réaliser un diagnostic cabine"), 400);
      }
    }

    // 1. Cliente: fiche CRM existante OU création express (anti-doublon téléphones)
    let clientProfileId = parsed.data.clientProfileId ?? null;
    let reusedClient = false;
    if (clientProfileId) {
      const found = await db.clientProfile.findFirst({ where: { id: clientProfileId, tenantId: tenant.id } });
      if (!found) return jsonError("Fiche cliente introuvable dans cet institut", 404);
      reusedClient = true;
    } else if (parsed.data.client) {
      const digits = parsed.data.client.phone.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) return jsonError("Téléphone invalide (8 à 15 chiffres)");
      const tail = digits.slice(-10);
      const roster = await db.clientProfile.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, phone: true },
      });
      const existingId = roster.find((c) => c.phone.replace(/\D/g, "").endsWith(tail))?.id;
      if (existingId) {
        clientProfileId = existingId;
        reusedClient = true;
      } else {
        const created = await db.clientProfile.create({
          data: {
            tenantId: tenant.id,
            name: parsed.data.client.name.trim().replace(/\s+/g, " "),
            phone: parsed.data.client.phone.trim(),
            rfmSegment: "Nouveau",
            notes: "Créée express depuis le diagnostic en cabine",
          },
        });
        clientProfileId = created.id;
      }
    } else {
      return jsonError("Cliente requise : fiche CRM existante ou création express (nom + téléphone)", 400);
    }
    let client = await db.clientProfile.findUnique({ where: { id: clientProfileId } });
    if (!client) return jsonError("Fiche cliente introuvable", 404);

    // Rapprochement automatique vers le compte Utilisatrice s'il existe sur l'app
    let matchedUserId = client.userId;
    if (!matchedUserId && client.phone) {
      const canon = canonicalPhone(client.phone);
      const digits = canon.replace(/\D/g, "");
      const tail = digits.length >= 8 ? digits.slice(-8) : digits;
      const matchedUser = await db.user.findFirst({
        where: {
          OR: [
            { phone: canon },
            ...(tail ? [{ phone: { contains: tail } }] : []),
          ],
        },
        select: { id: true },
      });
      if (matchedUser) {
        matchedUserId = matchedUser.id;
        await db.clientProfile.update({
          where: { id: client.id },
          data: { userId: matchedUser.id },
        }).catch(() => null);
      }
    }

    // 2. Questionnaire complet?
    const missing = isMultiZone
      ? missingRequiredForZones(answers, requestedZones)
      : missingRequired(answers, primaryZone);
    if (missing.length > 0) {
      return jsonError(`Questionnaire incomplet — ${missing.length} réponse(s) manquante(s)`, 400);
    }

    // 3. Scoring et analyses VLM pour chaque zone en parallèle
    const allergies = typeof answers.allergies === "string" && answers.allergies.trim() ? answers.allergies.trim() : undefined;
    const fitzVal = typeof answers.fitz === "string" ? answers.fitz : undefined;

    const zoneDiagnosisPromises = requestedZones.map(async (currZone) => {
      const qr = scoreQuestionnaire(answers, currZone);
      const currPhotos = rawPhotosMap[currZone] || [];
      let vlm = null as Awaited<ReturnType<typeof runDiagnosis>> | null;
      if (currPhotos.length > 0) {
        const clinicalContext = summarizeQuestionnaireContextForVlm(answers, qr, currZone);
        const lastProDiag = await db.proDiagnosis
          .findFirst({
            where: { clientProfileId: client.id, zone: currZone },
            orderBy: { createdAt: "desc" },
            select: { scoreGlobal: true, createdAt: true },
          })
          .catch(() => null);
        const previousSummary = lastProDiag
          ? `Score précédent ${lastProDiag.scoreGlobal}/100 (${new Date(lastProDiag.createdAt).toLocaleDateString("fr-FR")})`
          : undefined;

        vlm = await runDiagnosis({
          images: currPhotos,
          zone: currZone,
          fitzpatrick: fitzVal,
          allergies,
          clinicalContext,
          previousSummary,
        }).catch((err) => {
          console.warn(`[pro/diagnoses] VLM warning for zone ${currZone}:`, err);
          return null;
        });
      }
      const res = mergeResults(qr, vlm, currZone, currPhotos.length > 0);
      const initialReportSlots = recommend4SpectralSlots(res.indicateurs, currPhotos.length);
      (res as any).reportSlots = initialReportSlots;
      (res as any).sessionId = sessionId;
      return {
        zone: currZone,
        result: res,
        rawPhotos: currPhotos,
        vlmUsed: Boolean(vlm && res.source === "vlm+questionnaire"),
        photoUsed: currPhotos.length > 0,
      };
    });

    const evaluatedZones = await Promise.all(zoneDiagnosisPromises);

    // Synthèse clinique multi-zones (corrélations, alternance soir & mutualisation)
    const synthesis = isMultiZone
      ? buildMultiZoneSynthesis(sessionId, evaluatedZones, answers)
      : null;

    // 4. Persistance des enregistrements ProDiagnosis
    const createdDiagnoses: Array<any> = [];

    for (let i = 0; i < evaluatedZones.length; i++) {
      const ez = evaluatedZones[i];
      const currResult = { ...ez.result };
      if (synthesis) {
        currResult.multiZoneSession = synthesis;
      }
      const photoDataToStore = ez.rawPhotos.length === 0 ? null : ez.rawPhotos.length === 1 ? ez.rawPhotos[0] : JSON.stringify(ez.rawPhotos);

      const created = await db.proDiagnosis.create({
        data: {
          tenantId: tenant.id,
          clientProfileId: client.id,
          userId: matchedUserId || client.userId,
          zone: ez.zone,
          practitioner: practitioner?.trim() || null,
          questionnaireJson: JSON.stringify(answers),
          photoData: photoDataToStore,
          resultJson: JSON.stringify(currResult),
          scoreGlobal: currResult.score_global,
          vlmUsed: ez.vlmUsed,
          photoUsed: ez.photoUsed,
          consentPhoto: parsed.data.consent.photo,
          consentData: parsed.data.consent.data,
          consentTs: new Date(),
        },
      });

      createdDiagnoses.push({
        ...created,
        result: currResult,
      });
    }

    // Mettre à jour les ids de diagnostic dans la synthèse si multi-zone
    if (synthesis) {
      synthesis.zoneSummaries.forEach((zs) => {
        const matching = createdDiagnoses.find((cd) => cd.zone === zs.zone);
        if (matching) zs.diagnosisId = matching.id;
      });
    }

    // Le premier ou diagnostic principal
    const primaryDiagnosis = createdDiagnoses[0];
    const primaryResult = primaryDiagnosis.result;

    // Trace du consentement institut sur le registre Consent de la cliente (1 seule fois)
    const effectiveUserId = matchedUserId || client.userId;
    if (effectiveUserId) {
      await db.consent.createMany({
        data: [
          { userId: effectiveUserId, type: "photo_storage", granted: true },
          { userId: effectiveUserId, type: "skin_data", granted: true },
        ],
      });
    }

    // Mise à jour de la fiche CRM (1 SEULE VISITE COMPTABILISÉE pour toute la séance)
    const zonesSummaryTag = requestedZones.join(", ");
    await db.clientProfile.update({
      where: { id: client.id },
      data: {
        visitsCount: { increment: 1 },
        lastVisit: new Date(),
        skinType: typeof answers.skin_type === "string" ? answers.skin_type : client.skinType,
        fitzpatrick: typeof answers.fitz === "string" ? answers.fitz : client.fitzpatrick,
        notes:
          typeof answers.notes === "string" && answers.notes.trim()
            ? `${client.notes ? `${client.notes} · ` : ""}[${zonesSummaryTag}] ${answers.notes.trim().slice(0, 160)}`
            : client.notes,
      },
    });

    // 5. La cliente est sur l'app Kènè → 1 SEULE NOTIFICATION WhatsApp consolidée
    if (client.userId) {
      const prenom = (client.name.split(/\s+/)[0] ?? client.name).trim();
      const scoreToShow = synthesis ? synthesis.weightedScoreGlobal : primaryResult.score_global;
      const zoneLabelText = isMultiZone
        ? `${requestedZones.length} zones (${requestedZones.join(", ")})`
        : primaryZone;

      await notify({
        userId: client.userId,
        tenantId: tenant.id,
        channel: "whatsapp",
        toPhone: client.phone,
        message: `Kènè 🌿 ${prenom}, ton diagnostic cabine (${zoneLabelText}) à l'institut ${tenant.name} est enregistré : score global ${scoreToShow}/100. ${
          synthesis && synthesis.correlations.length > 0
            ? "Un protocole d'alternance et de soin coordonné a été établi par ta praticienne."
            : primaryResult.questionnaire.flags.some((f: any) => f.level === "danger" || f.level === "warn")
            ? "Des points de vigilance ont été notés — ta praticienne te les expliquera."
            : "Ta praticienne a la routine détaillée pour toi."
        }`,
        metaJson: JSON.stringify({
          proDiagId: primaryDiagnosis.id,
          sessionId,
          type: "pro_diagnosis",
          multiZone: isMultiZone,
          zones: requestedZones,
        }),
      });
      pushFeed(client.userId);
    }

    pushTenantFeed(tenant.id);

    return NextResponse.json(
      {
        diagnosis: { ...primaryDiagnosis, clientName: client.name, reusedClient },
        result: primaryResult,
        session: synthesis || undefined,
        diagnoses: createdDiagnoses.map((cd) => ({
          id: cd.id,
          zone: cd.zone,
          scoreGlobal: cd.scoreGlobal,
          vlmUsed: cd.vlmUsed,
          result: cd.result,
        })),
      },
      { status: 201 }
    );
  } catch (err) {
    return serverError("pro/diagnoses:POST", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    // Session signée (migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:diagnoses:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);
    const clientId = req.nextUrl.searchParams.get("clientId");

    const rows = await db.proDiagnosis.findMany({
      where: { tenantId: tenant.id, ...(clientId ? { clientProfileId: clientId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        tenantId: true,
        clientProfileId: true,
        zone: true,
        practitioner: true,
        questionnaireJson: true,
        resultJson: true,
        photoData: true,
        scoreGlobal: true,
        vlmUsed: true,
        photoUsed: true,
        consentPhoto: true,
        consentData: true,
        consentTs: true,
        createdAt: true,
        userId: true,
        clientProfile: { select: { name: true, phone: true, cosmeticsUsed: true } },
      },
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const kpis = {
      monthCount: rows.filter((r) => r.createdAt >= monthStart).length,
      avgScore: rows.length ? Math.round(rows.reduce((s, r) => s + r.scoreGlobal, 0) / rows.length) : 0,
      photoShare: rows.length ? Math.round((rows.filter((r) => r.vlmUsed).length / rows.length) * 100) : 0,
      total: rows.length,
    };

    return NextResponse.json({
      diagnoses: rows.map((r) => {
        let parsedResult: any = null;
        try {
          parsedResult = JSON.parse(r.resultJson);
        } catch {
          parsedResult = null;
        }

        // Si reportSlots n'est pas encore défini et que plusieurs photos existent, auto-injecter la recommandation distribuée
        if (parsedResult && (!parsedResult.reportSlots || parsedResult.reportSlots.length !== 4)) {
          let count = 1;
          if (r.photoData) {
            try {
              const p = JSON.parse(r.photoData);
              if (Array.isArray(p)) count = p.length;
            } catch {
              count = 1;
            }
          }
          parsedResult.reportSlots = recommend4SpectralSlots(parsedResult.indicateurs, count);
        }

        return {
          ...r,
          resultJson: parsedResult ? JSON.stringify(parsedResult) : r.resultJson,
          clientName: r.clientProfile?.name ?? "Cliente",
          clientPhone: r.clientProfile?.phone ?? "",
          cosmeticsUsed: r.clientProfile?.cosmeticsUsed ?? null,
        };
      }),
      kpis,
    });
  } catch (err) {
    return serverError("pro/diagnoses:GET", err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:diagnoses:patch");
    if (guard) return guard;

    const body = await req.json().catch(() => null);
    const id = body?.id as string | undefined;
    const tenantId = body?.tenantId as string | undefined;
    const reportSlots = body?.reportSlots;
    const recommandations = body?.recommandations;

    if (!id || typeof id !== "string") return jsonError("Identifiant du diagnostic requis", 400);
    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const proDiag = await db.proDiagnosis.findUnique({ where: { id } });
    if (!proDiag || proDiag.tenantId !== tenant.id) {
      return jsonError("Diagnostic cabine introuvable", 404);
    }

    let parsedResult: Record<string, unknown> = {};
    try {
      parsedResult = JSON.parse(proDiag.resultJson);
    } catch {
      parsedResult = {};
    }

    if (Array.isArray(reportSlots)) {
      parsedResult.reportSlots = reportSlots;
    }

    if (recommandations && typeof recommandations === "object") {
      parsedResult.recommandations = {
        ...(typeof parsedResult.recommandations === "object" && parsedResult.recommandations !== null
          ? parsedResult.recommandations
          : {}),
        ...recommandations,
      };
    }

    const updated = await db.proDiagnosis.update({
      where: { id },
      data: {
        resultJson: JSON.stringify(parsedResult),
      },
    });

    return NextResponse.json({ ok: true, diagnosis: updated });
  } catch (err) {
    return serverError("pro/diagnoses:PATCH", err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:diagnoses:delete");
    if (guard) return guard;

    const id = req.nextUrl.searchParams.get("id");
    const tenantId = req.nextUrl.searchParams.get("tenantId");

    if (!id) return jsonError("Identifiant du diagnostic requis", 400);
    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const proDiag = await db.proDiagnosis.findUnique({ where: { id } });
    if (!proDiag || proDiag.tenantId !== tenant.id) {
      return jsonError("Diagnostic cabine introuvable", 404);
    }

    await db.proDiagnosis.delete({ where: { id } });

    return NextResponse.json({ ok: true, deleted: true, message: "Diagnostic cabine supprimé avec succès." });
  } catch (err) {
    return serverError("pro/diagnoses:DELETE", err);
  }
}
