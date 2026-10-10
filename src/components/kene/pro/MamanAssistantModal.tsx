"use client";
// Kènè Pro — L'Assistante Intelligente de la Maman
// Permet à la gérante de dicter ou taper son point après chaque soin/vente/dépense,
// et renseigne automatiquement tous les onglets (Caisse, Stock, CRM, Agenda, Équipe, Relance, Compta).
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MamanOrb3D, type OrbState } from "./MamanOrb3D";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coins,
  Crown,
  History,
  Lightbulb,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Send,
  ShoppingBag,
  Square,
  Stethoscope,
  Trash2,
  UserCheck,
  Users,
  Volume2,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { CauriIcon } from "@/components/kene/icons";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { fetchTtsAudioUrl, speakBrowserVoice, stopBrowserVoice, unlockAudioContext } from "../client/ttsAudio";
import { pickRecorderMime, transcribeAudioBlob } from "@/lib/kene/audio-recorder";
import type { DebriefResult } from "@/app/api/pro/assistant/debrief/route";

interface MamanAssistantModalProps {
  tenantId: string;
  tenantName: string;
  isOpen: boolean;
  onClose: () => void;
  onActionExecuted: () => void;
}

const QUICK_EXAMPLES = [
  {
    label: "Soin + Produit + RDV",
    text: "J'ai fait le soin visage éclat à 15 000 F payé par Wave avec Tantie Salimata. Elle a aussi pris un baume karité à 8 000 F en espèces. Mariam l'a massée. Salimata a la peau sèche. Elle revient dans 3 semaines pour son contrôle.",
  },
  {
    label: "Paiement partiel / Crédit",
    text: "Soin complet à 20 000 F pour Mme Bamba. Elle a donné 15 000 F par Orange Money et complètera les 5 000 F restants vendredi prochain.",
  },
  {
    label: "Dépense petite caisse",
    text: "J'ai pris 3 500 F dans la caisse pour acheter de l'eau minérale pour les clientes et payer l'électricité du salon.",
  },
  {
    label: "Vente produit seul",
    text: "Vente de 2 savons moringa à 5 000 F en espèces à une cliente de passage Awa.",
  },
];

