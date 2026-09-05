// GET /api/pro/clients/[id] — fiche client 360° (ventes, RDV, diagnostics, RFM recalculé)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfmScore } from "@/lib/kene/rfm";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Session signée (t. 71-b, migration douce) : GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin ; sans cookie → legacy.
    const guard = guardProRole(req, "pro:clients:[id]:get");
    if (guard) return guard;

    const { id } = await params;
    const client = await db.clientProfile.findUnique({ where: { id } });
    if (!client) return jsonError("Fiche cliente introuvable", 404);

    const since12m = new Date();
    since12m.setFullYear(since12m.getFullYear() - 1);

    const [sales, appointments, sales12m, diagnoses, proDiagnoses] = await Promise.all([
      db.sale.findMany({
        where: { clientProfileId: id },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.appointment.findMany({
        where: { clientProfileId: id },
        include: { service: { select: { name: true } } },
        orderBy: { startAt: "desc" },
        take: 10,
      }),
      db.sale.findMany({
        where: { clientProfileId: id, status: "completed", createdAt: { gte: since12m } },
        select: { total: true },
      }),
      client.userId
        ? db.diagnosis.findMany({
            where: { userId: client.userId, status: "done" },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      // Diagnostics réalisés EN INSTITUT (questionnaire ± photo) — l'activité
      // de l'entreprise elle-même, distincte des self-scans de la cliente.
      db.proDiagnosis.findMany({
        where: { clientProfileId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // RFM recalculé à la volée (non persisté)
    const recencyDays = client.lastVisit
      ? Math.max(0, Math.floor((Date.now() - client.lastVisit.getTime()) / 86_400_000))
      : 999;
    const monetary12m = sales12m.reduce((s, x) => s + x.total, 0);
    const rfm = rfmScore(recencyDays, sales12m.length, monetary12m);

    return NextResponse.json({
      client: { ...client, rfm },
      sales,
      appointments,
      diagnoses,
      proDiagnoses,
    });
  } catch (err) {
    return serverError("pro/clients/[id]", err);
  }
}
