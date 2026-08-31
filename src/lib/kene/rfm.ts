// Kènè — RFM & règles métier boutique/RDV
import type { RFM_SEGMENTS } from "./types";

/** Scoring RFM — PRD §8.7 */
export function rfmScore(recencyDays: number, frequency12m: number, monetary12m: number): { r: number; f: number; m: number; segment: string } {
  const r = recencyDays <= 7 ? 5 : recencyDays <= 30 ? 4 : recencyDays <= 60 ? 3 : recencyDays <= 120 ? 2 : 1;
  const f = frequency12m >= 12 ? 5 : frequency12m >= 8 ? 4 : frequency12m >= 4 ? 3 : frequency12m >= 2 ? 2 : 1;
  const m = monetary12m >= 300_000 ? 5 : monetary12m >= 150_000 ? 4 : monetary12m >= 75_000 ? 3 : monetary12m >= 25_000 ? 2 : 1;

  const total = r + f + m;
  let segment: string;
  if (r >= 4 && f >= 4 && m >= 4) segment = "Champions";
  else if (r >= 3 && f >= 3) segment = "Fidèles";
  else if (r >= 4 && f <= 2) segment = "Potentiels";
  else if (r <= 2 && f >= 3) segment = "À risque";
  else if (r <= 2 && f <= 2 && total <= 4) segment = "Perdus";
  else segment = "Nouveaux";

  return { r, f, m, segment };
}

export const RFM_SEGMENT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Champions: { bg: "bg-success/15", text: "text-success", label: "Champions" },
  "Fidèles": { bg: "bg-gold/15", text: "text-gold-text", label: "Fidèles" },
  Potentiels: { bg: "bg-sunset/15", text: "text-sunset-text", label: "Potentiels" },
  "À risque": { bg: "bg-bissap/15", text: "text-destructive", label: "À risque" },
  Perdus: { bg: "bg-muted", text: "text-muted-foreground", label: "Perdus" },
  Nouveaux: { bg: "bg-finance/15", text: "text-finance", label: "Nouveaux" },
};

/** Politique d'annulation RDV — PRD §8.6 */
export function cancellationRefund(hoursBefore: number): { rate: number; label: string } {
  if (hoursBefore > 72) return { rate: 1.0, label: "Remboursement 100 % (annulation > 72 h)" };
  if (hoursBefore >= 24) return { rate: 0.8, label: "Remboursement 80 % (24–72 h)" };
  if (hoursBefore >= 2) return { rate: 0.3, label: "Remboursement 30 % (2–24 h)" };
  return { rate: 0, label: "Aucun remboursement (< 2 h — no-show)" };
}

/** Créneaux disponibles : génère des slots de `stepMin` entre ouvertures, en excluant RDV existants */
export function generateDaySlots(
  date: Date,
  openingHour: number,
  closingHour: number,
  stepMin: number,
  booked: { startAt: string; durationMin: number; resourceId: string }[],
  resourceId?: string
): { time: string; available: boolean }[] {
  const slots: { time: string; available: boolean }[] = [];
  const dayStart = new Date(date);
  dayStart.setHours(openingHour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(closingHour, 0, 0, 0);
  const now = new Date();
  for (let t = new Date(dayStart); t < dayEnd; t = new Date(t.getTime() + stepMin * 60_000)) {
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    const label = `${hh}:${mm}`;
    if (t < now) {
      slots.push({ time: label, available: false });
      continue;
    }
    const slotEnd = new Date(t.getTime() + stepMin * 60_000);
    const clash = booked.some((b) => {
      if (resourceId && b.resourceId !== resourceId) return false;
      const bs = new Date(b.startAt);
      const be = new Date(bs.getTime() + b.durationMin * 60_000);
      return t < be && slotEnd > bs;
    });
    slots.push({ time: label, available: !clash });
  }
  return slots;
}

export const MOMO_OPERATORS = [
  { code: "wave", name: "Wave", color: "#1DC8FF", ussd: "*144*", hint: "0 % de frais" },
  { code: "orange", name: "Orange Money", color: "#FF7900", ussd: "*144#", hint: "Frais ~1 %" },
  { code: "mtn", name: "MTN MoMo", color: "#FFCC00", ussd: "*133#", hint: "Frais ~1 %" },
] as const;
