// Kènè — « Le Fil du Retour »: moteur de relances post-protocole (lib PURE, serveur & client)
// Les relances sont DÉRIVÉES de l'activité réelle (diagnostics, RDV complétés, ventes, inactivité)
// et les marques « traitée / ignorée » sont persistées par tenant (FollowUpMark).
import { addDays, formatDate } from "./format";
import { BODY_ZONES } from "./types";

export type FollowUpKind = "post_protocol" | "post_soin" | "post_purchase" | "inactive";

/** Délais métier (jours) */
export const POST_PROTOCOL_DAYS = 21; // contrôle S+3 du protocole
export const POST_SOIN_DAYS = 28; // cycle de renouvellement cutané
export const POST_PURCHASE_DAYS = 10; // prise de nouvelles après achat
export const INACTIVE_DAYS = 60; // inactivité CRM (2 mois)

/** Métadonnées d'affichage par type de relance */
export const KIND_META: Record<FollowUpKind, { label: string; hint: string; cls: string }> = {
  post_protocol: { label: "Protocole", hint: "Contrôle 3 semaines après le diagnostic IA", cls: "bg-gold/15 text-gold-text border-gold/30" },
  post_soin: { label: "Soin de suivi", hint: "Cycle peau ≈ 4 semaines après le dernier soin", cls: "bg-success/15 text-success border-success/30" },
  post_purchase: { label: "Produits", hint: "Prendre des nouvelles 10 j après l'achat", cls: "bg-terre/15 text-terre border-terre/30" },
  inactive: { label: "Inactive", hint: "Plus de 2 mois sans visite", cls: "bg-bissap/15 text-destructive border-bissap/30" },
};

// ─────────────── Entrées (allégées, sérialisables) ───────────────

export interface FClient {
  id: string;
  userId?: string | null;
  name: string;
  phone: string;
  visitsCount: number;
  lastVisit?: Date | string | null;
}

export interface FAppointment {
  id: string;
  clientProfileId?: string | null;
  startAt: Date | string;
  status: string;
  serviceName?: string | null;
}

export interface FDiagnosis {
  id: string;
  userId: string;
  zone: string;
  scoreGlobal: number;
  createdAt: Date | string;
}

export interface FSale {
  id: string;
  clientProfileId?: string | null;
  createdAt: Date | string;
  productLabels?: string[];
}

export interface FMark {
  dedupKey: string;
  status: string; // done | dismissed
  via?: string | null;
  updatedAt: Date | string;
}

// ─────────────── Sortie ───────────────

export interface FollowUpItem {
  dedupKey: string;
  kind: FollowUpKind;
  clientProfileId: string | null;
  clientName: string;
  clientPhone: string;
  title: string;
  detail: string;
  note?: string;
  dueAt: string; // ISO
  daysFromNow: number; // < 0 = en retard
  status: "todo" | "done" | "dismissed";
  via?: string | null;
  handledAt?: string | null;
}

const DAY = 86_400_000;
const t = (d: Date | string) => new Date(d).getTime();
const iso = (d: Date | string) => new Date(d).toISOString();
const fmtShort = (d: Date | string) => formatDate(d, { day: "numeric", month: "short" });
const zoneLabel = (z: string) => BODY_ZONES.find((x) => x.id === z)?.label ?? z.replace("_", " ");

/**
 * Construit la liste des relances d'un institut à partir de son activité réelle.
 * Aucune écriture: les marques (FollowUpMark) sont simplement fusionnées.
 */
