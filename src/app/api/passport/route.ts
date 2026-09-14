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
  const [lastDiag, scanCount, orderCount, visitCount, reviewCount, wallet] = await Promise.all([
    db.diagnosis.findFirst({
      where: { userId, status: "done" },
      orderBy: { createdAt: "desc" },
      select: { zone: true, scoreGlobal: true, createdAt: true },
    }),
    db.diagnosis.count({ where: { userId, status: "done" } }),
    db.order.count({ where: { userId, status: { in: ["paid", "delivered"] } } }),
    db.appointment.count({ where: { userId, status: "completed" } }),
    db.review.count({ where: { userId } }),
    db.wallet.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  const referrals = wallet
    ? await db.walletTransaction.count({ where: { walletId: wallet.id, type: "credit", reason: "referral" } })
    : 0;
  const threads = scanCount + orderCount + visitCount + reviewCount + referrals;

  let goals: string[] = [];
  try {
    goals = (JSON.parse(user.goals ?? "[]") as { label?: string }[]).map((g) => g.label ?? "").filter(Boolean);
  } catch {
    goals = [];
  }

  return {
    name: shortName(user.name),
    city: user.city,
    fitzpatrick: user.fitzpatrick,
    skinType: user.skinType,
    allergies: user.allergies?.trim() || null,
    goals: goals.slice(0, 4),
    lastScan: lastDiag
      ? {
          zone: lastDiag.zone,
          score: lastDiag.scoreGlobal,
          date: lastDiag.createdAt,
        }
      : null,
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
