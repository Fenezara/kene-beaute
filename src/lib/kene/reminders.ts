// Kènè — Rappels automatiques: templates de messages programmés + logique
// d'annulation intelligente (lib PURE, serveur uniquement). Les rappels sont
// des Notification { status: "scheduled", scheduledAt } créés par les événements
// métier (diagnostic terminé, RDV confirmé) et « envoyés » (sent) au fil de
// l'eau par le due-runner de GET /api/notifications.
import { addDays, formatDate, formatTime } from "./format";
import { POST_PROTOCOL_DAYS } from "./followups";

export const APPT_REMINDER_HOURS = 24; // J-1

/** Rappel « contrôle de protocole » — créé quand un diagnostic IA est terminé. */
export function protocolReminderMessage(first: string, tenantNames: string[] | null, zone: string, score: number): string {
  const where = tenantNames && tenantNames.length > 0 ? ` chez ${tenantNames.slice(0, 2).join(" ou ")}` : "";
  return `Kènè 🧴 ${first}, ton protocole ${zone} (score ${score}/100) suit son cours. Dans 3 semaines, refais ton diagnostic IA${where} pour mesurer tes progrès et ajuster ta routine — ça prend 2 minutes.`;
}

/** Rappel « RDV J-1 » — créé quand un RDV est confirmé. */
export function apptReminderMessage(first: string, serviceName: string, tenantName: string, startAt: Date): string {
  return `Kènè ✨ ${first}, petit rappel : ${serviceName} chez ${tenantName} ${formatDate(startAt, { weekday: "long", day: "numeric", month: "long" })} à ${formatTime(startAt)}. Préviens-nous si tu dois déplacer, sinon on t'attend avec plaisir !`;
}

/** Moment de déclenchement du rappel J-1 (24 h avant le RDV, borné au futur). */
export function apptReminderAt(startAt: Date): Date {
  const at = new Date(new Date(startAt).getTime() - APPT_REMINDER_HOURS * 3_600_000);
  return at.getTime() < Date.now() ? new Date() : at;
}

/** Moment de déclenchement du contrôle protocole (S+3). */
export function protocolReminderAt(diagCreatedAt: Date): Date {
  return addDays(new Date(diagCreatedAt), POST_PROTOCOL_DAYS);
}

// ─────────────── Lecture du metaJson (défensif) ───────────────

export interface NotificationMeta {
  diagId?: string;
  apptId?: string;
  dedupKey?: string;
}

export function readMeta(metaJson?: string | null): NotificationMeta {
  if (!metaJson) return {};
  try {
    return JSON.parse(metaJson) as NotificationMeta;
  } catch {
    return {};
  }
}

// ─────────────── Fil cliente: typage sérialisable ───────────────

export interface ReminderNotification {
  id: string;
  channel: string;
  message: string;
  status: string;
  scheduledAt: string | null;
  metaJson: string | null;
  createdAt: string;
}

/**
 * Un rappel scheduled est-il encore pertinent?
 * — {apptId}: RDV non annulé et pas encore passé
 * — {diagId}: ce diagnostic est TOUJOURS le dernier de sa zone (sinon le
 * contrôle a été refait → rappel périmé)
 * — {dedupKey}: la relance pro n'est pas marquée traitée (sinon doublon)
 * Sans méta: on garde (rappel manuel p.ex.).
 */
export function scheduledStillRelevant(
  n: ReminderNotification,
  ctx: { futureApptIds: Set<string>; latestDiagIds: Set<string>; handledDedupKeys: Set<string> },
): boolean {
  const meta = readMeta(n.metaJson);
  if (meta.apptId) return ctx.futureApptIds.has(meta.apptId);
  if (meta.diagId) return ctx.latestDiagIds.has(meta.diagId);
  if (meta.dedupKey) return !ctx.handledDedupKeys.has(meta.dedupKey);
  return true;
}

// ─────────────── Étiquettes humaines (UI cliente) ───────────────

/** « Aujourd'hui 20:00 » · « Demain 09:30 » · « Jeudi 12 sept. » · « 12 sept. 2027 » */
export function humanWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 86_400_000;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(now)) / dayMs);
  const hm = formatTime(d);
  const dayMonth = formatDate(d, { day: "numeric", month: "short" });
  if (diffDays === 0) return `Aujourd'hui ${hm}`;
  if (diffDays === 1) return `Demain ${hm}`;
  if (diffDays === -1) return `Hier ${hm}`;
  if (diffDays > 1 && diffDays < 7) return `${formatDate(d, { weekday: "long" })} ${dayMonth} · ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${dayMonth} · ${hm}`;
  return formatDate(d, { day: "numeric", month: "short", year: "numeric" });
}

/** Badge court du canal: WhatsApp / SMS / E-mail. */
export function channelLabel(channel: string): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "sms") return "SMS";
  if (channel === "email") return "E-mail";
  return channel;
}
