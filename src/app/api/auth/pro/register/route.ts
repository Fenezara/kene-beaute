// POST /api/auth/pro/register — inscription entreprise (institut | spa | dermo_conseil).
// GET /api/auth/pro/register?_g=… — pont (même payload JSON en query):
// l'INSCRIPTION D'UNE ENTREPRISE doit passer même chez les préviews qui
// bloquent les POST (chaîne mesurée chez l'utilisatrice — voir api.ts).
// La gérante authentifiée (userId) crée son espace Pro: Tenant + 2 praticiennes
// par défaut + catalogue de départ selon le type + notifications de bienvenue
// (WhatsApp immédiat + astuce programmée J+2) + passage du compte en rôle pro.
// Contrat figé (, le front est codé contre):
// req { userId, instituteName 3-60, ownerName? 2-60, city 2-40, country CI|SN, type? }
// 201 { ok: true, tenant: { id, name, city, country, type, plan }, user }
// 400 validation zod (FR) · 404 compte introuvable · 409 déjà gérante
// Tout l'enchaînement passe dans UNE db.$transaction: aucune trace
// partielle si un maillon échoue — notify accepte le tx optionnel.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";
import { setSessionCookie, sanitizeUser } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";
import { decodeBridge } from "@/lib/kene/get-bridge";

export const runtime = "nodejs";

const Body = z.object({
  userId: z.string().min(1, "Session requise — reconnecte-toi"),
  instituteName: z
    .string()
    .trim()
    .min(3, "Le nom de ton institut doit faire au moins 3 caractères")
    .max(60, "Le nom de ton institut ne peut pas dépasser 60 caractères"),
  ownerName: z
    .string()
    .trim()
    .min(2, "Ton nom doit faire au moins 2 caractères")
    .max(60, "Ton nom ne peut pas dépasser 60 caractères")
    .optional(),
  city: z
    .string()
    .trim()
    .min(2, "La ville doit faire au moins 2 caractères")
    .max(40, "La ville ne peut pas dépasser 40 caractères"),
  country: z.enum(["CI", "SN"], { error: "Kènè opère en Côte d'Ivoire (CI) ou au Sénégal (SN)" }),
  type: z.enum(["institut", "spa", "dermo_conseil"], { error: "Type d'établissement inconnu" }).optional(),
});

type InstituteType = "institut" | "spa" | "dermo_conseil";

// ── Catalogue de départ (prix FCFA entiers, botanicals, goût Kènè) ──
const SERVICES_BY_TYPE: Record<InstituteType, {
  name: string;
  category: string;
  durationMin: number;
  price: number;
  botanicals: string | null;
  description: string;
}[]> = {
  institut: [
    {
      name: "Soin éclat mélanoderme",
      category: "soin",
      durationMin: 60,
      price: 25_000,
      botanicals: "Karité, Baobab",
      description: "Rituel d'éclat pensé pour les peaux mélanodermes : nettoyage doux, masque vitaminé et hydratation profonde au karité.",
    },
    {
      name: "Gommage corps karité",
      category: "gommage",
      durationMin: 45,
      price: 15_000,
      botanicals: "Karité",
      description: "Exfoliation douce au beurre de karité pour révéler l'éclat naturel sans agresser les zones pigmentées.",
    },
    {
      name: "Massage relaxant baobab",
      category: "massage",
      durationMin: 60,
      price: 20_000,
      botanicals: "Baobab",
      description: "Massage corps à l'huile de baobab — détente musculaire et nutrition profonde de la peau.",
    },
    {
      name: "Consultation beauté",
      category: "consultation",
      durationMin: 30,
      price: 10_000,
      botanicals: null,
      description: "Bilan express avec ta praticienne : routine, produits adaptés à ton phototype et conseils personnalisés.",
    },
  ],
  spa: [
    {
      name: "Rituel spa karité",
      category: "soin",
      durationMin: 90,
      price: 35_000,
      botanicals: "Karité, Bissap",
      description: "Parcours spa complet : hammam doux, gommage et enveloppement nourrissant au karité brut.",
    },
    {
      name: "Gommage bissap",
      category: "gommage",
      durationMin: 45,
      price: 18_000,
      botanicals: "Bissap",
      description: "Gommage revitalisant à l'hibiscus (bissap), riche en antioxydants, pour un teint frais et uni.",
    },
    {
      name: "Massage pierres chaudes",
      category: "massage",
      durationMin: 75,
      price: 30_000,
      botanicals: "Baobab",
      description: "Massage aux pierres chaudes et huile de baobab — relâchement profond des tensions.",
    },
  ],
  dermo_conseil: [
    {
      name: "Bilan de peau complet",
      category: "diagnostic",
      durationMin: 45,
      price: 15_000,
      botanicals: null,
      description: "Analyse complète : hydratation, sébum, taches et marques — protocole personnalisé remis en fin de séance.",
    },
    {
      name: "Suivi de protocole",
      category: "consultation",
      durationMin: 30,
      price: 8_000,
      botanicals: null,
      description: "Point de suivi de ton protocole : ajustements produits et progression de ta peau.",
    },
    {
      name: "Diagnostic IA accompagné",
      category: "diagnostic",
      durationMin: 30,
      price: 10_000,
      botanicals: null,
      description: "Scan IA Kènè commenté par ta dermo-conseillère : résultats expliqués, plan d'action concret.",
    },
  ],
};

