// GET /api/pro/accounting/pdf — Traitement direct de l'export PDF de la liasse SYSCOHADA
import { NextRequest } from "next/server";
import { GET as exportGet } from "../export/route";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.searchParams.set("type", "liasse");
  url.searchParams.set("format", "pdf");
  const modReq = new NextRequest(url, req);
  return exportGet(modReq);
}
