// GET /api/health — sonde de santé du service (monitoring, redémarrages,
// uptime des mini-services). 200 avec l'état de la base si Prisma répond,
// 503 { ok: false, db: { ok: false } } sinon. Jamais de cache.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const t0 = performance.now();
    await db.$queryRaw`SELECT 1`;
    const dbLatencyMs = Math.round((performance.now() - t0) * 10) / 10;

    return NextResponse.json(
      {
        ok: true,
        service: "kene",
        version: "2.4.0",
        uptimeSec: Math.floor(process.uptime()),
        ts: new Date().toISOString(),
        db: { ok: true, latencyMs: dbLatencyMs },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[kene:api:health]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, db: { ok: false, error: err instanceof Error ? err.message : String(err) } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
