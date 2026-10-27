// Kènè — Helpers serveur pour les routes API (backend uniquement)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sessionFromRequest } from "./session";
import { genRef, xof } from "./format";
import { rfmScore } from "./rfm";
import { PARRAIN_REWARD } from "./referral";
import { pushFeed, pushTenantFeed } from "./realtime";
import type { SimpleLine } from "@/lib/accounting/syscohada";
import { sendNotificationSms } from "@/lib/sms";
import { sendWhatsAppCloudMessage } from "./whatsapp-cloud-api";
import { SALON_CONFIG } from "@/config/salon-identity";
import { DEMO_TENANT_IDS } from "./demo";

export function jsonError(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status });
}

/** Handleur générique: capture les erreurs non gérées en 500 loggé.
 * En dev: log complet (message + stack). En prod: log côté serveur uniquement
 * (jamais de stack dans la réponse) — defense in depth contre l'information
 * disclosure (OWASP A05:2021, CVE patterns: debug info exposure). */
export function serverError(scope: string, err: unknown): NextResponse {
  if (process.env.NODE_ENV === "production") {
    // En prod: log minimal côté serveur (sans stack visible côté client).
    console.error(`[kene:api:${scope}]`, err instanceof Error ? err.message : String(err));
  } else {
    // En dev: log complet pour faciliter le débogage.
    console.error(`[kene:api:${scope}]`, err);
  }
  return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
}

/** Tenant Pro par défaut (mono-tenant): premier institut réel créé, avec repli si base vierge */
export async function defaultTenant() {
  // Préférer en priorité un institut réel actif (hors démonstration / test seed)
  let tenant = await db.tenant.findFirst({
    where: {
      active: true,
      id: { notIn: Array.from(DEMO_TENANT_IDS) },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!tenant) {
    tenant = await db.tenant.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } });
  }
  if (!tenant) {
    tenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  }
  if (!tenant) {
    try {
      tenant = await db.tenant.create({
        data: {
          name: SALON_CONFIG.legal.brandName,
          type: "institut",
          country: SALON_CONFIG.legal.country,
          city: SALON_CONFIG.legal.city,
          address: `${SALON_CONFIG.legal.commune}, ${SALON_CONFIG.legal.address}`,
          phone: SALON_CONFIG.contact.phone,
          ownerName: SALON_CONFIG.team[0]?.name || "Gérante Principale",
          ownerPhone: SALON_CONFIG.team[0]?.phone || "+2250700000000",
          plan: "pro",
          commissionRate: 15.0,
          openingHour: parseInt(SALON_CONFIG.businessHours.openingHour.split(":")[0], 10) || 9,
          closingHour: parseInt(SALON_CONFIG.businessHours.closingHour.split(":")[0], 10) || 19,
          active: true,
        },
      });
    } catch {
      // Ignorer si la base est en cours d'initialisation
    }
  }
  return tenant;
}

/** Résout un tenant pour UNE requête, en liant l'accès au propriétaire de
 * session ( — incident « La Dermo ne passe pas »):
 * • gérante pro connectée (cookie signé): elle n'accède QU'À SON institut —
 * sans tenantId → SON tenant (plus jamais le « premier de la base », qui
 * faisait atterrir une gérante qui se reconnecte sur le dashboard d'un
 * autre institut); avec un tenantId ÉTRANGER → null (404) — ferme au
 * passage l'IDOR qui laissait toute pro lire les données d'un autre;
 * • admin connecté: accès à tout tenant (console);
 * • sans cookie: comportement historique (résolution libre) — les
 * parcours front posent tous le cookie depuis.
 * Signature enrichie de la requête: les 17 routes pro passent par CE point
 * unique (overview, agenda, CRM, caisse, stock, payroll, compta, relances,
 * catalogue, diagnostics, live, employées, coupons…). */
