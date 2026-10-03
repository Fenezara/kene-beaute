// GET /api/pro/consultation-sheet?tenantId=&clientId?=&practitioner?
// → PDF « Fiche de consultation & diagnostic de peau ».
// - sans clientId: fiche VIERGE (support papier universel, à remplir à la main);
// - avec clientId: fiche PRÉ-REMPLIE (identité, miroir peau, derniers
// self-scans si la cliente est sur l'app).
// Session pro/admin exigée (guardProRole) + institut résolu (isolation stricte).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { isScansShared } from "@/lib/kene/share-consent";
import { consultationSheetPdf, consultationSheetFilename, type ConsultationClientPrefill } from "@/lib/kene/consultation-pdf";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:consultation-sheet:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const clientId = req.nextUrl.searchParams.get("clientId");
    const practitioner = req.nextUrl.searchParams.get("practitioner") || null;

    let prefill: ConsultationClientPrefill | null = null;
    if (clientId) {
      const client = await db.clientProfile.findFirst({
        where: { id: clientId, tenantId: tenant.id },
      });
      if (!client) return jsonError("Fiche cliente introuvable dans cet institut", 404);
      // Allergies du compte app (si la fiche est liée) — miroir santé papier.
      const linkedUser = client.userId
        ? await db.user.findUnique({ where: { id: client.userId }, select: { allergies: true } })
        : null;
      // Self-scans: uniquement si la cliente a explicitement partagé son
      // historique avec CET institut (consentement révocable depuis son app).
      const scansShared = client.userId ? await isScansShared(client.userId, tenant.id) : false;
      const scans = client.userId && scansShared
        ? await db.diagnosis.findMany({
            where: { userId: client.userId, status: "done" },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: { zone: true, scoreGlobal: true, createdAt: true },
          })
        : [];
      prefill = {
        name: client.name,
        phone: client.phone,
        skinType: client.skinType,
        fitzpatrick: client.fitzpatrick,
        notes: client.notes,
        cosmeticsUsed: client.cosmeticsUsed,
        productObservations: client.productObservations,
        appAccount: Boolean(client.userId),
        scansShared,
        scans: scans.map((s) => ({ zone: s.zone, score: s.scoreGlobal, date: s.createdAt.toISOString() })),
      };
      // Allergies du compte app (miroir santé) reportées sur le papier.
      if (linkedUser?.allergies) {
        prefill.notes = `${prefill.notes ? `${prefill.notes} · ` : ""}Allergies app : ${linkedUser.allergies.slice(0, 120)}`;
      }
    }

    const pdf = consultationSheetPdf({
      tenantName: tenant.name,
      tenantCity: tenant.city,
      tenantPhone: tenant.phone,
      practitioner,
      client: prefill,
      date: new Date(),
    });

    return new NextResponse(new Uint8Array(pdf.data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${consultationSheetFilename(prefill?.name)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError("pro/consultation-sheet:GET", err);
  }
}
