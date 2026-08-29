// Kènè — formatage XOF / dates / helpers

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

export function weekKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  { dot: "bg-[#3F7D3F]", label: "Aucun", text: "text-[#3F7D3F]" },
  { dot: "bg-[#C8951E]", label: "Léger", text: "text-[#A0720F]" },
  { dot: "bg-[#E07A2B]", label: "Modéré", text: "text-[#C26418]" },
  { dot: "bg-[#8B1A3B]", label: "Sévère", text: "text-[#8B1A3B]" },
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

export function genRef(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
