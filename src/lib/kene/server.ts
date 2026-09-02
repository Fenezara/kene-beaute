// Kènè — Helpers serveur pour les routes API (backend uniquement)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { genRef, xof } from "./format";
import { rfmScore } from "./rfm";
import { PARRAIN_REWARD } from "./referral";
import type { SimpleLine } from "@/lib/accounting/syscohada";

export function jsonError(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Handleur générique : capture les erreurs non gérées en 500 loggé */
export function serverError(scope: string, err: unknown): NextResponse {
  console.error(`[kene:api:${scope}]`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
}

/** Tenant Pro par défaut (mono-tenant démo) : premier créé */
export function defaultTenant() {
  return db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
}

/** Résout un tenant par id, sinon le tenant par défaut ; null si l'id n'existe pas */
export async function resolveTenant(tenantId?: string | null) {
  if (tenantId) return db.tenant.findUnique({ where: { id: tenantId } });
  return defaultTenant();
}

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function instituteImage(name: string): string {
  return `/instituts/${slugify(name)}.webp`;
}

// ─────────────── Dates ───────────────
export function dayStart(d: Date = new Date()): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

export function dayEnd(d: Date = new Date()): Date {
  const n = new Date(d);
  n.setHours(23, 59, 59, 999);
  return n;
}

export function daysAgo(n: number): Date {
  const d = dayStart();
  d.setDate(d.getDate() - n);
  return d;
}

export function ddMM(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function hhmm(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Chevauchement de deux intervalles [start, start+durée) en minutes */
export function overlaps(startA: Date, durA: number, startB: Date, durB: number): boolean {
  const a0 = startA.getTime();
  const a1 = a0 + durA * 60_000;
  const b0 = startB.getTime();
  const b1 = b0 + durB * 60_000;
  return a0 < b1 && b0 < a1;
}

// ─────────────── Wallet ───────────────
export async function ensureWallet(userId: string) {
  const existing = await db.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const code = "KENE-" + userId.slice(-6).toUpperCase();
  try {
    return await db.wallet.create({ data: { userId, referralCode: code } });
  } catch {
    // collision de referralCode (unique) → suffixe aléatoire
    return db.wallet.create({ data: { userId, referralCode: code + "-" + Math.random().toString(36).slice(2, 5).toUpperCase() } });
  }
}

export async function creditWallet(walletId: string, amount: number, reason: string, refId?: string) {
  if (amount <= 0) return null;
  const wallet = await db.wallet.update({ where: { id: walletId }, data: { balance: { increment: amount } } });
  await db.walletTransaction.create({ data: { walletId, type: "credit", amount, reason, refId: refId ?? null } });
  return wallet;
}

export async function debitWallet(walletId: string, amount: number, reason: string, refId?: string) {
  if (amount <= 0) return null;
  const wallet = await db.wallet.update({ where: { id: walletId }, data: { balance: { decrement: amount } } });
  await db.walletTransaction.create({ data: { walletId, type: "debit", amount, reason, refId: refId ?? null } });
  return wallet;
}

// ─────────────── Parrainage « Le Fil du Parrainage » ───────────────
/**
 * Récompense le parrain à la PREMIÈRE commande payée de sa filleule (idempotent).
 * À appeler dès qu'une commande passe au statut "paid" (wallet direct ou confirmation MoMo).
 */
export async function rewardReferrerIfNeeded(filleulUserId: string) {
  const filleul = await db.user.findUnique({ where: { id: filleulUserId } });
  if (!filleul?.referredBy) return null; // pas parrainée → rien à faire

  const dedupRefId = `parrain:${filleulUserId}`;
  const existing = await db.walletTransaction.findFirst({
    where: { reason: "referral", refId: dedupRefId },
    select: { id: true },
  });
  if (existing) return null; // déjà récompensé pour cette filleule

  const parrainWallet = await ensureWallet(filleul.referredBy);
  if (!parrainWallet) return null;

  const wallet = await creditWallet(parrainWallet.id, PARRAIN_REWARD, "referral", dedupRefId);

  const parrain = await db.user.findUnique({ where: { id: filleul.referredBy } });
  if (parrain) {
    await notify({
      userId: parrain.id,
      channel: "whatsapp",
      toPhone: parrain.phone,
      message: `Kènè : ${filleul.name} a passé sa première commande 🎉 Ton bonus parrainage de ${xof(PARRAIN_REWARD)} est crédité sur ton wallet !`,
    });
  }
  await notify({
    userId: filleul.id,
    channel: "whatsapp",
    toPhone: filleul.phone,
    message: `Kènè : ta première commande est confirmée ✅ Ton parrain${parrain ? ` ${parrain.name}` : ""} a reçu son bonus grâce à toi 💛`,
  });
  await db.auditLog.create({
    data: {
      userId: filleul.id,
      action: "referral_reward",
      entity: "wallet",
      entityId: parrainWallet.id,
      detailsJson: JSON.stringify({ parrainId: filleul.referredBy, filleulId: filleulUserId, amount: PARRAIN_REWARD, refId: dedupRefId }),
    },
  });
  return wallet;
}

// ─────────────── Notifications (SMS/WhatsApp simulés) ───────────────
export function notify(data: {
  userId?: string | null;
  tenantId?: string | null;
  channel: string;
  toPhone: string;
  message: string;
  status?: string;
  scheduledAt?: Date | null; // déclenchement prévu (rappel auto)
  metaJson?: string | null; // contexte {diagId} | {apptId} | {dedupKey}
}) {
  return db.notification.create({
    data: {
      userId: data.userId ?? null,
      tenantId: data.tenantId ?? null,
      channel: data.channel,
      toPhone: data.toPhone,
      message: data.message,
      status: data.status ?? "sent",
      scheduledAt: data.scheduledAt ?? null,
      metaJson: data.metaJson ?? null,
    },
  });
}

// ─────────────── CRM : recalcul RFM d'un ClientProfile ───────────────
export async function recomputeClientRfm(clientProfileId: string) {
  const client = await db.clientProfile.findUnique({ where: { id: clientProfileId } });
  if (!client) return null;
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const sales = await db.sale.findMany({
    where: { clientProfileId, status: "completed", createdAt: { gte: since } },
    select: { total: true },
  });
  const recencyDays = client.lastVisit ? Math.max(0, Math.floor((Date.now() - client.lastVisit.getTime()) / 86_400_000)) : 999;
  const monetary = sales.reduce((s, x) => s + x.total, 0);
  const { segment } = rfmScore(recencyDays, sales.length, monetary);
  return db.clientProfile.update({ where: { id: clientProfileId }, data: { rfmSegment: segment } });
}

// ─────────────── Comptabilité : écriture depuis lignes simplifiées ───────────────
export async function createJournalEntry(
  tenantId: string,
  opts: { journalCode: string; date: Date; reference: string; description: string; sourceType?: string; sourceId?: string; lines: SimpleLine[] }
) {
  const accounts = await db.chartAccount.findMany({ where: { tenantId } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const resolved = opts.lines
    .map((l) => {
      const acc = byCode.get(l.accountCode);
      if (!acc) return null; // compte absent du plan → ligne sautée
      return { accountId: acc.id, debit: Math.round(l.debit ?? 0), credit: Math.round(l.credit ?? 0), label: l.label ?? null };
    })
    .filter((l): l is { accountId: string; debit: number; credit: number; label: string | null } => l !== null);
  if (resolved.length === 0) return null;
  return db.journalEntry.create({
    data: {
      tenantId,
      journalCode: opts.journalCode,
      date: opts.date,
      reference: opts.reference,
      description: opts.description,
      sourceType: opts.sourceType ?? null,
      sourceId: opts.sourceId ?? null,
      lines: { create: resolved },
    },
    include: { lines: true },
  });
}

export { genRef };
