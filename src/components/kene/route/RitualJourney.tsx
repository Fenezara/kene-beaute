"use client";
// Kènè — La Route de l'Or: parcours narratif qui tisse la routine de soin
// (overlay plein cadre ≤430px — 7 étapes: le fil, 4 stations, l'institut, le tissage)
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CalendarPlus, Check, Moon, ShoppingBag, Sunrise, X } from "lucide-react";
import { toast } from "sonner";
import { xof, CASHBACK_RATE } from "@/lib/kene/format";
import { BODY_ZONES, type DiagnosisResult } from "@/lib/kene/types";
import { CauriIcon, NeaOnnimIcon, SankofaIcon } from "@/components/kene/icons";
import { useKene } from "@/store/kene";
import type { ApiProduct } from "@/components/kene/client/types";
import { buildRitual, ritualTotal, shade, type StationPick } from "./ritual";
import { WovenBand, type BandRow } from "./WovenBand";

const STEP_LABELS = ["Le fil", "Purifier", "Soigner", "Nourrir", "Protéger", "Institut", "Tissage"];
const N_STEPS = STEP_LABELS.length;
const TERRE = "#A0522D";

/* ─────────── Le fil d'or (route en haut d'écran) ─────────── */
function GoldenThread({ step }: { step: number }) {
  const W = 382;
  const H = 56;
  const px = 22;
  const span = W - px * 2;
  const nodeX = (i: number) => px + (span * i) / (N_STEPS - 1);
  const nodeY = (i: number) => 32 - Math.sin((i / (N_STEPS - 1)) * Math.PI * 1.55) * 9;
  let d = `M ${nodeX(0)} ${nodeY(0)}`;
  for (let i = 1; i < N_STEPS; i++) {
    const x0 = nodeX(i - 1);
    const x1 = nodeX(i);
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${nodeY(i - 1)}, ${mx} ${nodeY(i)}, ${x1} ${nodeY(i)}`;
  }
  const labelX = Math.min(W - 52, Math.max(52, nodeX(step)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[56px] shrink-0" role="img" aria-label={`Étape ${step + 1} sur ${N_STEPS} : ${STEP_LABELS[step]}`}>
      {/* route complète, discrète */}
      <path d={d} fill="none" stroke="var(--border)" strokeWidth={1.6} strokeLinecap="round" />
      {/* fil d'or qui se déroule jusqu'à l'étape courante */}
      <motion.path
        d={d}
        fill="none"
        stroke="#C8951E"
        strokeWidth={2.6}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: step / (N_STEPS - 1) }}
        transition={{ duration: 0.7, ease: [0.22, 0.9, 0.28, 1] }}
      />
      {/* nœuds */}
      {Array.from({ length: N_STEPS }).map((_, i) => {
        const passed = i < step;
        const current = i === step;
        return (
          <g key={i}>
            {current && <motion.circle cx={nodeX(i)} cy={nodeY(i)} r={9} fill="none" stroke="#C8951E" strokeWidth={1.2} initial={{ scale: 0.6, opacity: 0.9 }} animate={{ scale: [0.6, 1.5, 0.6], opacity: [0.9, 0, 0.9] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />}
            <circle cx={nodeX(i)} cy={nodeY(i)} r={current ? 5.5 : 4} fill={passed || current ? "#C8951E" : "var(--card)"} stroke={passed || current ? "#C8951E" : "var(--muted-foreground)"} strokeWidth={1.6} />
          </g>
        );
      })}
      {/* navette */}
      <motion.g initial={false} animate={{ x: nodeX(step), y: nodeY(step) }} transition={{ duration: 0.7, ease: [0.22, 0.9, 0.28, 1] }}>
        <path d="M 0 -7 L 6 0 L 0 7 L -6 0 Z" fill="#FFF9EC" stroke="#C8951E" strokeWidth={1.8} />
        <circle r={1.8} fill="#A0522D" />
      </motion.g>
      {/* étiquette de l'étape courante */}
      <motion.text initial={false} animate={{ x: labelX, y: nodeY(step) - 17, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 0.9, 0.28, 1] }} textAnchor="middle" className="fill-[#C8951E]" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {STEP_LABELS[step]}
      </motion.text>
    </svg>
  );
}

/* ─────────── Écran d'une station ─────────── */
function StationScreen({ index, station, kept, onToggle }: { index: number; station: ReturnType<typeof buildRitual>["stations"][number]; kept: Record<string, boolean>; onToggle: (id: string) => void }) {
  const def = station.def;
  return (
    <div className="pt-2 pb-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        Station {index + 1} / 4
      </p>
      <h2 className="font-heading font-black text-2xl mt-1.5" style={{ color: def.thread }}>
        {def.label}
      </h2>
      <p className="text-xs text-muted-foreground mt-0.5">{def.verb}</p>

      <blockquote className="mt-4 rounded-2xl border-l-4 p-4 text-[13px] leading-relaxed italic" style={{ borderColor: def.thread, backgroundColor: def.threadSoft }}>
        « {def.poem} »
      </blockquote>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-karite border border-[#C8951E]/30 px-3 py-1.5 text-[11px] font-semibold text-terre">{def.botanical}</span>
        {def.matin && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#C8951E]/10 border border-[#C8951E]/25 px-3 py-1.5 text-[11px] font-semibold text-[#A0720F]">
            <Sunrise size={12} /> Matin
          </span>
        )}
        {def.soir && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#5C3A21]/10 border border-[#5C3A21]/25 px-3 py-1.5 text-[11px] font-semibold text-[#5C3A21]">
            <Moon size={12} /> Soir
          </span>
        )}
      </div>

      {station.focus.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <CauriIcon size={12} style={{ color: def.thread }} /> Ta peau demande
          </p>
          <div className="flex flex-wrap gap-2">
            {station.focus.map((f) => (
              <span key={f.nom} className="rounded-xl border border-border bg-card px-3 py-2 text-[11px] font-semibold">
                {f.nom}
                <span className="ml-1.5 font-mono font-bold" style={{ color: ["#3F7D3F", "#A0720F", "#C26418", "#8B1A3B"][Math.min(3, Math.max(0, f.severite))] }}>
                  {f.pourcentage}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {station.picks.length > 0 ? (
          station.picks.map((pick) => (
            <ProductPick key={pick.product.id} pick={pick} thread={def.thread} kept={kept[pick.product.id] ?? true} onToggle={() => onToggle(pick.product.id)} />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Aucun produit n&apos;est indispensable ici aujourd&apos;hui — cette étape se jouera en institut, entre mains expertes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductPick({ pick, thread, kept, onToggle }: { pick: StationPick; thread: string; kept: boolean; onToggle: () => void }) {
  const p = pick.product;
  return (
    <motion.div layout className={`rounded-2xl border bg-card p-3 shadow-sm transition-opacity ${kept ? "border-border" : "opacity-50 border-dashed"}`}>
      <div className="flex items-center gap-3">
        <img src={p.image} alt={p.name} loading="lazy" className="h-14 w-14 rounded-xl object-cover shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold leading-tight line-clamp-2">{p.name}</p>
          <p className="font-mono text-[11px] font-bold mt-0.5" style={{ color: thread }}>
            {xof(p.price)}
          </p>
          {pick.target && (
            <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate">
              Cible : {pick.target.nom} · <span className="font-mono font-bold">{pick.target.pourcentage}%</span>
            </p>
          )}
        </div>
        <button
          onClick={onToggle}
          role="switch"
          aria-checked={kept}
          aria-label={`${kept ? "Retirer" : "Garder"} ${p.name} dans mon tissage`}
          className={`h-9 w-9 grid place-items-center rounded-full border-2 shrink-0 transition-all active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${kept ? "text-white" : "border-border text-muted-foreground bg-muted/40"}`}
          style={kept ? { backgroundColor: thread, borderColor: thread } : undefined}
        >
          {kept ? <Check size={16} /> : <X size={15} />}
        </button>
      </div>
      {pick.fromAi && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-primary">
          <CauriIcon size={9} /> Recommandé selon ton scan cutané
        </p>
      )}
    </motion.div>
  );
}

/* ─────────── Le parcours complet ─────────── */
export function RitualJourney({
  diag,
  products,
  userName,
  onClose,
}: {
  diag: { id: string; result: DiagnosisResult; createdAt: string };
  products: ApiProduct[];
  userName: string;
  onClose: () => void;
}) {
  const addToCart = useKene((s) => s.addToCart);
  const setClientTab = useKene((s) => s.setClientTab);
  const [step, setStep] = useState(0);
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const closeRef = useRef<HTMLButtonElement>(null);

  const ritual = useMemo(() => buildRitual(diag.result, products), [diag.result, products]);
  const zoneLabel = BODY_ZONES.find((z) => z.id === diag.result.zone)?.label ?? diag.result.zone;
  const first = userName.split(" ")[0] ?? "Ma peau";

  const keptPicks = useMemo(
    () => ritual.stations.flatMap((s) => s.picks.filter((p) => kept[p.product.id] ?? true)),
    [ritual, kept]
  );
  const total = ritualTotal(keptPicks);

  // verrou scroll + Escape + focus initial
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function toggle(id: string) {
    setKept((k) => ({ ...k, [id]: !(k[id] ?? true) }));
  }

  function weaveCart() {
    if (keptPicks.length === 0) return;
    for (const p of keptPicks) {
      addToCart({ productId: p.product.id, name: p.product.name, price: p.product.price, qty: 1, image: p.product.image });
    }
    toast.success(`${keptPicks.length} produits tissés dans ton panier`, {
      description: `Cashback estimé ${xof(Math.round(total * CASHBACK_RATE))} sur ${xof(total)}`,
    });
    onClose();
    setClientTab("boutique");
  }

  const bandRows: BandRow[] = useMemo(
    () => [
      ...ritual.stations.map((s) => {
        const hasKept = s.picks.some((p) => kept[p.product.id] ?? true);
        return { color: hasKept ? s.def.thread : shade(s.def.thread, -0.32), label: s.def.label };
      }),
      { color: TERRE, label: "Institut" },
    ],
    [ritual, kept]
  );

  const dateStr = new Date(diag.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="La Route de l'Or — tissage de ta routine"
      className="fixed inset-0 z-50 mx-auto w-full max-w-[430px] bg-background flex flex-col shadow-2xl"
    >
      <div aria-hidden="true" className="kente-band h-1 w-full shrink-0" />

      {/* header */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 h-14">
        <div className="min-w-0">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-primary">Kènè · Rituel</p>
          <h1 className="font-heading font-black text-base leading-tight truncate">La Route de l&apos;Or</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold text-muted-foreground" aria-hidden="true">
            {step + 1}/{N_STEPS}
          </span>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Quitter la Route de l'Or"
            className="h-10 w-10 grid place-items-center rounded-full border border-border bg-card active:scale-90 transition-transform focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <GoldenThread step={step} />

      {/* contenu */}
      <div className="flex-1 overflow-y-auto pretty-scroll px-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 34 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -26 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {step === 0 && (
              <div className="pt-3 pb-4 text-center">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 16 }} className="mx-auto grid place-items-center h-20 w-20 rounded-3xl bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] shadow-lg">
                  <NeaOnnimIcon size={38} />
                </motion.div>
                <h2 className="font-heading font-black text-2xl mt-4">Le fil est prêt.</h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground mt-2 max-w-[300px] mx-auto">
                  Ton diagnostic est une carte. La Route de l&apos;Or est le chemin : quatre stations, une navette, et à l&apos;arrivée —
                  <span className="text-terre font-semibold"> ton kente de soin, tissé pour toi seule.</span>
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold">Zone : {zoneLabel}</span>
                  <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold font-mono">Score {ritual.score}/100</span>
                  <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold">{dateStr}</span>
                </div>
                <div className="mt-6 rounded-2xl border border-border bg-card p-4">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-3">Tes quatre stations</p>
                  <div className="space-y-2.5">
                    {ritual.stations.map((s) => (
                      <div key={s.def.id} className="flex items-center gap-3">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.def.thread }} aria-hidden="true" />
                        <span className="text-xs font-semibold">{s.def.label}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{s.def.verb}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-[10.5px] text-muted-foreground">Chaque produit que tu gardes devient un fil. Ce que tu retires laisse un vide assumé.</p>
              </div>
            )}

            {step >= 1 && step <= 4 && <StationScreen index={step - 1} station={ritual.stations[step - 1]} kept={kept} onToggle={toggle} />}

            {step === 5 && (
              <div className="pt-2 pb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Avant-dernière étape</p>
                <h2 className="font-heading font-black text-2xl mt-1.5 text-terre">Honorer le rituel</h2>
                <blockquote className="mt-4 rounded-2xl border-l-4 border-terre bg-terre/10 p-4 text-[13px] leading-relaxed italic">
                  « Certaines mains expertes font ce que la maison ne peut pas. Offre à ta peau un institut — et le tissage tiendra mieux. »
                </blockquote>
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <span className="grid place-items-center h-12 w-12 rounded-2xl bg-[#A0522D]/10 text-[#A0522D] shrink-0">
                    <SankofaIcon size={24} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold">Le soin en institut</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      Acompte 30 % à la réservation · rappel J-1 par SMS · annulation remboursée selon conditions.
                    </p>
                  </div>
                </div>
                {ritual.soins.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">Recommandés pour ta peau</p>
                    {ritual.soins.map((s) => (
                      <div key={s} className="rounded-2xl border border-[#3F7D3F]/30 bg-[#3F7D3F]/5 px-4 py-3 text-xs font-semibold text-[#3F7D3F]">
                        {s}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => {
                    onClose();
                    setClientTab("rdv");
                  }}
                  className="mt-5 h-12 w-full rounded-xl bg-[#3F7D3F] text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-[#3F7D3F]"
                >
                  <CalendarPlus size={16} /> Voir les instituts partenaires
                </button>
              </div>
            )}

            {step === 6 && (
              <div className="pt-2 pb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Dernière étape</p>
                <h2 className="font-heading font-black text-2xl mt-1.5">Ton kente de soin est tissé</h2>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Cinq rangées — quatre stations et l&apos;institut. Les rangées sombres sont les fils que tu as choisis de ne pas garder : elles font partie du motif.
                </p>

                <div className="mt-4">
                  <WovenBand rows={bandRows} name={first} score={ritual.score} date={dateStr} fileName={`kene-rituel-${first.toLowerCase()}.png`} />
                </div>

                {keptPicks.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-border bg-card p-4">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-3">Fils retenus ({keptPicks.length})</p>
                    <ul className="space-y-2">
                      {keptPicks.map((p) => (
                        <li key={p.product.id} className="flex items-center gap-2.5">
                          <img src={p.product.image} alt="" loading="lazy" className="h-8 w-8 rounded-lg object-cover shrink-0" aria-hidden="true" />
                          <span className="text-[11.5px] font-semibold min-w-0 flex-1 truncate">{p.product.name}</span>
                          <span className="font-mono text-[11px] font-bold">{xof(p.product.price)}</span>
                          <button onClick={() => toggle(p.product.id)} aria-label={`Retirer ${p.product.name}`} className="h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:text-destructive active:scale-90 transition-transform focus-visible:outline-2 focus-visible:outline-destructive">
                            <X size={13} />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 pt-3 border-t border-dashed border-border flex items-center justify-between">
                      <span className="text-xs font-semibold">Total du rituel</span>
                      <span className="font-mono text-base font-black text-primary">{xof(total)}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    onClose();
                    setClientTab("rdv");
                  }}
                  className="mt-4 w-full h-11 rounded-xl border border-[#3F7D3F]/50 text-[#3F7D3F] text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-[#3F7D3F]"
                >
                  <CalendarPlus size={14} /> Réserver le soin en institut
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* footer navigation */}
      <footer className="shrink-0 border-t border-border/70 glass-kene backdrop-blur-[16px] px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="flex gap-2.5">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              aria-label="Étape précédente"
              className="h-14 w-14 shrink-0 grid place-items-center rounded-2xl border border-border bg-card active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          {step < 6 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="h-14 flex-1 rounded-2xl bg-primary text-primary-foreground font-heading font-black text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {step === 0 ? "Prendre le fil" : step === 5 ? "Voir mon tissage" : "Continuer"}
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={weaveCart}
              disabled={keptPicks.length === 0}
              className="h-14 flex-1 rounded-2xl bg-primary text-primary-foreground font-heading font-black text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ShoppingBag size={18} />
              {keptPicks.length > 0 ? `Tisser mon panier · ${xof(total)}` : "Aucun fil retenu"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