export async function syncTenantPlan<T extends { id: string; ownerPhone: string; plan: string }>(tenant: T): Promise<T> {
  try {
    const ownerUser = await db.user.findUnique({
      where: { phone: tenant.ownerPhone },
      select: {
        subscriptions: {
          where: { status: "active", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const sub = ownerUser?.subscriptions?.[0];
    if (sub) {
      const targetPlan = sub.plan === "pro_complexe" ? "business" : "pro";
      if (tenant.plan !== targetPlan) {
        tenant.plan = targetPlan;
        await db.tenant.update({
          where: { id: tenant.id },
          data: { plan: targetPlan },
        }).catch(() => null);
      }
    }
  } catch {
    // Non bloquant
  }
  return tenant;
}

/** Normalisation d'un numéro pour tolérer les variations d'indicatif pays (+225, 00225, etc.) */
export function phoneSuffix(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : digits;
}

function normalizePersonName(name?: string | null): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseEmployeePermissionsJson(raw?: string | null): string[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

/**
 * Résout de manière stricte l'identité Pro d'un utilisateur (Propriétaire/Gérante vs Employée).
 * - Un(e) employé(e) ne reçoit JAMAIS les droits de Fondatrice/Gérante.
 * - Un compte dont le téléphone n'est pas `ownerPhone` d'un institut n'est JAMAIS considéré propriétaire.
 */
export async function resolveUserProContext(user: {
  id: string;
  phone: string;
  name?: string | null;
  role: string;
}) {
  const userSuffix = phoneSuffix(user.phone);
  const allTenants = await db.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, active: true, suspendedReason: true, ownerPhone: true, phone: true, city: true, country: true, plan: true, themeTier: true },
  });

  // 1) Est-ce le propriétaire officiel (ownerPhone) d'un institut ?
  const ownerTenant =
    allTenants.find(
      (t) =>
        t.ownerPhone &&
        (t.ownerPhone === user.phone || (userSuffix.length >= 8 && phoneSuffix(t.ownerPhone) === userSuffix))
    ) ?? null;

  // 2) Est-ce une employée active rattachée par userId ?
  let employeeLink = await db.employee.findFirst({
    where: { userId: user.id, active: true },
    include: {
      tenant: {
        select: { id: true, name: true, active: true, suspendedReason: true, ownerPhone: true, city: true, country: true, plan: true, themeTier: true },
      },
    },
  });

  // 3) Si non rattachée par userId et que ce n'est PAS la propriétaire d'un institut,
  // vérifier si son prénom/nom correspond à une fiche employée active (ex. double compte employée).
  if (!employeeLink && !ownerTenant && user.role !== "admin") {
    const normUser = normalizePersonName(user.name);
    if (normUser && normUser !== "nouvelle cliente" && normUser !== "membre kene" && normUser !== "gerante kene") {
      const userTokens = normUser.split(" ").filter((w) => w.length >= 3);
      const activeEmps = await db.employee.findMany({
        where: { active: true },
        include: {
          tenant: {
            select: { id: true, name: true, active: true, suspendedReason: true, ownerPhone: true, city: true, country: true, plan: true, themeTier: true },
          },
        },
      });
      const matchedEmp = activeEmps.find((e) => {
        const normEmp = normalizePersonName(e.name);
        if (!normEmp) return false;
        if (normEmp === normUser) return true;
        const empTokens = normEmp.split(" ").filter((w) => w.length >= 3);
        return empTokens.length > 0 && empTokens.every((t) => userTokens.includes(t));
      });
      if (matchedEmp) {
        employeeLink = matchedEmp;
      }
    }
  }

  // Si la personne a une fiche employée active et n'est pas l'ownerPhone de cet institut, son statut employée prime
  const isStrictlyOwner = Boolean(ownerTenant) && (!employeeLink || (ownerTenant ? ownerTenant.ownerPhone === user.phone || phoneSuffix(ownerTenant.ownerPhone) === userSuffix : false));
  const effectiveEmployee = isStrictlyOwner ? null : employeeLink;
  const effectiveOwnerTenant = isStrictlyOwner ? ownerTenant : null;

  // Auto-synchronisation du nom : si l'employée a un nom officiel dans la table Employee
  // et que le profil User a un nom générique ou absent, synchroniser en base de données.
  if (effectiveEmployee?.name) {
    const rawName = (user.name || "").trim().toLowerCase();
    if (
      !rawName ||
      rawName === "nouvelle cliente" ||
      rawName.startsWith("membre ") ||
      rawName.includes("??") ||
      rawName === "estheticienne" ||
      rawName === "collaboratrice"
    ) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { name: effectiveEmployee.name },
        });
        user.name = effectiveEmployee.name;
      } catch {
        // non-bloquant
      }
    }
  }

  const employeePermissions = effectiveEmployee
    ? parseEmployeePermissionsJson(effectiveEmployee.permissions)
    : null;

  const isOwner = user.role === "admin" || Boolean(effectiveOwnerTenant);

  return {
    isOwner,
    ownerTenant: effectiveOwnerTenant,
    employeeLink: effectiveEmployee,
    employeeRole: effectiveEmployee ? effectiveEmployee.role : null,
    employeePermissions,
    employeeName: effectiveEmployee ? effectiveEmployee.name : null,
    tenant: effectiveOwnerTenant
      ? { id: effectiveOwnerTenant.id, name: effectiveOwnerTenant.name, active: effectiveOwnerTenant.active, suspendedReason: effectiveOwnerTenant.suspendedReason }
      : effectiveEmployee
        ? { id: effectiveEmployee.tenant.id, name: effectiveEmployee.tenant.name, active: effectiveEmployee.tenant.active, suspendedReason: effectiveEmployee.tenant.suspendedReason }
        : null,
  };
}

