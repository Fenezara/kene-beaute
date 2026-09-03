"use client";
// Kènè Cliente — Diagnostic IA : wizard zone → capture → analyse → résultats VISIA-like → historique
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Brush, CalendarPlus, Camera, Check, ChevronRight, CircleHelp, Cross, GitCompareArrows, Hand, History,
  ImagePlus, Loader2, Moon, PersonStanding, Plus, RotateCcw, ScanFace, Sparkles, Sunrise, TriangleAlert, X,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, resizeImage } from "@/lib/kene/api";
import { formatDate, scoreColor, readableTextColor, xof, SEVERITY_STYLES } from "@/lib/kene/format";
import { BODY_ZONES, SPECTRAL_VIEWS, type BodyZone, type DiagnosisResult, type Indicator } from "@/lib/kene/types";
import { BaobabIcon, KariteIcon, MoringaIcon, NeaOnnimIcon } from "@/components/kene/icons";
import { SkinTwinCard } from "@/components/kene/skintwin/SkinTwinCard";
import { EvolutionCard } from "@/components/kene/evolution/EvolutionCard";
import { VoiceNarration } from "./VoiceNarration";
import { GlossaryDialog } from "./GlossaryDialog";
import { glossaryFor, type GlossaryEntry } from "@/lib/kene/glossary";
import { matchProduct, norm } from "@/components/kene/route/ritual";
import { RitualJourney } from "@/components/kene/route/RitualJourney";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKene } from "@/store/kene";
import type { ApiDiagnosis, ApiProduct } from "./types";
import { diagImgSrc, parseDiagnosis } from "./types";
import { ScoreChip, ScoreGauge } from "./bits";

const ZONE_ICONS: Record<BodyZone, React.ComponentType<{ size?: number; className?: string }>> = {
  visage: ScanFace,
  dos: PersonStanding,
  cuir_chevelu: Sparkles,
  mains: Hand,
  barbe: Brush,
  naevi: Cross,
};

const ANALYSIS_STEPS = [
  "Détection des zones de pigmentation…",
  "Analyse PIH & mélasma…",
  "Cartographie inflammatoire…",
  "Score mélanoderme…",
];

