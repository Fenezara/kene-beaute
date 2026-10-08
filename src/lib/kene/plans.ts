// Kènè — Abonnements & monétisation (lib serveur,).
// Plans: cliente « Kènè+ » (2 500 FCFA/mois — diagnostics illimités, suivi
// évolution, Dr. Kènè prioritaire, défis routines); pro « Essentiel »
// (15 000 FCFA/mois — RDV, clients, catalogue, boutique) et « Complexe »
// (45 000 FCFA/mois — + paie CNPS/IPM, comptabilité SYSCOHADA,
// multi-établissements).
// PAIEMENT EN MODE ESSAI: source = "momo_sim" — aucun argent réel ne circule,
// la mention « mode essai — aucun débit réel » est affichée à l'utilisatrice.
// Gating quota (branché par le main agent dans POST /api/diagnoses):
// plan gratuit = 1 diagnostic/mois, Kènè+ = illimité (9999).
// L'argent est simulé, comme le reste de la version d'essai — honnêteté absolue.
import type { Subscription } from "@prisma/client";
import { db } from "@/lib/db";
import { ddMM, notify } from "@/lib/kene/server";

// ─────────────── Définitions des plans payants ───────────────

export type PlanAudience = "client" | "pro";

export interface PlanTier {
  month: number;
  priceFcfa: number;
  label: string;
}

export interface PlanDef {
  id: string;
  audience: PlanAudience;
  name: string;
  tagline: string;
  priceFcfa: number; // Prix de départ (Mois 1)
  minPriceFcfa: number; // Prix plancher fidélité (Mois 6+)
  trialDays: number; // Durée de l'essai 100% gratuit
  tiers: PlanTier[];
  perks: string[];
  badge?: string;
}

/** Les offres Kènè avec 1 mois gratuit & dégressivité à la fidélité.
 * Si un mois est sauté sans payer, réinitialisation au tarif de départ. */
