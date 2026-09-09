"use client";
// Kènè Cliente — Diagnostic IA : wizard zone → capture → analyse → résultats VISIA-like → historique — ÉCLAT 2026
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Brush, CalendarPlus, Camera, Check, ChevronRight, CircleHelp, Cross, GitCompareArrows, Hand, History,
  ImagePlus, Layers, Loader2, Moon, PersonStanding, Plus, RotateCcw, ScanFace, Sparkles, Sunrise, TriangleAlert, WifiOff, X,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPost, resizeImage } from "@/lib/kene/api";
import { formatDate, scoreColor, readableTextColor, xof, SEVERITY_STYLES } from "@/lib/kene/format";
import { BODY_ZONES, SPECTRAL_VIEWS, type BodyZone, type DiagnosisResult, type Indicator } from "@/lib/kene/types";
import { BaobabIcon, KariteIcon, MoringaIcon, NeaOnnimIcon } from "@/components/kene/icons";
import { AdinkraSky } from "@/components/kene/constellation/AdinkraSky";
import { diagQueueCount, enqueueDiag, subscribeDiagQueue } from "@/lib/kene/diag-queue";
import { HAPTIC, haptic, isOnline } from "@/lib/kene/ux";
import { SkinTwinCard } from "@/components/kene/skintwin/SkinTwinCard";
import { SkinDescent } from "@/components/kene/descent/SkinDescent";
import { EvolutionCard } from "@/components/kene/evolution/EvolutionCard";
import { VoiceNarration } from "./VoiceNarration";
import { PictoSummary } from "./PictoSummary";
import { GlossaryDialog } from "./GlossaryDialog";
import { glossaryFor, type GlossaryEntry } from "@/lib/kene/glossary";
import { matchProduct, norm } from "@/components/kene/route/ritual";
import { RitualJourney } from "@/components/kene/route/RitualJourney";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKene } from "@/store/kene";
import { Chip, GlassCard, IconBadge, PrimaryCTA, ProgressBar, Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import type { ApiDiagnosis, ApiProduct } from "./types";
import { diagImgSrc, parseDiagnosis } from "./types";
import { EmptyBlock, ScoreChip, ScoreGauge } from "./bits";

const ZONE_ICONS: Record<BodyZone, React.ComponentType<{ size?: number; className?: string }>> = {
  visage: ScanFace,
  dos: PersonStanding,
  cuir_chevelu: Sparkles,
  mains: Hand,
  barbe: Brush,
  naevi: Cross,
};

// ÉCLAT 2026 — badges teintés alternés (or / terre / bissap / vert baobab) pour
// donner de la vie à la grille des zones.
const ZONE_TONES: Record<BodyZone, "gold" | "terre" | "bissap" | "success"> = {
  visage: "gold",
  dos: "terre",
  cuir_chevelu: "bissap",
  mains: "success",
  barbe: "gold",
  naevi: "terre",
};

// Pipeline asynchrone (t. 71) — 3 étapes honnêtes : le POST est immédiat
// (202), l'analyse VLM tourne côté serveur, le protocole se constitue à la fin.
const ANALYSIS_STEPS = [
  "Envoi de la photo",
  "Analyse IA en cours…",
  "Constitution du protocole",
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
  // File d'attente offline (t. 83-f) : compteur vivant — la REPLAY vit dans
  // ClientApp (elle marche quel que soit l'écran courant), ici on AFFICHE.
  const [queuedCount, setQueuedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Résilience 502 (t. 66-b) : message discret sous la barre de progression
  // pendant un retry / une récupération (annoncé aux lecteurs d'écran).
  const [netNotice, setNetNotice] = useState<string | null>(null);
  // Quota gratuit atteint (t. 71-e) : le POST a répondu 403 (quotaExceeded) —
  // on affiche la carte upsell Kènè+ sur l'écran de capture au lieu d'un
  // simple échec : le monetization est un parcours, pas un mur.
  const [quotaUpsell, setQuotaUpsell] = useState(false);
  // Filet de sécurité : AUCUN interval/timeout de launch()/trackDiagnosis()
  // ne survit au démontage (changement d'onglet pendant une analyse — les
  // setState deviendraient des no-ops mais on rend les minuteurs morts de
  // façon déterministe, quel que soit le chemin pris).
  const timersRef = useRef<{
    timer?: ReturnType<typeof setInterval>;
    poll?: ReturnType<typeof setInterval>;
    timeouts: ReturnType<typeof setTimeout>[];
  }>({ timeouts: [] });
  // Génération du suivi courant : chaque clearTimers() invalide les
  // continuations async encore en vol (fetch de poll résolvant après un
  // échec/relance → elles ne peuvent plus écraser l'état courant).
  const trackGenRef = useRef(0);
  // Une analyse a été lancée depuis CE montage → la reprise automatique au
  // boot ne doit jamais la doubler.
  const launchedRef = useRef(false);

  const clearTimers = useCallback(() => {
    const t = timersRef.current;
    if (t.timer) { clearInterval(t.timer); t.timer = undefined; }
    if (t.poll) { clearInterval(t.poll); t.poll = undefined; }
    t.timeouts.forEach(clearTimeout);
    t.timeouts = [];
    trackGenRef.current += 1;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const [products, setProducts] = useState<ApiProduct[]>([]);
  // Fin des échecs silencieux : produits indisponibles → encart discret +
  // Réessayer sur la section recommandations (plus de section muette).
  const [productsError, setProductsError] = useState(false);
  const [history, setHistory] = useState<ApiDiagnosis[] | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSel, setCompareSel] = useState<string[]>([]);

  // File d'attente offline (t. 83-f) : compteur vivant — la REPLAY vit dans
  // ClientApp (elle marche quel que soit l'écran courant), ici on AFFICHE.
  useEffect(() => {
    const update = () => setQueuedCount(diagQueueCount());
    update();
    return subscribeDiagQueue(update);
  }, []);

  // Haptique du rituel (t. 83-f) : chaque étape franchie vibre doucement, la
  // constellation complète sonne la réussite (no-op silencieux sur iOS).
  const prevCheckedRef = useRef(0);
  useEffect(() => {
    if (checkedSteps > prevCheckedRef.current) {
      haptic(checkedSteps >= ANALYSIS_STEPS.length ? HAPTIC.success : HAPTIC.light);
    }
    prevCheckedRef.current = checkedSteps;
  }, [checkedSteps]);

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

  // produits pour les recommandations — échec explicite + re-fetch possible
  const loadProducts = useCallback(() => {
    apiGet<{ products: ApiProduct[] }>("/api/shop/products")
      .then((r) => { setProducts(r.products ?? []); setProductsError(false); })
      .catch(() => setProductsError(true));
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

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

  // ── Pipeline asynchrone (t. 71) ──────────────────────────────────────
  // Le POST répond 202 en < 1 s avec { diagnosis: status "pending" } ; le
  // VLM tourne dans un worker côté serveur ; on suit la ligne ici (poll).

  // Résultat acquis (poll du worker, back synchrone ou récupération 66-b) :
  // même animation de fin, durée minimale ~3,4 s, minuteurs suivis et nettoyés
  // dans tous les cas.
  const showResult = useCallback(
    (
      d: { id: string; result: DiagnosisResult; imageData: string; createdAt: string },
      t0: number,
      recovered = false,
    ) => {
      const wait = Math.max(0, 3400 - (Date.now() - t0));
      const to1 = setTimeout(() => {
        setProgress(100);
        setCheckedSteps(ANALYSIS_STEPS.length);
        const to2 = setTimeout(() => {
          setDiag(d);
          setAnalyzing(false);
          setNetNotice(null);
          setStep(3);
          haptic(HAPTIC.success); // le rituel s'achève (no-op iOS)
          clearTimers();
          if (recovered) {
            toast.success("Analyse retrouvée — voici tes résultats", {
              description: "Le réseau a été instable une seconde, mais ton diagnostic était bien enregistré.",
            });
          }
        }, 450);
        timersRef.current.timeouts.push(to2);
      }, wait);
      timersRef.current.timeouts.push(to1);
    },
    [clearTimers],
  );

  // Suivi d'un diagnostic serveur : progression honnête pilotée par le temps
  // écoulé (le serveur n'expose pas d'avancement réel) + poll
  // GET /api/diagnoses/{id} toutes les 1,8 s. Timeout global 100 s → échec
  // honnête + Réessayer (retour capture, photo conservée — comportement 66-b).
  // Échec réseau d'un tick → on continue de poller (garde-fou : timeout).
  const trackDiagnosis = useCallback(
    (diagId: string, opts: { recovered?: boolean; startedAt?: number } = {}) => {
      clearTimers(); // filet : aucun reliquat d'un suivi précédent
      const gen = trackGenRef.current;
      const t0 = opts.startedAt ?? Date.now();
      const recovered = opts.recovered ?? false;
      if (recovered) setNetNotice("Récupération de ton analyse…");

      function stopIntervals() {
        if (timersRef.current.timer) { clearInterval(timersRef.current.timer); timersRef.current.timer = undefined; }
        if (timersRef.current.poll) { clearInterval(timersRef.current.poll); timersRef.current.poll = undefined; }
      }
      function failAnalysis(msg: string) {
        if (trackGenRef.current !== gen) return;
        stopIntervals();
        setAnalyzing(false);
        setNetNotice(null);
        toast.error(msg);
        setStep(1); // retour capture : la photo est conservée → Réessayer
      }

      // Progression : courbe exponentielle vers 96 % (jamais 100 avant la fin
      // réelle) — la reprise au montage repart de createdAt (startedAt).
      const timer = setInterval(() => {
        const elapsed = Date.now() - t0;
        setProgress(Math.min(96, Math.round(96 * (1 - Math.exp(-elapsed / 15000)))));
        setCheckedSteps(elapsed > 16000 ? 2 : 1);
      }, 420);
      timersRef.current.timer = timer;

      const check = (d: ApiDiagnosis | undefined | null) => {
        if (trackGenRef.current !== gen) return;
        if (!d) { failAnalysis("Diagnostic introuvable — retente dans un instant"); return; }
        if (d.status === "done") {
          const result = parseDiagnosis(d.resultJson);
          stopIntervals();
          if (!result) { failAnalysis("Résultat IA illisible — retente dans un instant"); return; }
          showResult({ id: d.id, result, imageData: diagImgSrc(d.imageData), createdAt: d.createdAt }, t0, recovered);
        } else if (d.status === "error") {
          failAnalysis("Moteur d'analyse momentanément injoignable — tes photos restent prêtes, retente dans un instant.");
        }
        // "pending" → on continue de poller (timeout global en garde-fou)
      };

      const POLL_MS = 1800;
      const TIMEOUT_MS = 100_000;
      let busy = false; // un fetch lent n'empile pas les ticks suivants
      const poll = setInterval(() => {
        if (Date.now() - t0 > TIMEOUT_MS) {
          failAnalysis("Ton analyse met plus de temps que prévu — ta photo reste prête, retente dans un instant.");
          return;
        }
        if (busy) return;
        busy = true;
        apiGet<{ diagnosis: ApiDiagnosis }>(`/api/diagnoses/${diagId}`)
          .then((r) => { busy = false; check(r.diagnosis); })
          .catch(() => { busy = false; /* réseau : le tick suivant réessaie */ });
      }, POLL_MS);
      timersRef.current.poll = poll;

      // Premier statut immédiat : si le worker a déjà fini (reprise au
      // montage), les résultats arrivent sans attendre le 1er tick.
      apiGet<{ diagnosis: ApiDiagnosis }>(`/api/diagnoses/${diagId}`)
        .then((r) => check(r.diagnosis))
        .catch(() => undefined);
    },
    [clearTimers, showResult],
  );

  // Récupération après échec réseau (66-b) : le diagnostic a très bien pu
  // être ENREGISTRÉ avant la coupure. Done récent (< 4 min) → résultats ;
  // pending → on reprend son suivi (poll du worker). Retourne true si pris
  // en charge.
  async function tryRecover(t0: number): Promise<boolean> {
    const RECENT_MS = 4 * 60 * 1000;
    const findRecent = (list: ApiDiagnosis[] | undefined): ApiDiagnosis | undefined =>
      (list ?? [])
        .filter(
          (d) =>
            d.zone === zone &&
            (d.status === "done" || d.status === "pending") &&
            Date.now() - new Date(d.createdAt).getTime() < RECENT_MS,
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    try {
      const found = findRecent((await apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}`)).diagnoses);
      if (!found) return false;
      if (found.status === "done") {
        const result = parseDiagnosis(found.resultJson);
        if (!result) return false;
        showResult(
          { id: found.id, result, imageData: diagImgSrc(found.imageData), createdAt: found.createdAt },
          t0,
          true,
        );
        return true;
      }
      // pending : le worker tourne encore côté serveur → on le suit.
      setZone(found.zone);
      setImage(diagImgSrc(found.imageData));
      trackDiagnosis(found.id, { recovered: true, startedAt: new Date(found.createdAt).getTime() });
      return true;
    } catch {
      // Le GET lui-même est injoignable (serveur toujours au redémarrage) :
      // échec final honnête, sans crash.
      return false;
    }
  }

  // Reprise automatique (t. 71) : au montage, si le DERNIER diagnostic de
  // l'historique est "pending" et récent (< 3 min), on reprend son suivi —
  // la cliente qui quitte et revient ne perd rien. Les setState vivent dans
  // la continuation async (pattern loadProducts — règle set-state-in-effect).
  const resumePending = useCallback(async () => {
    try {
      const r = await apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}`);
      if (launchedRef.current) return; // une analyse a démarré entre-temps
      const last = (r.diagnoses ?? [])[0]; // trié desc createdAt par l'API
      if (!last || last.status !== "pending") return;
      if (Date.now() - new Date(last.createdAt).getTime() > 3 * 60 * 1000) return;
      setZone(last.zone);
      setImage(diagImgSrc(last.imageData));
      setDiag(null);
      setStep(2);
      setAnalyzing(true);
      setProgress(8);
      setCheckedSteps(1);
      setNetNotice(null);
      trackDiagnosis(last.id, { startedAt: new Date(last.createdAt).getTime() });
    } catch {
      /* historique injoignable au montage : parcours normal, silencieux */
    }
  }, [user.id, trackDiagnosis]);

  useEffect(() => {
    resumePending();
  }, [resumePending]);

  async function launch() {
    if (!image) return;
    launchedRef.current = true;
    setStep(2);
    setAnalyzing(true);
    setProgress(0);
    setCheckedSteps(0);
    setNetNotice(null);
    setQuotaUpsell(false);
    const t0 = Date.now();
    // Hors-ligne dès le départ (t. 83-f) : la photo part en file d'attente —
    // envoyée toute seule au retour du réseau (la replay vit dans ClientApp,
    // elle prévient par toast). Jamais d'échec sec pour une photo déjà cadrée.
    if (!isOnline()) {
      const q = enqueueDiag({ userId: user.id, zone, image, fitzpatrick: user.fitzpatrick ?? undefined, allergies: user.allergies ?? undefined });
      haptic(HAPTIC.light);
      setAnalyzing(false);
      setStep(1); // la photo reste affichée : la cliente voit qu'elle est gardée
      toast.success("Diagnostic mis en attente", {
        description: q.ok
          ? "Ta photo partira toute seule dès que le réseau revient — tu peux même quitter l’app."
          : "File indisponible sur cet appareil — retente quand le réseau revient.",
      });
      return;
    }
    try {
      // POST /api/diagnoses : répond 202 en < 1 s avec la ligne "pending"
      // (pipeline asynchrone t. 71). 4 tentatives (t. 77 : 3 → 4, backoff
      // jusqu'à 8 s ≈ ~13,5 s de fenêtre) quand la gateway renvoie
      // 502/503/504 (recompilation/restart du serveur Next en dev) — backoff
      // 1,5 s → 4 s → 8 s. Les autres erreurs (400/404/429…) ne sont JAMAIS
      // rejouées ; chaque retry crée une NOUVELLE ligne côté serveur si le
      // POST a échoué AVANT d'atteindre l'app (échec réseau = rien reçu).
      let r: { diagnosis: ApiDiagnosis } | undefined;
      let fatal: unknown = new Error("Analyse impossible");
      const backoffs = [1500, 4000, 8000];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          r = await apiPost<{ diagnosis: ApiDiagnosis }>("/api/diagnoses", {
            userId: user.id,
            zone,
            image,
            fitzpatrick: user.fitzpatrick ?? undefined,
            allergies: user.allergies ?? undefined,
          });
          break;
        } catch (e) {
          fatal = e;
          const retryable = e instanceof ApiError && [502, 503, 504].includes(e.status);
          if (!retryable || attempt === 3) break;
          setNetNotice("Rétablissement de la connexion…");
          await new Promise((res) => setTimeout(res, backoffs[attempt]));
          setNetNotice(null);
        }
      }
      if (!r) throw fatal;
      // Compat : un back encore synchrone (status "done" direct) est accepté
      // tel quel — même animation de fin.
      if (r.diagnosis.status === "done") {
        const result = parseDiagnosis(r.diagnosis.resultJson);
        if (result) {
          showResult({ id: r.diagnosis.id, result, imageData: image, createdAt: r.diagnosis.createdAt }, t0);
          return;
        }
      }
      // 202 : ligne créée "pending", worker VLM lancé côté serveur → suivi.
      setCheckedSteps(1); // « Envoi de la photo ✓ »
      trackDiagnosis(r.diagnosis.id, { startedAt: Date.now() });
    } catch (e) {
      // 502/503/504 après 3 tentatives : tenter la récupération AVANT l'échec.
      const gatewayish = e instanceof ApiError && [502, 503, 504].includes(e.status);
      if (gatewayish && (await tryRecover(t0))) return;
      clearTimers();
      setAnalyzing(false);
      setNetNotice(null);
      // Échec RÉSEAU pur (fetch avorté — pas de réponse serveur) : file
      // d'attente offline (t. 83-f). La photo reste cadrée, elle partira seule.
      if (!(e instanceof ApiError)) {
        const q = enqueueDiag({ userId: user.id, zone, image, fitzpatrick: user.fitzpatrick ?? undefined, allergies: user.allergies ?? undefined });
        haptic(HAPTIC.light);
        toast.success("Réseau perdu — diagnostic gardé", {
          description: q.ok
            ? "Ta photo partira toute seule dès le retour du réseau, sans rien retaper."
            : undefined,
        });
        setStep(1); // retour capture : la photo est conservée
        return;
      }
      // 403 = quota gratuit atteint (le garde session renvoie 401, jamais
      // 403 sur cette route) → carte upsell plutôt qu'un échec sec.
      if (e instanceof ApiError && e.status === 403) setQuotaUpsell(true);
      toast.error(
        gatewayish
          ? "Moteur d'analyse momentanément injoignable — tes photos restent prêtes, retente dans un instant."
          : e instanceof Error
            ? e.message
            : "Analyse impossible",
      );
      setStep(1); // retour capture : la photo est conservée
    }
  }

  /* ─────────── Étape 0 — Choix de zone ─────────── */
  if (step === 0) {
    return (
      <div className="pt-4">
        <button onClick={() => setClientTab("accueil")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1" aria-label="Retour accueil">
          <ArrowLeft size={15} /> Accueil
        </button>
        <h2 className="font-heading font-black text-xl">Quelle zone analysons-nous ?</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-5">Chaque zone est pondérée dans ton score global (PRD §8.8).</p>
        <Reveal className="grid grid-cols-2 gap-3" stagger={0.07}>
          {BODY_ZONES.map((z) => {
            const Icon = ZONE_ICONS[z.id];
            return (
              <RevealItem key={z.id}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { setZone(z.id); setStep(1); setImage(""); setDiag(null); }}
                  className={`k-card k-card-hover rounded-[22px] p-4 text-left focus-visible:outline-2 focus-visible:outline-primary ${zone === z.id ? "ring-2 ring-primary/60" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <IconBadge icon={<Icon size={20} />} tone={ZONE_TONES[z.id]} />
                    <span className="k-chip rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-muted-foreground">{Math.round(z.weight * 100)} %</span>
                  </div>
                  <p className="font-heading font-bold text-sm mt-3">{z.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-2">{z.hint}</p>
                </motion.button>
              </RevealItem>
            );
          })}
        </Reveal>
        <button onClick={goHistory} className="k-card k-card-hover mt-5 w-full h-11 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-primary">
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
        <span className="k-chip rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold-text">{zoneDef.label} · {Math.round(zoneDef.weight * 100)} %</span>
        <h2 className="font-heading font-black text-xl mt-3">Prends ta photo</h2>

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
            <div className="grain-kene relative rounded-[24px] overflow-hidden ring-4 ring-[#C8951E]/30 shadow-xl">
              <img src={image} alt={`Aperçu zone ${zoneDef.label}`} className="aspect-square w-full object-cover" />
              <button onClick={() => setImage("")} className="absolute top-2 right-2 h-10 w-10 grid place-items-center rounded-full bg-[#1A1410]/85 text-white active:scale-90 transition-transform" aria-label="Retirer la photo">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-square rounded-[24px] border-2 border-dashed border-primary/45 bg-primary/5 grid place-items-center gap-3 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
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
          <button onClick={useDemoPhoto} className="k-chip h-11 flex-1 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary">
            <ImagePlus size={15} className="text-primary" /> Photo démo
          </button>
          {image && (
            <button onClick={() => fileRef.current?.click()} className="k-chip h-11 px-4 rounded-2xl text-xs font-semibold flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary">
              <RotateCcw size={15} /> Reprendre
            </button>
          )}
        </div>

        <PrimaryCTA
          onClick={launch}
          disabled={!image}
          className="mt-5 h-14 w-full rounded-[20px] font-heading font-black text-base"
        >
          <NeaOnnimIcon size={22} /> Lancer l&apos;analyse IA
        </PrimaryCTA>

        {/* Quota gratuit atteint (t. 71-e) — upsell Kènè+ : parcours, pas mur. */}
        {quotaUpsell && (
          <GlassCard className="mt-5 rounded-[24px] p-5">
            <div className="flex items-center gap-3">
              <IconBadge icon={<Sparkles size={20} />} tone="gold" />
              <p className="font-heading font-black text-sm">Ton diagnostic gratuit du mois est utilisé</p>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
              Avec <span className="font-bold text-primary">Kènè+</span>, ton Scanner devient illimité : analyses,
              suivi d&apos;évolution et protocoles personnalisés à volonté.
            </p>
            <button
              onClick={() => setClientTab("abonnement")}
              className="mt-4 h-11 w-full rounded-2xl k-btn-gold text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Sparkles size={15} /> Découvrir Kènè+
            </button>
          </GlassCard>
        )}

        {/* File d'attente offline (t. 83-f) : photos gardées, départ auto. */}
        {queuedCount > 0 && (
          <div role="status" className="mt-4 flex items-center gap-3 rounded-[20px] p-3.5 k-card">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <WifiOff size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">
                {queuedCount} diagnostic{queuedCount > 1 ? "s" : ""} en attente du réseau
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                Envoyé{queuedCount > 1 ? "s" : ""} automatiquement dès le retour de la connexion — rien à refaire, tu peux même quitter l&apos;app.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─────────── Étape 2 — Analyse en cours ─────────── */
  if (step === 2 && analyzing) {
    return (
      <Reveal className="pt-6 flex flex-col items-center" stagger={0.07}>
        <RevealItem className="grain-kene relative w-full max-w-[320px] rounded-[24px] overflow-hidden ring-4 ring-[#C8951E]/30 shadow-xl">
          <img src={image} alt="Photo en cours d'analyse" className="aspect-square w-full object-cover" />
          <motion.div
            className="absolute left-0 right-0 h-16 bg-gradient-to-b from-transparent via-[#C8951E]/50 to-transparent border-y-2 border-[#C8951E]"
            animate={{ top: ["8%", "78%", "8%"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden="true"
          />
        </RevealItem>

      {/* Constellation Adinkra (t. 83-e) : le ciel du rituel s'assemble
          pendant l'analyse — décoratif, la liste d'étapes reste le contrat. */}
      <RevealItem className="mt-5 w-full max-w-[320px]">
        <AdinkraSky checked={checkedSteps} total={ANALYSIS_STEPS.length} />
      </RevealItem>

      <RevealItem className="mt-6 w-full max-w-[320px]">
        <GlassCard hero>
            <div className="divide-y divide-border/60">
              {ANALYSIS_STEPS.map((label, i) => {
                const done = i < checkedSteps;
                const active = i === checkedSteps;
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 transition-colors ${done ? "bg-success/5" : active ? "bg-primary/5" : "opacity-50"}`}>
                    <span className={`grid place-items-center h-6 w-6 rounded-full shrink-0 ${done ? "bg-success text-white" : active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : <span className="font-mono text-[10px] font-bold">{i + 1}</span>}
                    </span>
                    <span className={`text-xs ${done ? "text-success font-semibold" : "text-muted-foreground"}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </RevealItem>
        <RevealItem className="w-full max-w-[320px] mt-5">
          <div role="group" aria-label="Progression de l'analyse">
            <ProgressBar value={progress} />
            <p className="text-center text-[11px] text-muted-foreground mt-2 leading-relaxed">
              10 à 30 secondes — tu peux continuer à naviguer, ton analyse arrive dans tes notifications
            </p>
            {netNotice && (
              <p role="status" className="mt-1.5 flex min-h-11 items-center justify-center gap-1.5 text-center text-[11px] font-medium text-primary">
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                <span aria-live="polite">{netNotice}</span>
              </p>
            )}
          </div>
        </RevealItem>
      </Reveal>
    );
  }

  /* ─────────── Étape 4 — Historique ─────────── */
  if (step === 4) return <HistoryView userId={user.id} history={history} compareMode={compareMode} setCompareMode={setCompareMode} compareSel={compareSel} setCompareSel={setCompareSel} onBack={() => setStep(0)} onOpen={(d) => { const r = parseDiagnosis(d.resultJson); if (r) { setDiag({ id: d.id, result: r, imageData: diagImgSrc(d.imageData), createdAt: d.createdAt }); setStep(3); } }} />;

  /* ─────────── Étape 3 — Résultats ─────────── */
  if (step === 3 && diag) {
    return <ResultView diag={diag} products={products} productsError={productsError} onRetryProducts={loadProducts} onNewZone={() => { setStep(0); setImage(""); setDiag(null); }} onHistory={goHistory} />;
  }

  return null;
}

/* ══════════════ Résultat VISIA-like ══════════════ */
function ResultView({ diag, products, productsError, onRetryProducts, onNewZone, onHistory }: { diag: { id: string; result: DiagnosisResult; imageData: string; createdAt: string }; products: ApiProduct[]; productsError: boolean; onRetryProducts: () => void; onNewZone: () => void; onHistory: () => void }) {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);
  const addToCart = useKene((s) => s.addToCart);
  const [view, setView] = useState<string>("standard");
  const [ritualOpen, setRitualOpen] = useState(false);
  const [descentOpen, setDescentOpen] = useState(false);
  const [glossary, setGlossary] = useState<GlossaryEntry | null>(null);
  const r = diag.result;
  // Fiabilité (t. 71) : champ posé par le worker dans resultJson ; les
  // anciens diagnostics n'en ont pas → dérivé de `source` (déjà présent).
  const confidence = r.confidence ?? (r.source === "vlm" ? "haute" : "indicative");
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
      <Reveal stagger={0.07}>
      {/* Header score — carte héro : verre + lueurs internes + filet kente 3px */}
      <RevealItem>
        <GlassCard hero className="overflow-hidden rounded-[26px]">
          <div className="kente-band h-[3px] w-full" aria-hidden="true" />
          <div className="p-5 flex items-center gap-4">
            <ScoreGauge score={r.score_global} label="Zone" size={110} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-heading font-black text-lg">{BODY_ZONES.find((z) => z.id === r.zone)?.label ?? r.zone}</h2>
                {r.fitzpatrick_estime && <span className="rounded-full bg-melanine text-[#F8F1E4] px-2 py-0.5 text-[10px] font-bold">Fitz {r.fitzpatrick_estime}</span>}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{formatDate(diag.createdAt)} · {r.source === "vlm" ? "Analyse VLM" : "Analyse heuristique"} · {r.indicateurs.length} indicateurs</p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: scoreColor(r.score_global), color: readableTextColor(scoreColor(r.score_global)) }}>
                  {r.score_global >= 80 ? "Excellente santé" : r.score_global >= 60 ? "Bon équilibre" : r.score_global >= 40 ? "Points à surveiller" : "Besoin de soin"}
                </span>
                {/* Pastille fiabilité — chip discret (t. 71) */}
                <span
                  className={`k-chip inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${confidence === "haute" ? "text-success" : "text-terre"}`}
                >
                  {confidence === "haute" ? (
                    <><Sparkles size={11} aria-hidden="true" /> Fiabilité : Haute (analyse IA vision)</>
                  ) : (
                    <><WifiOff size={11} aria-hidden="true" /> Mode indicatif (hors ligne)</>
                  )}
                </span>
              </div>
            </div>
          </div>
        </GlassCard>
      </RevealItem>

      {/* Lecture vocale — accès non-lectrices & confort audio (TTS) */}
      <RevealItem>
        <VoiceNarration result={r} userName={user.name} />
      </RevealItem>

      {/* Résumé en pictos — tuiles tapables lues à voix haute (non-lectrices) */}
      <RevealItem className="mt-4">
        <PictoSummary result={r} zoneLabel={BODY_ZONES.find((z) => z.id === r.zone)?.label ?? r.zone} />
      </RevealItem>

      {/* Descente de Peau (t. 82) — voyage 3D dans les couches, éclairé par
          les indicateurs réels. Plein cadre opt-in, se ferme à la remontée. */}
      <RevealItem className="mt-4">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setDescentOpen(true)}
          className="relative w-full overflow-hidden rounded-[24px] bg-gradient-to-br from-[#241A10] to-[#1A1410] text-left ring-1 ring-[#C8951E]/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Ouvrir la Descente de Peau — traverser les trois couches de ma peau en 3D"
        >
          <div aria-hidden="true" className="h-1.5 w-full" style={{ backgroundImage: "linear-gradient(90deg, #8D5524 0 33%, #C99B6E 33% 66%, #F0DFC2 66% 100%)" }} />
          <div className="flex items-center gap-3 p-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#C8951E]/15 text-[#E3B04B]">
              <Layers size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading font-bold text-sm text-[#F8F1E4]">Voyage dans ma peau</p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#F8F1E4]/65">
                Descends à travers l’épiderme, le derme et l’hypoderme — éclairés par tes {r.indicateurs.length} indicateurs.
              </p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-[#E3B04B]" aria-hidden="true" />
          </div>
        </motion.button>
      </RevealItem>

      {/* Alerte orientation dermato */}
      {r.orientation_dermato && (
        <RevealItem className="mt-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] border-2 border-[#8B1A3B]/60 bg-[#8B1A3B]/5 p-4" role="alert">
            <p className="flex items-center gap-2 font-heading font-bold text-sm text-[#8B1A3B]">
              <TriangleAlert size={17} /> Consultation dermatologique conseillée
            </p>
            <p className="text-xs mt-1.5 leading-relaxed">{r.raison_orientation ?? "Une lésion présente des signes justifiant un avis médical."}</p>
            {r.abcde && r.abcde.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-3">
                {r.abcde.map((a) => (
                  <span key={a.critere} className={`rounded-full px-2.5 py-1 text-[10px] font-bold border ${a.alerte ? "bg-[#8B1A3B] text-white border-[#8B1A3B]" : "border-[#346834]/50 text-[#346834] bg-[#346834]/10"}`}>
                    {a.critere} · {a.intitule}
                  </span>
                ))}
              </div>
            )}
            <button onClick={() => setClientTab("rdv")} className="mt-3 h-11 w-full rounded-xl bg-[#8B1A3B] text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-[#8B1A3B]">
              <CalendarPlus size={16} /> Prendre RDV avec un institut partenaire
            </button>
          </motion.div>
        </RevealItem>
      )}

      {/* Jumeau de Peau — Skin Twin 3D + Fil du Temps (projection S+12) */}
      <RevealItem>
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
      </RevealItem>

      {/* Tabs spectraux */}
      <RevealItem className="mt-5">
        <section aria-label="Vues spectrales de la photo">
          <Tabs value={view} onValueChange={setView}>
            <TabsList className="w-full h-auto grid grid-cols-4 gap-1 bg-muted/60 p-1 rounded-2xl">
              {SPECTRAL_VIEWS.map((v) => (
                <TabsTrigger key={v.id} value={v.id} className="text-[10.5px] leading-tight px-1 py-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold transition-colors">
                  {v.label.split(" ")[0]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-[11px] text-muted-foreground mt-2 mb-2">{viewDef.label}{view !== "standard" ? " — filtre spectral + cartographie chaleur" : ""}</p>
          <div className="relative k-card rounded-[24px] overflow-hidden">
            <img src={diag.imageData} alt={`Vue ${viewDef.label} de la zone analysée`} className={`aspect-square w-full object-cover ${view !== "standard" ? viewDef.filter : ""}`} />
            {heatmapCls && <div aria-hidden="true" className={`absolute inset-0 ${heatmapCls} opacity-60 mix-blend-screen pointer-events-none`} />}
            {/* cadres zones détectées */}
            {r.zones_marquages.map((z, i) => (
              <div key={i} className="absolute border-2 border-dashed border-[#FFF9EC]/90 rounded-lg pointer-events-none" style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}>
                <span className="absolute -top-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#FFF9EC]" style={{ backgroundColor: ["#346834", "#C8951E", "#E07A2B", "#8B1A3B"][Math.min(3, Math.max(0, z.severite))] }} aria-hidden="true" />
                <span className="absolute -bottom-5 left-0 whitespace-nowrap rounded-full bg-[#1A1410]/90 text-[#F8F1E4] px-1.5 py-0.5 text-[9px] font-semibold">{z.label}</span>
              </div>
            ))}
            <div className="absolute bottom-2 right-2 flex gap-1">
              {SEVERITY_STYLES.map((s, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-[#1A1410]/90 px-1.5 py-0.5 text-[11px] text-[#F8F1E4]">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </section>
      </RevealItem>

      {/* Indicateurs les plus faibles */}
      <RevealItem className="mt-6">
        <section aria-labelledby="ind-t">
          <h2 id="ind-t" className="font-heading font-bold text-base mb-3">Priorités de soin</h2>
          <div className="space-y-2.5">
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
      </RevealItem>

      {/* Recommandations */}
      <RevealItem className="mt-6">
        <section aria-labelledby="reco-t">
          <h2 id="reco-t" className="font-heading font-bold text-base mb-3">Ta routine personnalisée</h2>

          {/* Route de l'Or — parcours narratif (CTA signature terre→bissap) */}
          <PrimaryCTA
            onClick={() => setRitualOpen(true)}
            ariaLabel="Ouvrir la Route de l'Or — tisser ma routine en 4 stations"
            className="relative w-full min-h-0 overflow-hidden rounded-[24px] px-0 py-0"
          >
            <span aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-25" />
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 w-full" style={{ backgroundImage: "repeating-linear-gradient(90deg,#8B1A3B 0 12px,#346834 12px 20px,#C8951E 20px 28px,#E07A2B 28px 36px,#A0522D 36px 46px)" }} />
            <span className="relative flex w-full items-center gap-3 px-4 py-3.5">
              <span className="grid place-items-center h-12 w-12 rounded-2xl bg-[#FFF9EC]/20 border border-[#FFF9EC]/30 shrink-0">
                <NeaOnnimIcon size={26} />
              </span>
              <span className="text-left min-w-0 flex-1">
                <span className="block font-heading font-black text-base leading-tight">La Route de l&apos;Or</span>
                <span className="block text-[11px] opacity-90">Tisse ta routine en 4 stations — ton kente de soin à la fin</span>
              </span>
              <ChevronRight size={20} className="ml-auto opacity-80 shrink-0" />
            </span>
          </PrimaryCTA>

          <div className="k-card relative mt-4 rounded-[20px] p-4 pl-5">
            <span aria-hidden="true" className="k-rail-line absolute left-0 top-3.5 bottom-3.5 w-1 rounded-full" />
            <p className="text-xs leading-relaxed">{r.recommandations.resume}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="k-card k-card-hover rounded-[20px] p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-gold-text uppercase tracking-wide"><Sunrise size={13} /> Matin</p>
              <ul className="mt-2 space-y-1.5">
                {r.recommandations.routine_matin.slice(0, 4).map((s, i) => (
                  <li key={i} className="text-[11px] leading-snug flex gap-1.5"><span className="text-primary font-mono">{i + 1}.</span> {s}</li>
                ))}
              </ul>
            </div>
            <div className="k-card k-card-hover rounded-[20px] p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-terre uppercase tracking-wide"><Moon size={13} /> Soir</p>
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
                  <span key={i} className="k-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-terre">
                    {botanicIcon(b)} {b}
                  </span>
                ))}
              </div>
            </div>
          )}

          {r.recommandations.produits.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground">Produits recommandés</p>
              {productsError && (
                <div role="alert" className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 flex items-center gap-2.5">
                  <TriangleAlert size={14} className="text-terre shrink-0" aria-hidden="true" />
                  <p className="flex-1 min-w-0 text-[11px] text-muted-foreground leading-snug">Boutique indisponible — réessaie</p>
                  <button onClick={onRetryProducts} className="k-btn-gold h-11 px-3.5 rounded-xl text-primary-foreground text-xs font-bold shrink-0 focus-visible:outline-2 focus-visible:outline-primary">
                    Réessayer
                  </button>
                </div>
              )}
              {r.recommandations.produits.map((rec, i) => {
                const p = matchProduct(rec, products);
                return (
                  <div key={i} className="k-card flex items-center gap-3 rounded-[18px] p-2.5">
                    {p ? (
                      <img src={p.image} alt={p.name} loading="lazy" className="h-12 w-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <span className="k-chip h-12 w-12 rounded-[14px] text-primary grid place-items-center shrink-0"><Sparkles size={18} /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-tight">{rec}</p>
                      {p && <p className="font-mono text-[11px] text-primary font-bold tabular-nums mt-0.5">{xof(p.price)}</p>}
                    </div>
                    {p ? (
                      <button
                        onClick={() => { addToCart({ productId: p.id, name: p.name, price: p.price, qty: 1, image: p.image }); toast.success(`${p.name} ajouté au panier`); }}
                        className="k-btn-gold h-10 px-3 rounded-full text-primary-foreground text-[11px] font-bold flex items-center gap-1 shrink-0 focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <Plus size={13} /> Panier
                      </button>
                    ) : (
                      <button onClick={() => setClientTab("boutique")} className="k-chip h-10 px-3 rounded-full border-primary/40 text-primary text-[11px] font-bold shrink-0 focus-visible:outline-2 focus-visible:outline-primary">
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
                  <button key={i} onClick={() => setClientTab("rdv")} className="k-chip shrink-0 rounded-full border-success/50 bg-success/10 px-3.5 py-2 text-[11px] font-semibold text-success flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-[#346834]">
                    <CalendarPlus size={13} /> {s} · Réserver
                  </button>
                ))}
              </div>
            </div>
          )}

          {r.recommandations.conseils_hygiene_vie.length > 0 && (
            <div className="k-card mt-4 rounded-[20px] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Hygiène de vie</p>
              <ul className="space-y-1.5">
                {r.recommandations.conseils_hygiene_vie.map((c, i) => (
                  <li key={i} className="text-[11px] leading-snug flex gap-2">
                    <Check size={12} className="text-success mt-0.5 shrink-0" /> {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </RevealItem>

      <RevealItem className="mt-5">
        <p className="rounded-[14px] bg-muted/70 p-3 text-[10px] leading-relaxed text-muted-foreground">{r.avertissement} Kènè est un outil d&apos;éducation beauté assisté par IA — les estimations ne constituent pas un diagnostic médical.</p>
      </RevealItem>

      <RevealItem className="mt-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onNewZone} className="k-chip h-12 rounded-2xl text-primary text-sm font-bold flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary">
            <ScanFace size={16} /> Nouvelle zone
          </button>
          <button onClick={onHistory} className="k-chip h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary">
            <History size={16} /> Historique
          </button>
        </div>
      </RevealItem>
      </Reveal>

      {ritualOpen && (
        <RitualJourney
          diag={{ id: diag.id, result: diag.result, createdAt: diag.createdAt }}
          products={products}
          userName={user.name}
          onClose={() => setRitualOpen(false)}
        />
      )}

      {/* Descente de Peau (t. 82) — overlay plein cadre, se referme à la
          remontée (Échap inclus). */}
      {descentOpen && (
        <SkinDescent
          indicators={r.indicateurs}
          score={r.score_global}
          zoneLabel={BODY_ZONES.find((z) => z.id === r.zone)?.label ?? r.zone}
          onClose={() => setDescentOpen(false)}
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
    <div className="k-card rounded-[16px] p-3">
      <div className="flex items-start justify-between gap-2">
        {explainable ? (
          <button
            onClick={() => onAsk?.(ind.nom)}
            aria-label={`Expliquer le mot : ${ind.nom}`}
            className="min-w-0 text-left flex items-start gap-1 rounded-md focus-visible:outline-2 focus-visible:outline-primary transition-colors hover:text-primary"
          >
            <p className="text-xs font-semibold leading-tight line-clamp-2">{ind.nom}</p>
            <CircleHelp size={13} className="text-primary shrink-0 mt-px" aria-hidden="true" />
          </button>
        ) : (
          <p className="text-xs font-semibold leading-tight line-clamp-2">{ind.nom}</p>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} aria-hidden="true" />
          <span className="sr-only">{sev.label}</span>
          <span className="font-mono text-xs font-bold tabular-nums text-gold-text">{ind.pourcentage}%</span>
        </span>
      </div>
      <ProgressBar value={ind.pourcentage} className="mt-2 h-1.5" />
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
        <h2 className="font-heading font-black text-xl">Mon historique</h2>
        <Chip selected={compareMode} onClick={() => { setCompareMode(!compareMode); setCompareSel([]); }}>
          <GitCompareArrows size={14} /> Comparer
        </Chip>
      </div>

      {history === null ? (
        <div className="space-y-3 mt-5">
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} className="h-20 rounded-[18px]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="mt-6">
          <EmptyBlock
            icon={<NeaOnnimIcon size={30} />}
            title="Aucun diagnostic pour l'instant"
            text="Ton premier scan débloquera le suivi d'évolution."
          />
        </div>
      ) : (
        <>
          {/* Le Fil du Temps — courbes d'évolution */}
          <EvolutionCard userId={userId} className="mt-4" />

          <Reveal className="space-y-2.5 mt-4" stagger={0.07}>
            {list.map((d) => {
              const sel = compareSel.includes(d.id);
              return (
                <RevealItem key={d.id}>
                <div className={`k-card flex items-center gap-3 rounded-[18px] p-2.5 ${sel ? "ring-2 ring-primary/60" : ""}`}>
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
                      className={`h-9 w-9 grid place-items-center rounded-full border-2 shrink-0 transition-colors ${sel ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}
                    >
                      {sel && <Check size={14} />}
                    </button>
                  )}
                </div>
                </RevealItem>
              );
            })}
          </Reveal>

          {compareMode && (
            <AnimatePresence>
              {compareSel.length === 2 && sameZoneSel && ra && rb && a && b ? (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-5 overflow-hidden">
                  <div className="k-card rounded-[24px] p-4">
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
                      <span className="font-mono text-lg font-black tabular-nums" style={{ color: rb.score_global >= ra.score_global ? "#346834" : "#8B1A3B" }}>
                        {rb.score_global >= ra.score_global ? "+" : ""}{rb.score_global - ra.score_global} pts
                      </span>
                    </div>
                    {evolutions.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {evolutions.map((e) => (
                          <div key={e.nom} className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">{e.nom}</span>
                            <span className="font-mono font-bold tabular-nums" style={{ color: e.delta >= 0 ? "#346834" : "#8B1A3B" }}>
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
