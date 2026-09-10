// POST /api/dermato/photo — triage lésion (vert / jaune / rouge)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { triageLesion } from "@/lib/ai/vlm";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DERMATO } from "@/lib/kene/rate-limit";
import { checkImageDataUrl } from "@/lib/kene/upload";
import { audit, clientIp } from "@/lib/kene/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  image: z.string().startsWith("data:image/"),
  userId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "dermato:photo"), DERMATO);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Dr. Kènè est très sollicitée — reprends dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Image invalide (dataURL attendu)", 400);

    // Validation d'upload 2026 (t. 86-e) : MIME + taille + magic bytes.
    const upload = checkImageDataUrl(parsed.data.image);
    if (!upload.ok) {
      void audit({ kind: "upload_reject", ip: clientIp(req), detail: upload.reason });
      return jsonError(`Photo refusée — ${upload.reason}`, 415);
    }

    const triage = await triageLesion(parsed.data.image);
    return NextResponse.json({ niveau: triage.niveau, message: triage.message });
  } catch (err) {
    console.error("[kene:api:dermato/photo]", err instanceof Error ? err.message : err);
    return serverError("dermato/photo", err);
  }
}
