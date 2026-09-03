// GET /api/pro/clients?tenantId=&q= — annuaire CRM trié par CA
// POST /api/pro/clients — « Cliente express » (mode saisie allégée, 2 champs)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, slugify } from "@/lib/kene/server";

export async function GET(req: NextRequest) {
  try {
    const tenant = await resolveTenant(req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

    const all = await db.clientProfile.findMany({
      where: { tenantId: tenant.id },
      include: { _count: { select: { sales: true, appointments: true } } },
      orderBy: { totalSpent: "desc" },
    });

    const clients = all.filter(
      (c) => !q || slugify(c.name).includes(slugify(q)) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );

    return NextResponse.json({ clients });
  } catch (err) {
    return serverError("pro/clients:GET", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => null);
    const b = (body ?? {}) as { tenantId?: unknown; name?: unknown; phone?: unknown };

    const tenant = await resolveTenant(typeof b.tenantId === "string" ? b.tenantId : null);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
    const phone = typeof b.phone === "string" ? b.phone.trim() : "";
    const digits = phone.replace(/\D/g, "");

    if (name.length < 2 || name.length > 80) return jsonError("Nom invalide (2 à 80 caractères)");
    if (digits.length < 8 || digits.length > 15) return jsonError("Téléphone invalide (8 à 15 chiffres)");

    // anti-doublon : comparaison sur chiffres NORMALISÉS (les formats « 07 05… »,
    // « 0705… » et « +225 07… » désignent le même numéro — un contains SQL brut
    // ne le voit pas). Les 10 derniers chiffres = numéro local CI.
    const tail = digits.slice(-10);
    const roster = await db.clientProfile.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, phone: true },
    });
    const existingId = roster.find((c) => c.phone.replace(/\D/g, "").endsWith(tail))?.id;
    const existing = existingId
      ? await db.clientProfile.findUnique({
          where: { id: existingId },
          include: { _count: { select: { sales: true, appointments: true } } },
        })
      : null;
    if (existing) {
      return NextResponse.json({ client: existing, reused: true });
    }

    const client = await db.clientProfile.create({
      data: {
        tenantId: tenant.id,
        name,
        phone,
        rfmSegment: "Nouveau",
        notes: "Créée express depuis la caisse",
      },
      include: { _count: { select: { sales: true, appointments: true } } },
    });

    return NextResponse.json({ client, reused: false }, { status: 201 });
  } catch (err) {
    return serverError("pro/clients:POST", err);
  }
}
