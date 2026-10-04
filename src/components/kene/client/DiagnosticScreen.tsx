"use client";
// Kènè Cliente — Diagnostic IA: wizard zone → capture → analyse → résultats VISIA-like → historique — ÉCLAT 2026
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Brush, Building2, CalendarPlus, Camera, Check, ChevronRight, CircleHelp, Cross, Crown, Droplets, FileDown, GitCompareArrows, Hand, History,
  ImagePlus, Leaf, Loader2, MessageCircle, Moon, PersonStanding, Plus, RotateCcw, ScanFace, Share2, ShieldCheck, Sparkles, Sun, Sunrise, TriangleAlert, WifiOff, X,
} from "lucide-react";
import { toast } from "sonner";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { ApiError, apiGet, apiPost, resizeImage } from "@/lib/kene/api";
import { formatDate, scoreColor, readableTextColor, xof, SEVERITY_STYLES } from "@/lib/kene/format";
import { cn } from "@/lib/utils";
import { BODY_ZONES, SPECTRAL_VIEWS, ZONE_PHOTO_SLOTS, type AtlasLevel, type BodyZone, type DiagnosisResult, type Indicator, type SuspectedCondition, type ZonePhotoSlot } from "@/lib/kene/types";
import { BaobabIcon, KariteIcon, MoringaIcon, NeaOnnimIcon } from "@/components/kene/icons";
import { AdinkraSky } from "@/components/kene/constellation/AdinkraSky";
import { diagQueueCount, enqueueDiag, subscribeDiagQueue } from "@/lib/kene/diag-queue";
import { HAPTIC, haptic, isOnline } from "@/lib/kene/ux";
import { EvolutionCard } from "@/components/kene/evolution/EvolutionCard";
import { BeforeAfterSlider } from "@/components/kene/evolution/BeforeAfterSlider";
import { VoiceNarration } from "./VoiceNarration";
import { PictoSummary } from "./PictoSummary";
import { GlossaryDialog } from "./GlossaryDialog";
import { AudioGuideButton } from "./AudioGuideButton";
import { LiveCameraModal } from "./LiveCameraModal";
import { BeautyCardModal } from "./BeautyCardModal";
import { glossaryFor, type GlossaryEntry } from "@/lib/kene/glossary";
import { matchProduct, norm } from "@/components/kene/route/ritual";
import { RitualJourney } from "@/components/kene/route/RitualJourney";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKene } from "@/store/kene";
import { Chip, GlassCard, IconBadge, PrimaryCTA, ProgressBar, Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import type { ApiDiagnosis, ApiProduct } from "./types";
import { diagImgSrc, diagImgSources, parseDiagnosis } from "./types";
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

// Pipeline asynchrone — 3 étapes honnêtes: le POST est immédiat
// (202), l'analyse VLM tourne côté serveur, le protocole se constitue à la fin.
const ANALYSIS_STEPS = [
  "Envoi de la photo",
  "Analyse IA en cours…",
  "Constitution du protocole",
];

export function DiagnosticScreen({ pendingZone, onZoneConsumed }: { pendingZone: BodyZone | null; onZoneConsumed: () => void }) {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);

  const [step, setStep] = useState(0);
  const [zone, setZone] = useState<BodyZone>("visage");
  const [image, setImage] = useState<string>("");
  const [slotImages, setSlotImages] = useState<Record<string, string>>({});
  const slots = useMemo(() => ZONE_PHOTO_SLOTS[zone] ?? [{ id: "main", label: "Vue principale", hint: "Photo nette", required: true }], [zone]);
  const [activeSlotId, setActiveSlotId] = useState<string>(() => slots[0]?.id ?? "face");

  // Synchroniser activeSlotId quand la zone change
  useEffect(() => {
    const currentSlots = ZONE_PHOTO_SLOTS[zone] ?? [{ id: "main", label: "Vue principale", hint: "Photo nette", required: true }];
    setActiveSlotId((prev) => (currentSlots.some((s) => s.id === prev) ? prev : currentSlots[0].id));
  }, [zone]);

  const activeSlot = useMemo(() => slots.find((s) => s.id === activeSlotId) ?? slots[0], [slots, activeSlotId]);
  const activeImage = slotImages[activeSlotId] ?? "";
  const totalCaptured = useMemo(() => Object.values(slotImages).filter(Boolean).length, [slotImages]);

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [checkedSteps, setCheckedSteps] = useState(0);
  const [diag, setDiag] = useState<{ id: string; result: DiagnosisResult; imageData: string; createdAt: string } | null>(null);
  // File d'attente offline: compteur vivant — la REPLAY vit dans
  // ClientApp (elle marche quel que soit l'écran courant), ici on AFFICHE.
  const [queuedCount, setQueuedCount] = useState(0);
  const [liveCamOpen, setLiveCamOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Résilience 502: message discret sous la barre de progression
  // pendant un retry / une récupération (annoncé aux lecteurs d'écran).
  const [netNotice, setNetNotice] = useState<string | null>(null);
  // Quota gratuit atteint: le POST a répondu 403 (quotaExceeded) —
  // on affiche la carte upsell Kènè+ sur l'écran de capture au lieu d'un
  // simple échec: le monetization est un parcours, pas un mur.
  const [quotaUpsell, setQuotaUpsell] = useState(false);
  // Filet de sécurité: AUCUN interval/timeout de launch/trackDiagnosis
  // ne survit au démontage (changement d'onglet pendant une analyse — les
  // setState deviendraient des no-ops mais on rend les minuteurs morts de
  // façon déterministe, quel que soit le chemin pris).
  const timersRef = useRef<{
    timer?: ReturnType<typeof setInterval>;
    poll?: ReturnType<typeof setInterval>;
    timeouts: ReturnType<typeof setTimeout>[];
  }>({ timeouts: [] });
  // Génération du suivi courant: chaque clearTimers invalide les
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
  // Fin des échecs silencieux: produits indisponibles → encart discret +
  // Réessayer sur la section recommandations (plus de section muette).
  const [productsError, setProductsError] = useState(false);
  const [history, setHistory] = useState<ApiDiagnosis[] | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSel, setCompareSel] = useState<string[]>([]);

  // File d'attente offline: compteur vivant — la REPLAY vit dans
  // ClientApp (elle marche quel que soit l'écran courant), ici on AFFICHE.
  useEffect(() => {
    const update = () => setQueuedCount(diagQueueCount());
    update();
    return subscribeDiagQueue(update);
  }, []);

  // Haptique du rituel: chaque étape franchie vibre doucement, la
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
      setSlotImages({});
      setImage("");
      setStep(0);
      setDiag(null);
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
      setSlotImages((prev) => ({ ...prev, [activeSlotId]: dataUrl }));
      setImage(dataUrl);
      // Transparence « petite data »: montrer le poids réel envoyé (compressé côté client)
      const origKo = Math.round(f.size / 1024);
      const sentKo = Math.max(1, Math.round((dataUrl.length * 0.75) / 1024)); // base64 ≈ 4/3
      const nextEmpty = slots.find((s) => s.id !== activeSlotId && !slotImages[s.id]);
      if (nextEmpty) {
        toast.success(`Photo « ${activeSlot.label} » prête (${sentKo} Ko)`, {
          description: `Tu peux aussi prendre l'angle « ${nextEmpty.label} » pour une analyse 360°.`,
        });
        setActiveSlotId(nextEmpty.id);
      } else {
        toast.success(`Photo « ${activeSlot.label} » prête (${sentKo} Ko)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Photo illisible");
    }
  }

  async function useGuidePhoto() {
    const guide = zone === "mains" ? "guide-mains-1" : zone === "dos" ? "guide-dos-1" : zone === "naevi" ? "guide-visage-2" : "guide-visage-1";
    try {
      const blob = await (await fetch(`/skin/${guide}.webp`)).blob();
      const file = new File([blob], `${guide}.webp`, { type: "image/webp" });
      await onFile(file);
      toast.success(`Photo d'exemple chargée pour « ${activeSlot.label} »`);
    } catch {
      toast.error("Photo d'exemple indisponible");
    }
  }

  // ── Pipeline asynchrone ──────────────────────────────────────
  // Le POST répond 202 en < 1 s avec { diagnosis: status "pending" }; le
  // VLM tourne dans un worker côté serveur; on suit la ligne ici (poll).

  // Résultat acquis (poll du worker, back synchrone ou récupération 66-b):
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

  // Suivi d'un diagnostic serveur: progression honnête pilotée par le temps
  // écoulé (le serveur n'expose pas d'avancement réel) + poll
  // GET /api/diagnoses/{id} toutes les 1,8 s. Timeout global 100 s → échec
  // honnête + Réessayer (retour capture, photo conservée — comportement 66-b).
  // Échec réseau d'un tick → on continue de poller (garde-fou: timeout).
  const trackDiagnosis = useCallback(
    (diagId: string, opts: { recovered?: boolean; startedAt?: number } = {}) => {
      clearTimers(); // filet: aucun reliquat d'un suivi précédent
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
        setStep(1); // retour capture: la photo est conservée → Réessayer
      }

      // Progression: courbe exponentielle vers 96 % (jamais 100 avant la fin
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
          .catch(() => { busy = false; /* réseau: le tick suivant réessaie */ });
      }, POLL_MS);
      timersRef.current.poll = poll;

      // Premier statut immédiat: si le worker a déjà fini (reprise au
      // montage), les résultats arrivent sans attendre le 1er tick.
      apiGet<{ diagnosis: ApiDiagnosis }>(`/api/diagnoses/${diagId}`)
        .then((r) => check(r.diagnosis))
        .catch(() => undefined);
    },
    [clearTimers, showResult],
  );

  // Récupération après échec réseau (66-b): le diagnostic a très bien pu
  // être ENREGISTRÉ avant la coupure. Done récent (< 4 min) → résultats;
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
      // pending: le worker tourne encore côté serveur → on le suit.
      setZone(found.zone);
      setImage(diagImgSrc(found.imageData));
      trackDiagnosis(found.id, { recovered: true, startedAt: new Date(found.createdAt).getTime() });
      return true;
    } catch {
      // Le GET lui-même est injoignable (serveur toujours au redémarrage):
      // échec final honnête, sans crash.
      return false;
    }
  }

  // Reprise automatique: au montage, si le DERNIER diagnostic de
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
 /* historique injoignable au montage: parcours normal, silencieux */
    }
  }, [user.id, trackDiagnosis]);

  useEffect(() => {
    resumePending();
  }, [resumePending]);

  async function launch() {
    const allImages = slots.map((s) => slotImages[s.id]).filter(Boolean) as string[];
    const primaryImage = allImages[0] || image;
    if (!primaryImage) {
      toast.error("Veuillez prendre au moins une photo pour lancer l'analyse");
      return;
    }
    launchedRef.current = true;
    setStep(2);
    setAnalyzing(true);
    setProgress(0);
    setCheckedSteps(0);
    setNetNotice(null);
    setQuotaUpsell(false);
    const t0 = Date.now();
    // Hors-ligne dès le départ: la photo part en file d'attente —
    // envoyée toute seule au retour du réseau (la replay vit dans ClientApp,
    // elle prévient par toast). Jamais d'échec sec pour une photo déjà cadrée.
    if (!isOnline()) {
      const q = enqueueDiag({
        userId: user.id,
        zone,
        image: primaryImage,
        images: allImages,
        fitzpatrick: user.fitzpatrick ?? undefined,
        allergies: user.allergies ?? undefined,
      });
      haptic(HAPTIC.light);
      setAnalyzing(false);
      setStep(0); // la photo reste affichée: la cliente voit qu'elle est gardée
      toast.success("Diagnostic mis en attente", {
        description: q.ok
          ? "Tes photos partiront toutes seules dès que le réseau revient — tu peux même quitter l’app."
          : "File indisponible sur cet appareil — retente quand le réseau revient.",
      });
      return;
    }
    try {
      // POST /api/diagnoses: répond 202 en < 1 s avec la ligne "pending"
      // (pipeline asynchrone). 4 tentatives (: 3 → 4, backoff
      // jusqu'à 8 s ≈ ~13,5 s de fenêtre) quand la gateway renvoie
      // 502/503/504 (recompilation/restart du serveur Next en dev) — backoff
      // 1,5 s → 4 s → 8 s. Les autres erreurs (400/404/429…) ne sont JAMAIS
      // rejouées; chaque retry crée une NOUVELLE ligne côté serveur si le
      // POST a échoué AVANT d'atteindre l'app (échec réseau = rien reçu).
      let r: { diagnosis: ApiDiagnosis } | undefined;
      let fatal: unknown = new Error("Analyse impossible");
      const backoffs = [1500, 4000, 8000];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          r = await apiPost<{ diagnosis: ApiDiagnosis }>("/api/diagnoses", {
            userId: user.id,
            zone,
            image: primaryImage,
            images: allImages,
            fitzpatrick: user.fitzpatrick ?? undefined,
            allergies: user.allergies ?? undefined,
          }, { timeoutMs: 90_000 });
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
      // Compat: un back encore synchrone (status "done" direct) est accepté
      // tel quel — même animation de fin.
      if (r.diagnosis.status === "done") {
        const result = parseDiagnosis(r.diagnosis.resultJson);
        if (result) {
          const storedImgData = allImages.length > 1 ? JSON.stringify(allImages) : primaryImage;
          showResult({ id: r.diagnosis.id, result, imageData: storedImgData, createdAt: r.diagnosis.createdAt }, t0);
          return;
        }
      }
      // 202: ligne créée "pending", worker VLM lancé côté serveur → suivi.
      setCheckedSteps(1); // « Envoi de la photo ✓ »
      trackDiagnosis(r.diagnosis.id, { startedAt: Date.now() });
    } catch (e) {
      // 502/503/504 après 3 tentatives: tenter la récupération AVANT l'échec.
      const gatewayish = e instanceof ApiError && [502, 503, 504].includes(e.status);
      if (gatewayish && (await tryRecover(t0))) return;
      clearTimers();
      setAnalyzing(false);
      setNetNotice(null);
      // Échec RÉSEAU pur (fetch avorté — pas de réponse serveur): file
      // d'attente offline. La photo reste cadrée, elle partira seule.
      if (!(e instanceof ApiError)) {
        const q = enqueueDiag({
          userId: user.id,
          zone,
          image: primaryImage,
          images: allImages,
          fitzpatrick: user.fitzpatrick ?? undefined,
          allergies: user.allergies ?? undefined,
        });
        haptic(HAPTIC.light);
        toast.success("Réseau perdu — diagnostic gardé", {
          description: q.ok
            ? "Tes photos partiront toutes seules dès le retour du réseau, sans rien retaper."
            : undefined,
        });
        setStep(0); // retour capture: la photo est conservée
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
      setStep(0); // retour capture: la photo est conservée
    }
  }

  /* ─────────── Étape 0 — Studio de Scan Direct (Zone + Capture Unifiée) ─────────── */
  if (step === 0) {
    const zoneDef = BODY_ZONES.find((z) => z.id === zone) ?? BODY_ZONES[0];
    const ActiveZoneIcon = ZONE_ICONS[zone];

    return (
      <div className="pt-2 sm:pt-4">
        {/* Guide Vocal Oralisé pour l'étape */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Studio Scanner Kènè</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary text-[10px] font-bold px-2 py-0.5">
              ÉCLAT 2026
            </span>
          </div>
          <AudioGuideButton
            text="Bienvenue dans le Studio Scanner Kènè. Choisis la zone que tu souhaites analyser avec les pastilles en haut, puis prends ta photo en direct ou importe-la."
            label="Écouter le guide"
            compact
          />
        </div>

        {/* 1. Sélecteur de zone horizontal interactif (Silky Carousel) */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-xs font-bold text-foreground">1. Choisis la zone à scanner :</span>
            <span className="text-[11px] text-primary font-semibold">{zoneDef.label} ({Math.round(zoneDef.weight * 100)}% santé)</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
            {BODY_ZONES.map((z) => {
              const Icon = ZONE_ICONS[z.id];
              const isSelected = zone === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    setZone(z.id);
                    setSlotImages({});
                    setImage("");
                    haptic(HAPTIC.tap);
                  }}
                  className={cn(
                    "flex-shrink-0 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition-all border",
                    isSelected
                      ? "border-primary bg-primary/15 text-foreground shadow-sm ring-2 ring-primary/40 scale-[1.02]"
                      : "border-border/60 bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className={cn(
                    "grid size-7 place-items-center rounded-xl transition-colors",
                    isSelected ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon size={16} />
                  </span>
                  <div className="text-left leading-tight">
                    <span className="block">{z.label}</span>
                    <span className="text-[9.5px] font-mono text-muted-foreground font-normal">{Math.round(z.weight * 100)}%</span>
                  </div>
                  {z.id === "visage" && (
                    <span className="ml-0.5 text-[9px] font-extrabold uppercase text-gold-text bg-gold/20 px-1.5 py-0.5 rounded-full">
                      Recommandé
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Indication contextuelle de la zone choisie */}
          <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-card/40 border border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
            <ActiveZoneIcon size={14} className="text-primary shrink-0" />
            <span className="truncate">{zoneDef.hint}</span>
          </div>
        </div>

        {/* 2. Prises de vue multi-angles */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-xs font-bold text-foreground">2. Angles de prise de vue :</span>
            <span className="text-[11px] font-semibold text-primary">
              {totalCaptured === 0
                ? "1 photo min. requise"
                : `${totalCaptured}/${slots.length} angle${totalCaptured > 1 ? "s" : ""} capturé${totalCaptured > 1 ? "s" : ""}`}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {slots.map((s) => {
              const hasImg = Boolean(slotImages[s.id]);
              const isActive = activeSlotId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setActiveSlotId(s.id);
                    haptic(HAPTIC.tap);
                  }}
                  className={cn(
                    "relative p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between min-h-[72px]",
                    isActive
                      ? "border-primary bg-primary/15 ring-2 ring-primary/40 shadow-sm"
                      : hasImg
                      ? "border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10 text-foreground"
                      : "border-border/60 bg-card/50 hover:bg-card text-muted-foreground"
                  )}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span className="text-[11px] font-bold text-foreground truncate">{s.label}</span>
                    {hasImg ? (
                      <span className="grid size-4 place-items-center rounded-full bg-emerald-500 text-white text-[9px] shrink-0">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    ) : s.required ? (
                      <span className="text-[9px] text-gold-text font-bold bg-gold/15 px-1 py-0.2 rounded shrink-0">
                        Requis
                      </span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground font-normal shrink-0">
                        Optionnel
                      </span>
                    )}
                  </div>
                  <p className="text-[9.5px] text-muted-foreground mt-1 line-clamp-1">{s.hint}</p>
                  {hasImg && (
                    <div className="mt-1 flex items-center gap-1">
                      <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">Prêt</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Conseils de prise de vue compacts & clairs */}
        <div className="mb-4 rounded-2xl bg-muted/30 border border-border/40 p-3">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <p className="text-[11px] font-bold text-foreground">Conseils pour l&apos;angle « {activeSlot.label} » :</p>
            <AudioGuideButton
              text={`Conseils pour l'angle ${activeSlot.label} : premièrement, utilise une bonne lumière naturelle de jour. Deuxièmement, place ton appareil à environ 30 centimètres avec une image bien nette. Troisièmement, assure-toi que ta peau est démaquillée et propre.`}
              label="Écouter les conseils"
              compact
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="grid place-items-center size-4 rounded-full bg-primary/20 text-primary font-mono text-[9px] font-bold shrink-0">1</span>
              Lumière naturelle de jour
            </span>
            <span className="flex items-center gap-1.5">
              <span className="grid place-items-center size-4 rounded-full bg-primary/20 text-primary font-mono text-[9px] font-bold shrink-0">2</span>
              Distance ~30 cm nette
            </span>
            <span className="flex items-center gap-1.5">
              <span className="grid place-items-center size-4 rounded-full bg-primary/20 text-primary font-mono text-[9px] font-bold shrink-0">3</span>
              Peau démaquillée & dégagée
            </span>
          </div>
        </div>

        {/* 4. Zone de capture ou prévisualisation */}
        <div>
          {activeImage ? (
            <div>
              <div className="grain-kene relative rounded-[24px] overflow-hidden ring-4 ring-[#C8951E]/30 shadow-xl max-h-[380px] flex items-center justify-center bg-black">
                <img src={activeImage} alt={`Aperçu zone ${zoneDef.label} — ${activeSlot.label}`} className="w-full object-cover max-h-[380px]" />
                <button
                  type="button"
                  onClick={() => {
                    setSlotImages((prev) => {
                      const next = { ...prev };
                      delete next[activeSlotId];
                      return next;
                    });
                    setImage("");
                  }}
                  className="absolute top-3 right-3 h-10 w-10 grid place-items-center rounded-full bg-[#1A1410]/85 text-white active:scale-90 transition-transform shadow-lg"
                  aria-label={`Retirer la photo ${activeSlot.label}`}
                >
                  <X size={18} />
                </button>
                <div className="absolute bottom-3 left-3 bg-[#1A1410]/80 backdrop-blur-md text-[#FFF9EC] text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-white/10">
                  <ActiveZoneIcon size={14} className="text-gold" />
                  <span>{zoneDef.label} — {activeSlot.label}</span>
                </div>
              </div>

              {/* Badge de confirmation de pré-analyse */}
              <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#3F7D3F]/10 border border-[#3F7D3F]/30 px-3.5 py-2.5 text-xs text-[#3F7D3F] font-bold">
                <span className="flex items-center gap-2">
                  <Sparkles size={15} className="shrink-0" />
                  <span>Angle « {activeSlot.label} » cadré & prêt</span>
                </span>
                {totalCaptured > 1 && (
                  <span className="text-[10px] bg-[#3F7D3F]/20 px-2 py-0.5 rounded-full uppercase">
                    Synthèse 360° ({totalCaptured} angles)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Option 1 : Selfie Caméra Live (Recommandé) */}
              <button
                type="button"
                onClick={() => setLiveCamOpen(true)}
                className="w-full aspect-[16/10] sm:aspect-[16/9] rounded-[24px] border-2 border-primary/60 bg-gradient-to-br from-primary/15 via-gold/10 to-transparent p-5 flex flex-col items-center justify-center gap-2.5 shadow-md active:scale-[0.99] transition-all group"
              >
                <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg group-hover:scale-105 transition-transform">
                  <Camera size={28} />
                </span>
                <span className="font-heading font-black text-sm sm:text-base text-foreground">
                  Capturer « {activeSlot.label} » en direct
                </span>
                <span className="text-[11px] text-muted-foreground text-center px-4 max-w-sm">
                  {activeSlot.hint} · Vérification de luminosité en temps réel
                </span>
              </button>

              {/* Option 2 : Importer depuis la galerie */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="h-12 rounded-2xl border border-border bg-card hover:bg-muted/40 text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <ImagePlus size={16} className="text-muted-foreground" /> Importer « {activeSlot.label} »
                </button>
                <button
                  type="button"
                  onClick={useGuidePhoto}
                  className="h-12 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Sparkles size={15} className="text-primary" /> Exemple « {activeSlot.label} »
                </button>
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
            aria-label={`Photo de la zone ${zoneDef.label} - ${activeSlot.label}`}
          />
        </div>

        {/* Boutons d'action après capture */}
        {activeImage && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setLiveCamOpen(true)}
              className="k-chip h-11 flex-1 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <RotateCcw size={15} /> Reprendre « {activeSlot.label} »
            </button>
            <button
              type="button"
              onClick={useGuidePhoto}
              className="k-chip h-11 px-4 rounded-2xl text-xs font-semibold flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <ImagePlus size={15} className="text-primary" /> Exemple
            </button>
          </div>
        )}

        {/* Modal Caméra Live */}
        {liveCamOpen && (
          <LiveCameraModal
            zoneLabel={`${zoneDef.label} — ${activeSlot.label}`}
            onCapture={(dataUrl) => {
              setSlotImages((prev) => ({ ...prev, [activeSlotId]: dataUrl }));
              setImage(dataUrl);
              const nextEmpty = slots.find((s) => s.id !== activeSlotId && !slotImages[s.id]);
              if (nextEmpty) {
                toast.success(`Photo « ${activeSlot.label} » capturée ✨`, {
                  description: `Angle suivant suggéré : « ${nextEmpty.label} » pour une analyse 360°.`,
                });
                setActiveSlotId(nextEmpty.id);
              } else {
                toast.success(`Photo « ${activeSlot.label} » capturée avec succès ✨`);
              }
            }}
            onClose={() => setLiveCamOpen(false)}
          />
        )}

        {/* Synthèse multi-photos avant lancement */}
        {totalCaptured > 1 ? (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-3 flex items-center gap-2.5 text-xs text-primary font-bold">
            <Sparkles size={16} className="shrink-0" />
            <span>Synthèse multi-angles activée : {totalCaptured} photos seront analysées conjointement par l&apos;IA 360°.</span>
          </div>
        ) : totalCaptured === 1 ? (
          <div className="mt-4 rounded-2xl border border-border/50 bg-muted/20 p-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>1 photo prête · Tu peux lancer ou ajouter un autre angle</span>
            {slots.find((s) => !slotImages[s.id]) && (
              <button
                type="button"
                onClick={() => {
                  const empty = slots.find((s) => !slotImages[s.id]);
                  if (empty) setActiveSlotId(empty.id);
                }}
                className="text-primary font-bold hover:underline"
              >
                + Ajouter angle
              </button>
            )}
          </div>
        ) : null}

        {/* Bouton de lancement de l'analyse */}
        <PrimaryCTA
          onClick={launch}
          disabled={totalCaptured === 0}
          className="mt-4 h-14 w-full rounded-[20px] font-heading font-black text-base shadow-lg"
        >
          <NeaOnnimIcon size={22} />
          {totalCaptured > 1
            ? `Lancer le diagnostic 360° (${totalCaptured} photos)`
            : totalCaptured === 1
            ? `Lancer l'analyse IA (${zoneDef.label})`
            : "Prends au moins une photo pour analyser"}
        </PrimaryCTA>

        {/* Quota gratuit atteint — upsell Kènè+ */}
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

        {/* File d'attente offline */}
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
                Envoyé{queuedCount > 1 ? "s" : ""} automatiquement dès le retour de la connexion — rien à refaire.
              </p>
            </div>
          </div>
        )}

        {/* Raccourci vers l'historique complet */}
        <button
          type="button"
          onClick={goHistory}
          className="k-card k-card-hover mt-5 w-full h-12 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 border border-border/70"
        >
          <History size={16} className="text-primary" /> Voir mes diagnostics passés & historique
        </button>
      </div>
    );
  }

 /* ─────────── Étape 2 — Analyse en cours ─────────── */
  if (step === 2 && analyzing) {
    return (
      <Reveal className="pt-6 flex flex-col items-center" stagger={0.07}>
        <RevealItem className="grain-kene relative w-full max-w-[320px] rounded-[24px] overflow-hidden ring-4 ring-[#C8951E]/40 shadow-[0_0_30px_rgba(200,149,30,0.3)] bg-black">
          <img src={image} alt="Photo en cours d'analyse" className="aspect-square w-full object-cover filter contrast-105" />

          {/* Grille holographique subtile */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(to_right,#C8951E_1px,transparent_1px),linear-gradient(to_bottom,#C8951E_1px,transparent_1px)] bg-[size:16px_16px]"
            aria-hidden="true"
          />

          {/* Faisceau laser doré incandescent */}
          <motion.div
            className="absolute left-0 right-0 h-16 pointer-events-none"
            animate={{ top: ["4%", "78%", "4%"] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden="true"
          >
            <div className="w-full h-full bg-gradient-to-b from-transparent via-[#C8951E]/45 to-transparent relative">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#FFF9EC] to-transparent shadow-[0_0_12px_#FFF9EC]" />
            </div>
          </motion.div>

          {/* Cibles holographiques dynamiques */}
          {[
            { label: "Pores & Sébum", x: 48, y: 32 },
            { label: "Mélanine & Éclat", x: 28, y: 55 },
            { label: "Film Hydrolipidique", x: 68, y: 52 },
          ].map((t, idx) => (
            <div
              key={idx}
              style={{ left: `${t.x}%`, top: `${t.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center animate-pulse"
            >
              <div className="size-5 rounded-full border border-[#C8951E] shadow-[0_0_6px_rgba(200,149,30,0.8)] grid place-items-center">
                <div className="size-1 rounded-full bg-[#C8951E]" />
              </div>
              <span className="mt-0.5 font-mono text-[8px] font-bold text-black bg-[#C8951E]/90 px-1 rounded shadow">
                {t.label}
              </span>
            </div>
          ))}

          {/* Coins optiques de visée */}
          <div className="absolute top-2.5 left-2.5 size-4 border-t-2 border-l-2 border-[#C8951E] rounded-tl pointer-events-none" />
          <div className="absolute top-2.5 right-2.5 size-4 border-t-2 border-r-2 border-[#C8951E] rounded-tr pointer-events-none" />
          <div className="absolute bottom-2.5 left-2.5 size-4 border-b-2 border-l-2 border-[#C8951E] rounded-bl pointer-events-none" />
          <div className="absolute bottom-2.5 right-2.5 size-4 border-b-2 border-r-2 border-[#C8951E] rounded-br pointer-events-none" />
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
  const [view, setView] = useState<string>("standard");
  const allImages = useMemo(() => diagImgSources(diag.imageData), [diag.imageData]);
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const currentImg = allImages[selectedImgIdx] || diagImgSrc(diag.imageData);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [beautyCardOpen, setBeautyCardOpen] = useState(false);
  const [glossary, setGlossary] = useState<GlossaryEntry | null>(null);
  // t. 138 — le moment diagnostic: la fin d'un résultat réussi est LE moment
  // où la valeur est visible. On sait si l'utilisatrice est déjà abonnée
  // (chargement non bloquant — la carte n'apparaît que si non abonnée).
  const [hasSub, setHasSub] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    apiGet<{ subscription: { plan: string } | null }>(`/api/subscriptions?userId=${encodeURIComponent(user.id)}`)
      .then((r) => { if (alive) setHasSub(Boolean(r.subscription)); })
      .catch(() => { if (alive) setHasSub(null); });
    return () => { alive = false; };
  }, [user.id]);
  const r = diag.result;
  // Fiabilité: champ posé par le worker dans resultJson; les
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

  const getCareMeta = (rec: string): { icon: React.ReactNode; moment: string; purpose: string; actives: string[] } => {
    const n = norm(rec);
    if (n.includes("solaire") || n.includes("spf")) {
      return {
        icon: <Sun size={17} />,
        moment: "Matin · Quotidien",
        purpose: "Bouclier UV indispensable pour prévenir le vieillissement prématuré et bloquer la repigmentation des taches sur peau noire.",
        actives: ["Filtres minéraux", "Oxyde de fer", "Antioxydants"],
      };
    }
    if (n.includes("nettoy") || n.includes("savon") || n.includes("mousse") || n.includes("gel")) {
      return {
        icon: <Sparkles size={17} />,
        moment: "Matin & Soir",
        purpose: "Élimine le sébum, la sueur et les impuretés en douceur tout en respectant le film protecteur de l'épiderme.",
        actives: ["Moringa", "Zinc PCA", "Tensioactifs doux"],
      };
    }
    if (n.includes("tache") || n.includes("unifi") || n.includes("vitamine c") || n.includes("niacinamide") || n.includes("aha") || n.includes("azelai")) {
      return {
        icon: <Sparkles size={17} />,
        moment: "Matin ou Soir",
        purpose: "Régule la production de mélanine, atténue les taches post-inflammatoires et unifie le grain de peau sans décapage.",
        actives: ["Niacinamide 10%", "Vitamine C stabilisée", "AHA de bissap"],
      };
    }
    if (n.includes("karite") || n.includes("baume") || n.includes("repar") || n.includes("ceramide") || n.includes("nourri")) {
      return {
        icon: <ShieldCheck size={17} />,
        moment: "Soir au coucher",
        purpose: "Répare le ciment intercellulaire, soulage la déshydratation et scelle l'hydratation durablement pendant la nuit.",
        actives: ["Beurre de karité brut", "Céramides", "Huile de baobab"],
      };
    }
    if (n.includes("hyaluronique") || n.includes("hydrat") || n.includes("eau") || n.includes("aloka")) {
      return {
        icon: <Droplets size={17} />,
        moment: "Matin & Soir",
        purpose: "Infuse l'eau en profondeur dans les couches de l'épiderme pour repulper et défroisser les traits déshydratés.",
        actives: ["Acide hyaluronique pur", "Aloka", "Glycérine végétale"],
      };
    }
    if (n.includes("sebum") || n.includes("matifi") || n.includes("acne") || n.includes("arbre a the") || n.includes("zinc")) {
      return {
        icon: <ShieldCheck size={17} />,
        moment: "Matin & Soir",
        purpose: "Normalise la sécrétion sébacée, resserre les pores et prévient les éruptions cutanées sans assécher.",
        actives: ["Zinc", "Arbre à thé", "Niacinamide"],
      };
    }
    if (n.includes("cheveu") || n.includes("tempe") || n.includes("ricin") || n.includes("cuir chevelu")) {
      return {
        icon: <Leaf size={17} />,
        moment: "Quotidien",
        purpose: "Nourrit les follicules pileux, stimule la microcirculation et fortifie les bordures affaiblies par les coiffures.",
        actives: ["Ricin noir d'Afrique", "Huile de baobab", "Moringa"],
      };
    }
    return {
      icon: <Sparkles size={17} />,
      moment: "Soin ciblé",
      purpose: "Formulation spécifique apportant les nutriments essentiels recommandés pour rééquilibrer votre zone cutanée.",
      actives: ["Botaniques africains", "Vitamines protectrices"],
    };
  };

  function askGlossary(term: string) {
    const entry = glossaryFor(term);
    if (entry) setGlossary(entry);
  }

  return (
    <div className="pt-4 pb-2">
      <Reveal stagger={0.07}>
      {/* Header score — carte héro: verre + lueurs internes + filet kente 3px */}
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
                {/* Pastille fiabilité — chip discret */}
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

      {/* Atlas africain — « Dr Kènè pense reconnaître… »: hypothèses
 éducatives citées par le VLM puis VALIDÉES côté serveur (id exact de
 l'atlas + zone cohérente + confiance ≥ 25). Jamais un diagnostic
 formel — une piste à faire confirmer, avec le bon niveau de conduite. */}
      {r.hypotheses && r.hypotheses.length > 0 && (
        <RevealItem className="mt-4">
          <section aria-labelledby="hyp-t">
            <h2 id="hyp-t" className="font-heading font-bold text-base">Dr Kènè pense reconnaître…</h2>
            <p className="mt-1 mb-3 text-[11px] leading-snug text-muted-foreground">
              Ce que la photo lui rappelle, parmi {r.hypotheses.length === 1 ? "les affections de peau noire" : "2 affections de peau noire"} — une hypothèse à faire confirmer, pas un diagnostic.
            </p>
            <div className="space-y-3">
              {r.hypotheses.map((h) => (
                <HypothesisCard key={h.id} h={h} onAsk={askGlossary} onRdv={() => setClientTab("rdv")} />
              ))}
            </div>
          </section>
        </RevealItem>
      )}


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
            <img src={currentImg} alt={`Vue ${viewDef.label} de la zone analysée`} className={`aspect-square w-full object-cover ${view !== "standard" ? viewDef.filter : ""}`} />
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

            {/* Sélecteur d'angle si diagnostic multi-photos */}
            {allImages.length > 1 && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-[#1A1410]/85 backdrop-blur-md p-1.5 rounded-2xl border border-white/10">
                <span className="text-[10px] font-bold text-[#FFF9EC]/80 px-1.5">360° :</span>
                {allImages.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImgIdx(i)}
                    className={cn(
                      "relative size-8 rounded-xl overflow-hidden border transition-all",
                      selectedImgIdx === i ? "border-gold ring-2 ring-gold/50 scale-105" : "border-white/20 opacity-60 hover:opacity-100"
                    )}
                    aria-label={`Afficher angle ${i + 1}`}
                  >
                    <img src={src} alt={`Angle ${i + 1}`} className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
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
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Sparkles size={14} className="text-primary" />
                    Soins &amp; Actifs recommandés pour votre peau
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Typologies de soins adaptées à votre profil cutané · Sans marque commerciale
                  </p>
                </div>
              </div>

              {/* Note d'indépendance dermo-conseil */}
              <div className="rounded-2xl bg-primary/5 border border-primary/20 p-3 flex items-start gap-2.5 text-[11px]">
                <ShieldCheck size={16} className="text-primary shrink-0 mt-0.5" />
                <p className="text-muted-foreground leading-snug">
                  <strong className="text-foreground font-semibold">Indépendance Kènè :</strong> L&apos;application Kènè ne vend aucun produit cosmétique. Ces typologies de soins et principes actifs sont des recommandations dermo-cosmétiques objectives, disponibles en pharmacie, parapharmacie ou auprès de vos instituts partenaires habituels.
                </p>
              </div>

              {/* Cartes de soins recommandés (sans prix, sans panier) */}
              <div className="space-y-2">
                {r.recommandations.produits.map((rec, i) => {
                  const meta = getCareMeta(rec);
                  return (
                    <div
                      key={i}
                      className="k-card rounded-[20px] p-3.5 flex items-start gap-3 border border-border/80 shadow-xs"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold/20 via-primary/15 to-transparent text-primary shadow-xs">
                        {meta.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-heading font-bold text-xs text-foreground leading-snug">
                            {rec}
                          </p>
                          <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {meta.moment}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          {meta.purpose}
                        </p>
                        {meta.actives && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-foreground/70">Actifs clés :</span>
                            {meta.actives.map((act, j) => (
                              <span
                                key={j}
                                className="text-[9.5px] font-medium bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-md"
                              >
                                {act}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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

      {/* t. 138 — PARCOURS CONVERSION: le moment diagnostic. Uniquement si la
          cliente n'est PAS abonnée (pas de doublon avec la carte quota 403).
          Une carte, un prix, une action — jamais de compte à rebours. */}
      {hasSub === false && (
        <RevealItem className="mt-4">
          <section aria-label="Continuer avec Kènè+" className="k-card k-glow-gold rounded-[20px] p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC]" aria-hidden="true">
                <Crown size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading font-black text-[15px] leading-tight">Continue avec Kènè+</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Diagnostics illimités, suivi d&apos;évolution de ta peau, Dr. Kènè prioritaire — le plan gratuit s&apos;arrête à 1 diagnostic par mois.
                </p>
              </div>
              <p className="shrink-0 text-right">
                <span className="block font-mono text-[15px] font-black tabular-nums text-gold-text">2 500</span>
                <span className="block text-[9px] text-muted-foreground">F / mois</span>
              </p>
            </div>
            <button
              onClick={() => setClientTab("abonnement")}
              className="k-btn-gold mt-3 h-11 w-full rounded-xl text-primary-foreground text-[13px] font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Crown size={15} /> Découvrir Kènè+ — sans engagement
            </button>
          </section>
        </RevealItem>
      )}

      <RevealItem className="mt-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onNewZone} className="k-chip h-12 rounded-2xl text-primary text-sm font-bold flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary">
            <ScanFace size={16} /> Nouvelle zone
          </button>
          <button onClick={onHistory} className="k-chip h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary">
            <History size={16} /> Historique
          </button>
        </div>
        {/* Recommandation Dermo-Botanique & Pass Cabine avec QR vectoriel */}
        <button
          onClick={() => window.open(`/api/diagnoses/prescription?userId=${user.id}&id=${diag.id}`, "_blank")}
          className="k-btn-gold mt-3 h-12 w-full rounded-2xl text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:brightness-105 active:scale-[0.99] transition-all focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Télécharger ma Recommandation Botanique & Pass Cabine avec QR Code en PDF"
        >
          <Sparkles size={16} /> Recommandation Botanique &amp; Pass Cabine (PDF)
        </button>
        <button
          onClick={() => {
            const origin = typeof window !== "undefined" ? window.location.origin : "https://kene.app";
            const pdfUrl = `${origin}/api/diagnoses/prescription?userId=${user.id}&id=${diag.id}`;
            const botanicals = diag.result.recommandations?.botaniques_conseillees?.slice(0, 3).join(", ") || "Actifs apaisants";
            const zoneLabel = BODY_ZONES.find((z) => z.id === diag.result.zone)?.label || diag.result.zone;
            const msg = `Bonjour ! 🌿\n\nVoici ma *Recommandation Dermo-Botanique & Pass Cabine Kènè* :\n\n📊 *Score Cutané* : ${diag.result.score_global}/100\n📍 *Zone analysée* : ${zoneLabel}\n🌱 *Actifs botaniques recommandés* : ${botanicals}\n\n📄 *Télécharger ma Recommandation & Pass Cabine (PDF)* :\n${pdfUrl}\n\nÀ présenter en institut partenaire pour adapter mon protocole de soin en cabine. ✨\n— Kènè, la beauté mélanoderme`;
            openWhatsApp(user?.phone || "", msg);
          }}
          className="mt-2.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-sm font-bold shadow-md transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-[#25D366]"
          aria-label="Recevoir ma Recommandation Botanique & Pass Cabine sur WhatsApp"
        >
          <MessageCircle size={16} /> Recevoir mon Protocole sur WhatsApp
        </button>

        {/* Partager ma Routine & Carte Beauté sur WhatsApp / Story */}
        <button
          onClick={() => setBeautyCardOpen(true)}
          className="k-card k-card-hover mt-2.5 h-12 w-full rounded-2xl border-2 border-[#C8951E]/50 bg-gradient-to-r from-[#C8951E]/15 via-gold/10 to-transparent text-foreground text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-all focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Partager ma Routine et Carte Beauté sur WhatsApp et Story"
        >
          <Share2 size={16} className="text-[#C8951E]" /> Partager ma Routine & Carte Beauté ✨
        </button>

        <button
          onClick={() => window.open(`/api/diagnoses/report?userId=${user.id}&id=${diag.id}`, "_blank")}
          className="k-chip mt-2 h-11 w-full rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Télécharger ou imprimer mon compte-rendu de diagnostic en PDF"
        >
          <FileDown size={15} /> Compte-rendu d&apos;analyse détaillé
        </button>
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

      {/* Glossaire 1 tap — «? » sur un indicateur ouvre sa définition simple */}
      <GlossaryDialog entry={glossary} onClose={() => setGlossary(null)} />

      {/* Modal Carte Beauté Story / Statut WhatsApp */}
      {beautyCardOpen && (
        <BeautyCardModal
          score={r.score_global}
          zoneLabel={BODY_ZONES.find((z) => z.id === r.zone)?.label ?? r.zone}
          fitzpatrick={r.fitzpatrick_estime}
          botanicals={r.recommandations.botaniques_conseillees}
          userName={user.name}
          onClose={() => setBeautyCardOpen(false)}
        />
      )}
    </div>
  );
}

/* ══════════════ Hypothèse de l'atlas africain ══════════════ */
const HYP_LEVEL: Record<AtlasLevel, { chip: string; label: string; icon: React.ReactNode }> = {
  educatif: { chip: "border-success/45 bg-success/5 text-success", label: "Éducatif", icon: <Check size={12} /> },
  institut: { chip: "border-primary/45 bg-primary/5 text-primary", label: "Institut partenaire", icon: <Sparkles size={12} /> },
  dermato: { chip: "border-[#A0522D]/50 bg-[#A0522D]/5 text-[#A0522D]", label: "Avis dermatologique", icon: <PersonStanding size={12} /> },
  urgence: { chip: "border-[#8B1A3B]/60 bg-[#8B1A3B]/10 text-[#8B1A3B]", label: "Urgence", icon: <TriangleAlert size={12} /> },
};

function HypothesisCard({ h, onAsk, onRdv }: { h: SuspectedCondition; onAsk: (term: string) => void; onRdv: () => void }) {
  const lv = HYP_LEVEL[h.niveau];
  const explainable = glossaryFor(h.nom) !== null;
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="k-card rounded-[20px] p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${lv.chip}`}>
          {lv.icon}{lv.label}
        </span>
        <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{h.categorie}</span>
        <span className="ml-auto font-mono text-[11px] font-bold tabular-nums text-gold-text">{h.confiance} %</span>
      </div>

      {explainable ? (
        <button
          onClick={() => onAsk(h.nom)}
          className="mt-2 flex items-start gap-1 text-left rounded-md focus-visible:outline-2 focus-visible:outline-primary transition-colors hover:text-primary"
          aria-label={`Expliquer : ${h.nom}`}
        >
          <p className="font-heading font-bold text-sm leading-snug">{h.nom}</p>
          <CircleHelp size={13} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
        </button>
      ) : (
        <p className="mt-2 font-heading font-bold text-sm leading-snug">{h.nom}</p>
      )}

      <ProgressBar value={h.confiance} className="mt-1.5 h-1" />

      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <ScanFace size={13} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-muted-foreground"><span className="font-bold text-foreground/80">Sur peau noire :</span> {h.surPeauNoire}</p>
        </div>
        <div className="flex gap-2">
          <Hand size={13} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed"><span className="font-bold">Conduite de Kènè :</span> {h.action}</p>
        </div>
        {h.drapeau && (
          <div role="note" className="flex gap-2 rounded-xl bg-[#8B1A3B]/10 p-2.5">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-[#8B1A3B]" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed font-semibold text-[#8B1A3B]">{h.drapeau}</p>
          </div>
        )}
      </div>

      {(h.niveau === "institut" || h.niveau === "dermato" || h.niveau === "urgence") && (
        <button
          onClick={onRdv}
          className={`mt-3 h-10 w-full rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 ${
            h.niveau === "urgence"
              ? "bg-[#8B1A3B] text-white focus-visible:outline-[#8B1A3B]"
              : h.niveau === "dermato"
                ? "bg-[#A0522D] text-white focus-visible:outline-[#A0522D]"
                : "k-btn-gold text-primary-foreground focus-visible:outline-primary"
          }`}
        >
          {h.niveau === "urgence" ? <>Voir un professionnel aujourd'hui</> : <><CalendarPlus size={14} /> {h.niveau === "dermato" ? "Prendre RDV — avis dermatologique" : "Prendre RDV en institut partenaire"}</>}
        </button>
      )}
    </motion.article>
  );
}

function IndicatorBar({ ind, onAsk }: { ind: Indicator; onAsk?: (term: string) => void }) {
  // Garde double: severite absente (anciens resultJson) → NaN index → 0;
  // index hors bornes → clamp 0..3; SEVERITY_STYLES[i] résolu UNE fois.
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
                    aria-label={`Diagnostic ${d.zone} du ${formatDate(d.createdAt)}, score ${d.scoreGlobal}${d.institut ? `, en institut ${d.institut}` : ""}`}
                  >
                    {diagImgSrc(d.imageData) ? (
                      <img src={diagImgSrc(d.imageData)} alt={`Diagnostic ${d.zone}`} loading="lazy" className="h-14 w-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded-xl grid place-items-center bg-muted shrink-0" aria-hidden="true">
                        <Building2 size={20} className="text-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{BODY_ZONES.find((z) => z.id === d.zone)?.label ?? d.zone}</p>
                      {d.institut ? (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span>{formatDate(d.createdAt)}</span>
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/12 px-1.5 py-px text-[9px] font-bold text-primary">
                            <Building2 size={9} aria-hidden="true" /> En institut · {d.institut}{d.practitioner ? ` — ${d.practitioner}` : ""}
                          </span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">{formatDate(d.createdAt)} · Self-scan</p>
                      )}
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
                    <BeforeAfterSlider
                      before={{
                        imageUrl: diagImgSrc(a.imageData),
                        label: `Avant (${formatDate(a.createdAt, { day: "numeric", month: "short" })})`,
                        date: formatDate(a.createdAt),
                        score: ra.score_global,
                      }}
                      after={{
                        imageUrl: diagImgSrc(b.imageData),
                        label: `Après (${formatDate(b.createdAt, { day: "numeric", month: "short" })})`,
                        date: formatDate(b.createdAt),
                        score: rb.score_global,
                      }}
                      zoneLabel={BODY_ZONES.find((z) => z.id === a.zone)?.label}
                      showSpectralUvToggle={true}
                    />
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
