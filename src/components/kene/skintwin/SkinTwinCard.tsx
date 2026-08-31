"use client";
// Kènè — Skin Twin : la carte « Jumeau de Peau ».
// Le diagnostic porté par un buste 3D interactif (drag pour pivoter, pastilles
// cliquables, balayage scanner, orbite du Fil d'Or). Les chips sous la scène
// forment l'interface accessible (clavier + lecteurs d'écran) : survol/sélection
// d'une chip illumine la pastille 3D correspondante et réciproquement.
// Fallback SVG statique (reduced-motion / WebGL absent / #twin-static) : mêmes
// marqueurs projetés en 2D sur une silhouette. Rendu coupé hors viewport (IO).

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Fingerprint, RotateCw, ScanFace } from "lucide-react";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { formatDate, scoreColor, SEVERITY_STYLES } from "@/lib/kene/format";
import {
  DEFAULT_SKIN,
  FITZ_SKIN,
  SEV_HEX,
  buildMarkers,
  createDragState,
  fallbackXY,
  matchIndicator,
  type TwinEntry,
  type TwinMarker,
} from "./twinMath";
import { useTwinMode } from "./mode";
import { ProjectionSlider } from "./ProjectionSlider";
import {
  ADHERENCE_FACTOR,
  PROJECT_WEEKS_MAX,
  lerpHex,
  projectMarkerSev,
  projectPct,
  type Adherence,
} from "@/lib/kene/evolution";

export type { TwinEntry, TwinIndicator, TwinMarker } from "./twinMath";

const SkinTwinScene = dynamic(() => import("./SkinTwinScene"), { ssr: false, loading: () => null });

/* ───────────────────────── Fallback SVG statique ───────────────────────── */

