// PATCH /api/admin/subscriptions/[id] — les leviers de gestion des
// abonnements (t. 135). ⚠ Step-up t. 130: session admin + ÉLÉVATION
// fraîche (< 5 min) — une action de facturation est sensible (ASVS V2.7).
//
// • { action: "cancel", reason } — ANNULATION (motif obligatoire, min 3):
//   la ligne passe « cancelled » (jamais supprimée — IFRS 15 / SYSCOHADA:
//   le passé comptable est intouchable), l'abonnée perd ses avantages
//   immédiatement (getActiveSubscription ne voit plus la ligne), elle est
//   notifiée avec le motif, et son rappel d'échéance J-3 programmé est
//   retiré. Elle peut se réabonner librement.
// • { action: "extend" } — OFFRIR 30 JOURS (geste commercial): la ligne
//   courante passe « cancelled » et une NOUVELLE ligne est créée, même
//   plan, 0 F, source « console_gift », expire à max(échéance, maintenant)
//   + 30 jours. On n'écrase JAMAIS une échéance existante — la période
//   offerte est TRAÇÉE dans l'historique. L'abonnée est notifiée.
//
// Audit: subscription_cancelled / subscription_extended (journal Sécurité).
// Contrat: 200 { ok, changed, message, subscription } · 400/401/403/404.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify, ddMM } from "@/lib/kene/server";
import { guardAdminElevated } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { readMeta } from "@/lib/kene/reminders";
import { subPlanLabel } from "@/lib/kene/plans";

export const runtime = "nodejs";

const Body = z.object({
  action: z.enum(["cancel", "extend"], { message: "Action inconnue (cancel ou extend)" }),
  reason: z.string().trim().min(3, "Un motif est requis (min. 3 caractères)").max(280).optional(),
});

/** Retire les rappels d'échéance J-3 programmés d'un abonnement (annulation,
 * extension: la nouvelle ligne aura son propre rappel au backfill). */
async function purgeExpiryReminders(userId: string, subscriptionId: string): Promise<void> {
  const scheduled = await db.notification.findMany({
    where: { userId, status: "scheduled" },
    select: { id: true, metaJson: true },
  });
  const ids = scheduled
    .filter((n) => readMeta(n.metaJson).dedupKey === `sub:${subscriptionId}`)
    .map((n) => n.id);
  if (ids.length > 0) {
    await db.notification.deleteMany({ where: { id: { in: ids } } });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "admin:subs:patch"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop d'actions — réessaie dans une minute");
  // t. 130/135 — step-up: session admin + élévation fraîche (401/403/
  // elevation_required selon le cas).
  const guard = guardAdminElevated(req);
  if (guard) return guard;
  try {
    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Requête invalide", 400);
    }
    const { action, reason } = parsed.data;

    const sub = await db.subscription.findUnique({ where: { id }, include: { user: true } });
    if (!sub) return jsonError("Abonnement introuvable", 404);
    const user = sub.user;
    const planLabel = subPlanLabel(sub.plan);
    const now = new Date();
    const isLive = sub.status === "active" && sub.expiresAt.getTime() > now.getTime();
    const ip = clientIp(req);

    // ── ANNULATION ───────────────────────────────────────────────
    if (action === "cancel") {
      if (!reason) {
        return jsonError("Un motif est requis pour annuler un abonnement (montré à l'abonnée)", 400);
      }
      if (sub.status === "cancelled") {
        return jsonError("Cet abonnement est déjà annulé", 400);
      }
      if (!isLive) {
        return jsonError("Cet abonnement est déjà expiré — rien à annuler", 400);
      }
      const updated = await db.subscription.update({ where: { id }, data: { status: "cancelled" } });
      await purgeExpiryReminders(user.id, id);
      void notify({
        userId: user.id,
        channel: "app",
        toPhone: user.phone,
        message: `🛑 Ton abonnement ${planLabel} a été annulé par la Console Kènè — ${reason}. Tu peux te réabonner à tout moment depuis la carte Abonnement de ton profil.`,
      });
      void audit({
        kind: "subscription_cancelled",
        userId: user.id,
        ip,
        detail: `${planLabel} — ${reason}`,
      });
      return NextResponse.json({
        ok: true,
        changed: true,
        message: `Abonnement ${planLabel} annulé — ${user.name.split(" ")[0]} est notifiée`,
        subscription: { id: updated.id, status: updated.status, expiresAt: updated.expiresAt.toISOString() },
      });
    }

    // ── OFFRIR 30 JOURS ──────────────────────────────────────────
    if (sub.status === "cancelled") {
      return jsonError(
        `Abonnement annulé — ${user.name.split(" ")[0]} doit se réabonner depuis son profil`,
        400,
      );
    }
    // La période offerte se RACCORDE à la fin de l'échéance courante (une
    // ligne déjà expirée repart de maintenant — geste de réactivation).
    const base = sub.expiresAt.getTime() > now.getTime() ? sub.expiresAt : now;
    const newExpires = new Date(base.getTime() + 30 * 86_400_000);

    const gift = await db.$transaction(async (tx) => {
      if (isLive) {
        // Une seule ligne active fait foi (même règle que activatePlan).
        await tx.subscription.update({ where: { id }, data: { status: "cancelled" } });
      }
      return tx.subscription.create({
        data: {
          userId: user.id,
          plan: sub.plan,
          status: "active",
          priceFcfa: 0, // geste commercial — 0 F, hors revenus
          source: "console_gift",
          startedAt: now,
          expiresAt: newExpires,
        },
      });
    });
    await purgeExpiryReminders(user.id, id);
    void notify({
      userId: user.id,
      channel: "app",
      toPhone: user.phone,
      message: `🎁 Bonne nouvelle ${user.name.split(" ")[0]} : la Console Kènè t'offre 30 jours — ton abonnement ${planLabel} est actif jusqu'au ${ddMM(gift.expiresAt)}. Profite bien 💛`,
    });
    void audit({
      kind: "subscription_extended",
      userId: user.id,
      ip,
      detail: `${planLabel} → +30 j offerts (jusqu'au ${ddMM(gift.expiresAt)})`,
    });
    return NextResponse.json({
      ok: true,
      changed: true,
      message: `30 jours offerts — ${planLabel} actif jusqu'au ${ddMM(gift.expiresAt)}`,
      subscription: { id: gift.id, status: gift.status, expiresAt: gift.expiresAt.toISOString() },
    });
  } catch (err) {
    return serverError("admin/subscription:patch", err);
  }
}
