// GET /api/pro/clients?tenantId=&q= — annuaire CRM trié par CA
// POST /api/pro/clients — « Cliente express » (mode saisie allégée, 2 champs)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, slugify } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";
import { ensureClientProfile } from "@/lib/kene/client-link";
import { canonicalPhone, arePhonesMatching, phoneMatchKey } from "@/lib/kene/phone-normalize";

// Validation zod (, remplace le cast manuel): bornes calquées sur
// l'ancien contrat (nom ≤ 80, téléphone raisonnablement borné en longueur —
// la sémantique 8-15 chiffres reste vérifiée après normalisation, messages FR inchangés).
const Body = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(80),
  phone: z.string().min(6).max(30),
  email: z.string().email().optional().or(z.literal("")),
  district: z.string().optional(),
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

    // Synchronisation automatique et intelligente App ↔ CRM :
    // 1. Clientes ayant choisi cet institut comme institut de référence
    const refUsers = await db.user.findMany({
      where: { selectedTenantId: tenant.id },
      select: {
        id: true,
        name: true,
        phone: true,
        district: true,
        birthDate: true,
        pregnant: true,
        preferredChannel: true,
        beautyBudget: true,
        skinType: true,
        fitzpatrick: true,
      },
    });

    for (const u of refUsers) {
      await ensureClientProfile(db, tenant.id, u).catch(() => null);
    }

    // 2. Clientes ayant pris un rendez-vous chez cet institut
    const apptUsers = await db.appointment.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, clientProfileId: true, userId: true, clientName: true, clientPhone: true },
    });

    for (const a of apptUsers) {
      let matchedUser = a.userId ? await db.user.findUnique({ where: { id: a.userId } }) : null;
      if (!matchedUser && a.clientPhone) {
        const digits = a.clientPhone.replace(/\D/g, "");
        matchedUser = await db.user.findFirst({
          where: {
            OR: [
              { phone: a.clientPhone },
              { phone: canonicalPhone(a.clientPhone) },
              ...(digits.length >= 8 ? [{ phone: { contains: digits.slice(-8) } }] : []),
            ],
          },
        });
      }
      const profile = await ensureClientProfile(db, tenant.id, matchedUser || {
        id: a.userId || `auto_${Date.now()}`,
        name: a.clientName,
        phone: a.clientPhone,
      });
      if (profile) {
        await db.appointment.update({
          where: { id: a.id },
          data: { clientProfileId: profile.id, ...(matchedUser ? { userId: matchedUser.id } : {}) },
        }).catch(() => null);
      }
    }

    // 3. Rapprochement et synchronisation de TOUTES les fiches de l'institut avec le compte User réel
    const allProfiles = await db.clientProfile.findMany({
      where: { tenantId: tenant.id },
    });
    for (const p of allProfiles) {
      let u = p.userId ? await db.user.findUnique({ where: { id: p.userId } }) : null;
      if (!u && p.phone) {
        const digits = p.phone.replace(/\D/g, "");
        if (digits.length >= 8) {
          u = await db.user.findFirst({
            where: {
              OR: [
                { phone: p.phone },
                { phone: canonicalPhone(p.phone) },
                { phone: { contains: digits.slice(-8) } },
              ],
            },
          });
        }
      }
      if (u) {
        const isGenericProfileName = !p.name || p.name.startsWith("Nouvelle ") || p.name.startsWith("Membre ") || p.name.includes("??");
        const isGenericUserName = !u.name || u.name.startsWith("Nouvelle ") || u.name.startsWith("Membre ") || u.name.includes("??");
        const targetName = !isGenericUserName ? u.name : (!isGenericProfileName ? p.name : u.name);

        await db.clientProfile.update({
          where: { id: p.id },
          data: {
            userId: u.id,
            name: targetName,
            phone: canonicalPhone(u.phone) || canonicalPhone(p.phone),
            skinType: p.skinType || u.skinType || undefined,
            fitzpatrick: p.fitzpatrick || u.fitzpatrick || undefined,
            district: p.district || u.district || undefined,
            birthDate: p.birthDate || u.birthDate || undefined,
            pregnant: p.pregnant ?? u.pregnant ?? undefined,
            preferredChannel: p.preferredChannel || u.preferredChannel || undefined,
            beautyBudget: p.beautyBudget || u.beautyBudget || undefined,
          },
        }).catch(() => null);

        if (isGenericUserName && !isGenericProfileName) {
          await db.user.update({
            where: { id: u.id },
            data: { name: p.name },
          }).catch(() => null);
        }
      }
    }

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
    const rawPhone = parsed.data.phone.trim();
    const phone = canonicalPhone(rawPhone);
    const digits = phone.replace(/\D/g, "");

    if (name.length < 2 || name.length > 80) return jsonError("Nom invalide (2 à 80 caractères)");
    if (digits.length < 8 || digits.length > 15) return jsonError("Téléphone invalide (8 à 15 chiffres)");

    const tail = phoneMatchKey(phone);

    // Tenter de lier avec un compte utilisateur Kènè existant
    const allUsers = await db.user.findMany({ select: { id: true, name: true, phone: true } });
    const matchingUser = allUsers.find((u) => arePhonesMatching(u.phone, phone));

    if (matchingUser) {
      const isGenericUserName = !matchingUser.name || matchingUser.name.startsWith("Nouvelle ") || matchingUser.name.startsWith("Membre ") || matchingUser.name.includes("??");
      if (isGenericUserName) {
        await db.user.update({
          where: { id: matchingUser.id },
          data: { name },
        }).catch(() => null);
      }
    }

    const roster = await db.clientProfile.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, phone: true, userId: true },
    });
    const existingId = roster.find((c) => (matchingUser && c.userId === matchingUser.id) || arePhonesMatching(c.phone, phone))?.id;
    const existing = existingId
      ? await db.clientProfile.findUnique({
          where: { id: existingId },
          include: { _count: { select: { sales: true, appointments: true } } },
        })
      : null;
    if (existing) {
      // Mettre à jour les informations complémentaires si fournies
      const updateData: { name?: string; phone?: string; userId?: string; email?: string; district?: string; notes?: string; skinType?: string; fitzpatrick?: string } = {
        name,
        phone,
      };
      if (matchingUser && !existing.userId) updateData.userId = matchingUser.id;
      if (parsed.data.email && !existing.email) updateData.email = parsed.data.email;
      if (parsed.data.district && !existing.district) updateData.district = parsed.data.district;
      if (parsed.data.skinType && !existing.skinType) updateData.skinType = parsed.data.skinType;
      if (parsed.data.fitzpatrick && !existing.fitzpatrick) updateData.fitzpatrick = parsed.data.fitzpatrick;
      if (parsed.data.notes && !existing.notes) updateData.notes = parsed.data.notes;

      const updated = await db.clientProfile.update({
        where: { id: existing.id },
        data: updateData,
        include: { _count: { select: { sales: true, appointments: true } } },
      });
      return NextResponse.json({ client: updated, reused: true });
    }

    const client = await db.clientProfile.create({
      data: {
        tenantId: tenant.id,
        userId: matchingUser?.id ?? null,
        name,
        phone,
        email: parsed.data.email?.trim() || null,
        district: parsed.data.district?.trim() || null,
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
