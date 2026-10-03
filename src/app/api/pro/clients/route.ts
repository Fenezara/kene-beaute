// GET /api/pro/clients?tenantId=&q= — annuaire CRM trié par CA
// POST /api/pro/clients — « Cliente express » (mode saisie allégée, 2 champs)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, slugify } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

// Validation zod (, remplace le cast manuel): bornes calquées sur
// l'ancien contrat (nom ≤ 80, téléphone raisonnablement borné en longueur —
// la sémantique 8-15 chiffres reste vérifiée après normalisation, messages FR inchangés).
const Body = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(80),
  phone: z.string().min(6).max(30),
  email: z.string().email().optional().or(z.literal("")),
  skinType: z.string().optional(),
  fitzpatrick: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    // Session signée (, migration douce): GET navigateur — avec
    // cookie, l'espace entreprise exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:clients:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
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
    // Session signée (, migration douce): avec cookie, la fiche
    // express exige un compte pro/admin; sans cookie → legacy.
    const guard = guardProRole(req, "pro:clients:post");
    if (guard) return guard;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path?.[0];
      return jsonError(
        field === "name"
          ? "Nom invalide (2 à 80 caractères)"
          : field === "phone"
            ? "Téléphone invalide (8 à 15 chiffres)"
            : "Corps de requête invalide",
        400
      );
    }

    const tenant = await resolveTenant(req, parsed.data.tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Normalisation conservée (trim + espaces multiples): zod garantit la
    // forme, ces sémantiques restent la source des messages FR ci-dessous.
    const name = parsed.data.name.trim().replace(/\s+/g, " ");
    const phone = parsed.data.phone.trim();
    const digits = phone.replace(/\D/g, "");

    if (name.length < 2 || name.length > 80) return jsonError("Nom invalide (2 à 80 caractères)");
    if (digits.length < 8 || digits.length > 15) return jsonError("Téléphone invalide (8 à 15 chiffres)");

    // anti-doublon: comparaison sur chiffres NORMALISÉS (les formats « 07 05… »,
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
      // Mettre à jour les informations complémentaires si fournies
      const updateData: { email?: string; notes?: string; skinType?: string; fitzpatrick?: string } = {};
      if (parsed.data.email && !existing.email) updateData.email = parsed.data.email;
      if (parsed.data.skinType && !existing.skinType) updateData.skinType = parsed.data.skinType;
      if (parsed.data.fitzpatrick && !existing.fitzpatrick) updateData.fitzpatrick = parsed.data.fitzpatrick;
      if (parsed.data.notes && !existing.notes) updateData.notes = parsed.data.notes;

      if (Object.keys(updateData).length > 0) {
        const updated = await db.clientProfile.update({
          where: { id: existing.id },
          data: updateData,
          include: { _count: { select: { sales: true, appointments: true } } },
        });
        return NextResponse.json({ client: updated, reused: true });
      }

      return NextResponse.json({ client: existing, reused: true });
    }

    // Tenter de lier avec un compte utilisateur Kènè existant
    const allUsers = await db.user.findMany({ select: { id: true, phone: true } });
    const matchingUser = allUsers.find((u) => u.phone.replace(/\D/g, "").endsWith(tail));

    const client = await db.clientProfile.create({
      data: {
        tenantId: tenant.id,
        userId: matchingUser?.id ?? null,
        name,
        phone,
        email: parsed.data.email?.trim() || null,
        skinType: parsed.data.skinType?.trim() || null,
        fitzpatrick: parsed.data.fitzpatrick?.trim() || null,
        rfmSegment: "Nouveau",
        notes: parsed.data.notes?.trim() || "Fiche cliente créée en salon",
      },
      include: { _count: { select: { sales: true, appointments: true } } },
    });

    return NextResponse.json({ client, reused: false }, { status: 201 });
  } catch (err) {
    return serverError("pro/clients:POST", err);
  }
}