export function buildFollowUps(input: {
  now?: Date;
  clients: FClient[];
  appointments: FAppointment[];
  diagnoses: FDiagnosis[];
  sales: FSale[];
  marks?: FMark[];
}): FollowUpItem[] {
  const now = input.now ?? new Date();
  const marks = new Map((input.marks ?? []).map((m) => [m.dedupKey, m]));

  // Prochain RDV non annulé par cliente (supprime les relances de réactivation)
  const futureByClient = new Map<string, string>();
  for (const a of input.appointments) {
    if (a.status === "cancelled" || !a.clientProfileId) continue;
    const at = t(a.startAt);
    if (at <= now.getTime()) continue;
    const prev = futureByClient.get(a.clientProfileId);
    if (!prev || at < t(prev)) futureByClient.set(a.clientProfileId, iso(a.startAt));
  }

  // Dernier RDV complété par cliente
  const lastDoneAppt = new Map<string, FAppointment>();
  for (const a of input.appointments) {
    if (a.status !== "completed" || !a.clientProfileId) continue;
    const prev = lastDoneAppt.get(a.clientProfileId);
    if (!prev || t(a.startAt) > t(prev.startAt)) lastDoneAppt.set(a.clientProfileId, a);
  }

  // Dernier diagnostic par utilisatrice
  const lastDiag = new Map<string, FDiagnosis>();
  for (const d of input.diagnoses) {
    const prev = lastDiag.get(d.userId);
    if (!prev || t(d.createdAt) > t(prev.createdAt)) lastDiag.set(d.userId, d);
  }

  // Dernière vente avec produits par cliente
  const lastProdSale = new Map<string, FSale>();
  for (const s of input.sales) {
    if (!s.clientProfileId || (s.productLabels ?? []).length === 0) continue;
    const prev = lastProdSale.get(s.clientProfileId);
    if (!prev || t(s.createdAt) > t(prev.createdAt)) lastProdSale.set(s.clientProfileId, s);
  }

  const raw: Omit<FollowUpItem, "daysFromNow" | "status" | "via" | "handledAt">[] = [];

  for (const c of input.clients) {
    const future = futureByClient.get(c.id);
    const lastAppt = lastDoneAppt.get(c.id);

    // 1) Contrôle post-protocole: 3 semaines après le dernier diagnostic IA,
    // non clos par un retour en institut postérieur au diagnostic.
    if (c.userId) {
      const d = lastDiag.get(c.userId);
      if (d) {
        const dueAt = addDays(new Date(d.createdAt), POST_PROTOCOL_DAYS);
        const cameBack = lastAppt ? t(lastAppt.startAt) > t(d.createdAt) : false;
        const stillRelevant = t(dueAt) >= now.getTime() - 21 * DAY; // protocole clos au-delà de S+6
        if (!cameBack && stillRelevant) {
          raw.push({
            dedupKey: `diag:${d.id}`,
            kind: "post_protocol",
            clientProfileId: c.id,
            clientName: c.name,
            clientPhone: c.phone,
            title: "Contrôle de protocole",
            detail: `Diagnostic ${zoneLabel(d.zone)} du ${fmtShort(d.createdAt)} — score ${d.scoreGlobal}/100`,
            note: future ? `RDV déjà prévu le ${fmtShort(future)}` : undefined,
            dueAt: iso(dueAt),
          });
        }
      }
    }

    // 2) Soin de suivi: cycle ~4 semaines après le dernier soin complété,
    // uniquement si la cliente ne s'est pas déjà rébookée.
    if (lastAppt && !future) {
      const dueAt = addDays(new Date(lastAppt.startAt), POST_SOIN_DAYS);
      if (t(dueAt) >= now.getTime() - 17 * DAY) {
        raw.push({
          dedupKey: `appt:${lastAppt.id}`,
          kind: "post_soin",
          clientProfileId: c.id,
          clientName: c.name,
          clientPhone: c.phone,
          title: "Soin de suivi",
          detail: `${lastAppt.serviceName ?? "Soin"} le ${fmtShort(lastAppt.startAt)}`,
          dueAt: iso(dueAt),
        });
      }
    }

    // 3) Satisfaction produits: 10 jours après le dernier achat produits.
    const sale = lastProdSale.get(c.id);
    if (sale && t(sale.createdAt) >= now.getTime() - 15 * DAY) {
      const labels = (sale.productLabels ?? []).slice(0, 2).join(", ");
      raw.push({
        dedupKey: `sale:${sale.id}`,
        kind: "post_purchase",
        clientProfileId: c.id,
        clientName: c.name,
        clientPhone: c.phone,
        title: "Prendre des nouvelles",
        detail: `${labels} — achetés le ${fmtShort(sale.createdAt)}`,
        dueAt: iso(addDays(new Date(sale.createdAt), POST_PURCHASE_DAYS)),
      });
    }

    // 4) Inactivité CRM: plus de 60 jours sans visite et sans RDV à venir.
    if (c.lastVisit && !future) {
      const lastVisit = new Date(c.lastVisit);
      const dueAt = addDays(lastVisit, INACTIVE_DAYS);
      if (t(dueAt) <= now.getTime()) {
        raw.push({
          dedupKey: `client:${c.id}`,
          kind: "inactive",
          clientProfileId: c.id,
          clientName: c.name,
          clientPhone: c.phone,
          title: "Réactiver la cliente",
          detail: `Dernière visite le ${fmtShort(lastVisit)} — ${c.visitsCount} visite(s) au compteur`,
          dueAt: iso(dueAt),
        });
      }
    }
  }

  return raw
    .map((r) => {
      const mark = marks.get(r.dedupKey);
      const status: FollowUpItem["status"] = mark?.status === "done" || mark?.status === "dismissed" ? mark.status : "todo";
      return {
        ...r,
        daysFromNow: Math.round((t(r.dueAt) - now.getTime()) / DAY),
        status,
        via: mark?.via ?? null,
        handledAt: mark ? iso(mark.updatedAt) : null,
      };
    })
    .sort((a, b) => {
      // À traiter en tête (les plus en retard d'abord), puis traitées/ignorées
      if (a.status === "todo" && b.status !== "todo") return -1;
      if (a.status !== "todo" && b.status === "todo") return 1;
      return a.daysFromNow - b.daysFromNow;
    });
}