export function MamanAssistantModal({
  tenantId,
  tenantName,
  isOpen,
  onClose,
  onActionExecuted,
}: MamanAssistantModalProps) {
  const [tab, setTab] = useState<"action" | "daily">("action");
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [debrief, setDebrief] = useState<DebriefResult | null>(null);
  const [executionDone, setExecutionDone] = useState(false);

  // État audio TTS pour écouter le retour vocal de l'Assistante
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Données du Point du Soir
  const [dailyData, setDailyData] = useState<{
    total: number;
    waveTotal: number;
    orangeTotal: number;
    cashTotal: number;
    cardTotal: number;
    salesCount: number;
    uniqueClientsCount: number;
    servicesCount: number;
    productsCount: number;
    lowStockProducts: Array<{ id: string; name: string; stock: number; stockAlert: number }>;
    vocalSummary: string;
  } | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);

  // État 3D de l'Orbe Sacré
  const orbState: OrbState = useMemo(() => {
    if (executionDone) return "success";
    if (audioState === "playing") return "speaking";
    if (analyzing || executing || isTranscribing) return "analyzing";
    if (isRecording) return "listening";
    return "idle";
  }, [executionDone, audioState, analyzing, executing, isTranscribing, isRecording]);

  function stopVoiceRecording() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      try {
        void audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }
  }

  // Nettoyage audio
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      stopVoiceRecording();
    };
  }, []);

  async function startListening() {
    unlockAudioContext();
    audioRef.current?.pause();
    stopBrowserVoice();
    setAudioState("idle");

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Votre navigateur ne permet pas l'enregistrement audio direct");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(1, Math.max(0, avg / 80)));
            animFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }
      } catch {}

      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = audioChunksRef.current;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });

        const currentText = text.trim();
        if (currentText.length >= 6) {
          setIsTranscribing(false);
          setIsRecording(false);
          haptic(HAPTIC.success);
          void handleAnalyze(currentText);
          return;
        }

        if (blob.size > 800) {
          setIsTranscribing(true);
          try {
            const transcribed = await transcribeAudioBlob(blob);
            setIsTranscribing(false);
            if (transcribed.trim()) {
              setText(transcribed.trim());
              haptic(HAPTIC.success);
              void handleAnalyze(transcribed.trim());
            } else {
              toast.info("Aucune parole distincte captée — Vous pouvez dicter à nouveau ou écrire.");
            }
          } catch {
            setIsTranscribing(false);
            toast.error("Impossible de transcrire l'audio — Veuillez écrire votre texte.");
          }
        } else {
          toast.info("Enregistrement très court — Parlez librement, Maman.");
        }

        setIsRecording(false);
      };

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const reco = new SpeechRecognition();
          reco.continuous = true;
          reco.interimResults = true;
          reco.lang = "fr-FR";

          reco.onresult = (event: any) => {
            let transcript = "";
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript + " ";
            }
            setText(transcript.trim());
          };

          reco.onerror = () => {};
          reco.start();
          speechRecognitionRef.current = reco;
        } catch {}
      }

      setText("");
      setDebrief(null);
      setExecutionDone(false);
      setIsRecording(true);
      recorder.start(250);

      haptic(HAPTIC.success);
      toast.info("J'écoute, Maman… Parle naturellement 🎙️");
    } catch (err: any) {
      stopVoiceRecording();
      setIsRecording(false);
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        toast.error("Accès micro refusé — Veuillez l'autoriser dans les paramètres du navigateur.");
      } else {
        toast.error("Impossible d'activer le microphone.");
      }
    }
  }

  function stopListening() {
    if (!isRecording) return;
    haptic(HAPTIC.light);
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
    }
    stopVoiceRecording();
  }

  function toggleListening() {
    if (isRecording) {
      stopListening();
    } else {
      void startListening();
    }
  }

  // Lecture TTS de la réponse vocale (cloud → fallback navigateur)
  async function playVocalSummary(spokenText: string) {
    if (audioState === "playing") {
      audioRef.current?.pause();
      stopBrowserVoice();
      setAudioState("idle");
      return;
    }

    setAudioState("loading");
    unlockAudioContext();

    // 1) Essayer le TTS cloud (si disponible)
    try {
      const url = await fetchTtsAudioUrl(spokenText, 1, "fr");
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setAudioState("idle");
      audio.onerror = () => {
        fallbackBrowserTts(spokenText);
      };
      await audio.play();
      setAudioState("playing");
      return;
    } catch {
      // Cloud TTS indisponible → bascule instantanée sur la synthèse navigateur
    }

    // 2) Fallback: Web Speech API du navigateur (gratuit, hors-ligne)
    fallbackBrowserTts(spokenText);
  }

  function fallbackBrowserTts(spokenText: string) {
    const started = speakBrowserVoice(spokenText, {
      lang: "fr-FR",
      rate: 0.95,
      pitch: 1.02,
      onStart: () => setAudioState("playing"),
      onEnd: () => setAudioState("idle"),
      onError: (err) => {
        setAudioState("idle");
        console.warn("[tts:browser] error:", err);
      },
    });

    if (!started) {
      setAudioState("idle");
    }
  }

  // Analyser le débriefing
  async function handleAnalyze(overrideText?: string) {
    const query = (overrideText ?? text).trim();
    if (!query) {
      toast.error("Maman, dis-moi ou écris ce qui s'est passé !");
      return;
    }

    if (isRecording) {
      stopListening();
    }

    setAnalyzing(true);
    haptic(HAPTIC.light);

    try {
      const res = await apiPost<{ debrief: DebriefResult }>("/api/pro/assistant/debrief", {
        tenantId,
        text: query,
      });
      setDebrief(res.debrief);
      toast.success("Point analysé avec succès");
      // Démarrer la lecture vocale bienveillante pour la Maman
      if (res.debrief.vocalSummary) {
        void playVocalSummary(res.debrief.vocalSummary);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'analyse");
    } finally {
      setAnalyzing(false);
    }
  }



  // Exécuter et enregistrer dans tous les onglets
  async function handleExecute() {
    if (!debrief) return;

    setExecuting(true);
    haptic(HAPTIC.success);

    try {
      await apiPost("/api/pro/assistant/execute", {
        tenantId,
        debrief,
      });

      setExecutionDone(true);
      onActionExecuted();
      toast.success("Tout a été renseigné dans vos onglets, Maman ! 👑");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer le point");
    } finally {
      setExecuting(false);
    }
  }

  // Charger le Point du Soir
  async function loadDailySummary() {
    setLoadingDaily(true);
    try {
      const res = await apiGet<{ summary: any }>(`/api/pro/assistant/daily-summary?tenantId=${tenantId}`);
      setDailyData(res.summary);
      if (res.summary.vocalSummary) {
        void playVocalSummary(res.summary.vocalSummary);
      }
    } catch {
      toast.error("Impossible de charger le bilan de la journée");
    } finally {
      setLoadingDaily(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[28px] border-2 border-[#C8951E]/50 bg-[#16110D] text-[#F8F1E4] shadow-2xl overflow-hidden">
        {/* Liseré Kente signature en haut */}
        <div
          className="h-2 w-full shrink-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg,#8B1A3B 0 16px,#346834 16px 28px,#C8951E 28px 40px,#E07A2B 40px 52px,#A0522D 52px 64px)",
          }}
        />

        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-tr from-[#C8951E] to-[#E07A2B] text-[#16110D] font-black shadow-lg">
              <Crown size={22} />
            </span>
            <div>
              <h2 className="font-heading font-black text-base sm:text-lg flex items-center gap-2">
                Assistante de la Maman
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40">
                  IA Pro
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Fais ton point oral ou écrit — je m&apos;occupe de tous les onglets
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </header>

        {/* Onglets du modal : Action vs Point du Soir */}
        <div className="px-5 pt-3 shrink-0">
          <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-2xl border border-white/10 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setTab("action");
                audioRef.current?.pause();
                setAudioState("idle");
              }}
              className={`h-9 rounded-xl flex items-center justify-center gap-2 transition-all ${
                tab === "action" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CauriIcon size={14} /> Débriefing d&apos;action
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("daily");
                audioRef.current?.pause();
                setAudioState("idle");
                void loadDailySummary();
              }}
              className={`h-9 rounded-xl flex items-center justify-center gap-2 transition-all ${
                tab === "daily" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Moon size={14} /> Le Point du Soir (Clôture)
            </button>
          </div>
        </div>

        {/* Contenu défilable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === "action" && (
            <>
              {!debrief && !executionDone && (
                <div className="space-y-3">
                  {/* L'Orbe Sacré Cauri 3D dans la modale */}
                  <div className="flex flex-col items-center justify-center py-1">
                    <MamanOrb3D
                      state={orbState}
                      onClick={toggleListening}
                      size={180}
                      audioLevel={audioLevel}
                      className="mx-auto"
                    />
                    <p className="text-[11px] font-semibold text-[#E8C9A0] mt-1">
                      {isRecording ? "🎙️ L'Orbe écoute… Parlez librement" : "✨ Touchez l'Orbe ou cliquez pour dicter"}
                    </p>
                  </div>

                  {/* Zone de saisie principale avec micro */}
                  <div className="relative rounded-[22px] border border-[#C8951E]/40 bg-[#1F1712] p-3.5 focus-within:ring-2 focus-within:ring-[#C8951E]/60 transition-all">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Maman, parle ou écris ton point ici... Exemple : J'ai fait le soin visage éclat à 15 000 F payé par Wave à Tantie Salimata, vendu un baume karité à 8 000 F en espèces..."
                      rows={4}
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 resize-none outline-none leading-relaxed"
                    />

                    <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-1">
                      {/* Bouton Microphone */}
                      <button
                        type="button"
                        onClick={toggleListening}
                        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                          isRecording
                            ? "bg-red-500 text-white animate-pulse shadow-lg"
                            : "bg-[#C8951E]/20 text-[#C8951E] hover:bg-[#C8951E]/30"
                        }`}
                      >
                        {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
                        <span>{isRecording ? "J'écoute, Maman… (Arrêter)" : "Dicter au micro"}</span>
                      </button>

                      {text && (
                        <button
                          type="button"
                          onClick={() => setText("")}
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Effacer
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Puces d'exemples fréquents */}
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Lightbulb size={13} className="text-[#C8951E]" /> Exemples fréquents de salon :
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_EXAMPLES.map((ex, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setText(ex.text)}
                          className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left transition-all active:scale-[0.98]"
                        >
                          <p className="text-xs font-bold text-[#C8951E] leading-tight">{ex.label}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{ex.text}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bouton d'analyse */}
                  <button
                    type="button"
                    onClick={() => handleAnalyze()}
                    disabled={analyzing || !text.trim()}
                    className="w-full h-12 rounded-2xl k-btn-gold font-heading font-black text-sm text-primary-foreground flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-[0.99] transition-all"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Analyse des onglets en cours…
                      </>
                    ) : (
                      <>
                        <CauriIcon size={16} /> Analyser & Préparer les Onglets
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Écran d'Aperçu Interactif des Actions par Onglet */}
              {debrief && !executionDone && (
                <div className="space-y-4">
                  {/* Barre d'écoute vocale de confirmation */}
                  <div className="flex items-center justify-between p-3 rounded-2xl border border-[#C8951E]/40 bg-[#C8951E]/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <Volume2 size={18} className="text-[#C8951E] shrink-0" />
                      <p className="text-xs text-foreground font-medium truncate">
                        {debrief.vocalSummary}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => playVocalSummary(debrief.vocalSummary)}
                      className="shrink-0 ml-2 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
                    >
                      {audioState === "playing" ? (
                        <>
                          <Square size={12} /> Pause
                        </>
                      ) : audioState === "loading" ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <>
                          <Volume2 size={12} /> Réécouter
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Voici ce que je vais renseigner pour vous, Maman :
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Carte 1 : Caisse (POS) */}
                    {debrief.hasSale && debrief.sale && (
                      <div className="p-3.5 rounded-2xl border border-border bg-card/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-primary">
                            <Coins size={15} /> Caisse (POS)
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary">
                            {debrief.sale.paymentMethod}
                          </span>
                        </div>
                        <p className="font-mono font-black text-lg text-foreground">
                          {xof(debrief.sale.total)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {debrief.sale.items.map((it) => `${it.qty}× ${it.label}`).join(", ")}
                        </p>
                        {/* Alerte reste à payer / ardoise */}
                        {debrief.sale.remainingDebt > 0 && (
                          <div className="mt-2 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 font-bold">
                            ⚠️ Reste à compléter : {xof(debrief.sale.remainingDebt)} (Inscrit au carnet CRM)
                          </div>
                        )}
                      </div>
                    )}

                    {/* Carte 2 : Stock */}
                    {debrief.hasStockMovement && debrief.stock && (
                      <div className="p-3.5 rounded-2xl border border-border bg-card/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-success">
                            <Package size={15} /> Stock (Inventaire)
                          </span>
                          <span className="text-[10px] font-bold text-success">Sortie auto</span>
                        </div>
                        {debrief.stock.decrements.map((dec, idx) => (
                          <div key={idx} className="space-y-1 pt-1">
                            <p className="text-xs font-bold text-foreground">
                              −{dec.qty} {dec.productName}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Nouveau stock : <span className="font-mono font-bold text-foreground">{dec.newStock}</span> pots restants
                            </p>
                            {dec.isLowStock && (
                              <button
                                type="button"
                                onClick={() => {
                                  const msg = `Bonjour Kènè ! 📦 Je souhaite commander un réassort urgent pour *${dec.productName}*. Il ne nous reste que ${dec.newStock} unités au salon *${tenantName}*. Merci !`;
                                  openWhatsApp("", msg);
                                }}
                                className="mt-1.5 w-full py-1.5 rounded-xl bg-[#25D366] text-white text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition"
                              >
                                <MessageCircle size={12} /> Réassort WhatsApp Fournisseur
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Carte 3 : CRM (Cliente) */}
                    {debrief.hasClient && debrief.client && (
                      <div className="p-3.5 rounded-2xl border border-border bg-card/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-gold-text">
                            <UserCheck size={15} /> CRM (Fiche Cliente)
                          </span>
                          <span className="text-[10px] text-muted-foreground">Visite +1</span>
                        </div>
                        <p className="font-heading font-black text-sm text-foreground">
                          {debrief.client.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {debrief.client.skinNotes || "Soins réguliers"}
                        </p>
                      </div>
                    )}

                    {/* Carte 4 : Agenda (RDV) */}
                    {debrief.hasAppointment && debrief.appointment && (
                      <div className="p-3.5 rounded-2xl border border-border bg-card/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-primary">
                            <CalendarDays size={15} /> Agenda (Prochain RDV)
                          </span>
                          <span className="text-[10px] font-bold text-primary">Calé</span>
                        </div>
                        <p className="text-xs font-bold text-foreground">
                          {debrief.appointment.serviceName}
                        </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock size={11} /> {new Date(debrief.appointment.dateStr).toLocaleDateString("fr-FR")} à {debrief.appointment.timeStr || "11:00"}
                        </p>
                      </div>
                    )}

                    {/* Carte 5 : Équipe & Paie */}
                    {debrief.hasTeamCredit && debrief.team && (
                      <div className="p-3.5 rounded-2xl border border-border bg-card/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                            <Users size={15} /> Équipe (Paie)
                          </span>
                          <span className="text-[10px] font-bold text-foreground">{debrief.team.employeeName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Commission estimée : <span className="font-mono font-bold text-foreground">+{xof(debrief.team.commissionAmount)}</span>
                        </p>
                        {debrief.team.tipAmount > 0 && (
                          <p className="text-[11px] text-gold-text font-bold">
                            Pourboire cliente : +{xof(debrief.team.tipAmount)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Carte 6 : Dépense Petite Caisse */}
                    {debrief.hasExpense && debrief.expense && (
                      <div className="p-3.5 rounded-2xl border border-red-500/30 bg-red-500/10 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-red-400">
                            <Wallet size={15} /> Sortie Petite Caisse
                          </span>
                          <span className="text-[10px] font-bold text-red-400">Comptabilisé</span>
                        </div>
                        <p className="font-mono font-black text-base text-white">
                          −{xof(debrief.expense.amount)}
                        </p>
                        <p className="text-[11px] text-red-200/80">
                          {debrief.expense.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Boutons d'action finale */}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDebrief(null)}
                      className="h-12 px-4 rounded-2xl border border-white/20 hover:bg-white/10 text-xs font-bold"
                    >
                      Corriger
                    </button>
                    <button
                      type="button"
                      onClick={handleExecute}
                      disabled={executing}
                      className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-heading font-black text-sm flex items-center justify-center gap-2 shadow-xl active:scale-[0.99] transition-all disabled:opacity-50"
                    >
                      {executing ? (
                        <>
                          <Loader2 size={18} className="animate-spin" /> Enregistrement dans tous les onglets…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={18} /> Valider & Renseigner dans tous les onglets 🚀
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Écran de confirmation de réussite */}
              {executionDone && (
                <div className="text-center py-6 space-y-4 animate-in zoom-in-95">
                  <div className="size-16 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center mx-auto ring-4 ring-emerald-500/30">
                    <CheckCircle2 size={36} />
                  </div>
                  <div>
                    <h3 className="font-heading font-black text-xl text-white">
                      C&apos;est enregistré, Maman ! 👑
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                      La caisse, le stock, la fiche cliente et l&apos;agenda ont été mis à jour instantanément.
                    </p>
                  </div>

                  {/* Partage Reçu WhatsApp Cliente */}
                  {debrief?.client && debrief.sale && (
                    <button
                      type="button"
                      onClick={() => {
                        const msg = `Bonjour ${debrief.client?.name} ! 🌸\n\nMerci infiniment pour votre passage chez *${tenantName}*.\n\n🧾 *Soins & Produits* : ${debrief.sale?.items.map((i) => i.label).join(", ")}\n💰 *Total réglé* : ${xof(debrief.sale?.paidAmount || 0)}\n${debrief.sale?.remainingDebt ? `⚠️ *Reste à compléter* : ${xof(debrief.sale.remainingDebt)}\n` : ""}\nPrenez bien soin de vous ! 🌿\n— *${tenantName}*`;
                        openWhatsApp(debrief.client?.phone || "", msg);
                      }}
                      className="w-full max-w-xs mx-auto h-11 rounded-2xl bg-[#25D366] text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition shadow-lg"
                    >
                      <MessageCircle size={16} /> Envoyer le reçu sur WhatsApp à la cliente
                    </button>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDebrief(null);
                        setExecutionDone(false);
                        setText("");
                      }}
                      className="px-6 h-11 rounded-2xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold text-white"
                    >
                      Faire un autre point
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Mode Point du Soir (Clôture) */}
          {tab === "daily" && (
            <div className="space-y-4">
              {loadingDaily ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-primary">
                  <Loader2 size={32} className="animate-spin" />
                  <p className="text-xs font-bold">Calcul du bilan de la journée…</p>
                </div>
              ) : dailyData ? (
                <div className="space-y-4">
                  {/* Carte Bilan Global */}
                  <div className="p-4 rounded-2xl border border-[#C8951E]/50 bg-gradient-to-br from-[#C8951E]/20 via-[#1F1712] to-[#120E0C] text-center space-y-1">
                    <p className="text-xs uppercase font-bold text-[#C8951E] tracking-widest">
                      Chiffre d&apos;Affaires du Jour
                    </p>
                    <p className="font-heading font-black text-3xl text-white">
                      {xof(dailyData.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dailyData.salesCount} ventes · {dailyData.uniqueClientsCount} clientes servies · {dailyData.servicesCount} soins
                    </p>
                  </div>

                  {/* Ventilation par Moyen de Paiement */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-3 rounded-xl border border-[#1BA5E0]/40 bg-[#1BA5E0]/10">
                      <p className="text-[10px] font-bold text-[#1BA5E0] uppercase">Wave</p>
                      <p className="font-mono font-black text-sm text-white mt-0.5">{xof(dailyData.waveTotal)}</p>
                    </div>
                    <div className="p-3 rounded-xl border border-[#FF6600]/40 bg-[#FF6600]/10">
                      <p className="text-[10px] font-bold text-[#FF6600] uppercase">Orange Money</p>
                      <p className="font-mono font-black text-sm text-white mt-0.5">{xof(dailyData.orangeTotal)}</p>
                    </div>
                    <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10">
                      <p className="text-[10px] font-bold text-emerald-400 uppercase">Espèces Caisse</p>
                      <p className="font-mono font-black text-sm text-white mt-0.5">{xof(dailyData.cashTotal)}</p>
                    </div>
                  </div>

                  {/* Alertes de Stock de fin de journée */}
                  {dailyData.lowStockProducts.length > 0 ? (
                    <div className="p-3.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                        <AlertTriangle size={15} /> {dailyData.lowStockProducts.length} produit(s) à recommander pour demain :
                      </div>
                      <div className="space-y-1">
                        {dailyData.lowStockProducts.map((p) => (
                          <div key={p.id} className="flex justify-between items-center text-xs text-white">
                            <span>{p.name}</span>
                            <span className="font-mono font-bold text-amber-300">Reste {p.stock} (Alerte {p.stockAlert})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-bold text-center">
                      ✓ Tous les stocks sont au vert pour demain !
                    </div>
                  )}

                  {/* Bouton pour réécouter le Point du Soir */}
                  <button
                    type="button"
                    onClick={() => playVocalSummary(dailyData.vocalSummary)}
                    className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition"
                  >
                    <Volume2 size={15} /> Écouter le bilan vocal du soir
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
