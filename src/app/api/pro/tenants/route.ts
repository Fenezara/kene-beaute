// src/app/api/pro/tenants/route.ts
// Gestion multi-succursales pour les professionnels Kènè
// GET /api/pro/tenants  — liste de tous les établissements accessibles par la session
// POST /api/pro/tenants — création d'une nouvelle succursale / établissement

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveProTenants } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";

export const runtime = "nodejs";

const CreateTenantBody = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Le nom de l'établissement doit comporter au moins 3 caractères")
    .max(70, "Le nom ne peut pas dépasser 70 caractères"),
  type: z.enum(["institut", "spa", "dermo_conseil"]).optional().default("institut"),
  city: z
    .string()
    .trim()
    .min(2, "La ville ou le quartier doit comporter au moins 2 caractères")
    .max(60, "La ville ou quartier ne peut pas dépasser 60 caractères"),
  country: z.enum(["CI", "SN"]).optional().default("CI"),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
});

const UpdateTenantBody = z.object({
  tenantId: z.string().min(1, "Identifiant d'établissement requis"),
  name: z
    .string()
    .trim()
    .min(3, "Le nom de l'établissement doit comporter au moins 3 caractères")
    .max(70, "Le nom ne peut pas dépasser 70 caractères")
    .optional(),
  description: z
    .string()
    .trim()
    .max(600, "La description ne peut pas dépasser 600 caractères")
    .optional()
    .nullable(),
  city: z
    .string()
    .trim()
    .min(2, "La ville ou le quartier doit comporter au moins 2 caractères")
    .max(60, "La ville ou quartier ne peut pas dépasser 60 caractères")
    .optional(),
  address: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().min(8, "Numéro de téléphone trop court").max(30).optional(),
  openingHour: z.number().int().min(0).max(23).optional(),
  closingHour: z.number().int().min(0).max(23).optional(),
});

type InstituteType = "institut" | "spa" | "dermo_conseil";

const DESCRIPTIONS: Record<InstituteType, string> = {
  institut: "Institut de beauté dermo-botanique spécialisé peaux mélanodermes —",
  spa: "Spa urbain, rituels de relaxation et massages aux huiles africaines —",
  dermo_conseil: "Espace dermo-conseil, bilans cutanés et accompagnement cosmétique —",
};

const STARTER_SERVICES: Record<
  InstituteType,
  { name: string; category: string; durationMin: number; price: number; botanicals: string; description: string }[]
> = {
  institut: [
    {
      name: "Soin éclat mélanoderme",
      category: "soin",
      durationMin: 60,
      price: 25000,
      botanicals: "Moringa, kinkeliba, vitamine C",
      description: "Rituel illuminateur anti-teint terne, adapté aux phototypes IV à VI.",
    },
    {
      name: "Protocole anti-taches PIH",
      category: "soin",
      durationMin: 75,
      price: 35000,
      botanicals: "Bissap, niacinamide, réglisse",
      description: "Ciblage doux de l'hyperpigmentation post-inflammatoire sans agression.",
    },
    {
      name: "Gommage fondant au karité brut",
      category: "gommage",
      durationMin: 45,
      price: 18000,
      botanicals: "Beurre de karité pur, sucre roux",
      description: "Exfoliation satinante pour éliminer le voile cendré et nourrir le corps.",
    },
    {
      name: "Diagnostic cutané & ordonnance beauté",
      category: "diagnostic",
      durationMin: 30,
      price: 10000,
      botanicals: "Aloka, baobab",
      description: "Bilan complet de votre type de peau avec routine sur-mesure.",
    },
  ],
  spa: [
    {
      name: "Massage signature au baobab tiède",
      category: "massage",
      durationMin: 60,
      price: 30000,
      botanicals: "Huile de baobab vierge, karité",
      description: "Détente profonde, délassement musculaire et nutrition intense.",
    },
    {
      name: "Rituel corps détox bissap & sels",
      category: "gommage",
      durationMin: 60,
      price: 28000,
      botanicals: "Fleurs d'hibiscus, sels minéraux",
      description: "Enveloppement doux et exfoliation vivifiante.",
    },
    {
      name: "Soin visage apaisant karité & aloès",
      category: "soin",
      durationMin: 50,
      price: 22000,
      botanicals: "Karité de Korhogo, gel d'aloka",
      description: "Calme les tiraillements et restaure le film lipidique protecteur.",
    },
  ],
  dermo_conseil: [
    {
      name: "Consultation dermo-cosmétique complète",
      category: "consultation",
      durationMin: 45,
      price: 15000,
      botanicals: "Aloka, moringa",
      description: "Analyse experte des routines, identification des actifs et plan de soin.",
    },
    {
      name: "Bilan capillaire & cuir chevelu",
      category: "capillaire",
      durationMin: 40,
      price: 15000,
      botanicals: "Huile de ricin, souchet",
      description: "Évaluation de la casse, alopécie de traction et protocoles de repousse.",
    },
    {
      name: "Suivi évolution anti-taches (30 min)",
      category: "consultation",
      durationMin: 30,
      price: 8000,
      botanicals: "Bissap, niacinamide",
      description: "Point d'étape sur la régression des taches pigmentaires.",
    },
  ],
};