const DESCRIPTIONS: Record<InstituteType, string> = {
  institut: "Institut de beauté spécialisé peaux mélanodermes — nouveau partenaire Kènè à",
  spa: "Spa spécialisé peaux mélanodermes — nouveau partenaire Kènè à",
  dermo_conseil: "Cabinet de dermo-conseil spécialisé peaux mélanodermes — nouveau partenaire Kènè à",
};

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(rlKey(req, "auth:pro-register"), AUTH_MUTATION);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec, "Trop d'inscriptions d'affilée — réessaie dans quelques secondes");
    }
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Corps de requête invalide";
      return jsonError(first, 400);
    }
    return await runRegister(parsed.data, req);
  } catch (err) {
    return serverError("auth/pro/register:post", err);
  }
}

// Pont GET — voir src/lib/kene/get-bridge.ts. MÊMES garde-fous
// (rate-limit, validation zod, audit, re-signature du cookie de session).
export async function GET(req: NextRequest) {
  try {
    const rl = rateLimit(rlKey(req, "auth:pro-register"), AUTH_MUTATION);
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec, "Trop d'inscriptions d'affilée — réessaie dans quelques secondes");
    }
    const bridged = decodeBridge(req, Body);
    if (!bridged.ok) {
      return jsonError(`Corps de requête invalide — ${bridged.error}`, 400);
    }
    return await runRegister(bridged.data, req);
  } catch (err) {
    return serverError("auth/pro/register:get", err);
  }
}

/** Cœur partagé POST/GET. */
async function runRegister(data: z.infer<typeof Body>, req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, instituteName, ownerName, city, country } = data;
    const type: InstituteType = data.type ?? "institut";

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Compte introuvable — reconnecte-toi", 404);

    // Une gérante = un espace: ownerPhone déjà rattaché → refus franc avec le
    // tenant existant (le front propose d'y retourner directement).
    const existing = await db.tenant.findFirst({ where: { ownerPhone: user.phone } });
    if (existing) {
      return NextResponse.json(
        {
          error: `Tu es déjà gérante de « ${existing.name} »`,
          tenant: { id: existing.id, name: existing.name },
        },
        { status: 409 },
      );
    }

    const finalOwnerName = ownerName ?? user.name;

    // ─── Transaction atomique: tenant + praticiennes + catalogue + rôle pro ───
    const tenant = await db.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: instituteName,
          type,
          country,
          city,
          phone: user.phone,
          ownerName: finalOwnerName,
          ownerPhone: user.phone,
          plan: "pro", // Véritable établissement créé par la gérante elle-même
          commissionRate: 0,
          description: `${DESCRIPTIONS[type]} ${city}.`,
          openingHour: 9,
          closingHour: 19,
          active: true,
        },
      });

      // Offre de bienvenue Pro : 30 jours complets offerts pour le premier établissement réel
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      await tx.subscription.create({
        data: {
          userId: user.id,
          plan: "pro_essentiel",
          status: "active",
          priceFcfa: 0,
          source: "welcome_offer",
          expiresAt,
        },
      });

      // 2 praticiennes prêtes à recevoir des RDV dès le premier jour
      await tx.resource.createMany({
        data: [
          { tenantId: t.id, name: "Aminata — Esthéticienne", role: "estheticienne", color: "#C8951E", active: true },
          { tenantId: t.id, name: "Fatou — Dermo-conseillère", role: "dermo_conseillere", color: "#3F7D3F", active: true },
        ],
      });

      // Catalogue de départ selon le type d'établissement
      await tx.service.createMany({
        data: SERVICES_BY_TYPE[type].map((s) => ({
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

      // Bienvenue WhatsApp immédiate + astuce programmée J+2 (relance avis)
      const j2 = new Date(Date.now() + 2 * 86_400_000);
      await notify(
        {
          userId: user.id,
          tenantId: t.id,
          channel: "whatsapp",
          toPhone: user.phone,
          message: `Kènè Pro 🎉 Bienvenue ${finalOwnerName} ! Ton espace « ${instituteName} » est prêt : agenda, caisse, CRM et IA t'attendent. Personnalise tes soins depuis Catalogue.`,
        },
        tx,
      );
      await notify(
        {
          userId: user.id,
          tenantId: t.id,
          channel: "whatsapp",
          toPhone: user.phone,
          message:
            "Astuce Kènè Pro : invite tes clientes à te laisser un avis après leur soin — les instituts notés remplissent 2× mieux leur agenda.",
          status: "scheduled",
          scheduledAt: j2,
        },
        tx,
      );

      // Passage pro + ville (+ nom de gérante si précisé et différent)
      const userData: { role: string; city: string; name?: string } = { role: "pro", city };
      if (ownerName && ownerName !== user.name) userData.name = ownerName;
      await tx.user.update({ where: { id: user.id }, data: userData });

      return t;
    });

    //: journal d'audit — nom d'institut tronqué (fait aussi par audit,
    // 64 chars), ville, aucun secret.
    void audit({
      kind: "pro_register",
      userId: user.id,
      ip: clientIp(req),
      detail: `${tenant.name} · ${tenant.city} · ${tenant.type}`,
    });

    // User rechargé (objet Prisma complet, role=pro) pour la réponse 201
    const freshUser = await db.user.findUnique({ where: { id: user.id } });
    // Re-signature de la session: le rôle vient de passer
    // « client » → « pro » — le cookie posé à la vérification OTP porterait
    // un rôle périmé et les gardes pro (403) bloqueraient l'espace fraîchement
    // créé. On re-pose le cookie signé avec le rôle ACTUEL.
    const res = NextResponse.json(
      {
        ok: true,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          city: tenant.city,
          country: tenant.country,
          type: tenant.type,
          plan: tenant.plan,
        },
        user: sanitizeUser(freshUser),
      },
      { status: 201 },
    );
    if (freshUser) {
      setSessionCookie(res, { id: freshUser.id, phone: freshUser.phone, role: freshUser.role });
    }
    return res;
  } catch (err) {
    return serverError("auth/pro/register", err);
  }
}