function TwinFallback({ markers, proj }: { markers: TwinMarker[]; proj: { weeks: number; adh: number } | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-5">
      <svg viewBox="0 0 100 110" className="h-full max-h-[310px]" role="img" aria-label="Silhouette du jumeau avec les zones détectées (version statique)">
        {/* buste stylisé — traits or */}
        <g fill="none" stroke="#C8951E" strokeOpacity="0.55" strokeWidth="0.8">
          <ellipse cx="50" cy="34" rx="19" ry="23" />
          <path d="M44 56 L44 64 M56 56 L56 64" />
          <path d="M22 104 C24 78 36 68 50 68 C64 68 76 78 78 104" />
          <path d="M24 104 L24 108 M76 104 L76 108" strokeOpacity="0.3" />
        </g>
        {markers.map((m, i) => {
          const [cx, cy] = fallbackXY(m.zone, m.x, m.y);
          const sf = proj ? Math.max(0, Math.min(3, projectMarkerSev(m.sev, m.pct, proj.weeks, proj.adh, m.label))) : m.sev;
          const s0 = Math.min(3, Math.max(0, Math.floor(sf)));
          const s1 = Math.min(3, s0 + 1);
          const fr = sf - s0;
          const fill = proj && s1 !== s0 && fr > 0.001 ? lerpHex(SEV_HEX[s0], SEV_HEX[s1], fr) : SEV_HEX[s0];
          const r = 3.6 * (proj ? 0.45 + 0.55 * Math.min(1, sf / Math.max(m.sev, 0.001)) : 1);
          return (
            <g key={m.key}>
              <circle cx={cx} cy={cy} r={r.toFixed(2)} fill={fill} fillOpacity="0.94" stroke="#F8F1E4" strokeWidth="0.7" />
              <text x={cx} y={cy + 1.5} textAnchor="middle" fontSize="4.4" fill="#F8F1E4" fontWeight="700">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ───────────────────────── Carte principale ───────────────────────── */

export function SkinTwinCard({
  entries,
  context = "client",
  className,
  projection = false,
}: {
  entries: TwinEntry[];
  context?: "client" | "pro";
  className?: string;
  /** Active le Fil du Temps : curseur S+0 → S+12, les marqueurs « guérissent ». */
  projection?: boolean;
}) {
  const mode = useTwinMode();
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [active, setActive] = useState(true); // IntersectionObserver → frameloop
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(createDragState());

  /* Fil du Temps : cible mutable lue par la scène chaque frame (zéro re-render au drag) */
  const [weeks, setWeeks] = useState(0);
  const [adherence, setAdherence] = useState<Adherence>("pleine");
  const projRef = useRef({ t: 0, adh: ADHERENCE_FACTOR.pleine });
  const changeWeeks = (w: number) => {
    setWeeks(w);
    projRef.current.t = w / PROJECT_WEEKS_MAX;
  };
  const changeAdherence = (a: Adherence) => {
    setAdherence(a);
    projRef.current.adh = ADHERENCE_FACTOR[a];
  };

  const markers = useMemo(() => buildMarkers(entries), [entries]);
  const multiZones = useMemo(() => new Set(entries.map((e) => e.zone)).size > 1, [entries]);
  const avgScore = entries.length ? Math.round(entries.reduce((s, e) => s + e.score, 0) / entries.length) : null;
  const fitz = entries.find((e) => e.fitz)?.fitz;
  const skin = (fitz && FITZ_SKIN[fitz]) || DEFAULT_SKIN;
  const activeIndex = hover ?? selected;

  /* rendu coupé quand la carte sort du viewport (rAF = asynchrone, hors effet) */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (es) => {
        const vis = es[0].isIntersecting;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => setActive(vis));
      },
      { threshold: 0.02 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  /* drag — rotation directe dans la ref mutable (zéro re-render React) */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    d.down = true;
    d.dragged = false;
    d.moved = 0;
    d.idle = 0;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.down) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.moved > 7) {
      d.dragged = true;
      if (!interacted) setInteracted(true);
    }
    d.rotY += dx * 0.0082;
    d.rotX = Math.min(0.34, Math.max(-0.28, d.rotX + dy * 0.005));
    d.velY = dx * 0.0082;
    d.idle = 0;
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    d.down = false;
    d.idle = 0;
  };

  /* panneau de détail de la pastille sélectionnée */
  const selectedMarker = selected != null ? (markers[selected] ?? null) : null;
  const selectedEntry = selectedMarker ? entries.find((e) => e.id === selectedMarker.diagId) : null;
  const matched = selectedMarker ? matchIndicator(selectedMarker.label, selectedEntry?.indicators) : null;

  const zoneLabel = (z: BodyZone) => BODY_ZONES.find((b) => b.id === z)?.label ?? z;

  return (
    <section aria-label="Jumeau de Peau — vue 3D du diagnostic" className={className ?? "mt-5"}>
      {/* En-tête */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-heading font-bold text-base">
            <ScanFace size={17} className="shrink-0 text-primary" aria-hidden />
            {context === "pro" ? "Jumeau de Peau · vue 360°" : "Ton Jumeau de Peau"}
          </h2>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {context === "pro"
              ? `${entries.length} diagnostic${entries.length > 1 ? "s" : ""} agrégé${entries.length > 1 ? "s" : ""} — pivote le buste en consultation.`
              : "Ton buste porte chaque zone analysée. Fais-le pivoter, touche une pastille."}
          </p>
        </div>
        {avgScore != null && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-black text-white"
            style={{ backgroundColor: scoreColor(avgScore) }}
          >
            {avgScore}/100
          </span>
        )}
      </div>

      {/* Scène — les chips ci-dessous forment l'interface accessible */}
      <div
        ref={stageRef}
        aria-hidden="true"
        className="relative h-[340px] cursor-grab touch-pan-y select-none overflow-hidden rounded-3xl border border-border shadow-lg active:cursor-grabbing sm:h-[380px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* fond mélanine « scène de musée » */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_18%,#3A2A1A_0%,#241A10_55%,#1A1410_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(closest-side_at_50%_45%,rgba(200,149,30,0.13),transparent_75%)]" />

        {mode === "3d" ? (
          <SkinTwinScene
            markers={markers}
            skinTone={skin}
            rimColor={avgScore != null ? scoreColor(avgScore) : "#C8951E"}
            activeIndex={activeIndex}
            onSelect={(i) => setSelected((v) => (v === i ? null : i))}
            dragRef={dragRef}
            frameloop={active ? "always" : "never"}
            projRef={projection ? projRef : null}
          />
        ) : (
          mode === "static" && (
            <TwinFallback
              markers={markers}
              proj={projection ? { weeks, adh: ADHERENCE_FACTOR[adherence] } : null}
            />
          )
        )}

        {/* badge phototype */}
        {fitz && (
          <div className="absolute left-3 top-3 rounded-full border border-[#C8951E]/30 bg-[#1A1410]/75 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#C8951E]">
            Fitz {fitz}
          </div>
        )}

        {/* hint rotation */}
        {!interacted && mode === "3d" && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#1A1410]/85 px-3.5 py-1.5 text-[11px] text-[#F8F1E4]/85">
            <RotateCw size={12} aria-hidden /> Fais pivoter
          </div>
        )}
      </div>

      {/* Le Fil du Temps — projection indicative sur le jumeau */}
      {projection && markers.length > 0 && (
        <ProjectionSlider
          weeks={weeks}
          adherence={adherence}
          onWeeks={changeWeeks}
          onAdherence={changeAdherence}
        />
      )}

      {/* Pastilles = interface accessible (clavier, lecteurs d'écran) */}
      {markers.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Zones détectées sur le jumeau">
            {markers.map((m, i) => {
              const isSel = selected === i;
              return (
                <button
                  key={m.key}
                  type="button"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => setSelected((v) => (v === i ? null : i))}
                  aria-pressed={isSel}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-primary active:scale-95 ${
                    isSel ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV_HEX[m.sev] }} aria-hidden />
                  <span className="font-mono text-[9px] text-muted-foreground">{i + 1}</span>
                  <span className="max-w-[180px] truncate">{m.label}</span>
                  {multiZones && <span className="text-[8.5px] uppercase tracking-wide text-muted-foreground">{zoneLabel(m.zone)}</span>}
                </button>
              );
            })}
          </div>

          {/* Détail de la pastille sélectionnée */}
          {selectedMarker && (
            <div className="mt-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-sm font-bold">{selectedMarker.label}</p>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: SEV_HEX[selectedMarker.sev] }}>
                  {SEVERITY_STYLES[selectedMarker.sev].label}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {zoneLabel(selectedMarker.zone)}
                {selectedEntry?.date && ` · ${formatDate(selectedEntry.date)}`}
              </p>
              {matched && (
                <>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${matched.pourcentage}%`, backgroundColor: SEV_HEX[selectedMarker.sev] }} />
                    </div>
                    <span className="font-mono text-xs font-bold" style={{ color: scoreColor(matched.pourcentage) }}>
                      {matched.pourcentage}%
                    </span>
                  </div>
                  <p className="mt-1 text-[9.5px] uppercase tracking-wide text-muted-foreground">Indicateur lié : {matched.nom}</p>
                  {matched.note && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{matched.note}</p>}
                  {projection && weeks > 0 && (
                    <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{
                            width: `${projectPct(matched.pourcentage, weeks, ADHERENCE_FACTOR[adherence], matched.nom)}%`,
                            backgroundColor: "#3F7D3F",
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <span className="shrink-0 font-mono text-[10px] font-bold text-[#3F7D3F]">
                        S+{weeks} : ~{projectPct(matched.pourcentage, weeks, ADHERENCE_FACTOR[adherence], matched.nom)} %
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Légende sévérité */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider text-muted-foreground">
              <Fingerprint size={11} aria-hidden /> Pastilles
            </span>
            {SEVERITY_STYLES.map((s, i) => (
              <span key={s.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEV_HEX[i] }} aria-hidden /> {s.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-border bg-card/60 p-4 text-center text-[11.5px] leading-relaxed text-muted-foreground">
          Marqueurs de zones indisponibles sur {entries.length > 1 ? "ces diagnostics" : "ce diagnostic"} — le jumeau porte le score
          global en lueur dorée.
        </p>
      )}
    </section>
  );
}
