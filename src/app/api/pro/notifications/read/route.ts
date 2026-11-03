// POST /api/pro/notifications/read — { tenantId, ids? }
// Marque les notifications institut comme lues (readAt = now).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { pushTenantFeed } from "@/lib/kene/realtime";

export const runtime = "nodejs";

const Body = z.object({
  tenantId: z.string().min(1),
  ids: z.array(z.string().min(1)).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:notifications:read:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("tenantId requis", 400);

    const { tenantId, ids } = parsed.data;
    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const res = await db.notification.updateMany({
      where: {
        tenantId: tenant.id,
        readAt: null,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    pushTenantFeed(tenant.id);

    return NextResponse.json({ ok: true, updated: res.count });
  } catch (err) {
    return serverError("pro/notifications/read:post", err);
  }
}