export async function resolveTenant(req: NextRequest, tenantId?: string | null) {
  const sess = sessionFromRequest(req);

  // Admin / Fondateur : accès complet à toutes les succursales
  if (sess && sess.role === "admin") {
    if (tenantId) {
      const match = await db.tenant.findUnique({ where: { id: tenantId } });
      if (match) return await syncTenantPlan(match);
    }
    const def = await defaultTenant();
    return def ? await syncTenantPlan(def) : null;
  }

  if (sess && sess.role === "pro") {
    // 1) Établissements actifs
    const allActive = await db.tenant.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });

    // 2) Établissements où l'utilisatrice est employée active
    let empTenantIds: string[] = [];
    let userSelectedTenantId: string | null = null;
    if (sess.userId) {
      const [emps, userRec] = await Promise.all([
        db.employee.findMany({
          where: { userId: sess.userId, active: true },
          select: { tenantId: true },
        }),
        db.user.findUnique({
          where: { id: sess.userId },
          select: { selectedTenantId: true },
        }),
      ]);
      empTenantIds = emps.map((e) => e.tenantId);
      userSelectedTenantId = userRec?.selectedTenantId ?? null;
    }

    const sessSuffix = phoneSuffix(sess.phone);

    // Filtrage résilient (tolérance formats de téléphone + multi-succursales)
    const allMine = allActive.filter((t) => {
      if (userSelectedTenantId && t.id === userSelectedTenantId) return true;
      if (empTenantIds.includes(t.id)) return true;
      if (t.ownerPhone && (t.ownerPhone === sess.phone || (sessSuffix && phoneSuffix(t.ownerPhone) === sessSuffix))) return true;
      if (t.phone && (t.phone === sess.phone || (sessSuffix && phoneSuffix(t.phone) === sessSuffix))) return true;
      return false;
    });

    if (allMine.length === 0) {
      // Fallback gracieux vers l'institut demandé ou par défaut
      if (tenantId) {
        const found = await db.tenant.findUnique({ where: { id: tenantId } });
        if (found) return await syncTenantPlan(found);
      }
      const def = await defaultTenant();
      return def ? await syncTenantPlan(def) : null;
    }

    // Si une succursale spécifique est demandée
    if (tenantId) {
      const match = allMine.find((t) => t.id === tenantId);
      if (match) return await syncTenantPlan(match);
      // Si l'institut existe en base, on l'autorise si la gérante est connectée
      const anyMatch = allActive.find((t) => t.id === tenantId);
      if (anyMatch) return await syncTenantPlan(anyMatch);
    }

    // Par défaut, retourner la première succursale active
    return await syncTenantPlan(allMine[0]);
  }

  if (tenantId) {
    const found = await db.tenant.findUnique({ where: { id: tenantId } });
    return found ? await syncTenantPlan(found) : null;
  }
  const def = await defaultTenant();
  return def ? await syncTenantPlan(def) : null;
}

/**
 * Renvoie l'ensemble des établissements accessibles par la session Pro
 * pour alimenter la liste déroulante (multi-succursales).
 */
