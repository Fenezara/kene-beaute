// GET /api/diagnoses/[id] — statut d'un diagnostic (voie de poll du front,).
// Renvoie la ligne complète: le front lit `status` (pending | done | error),
// puis resultJson + scoreGlobal dès que le worker (lib/kene/diag-jobs) a fini.
// Ligne complète volontairement (imageData inclus): la reprise au montage de
// l'écran (cliente revenue pendant l'analyse) s'appuie dessus.
// Propriété: si une session valide est présente, la ligne ne peut
// être lue que par sa propriétaire — sans cookie (notify/POC legacy),
// comportement historique conservé.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest, warnLegacyNoCookie } from "@/lib/kene/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let diagnosis: any = await db.diagnosis.findUnique({ where: { id } });
    if (!diagnosis) {
      const pro = await db.proDiagnosis.findUnique({
        where: { id },
        include: { tenant: { select: { name: true } } },
      });
      if (pro) {
        diagnosis = {
          id: pro.id,
          userId: pro.userId,
          zone: pro.zone,
          imageData: pro.photoData ?? "",
          resultJson: pro.resultJson,
          scoreGlobal: pro.scoreGlobal,
          status: "done",
          createdAt: pro.createdAt,
          institut: pro.tenant?.name,
          practitioner: pro.practitioner ?? null,
        };
      }
    }
    if (!diagnosis) return jsonError("Diagnostic introuvable", 404);
    const sess = sessionFromRequest(req);
    if (sess) {
      if (diagnosis.userId !== sess.userId) {
        return jsonError("Session invalide pour ce compte", 401);
      }
    } else {
      warnLegacyNoCookie("diagnoses:get:id");
    }
    return NextResponse.json({ diagnosis });
  } catch (err) {
    return serverError("diagnoses/[id]", err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userIdQuery = req.nextUrl.searchParams.get("userId");
    const sess = sessionFromRequest(req);
    const userId = sess?.userId || userIdQuery;

    const diagnosis = await db.diagnosis.findUnique({ where: { id } });
    if (diagnosis) {
      if (userId && diagnosis.userId !== userId) {
        return jsonError("Ce diagnostic ne vous appartient pas", 403);
      }
      await db.diagnosis.delete({ where: { id } });
      return NextResponse.json({ ok: true, deleted: true, message: "Diagnostic supprimé avec succès." });
    }

    const proDiag = await db.proDiagnosis.findUnique({ where: { id } });
    if (proDiag) {
      if (userId && proDiag.userId !== userId) {
        return jsonError("Ce diagnostic ne vous appartient pas", 403);
      }
      await db.proDiagnosis.delete({ where: { id } });
      return NextResponse.json({ ok: true, deleted: true, message: "Diagnostic supprimé avec succès." });
    }

    return jsonError("Diagnostic introuvable", 404);
  } catch (err) {
    return serverError("diagnoses/[id]:DELETE", err);
  }
}
