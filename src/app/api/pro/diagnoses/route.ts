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
import { scoreQuestionnaire, mergeResults, missingRequired, QUESTIONS } from "@/lib/kene/questionnaire";
import type { QAnswers } from "@/lib/kene/questionnaire";
import { jsonError, serverError, notify, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, PRO_DIAGNOSES } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const zoneIds = BODY_ZONES.map((z2) => z2.id) as [string, ...string[]];

const answerValue = z.union([z.string().max(400), z.array(z.string().max(80)).max(12)]);

const Body = z.object({
  tenantId: z.string().min(1),
  zone: z.enum(zoneIds),
  answers: z.record(z.string(), answerValue),
  clientProfileId: z.string().optional(),
  client: z.object({ name: z.string().min(2).max(80), phone: z.string().min(8).max(20) }).optional(),
  photo: z.string().startsWith("data:image/").optional(),
  practitioner: z.string().max(80).optional(),
  // Consentements recueillis en cabine — obligatoires avant tout
  // diagnostic: photos ET données de peau. La fiche papier porte la
  // signature; ici la trace numérique horodatée.
  consent: z.object({ photo: z.boolean(), data: z.boolean() }),
});

/** Réponses admissibles uniquement pour les questions déclarées (anti-spam). */
function sanitizeAnswers(answers: QAnswers): QAnswers {
  const out: QAnswers = {};
  const ids = new Set(QUESTIONS.map((q) => q.id));
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
    // Session signée (, migration douce): avec cookie, le diagnostic
    // en institut exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:diagnoses:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return jsonError(
        issue?.path?.[0] === "zone"
          ? `Zone invalide (zones : ${zoneIds.join(", ")})`
          : issue?.path?.[0] === "photo"
            ? "Photo invalide (dataURL attendu)"
            : "Corps de requête invalide",
        400
      );
    }
    const { zone, photo, practitioner } = parsed.data;
    if (!parsed.data.consent?.photo || !parsed.data.consent?.data) {
      return jsonError("Les consentements de la cliente (photos + données de peau) doivent être recueillis avant le diagnostic — cochez les deux cases à l'étape cliente", 400);
    }
    const answers = sanitizeAnswers(parsed.data.answers as QAnswers);

    const tenant = await resolveTenant(req, parsed.data.tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

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
    const client = await db.clientProfile.findUnique({ where: { id: clientProfileId } });
    if (!client) return jsonError("Fiche cliente introuvable", 404);

    // 2. Questionnaire complet?
    const missing = missingRequired(answers);
    if (missing.length > 0) {
      return jsonError(`Questionnaire incomplet — ${missing.length} réponse(s) manquante(s)`, 400);
    }

    // 3. Scoring déclaratif + analyse VLM de la photo (optionnelle)
    const qr = scoreQuestionnaire(answers, zone as BodyZone);
    const allergies = typeof answers.allergies === "string" && answers.allergies.trim() ? answers.allergies.trim() : undefined;
    let vlm = null as Awaited<ReturnType<typeof runDiagnosis>> | null;
    if (photo) {
      vlm = await runDiagnosis({
        imageBase64: photo,
        zone: zone as BodyZone,
        fitzpatrick: typeof answers.fitz === "string" ? answers.fitz : undefined,
        allergies,
      });
    }
    const result = mergeResults(qr, vlm, zone as BodyZone, Boolean(photo));

    // 4. Persistance + mise à jour de la fiche CRM (le diagnostic EST une visite)
    const diagnosis = await db.proDiagnosis.create({
      data: {
        tenantId: tenant.id,
        clientProfileId: client.id,
        userId: client.userId,
        zone,
        practitioner: practitioner?.trim() || null,
        questionnaireJson: JSON.stringify(answers),
        photoData: photo ?? null,
        resultJson: JSON.stringify(result),
        scoreGlobal: result.score_global,
        vlmUsed: Boolean(vlm && result.source === "vlm+questionnaire"),
        photoUsed: Boolean(photo),
        consentPhoto: parsed.data.consent.photo,
        consentData: parsed.data.consent.data,
        consentTs: new Date(),
      },
    });

    // Trace du consentement institut sur le registre Consent de la cliente
    // (si elle est sur l'app) — même vocabulaire que l'onboarding.
    if (client.userId) {
      await db.consent.createMany({
        data: [
          { userId: client.userId, type: "photo_storage", granted: true },
          { userId: client.userId, type: "skin_data", granted: true },
        ],
      });
    }

    await db.clientProfile.update({
      where: { id: client.id },
      data: {
        visitsCount: { increment: 1 },
        lastVisit: new Date(),
        skinType: typeof answers.skin_type === "string" ? answers.skin_type : client.skinType,
        fitzpatrick: typeof answers.fitz === "string" ? answers.fitz : client.fitzpatrick,
        notes:
          typeof answers.notes === "string" && answers.notes.trim()
            ? `${client.notes ? `${client.notes} · ` : ""}[${zone}] ${answers.notes.trim().slice(0, 160)}`
            : client.notes,
      },
    });

    // 5. La cliente est sur l'app Kènè → elle est informée tout de suite
    if (client.userId) {
      const prenom = (client.name.split(/\s+/)[0] ?? client.name).trim();
      await notify({
        userId: client.userId,
        tenantId: tenant.id,
        channel: "whatsapp",
        toPhone: client.phone,
        message: `Kènè ✨ ${prenom}, ton diagnostic à l'institut ${tenant.name} est enregistré : score ${result.score_global}/100. ${
          result.questionnaire.flags.some((f) => f.level === "danger" || f.level === "warn")
            ? "Des points de vigilance ont été notés — ta praticienne te les expliquera."
            : "Ta praticienne a la routine détaillée pour toi."
        }`,
        metaJson: JSON.stringify({ proDiagId: diagnosis.id }),
      });
    }

    return NextResponse.json(
      { diagnosis: { ...diagnosis, clientName: client.name, reusedClient }, result },
      { status: 201 }
    );
  } catch (err) {
    return serverError("pro/diagnoses:POST", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
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
        scoreGlobal: true,
        vlmUsed: true,
        photoUsed: true,
        consentPhoto: true,
        consentData: true,
        consentTs: true,
        createdAt: true,
        userId: true,
        clientProfile: { select: { name: true, phone: true } },
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
      diagnoses: rows.map((r) => ({ ...r, clientName: r.clientProfile?.name ?? "Cliente" })),
      kpis,
    });
  } catch (err) {
    return serverError("pro/diagnoses:GET", err);
  }
}
