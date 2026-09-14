// POST /api/admin/elevate — STEP-UP console (t. 130, ASVS V2.7).
// GET /api/admin/elevate?_g=… — pont (même payload JSON en query — la chaîne
// de préview de la fondatrice peut bloquer les POST, cf. get-bridge.ts).
//
// { code } → vérifie un code OTP FRAIS (< 5 min, non consommé) envoyé au
// numéro de la session admin, puis pose le cookie d'élévation signé
// `kene_admin_elevated` (5 min). Les actions sensibles de la console
// (PATCH tenants/[id], PATCH users/[id], passkey register/remove) exigent
// cette élévation — le front intercepte le 403 `elevation_required`, ouvre
// le dialogue « Confirme ton identité », puis REJOUE l'action.
//
// Sécurité: session admin stricte (401/403), rate-limit OTP_VERIFY, code
// haché sha256 comparé à temps constant (même discipline que otp/verify),
// audit admin_elevated. Le code est CONSOMMÉ à l'élévation réussie.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { sessionFromRequest, setElevationCookie, ELEVATION_TTL_SEC } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, OTP_VERIFY } from "@/lib/kene/rate-limit";
import { decodeBridge } from "@/lib/kene/get-bridge";
import { audit, clientIp, sha256Hex, hashEqual } from "@/lib/kene/audit";

export const runtime = "nodejs";

const Body = z.object({ code: z.string().length(6, "Code à 6 chiffres requis") });

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:elevate"), OTP_VERIFY);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives — réessaie dans quelques minutes");
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Code à 6 chiffres requis", 400);
    return await runElevate(parsed.data.code, req);
  } catch (err) {
    return serverError("admin/elevate", err);
  }
}

// Pont GET — MÊMES garde-fous (la fondatrice peut être derrière un transport
// qui ne laisse passer que les GET: le dialogue step-up doit marcher là aussi).
export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:elevate"), OTP_VERIFY);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop de tentatives — réessaie dans quelques minutes");
  try {
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) return jsonError(`Code à 6 chiffres requis — ${bridged.error}`, 400);
    return await runElevate(bridged.data.code, req);
  } catch (err) {
    return serverError("admin/elevate", err);
  }
}

/** Cœur partagé POST/GET. */
async function runElevate(code: string, req: NextRequest): Promise<NextResponse> {
  const sess = sessionFromRequest(req);
  if (!sess) return jsonError("Session requise — ouvre la Console Kènè via son lien dédié", 401);
  if (sess.role !== "admin") return jsonError("Console admin réservée aux comptes admin", 403);

  // Code OTP frais pour LE numéro de la session (jamais un autre numéro).
  const otp = await db.otpCode.findFirst({
    where: { phone: sess.phone, used: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const storedHash = otp ? (/^[0-9a-f]{64}$/.test(otp.code) ? otp.code : sha256Hex(otp.code)) : null;
  if (!otp || !storedHash || !hashEqual(sha256Hex(code), storedHash)) {
    void audit({ kind: "admin_elevate_failed", userId: sess.userId, phone: sess.phone, ip: clientIp(req), detail: "code invalide" });
    return jsonError("Code invalide ou expiré — demande un nouveau code", 400);
  }

  // Code consommé + élévation posée (5 min).
  await db.otpCode.update({ where: { id: otp.id }, data: { used: true } });
  void audit({ kind: "admin_elevated", userId: sess.userId, phone: sess.phone, ip: clientIp(req), detail: "step-up validé (5 min)" });

  const res = NextResponse.json({ ok: true, elevatedFor: ELEVATION_TTL_SEC });
  setElevationCookie(res, sess.userId);
  return res;
}
