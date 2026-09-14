"use client";
// Kènè — Skin Twin v2: le curseur temporel « Le Fil du Temps ».
// Piste tissée kente + navette (input range natif invisible par-dessus →
// drag tactile ET navigation clavier, pastilles d'arrêts cliquables).
import { CalendarClock, Hand, Info } from "lucide-react";
import { ADHERENCE_FACTOR, PROJECT_WEEKS_MAX, type Adherence } from "@/lib/kene/evolution";

const STOPS = [0, 4, 8, 12] as const;

export const weeksLabel = (w: number): string => (w === 0 ? "Aujourd'hui" : `Semaine +${w}`);

const ADHERENCE_OPTIONS: { id: Adherence; label: string }[] = [
  { id: "pleine", label: "Intégrale" },
  { id: "partielle", label: "Irrégulière" },
];

export function ProjectionSlider({
  weeks,
  adherence,
  onWeeks,
  onAdherence,
}: {
  weeks: number;
  adherence: Adherence;
  onWeeks: (w: number) => void;
  onAdherence: (a: Adherence) => void;
}) {
  const t = Math.min(1, Math.max(0, weeks / PROJECT_WEEKS_MAX));

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-4">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-heading font-bold text-sm">
          <CalendarClock size={15} className="shrink-0 text-primary" aria-hidden />
          Le Fil du Temps
        </p>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10.5px] font-bold text-primary" aria-live="polite">
          {weeksLabel(weeks)}
        </span>
      </div>

      {/* Piste tissée + navette + interactions */}
      <div className="relative mt-4 h-2.5 touch-none">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-2.5 rounded-full opacity-90"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg,#8B1A3B 0 14px,#3F7D3F 14px 22px,#C8951E 22px 30px,#E07A2B 30px 38px,#5C3A21 38px 46px)",
          }}
        />
        {/* arrêts — diamants adinkra */}
        {STOPS.map((s) => (
          <span
            key={s}
            aria-hidden
            className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-[#F8F1E4]/80 bg-[#1A1410]"
            style={{ left: `calc(0.25rem + ${(s / PROJECT_WEEKS_MAX) * 100}% * 0.965)` }}
          />
        ))}
        {/* navette */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-[20px] w-[20px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[5px] border-2 border-[#C8951E] bg-[#F8F1E4] shadow-md shadow-black/25"
          style={{ left: `calc(0.25rem + ${t * 100}% * 0.965)`, transition: "left 90ms ease-out" }}
        />
        {/* input range natif: drag + clavier (flèches = ±1 semaine) */}
        <input
          type="range"
          min={0}
          max={PROJECT_WEEKS_MAX}
          step={1}
          value={weeks}
          onChange={(e) => onWeeks(Number(e.target.value))}
          aria-label="Horizon de projection en semaines — le jumeau montre l'évolution indicative"
          className="absolute -inset-x-2 -inset-y-4 h-auto w-[calc(100%+1rem)] cursor-pointer opacity-0"
        />
      </div>

      {/* Arrêts cliquables */}
      <div className="mt-2 flex items-start justify-between px-0.5">
        {STOPS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onWeeks(s)}
            className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              weeks === s ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === 0 ? "Aujourd'hui" : `S+${s}`}
          </button>
        ))}
      </div>

      {/* Adhérence à la routine */}
      <div className="mt-3 flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Hand size={11} aria-hidden /> Routine
        </span>
        <div className="flex gap-1.5">
          {ADHERENCE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onAdherence(o.id)}
              aria-pressed={adherence === o.id}
              className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary active:scale-95 ${
                adherence === o.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[9.5px] leading-snug text-muted-foreground">
        <Info size={11} className="mt-0.5 shrink-0" aria-hidden />
        Projection indicative (simulation non médicale) : évolution typique des marqueurs détectés,
        adhérence {adherence === "pleine" ? "intég" : "partielle"} ×{ADHERENCE_FACTOR[adherence]}.
      </p>
    </div>
  );
}
