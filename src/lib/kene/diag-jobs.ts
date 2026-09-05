// Kènè — Worker de diagnostic asynchrone (pipeline t. 71).
// POST /api/diagnoses crée la ligne "pending" et répond 202 en < 1 s ;
// l'analyse VLM (10-45 s) tourne ICI, en tâche de fond du même process Node
// (self-hosted node runtime : la promesse survit au retour de la réponse).
// Le front suit la progression via GET /api/diagnoses/[id] (poll 1,8 s).
//
// REPRISE AU BOOT : AUCUNE, volontairement. Si le serveur redémarre en plein
// job, la ligne reste "pending" en base et n'est jamais re-scannée au
// démarrage (un re-scan silencieux re-analyserait des photos sans que la
// cliente ne suive plus le résultat). C'est le timeout front (100 s) qui
// ramène la cliente vers l'état d'échec + Réessayer (nouvelle ligne).
import { db } from "@/lib/db";
import { runDiagnosis } from "@/lib/ai/vlm";
import { notify } from "@/lib/kene/server";
import type { BodyZone, DiagnosisResult } from "@/lib/kene/types";

// Anti double-traitement : Map des ids en cours (check-and-set AVANT tout
// traitement ; si déjà en cours → return immédiat). Posée sur globalThis pour
// survivre aux rechargements de modules en dev (HMR Turbopack) — même
// pattern que le store de rate-limit (src/lib/kene/rate-limit.ts).
const g = globalThis as typeof globalThis & { __keneDiagJobsInFlight?: Map<string, true> };
const inFlight: Map<string, true> = (g.__keneDiagJobsInFlight ??= new Map());

/**
 * Traite UN diagnostic "pending" : VLM + fallback → resultJson/scoreGlobal/
 * status "done"/vlmUsed, alerte nævi, rappel S+3, ping « prête ».
 * Fire-and-forget : `void processDiagnosisJob(id)` — ne JAMAIS await côté
 * route POST (c'est tout l'objet du pipeline asynchrone).
 */
export async function processDiagnosisJob(diagnosisId: string): Promise<void> {
  // Check-and-set : un seul worker par diagnostic (double POST, re-render de
  // route, HMR… ne relancent jamais l'analyse payée).
  if (inFlight.has(diagnosisId)) return;
  inFlight.set(diagnosisId, true);
  try {
    const diagnosis = await db.diagnosis.findUnique({ where: { id: diagnosisId } });
    if (!diagnosis || diagnosis.status !== "pending") return; // déjà traitée / supprimée
    const user = await db.user.findUnique({ where: { id: diagnosis.userId } });
    if (!user) return;

    // ── Analyse VLM (10-45 s, fallback déterministe intégré à runDiagnosis) ──
    const result = await runDiagnosis({
      imageBase64: diagnosis.imageData,
      zone: diagnosis.zone as BodyZone,
      fitzpatrick: user.fitzpatrick ?? undefined,
      allergies: user.allergies ?? undefined,
    });

    // Champ confiance (t. 71) : stocké DANS resultJson (la pastille front
    // lit `confidence`, en repli `source` pour les anciens diagnostics).
    const vlmUsed = result.source === "vlm";
    const enriched: DiagnosisResult = {
      ...result,
      confidence: result.confidence ?? (vlmUsed ? "haute" : "indicative"),
    };

    await db.diagnosis.update({
      where: { id: diagnosis.id },
      data: {
        resultJson: JSON.stringify(enriched),
        scoreGlobal: result.score_global,
        status: "done",
        vlmUsed,
      },
    });

    // Alerte dermatologique pour les nævi suspects (orientation ABCDE)
    if (diagnosis.zone === "naevi" && result.orientation_dermato) {
      await notify({
        userId: user.id,
        channel: "whatsapp",
        toPhone: user.phone,
        message: `⚠️ Kènè : votre analyse de nævi présente des signes suspects (${result.raison_orientation?.slice(0, 120) ?? "critères ABCDE"}). Nous vous recommandons de consulter un dermatologue sans délai. Prenez aussi RDV avec une dermo-conseillère partenaire via l'app.`,
      });
    }

    // Rappel automatique « contrôle de protocole » programmé à S+3 (annulé
    // si un nouveau scan survient — filtre GET /api/notifications).
    await notify({
      userId: user.id,
      channel: "whatsapp",
      toPhone: user.phone,
      message: `Kènè 🧴 ${(user.name.split(/\s+/)[0] ?? user.name).trim()}, ton protocole ${diagnosis.zone.replace("_", " ")} (score ${result.score_global}/100) suit son cours. Dans 3 semaines, refais ton diagnostic IA pour mesurer tes progrès et ajuster ta routine — ça prend 2 minutes.`,
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 21 * 86_400_000),
      metaJson: JSON.stringify({ diagId: diagnosis.id }),
    });

    // Ping court « prête » → la cloche + le socket feed (realtime.ts, via
    // notify()) poussent la notification en ~250 ms si la cliente est en
    // ligne — pendant qu'elle peut continuer à naviguer dans l'app.
    await notify({
      userId: user.id,
      channel: "whatsapp",
      toPhone: user.phone,
      message: `📸 Ton analyse est prête — score ${result.score_global}/100. Ouvre ton diagnostic Kènè.`,
    });
  } catch (err) {
    // Try/catch global : le job ne laisse JAMAIS une ligne en pending éternel
    // côté serveur — l'échec est matérialisé pour le poll front.
    console.error("[kene:diag-job]", diagnosisId, err instanceof Error ? err.message : err);
    try {
      await db.diagnosis.update({ where: { id: diagnosisId }, data: { status: "error" } });
    } catch {
      // ligne supprimée pendant le job : rien à faire
    }
  } finally {
    inFlight.delete(diagnosisId);
  }
}