export function DiagnosticScreen({ pendingZone, onZoneConsumed }: { pendingZone: BodyZone | null; onZoneConsumed: () => void }) {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);
  const addToCart = useKene((s) => s.addToCart);

  const [step, setStep] = useState(0);
  const [zone, setZone] = useState<BodyZone>("visage");
  const [image, setImage] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [checkedSteps, setCheckedSteps] = useState(0);
  const [diag, setDiag] = useState<{ id: string; result: DiagnosisResult; imageData: string; createdAt: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [history, setHistory] = useState<ApiDiagnosis[] | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSel, setCompareSel] = useState<string[]>([]);

  // zone pré-sélectionnée depuis l'accueil
  useEffect(() => {
    if (pendingZone) {
      setZone(pendingZone);
      setStep(1);
      setDiag(null);
      setImage("");
      onZoneConsumed();
    }
  }, [pendingZone, onZoneConsumed]);

  // produits pour les recommandations
  useEffect(() => {
    apiGet<{ products: ApiProduct[] }>("/api/shop/products").then((r) => setProducts(r.products ?? [])).catch(() => {});
  }, []);

  async function loadHistory() {
    setHistory(null);
    try {
      const r = await apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}`);
      setHistory(r.diagnoses ?? []);
    } catch {
      setHistory([]);
    }
  }

  function goHistory() {
    setStep(4);
    setCompareSel([]);
    setCompareMode(false);
    loadHistory();
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const dataUrl = await resizeImage(f);
      setImage(dataUrl);
      // Transparence « petite data » : montrer le poids réel envoyé (compressé côté client)
      const origKo = Math.round(f.size / 1024);
      const sentKo = Math.max(1, Math.round((dataUrl.length * 0.75) / 1024)); // base64 ≈ 4/3
      if (origKo > 250 && origKo > sentKo * 2) {
        toast.success(`Photo compressée : ${origKo.toLocaleString("fr-FR")} Ko → ${sentKo.toLocaleString("fr-FR")} Ko — léger pour ta connexion`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Photo illisible");
    }
  }

  async function useDemoPhoto() {
    const demo = zone === "mains" ? "demo-mains-1" : zone === "dos" ? "demo-dos-1" : zone === "naevi" ? "demo-visage-2" : "demo-visage-1";
    try {
      const blob = await (await fetch(`/skin/${demo}.webp`)).blob();
      const file = new File([blob], `${demo}.webp`, { type: "image/webp" });
      await onFile(file);
      toast.success("Photo démo chargée");
    } catch {
      toast.error("Photo démo indisponible");
    }
  }

  async function launch() {
    if (!image) return;
    setStep(2);
    setAnalyzing(true);
    setProgress(0);
    setCheckedSteps(0);
    const t0 = Date.now();
    const timer = setInterval(() => {
      setProgress((p) => Math.min(96, p + Math.random() * 7 + 2));
    }, 420);
    const steps = setInterval(() => {
      setCheckedSteps((c) => Math.min(ANALYSIS_STEPS.length, c + 1));
    }, 1150);

    try {
      const r = await apiPost<{ diagnosis: ApiDiagnosis }>("/api/diagnoses", {
        userId: user.id,
        zone,
        image,
        fitzpatrick: user.fitzpatrick ?? undefined,
        allergies: user.allergies ?? undefined,
      });
      const result = parseDiagnosis(r.diagnosis.resultJson);
      if (!result) throw new Error("Résultat IA illisible");
      // garantir une durée d'animation minimale (~3.4 s)
      const wait = Math.max(0, 3400 - (Date.now() - t0));
      setTimeout(() => {
        setProgress(100);
        setCheckedSteps(ANALYSIS_STEPS.length);
        setTimeout(() => {
          setDiag({ id: r.diagnosis.id, result, imageData: image, createdAt: r.diagnosis.createdAt });
          setAnalyzing(false);
          setStep(3);
          clearInterval(timer);
          clearInterval(steps);
        }, 450);
      }, wait);
    } catch (e) {
      clearInterval(timer);
      clearInterval(steps);
      setAnalyzing(false);
      toast.error(e instanceof Error ? e.message : "Analyse impossible");
      setStep(1);
    }
  }

  /* ─────────── Étape 0 — Choix de zone ─────────── */
  if (step === 0) {
    return (
      <div className="pt-4">
        <button onClick={() => setClientTab("accueil")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 focus-visible:outline-2 focus-visible:outline-primary rounded" aria-label="Retour accueil">
          <ArrowLeft size={15} /> Accueil
        </button>
        <h1 className="font-heading font-black text-xl">Quelle zone analysons-nous ?</h1>
        <p className="text-xs text-muted-foreground mt-1 mb-5">Chaque zone est pondérée dans ton score global (PRD §8.8).</p>
        <div className="grid grid-cols-2 gap-3">
          {BODY_ZONES.map((z) => {
            const Icon = ZONE_ICONS[z.id];
            return (
              <motion.button
                key={z.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => { setZone(z.id); setStep(1); setImage(""); setDiag(null); }}
                className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:border-primary/50 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="flex items-start justify-between">
                  <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
                    <Icon size={20} />
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold">{Math.round(z.weight * 100)} %</span>
                </div>
                <p className="font-heading font-bold text-sm mt-3">{z.label}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-2">{z.hint}</p>
              </motion.button>
            );
          })}
        </div>
        <button onClick={goHistory} className="mt-5 w-full h-11 rounded-xl border border-border bg-card text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
          <History size={16} className="text-primary" /> Voir mon historique
        </button>
      </div>
    );
  }

  /* ─────────── Étape 1 — Capture ─────────── */
  if (step === 1) {
    const zoneDef = BODY_ZONES.find((z) => z.id === zone)!;
    return (
      <div className="pt-4">
        <button onClick={() => setStep(0)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 focus-visible:outline-2 focus-visible:outline-primary rounded" aria-label="Retour">
          <ArrowLeft size={15} /> Changer de zone
        </button>
        <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide">{zoneDef.label} · {Math.round(zoneDef.weight * 100)} %</span>
        <h1 className="font-heading font-black text-xl mt-3">Prends ta photo</h1>

        <ul className="mt-4 space-y-2">
          {[
            "Lumière naturelle de préférence, sans ombre directe",
            "Distance ~30 cm, cadre serré sur la zone",
            "Cheveux dégagés, visage net (pas de maquillage)",
          ].map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 grid place-items-center h-4 w-4 rounded-full bg-primary/15 text-primary font-mono text-[9px] font-bold shrink-0">{i + 1}</span>
              {t}
            </li>
          ))}
        </ul>

        <div className="mt-5">
          {image ? (
            <div className="relative rounded-3xl overflow-hidden border-2 border-primary/40 shadow-lg">
              <img src={image} alt={`Aperçu zone ${zoneDef.label}`} className="aspect-square w-full object-cover" />
              <button onClick={() => setImage("")} className="absolute top-2 right-2 h-9 w-9 grid place-items-center rounded-full bg-[#1A1410]/70 text-white backdrop-blur active:scale-90 transition-transform" aria-label="Retirer la photo">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-square rounded-3xl border-2 border-dashed border-primary/40 bg-primary/5 grid place-items-center gap-3 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="flex flex-col items-center gap-3 text-primary">
                <Camera size={44} />
                <span className="text-sm font-semibold">Ouvrir l&apos;appareil photo</span>
                <span className="text-[11px] text-muted-foreground font-normal text-center px-6">{zoneDef.hint}</span>
              </span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Photo de la zone" />
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={useDemoPhoto} className="h-11 flex-1 rounded-xl border border-border bg-card text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
            <ImagePlus size={15} className="text-primary" /> Photo démo
          </button>
          {image && (
            <button onClick={() => fileRef.current?.click()} className="h-11 px-4 rounded-xl border border-border bg-card text-xs font-semibold flex items-center gap-1.5 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
              <RotateCcw size={15} /> Reprendre
            </button>
          )}
        </div>

        <button
          onClick={launch}
          disabled={!image}
          className="mt-5 h-14 w-full rounded-2xl bg-primary text-primary-foreground font-heading font-black text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <NeaOnnimIcon size={22} /> Lancer l&apos;analyse IA
        </button>
      </div>
    );
  }

  /* ─────────── Étape 2 — Analyse en cours ─────────── */
  if (step === 2 && analyzing) {
    return (
      <div className="pt-6 flex flex-col items-center">
        <div className="relative w-full max-w-[320px] rounded-3xl overflow-hidden border border-border shadow-xl">
          <img src={image} alt="Photo en cours d'analyse" className="aspect-square w-full object-cover" />
          <motion.div
            className="absolute left-0 right-0 h-16 bg-gradient-to-b from-transparent via-[#C8951E]/50 to-transparent border-y-2 border-[#C8951E]"
            animate={{ top: ["8%", "78%", "8%"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden="true"
          />
        </div>
        <div className="w-full max-w-[320px] mt-6 space-y-3">
          {ANALYSIS_STEPS.map((label, i) => {
            const done = i < checkedSteps;
            const active = i === checkedSteps;
            return (
              <div key={i} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${done ? "border-[#3F7D3F]/40 bg-[#3F7D3F]/5" : active ? "border-primary/50 bg-primary/5" : "border-border bg-card opacity-50"}`}>
                <span className={`grid place-items-center h-6 w-6 rounded-full shrink-0 ${done ? "bg-[#3F7D3F] text-white" : active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : <span className="font-mono text-[10px] font-bold">{i + 1}</span>}
                </span>
                <span className={`text-xs ${done ? "text-[#3F7D3F] font-semibold" : "text-muted-foreground"}`}>{label}</span>
              </div>
            );
          })}
        </div>
        <div className="w-full max-w-[320px] mt-5">
          <Progress value={progress} className="h-2" aria-label="Progression de l'analyse" />
          <p className="text-center text-[11px] text-muted-foreground mt-2">Vision par ordinateur spécialisée mélanoderme — 5 à 30 s</p>
        </div>
      </div>
    );
  }

  /* ─────────── Étape 4 — Historique ─────────── */
  if (step === 4) return <HistoryView userId={user.id} history={history} compareMode={compareMode} setCompareMode={setCompareMode} compareSel={compareSel} setCompareSel={setCompareSel} onBack={() => setStep(0)} onOpen={(d) => { const r = parseDiagnosis(d.resultJson); if (r) { setDiag({ id: d.id, result: r, imageData: diagImgSrc(d.imageData), createdAt: d.createdAt }); setStep(3); } }} />;

  /* ─────────── Étape 3 — Résultats ─────────── */
  if (step === 3 && diag) {
    return <ResultView diag={diag} products={products} onNewZone={() => { setStep(0); setImage(""); setDiag(null); }} onHistory={goHistory} />;
  }

  return null;
}

/* ══════════════ Résultat VISIA-like ══════════════ */
function ResultView({ diag, products, onNewZone, onHistory }: { diag: { id: string; result: DiagnosisResult; imageData: string; createdAt: string }; products: ApiProduct[]; onNewZone: () => void; onHistory: () => void }) {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);
  const addToCart = useKene((s) => s.addToCart);
  const [view, setView] = useState<string>("standard");
  const [ritualOpen, setRitualOpen] = useState(false);
  const [glossary, setGlossary] = useState<GlossaryEntry | null>(null);
  const r = diag.result;
  const weakest = useMemo(() => [...r.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage).slice(0, 8), [r.indicateurs]);
  const viewDef = SPECTRAL_VIEWS.find((v) => v.id === view) ?? SPECTRAL_VIEWS[0];
  const heatmapCls = view === "pigment" ? "heatmap-pigment" : view === "inflammation" ? "heatmap-inflammation" : view === "acne" ? "heatmap-acne" : "";

  const botanicIcon = (name: string): React.ReactNode => {
    const n = norm(name);
    if (n.includes("moringa")) return <MoringaIcon size={13} />;
    if (n.includes("karite")) return <KariteIcon size={13} />;
    if (n.includes("baobab")) return <BaobabIcon size={13} />;
    return <Sparkles size={13} />;
  };

  function askGlossary(term: string) {
    const entry = glossaryFor(term);
    if (entry) setGlossary(entry);
  }

  return (
    <div className="pt-4 pb-2">
      {/* Header score */}
      <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="kente-band h-1.5 w-full" aria-hidden="true" />
        <div className="p-5 flex items-center gap-4">
          <ScoreGauge score={r.score_global} label="Zone" size={110} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-black text-lg">{BODY_ZONES.find((z) => z.id === r.zone)?.label ?? r.zone}</h1>
              {r.fitzpatrick_estime && <span className="rounded-full bg-melanine text-[#F8F1E4] px-2 py-0.5 text-[10px] font-bold">Fitz {r.fitzpatrick_estime}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{formatDate(diag.createdAt)} · {r.source === "vlm" ? "Analyse VLM" : "Analyse heuristique"} · {r.indicateurs.length} indicateurs</p>
            <div className="flex gap-1.5 mt-2">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: scoreColor(r.score_global), color: readableTextColor(scoreColor(r.score_global)) }}>
                {r.score_global >= 80 ? "Excellente santé" : r.score_global >= 60 ? "Bon équilibre" : r.score_global >= 40 ? "Points à surveiller" : "Besoin de soin"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lecture vocale — accès non-lectrices & confort audio (TTS) */}
      <VoiceNarration result={r} userName={user.name} />

      {/* Alerte orientation dermato */}
      {r.orientation_dermato && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl border-2 border-[#8B1A3B]/60 bg-[#8B1A3B]/5 p-4" role="alert">
          <p className="flex items-center gap-2 font-heading font-bold text-sm text-[#8B1A3B]">
            <TriangleAlert size={17} /> Consultation dermatologique conseillée
          </p>
          <p className="text-xs mt-1.5 leading-relaxed">{r.raison_orientation ?? "Une lésion présente des signes justifiant un avis médical."}</p>
          {r.abcde && r.abcde.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-3">
              {r.abcde.map((a) => (
                <span key={a.critere} className={`rounded-full px-2.5 py-1 text-[10px] font-bold border ${a.alerte ? "bg-[#8B1A3B] text-white border-[#8B1A3B]" : "border-[#3F7D3F]/50 text-[#3F7D3F] bg-[#3F7D3F]/10"}`}>
                  {a.critere} · {a.intitule}
                </span>
              ))}
            </div>
          )}
          <button onClick={() => setClientTab("rdv")} className="mt-3 h-11 w-full rounded-xl bg-[#8B1A3B] text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-[#8B1A3B]">
            <CalendarPlus size={16} /> Prendre RDV avec un institut partenaire
          </button>
        </motion.div>
      )}

      {/* Jumeau de Peau — Skin Twin 3D + Fil du Temps (projection S+12) */}
      <SkinTwinCard
        projection
        entries={[
          {
            id: diag.id,
            zone: r.zone,
            score: r.score_global,
            fitz: r.fitzpatrick_estime,
            marks: r.zones_marquages,
            date: diag.createdAt,
            indicators: r.indicateurs,
          },
        ]}
      />

      {/* Tabs spectraux */}
      <section aria-label="Vues spectrales de la photo" className="mt-5">
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="w-full h-auto grid grid-cols-4 gap-1 bg-muted/60 p-1 rounded-2xl">
            {SPECTRAL_VIEWS.map((v) => (
              <TabsTrigger key={v.id} value={v.id} className="text-[10.5px] leading-tight px-1 py-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary font-semibold">
                {v.label.split(" ")[0]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-[11px] text-muted-foreground mt-2 mb-2">{viewDef.label}{view !== "standard" ? " — filtre spectral + cartographie chaleur" : ""}</p>
        <div className="relative rounded-3xl overflow-hidden border border-border shadow-lg">
          <img src={diag.imageData} alt={`Vue ${viewDef.label} de la zone analysée`} className={`aspect-square w-full object-cover ${view !== "standard" ? viewDef.filter : ""}`} />
          {heatmapCls && <div aria-hidden="true" className={`absolute inset-0 ${heatmapCls} opacity-60 mix-blend-screen pointer-events-none`} />}
          {/* cadres zones détectées */}
          {r.zones_marquages.map((z, i) => (
            <div key={i} className="absolute border-2 border-dashed border-[#FFF9EC]/90 rounded-lg pointer-events-none" style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}>
              <span className="absolute -top-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#FFF9EC]" style={{ backgroundColor: ["#3F7D3F", "#C8951E", "#E07A2B", "#8B1A3B"][Math.min(3, Math.max(0, z.severite))] }} aria-hidden="true" />
              <span className="absolute -bottom-5 left-0 whitespace-nowrap rounded-full bg-[#1A1410]/85 text-[#F8F1E4] px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur-sm">{z.label}</span>
            </div>
          ))}
          <div className="absolute bottom-2 right-2 flex gap-1">
            {SEVERITY_STYLES.map((s, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full bg-[#1A1410]/70 backdrop-blur px-1.5 py-0.5 text-[8px] text-[#F8F1E4]">
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Indicateurs les plus faibles */}
      <section aria-labelledby="ind-t" className="mt-6">
        <h2 id="ind-t" className="font-heading font-bold text-base mb-3">Priorités de soin</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {weakest.map((ind) => (
            <IndicatorBar key={ind.nom} ind={ind} onAsk={askGlossary} />
          ))}
        </div>
        {r.indicateurs.length > 8 && (
          <Accordion type="single" collapsible className="mt-3">
            <AccordionItem value="all" className="border-border">
              <AccordionTrigger className="text-xs font-semibold py-3">Les {r.indicateurs.length} indicateurs détaillés</AccordionTrigger>
              <AccordionContent className="space-y-2.5 pb-2">
                {r.indicateurs.map((ind) => (
                  <div key={ind.nom}>
                    <IndicatorBar ind={ind} onAsk={askGlossary} />
                    {ind.note && <p className="text-[10.5px] text-muted-foreground mt-1 leading-snug">{ind.note}</p>}
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </section>

      {/* Recommandations */}
      <section aria-labelledby="reco-t" className="mt-6">
        <h2 id="reco-t" className="font-heading font-bold text-base mb-3">Ta routine personnalisée</h2>

        {/* Route de l'Or — parcours narratif */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setRitualOpen(true)}
          className="relative w-full rounded-3xl bg-gradient-to-br from-[#C8951E] via-[#A0522D] to-[#8B1A3B] text-[#FFF9EC] shadow-lg overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Ouvrir la Route de l'Or — tisser ma routine en 4 stations"
        >
          <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-25" />
          <div aria-hidden="true" className="h-1.5 w-full" style={{ backgroundImage: "repeating-linear-gradient(90deg,#8B1A3B 0 12px,#3F7D3F 12px 20px,#C8951E 20px 28px,#E07A2B 28px 36px,#A0522D 36px 46px)" }} />
          <div className="relative flex items-center gap-3 px-4 py-3.5">
            <span className="grid place-items-center h-12 w-12 rounded-2xl bg-[#FFF9EC]/15 backdrop-blur border border-[#FFF9EC]/30 shrink-0">
              <NeaOnnimIcon size={26} />
            </span>
            <span className="text-left min-w-0">
              <span className="block font-heading font-black text-base leading-tight">La Route de l&apos;Or</span>
              <span className="block text-[11px] opacity-90">Tisse ta routine en 4 stations — ton kente de soin à la fin</span>
            </span>
            <ChevronRight size={20} className="ml-auto opacity-80 shrink-0" />
          </div>
        </motion.button>

        <div className="rounded-2xl border-2 border-primary/50 bg-primary/5 p-4 mt-4">
          <p className="text-xs leading-relaxed">{r.recommandations.resume}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-2xl border border-border bg-card p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#C8951E] uppercase tracking-wide"><Sunrise size={13} /> Matin</p>
            <ul className="mt-2 space-y-1.5">
              {r.recommandations.routine_matin.slice(0, 4).map((s, i) => (
                <li key={i} className="text-[11px] leading-snug flex gap-1.5"><span className="text-primary font-mono">{i + 1}.</span> {s}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#5C3A21] uppercase tracking-wide"><Moon size={13} /> Soir</p>
            <ul className="mt-2 space-y-1.5">
              {r.recommandations.routine_soir.slice(0, 4).map((s, i) => (
                <li key={i} className="text-[11px] leading-snug flex gap-1.5"><span className="text-terre font-mono">{i + 1}.</span> {s}</li>
              ))}
            </ul>
          </div>
        </div>

        {r.recommandations.botaniques_conseillees.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">Botaniques africaines pour toi</p>
            <div className="flex flex-wrap gap-2">
              {r.recommandations.botaniques_conseillees.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-karite border border-[#C8951E]/30 px-3 py-1.5 text-[11px] font-semibold text-terre">
                  {botanicIcon(b)} {b}
                </span>
              ))}
            </div>
          </div>
        )}

        {r.recommandations.produits.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">Produits recommandés</p>
            {r.recommandations.produits.map((rec, i) => {
              const p = matchProduct(rec, products);
              return (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
                  {p ? (
                    <img src={p.image} alt={p.name} loading="lazy" className="h-12 w-12 rounded-xl object-cover shrink-0" />
                  ) : (
                    <span className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><Sparkles size={18} /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-tight">{rec}</p>
                    {p && <p className="font-mono text-[11px] text-primary font-bold mt-0.5">{xof(p.price)}</p>}
                  </div>
                  {p ? (
                    <button
                      onClick={() => { addToCart({ productId: p.id, name: p.name, price: p.price, qty: 1, image: p.image }); toast.success(`${p.name} ajouté au panier`); }}
                      className="h-9 px-3 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-transform shrink-0 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Plus size={13} /> Panier
                    </button>
                  ) : (
                    <button onClick={() => setClientTab("boutique")} className="h-9 px-3 rounded-full border border-primary/50 text-primary text-[11px] font-bold shrink-0 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary">
                      Boutique
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {r.recommandations.soins_conseilles.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">Soins en institut</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {r.recommandations.soins_conseilles.map((s, i) => (
                <button key={i} onClick={() => setClientTab("rdv")} className="shrink-0 rounded-full border border-[#3F7D3F]/50 bg-[#3F7D3F]/10 px-3.5 py-2 text-[11px] font-semibold text-[#3F7D3D] flex items-center gap-1 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-[#3F7D3D]">
                  <CalendarPlus size={13} /> {s} · Réserver
                </button>
              ))}
            </div>
          </div>
        )}

        {r.recommandations.conseils_hygiene_vie.length > 0 && (
          <div className="mt-4 rounded-2xl bg-muted/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Hygiène de vie</p>
            <ul className="space-y-1.5">
              {r.recommandations.conseils_hygiene_vie.map((c, i) => (
                <li key={i} className="text-[11px] leading-snug flex gap-2">
                  <Check size={12} className="text-[#3F7D3F] mt-0.5 shrink-0" /> {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <p className="mt-5 rounded-xl bg-muted/70 p-3 text-[10px] leading-relaxed text-muted-foreground">{r.avertissement} Kènè est un outil d&apos;éducation beauté assisté par IA — les estimations ne constituent pas un diagnostic médical.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 pb-2">
        <button onClick={onNewZone} className="h-12 rounded-xl border border-primary/60 text-primary text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
          <ScanFace size={16} /> Nouvelle zone
        </button>
        <button onClick={onHistory} className="h-12 rounded-xl border border-border bg-card text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
          <History size={16} /> Historique
        </button>
      </div>

      {ritualOpen && (
        <RitualJourney
          diag={{ id: diag.id, result: diag.result, createdAt: diag.createdAt }}
          products={products}
          userName={user.name}
          onClose={() => setRitualOpen(false)}
        />
      )}

      {/* Glossaire 1 tap — « ? » sur un indicateur ouvre sa définition simple */}
      <GlossaryDialog entry={glossary} onClose={() => setGlossary(null)} />
    </div>
  );
}

function IndicatorBar({ ind, onAsk }: { ind: Indicator; onAsk?: (term: string) => void }) {
  // Garde double : severite absente (anciens resultJson) → NaN index → 0 ;
  // index hors bornes → clamp 0..3 ; SEVERITY_STYLES[i] résolu UNE fois.
  const sevIdx = Number.isFinite(ind.severite) ? Math.min(3, Math.max(0, Math.trunc(ind.severite))) : 0;
  const sev = SEVERITY_STYLES[sevIdx] ?? SEVERITY_STYLES[0];
  const explainable = onAsk && glossaryFor(ind.nom) !== null;
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="flex items-start justify-between gap-1">
        {explainable ? (
          <button
            onClick={() => onAsk?.(ind.nom)}
            aria-label={`Expliquer le mot : ${ind.nom}`}
            className="min-w-0 text-left flex items-start gap-1 rounded-md focus-visible:outline-2 focus-visible:outline-primary transition-colors hover:text-primary"
          >
            <p className="text-[11px] font-semibold leading-tight line-clamp-2">{ind.nom}</p>
            <CircleHelp size={13} className="text-primary shrink-0 mt-px" aria-hidden="true" />
          </button>
        ) : (
          <p className="text-[11px] font-semibold leading-tight line-clamp-2">{ind.nom}</p>
        )}
        <span className={`font-mono text-[11px] font-bold shrink-0 ${sev.text}`}>
          {ind.pourcentage}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, ind.pourcentage))}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${sev.dot}`} />
      </div>
    </div>
  );
}

