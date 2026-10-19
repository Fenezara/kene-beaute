// GET /api/pro/accounting/csv — Alias pour l'export CSV du journal des ventes / écritures
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/api/pro/accounting/export";
  if (!url.searchParams.has("type")) {
    url.searchParams.set("type", "ventes");
  }
  url.searchParams.set("format", "csv");
  return NextResponse.redirect(url);
}
