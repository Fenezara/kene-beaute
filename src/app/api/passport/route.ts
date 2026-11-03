// Passeport de Peau (, vague 1) — QR partageable vers les instituts.
// POST /api/passport { userId } → crée (ou retrouve) le jeton de la
// cliente + URL publique à encoder.
// GET /api/passport?token=XXXX → LECTURE PUBLIQUE (sans compte):
// profil peau, dernier score, fils
// d'or. Aucune photo, aucun numéro.
// POST /api/passport { userId, rotate } → révoque l'ancien jeton (nouveau
// QR = l'ancien lien meurt).
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { seedOf } from "@/lib/kene/gold-threads";

/** Jeton base32 lisible — 12 caractères, sans caractères ambigus. */
function newToken(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
  return `KENE-${out}`;
}

/** Prénom + initiale du nom — jamais le nom complet en lecture publique. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

async function buildPassportData(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const [lastDiag, scanCount, orderCount, visitCount, reviewCount, wallet, lastCompletedAppt, clientProfiles] = await Promise.all([
    db.diagnosis.findFirst({
      where: { userId, status: "done" },
      orderBy: { createdAt: "desc" },
      select: { zone: true, scoreGlobal: true, createdAt: true, resultJson: true },
    }),
    db.diagnosis.count({ where: { userId, status: "done" } }),
    db.order.count({ where: { userId, status: { in: ["paid", "delivered"] } } }),
    db.appointment.count({ where: { userId, status: "completed" } }),
    db.review.count({ where: { userId } }),
    db.wallet.findUnique({ where: { userId }, select: { id: true } }),
    db.appointment.findFirst({
      where: { userId, status: "completed" },
      orderBy: { startAt: "desc" },
      select: {
        startAt: true,
        service: { select: { name: true } },
        tenant: { select: { name: true } },
      },
    }),
    db.clientProfile.findMany({
      where: { userId },
      select: { cosmeticsUsed: true, productObservations: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);
  const referrals = wallet
    ? await db.walletTransaction.count({ where: { walletId: wallet.id, type: "credit", reason: "referral" } })
    : 0;
  const threads = scanCount + orderCount + visitCount + reviewCount + referrals;

  let goals: string[] = [];
  try {
    const rawGoals = JSON.parse(user.goals ?? "[]");
    if (Array.isArray(rawGoals)) {
      goals = rawGoals
        .map((g) => (typeof g === "string" ? g : (g as { label?: string })?.label ?? ""))
        .filter(Boolean);
    }
  } catch {
    goals = [];
  }

  let indicators: { nom: string; pourcentage: number; severite: number }[] = [];
  let botanicals: string[] = [];
  let recommendedCare: string[] = [];
  let routineMorning: string[] = [];
  let routineEvening: string[] = [];

  if (lastDiag?.resultJson) {
    try {
      const parsed = JSON.parse(lastDiag.resultJson);
      if (Array.isArray(parsed.indicateurs)) {
        indicators = parsed.indicateurs
          .slice(0, 4)
          .map((ind: { nom?: string; pourcentage?: number; severite?: number }) => ({
            nom: String(ind.nom || ""),
            pourcentage: Number(ind.pourcentage ?? 70),
            severite: Number(ind.severite ?? 1),
          }))
          .filter((i: { nom: string }) => Boolean(i.nom));
      }
      if (parsed.recommandations) {
        if (Array.isArray(parsed.recommandations.botaniques_conseillees)) {
          botanicals = parsed.recommandations.botaniques_conseillees.slice(0, 5);
        }
        if (Array.isArray(parsed.recommandations.soins_conseilles)) {
          recommendedCare = parsed.recommandations.soins_conseilles.slice(0, 3);
        }
        if (Array.isArray(parsed.recommandations.routine_matin)) {
          routineMorning = parsed.recommandations.routine_matin.slice(0, 3);
        }
        if (Array.isArray(parsed.recommandations.routine_soir)) {
          routineEvening = parsed.recommandations.routine_soir.slice(0, 3);
        }
      }
    } catch {}
  }

  const prescribedRoutine = clientProfiles.find((cp) => cp.cosmeticsUsed?.trim())?.cosmeticsUsed?.trim() || null;

  return {
    name: shortName(user.name),
    city: user.city,
    district: user.district || null,
    fitzpatrick: user.fitzpatrick,
    skinType: user.skinType,
    allergies: user.allergies?.trim() || null,
    pregnant: Boolean(user.pregnant),
    gender: user.gender || "femme",
    goals: goals.slice(0, 5),
    scanCount,
    visitCount,
    lastScan: lastDiag
      ? {
          zone: lastDiag.zone,
          score: lastDiag.scoreGlobal,
          date: lastDiag.createdAt,
          indicators,
          botanicals,
          recommendedCare,
          routineMorning,
          routineEvening,
        }
      : null,
    lastCabinVisit: lastCompletedAppt
      ? {
          date: lastCompletedAppt.startAt,
          serviceName: lastCompletedAppt.service.name,
          instituteName: lastCompletedAppt.tenant.name,
        }
      : null,
    prescribedRoutine,
    threads,
    seed: seedOf(userId), // même graine que la vue privée → même pagne
    since: user.createdAt,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { userId?: string; rotate?: boolean } | null;
    const userId = body?.userId;
    if (!userId) return jsonError("userId requis", 400);

    const guard = guardUserClaim(req, "passport:post", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    if (body?.rotate) {
      // Révocation: l'ancien lien public meurt immédiatement (nouveau jeton).
      await db.skinPassport.deleteMany({ where: { userId } });
    }

    const passport = await db.skinPassport.upsert({
      where: { userId },
      update: {},
      create: { userId, token: newToken() },
    });

    return NextResponse.json({
      token: passport.token,
      // URL relative cohérente avec la gateway (jamais de port en dur):
      // le client reconstruit l'absolu avec window.location.origin.
      path: `/?passport=${passport.token}`,
    });
  } catch (err) {
    return serverError("passport:post", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) return jsonError("token requis", 400);

    const passport = await db.skinPassport.findUnique({ where: { token } });
    if (!passport) return jsonError("Passeport introuvable ou révoqué", 404);

    const data = await buildPassportData(passport.userId);
    if (!data) return jsonError("Passeport introuvable", 404);

    return NextResponse.json({ passport: data });
  } catch (err) {
    return serverError("passport:get", err);
  }
}