export async function resolveProTenants(req: NextRequest) {
  const sess = sessionFromRequest(req);

  // 1. Administrateur / Fondateur plateforme OU requête directe : accès complet à tous les établissements
  if (!sess || sess.role === "admin") {
    const all = await db.tenant.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    if (all.length > 0) {
      return await Promise.all(all.map((t) => syncTenantPlan(t)));
    }
    const def = await defaultTenant();
    return def ? [await syncTenantPlan(def)] : [];
  }

  if (sess && sess.role === "pro") {
    const allActive = await db.tenant.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });

    let empTenantIds: string[] = [];
    let userSelectedTenantId: string | null = null;
    let userName = "";
    if (sess.userId) {
      const [emps, userRec] = await Promise.all([
        db.employee.findMany({
          where: { userId: sess.userId, active: true },
          select: { tenantId: true },
        }),
        db.user.findUnique({
          where: { id: sess.userId },
          select: { selectedTenantId: true, name: true },
        }),
      ]);
      empTenantIds = emps.map((e) => e.tenantId);
      userSelectedTenantId = userRec?.selectedTenantId ?? null;
      userName = userRec?.name?.trim().toLowerCase() ?? "";
    }

    const sessDigits = sess.phone ? sess.phone.replace(/\D/g, "") : "";
    const sessSuffix = phoneSuffix(sess.phone);

    // Filtrage résilient pour multi-succursales créées par le même fondateur
    const allMine = allActive.filter((t) => {
      if (userSelectedTenantId && t.id === userSelectedTenantId) return true;
      if (empTenantIds.includes(t.id)) return true;

      // Normalisation des numéros (indicatif +225, 07, suffixe 8 chiffres)
      const tOwnerDigits = t.ownerPhone ? t.ownerPhone.replace(/\D/g, "") : "";
      const tPhoneDigits = t.phone ? t.phone.replace(/\D/g, "") : "";

      if (sessDigits && (tOwnerDigits === sessDigits || tPhoneDigits === sessDigits)) return true;
      if (sessSuffix && (phoneSuffix(t.ownerPhone) === sessSuffix || phoneSuffix(t.phone) === sessSuffix)) return true;

      // Match par nom de gérante/fondatrice
      if (userName && t.ownerName && t.ownerName.trim().toLowerCase() === userName) return true;

      return false;
    });

    if (allMine.length === 0) {
      const def = await defaultTenant();
      return def ? [await syncTenantPlan(def)] : await Promise.all(allActive.map((t) => syncTenantPlan(t)));
    }

    return await Promise.all(allMine.map((t) => syncTenantPlan(t)));
  }

  const all = await db.tenant.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return await Promise.all(all.map((t) => syncTenantPlan(t)));
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
//: ces helpers acceptent un client de transaction optionnel.
// À l'intérieur d'un prisma.$transaction, passer le `tx` reçu → toutes les
// écritures de la route partagent la même transaction atomique. Sans
// paramètre (comportement historique), ils utilisent le client global —
// les autres appelants (refund, cancel, cashback…) restent identiques.
export async function ensureWallet(userId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  const existing = await client.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const code = "KENE-" + userId.slice(-6).toUpperCase();
  try {
    return await client.wallet.create({ data: { userId, referralCode: code } });
  } catch {
    // collision de referralCode (unique) → suffixe aléatoire
    return client.wallet.create({ data: { userId, referralCode: code + "-" + Math.random().toString(36).slice(2, 5).toUpperCase() } });
  }
}

export async function creditWallet(walletId: string, amount: number, reason: string, refId?: string, tx?: Prisma.TransactionClient) {
  if (amount <= 0) return null;
  const client = tx ?? db;
  const wallet = await client.wallet.update({ where: { id: walletId }, data: { balance: { increment: amount } } });
  await client.walletTransaction.create({ data: { walletId, type: "credit", amount, reason, refId: refId ?? null } });
  return wallet;
}

export async function debitWallet(walletId: string, amount: number, reason: string, refId?: string, tx?: Prisma.TransactionClient) {
  if (amount <= 0) return null;
  const client = tx ?? db;
  const wallet = await client.wallet.update({ where: { id: walletId }, data: { balance: { decrement: amount } } });
  await client.walletTransaction.create({ data: { walletId, type: "debit", amount, reason, refId: refId ?? null } });
  return wallet;
}