export const PLAN_DEFS: readonly PlanDef[] = [
  {
    id: "kene_plus",
    audience: "client",
    name: "Kènè+",
    tagline: "Le rituel beauté mélanoderme complet, sans limite",
    priceFcfa: 5000,
    minPriceFcfa: 2500,
    trialDays: 30,
    tiers: [
      { month: 0, priceFcfa: 0, label: "Mois Découverte (30j offerts)" },
      { month: 1, priceFcfa: 5000, label: "Mois 1 · L'Initiée" },
      { month: 2, priceFcfa: 4500, label: "Mois 2 · L'Adepte" },
      { month: 3, priceFcfa: 4000, label: "Mois 3 · L'Ambassadrice" },
      { month: 4, priceFcfa: 3500, label: "Mois 4 · L'Étoffe d'Or" },
      { month: 5, priceFcfa: 3000, label: "Mois 5 · La Favorite" },
      { month: 6, priceFcfa: 2500, label: "Mois 6+ · Le Cercle Royal (à vie)" },
    ],
    perks: [
      "1er mois 100% gratuit avec accès complet à toutes les fonctionnalités",
      "Bilans dermo-biométriques illimités (visage, dos, mains, cuir chevelu)",
      "Dermo Kènè illimitée 24h/24 & 7j/7 par texte et notes vocales",
      "Visualiseur multi-spectral & comparatif tactile Avant/Après",
      "Tarif dégressif à la fidélité : descend de 5 000 F à 2 500 F/mois",
      "Remises de 5% à 10% sur toute la Boutique Kènè",
      "Coupe-file et accueil VIP dans les instituts partenaires",
    ],
    badge: "Le plus choisi",
  },
  {
    id: "pro_starter",
    audience: "pro",
    name: "Pro Starter",
    tagline: "Praticienne solo & dermo-conseil indépendant",
    priceFcfa: 10000,
    minPriceFcfa: 5000,
    trialDays: 30,
    tiers: [
      { month: 0, priceFcfa: 0, label: "Mois Découverte (30j offerts)" },
      { month: 1, priceFcfa: 10000, label: "Mois 1" },
      { month: 2, priceFcfa: 9000, label: "Mois 2" },
      { month: 3, priceFcfa: 8000, label: "Mois 3" },
      { month: 4, priceFcfa: 7000, label: "Mois 4" },
      { month: 5, priceFcfa: 6000, label: "Mois 5" },
      { month: 6, priceFcfa: 5000, label: "Mois 6+ (à vie)" },
    ],
    perks: [
      "1er mois 100% gratuit avec accès complet à toutes les fonctionnalités",
      "1 Praticienne & 1 Cabine de soin dédiée",
      "Agenda en ligne synchronisé & réservations 24h/24",
      "Acomptes Mobile Money SasPay / Wave (zéro no-show)",
      "Fiches clientes & historique dermo-conseil",
      "Tarif dégressif à la fidélité : descend de 10 000 F à 5 000 F/mois",
      "Rappels de RDV automatisés par WhatsApp & SMS",
      "Référencement sur l'annuaire dermo-beauté Kènè",
    ],
  },
  {
    id: "pro_institut",
    audience: "pro",
    name: "Pro Institut",
    tagline: "Le cœur de gestion des salons & instituts établis",
    priceFcfa: 20000,
    minPriceFcfa: 10000,
    trialDays: 30,
    tiers: [
      { month: 0, priceFcfa: 0, label: "Mois Découverte (30j offerts)" },
      { month: 1, priceFcfa: 20000, label: "Mois 1" },
      { month: 2, priceFcfa: 18000, label: "Mois 2" },
      { month: 3, priceFcfa: 16000, label: "Mois 3" },
      { month: 4, priceFcfa: 14000, label: "Mois 4" },
      { month: 5, priceFcfa: 12000, label: "Mois 5" },
      { month: 6, priceFcfa: 10000, label: "Mois 6+ (à vie)" },
    ],
    perks: [
      "1er mois 100% gratuit avec accès complet à toutes les fonctionnalités",
      "Tout Pro Starter inclus",
      "Jusqu'à 6 praticiennes & multi-cabines",
      "Caisse POS tactile & impression thermique Bluetooth ESC/POS",
      "Gestion des stocks (Cabine vs Revente & alertes réassort)",
      "CRM avancé & segmentation RFM (Champions, Fidèles, À risque)",
      "Tarif dégressif à la fidélité : descend de 20 000 F à 10 000 F/mois",
      "Le Fil du Retour : relances automatiques J+7, J+21 & anniversaires",
      "Tableau de bord financier & rentabilité des prestations",
    ],
    badge: "Recommandé",
  },
  {
    id: "pro_complexe",
    audience: "pro",
    name: "Pro Complexe",
    tagline: "Grands spas, cliniques dermo & multi-établissements",
    priceFcfa: 30000,
    minPriceFcfa: 20000,
    trialDays: 30,
    tiers: [
      { month: 0, priceFcfa: 0, label: "Mois Découverte (30j offerts)" },
      { month: 1, priceFcfa: 30000, label: "Mois 1" },
      { month: 2, priceFcfa: 28000, label: "Mois 2" },
      { month: 3, priceFcfa: 26000, label: "Mois 3" },
      { month: 4, priceFcfa: 24000, label: "Mois 4" },
      { month: 5, priceFcfa: 22000, label: "Mois 5" },
      { month: 6, priceFcfa: 20000, label: "Mois 6+ (à vie)" },
    ],
    perks: [
      "1er mois 100% gratuit avec accès complet à toutes les fonctionnalités",
      "Tout Pro Institut inclus",
      "Multi-établissements & succursales illimitées",
      "Praticiennes et cabines illimitées",
      "Paie RH certifiée CNPS (CI) / IPRES (SN) & calcul commissions",
      "Comptabilité SYSCOHADA (clôtures caisse, TVA, Grand Livre)",
      "Tarif dégressif à la fidélité : descend de 30 000 F à 20 000 F/mois",
      "Assistant vocal intelligent gérante « Maman Kènè »",
      "Accompagnement VIP & support WhatsApp prioritaire dédié 7j/7",
    ],
    badge: "Excellence",
  },
];

export function planDefById(planId: string): PlanDef | null {
  if (planId === "pro_essentiel") return PLAN_DEFS.find((p) => p.id === "pro_institut") ?? null;
  return PLAN_DEFS.find((p) => p.id === planId) ?? null;
}

/** Libellé humain d'un plan (« kene_plus » → « Kènè+ ») — contrat
 * d'affichage partagé console admin + fil notifications cliente. */
