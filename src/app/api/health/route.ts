// GET /api/health — sonde de santé du service (monitoring, redémarrages,
// uptime des mini-services). 200 avec l'état de la base si Prisma répond,
// 503 { ok: false, db: { ok: false } } sinon. Jamais de cache.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const users = await db.user.count();
    return NextResponse.json(
      {
        ok: true,
        service: "kene",
        version: "poc-1.0",
        uptimeSec: Math.floor(process.uptime()),
        ts: new Date().toISOString(),
        db: { ok: true, users },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[kene:api:health]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, db: { ok: false } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
