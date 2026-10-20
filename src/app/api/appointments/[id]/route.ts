// DELETE /api/appointments/[id] — suppression d'un rendez-vous passé ou annulé de l'agenda
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sess = sessionFromRequest(req);
    const userIdQuery = req.nextUrl.searchParams.get("userId");
    const userId = sess?.userId || userIdQuery;

    const appt = await db.appointment.findUnique({ where: { id } });
    if (!appt) return jsonError("Rendez-vous introuvable", 404);

    if (userId && appt.userId !== userId && sess?.role !== "admin" && sess?.role !== "pro") {
      return jsonError("Ce rendez-vous ne vous appartient pas", 403);
    }

    // Si le rendez-vous est confirmé et à venir, on invite à l'annuler pour gérer l'acompte
    if (appt.status === "confirmed" && new Date(appt.startAt).getTime() > Date.now()) {
      return jsonError("Veuillez d'abord annuler ce rendez-vous à venir pour traiter l'acompte", 400);
    }

    await db.appointment.delete({ where: { id } });

    return NextResponse.json({
      ok: true,
      deleted: true,
      message: "Rendez-vous supprimé de votre historique.",
    });
  } catch (err) {
    return serverError("appointments/[id]:DELETE", err);
  }
}
