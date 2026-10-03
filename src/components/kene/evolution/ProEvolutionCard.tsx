"use client";
// Kènè Pro — Fil du Temps de la cliente (fiche CRM 360°): courbe d'évolution
// des scores + « Lecture pro » (verdict de trajectoire, axes d'action, contrôle
// conseillé). Les séries sont calculées LOCALEMENT via buildEvolution (lib pure)
// depuis les diagnostics déjà chargés par la fiche — zéro appel réseau.
// Filtre par zone corporelle quand la cliente a scanné plusieurs zones.
import { useMemo, useState } from "react";
import { Activity, CalendarCheck, History, Minus, TrendingDown, TrendingUp } from "lucide-react";
import {
  buildEvolution,
  smoothPath,
  valueColorHex,
  type EvolutionRow,
  type IndicatorSeries,
} from "@/lib/kene/evolution";
import { formatDate } from "@/lib/kene/format";

/* ───────────── Géométrie du graphique (viewBox — responsive) ───────────── */
const W = 440;
const H = 150;
const PL = 12;
const PR = 34;
const PT = 16;
const PB = 24;

const DAY = 86_400_000;
/** Contrôle conseillé au-delà de 8 semaines sans scan. */
const CONTROL_AFTER_DAYS = 56;
/** Seuils du verdict (delta score global premier → dernier scan). */
const VERDICT_UP = 4;
const VERDICT_DOWN = -4;
/** Seuil minimal pour citer un axe en Lecture pro. */
const AXIS_THRESHOLD = 2;

interface Pt {
  x: number;
  y: number;
  v: number;
  date: string;
}

interface Chip {
  key: string;
  label: string;
  isScore: boolean;
  points: { at: number; value: number; date: string }[];
}

type Tone = "up" | "stable" | "down";

const TONE_COLOR: Record<Tone, string> = {
  up: "#3F7D3F",
  stable: "#C8951E",
  down: "#8B1A3B",
};

const ZONE_LABELS: Record<string, string> = {
  visage: "Visage",
  dos: "Dos",
  cuir_chevelu: "Cuir chevelu",
  mains: "Mains",
  barbe: "Barbe",
  naevi: "Nævi",
};

const zoneLabel = (z: string) => ZONE_LABELS[z] ?? z.replace("_", " ");

/* ───────────── Lecture pro ───────────── */

interface ProInsight {
  verdict: { label: string; hint: string; tone: Tone } | null;
  bestAxis: IndicatorSeries | null;
  worstAxis: IndicatorSeries | null;
  lastScanDays: number | null;
  controlDue: boolean;
  cadenceDays: number | null;
}

function buildInsight(scores: { date: string; value: number }[], series: IndicatorSeries[]): ProInsight {
  const lastScanDays = scores.length > 0 ? Math.floor((Date.now() - new Date(scores[scores.length - 1].date).getTime()) / DAY) : null;
  const withDeltas = series.filter((s) => s.points.length > 1);
  const best = withDeltas.length > 0 ? withDeltas.reduce((a, b) => (b.delta > a.delta ? b : a)) : null;
  const worst = withDeltas.length > 0 ? withDeltas.reduce((a, b) => (b.delta < a.delta ? b : a)) : null;

  const delta = scores.length > 1 ? scores[scores.length - 1].value - scores[0].value : null;
  let verdict: { label: string; hint: string; tone: Tone } | null = null;
  if (delta != null) {
    if (delta > VERDICT_UP) verdict = { label: "Progression nette", hint: "le protocole porte ses fruits", tone: "up" };
    else if (delta >= VERDICT_DOWN) verdict = { label: "Stabilisation", hint: "entretenir les acquis, ajuster si besoin", tone: "stable" };
    else verdict = { label: "Vigilance", hint: "réévaluer protocole et observance", tone: "down" };
  }

  const cadenceDays =
    scores.length > 1
      ? Math.round((new Date(scores[scores.length - 1].date).getTime() - new Date(scores[0].date).getTime()) / DAY / (scores.length - 1))
      : null;

  return {
    verdict,
    bestAxis: best && best.delta > AXIS_THRESHOLD ? best : null,
    worstAxis: worst && worst.delta < -AXIS_THRESHOLD ? worst : null,
    lastScanDays,
    controlDue: lastScanDays != null && lastScanDays > CONTROL_AFTER_DAYS,
    cadenceDays,
  };
}

const fmtAge = (days: number) => (days < 7 ? `${days} j` : `${Math.floor(days / 7)} sem.`);

/* ───────────── Carte ───────────── */