export function subPlanLabel(plan: string): string {
  if (plan === "kene_plus") return "Kènè+";
  if (plan === "pro_starter") return "Pro Starter";
  if (plan === "pro_institut" || plan === "pro_essentiel") return "Pro Institut";
  if (plan === "pro_complexe") return "Pro Complexe";
  return plan;
}

// ─────────────── Plan gratuit & quota diagnostics ───────────────

/** Quota « illimité »: les checks serveurs comparent remaining > 0 —
 * 9999 est de facto infini pour un mois calendaire (défis impossibles). */
export const DIAG_QUOTA_UNLIMITED = 9999;

export const FREE_PLAN = {
  id: "gratuit",
  diagQuotaMonth: 1,
} as const;

// ─────────────── Lecture de l'abonnement actif ───────────────

/** Abonnement actif non expiré le plus récent du user (ou null).
 * Les lignes cancelled/expired restent en base (historique honnête) mais
 * ne comptent plus — la plus récente active fait foi. */
export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  return db.subscription.findFirst({
    where: { userId, status: "active", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Offre 30 jours de Kènè+ gratuit (Pass Découverte) à une cliente lors de sa première inscription.
 * Idempotent: si l'utilisatrice a déjà eu une ligne d'abonnement ou d'essai, ne recrée rien.
 */
export async function grantClientWelcomeTrial(userId: string): Promise<Subscription | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "client") return null;

  const existingSub = await db.subscription.findFirst({ where: { userId } });
  if (existingSub) return null;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const sub = await db.subscription.create({
    data: {
      userId: user.id,
      plan: "kene_plus",
      status: "active",
      priceFcfa: 0,
      source: "welcome_trial",
      expiresAt,
    },
  });

  await notify({
    userId: user.id,
    channel: "whatsapp",
    toPhone: user.phone,
    message: `Bienvenue sur Kènè 🌿 Nous t'offrons 30 jours de Pass Kènè+ gratuit ! Profite de diagnostics illimités et des conseils de Dermo Kènè jusqu'au ${ddMM(expiresAt)} 💛`,
  }).catch(() => null);

  return sub;
}

/**
 * Offre 30 jours de Pass Pro Complexe gratuit (Pass Découverte Établissement) à un compte pro.
 * Débloque 100% de toutes les fonctionnalités avancées (SYSCOHADA, paie, multi-cabines, CRM, etc.).
 * Idempotent: si le pro a déjà une ligne d'abonnement ou d'essai, ne recrée rien.
 */
export async function grantProWelcomeTrial(userId: string, tenantId?: string): Promise<Subscription | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "pro") return null;

  const existingSub = await db.subscription.findFirst({ where: { userId } });
  if (existingSub) return null;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const sub = await db.$transaction(async (tx) => {
    const s = await tx.subscription.create({
      data: {
        userId: user.id,
        plan: "pro_complexe",
        status: "active",
        priceFcfa: 0,
        source: "welcome_offer",
        expiresAt,
      },
    });

    if (tenantId) {
      await tx.tenant.update({ where: { id: tenantId }, data: { plan: "business" } });
    } else {
      await tx.tenant.updateMany({ where: { ownerPhone: user.phone }, data: { plan: "business" } });
    }

    return s;
  });

  await notify({
    userId: user.id,
    channel: "whatsapp",
    toPhone: user.phone,
    message: `Bienvenue sur Kènè Pro 🌿 Nous vous offrons 30 jours de Pass Pro Complexe 100% gratuit ! Profitez de l'agenda, de la caisse POS, de la comptabilité SYSCOHADA et de l'ensemble des fonctionnalités jusqu'au ${ddMM(expiresAt)} 💛`,
  }).catch(() => null);

  return sub;
}

// ─────────────── Fidélité dégressive & Règle du mois sauté ───────────────

/** Délai de grâce Mobile Money : 5 jours de tolérance après échéance */
export const GRACE_PERIOD_MS = 5 * 24 * 3600 * 1000;

export function canonicalPlanId(planId: string): string {
  if (planId === "pro_essentiel") return "pro_institut";
  return planId;
}

/**
 * Calcule le nombre de mois consécutifs payés sans rupture pour un plan donné.
 * Si le délai entre l'échéance et le renouvellement dépasse 5 jours (mois sauté),
 * la continuité est rompue et le compteur redémarre à 0 (Mois 1).
 */
