// GET /api/pro/accounting/pdf — Alias pour l'export PDF de la liasse SYSCOHADA
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/api/pro/accounting/export";
  url.searchParams.set("type", "liasse");
  url.searchParams.set("format", "pdf");
  return NextResponse.redirect(url);
}