export function ProEvolutionCard({ rows, className }: { rows: EvolutionRow[]; className?: string }) {
  const [sel, setSel] = useState<string>("__score");
  const [zone, setZone] = useState<string>("all");

  const zones = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) if (!seen.includes(r.zone)) seen.push(r.zone);
    return seen;
  }, [rows]);

  const filtered = useMemo(() => (zone === "all" ? rows : rows.filter((r) => r.zone === zone)), [rows, zone]);

  const data = useMemo(() => (filtered.length > 0 ? buildEvolution(filtered) : null), [filtered]);

  const chips = useMemo<Chip[]>(() => {
    if (!data) return [];
    const scoreChip: Chip = {
      key: "__score",
      label: "Score global",
      isScore: true,
      points: data.scores.map((s) => ({ at: new Date(s.date).getTime(), value: s.value, date: s.date })),
    };
    const indChips: Chip[] = data.series.slice(0, 4).map((s) => ({
      key: s.key,
      label: s.label,
      isScore: false,
      points: s.points.map((p) => ({ at: new Date(p.date).getTime(), value: p.value, date: p.date })),
    }));
    return [scoreChip, ...indChips];
  }, [data]);

  const chip = chips.find((c) => c.key === sel) ?? chips[0] ?? null;

  const geo = useMemo(() => {
    if (!chip || chip.points.length === 0) return null;
    const pts0 = [...chip.points].sort((a, b) => a.at - b.at);
    const t0 = pts0[0].at;
    const t1 = Math.max(pts0[pts0.length - 1].at, t0 + 6 * DAY); // garde-fou visuel
    const X = (t: number) => PL + ((t - t0) / (t1 - t0)) * (W - PL - PR);
    const Y = (v: number) => H - PB - (Math.min(100, Math.max(0, v)) / 100) * (H - PT - PB);
    const pts: Pt[] = pts0.map((p) => ({ x: X(p.at), y: Y(p.value), v: p.value, date: p.date }));
    return { pts, Y };
  }, [chip]);

  const insight = useMemo(
    () => (data && data.count > 0 ? buildInsight(data.scores, data.series) : null),
    [data],
  );

  const delta = chip && chip.points.length > 1 ? chip.points[chip.points.length - 1].value - chip.points[0].value : null;
  const shortDate = (iso: string) => formatDate(iso, { day: "numeric", month: "short" });

  if (!data || !chip || !geo) return null;

  const single = geo.pts.length === 1;

  return (
    <section aria-label="Fil du Temps — évolution des diagnostics de la cliente" className={className}>
      <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="flex items-center gap-1.5 font-heading text-sm font-bold">
              <History size={15} className="shrink-0 text-primary" aria-hidden />
              Fil du Temps
            </h4>
            <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
              {data.count > 1 && data.firstAt && data.lastAt
                ? `${shortDate(data.firstAt)} → ${shortDate(data.lastAt)} · progression de la cliente`
                : `Premier scan le ${data.firstAt ? shortDate(data.firstAt) : "—"} — la référence initiale est posée`}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
            {data.count} scan{data.count > 1 ? "s" : ""}
          </span>
        </div>

        {/* Filtre par zone (si plusieurs zones scannées) */}
        {zones.length > 1 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par zone">
            {[{ id: "all", label: `Toutes (${rows.length})` }, ...zones.map((z) => ({ id: z, label: `${zoneLabel(z)} (${rows.filter((r) => r.zone === z).length})` }))].map((z) => {
              const active = zone === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    setZone(z.id);
                    setSel("__score");
                  }}
                  aria-pressed={active}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary active:scale-95 ${
                    active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  {z.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Graphique */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-2.5 w-full"
          role="img"
          aria-label={
            chip.points.length > 1
              ? `Évolution de ${chip.isScore ? "score global" : chip.label} sur ${chip.points.length} mesures — de ${chip.points[0]?.value ?? 0} à ${chip.points[chip.points.length - 1]?.value ?? 0} sur 100. Le tableau ci-dessous détaille chaque point.`
              : `Première mesure de ${chip.isScore ? "score global" : chip.label} : ${chip.points[0]?.value ?? 0} sur 100. Le tableau ci-dessous détaille chaque point.`
          }
        >
          {/* grille horizontale */}
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={geo.Y(v)} y2={geo.Y(v)} stroke="currentColor" strokeWidth="1" strokeDasharray={v === 0 ? "0" : "2 4"} className="text-border" />
              <text x={W - PR + 4} y={geo.Y(v) + 3} fontSize="8" className="fill-muted-foreground font-mono">
                {v}
              </text>
            </g>
          ))}

          {/* aire sous la courbe */}
          {geo.pts.length > 1 && (
            <path
              d={`${smoothPath(geo.pts)} L ${geo.pts[geo.pts.length - 1].x.toFixed(1)} ${H - PB} L ${geo.pts[0].x.toFixed(1)} ${H - PB} Z`}
              fill="#C8951E"
              opacity="0.07"
            />
          )}

          {/* le fil d'or */}
          <path d={smoothPath(geo.pts)} fill="none" stroke="#C8951E" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />

          {/* nœuds du fil */}
          {geo.pts.map((p, i) => (
            <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="4" fill={valueColorHex(p.v)} stroke="#F8F1E4" strokeWidth="1.2" />
          ))}

          {/* axe temporel */}
          <text x={PL} y={H - 8} fontSize="8" className="fill-muted-foreground font-mono">
            {shortDate(geo.pts[0].date)}
          </text>
          {!single && (
            <text x={W - PR} y={H - 8} textAnchor="end" fontSize="8" className="fill-muted-foreground font-mono">
              {shortDate(geo.pts[geo.pts.length - 1].date)}
            </text>
          )}
        </svg>

        {/* résumé */}
        {chip.points.length > 1 && delta != null && (
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            {chip.points.length} mesures ·{" "}
            <span className="font-mono font-bold" style={{ color: delta > 0 ? TONE_COLOR.up : delta < 0 ? TONE_COLOR.down : undefined }}>
              {delta > 0 ? "+" : ""}
              {delta} pts
            </span>{" "}
            sur la période
          </p>
        )}

        {/* chips indicateurs */}
        <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Indicateurs suivis">
          {chips.map((c) => {
            const d = c.points.length > 1 ? c.points[c.points.length - 1].value - c.points[0].value : null;
            const active = chip.key === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setSel(c.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary active:scale-95 ${
                  active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
                }`}
              >
                {d != null && (d > 0 ? <TrendingUp size={10} style={{ color: TONE_COLOR.up }} aria-hidden /> : d < 0 ? <TrendingDown size={10} style={{ color: TONE_COLOR.down }} aria-hidden /> : null)}
                <span className="max-w-[130px] truncate">{c.isScore ? "Score global" : c.label}</span>
                {d != null && (
                  <span className="font-mono text-[9px]" style={{ color: d > 0 ? TONE_COLOR.up : d < 0 ? TONE_COLOR.down : undefined }}>
                    {d > 0 ? "+" : ""}
                    {d}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Lecture pro */}
        {insight && (
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3" aria-label="Lecture pro">
            <h5 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Activity size={11} aria-hidden /> Lecture pro
            </h5>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-snug">
              {insight.verdict ? (
                <li className="flex items-start gap-2">
                  {insight.verdict.tone === "up" ? (
                    <TrendingUp size={13} className="mt-0.5 shrink-0" style={{ color: TONE_COLOR.up }} aria-hidden />
                  ) : insight.verdict.tone === "down" ? (
                    <TrendingDown size={13} className="mt-0.5 shrink-0" style={{ color: TONE_COLOR.down }} aria-hidden />
                  ) : (
                    <Minus size={13} className="mt-0.5 shrink-0" style={{ color: TONE_COLOR.stable }} aria-hidden />
                  )}
                  <span>
                    <span className="font-bold" style={{ color: TONE_COLOR[insight.verdict.tone] }}>{insight.verdict.label}</span>
                <span className="text-muted-foreground"> — {insight.verdict.hint}.</span>
                  </span>
                </li>
              ) : (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <Activity size={13} className="mt-0.5 shrink-0" aria-hidden />
                  <span>Un seul scan sur cette sélection — le verdict se dessinera au suivant.</span>
                </li>
              )}
              {insight.bestAxis && (
                <li className="flex items-start gap-2">
                  <TrendingUp size={13} className="mt-0.5 shrink-0" style={{ color: TONE_COLOR.up }} aria-hidden />
                  <span>
                    <span className="font-bold">{insight.bestAxis.label}</span>
                    <span className="text-muted-foreground"> : +{insight.bestAxis.delta} pts — axe en nette amélioration.</span>
                  </span>
                </li>
              )}
              {insight.worstAxis && (
                <li className="flex items-start gap-2">
                  <TrendingDown size={13} className="mt-0.5 shrink-0" style={{ color: TONE_COLOR.down }} aria-hidden />
                  <span>
                    <span className="font-bold">{insight.worstAxis.label}</span>
                    <span className="text-muted-foreground"> : {insight.worstAxis.delta} pts — à surveiller au prochain soin.</span>
                  </span>
                </li>
              )}
              {insight.lastScanDays != null && (
                <li className="flex items-start gap-2">
                  <CalendarCheck size={13} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  <span className={insight.controlDue ? "" : "text-muted-foreground"}>
                    {insight.controlDue ? (
                      <>
                        <span className="font-bold text-sunset-text">Contrôle conseillé</span>
                        <span className="text-muted-foreground"> — dernier scan il y a {fmtAge(insight.lastScanDays)}.</span>
                      </>
                    ) : (
                      <>
                        Dernier scan il y a {fmtAge(insight.lastScanDays)}
                        {insight.cadenceDays != null ? ` · cadence ≈ ${fmtAge(insight.cadenceDays)} entre scans.` : "."}
                      </>
                    )}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* miroir lisible (lecteurs d'écran) */}
        <table className="sr-only">
          <caption>
            Évolution — {chip.isScore ? "score global" : chip.label}
            {zone !== "all" ? ` (${zoneLabel(zone)})` : ""}
          </caption>
          <tbody>
            {chip.points.map((p) => (
              <tr key={p.date}>
                <th scope="row">{formatDate(p.date)}</th>
                <td>{p.value} / 100</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