export async function computeConsecutiveMonths(userId: string, planId: string): Promise<number> {
  const canonicalId = canonicalPlanId(planId);
  const planFilter = canonicalId === "pro_institut" ? ["pro_institut", "pro_essentiel"] : [canonicalId];

  const subs = await db.subscription.findMany({
    where: {
      userId,
      plan: { in: planFilter },
      priceFcfa: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
  });

  if (subs.length === 0) return 0;

  const now = new Date();
  let consecutive = 0;
  let lastStart = now;

  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const subExpiry = sub.expiresAt;

    if (i === 0) {
      // Pour la souscription la plus récente :
      // Si la date d'expiration + 5 jours de grâce est dépassée, rupture de fidélité.
      if (now.getTime() - subExpiry.getTime() > GRACE_PERIOD_MS) {
        return 0;
      }
      consecutive++;
      lastStart = sub.startedAt || sub.createdAt;
    } else {
      // Pour les souscriptions antérieures :
      const gap = lastStart.getTime() - subExpiry.getTime();
      if (gap > GRACE_PERIOD_MS) {
        break;
      }
      consecutive++;
      lastStart = sub.startedAt || sub.createdAt;
    }
  }

  return consecutive;
}

/**
 * Renvoie le tarif dynamique du prochain mois selon la progression de fidélité.
 * consecutiveMonths: 0 -> Mois 1 (plein tarif)
 * consecutiveMonths: 1 -> Mois 2 (-500 F client, -1 000 F starter, -2 000 F institut/complexe)
 * ...
 * consecutiveMonths: >= 5 -> Mois 6+ (tarif plancher à vie)
 */
export function getPlanTierPrice(planId: string, consecutiveMonths: number): number {
  const def = planDefById(planId);
  if (!def) return 0;
  const targetMonth = Math.min(Math.max(1, consecutiveMonths + 1), 6);
  const tier = def.tiers.find((t) => t.month === targetMonth);
  return tier ? tier.priceFcfa : def.minPriceFcfa;
}

export interface PlanLoyaltyInfo {
  isTrial: boolean;
  trialDaysLeft: number;
  consecutiveMonths: number;
  currentTierMonth: number;
  nextTierMonth: number;
  currentTierPrice: number;
  nextTierPrice: number;
  floorPrice: number;
  graceDays: number;
}

/**
 * Analyse complète de l'état de fidélité d'une utilisatrice pour un plan.
 */
export async function getLoyaltyStatus(userId: string, planId: string): Promise<PlanLoyaltyInfo> {
  const def = planDefById(planId);
  const consecutiveMonths = await computeConsecutiveMonths(userId, planId);
  const activeSub = await getActiveSubscription(userId);

  const isTrial = Boolean(
    activeSub && (
      activeSub.source === "welcome_trial" ||
      activeSub.source === "welcome_offer" ||
      activeSub.priceFcfa === 0
    )
  );

  let trialDaysLeft = 0;
  if (isTrial && activeSub) {
    const msLeft = activeSub.expiresAt.getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(msLeft / (24 * 3600 * 1000)));
  }

  const currentTierMonth = isTrial ? 0 : Math.min(Math.max(1, consecutiveMonths), 6);
  const nextTierMonth = Math.min(consecutiveMonths + 1, 6);
  const nextTierPrice = getPlanTierPrice(planId, consecutiveMonths);
  const currentTierPrice = isTrial ? 0 : (def?.tiers.find((t) => t.month === currentTierMonth)?.priceFcfa ?? def?.priceFcfa ?? 0);

  return {
    isTrial,
    trialDaysLeft,
    consecutiveMonths,
    currentTierMonth,
    nextTierMonth,
    currentTierPrice,
    nextTierPrice,
    floorPrice: def?.minPriceFcfa ?? 0,
    graceDays: 5,
  };
}

export interface DiagQuota {
 /** Quota du mois calendaire courant (gratuit = 1, Kènè+ = 9999). */
  quota: number;
 /** Diagnostics réalisés ce mois calendaire (tous statuts — le POST
 * /api/diagnoses branche son garde sur ce décompte). */
  used: number;
 /** Restant = max(0, quota - used); illimité → 9999. */
  remaining: number;
 /** Plan courant: "gratuit" | "kene_plus" | "pro_essentiel" | "pro_complexe". */
  plan: string;
}