/* ══════════════ Historique + comparaison ══════════════ */
function HistoryView({
  userId, history, compareMode, setCompareMode, compareSel, setCompareSel, onBack, onOpen,
}: {
  userId: string;
  history: ApiDiagnosis[] | null;
  compareMode: boolean;
  setCompareMode: (v: boolean) => void;
  compareSel: string[];
  setCompareSel: (v: string[]) => void;
  onBack: () => void;
  onOpen: (d: ApiDiagnosis) => void;
}) {
  const list = useMemo(
    () => [...(history ?? [])].filter((d) => d.status === "done").sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [history]
  );
  const sameZoneSel = compareSel.length === 2 && list.find((d) => d.id === compareSel[0])?.zone === list.find((d) => d.id === compareSel[1])?.zone;
  const a = list.find((d) => d.id === compareSel[0]);
  const b = list.find((d) => d.id === compareSel[1]);
  const ra = a ? parseDiagnosis(a.resultJson) : null;
  const rb = b ? parseDiagnosis(b.resultJson) : null;

  const evolutions =
    ra && rb
      ? rb.indicateurs
          .map((ib) => {
            const ia = ra.indicateurs.find((x) => x.nom === ib.nom);
            return ia ? { nom: ib.nom, delta: ib.pourcentage - ia.pourcentage } : null;
          })
          .filter((x): x is { nom: string; delta: number } => x !== null)
          .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
          .slice(0, 3)
      : [];

  return (
    <div className="pt-4 pb-2">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 focus-visible:outline-2 focus-visible:outline-primary rounded" aria-label="Retour">
        <ArrowLeft size={15} /> Nouveau diagnostic
      </button>
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading font-black text-xl">Mon historique</h1>
        <button
          onClick={() => { setCompareMode(!compareMode); setCompareSel([]); }}
          aria-pressed={compareMode}
          className={`h-9 px-3 rounded-full text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary ${compareMode ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
        >
          <GitCompareArrows size={14} /> Comparer
        </button>
      </div>

      {history === null ? (
        <div className="space-y-3 mt-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
          <NeaOnnimIcon size={38} className="mx-auto text-primary" />
          <p className="font-heading font-bold text-sm mt-3">Aucun diagnostic pour l&apos;instant</p>
          <p className="text-xs text-muted-foreground mt-1">Ton premier scan débloquera le suivi d&apos;évolution.</p>
        </div>
      ) : (
        <>
          {/* Le Fil du Temps — courbes d'évolution */}
          <EvolutionCard userId={userId} className="mt-4" />

          <div className="space-y-2.5 mt-4">
            {list.map((d) => {
              const sel = compareSel.includes(d.id);
              return (
                <div key={d.id} className={`flex items-center gap-3 rounded-2xl border p-2.5 transition-colors ${sel ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <button
                    onClick={() => {
                      if (compareMode) {
                        setCompareSel(sel ? compareSel.filter((x) => x !== d.id) : compareSel.length < 2 ? [...compareSel, d.id] : [compareSel[1], d.id]);
                      } else onOpen(d);
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline-2 focus-visible:outline-primary rounded-xl"
                    aria-label={`Diagnostic ${d.zone} du ${formatDate(d.createdAt)}, score ${d.scoreGlobal}`}
                  >
                    <img src={diagImgSrc(d.imageData)} alt={`Diagnostic ${d.zone}`} loading="lazy" className="h-14 w-14 rounded-xl object-cover shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{BODY_ZONES.find((z) => z.id === d.zone)?.label ?? d.zone}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(d.createdAt)}</p>
                    </div>
                    <div className="ml-auto"><ScoreChip score={d.scoreGlobal} /></div>
                  </button>
                  {compareMode && (
                    <button
                      onClick={() => setCompareSel(sel ? compareSel.filter((x) => x !== d.id) : compareSel.length < 2 ? [...compareSel, d.id] : [compareSel[1], d.id])}
                      aria-pressed={sel}
                      aria-label="Sélectionner pour comparaison"
                      className={`h-8 w-8 grid place-items-center rounded-full border-2 shrink-0 transition-colors ${sel ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}
                    >
                      {sel && <Check size={14} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {compareMode && (
            <AnimatePresence>
              {compareSel.length === 2 && sameZoneSel && ra && rb && a && b ? (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-5 overflow-hidden">
                  <div className="rounded-3xl border border-primary/40 bg-card p-4 shadow-md">
                    <p className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                      <GitCompareArrows size={15} className="text-primary" /> Avant / Après — {BODY_ZONES.find((z) => z.id === a.zone)?.label}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ d: a, r: ra, tag: "Avant" }, { d: b, r: rb, tag: "Après" }].map(({ d, r, tag }) => (
                        <div key={tag}>
                          <img src={diagImgSrc(d.imageData)} alt={`${tag} — ${d.zone}`} loading="lazy" className="aspect-square w-full rounded-2xl object-cover border border-border" />
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">{tag} · {formatDate(d.createdAt, { day: "numeric", month: "short" })}</span>
                            <ScoreChip score={r.score_global} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl bg-muted/60 p-3 flex items-center justify-between">
                      <span className="text-xs font-semibold">Évolution du score</span>
                      <span className="font-mono text-lg font-black" style={{ color: rb.score_global >= ra.score_global ? "#3F7D3F" : "#8B1A3B" }}>
                        {rb.score_global >= ra.score_global ? "+" : ""}{rb.score_global - ra.score_global} pts
                      </span>
                    </div>
                    {evolutions.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {evolutions.map((e) => (
                          <div key={e.nom} className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">{e.nom}</span>
                            <span className="font-mono font-bold" style={{ color: e.delta >= 0 ? "#3F7D3F" : "#8B1A3B" }}>
                              {e.delta >= 0 ? "+" : ""}{e.delta} %
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <p className="mt-4 text-center text-[11px] text-muted-foreground">Sélectionne 2 diagnostics de la même zone pour comparer l&apos;évolution.</p>
              )}
            </AnimatePresence>
          )}
        </>
      )}
      <div className="h-2" />
    </div>
  );
}