export async function GET(req: NextRequest) {
  const guard = guardProRole(req, "pro:tenants:get");
  if (guard) return guard;

  try {
    const tenants = await resolveProTenants(req);
    return NextResponse.json({
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        city: t.city,
        country: t.country,
        address: t.address,
        phone: t.phone,
        plan: t.plan,
        rating: t.rating,
        reviewCount: t.reviewCount,
        description: t.description,
        openingHour: t.openingHour,
        closingHour: t.closingHour,
        hasPhoto: Boolean(t.photoData),
        active: t.active,
      })),
    });
  } catch (err) {
    return serverError("pro/tenants:get", err);
  }
}

export async function POST(req: NextRequest) {
  const guard = guardProRole(req, "pro:tenants:post");
  if (guard) return guard;

  const sess = sessionFromRequest(req);
  if (!sess || (sess.role !== "pro" && sess.role !== "admin")) {
    return jsonError("Session professionnelle requise", 401);
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsed = CreateTenantBody.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return jsonError(issue?.message ?? "Données d'établissement invalides", 400);
    }

    const { name, type, city, country, address, phone } = parsed.data;

    // Récupération de l'utilisateur pour le nom de gérante
    const ownerUser = await db.user.findUnique({ where: { phone: sess.phone } });
    const ownerName = ownerUser?.name || "Gérante Kènè";
    const establishmentPhone = phone || sess.phone;

    // Transaction atomique : création du Tenant + praticiennes + catalogue de départ
    const newTenant = await db.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name,
          type,
          country,
          city,
          address: address ?? null,
          phone: establishmentPhone,
          ownerName,
          ownerPhone: sess.phone,
          plan: "pro", // Déblocage pro pour nouvelle succursale
          commissionRate: 0,
          description: `${DESCRIPTIONS[type]} ${city}.`,
          openingHour: 9,
          closingHour: 19,
          active: true,
        },
      });

      // 2 praticiennes prêtes à recevoir des clientes
      await tx.resource.createMany({
        data: [
          { tenantId: t.id, name: "Praticienne 1 — Esthéticienne", role: "estheticienne", color: "#C8951E", active: true },
          { tenantId: t.id, name: "Praticienne 2 — Dermo-conseillère", role: "dermo_conseillere", color: "#3F7D3F", active: true },
        ],
      });

      // 4 soins initiaux adaptés au type
      const services = STARTER_SERVICES[type] ?? STARTER_SERVICES.institut;
      await tx.service.createMany({
        data: services.map((s) => ({
          tenantId: t.id,
          name: s.name,
          category: s.category,
          durationMin: s.durationMin,
          price: s.price,
          commissionPct: 10,
          description: s.description,
          botanicals: s.botanicals,
          active: true,
        })),
      });

      return t;
    });

    return NextResponse.json({
      ok: true,
      tenant: {
        id: newTenant.id,
        name: newTenant.name,
        type: newTenant.type,
        city: newTenant.city,
        country: newTenant.country,
        address: newTenant.address,
        phone: newTenant.phone,
        plan: newTenant.plan,
      },
    });
  } catch (err) {
    return serverError("pro/tenants:post", err);
  }
}

export async function PATCH(req: NextRequest) {
  const guard = guardProRole(req, "pro:tenants:patch");
  if (guard) return guard;

  const sess = sessionFromRequest(req);
  if (!sess || (sess.role !== "pro" && sess.role !== "admin")) {
    return jsonError("Session professionnelle requise", 401);
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsed = UpdateTenantBody.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return jsonError(issue?.message ?? "Données de modification invalides", 400);
    }

    const { tenantId, name, description, city, address, phone, openingHour, closingHour } = parsed.data;

    // Vérification des droits : soit admin, soit la gérante est propriétaire (ownerPhone)
    const existing = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!existing) return jsonError("Établissement introuvable", 404);

    if (sess.role !== "admin" && existing.ownerPhone !== sess.phone) {
      return jsonError("Seule la gérante ou fondatrice peut modifier la vitrine de cet établissement", 403);
    }

    const updated = await db.tenant.update({
      where: { id: tenantId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(address !== undefined ? { address: address?.trim() || null } : {}),
        ...(phone && phone.trim() ? { phone: phone.trim() } : {}),
        ...(openingHour !== undefined ? { openingHour } : {}),
        ...(closingHour !== undefined ? { closingHour } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      tenant: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        city: updated.city,
        country: updated.country,
        address: updated.address,
        phone: updated.phone,
        plan: updated.plan,
        description: updated.description,
        openingHour: updated.openingHour,
        closingHour: updated.closingHour,
      },
    });
  } catch (err) {
    return serverError("pro/tenants:patch", err);
  }
}

