"use client";
// Kènè — Le Fil du Temps : courbes d'évolution par indicateur.
// SVG pur (zéro dépendance de charting) : fil d'or lissé Catmull-Rom, nœuds
// pastille couleur sévérité, trajectoire projetée en pointillés quand un seul
// diagnostic existe. Chips = interface accessible (clavier + lecteurs d'écran),
// table sr-only en miroir du graphique.
import { useEffect, useMemo, useState } from "react";
import { History, TrendingDown, TrendingUp } from "lucide-react";
import { apiGet } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import {
  PROJECT_WEEKS_MAX,
  projectPct,
  smoothPath,
  valueColorHex,
  type EvolutionData,
} from "@/lib/kene/evolution";

/* ───────────────────────── Géométrie du graphique ───────────────────────── */

const W = 340;
const H = 150;
const PL = 12;
const PR = 32;
const PT = 16;
const PB = 24;

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

/* ───────────────────────── Carte ───────────────────────── */

export function EvolutionCard({ userId, className }: { userId: string; className?: string }) {
  const [data, setData] = useState<EvolutionData | null>(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<string>("__score");

  useEffect(() => {
    let alive = true;
    apiGet<EvolutionData>(`/api/diagnoses/evolution?userId=${encodeURIComponent(userId)}`)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

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
    const single = pts0.length === 1;
    let t0 = pts0[0].at;
    let t1 = pts0[pts0.length - 1].at;
    if (single) t1 = t0 + 84 * 864e5; // horizon de projection S+12
    if (t1 - t0 < 6 * 864e5) t1 = t0 + 6 * 864e5; // garde-fou visuel
    const X = (t: number) => PL + ((t - t0) / (t1 - t0)) * (W - PL - PR);
    const Y = (v: number) => H - PB - (Math.min(100, Math.max(0, v)) / 100) * (H - PT - PB);
    const pts: Pt[] = pts0.map((p) => ({ x: X(p.at), y: Y(p.value), v: p.value, date: p.date }));
    const proj: Pt[] | null = single
      ? Array.from({ length: 13 }, (_, k) => ({
          w: k,
          v: projectPct(pts0[0].value, k, 1, chip.isScore ? "" : chip.label),
        })).map(({ w, v }) => ({
          x: X(pts0[0].at + w * 7 * 864e5),
          y: Y(v),
          v,
          date: "",
        }))
      : null;
    return { pts, proj, single, Y, X };
  }, [chip]);

  const delta = chip && chip.points.length > 1 ? chip.points[chip.points.length - 1].value - chip.points[0].value : null;

  const shortDate = (iso: string) => formatDate(iso, { day: "numeric", month: "short" });

  return (
    <section aria-label="Fil du Temps — évolution des indicateurs" className={className ?? "mt-4"}>
      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-heading font-bold text-base">
              <History size={17} className="shrink-0 text-primary" aria-hidden />
              Le Fil du Temps
            </h2>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Chaque diagnostic ajoute un nœud au fil — tes indicateurs, scan après scan.
            </p>
          </div>
          {data && data.count > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-mono text-[10.5px] font-bold text-muted-foreground">
              {data.count} scan{data.count > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Chargement / erreur / vide */}
        {data === null && !failed && <div className="mt-3 h-[150px] animate-pulse rounded-2xl bg-muted/50" aria-hidden />}
        {failed && (
          <p className="mt-3 rounded-2xl border border-dashed border-border bg-card/60 p-4 text-center text-[11.5px] text-muted-foreground">
            Le fil est momentanément inaccessible — rafraîchis la page.
          </p>
        )}
        {data && data.count === 0 && (
          <p className="mt-3 rounded-2xl border border-dashed border-border bg-card/60 p-4 text-center text-[11.5px] leading-relaxed text-muted-foreground">
            Ton premier scan terminé ouvrira le fil — chaque diagnostic tisse un nœud de plus.
          </p>
        )}

        {/* Graphique */}
        {data && data.count > 0 && chip && geo && (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mt-3 w-full"
              role="img"
              aria-label={
                chip.points.length > 1
                  ? `Évolution de ${chip.isScore ? "score global" : chip.label} sur ${chip.points.length} mesures — de ${chip.points[0]?.value ?? 0} % à ${chip.points[chip.points.length - 1]?.value ?? 0} %. Le tableau ci-dessous détaille chaque point.`
                  : `Première mesure de ${chip.isScore ? "score global" : chip.label} : ${chip.points[0]?.value ?? 0} %, trajectoire projetée jusqu'à S+12. Le tableau ci-dessous détaille chaque point.`
              }
            >
              {/* grille horizontale */}
              {[0, 50, 100].map((v) => (
                <g key={v}>
                  <line
                    x1={PL}
                    x2={W - PR}
                    y1={geo.Y(v)}
                    y2={geo.Y(v)}
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeDasharray={v === 0 ? "0" : "2 4"}
                    className="text-border"
                  />
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

              {/* trajectoire projetée (un seul diagnostic) */}
              {geo.proj && (
                <>
                  <path
                    d={smoothPath(geo.proj)}
                    fill="none"
                    stroke="#C8951E"
                    strokeWidth="1.75"
                    strokeDasharray="2 6"
                    strokeLinecap="round"
                    opacity="0.65"
                  />
                  <circle
                    cx={geo.proj[geo.proj.length - 1].x}
                    cy={geo.proj[geo.proj.length - 1].y}
                    r="3.5"
                    fill="none"
                    stroke="#C8951E"
                    strokeWidth="1.5"
                    strokeDasharray="1.5 2.5"
                  />
                  <text
                    x={Math.min(geo.proj[geo.proj.length - 1].x, W - PR - 2)}
                    y={Math.max(10, geo.proj[geo.proj.length - 1].y - 7)}
                    textAnchor="end"
                    fontSize="8"
                    className="fill-muted-foreground font-mono"
                  >
                    S+{PROJECT_WEEKS_MAX}
                  </text>
                </>
              )}

              {/* le fil d'or */}
              <path
                d={smoothPath(geo.pts)}
                fill="none"
                stroke="#C8951E"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* nœuds du fil */}
              {geo.pts.map((p, i) => (
                <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="4" fill={valueColorHex(p.v)} stroke="#F8F1E4" strokeWidth="1.2" />
              ))}

              {/* axe temporel */}
              <text x={PL} y={H - 8} fontSize="8" className="fill-muted-foreground font-mono">
                {shortDate(geo.pts[0].date)}
              </text>
              <text x={W - PR} y={H - 8} textAnchor="end" fontSize="8" className="fill-muted-foreground font-mono">
                {geo.single ? `aujourd'hui` : shortDate(geo.pts[geo.pts.length - 1].date)}
              </text>
            </svg>

            {/* résumé */}
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {geo.single ? (
                <>1 mesure — trajectoire projetée en pointillés jusqu&apos;à S+{PROJECT_WEEKS_MAX} (routine suivie).</>
              ) : chip.points.length > 1 && delta != null ? (
                <>
                  {chip.points.length} mesures · {shortDate(chip.points[0].date)} → {shortDate(chip.points[chip.points.length - 1].date)} ·{" "}
                  <span
                    className="font-mono font-bold"
                    style={{ color: delta > 0 ? "#3F7D3F" : delta < 0 ? "#8B1A3B" : undefined }}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta} pts
                  </span>
                </>
              ) : (
                <>1 mesure.</>
              )}
            </p>

            {/* chips : interface accessible du graphique */}
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Indicateurs suivis">
              {chips.map((c) => {
                const d = c.points.length > 1 ? c.points[c.points.length - 1].value - c.points[0].value : null;
                const active = chip.key === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setSel(c.key)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary active:scale-95 ${
                      active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50"
                    }`}
                  >
                    {d != null && (d > 0 ? <TrendingUp size={11} className="text-[#3F7D3F]" aria-hidden /> : d < 0 ? <TrendingDown size={11} className="text-[#8B1A3B]" aria-hidden /> : null)}
                    <span className="max-w-[150px] truncate">{c.isScore ? "Score global" : c.label}</span>
                    {d != null && (
                      <span className="font-mono text-[9.5px]" style={{ color: d > 0 ? "#3F7D3F" : d < 0 ? "#8B1A3B" : undefined }}>
                        {d > 0 ? "+" : ""}
                        {d}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* miroir lisible (lecteurs d'écran) */}
            <table className="sr-only">
              <caption>Évolution — {chip.isScore ? "score global" : chip.label}</caption>
              <tbody>
                {chip.points.map((p) => (
                  <tr key={p.date}>
                    <th scope="row">{formatDate(p.date)}</th>
                    <td>{p.value} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
