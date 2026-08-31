// Kènè — formatage XOF / dates / helpers

/** Taux de cashback wallet par défaut (la wallet porte son propre taux) */
export const CASHBACK_RATE = 0.05;

/** Acompte de réservation (fraction du prix du service, validé côté serveur) */
export const DEPOSIT_RATE = 0.3;

export function xof(amount: number, opts?: { compact?: boolean }): string {
  if (opts?.compact && Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)} M FCFA`;
  }
  if (opts?.compact && Math.abs(amount) >= 1000) {
    return `${Math.round(amount / 1000)} k FCFA`;
  }
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} FCFA`;
}

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat("fr-FR", opts).format(new Date(d));
}

export function formatTime(d: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

export function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

export function startOfWeek(d: Date): Date {
  const n = new Date(d);
  const day = (n.getDay() + 6) % 7; // lundi = 0
  n.setDate(n.getDate() - day);
  n.setHours(0, 0, 0, 0);
  return n;
}

export const SEVERITY_STYLES = [
  { dot: "bg-success", label: "Aucun", text: "text-success" },
  { dot: "bg-gold", label: "Léger", text: "text-gold-text" },
  { dot: "bg-sunset", label: "Modéré", text: "text-sunset-text" },
  { dot: "bg-bissap", label: "Sévère", text: "text-destructive" },
];

export function severityFromPercent(pct: number): number {
  if (pct >= 85) return 0;
  if (pct >= 65) return 1;
  if (pct >= 45) return 2;
  return 3;
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#3F7D3F";
  if (score >= 60) return "#C8951E";
  if (score >= 40) return "#E07A2B";
  return "#8B1A3B";
}

/** Couleur de texte lisible (WCAG) sur un fond hex — clair sur fond foncé, mélanine sur fond clair */
export function readableTextColor(bgHex: string): string {
  const h = bgHex.replace("#", "");
  if (h.length !== 6) return "#FFF9EC";
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(parseInt(h.slice(0, 2), 16) / 255) + 0.7152 * lin(parseInt(h.slice(2, 4), 16) / 255) + 0.0722 * lin(parseInt(h.slice(4, 6), 16) / 255);
  return L > 0.22 ? "#1A1410" : "#FFF9EC";
}

export function genRef(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