// ─────────────── WhatsApp ───────────────

/** Message de relance pré-rempli (ton chaleureux Kènè, ~2 phrases) */
export function buildRelanceMessage(
  kind: FollowUpKind,
  ctx: { clientName: string; detail: string; dueAt: Date | string; tenantName: string }
): string {
  const first = (ctx.clientName.split(/\s+/)[0] ?? ctx.clientName).trim();
  const date = formatDate(ctx.dueAt, { day: "numeric", month: "long" });
  switch (kind) {
    case "post_protocol":
      return `Bonjour ${first} 🧴 Ici ${ctx.tenantName} : ton protocole personnalisé suit son cours. Un contrôle rapide vers le ${date} permettra d'ajuster ta routine et de mesurer les progrès. On t'attend ! — L'équipe ${ctx.tenantName} · Kènè`;
    case "post_soin":
      return `Bonjour ${first} 🌸 La peau renouvelle son cycle en ~4 semaines : le moment idéal pour ton soin de suite approche (vers le ${date}). On te garde un créneau chez ${ctx.tenantName} !`;
    case "post_purchase":
      return `Bonjour ${first} 🌿 J'espère que ${ctx.detail} te plaisent ! Des questions sur l'application (matin/soir, quantités) ? Réponds ici, notre esthéticienne te conseille avec plaisir. — ${ctx.tenantName}`;
    case "inactive":
      return `Bonjour ${first}, ça fait longtemps 👋 Ta peau mérite un petit retour chez ${ctx.tenantName}. Ta fiche est prête et de nouveaux soins t'attendent — on trouve un créneau cette semaine ? — L'équipe ${ctx.tenantName} · Kènè`;
  }
}

/** Lien WhatsApp pré-rempli (wa.me) */
export function waLink(phone: string, text: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ─────────────── Côté cliente: « Ta prochaine étape » ───────────────

export interface ClientNextStep {
  kind: FollowUpKind;
  dueAt: string;
  overdue: boolean;
  days: number;
  title: string;
  detail: string;
  ctaLabel: string;
  ctaTab: "diagnostic" | "rdv";
}

/**
 * Prochaine étape de la cliente, dérivée de SES données (diagnostics + RDV).
 * Retourne null si un RDV futur couvre déjà le suivi.
 */
export function nextClientStep(
  now: Date,
  diagnoses: { status: string; createdAt: Date | string; zone: string; scoreGlobal: number }[],
  appointments: { startAt: Date | string; status: string }[]
): ClientNextStep | null {
  const hasFuture = appointments.some((a) => a.status !== "cancelled" && t(a.startAt) > now.getTime());
  const candidates: ClientNextStep[] = [];

  const lastDiag = [...diagnoses]
    .filter((d) => d.status === "done")
    .sort((a, b) => t(b.createdAt) - t(a.createdAt))[0];
  if (lastDiag) {
    const dueAt = addDays(new Date(lastDiag.createdAt), POST_PROTOCOL_DAYS);
    if (t(dueAt) >= now.getTime() - 21 * DAY) {
      const days = Math.round((t(dueAt) - now.getTime()) / DAY);
      candidates.push({
        kind: "post_protocol",
        dueAt: iso(dueAt),
        overdue: days < 0,
        days,
        title: days < 0 ? "Ton contrôle de protocole t'attend" : "Contrôle de ton protocole",
        detail: `Depuis ton diagnostic ${zoneLabel(lastDiag.zone)} du ${fmtShort(lastDiag.createdAt)} (score ${lastDiag.scoreGlobal}/100)`,
        ctaLabel: days < 0 ? "Refaire mon diagnostic" : "Réserver mon contrôle",
        ctaTab: days < 0 ? "diagnostic" : "rdv",
      });
    }
  }

  const lastDoneAppt = [...appointments]
    .filter((a) => a.status === "completed" && t(a.startAt) < now.getTime())
    .sort((a, b) => t(b.startAt) - t(a.startAt))[0];
  if (lastDoneAppt && !hasFuture) {
    const dueAt = addDays(new Date(lastDoneAppt.startAt), POST_SOIN_DAYS);
    if (t(dueAt) >= now.getTime() - 14 * DAY) {
      const days = Math.round((t(dueAt) - now.getTime()) / DAY);
      candidates.push({
        kind: "post_soin",
        dueAt: iso(dueAt),
        overdue: days < 0,
        days,
        title: days < 0 ? "Ton soin de suivi est prêt" : "Ton soin de suite approche",
        detail: `La peau renouvelle son cycle en ~4 semaines depuis ton dernier soin (${fmtShort(lastDoneAppt.startAt)})`,
        ctaLabel: "Réserver mon soin",
        ctaTab: "rdv",
      });
    }
  }

  if (candidates.length === 0) return null;
  // Priorité: en retard d'abord (le plus en retard), sinon l'échéance la plus proche
  return candidates.sort((a, b) => a.days - b.days)[0];
}
