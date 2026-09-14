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
    const diagnosis = await db.diagnosis.findUnique({ where: { id } });
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
