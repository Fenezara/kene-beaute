// GET /api/diagnoses/evolution?userId= — Le Fil du Temps:
// séries temporelles par indicateur (fusion floue normKey) + score global.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildEvolution } from "@/lib/kene/evolution";
import { jsonError, serverError } from "@/lib/kene/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const rows = await db.diagnosis.findMany({
      where: { userId, status: "done" },
      orderBy: { createdAt: "asc" },
      select: { id: true, zone: true, scoreGlobal: true, resultJson: true, createdAt: true },
    });

    return NextResponse.json(buildEvolution(rows));
  } catch (err) {
    return serverError("diagnoses:evolution", err);
  }
}
