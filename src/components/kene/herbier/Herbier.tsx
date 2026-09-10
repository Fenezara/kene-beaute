"use client";
// Kènè — « Herbier des Grandes-Mères » (t. 83-d) : le jardin botanique des
// sages ivoiriennes. Vue plein écran (overlay z-70, pattern SkinDescent :
// scroll interne + scène collante + Échap + blocage du scroll body) montée
// à la racine via un gate hash (pattern PassportView : useSyncExternalStore,
// jamais de setState dans un effet). Le hash est `#herbier` — aucune
// collision avec ?passport=… (query) ni avec #moonlight (mode figé une fois
// pour toutes par useLoomMode, cf. worklog t. 82).
//
// Mode Clair de Lune (reduced-motion / 2G-3G / saveData / deviceMemory / pas
// de WebGL) : PAS de canvas — grille statique des 8 cartes plantes (médaillon
// couleur feuillage, tap = déploiement). Le contenu n'est JAMAIS bloqué.
//
// Expérience 3D : le scroll interne avance la caméra le long de l'arc des 8
// plantes (chaque plante arrive au premier plan à son tour) ; tap sur une
// plante (raycast R3F, zone de hit élargie) ou points ‹ › → la carte de
// sagesse change (transition framer-motion) + « Écouter » (TTS partagé).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Flower2,
  Hand,
  Info,
  Leaf,
  Shield,
  Sprout,
  TreeDeciduous,
  TreePalm,
  TriangleAlert,
  Wheat,
  X,
} from "lucide-react";
import { HERBIER_PLANTS, plantSpoken, type HerbierPlant } from "./plants";
import { useLoomMode } from "@/components/kene/loom/useLoomMode";
import { glossaryFor } from "@/lib/kene/glossary";
import { SpeakButton } from "@/components/kene/client/SpeakButton";

const Herbier3D = dynamic(() => import("./Herbier3D"), { ssr: false, loading: () => null });

const N = HERBIER_PLANTS.length;

/* ── Gate : hash #herbier (store externe, pattern PassportView) ── */
const HERBIER_HASH = "#herbier";
const listeners = new Set<() => void>();
let forceClosed = false; // repli si replaceState échoue (historique verrouillé)

function notify() {
  for (const l of listeners) l();
}
function snapshotOpen(): boolean {
  if (typeof window === "undefined" || forceClosed) return false;
  return window.location.hash === HERBIER_HASH;
}
function subscribeOpen(l: () => void) {
  listeners.add(l);
  const onRoute = () => notify();
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("popstate", onRoute);
  return () => {
    listeners.delete(l);
    window.removeEventListener("hashchange", onRoute);
    window.removeEventListener("popstate", onRoute);
  };
}

