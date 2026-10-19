// GET /api/pro/accounting/csv — Traitement direct de l'export CSV du journal des ventes
import { NextRequest } from "next/server";
import { GET as exportGet } from "../export/route";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  if (!url.searchParams.has("type")) {
    url.searchParams.set("type", "ventes");
  }
  url.searchParams.set("format", "csv");
  const modReq = new NextRequest(url, req);
  return exportGet(modReq);
}