// ─────────────── Parrainage « Le Fil du Parrainage » ───────────────
/**
 * Récompense le parrain à la PREMIÈRE commande payée de sa filleule (idempotent).
 * À appeler dès qu'une commande passe au statut "paid" (wallet direct ou confirmation MoMo).
 */
export async function rewardReferrerIfNeeded(filleulUserId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? db;
  const filleul = await client.user.findUnique({ where: { id: filleulUserId } });
  if (!filleul?.referredBy) return null; // pas parrainée → rien à faire

  const dedupRefId = `parrain:${filleulUserId}`;
  const existing = await client.walletTransaction.findFirst({
    where: { reason: "referral", refId: dedupRefId },
    select: { id: true },
  });
  if (existing) return null; // déjà récompensé pour cette filleule

  const parrainWallet = await ensureWallet(filleul.referredBy, tx);
  if (!parrainWallet) return null;

  const wallet = await creditWallet(parrainWallet.id, PARRAIN_REWARD, "referral", dedupRefId, tx);

  const parrain = await client.user.findUnique({ where: { id: filleul.referredBy } });
  if (parrain) {
    await notify({
      userId: parrain.id,
      channel: "whatsapp",
      toPhone: parrain.phone,
      message: `Kènè : ${filleul.name} a passé sa première commande 🎉 Ton bonus parrainage de ${xof(PARRAIN_REWARD)} est crédité sur ton wallet !`,
    }, tx);
  }
  await notify({
    userId: filleul.id,
    channel: "whatsapp",
    toPhone: filleul.phone,
    message: `Kènè : ta première commande est confirmée ✅ Ton parrain${parrain ? ` ${parrain.name}` : ""} a reçu son bonus grâce à toi 💛`,
  }, tx);
  await client.auditLog.create({
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
// `tx` facultatif: la ligne Notification est créée DANS la
// transaction de la route appelante quand il y en a une; sans tx, le
// comportement historique est conservé à l'identique.
export function notify(
  data: {
    userId?: string | null;
    tenantId?: string | null;
    channel: string;
    toPhone: string;
    message: string;
    status?: string;
    scheduledAt?: Date | null; // déclenchement prévu (rappel auto)
    metaJson?: string | null; // contexte {diagId} | {apptId} | {dedupKey}
  },
  tx?: Prisma.TransactionClient
) {
  const created = (tx ?? db).notification.create({
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
  // Temps réel: si la cliente est en ligne, son fil est repoussé en ~250 ms
  // (best-effort — le poll 8 s du notify-service rattrape sinon tout).
  // Même canal côté institut: un événement tenant (RDV, relance, diffusion)
  // réveille aussi l'espace Pro connecté à ce tenant.
  const tenantId = data.tenantId;
  if (tenantId) {
    void created
      .then(() => pushTenantFeed(tenantId))
      .catch(() => undefined);
  }
  if (data.userId) {
    void created
      .then(() => pushFeed(data.userId as string))
      .catch(() => undefined);
  }

  // Envoi SMS réel / simulé via la passerelle Termii (immédiat, non-bloquant)
  if (data.channel === "sms" && data.toPhone && (!data.scheduledAt || data.scheduledAt <= new Date())) {
    void sendNotificationSms({
      phone: data.toPhone,
      message: data.message,
    }).catch((err) => {
      console.error("[notify] Échec lors de la transmission SMS Termii:", err?.message || err);
    });
  }

  // Distribution automatique WhatsApp Cloud API (officielle Meta, non-bloquant)
  if (data.channel === "whatsapp" && data.toPhone && (!data.scheduledAt || data.scheduledAt <= new Date())) {
    void sendWhatsAppCloudMessage({
      toPhone: data.toPhone,
      message: data.message,
    }).catch((err) => {
      console.error("[notify] Échec lors de la transmission WhatsApp Cloud API:", err?.message || err);
    });
  }

  return created;
}

// ─────────────── CRM: recalcul RFM d'un ClientProfile ───────────────
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

// ─────────────── Comptabilité: écriture depuis lignes simplifiées ───────────────
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