/** Ouvre l'Herbier (entrée d'historique : le bouton Retour referme aussi). */
export function openHerbier() {
  forceClosed = false;
  if (typeof window !== "undefined" && window.location.hash !== HERBIER_HASH) {
    try {
      window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${HERBIER_HASH}`);
    } catch {
      window.location.hash = "herbier";
    }
  }
  notify();
}

/** Referme l'Herbier — retire le hash sans toucher au reste de l'URL. */
export function closeHerbier() {
  if (typeof window !== "undefined" && window.location.hash === HERBIER_HASH) {
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } catch {
      forceClosed = true;
    }
  }
  notify();
}

function useHerbierOpen(): boolean {
  return useSyncExternalStore(subscribeOpen, snapshotOpen, () => false);
}

/** Gate monté à la racine (page.tsx) — rendu uniquement si #herbier actif. */
export function HerbierGate() {
  const open = useHerbierOpen();
  if (!open) return null;
  return <Herbier onClose={closeHerbier} />;
}

/* ── Petits utilitaires partagés ── */
const PLANT_ICONS = [Droplets, Leaf, Sprout, TreeDeciduous, Flower2, Wheat, Shield, TreePalm];
const clampIndex = (i: number) => Math.min(N - 1, Math.max(0, i));

function indicatorLabels(p: HerbierPlant): string[] {
  return p.indicateurs.map((k) => glossaryFor(k)?.title ?? k);
}

/* ── Contenu de la carte plante (partagé 3D + clair de lune) ── */
function PlantDetails({ plant }: { plant: HerbierPlant }) {
  const labels = useMemo(() => indicatorLabels(plant), [plant]);
  return (
    <div>
      <p className="text-[12.5px] leading-relaxed text-[#F8F1E4]/88">{plant.vertus}</p>
      <div className="mt-2.5 space-y-1.5">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[#F8F1E4]/78">
          <Hand size={12} className="mt-0.5 shrink-0 text-[#C8951E]" aria-hidden="true" />
          {plant.usage}
        </p>
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[#F3D9E0]/85">
          <TriangleAlert size={12} className="mt-0.5 shrink-0 text-[#E89AB3]" aria-hidden="true" />
          {plant.precaution}
        </p>
      </div>
      <p className="mt-2.5 border-l-2 border-[#C8951E]/50 pl-3 text-[12.5px] italic leading-relaxed text-[#F3E0C0]">
        « {plant.sagesse} »
      </p>
      {labels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#F8F1E4]/45">Pour ta peau</span>
          {labels.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded-full bg-[#F8F1E4]/8 px-2 py-0.5 text-[10px] text-[#F8F1E4]/85">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: plant.couleur }} aria-hidden="true" />
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Bandeau titre (partagé 3D + clair de lune) ── */
function HerbierHeader() {
  return (
    <div className="relative z-10 px-5 pt-5 pr-24">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C8951E]">Le jardin de Kènè</p>
      <h2 className="mt-2 font-heading font-black text-[24px] leading-[1.08] text-[#F8F1E4]">Herbier des Grandes-Mères</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#F8F1E4]/70">Les plantes qui soignent nos peaux depuis toujours</p>
      <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[#F8F1E4]/50">
        <Info size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
        Sagesse transmise de génération en génération — en cas de lésion, vois un professionnel.
      </p>
    </div>
  );
}

/* ═════════════════════════ La vue plein écran ═════════════════════════ */
function Herbier({ onClose }: { onClose: () => void }) {
  const mode = useLoomMode();
  const full = mode === "full";
  const [active, setActive] = useState(0);
  const [moonlit, setMoonlit] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const activeRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const lockUntilRef = useRef(0);
  const hintRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [canvasOn, setCanvasOn] = useState(true);

  /* Avance à la plante i : carte immédiate + défilement doux vers sa place
     (la boucle rAF ne reprend la main qu'après l'animation — verrou 750 ms). */
  function goto(i: number) {
    const c = clampIndex(i);
    lockUntilRef.current = performance.now() + 750;
    setActive(c);
    activeRef.current = c;
    const container = scrollRef.current;
    const section = sectionRef.current;
    if (container && section) {
      const total = Math.max(section.getBoundingClientRect().height - window.innerHeight, 1);
      container.scrollTo({ top: (c / (N - 1)) * total, behavior: "smooth" });
    }
  }

  /* Clair de lune : ouvre la carte i et la fait défiler à l'écran. */
  function gotoMoonlit(i: number) {
    const c = clampIndex(i);
    setMoonlit((cur) => (cur === c ? cur : c));
    cardRefs.current[c]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* Échap ferme, flèches ‹ › naviguent (les deux modes). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        if (full) goto(active + 1);
        else gotoMoonlit((moonlit ?? -1) + 1);
      }
      if (e.key === "ArrowLeft") {
        if (full) goto(active - 1);
        else gotoMoonlit((moonlit ?? N) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, moonlit, full, onClose]);

  /* Bloque le scroll du document derrière l'overlay (pattern SkinDescent). */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* Boucle unique : progression du scroll → caméra + plante active + invite.
     Rendu coupé hors écran (IO → frameloop, budget GPU — pattern LoomSection). */
  useEffect(() => {
    if (!full) return;
    const section = sectionRef.current;
    const scroller = scrollRef.current;
    if (!section || !scroller) return;
    const io = new IntersectionObserver((entries) => setCanvasOn(entries[0]?.isIntersecting ?? false), { threshold: 0.05 });
    io.observe(scroller);

    const onMove = (e: PointerEvent) => {
      pointerRef.current.x = e.clientX / window.innerWidth - 0.5;
      pointerRef.current.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    const loop = () => {
      const rect = section.getBoundingClientRect();
      const total = Math.max(rect.height - window.innerHeight, 1);
      const p = Math.min(1, Math.max(0, -rect.top / total));
      progressRef.current = p;
      const idx = clampIndex(Math.round(p * (N - 1)));
      if (idx !== activeRef.current && performance.now() > lockUntilRef.current) {
        activeRef.current = idx;
        setActive(idx);
      }
      if (hintRef.current) {
        hintRef.current.style.opacity = String(Math.max(0, 1 - p * 16));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, [full]);

  const plant = HERBIER_PLANTS[active];
  const Icon = PLANT_ICONS[active];

  const closeButton = (
    <button
      onClick={onClose}
      className="absolute right-4 top-4 z-20 inline-flex h-11 items-center gap-1.5 rounded-full border border-[#F8F1E4]/20 bg-[#F8F1E4]/5 px-4 text-xs text-[#F8F1E4]/85 backdrop-blur transition hover:bg-[#F8F1E4]/15 focus-visible:outline-2 focus-visible:outline-[#C8951E]"
      aria-label="Fermer l'Herbier des Grandes-Mères"
    >
      <X size={13} /> Fermer
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] bg-[#0F0B07] text-[#F8F1E4]"
      role="dialog"
      aria-label="Herbier des Grandes-Mères — le jardin des plantes de nos peaux"
    >
      {closeButton}

      {full ? (
        /* ── Expérience 3D : promenade en arc, scène collante ── */
        <>
          <HerbierHeader />
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto pretty-scroll">
            <div ref={sectionRef} className="relative h-[320vh]">
              <div className="sticky top-0 h-svh overflow-hidden">
                {/* Le jardin — garde les événements pointeur (tap sur plante),
                    le scroll remonte au conteneur (pas de touch-action: none) */}
                <div className="absolute inset-0">
                  <Herbier3D
                    progressRef={progressRef}
                    activeRef={activeRef}
                    pointerRef={pointerRef}
                    active={canvasOn}
                    onSelect={goto}
                  />
                </div>
  
                {/* Vignettes de lisibilité (titre + carte au-dessus du jardin) */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0F0B07]/85 to-transparent" />
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#0F0B07]/92 to-transparent" />
  
                {/* Invitation — s'efface aux premiers millimètres (boucle rAF) */}
                <div
                  ref={hintRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-[160px] z-10 flex flex-col items-center gap-1 text-[#F8F1E4]/55"
                >
                  <span className="text-[10px] uppercase tracking-[0.2em]">Défile pour te promener</span>
                  <motion.span animate={{ y: [0, 5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
                    <ChevronDown size={16} />
                  </motion.span>
                </div>
  
                {/* Carte de sagesse + navigation — VRAI HTML au-dessus du canvas */}
                <div className="absolute inset-x-4 bottom-4 z-10 mx-auto max-w-[560px] sm:inset-x-6">
                  <div className="mb-2.5 flex items-center justify-center gap-3">
                    <button
                      onClick={() => goto(active - 1)}
                      disabled={active === 0}
                      aria-label="Plante précédente"
                      className="grid h-10 w-10 place-items-center rounded-full border border-[#F8F1E4]/15 bg-[#1A1410]/80 text-[#F8F1E4]/80 transition hover:bg-[#F8F1E4]/15 focus-visible:outline-2 focus-visible:outline-[#C8951E] disabled:opacity-35"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="flex items-center gap-1.5" aria-label="Plantes du jardin">
                      {HERBIER_PLANTS.map((p, i) => (
                        <button
                          key={p.id}
                          aria-label={`${p.nom} — plante ${i + 1} sur ${N}`}
                          aria-current={i === active}
                          onClick={() => goto(i)}
                          className="h-2.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-[#C8951E]"
                          style={{
                            width: i === active ? 22 : 10,
                            backgroundColor: i === active ? "#E3B454" : "rgba(248,241,228,0.28)",
                          }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => goto(active + 1)}
                      disabled={active === N - 1}
                      aria-label="Plante suivante"
                      className="grid h-10 w-10 place-items-center rounded-full border border-[#F8F1E4]/15 bg-[#1A1410]/80 text-[#F8F1E4]/80 transition hover:bg-[#F8F1E4]/15 focus-visible:outline-2 focus-visible:outline-[#C8951E] disabled:opacity-35"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
  
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={plant.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                      className="relative max-h-[54svh] overflow-y-auto pretty-scroll rounded-[24px] bg-[#1A1410]/90 p-4 ring-1 ring-[#C8951E]/25 shadow-2xl"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-full ring-2 ring-[#F8F1E4]/15"
                          style={{ backgroundColor: plant.couleur }}
                          aria-hidden="true"
                        >
                          <Icon size={17} className="text-[#FFF9EC]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[#C8951E]">
                            Plante {active + 1} / {N} · {plant.famille}
                          </p>
                          <h3 className="font-heading text-[22px] font-black leading-tight">{plant.nom}</h3>
                          <p className="mt-0.5 text-[11px] text-[#F8F1E4]/55">Aussi appelé {plant.nomsLocaux.join(" · ")}</p>
                        </div>
                        <SpeakButton
                          text={plantSpoken(plant)}
                          label="Écouter"
                          speed={0.92}
                          className="ml-1 shrink-0 border-[#C8951E]/55! bg-[#C8951E]/10! text-[#E3B454]!"
                        />
                      </div>
                      <div className="mt-2.5">
                        <PlantDetails plant={plant} />
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ── Clair de Lune : grille statique, mêmes contenus, zéro canvas ── */
        <div className="absolute inset-0 overflow-y-auto pretty-scroll">
          <div className="mx-auto max-w-[560px] px-5 pb-12">
            <HerbierHeader />
            <p className="mt-4 text-[11px] leading-relaxed text-[#F8F1E4]/50">
              Mode clair de lune — le jardin est au repos, les plantes t'attendent ici.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {HERBIER_PLANTS.map((p, i) => {
                const CardIcon = PLANT_ICONS[i];
                const open = moonlit === i;
                return (
                  <div
                    key={p.id}
                    ref={(el) => {
                      cardRefs.current[i] = el;
                    }}
                    className={open ? "col-span-2" : ""}
                  >
                    <div className="rounded-[20px] bg-gradient-to-b from-[#241A10] to-[#1A1410] ring-1 ring-[#C8951E]/20">
                      <button
                        onClick={() => setMoonlit(open ? null : i)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-[#C8951E]"
                      >
                        <span
                          className="grid h-12 w-12 shrink-0 place-items-center rounded-full ring-2 ring-[#F8F1E4]/12"
                          style={{ backgroundColor: p.couleur }}
                          aria-hidden="true"
                        >
                          <CardIcon size={18} className="text-[#FFF9EC]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-heading text-[16px] font-black leading-tight text-[#F8F1E4]">{p.nom}</span>
                          <span className="mt-0.5 block text-[10px] text-[#F8F1E4]/55">{p.famille}</span>
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4">
                              <p className="text-[11px] text-[#F8F1E4]/55">Aussi appelé {p.nomsLocaux.join(" · ")}</p>
                              <div className="mt-2">
                                <PlantDetails plant={p} />
                              </div>
                              <div className="mt-3 border-t border-[#F8F1E4]/10 pt-3">
                                <SpeakButton
                                  text={plantSpoken(p)}
                                  label="Écouter"
                                  speed={0.92}
                                  className="border-[#C8951E]/55! bg-[#C8951E]/10! text-[#E3B454]!"
                                />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={onClose}
              className="mt-7 h-12 w-full rounded-2xl bg-[#C8951E] font-heading font-bold text-[15px] text-[#1A1410] focus-visible:outline-2 focus-visible:outline-[#F8F1E4]"
            >
              Refermer l&apos;herbier
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
