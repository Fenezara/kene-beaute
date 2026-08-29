// POST /api/dermato/photo — triage lésion (vert / jaune / rouge)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { triageLesion } from "@/lib/ai/vlm";
import { jsonError, serverError } from "@/lib/kene/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  image: z.string().startsWith("data:image/"),
  userId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Image invalide (dataURL attendu)", 400);

    const triage = await triageLesion(parsed.data.image);
    return NextResponse.json({ niveau: triage.niveau, message: triage.message });
  } catch (err) {
    console.error("[kene:api:dermato/photo]", err instanceof Error ? err.message : err);
    return serverError("dermato/photo", err);
  }
}
