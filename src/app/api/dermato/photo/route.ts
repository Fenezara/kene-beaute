// POST /api/dermato/photo — triage lésion (vert / jaune / rouge)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { triageLesion } from "@/lib/ai/vlm";
import { jsonError, serverError } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, DERMATO } from "@/lib/kene/rate-limit";
import { checkImageDataUrl } from "@/lib/kene/upload";
import { audit, clientIp } from "@/lib/kene/audit";
import { inciQuotaFor, proInciQuotaFor } from "@/lib/kene/plans";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  image: z.string().startsWith("data:image/").optional(),
  images: z.array(z.string().startsWith("data:image/")).min(1).max(5).optional(),
  userId: z.string().optional(),
  tenantId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "dermato:photo"), DERMATO);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Dermo Kènè est très sollicitée — reprends dans quelques secondes");
  }
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Image(s) invalide(s) (dataURL attendu)", 400);

    const imgList: string[] = parsed.data.images && parsed.data.images.length > 0
      ? parsed.data.images
      : parsed.data.image
        ? [parsed.data.image]
        : [];

    if (imgList.length === 0) {
      return jsonError("Au moins une photo est requise", 400);
    }

    // Validation d'upload 2026: MIME + taille + magic bytes pour chaque cliché.
    for (const img of imgList) {
      const upload = checkImageDataUrl(img);
      if (!upload.ok) {
        void audit({ kind: "upload_reject", ip: clientIp(req), detail: upload.reason });
        return jsonError(`Photo refusée — ${upload.reason}`, 415);
      }
    }

    // Vérification du quota Scanner INCI
    if (parsed.data.tenantId) {
      // 1. Quota Pro (si appelé par un institut / tenant)
      const pQuota = await proInciQuotaFor(parsed.data.tenantId, parsed.data.userId);
      if (pQuota.remaining <= 0) {
        return NextResponse.json(
          {
            error: "Votre établissement a utilisé ses 5 analyses de produits gratuites ce mois-ci avec le Scanner INCI. Activez votre formule Kènè Pro (Starter, Institut ou Complexe) pour analyser la composition de tous vos produits et flacons en illimité !",
            quotaExceeded: true,
            quota: pQuota,
          },
          { status: 403 },
        );
      }
    } else if (parsed.data.userId) {
      // 2. Quota Cliente (grand public autonome)
      const iQuota = await inciQuotaFor(parsed.data.userId);
      if (iQuota.remaining <= 0) {
        return NextResponse.json(
          {
            error: "Tu as utilisé tes 3 analyses de produits gratuites ce mois-ci avec le Scanner INCI. Active Kènè+ (2 500 FCFA/mois) pour analyser tous tes cosmétiques en illimité !",
            quotaExceeded: true,
            quota: iQuota,
          },
          { status: 403 },
        );
      }
    }

    const triage = await triageLesion(imgList);

    if (parsed.data.tenantId) {
      void audit({
        kind: "pro_inci_scan",
        userId: parsed.data.userId,
        ip: clientIp(req),
        detail: `tenant:${parsed.data.tenantId}`,
      });
    } else if (parsed.data.userId && (triage.isProduct || triage.productAnalysis)) {
      void audit({ kind: "inci_scan", userId: parsed.data.userId });
    }
    return NextResponse.json({
      niveau: triage.niveau,
      message: triage.message,
      isProduct: triage.isProduct,
      productName: triage.productName,
      productAnalysis: triage.productAnalysis,
    });
  } catch (err) {
    console.error("[kene:api:dermato/photo]", err instanceof Error ? err.message : err);
    return serverError("dermato/photo", err);
  }
}
