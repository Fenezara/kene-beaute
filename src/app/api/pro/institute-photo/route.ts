// POST /api/pro/institute-photo — photo de vitrine de l'institut (t. 120).
// La gérante (ou son employée) dépose la photo de SON établissement :
// photo d'identité de la façade, de l'enseigne, de l'intérieur — elle
// remplace le visuel calculé (slug du nom) dans l'annuaire, la boutique et
// les fiches. Isolation stricte : resolveTenant garantit que la session ne
// touche QUE son institut. `photoData: null` supprime la photo (retour au
// visuel par défaut).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { checkPhoto } from "@/lib/kene/photo";

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "pro:photo"), AUTH_MUTATION);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de modifications d'affilée — réessaie dans quelques secondes");
  try {
    const guard = guardProRole(req, "pro:institute-photo:post");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const body = (await req.json().catch(() => null)) as { photoData?: unknown } | null;
    if (!body) return jsonError("Corps de requête invalide", 400);

    const check = checkPhoto(body.photoData, "photo de l'institut");
    if (!check.ok) return jsonError(check.error, 400);

    await db.tenant.update({ where: { id: tenant.id }, data: { photoData: check.value } });
    return NextResponse.json({ ok: true, hasPhoto: check.value !== null });
  } catch (err) {
    return serverError("pro/institute-photo", err);
  }
}
