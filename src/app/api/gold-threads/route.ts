// GET /api/gold-threads?userId= — les Fils d'Or (, vague 1).
// Fidélité tissée: chaque action VRAIE de la cliente ajoute un fil d'or à
// son kente identitaire. Les fils ne sont pas une table dédiée: ils se
// lisent sur l'activité réelle (diagnostics, commandes, visites, avis,
// parrainages) — impossible à fausser depuis le client, cohérent avec le
// wallet. La graine du motif est dérivée de l'userId: un pagne unique par
// utilisatrice, stable pour toujours.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardUserClaim } from "@/lib/kene/session";
import { seedOf } from "@/lib/kene/gold-threads";

/** Échelons de rang — le vocabulaire du métier à tisser. */
function rankOf(threads: number): string {
  if (threads <= 0) return "Écheveau vierge";
  if (threads < 5) return "Premiers fils";
  if (threads < 10) return "Tisseuse";
  if (threads < 20) return "Tisseuse d'or";
  return "Maîtresse du métier";
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    // Session signée: avec cookie, on ne lit que SES fils.
    const guard = guardUserClaim(req, "gold-threads:get", userId);
    if (guard) return guard;

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const wallet = await db.wallet.findUnique({ where: { userId }, select: { id: true } });

    const [scans, orders, visits, reviews, referrals] = await Promise.all([
      db.diagnosis.count({ where: { userId, status: "done" } }),
      db.order.count({ where: { userId, status: { in: ["paid", "delivered"] } } }),
      db.appointment.count({ where: { userId, status: "completed" } }),
      db.review.count({ where: { userId } }),
      wallet
        ? db.walletTransaction.count({ where: { walletId: wallet.id, type: "credit", reason: "referral" } })
        : Promise.resolve(0),
    ]);

    const items = [
      { kind: "scan", label: "Diagnostics IA", count: scans },
      { kind: "order", label: "Commandes boutique", count: orders },
      { kind: "visit", label: "Soins en institut", count: visits },
      { kind: "review", label: "Avis partagés", count: reviews },
      { kind: "referral", label: "Amies parrainées", count: referrals },
    ];
    const threads = items.reduce((s, it) => s + it.count, 0);

    // Rang suivant: prochain multiple de 5 (palier de fils)
    const next = Math.ceil((threads + 1) / 5) * 5;
    const remaining = next - threads;

    return NextResponse.json({
      threads,
      rank: rankOf(threads),
      items,
      seed: seedOf(userId),
      milestone: { next, remaining, progress: threads > 0 ? threads / next : 0 },
    });
  } catch (err) {
    return serverError("gold-threads:get", err);
  }
}
