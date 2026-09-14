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

export interface PlanDef {
  id: string;
  audience: PlanAudience;
  name: string;
  tagline: string;
  priceFcfa: number;
  perks: string[];
  badge?: string;
}

/** Les 3 offres payantes Kènè (audience cliente: Kènè+; pro: Essentiel /
 * Complexe). L'ordre des perks est stable — le front mappe les icônes par
 * index sur cette liste (contrat d'affichage PlanScreen / ProPlanSection). */
export const PLAN_DEFS: readonly PlanDef[] = [
  {
    id: "kene_plus",
    audience: "client",
    name: "Kènè+",
    tagline: "Le rituel beauté complet, sans limite",
    priceFcfa: 2500,
    perks: [
      "Diagnostics illimités",
      "Suivi de l'évolution de ta peau",
      "Dr. Kènè prioritaire",
      "Défis & routines personnalisées",
    ],
    badge: "Le plus choisi",
  },
  {
    id: "pro_essentiel",
    audience: "pro",
    name: "Essentiel",
    tagline: "Gère ton institut au quotidien",
    priceFcfa: 15000,
    perks: [
      "Rendez-vous & agenda",
      "Fiches clientes (CRM)",
      "Catalogue de soins",
      "Boutique en ligne",
    ],
  },
  {
    id: "pro_complexe",
    audience: "pro",
    name: "Complexe",
    tagline: "Toute la gestion — paie et compta incluses",
    priceFcfa: 45000,
    perks: [
      "Tout le plan Essentiel",
      "Paie CNPS (CI) / IPM (SN)",
      "Comptabilité SYSCOHADA",
      "Multi-établissements",
    ],
    badge: "Recommandé",
  },
];

export function planDefById(planId: string): PlanDef | null {
  return PLAN_DEFS.find((p) => p.id === planId) ?? null;
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
export async function activatePlan(userId: string, planId: string): Promise<ActivatePlanResult> {
  const def = planDefById(planId);
  if (!def) throw new Error("Plan inconnu");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Utilisatrice introuvable");

  // Idempotence: même plan déjà actif non expiré → l'existante telle quelle.
  const existing = await getActiveSubscription(userId);
  if (existing && existing.plan === def.id) return { subscription: existing, created: false };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const subscription = await db.$transaction(async (tx) => {
    // Changement de plan: l'ancienne ligne active (plan différent) est
    // annulée proprement — une seule ligne active fait foi à tout instant.
    if (existing) {
      await tx.subscription.update({ where: { id: existing.id }, data: { status: "cancelled" } });
    }
    return tx.subscription.create({
      data: {
        userId,
        plan: def.id,
        status: "active",
        priceFcfa: def.priceFcfa,
        source: "momo_sim", // paiement en mode essai
        expiresAt,
      },
    });
  });

  // Notification (simulée comme le reste des paiements) — seulement à la
  // création: un re-POST idempotent ne re-notifie jamais.
  await notify({
    userId: user.id,
    channel: "whatsapp",
    toPhone: user.phone,
    message: `Kènè : ${def.name} activé ✔ Ton abonnement ${def.name} est actif jusqu'au ${ddMM(subscription.expiresAt)} — profite bien 💛`,
  });

  return { subscription, created: true };
}