/** Gating quota côté données: plan gratuit = 1 diagnostic/mois,
 * Kènè+ = illimité (9999). `used` = count des Diagnosis du user sur le
 * mois CALENDRAIRE courant. Fonction exposée au main agent pour le brancher
 * dans POST /api/diagnoses (garde: quota.remaining <= 0 → 429/400). */
export async function diagQuotaFor(userId: string): Promise<DiagQuota> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [used, sub] = await Promise.all([
    db.diagnosis.count({ where: { userId, createdAt: { gte: monthStart } } }),
    getActiveSubscription(userId),
  ]);
  const isPlus = sub?.plan === "kene_plus";
  const quota = isPlus ? DIAG_QUOTA_UNLIMITED : FREE_PLAN.diagQuotaMonth;
  return {
    quota,
    used,
    remaining: isPlus ? DIAG_QUOTA_UNLIMITED : Math.max(0, quota - used),
    plan: sub?.plan ?? FREE_PLAN.id,
  };
}

// ─────────────── Activation (paiement mobile money SIMULÉ) ───────────────

export interface ActivatePlanResult {
  subscription: Subscription;
 /** true = nouvellement créée; false = déjà active non expirée (idempotent). */
  created: boolean;
}

/** Active un plan payant pour le user — paiement mobile money SIMULÉ
 * (source "momo_sim", mode essai: aucun débit réel, la confirmation vient du
 * front via POST /api/subscriptions/activate).
 * Idempotent: le même plan déjà actif non expiré → renvoie l'existante
 * (même id, aucune nouvelle ligne, aucune notification).
 * Changement de plan (ex: upgrade pro Essentiel → Complexe): l'ancienne
 * ligne active passe "cancelled", la nouvelle devient la référence.
 * Notification WhatsApp (simulée) au user à la CRÉATION seulement:
 * « ton abonnement {name} est actif jusqu'au {jj/mm} ».
 * Throws Error (message FR) si planId inconnu ou user introuvable. */
export async function activatePlan(userId: string, planId: string, source: string = "winipayer"): Promise<ActivatePlanResult> {
  const def = planDefById(planId);
  if (!def) throw new Error("Plan inconnu");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Utilisatrice introuvable");

  // Si le même plan est déjà actif et non expiré: on le prolonge de 30 jours (renouvellement raccordé)
  // au lieu de renvoyer l'ancienne période sans rien ajouter !
  const existing = await getActiveSubscription(userId);
  if (existing && existing.plan === def.id) {
    const renewed = await renewPlan(userId, source, def.id);
    return { subscription: renewed.subscription, created: false };
  }

  const consecutiveMonths = await computeConsecutiveMonths(userId, def.id);
  const tierPrice = getPlanTierPrice(def.id, consecutiveMonths);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const subscription = await db.$transaction(async (tx) => {
    // Changement de plan: les anciennes lignes actives sont annulées proprement
    // — une seule ligne active fait foi à tout instant.
    await tx.subscription.updateMany({
      where: { userId, status: "active" },
      data: { status: "cancelled" },
    });
    const s = await tx.subscription.create({
      data: {
        userId,
        plan: def.id,
        status: "active",
        priceFcfa: tierPrice,
        source, // source de paiement certifiée (winipayer / momo)
        expiresAt,
      },
    });

    if (def.id === "pro_complexe") {
      await tx.tenant.updateMany({ where: { ownerPhone: user.phone }, data: { plan: "business" } });
    } else if (def.id === "pro_institut" || def.id === "pro_essentiel" || def.id === "pro_starter") {
      await tx.tenant.updateMany({ where: { ownerPhone: user.phone }, data: { plan: "pro" } });
    }

    return s;
  });

  // Notification WhatsApp / SMS au user à la CRÉATION seulement:
  await notify({
    userId: user.id,
    channel: "whatsapp",
    toPhone: user.phone,
    message: `Kènè : ${def.name} activé ✔ Ton abonnement ${def.name} est actif jusqu'au ${ddMM(subscription.expiresAt)} — profite bien 💛`,
  });

  return { subscription, created: true };
}

// ─────────────── Renouvellement (t. 138 — le moment échéance) ───────────────

export interface RenewPlanResult {
  subscription: Subscription;
  /** Échéance AVANT renouvellement (pour l'énoncé « +30 j après le X »). */
  previousExpiry: Date;
}

