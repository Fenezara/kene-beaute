// GET /api/system/maintenance — État public du mode maintenance
import { NextResponse } from "next/server";
import { getMaintenanceConfig } from "@/lib/kene/maintenance";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getMaintenanceConfig();
  return NextResponse.json(
    { config },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
