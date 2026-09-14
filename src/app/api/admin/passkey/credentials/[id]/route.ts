// DELETE /api/admin/passkey/credentials/[id] — RETIRE un appareil passkey
// de la console (t. 130). Session admin + ÉLÉVATION fraîche exigées
// (retirer un authenticator est un acte sensible — ASVS V2.7).
//
// Sans appareil restant, la connexion console retombe sur le code à 6
// chiffres (jamais de verrouillage mort) — le dernier appareil PEUT donc
// être retiré, la confirmation côté front énonce l'impact.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest, guardAdminElevated } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "admin:passkey:remove"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop d'actions — réessaie dans une minute");
  const guard = guardAdminElevated(req);
  if (guard) return guard;
  const sess = sessionFromRequest(req);
  if (!sess) return jsonError("Session requise", 401);
  try {
    const { id } = await ctx.params;
    const cred = await db.passkeyCredential.findUnique({ where: { id } });
    if (!cred || cred.userId !== sess.userId) {
      return jsonError("Appareil introuvable sur ton compte console", 404);
    }

    await db.passkeyCredential.delete({ where: { id } });
    void audit({
      kind: "passkey_removed",
      userId: sess.userId,
      phone: sess.phone,
      ip: clientIp(req),
      detail: cred.name ?? "appareil sans étiquette",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError("admin/passkey/credentials/[id]", err);
  }
}