/** Renouvelle l'abonnement du user pour 30 jours supplémentaires.
 * Tolérant: si l'abonnement a déjà expiré ou si aucun n'était actif, réactive
 * le plan (soit le plan demandé, soit le dernier plan souscrit, soit Kènè+). */
export async function renewPlan(userId: string, source: string = "winipayer", planId?: string): Promise<RenewPlanResult> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Utilisatrice introuvable");

  const existing = await getActiveSubscription(userId);
  let targetPlan = planId || existing?.plan;

  if (!targetPlan) {
    const lastSub = await db.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    targetPlan = lastSub?.plan || (user.role === "pro" ? "pro_institut" : "kene_plus");
  }

  const def = planDefById(targetPlan);
  if (!def) throw new Error("Plan inconnu");

  const consecutiveMonths = await computeConsecutiveMonths(userId, def.id);
  const tierPrice = getPlanTierPrice(def.id, consecutiveMonths);

  const now = new Date();
  // Les jours restants se raccordent: la nouvelle échéance part de la fin
  // de la période courante si active et future, sinon de maintenant.
  const base = (existing && existing.expiresAt.getTime() > now.getTime()) ? existing.expiresAt : now;
  const newExpires = new Date(base.getTime() + 30 * 24 * 3600 * 1000);

  const subscription = await db.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { userId, status: "active" },
      data: { status: "cancelled" },
    });
    const s = await tx.subscription.create({
      data: {
        userId,
        plan: def.id,
        status: "active",
        priceFcfa: tierPrice, // tarif dégressif selon l'ancienneté continue
        source, // source de paiement certifiée (winipayer / momo)
        startedAt: now,
        expiresAt: newExpires,
      },
    });

    if (def.id === "pro_complexe") {
      await tx.tenant.updateMany({ where: { ownerPhone: user.phone }, data: { plan: "business" } });
    } else if (def.id === "pro_institut" || def.id === "pro_essentiel" || def.id === "pro_starter") {
      await tx.tenant.updateMany({ where: { ownerPhone: user.phone }, data: { plan: "pro" } });
    }

    return s;
  });

  await notify({
    userId: user.id,
    channel: "whatsapp",
    toPhone: user.phone,
    message: `Kènè : abonnement ${def.name} renouvelé ✔ Actif jusqu'au ${ddMM(subscription.expiresAt)} — merci de ta confiance 💛`,
  });

  return { subscription, previousExpiry: existing ? existing.expiresAt : now };
}

// ─────────────── Cadeau de jours (parrainage — t. 138) ───────────────

export interface GrantGiftResult {
  subscription: Subscription;
  created: boolean; // false = jours raccordés à une période déjà offerte/active
}

/** Offre `days` jours d'un plan à une utilisatrice — geste 0 F TRAÇÉ
 * (source personnalisée, p. ex. "referral_gift"): sans abonnement actif une
 * nouvelle ligne est créée (dès aujourd'hui) ; avec un abonnement actif du
 * MÊME plan, la période se raccorde après l'échéance (ancienne ligne
 * clôturée, jamais écrasée — même discipline que l'offre Console t. 135).
 * Throws Error (message FR) si plan/user inconnu. */
export async function grantGiftDays(userId: string, planId: string, days: number, source: string): Promise<GrantGiftResult> {
  const def = planDefById(planId);
  if (!def) throw new Error("Plan inconnu");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Utilisatrice introuvable");

  const now = new Date();
  const existing = await getActiveSubscription(userId);

  if (existing && existing.plan !== def.id) {
    // Ne JAMAIS écraser un autre plan actif (une gerante Pro Complexe ne
    // reçoit pas un Kènè+ qui annulerait sa ligne pro) — non-silencieux.
    throw new Error("Un abonnement différent est déjà actif");
  }

  const base = existing && existing.expiresAt.getTime() > now.getTime() ? existing.expiresAt : now;
  const newExpires = new Date(base.getTime() + days * 24 * 3600 * 1000);

  const subscription = await db.$transaction(async (tx) => {
    if (existing) {
      await tx.subscription.update({ where: { id: existing.id }, data: { status: "cancelled" } });
    }
    return tx.subscription.create({
      data: {
        userId,
        plan: def.id,
        status: "active",
        priceFcfa: 0, // cadeau — 0 F, hors revenus (norme MRR t. 133)
        source,
        startedAt: now,
        expiresAt: newExpires,
      },
    });
  });

  return { subscription, created: !existing };
}
