// GET /api/notifications?userId= — fil de rappels automatiques de la cliente.
// 1) BACKFILL idempotent : matérialise les rappels manquants pour les
//    diagnostics terminés (contrôle S+3) et les RDV confirmés à venir (J-1)
//    — fonctionne aussi pour les données créées avant la fonctionnalité.
//    Idempotence : la couverture lit les méta des notifications scheduled ET
//    sent récentes (un rappel déjà parti ne doit pas re-naître), et les
//    relances pro marquées traitées ferment le besoin côté cliente.
// 2) DUE-RUNNER : les rappels scheduled dont l'heure est venue passent à sent
//    (envoi simulé, POC).
// 3) FILTRE intelligent : les rappels périmés (RDV annulé, contrôle déjà fait
//    via un scan plus récent, relance pro déjà traitée) sont exclus du fil.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { readMeta, scheduledStillRelevant } from "@/lib/kene/reminders";

export const runtime = "nodejs";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const user = await db.user.findUnique({ where: { id: userId }, select: { phone: true, name: true } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const now = new Date();
    const first = (user.name.split(/\s+/)[0] ?? user.name).trim();

    /* ── 1) Backfill idempotent ─────────────────────────────── */

    const since90 = new Date(now.getTime() - 90 * DAY);
    const [diagnoses, upcomingAppts, existingMeta, doneMarksRaw] = await Promise.all([
      db.diagnosis.findMany({
        where: { userId, status: "done", createdAt: { gte: since90 } },
        select: { id: true, zone: true, scoreGlobal: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      db.appointment.findMany({
        where: { userId, startAt: { gte: new Date(now.getTime() - 12 * HOUR) }, status: { in: ["confirmed", "completed"] } },
        select: { id: true, startAt: true, status: true, service: { select: { name: true } }, tenant: { select: { name: true } } },
        orderBy: { startAt: "asc" },
      }),
      // Couverture : méta des notifications scheduled + sent des 60 derniers
      // jours — un rappel déjà parti (flippé sent par le due-runner) ne doit
      // pas être re-créé au backfill.
      db.notification.findMany({
        where: { userId, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } },
        select: { metaJson: true },
      }),
      db.followUpMark.findMany({ where: { status: "done" }, select: { dedupKey: true } }),
    ]);

    const coveredDiagIds = new Set<string>();
    const coveredApptIds = new Set<string>();
    for (const n of existingMeta) {
      const meta = readMeta(n.metaJson);
      if (meta.diagId) coveredDiagIds.add(meta.diagId);
      if (meta.apptId) coveredApptIds.add(meta.apptId);
    }
    // Relances pro déjà traitées : le rappel automatique cliente est un doublon
    const handledDiagIds = new Set<string>();
    const handledDedupKeys = new Set<string>();
    for (const m of doneMarksRaw) {
      if (m.dedupKey.startsWith("diag:")) {
        handledDiagIds.add(m.dedupKey.slice(5));
        handledDedupKeys.add(m.dedupKey);
      }
    }

    // Dernier diagnostic par zone (desc) : un rappel de contrôle S+3 chacun.
    const lastByZone = new Map<string, (typeof diagnoses)[number]>();
    for (const d of diagnoses) if (!lastByZone.has(d.zone)) lastByZone.set(d.zone, d);

    const toCreate: {
      userId: string;
      channel: string;
      toPhone: string;
      message: string;
      status: string;
      scheduledAt: Date;
      metaJson: string;
    }[] = [];

    for (const d of lastByZone.values()) {
      const dueAt = new Date(new Date(d.createdAt).getTime() + 21 * DAY);
      if (dueAt.getTime() < now.getTime() - 21 * DAY) continue; // protocole clos (S+6)
      if (coveredDiagIds.has(d.id)) continue; // rappel déjà créé (programmé ou parti)
      if (handledDiagIds.has(d.id)) continue; // la pro a déjà relancé pour ce diag
      toCreate.push({
        userId,
        channel: "whatsapp",
        toPhone: user.phone,
        message: `Kènè 🧴 ${first}, ton protocole ${d.zone.replace("_", " ")} (score ${d.scoreGlobal}/100) suit son cours. Dans 3 semaines, refais ton diagnostic IA pour mesurer tes progrès et ajuster ta routine — ça prend 2 minutes.`,
        status: "scheduled",
        scheduledAt: dueAt,
        metaJson: JSON.stringify({ diagId: d.id }),
      });
    }

    // Rappel J-1 : RDV confirmés à venir, sans rappel existant.
    for (const a of upcomingAppts) {
      if (a.status !== "confirmed") continue;
      if (new Date(a.startAt).getTime() <= now.getTime()) continue;
      if (coveredApptIds.has(a.id)) continue;
      const fireAt = new Date(new Date(a.startAt).getTime() - 24 * HOUR);
      if (fireAt.getTime() < now.getTime() - 24 * HOUR) continue; // fenêtre J-1 dépassée
      toCreate.push({
        userId,
        channel: "whatsapp",
        toPhone: user.phone,
        message: `Kènè ✨ ${first}, petit rappel : ${a.service?.name ?? "ton soin"} chez ${a.tenant?.name ?? "l'institut"} le ${new Date(a.startAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}. Préviens-nous si tu dois déplacer, sinon on t'attend avec plaisir !`,
        status: "scheduled",
        scheduledAt: fireAt,
        metaJson: JSON.stringify({ apptId: a.id }),
      });
    }

    if (toCreate.length > 0) {
      await db.notification.createMany({ data: toCreate });
    }

    /* ── 2) Due-runner : échéance venue → envoyé (POC) ────────── */

    await db.notification.updateMany({
      where: { userId, status: "scheduled", scheduledAt: { lte: now } },
      data: { status: "sent" },
    });

    /* ── 3) Lecture du fil (sent 30 j + scheduled pertinents) ── */

    const [sentRaw, scheduledRaw, allDiags, futureAppts] = await Promise.all([
      db.notification.findMany({
        where: { userId, status: "sent", createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.notification.findMany({
        where: { userId, status: "scheduled" },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      }),
      db.diagnosis.findMany({
        where: { userId, status: "done" },
        select: { id: true, zone: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      db.appointment.findMany({
        where: { userId, startAt: { gte: now }, status: { in: ["confirmed", "pending", "completed"] } },
        select: { id: true },
      }),
    ]);

    const latestByZoneAll = new Map<string, string>(); // zone → diagId le plus récent
    for (const d of allDiags) if (!latestByZoneAll.has(d.zone)) latestByZoneAll.set(d.zone, d.id);
    const latestDiagIds = new Set(latestByZoneAll.values());
    const knownDiagIds = new Set(allDiags.map((x) => x.id));
    // handledDedupKeys ne garde que les marques pointant un diag de la cliente
    for (const k of [...handledDedupKeys]) {
      const diagId = k.slice(5);
      if (!knownDiagIds.has(diagId)) handledDedupKeys.delete(k);
    }

    const futureApptIds = new Set(futureAppts.map((x) => x.id));

    const scheduled = scheduledRaw
      .map((n) => ({
        id: n.id,
        channel: n.channel,
        message: n.message,
        status: n.status,
        scheduledAt: n.scheduledAt ? n.scheduledAt.toISOString() : null,
        metaJson: n.metaJson,
        createdAt: n.createdAt.toISOString(),
      }))
      .filter((n) => scheduledStillRelevant(n, { futureApptIds, latestDiagIds, handledDedupKeys }));

    const sent = sentRaw.map((n) => ({
      id: n.id,
      channel: n.channel,
      message: n.message,
      status: n.status,
      scheduledAt: n.scheduledAt ? n.scheduledAt.toISOString() : null,
      metaJson: n.metaJson,
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({ scheduled, sent, created: toCreate.length });
  } catch (err) {
    return serverError("notifications", err);
  }
}
