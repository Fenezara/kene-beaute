"use client";
// Kènè Pro — Section Assistante Intelligente de la Maman (Le Cockpit Royal de la Secrétaire IA)
// Expérience complète, riche et prestigieuse avec l'Orbe Sacré Cauri 3D sublimé,
// enregistrement audio tout-terrain (MediaRecorder + ASR Gemini / Whisper), réactivité vocale en temps réel,
// suggestions rapides de salon, 8 départements connectés et rituel du Point du Soir.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Crown,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Loader2,
  Receipt,
  Package,
  Users,
  Calendar,
  Wallet,
  UserCheck,
  Bell,
  BookOpen,
  Moon,
  CheckCircle2,
  ArrowRight,
  Info,
  Sparkles,
  Edit3,
  RotateCcw,
  TrendingUp,
  AlertTriangle,
  X,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CauriIcon } from "@/components/kene/icons";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import {
  fetchTtsAudioUrl,
  speakBrowserVoice,
  stopBrowserVoice,
  unlockAudioContext,
} from "../client/ttsAudio";
import {
  pickRecorderMime,
  transcribeAudioBlob,
} from "@/lib/kene/audio-recorder";
import { MamanOrb3D, type OrbState } from "./MamanOrb3D";
import type { DebriefResult } from "@/app/api/pro/assistant/debrief/route";
import type { ProSectionId } from "./ProApp";

interface AssistantSectionProps {
  tenantId: string;
  tenantName: string;
  onNavigate?: (sec: ProSectionId) => void;
  refreshKey?: number;
}

const QUICK_EXAMPLES = [
  {
    tag: "Soin + Vente + RDV",
    desc: "Prestation cabine, vente produit et retour",
    text: "Tantie Aminata a fait son Soin Visage à 20 000 F par Wave, je lui ai vendu un baume de karité à 5 000 F en espèces et elle revient dans 3 semaines.",
  },
  {
    tag: "Dépense caisse",
    desc: "Petite caisse & fournitures salon",
    text: "J'ai pris 2 500 F dans la caisse pour acheter de l'eau minérale et des sachets pour les clientes.",
  },
  {
    tag: "Acompte & Ardoise",
    desc: "Paiement partiel et crédit cliente",
    text: "Mme Bintou a fait ses tresses 15 000 F, elle a versé 10 000 F par Orange Money, il lui reste 5 000 F d'ardoise pour vendredi.",
  },
  {
    tag: "Vente comptoir",
    desc: "Produits de beauté au comptoir",
    text: "Awa a vendu 2 sérums éclat à 16 000 F en espèces au comptoir.",
  },
];

export function AssistantSection({
  tenantId,
  tenantName,
  onNavigate,
}: AssistantSectionProps) {
  // Mode de travail : Débriefing instantané ou Bilan du soir
  const [activeTab, setActiveTab] = useState<"instant" | "evening">("instant");

  // Débriefing
  const [text, setText] = useState("");
  const [isEditingText, setIsEditingText] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [debrief, setDebrief] = useState<DebriefResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);

  // Audio TTS
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Enregistrement Audio Matériel & Web Audio API
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Bilan du soir
  const [eveningData, setEveningData] = useState<{
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
  const [loadingEvening, setLoadingEvening] = useState(false);

  // Détermination de l'état 3D de l'Orbe
  const orbState: OrbState = useMemo(() => {
    if (executed) return "success";
    if (audioState === "playing") return "speaking";
    if (loading || executing || isTranscribing) return "analyzing";
    if (isRecording) return "listening";
    return "idle";
  }, [executed, audioState, loading, executing, isTranscribing, isRecording]);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      stopBrowserVoice();
      stopVoiceRecording();
    };
  }, []);

  /* ───────────────────────── Synthèse Vocale TTS ───────────────────────── */

  const togglePlayVocalSummary = useCallback(async (spokenText: string) => {
    if (audioState === "playing") {
      audioRef.current?.pause();
      stopBrowserVoice();
      setAudioState("idle");
      return;
    }

    setAudioState("loading");
    unlockAudioContext();

    // 1) Essai du TTS Cloud Kènè
    try {
      const url = await fetchTtsAudioUrl(spokenText, 1, "fr");
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setAudioState("idle");
      audio.onerror = () => fallbackBrowserVoice(spokenText);
      await audio.play();
      setAudioState("playing");
      return;
    } catch {}

    // 2) Fallback voix locale navigateur
    fallbackBrowserVoice(spokenText);
  }, [audioState]);

  function fallbackBrowserVoice(spokenText: string) {
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

    if (!started) setAudioState("idle");
  }

  /* ───────────────────────── Analyse Débriefing ───────────────────────── */

  const handleAnalyze = useCallback(async (overrideText?: string) => {
    const query = (overrideText ?? text).trim();
    if (!query || loading) return;

    setLoading(true);
    setDebrief(null);
    setExecuted(false);
    haptic(HAPTIC.medium);

    try {
      const res = await apiPost<{ debrief: DebriefResult }>("/api/pro/assistant/debrief", {
        tenantId,
        text: query,
      });

      setDebrief(res.debrief);
      toast.success("L'Orbe a pesé et ventilé votre point !");

      // Écoute automatique de la réponse vocale bienveillante
      if (res.debrief.vocalSummary) {
        void togglePlayVocalSummary(res.debrief.vocalSummary);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }, [loading, tenantId, text, togglePlayVocalSummary]);

  /* ───────────────────────── Moteur Vocal Tout-Terrain ───────────────────────── */

  function stopVoiceRecording() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
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

  async function startListening() {
    unlockAudioContext();
    audioRef.current?.pause();
    stopBrowserVoice();
    setAudioState("idle");

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Votre navigateur ne permet pas l'enregistrement audio direct");
      setIsEditingText(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      // Mesure de volume Web Audio pour animer l'Orbe 3D
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
            const normalized = Math.min(1, Math.max(0, avg / 75));
            setAudioLevel(normalized);
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
            setIsEditingText(true);
          }
        } else {
          toast.info("Enregistrement très court — Parlez librement, Maman.");
        }

        setIsRecording(false);
      };

      // Web Speech API streaming si supportée
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
      setExecuted(false);
      setRecordElapsed(0);
      setIsRecording(true);
      recorder.start(250);

      recordTimerRef.current = setInterval(() => {
        setRecordElapsed((s) => s + 1);
      }, 1000);

      haptic(HAPTIC.success);
      toast.info("L'Orbe écoute, Maman… Parlez librement 🎙️");
    } catch (err: any) {
      stopVoiceRecording();
      setIsRecording(false);
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        toast.error("Accès micro refusé — Veuillez l'autoriser dans les paramètres du navigateur.");
      } else {
        toast.error("Impossible d'activer le microphone.");
      }
      setIsEditingText(true);
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

  /* ───────────────────────── Validation Atomique 1-Tap ───────────────────────── */

  async function handleExecute() {
    if (!debrief || executing) return;
    setExecuting(true);
    haptic(HAPTIC.success);

    try {
      const res = await apiPost<{ ok: boolean; message: string }>("/api/pro/assistant/execute", {
        tenantId,
        debrief,
      });
      setExecuted(true);
      toast.success(res.message || "Toutes les écritures ont été enregistrées avec succès !");
      haptic(HAPTIC.success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
    } finally {
      setExecuting(false);
    }
  }

  /* ───────────────────────── Bilan du Soir ───────────────────────── */

  async function loadEveningSummary() {
    setLoadingEvening(true);
    try {
      const res = await apiGet<{ summary: any }>(`/api/pro/assistant/daily-summary?tenantId=${tenantId}`);
      setEveningData(res.summary);
      if (res.summary.vocalSummary) {
        void togglePlayVocalSummary(res.summary.vocalSummary);
      }
    } catch {
      toast.error("Impossible de charger le bilan du soir");
    } finally {
      setLoadingEvening(false);
    }
  }

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 select-none animate-in fade-in duration-300">
      {/* ─── 1. EN-TÊTE SOUVERAIN AVEC BASCULE DES RITUELS ─── */}
      <div className="relative overflow-hidden rounded-[32px] border border-[#C8951E]/40 bg-gradient-to-b from-[#1F1712] via-card to-background p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-gradient-to-r from-[#C8951E] via-[#FFD700] to-[#E07A2B] text-[#16110D] font-black px-3.5 py-1 text-xs shadow-md">
                👑 ORBE SOUVERAIN · SECRÉTAIRE IA DE DIRECTION
              </Badge>
              <Badge variant="outline" className="border-[#C8951E]/40 text-[#E8C9A0] text-xs">
                {tenantName}
              </Badge>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                Connecté en direct ⚡
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-black text-foreground tracking-tight">
              L&apos;Orbe Sacré de la Maman
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Votre secrétaire de direction intelligente. Dictez votre point après chaque soin, vente ou dépense : l&apos;Orbe Cauri écoute votre voix et renseigne instantanément <strong>la Caisse, le Stock, le CRM, l&apos;Agenda, les Relances et la Compta</strong>.
            </p>
          </div>

          {/* Sélecteur de rituel (Instant vs Bilan du Soir) */}
          <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/10 shrink-0 self-start md:self-center shadow-inner">
            <button
              type="button"
              onClick={() => {
                setActiveTab("instant");
                audioRef.current?.pause();
                setAudioState("idle");
              }}
              className={`h-11 px-4 sm:px-5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === "instant"
                  ? "bg-gradient-to-r from-[#C8951E] to-[#E07A2B] text-[#16110D] shadow-lg scale-100"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CauriIcon size={16} />
              <span>Débriefing d&apos;Action</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("evening");
                audioRef.current?.pause();
                setAudioState("idle");
                void loadEveningSummary();
              }}
              className={`h-11 px-4 sm:px-5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === "evening"
                  ? "bg-gradient-to-r from-[#C8951E] to-[#E07A2B] text-[#16110D] shadow-lg scale-100"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Moon size={16} />
              <span>Le Point du Soir</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── ONGLET 1 : DÉBRIEFING D'ACTION AVEC L'ORBE SUBLIMÉ ─── */}
      {activeTab === "instant" && (
        <div className="space-y-6">
          {/* ─── SCÈNE 3D CENTRALE DE L'ORBE SACRÉ ─── */}
          <div className="relative rounded-[36px] border border-[#C8951E]/30 bg-radial from-[#2A1C12]/85 via-card/95 to-background/90 p-6 sm:p-10 shadow-2xl flex flex-col items-center justify-center text-center overflow-hidden">
            {/* Lueur d'or ambiante en arrière-plan */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-96 h-80 sm:h-96 rounded-full bg-[#C8951E]/15 blur-3xl pointer-events-none" />

            {/* L'Orbe 3D Sublimé : Triple Anneau Gyroscopique Ashanti & Cauri Nacré */}
            <div className="relative z-10 mb-2">
              <MamanOrb3D
                state={orbState}
                onClick={toggleListening}
                size={290}
                audioLevel={audioLevel}
                className="transition-transform active:scale-95 mx-auto"
              />
            </div>

            {/* Légende & Statut Parlant de l'Orbe */}
            <div className="relative z-10 space-y-3.5 max-w-lg mx-auto">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/50 border border-[#C8951E]/30 text-xs font-semibold text-[#E8C9A0] shadow-sm backdrop-blur-md">
                {isRecording ? (
                  <>
                    <span className="size-2 rounded-full bg-red-500 animate-ping" />
                    <span className="font-mono text-amber-300 font-bold">
                      {formatSeconds(recordElapsed)}
                    </span>
                    <span>· L&apos;Orbe écoute votre parole… Parlez naturellement</span>
                  </>
                ) : isTranscribing ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-amber-400" />
                    <span>Transcription de votre voix en cours…</span>
                  </>
                ) : loading || executing ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-[#C8951E]" />
                    <span>L&apos;Orbe pèse l&apos;or et ventile vos écritures…</span>
                  </>
                ) : audioState === "playing" ? (
                  <>
                    <Volume2 size={13} className="text-emerald-400 animate-pulse" />
                    <span>L&apos;Assistante vous répond…</span>
                  </>
                ) : executed ? (
                  <>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    <span>Point scellé et enregistré avec succès !</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-[#C8951E]" />
                    <span>Touchez l&apos;Orbe ou le micro pour dicter votre point</span>
                  </>
                )}
              </div>

              {/* Grand Bouton Tactile d'Invocation */}
              <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  type="button"
                  onClick={toggleListening}
                  disabled={loading || isTranscribing}
                  className={`h-14 px-8 rounded-2xl font-black text-sm tracking-wide shadow-xl flex items-center gap-3 transition-all ${
                    isRecording
                      ? "bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white animate-pulse hover:brightness-110"
                      : "k-btn-gold text-primary-foreground hover:scale-105 active:scale-95"
                  }`}
                >
                  {isRecording ? (
                    <>
                      <MicOff size={20} className="animate-bounce" />
                      <span>Terminer l&apos;écoute &amp; Analyser</span>
                    </>
                  ) : (
                    <>
                      <Mic size={20} className="animate-pulse" />
                      <span>Parle-moi, Maman… 🎙️</span>
                    </>
                  )}
                </Button>

                {text.trim() && !isRecording && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleAnalyze()}
                    disabled={loading || isTranscribing}
                    className="h-14 px-6 rounded-2xl border-[#C8951E]/40 hover:bg-[#C8951E]/15 text-foreground font-bold text-sm flex items-center gap-2"
                  >
                    <Send size={18} className="text-[#C8951E]" />
                    <span>Analyser le texte</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Bulle de Retranscription Vocale en Direct */}
            {(text.trim() || isEditingText) && (
              <div className="relative z-10 w-full max-w-2xl mt-5 p-4 rounded-2xl bg-black/50 border border-[#C8951E]/30 text-left backdrop-blur-md space-y-2 animate-in fade-in slide-in-from-bottom-2 shadow-lg">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-bold flex items-center gap-1.5 text-[#E8C9A0]">
                    <CauriIcon size={14} /> Votre parole retranscrite :
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingText(!isEditingText)}
                      className="flex items-center gap-1 text-[#C8951E] hover:underline"
                    >
                      <Edit3 size={13} />
                      <span>{isEditingText ? "Valider le texte" : "Modifier"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setText("");
                        setIsEditingText(false);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Effacer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {isEditingText ? (
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl bg-background/80 text-sm border-border p-3 focus-visible:ring-primary"
                    placeholder="Tapez votre compte-rendu ici..."
                  />
                ) : (
                  <p className="text-sm text-foreground/95 leading-relaxed font-medium italic">
                    &laquo; {text} &raquo;
                  </p>
                )}
              </div>
            )}

            {/* ─── SUGGESTIONS RAPIDES DE SALON EN 1-TAP (INDISPENSABLES) ─── */}
            <div className="relative z-10 w-full max-w-2xl mt-6 pt-5 border-t border-white/10 space-y-3 text-left">
              <p className="text-xs font-bold text-[#FFD700] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#C8951E]" />
                <span>Suggestions rapides de salon (test en 1-tap) :</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {QUICK_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setText(ex.text);
                      setIsEditingText(false);
                      haptic(HAPTIC.light);
                      toast.info(`Exemple « ${ex.tag} » chargé ! Cliquez sur Analyser.`);
                    }}
                    className="text-left p-3 rounded-2xl bg-white/5 hover:bg-[#C8951E]/15 border border-white/10 hover:border-[#C8951E]/40 transition group space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#FFD700] group-hover:text-foreground transition-colors">
                        {ex.tag}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{ex.desc}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground group-hover:text-foreground/90 line-clamp-2 leading-relaxed italic">
                      &laquo; {ex.text} &raquo;
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── PÉPITES D'OR : RÉSULTATS DU DÉBRIEFING & DISPATCHING ─── */}
          {debrief && (
            <div className="space-y-6 rounded-[32px] border border-[#C8951E]/40 bg-card p-6 sm:p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
              {/* Carte de Réponse Vocale de l'Assistante */}
              {debrief.vocalSummary && (
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#C8951E]/20 via-[#C8951E]/10 to-transparent border border-[#C8951E]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <button
                      type="button"
                      onClick={() => togglePlayVocalSummary(debrief.vocalSummary)}
                      className="size-12 rounded-2xl bg-[#C8951E]/30 hover:bg-[#C8951E]/50 flex items-center justify-center shrink-0 text-[#C8951E] transition-all shadow-md active:scale-95"
                      title={audioState === "playing" ? "Arrêter la voix" : "Écouter l'Assistante"}
                    >
                      {audioState === "loading" ? (
                        <Loader2 size={22} className="animate-spin" />
                      ) : audioState === "playing" ? (
                        <VolumeX size={22} className="animate-pulse text-amber-400" />
                      ) : (
                        <Volume2 size={22} />
                      )}
                    </button>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-[#FFD700] uppercase tracking-wider">
                          👑 Réponse de votre Assistante :
                        </p>
                        {audioState === "playing" && (
                          <Badge className="bg-emerald-600 text-white text-[10px] py-0 px-2 animate-pulse">
                            En écoute 🔊
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm sm:text-base text-foreground font-medium italic leading-relaxed">
                        &laquo; {debrief.vocalSummary} &raquo;
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => togglePlayVocalSummary(debrief.vocalSummary)}
                    className="shrink-0 border-[#C8951E]/40 hover:bg-[#C8951E]/20 text-xs font-bold self-end sm:self-center"
                  >
                    {audioState === "playing" ? "⏹️ Arrêter" : "🔊 Réécouter"}
                  </Button>
                </div>
              )}

              {/* Grille des Pépites d'Or ventilées */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  <span>Pépites d&apos;actions prêtes à ventiler :</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {/* Pépite Caisse */}
                  {debrief.hasSale && debrief.sale && (
                    <div className="p-4 rounded-2xl border border-[#C8951E]/30 bg-background/80 space-y-1.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                          <Receipt size={15} className="text-[#C8951E]" /> Pépite Caisse
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/40">
                          {debrief.sale.paymentMethod}
                        </Badge>
                      </div>
                      <p className="font-mono text-lg font-black text-gold-text">
                        {xof(debrief.sale.total)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {debrief.sale.items.length} prestation(s) / produit(s)
                      </p>
                    </div>
                  )}

                  {/* Pépite Stock */}
                  {debrief.hasStockMovement && debrief.stock?.decrements && (
                    <div className="p-4 rounded-2xl border border-border bg-background/80 space-y-1.5 shadow-sm">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                        <Package size={15} className="text-[#C8951E]" /> Pépite Stock
                      </span>
                      <p className="text-xs font-semibold text-foreground truncate">
                        {debrief.stock.decrements.map((d) => `${d.productName} (-${d.qty})`).join(", ")}
                      </p>
                      <p className="text-[11px] text-emerald-400 font-medium">Décompte automatique</p>
                    </div>
                  )}

                  {/* Pépite CRM Cliente */}
                  {debrief.hasClient && debrief.client && (
                    <div className="p-4 rounded-2xl border border-border bg-background/80 space-y-1.5 shadow-sm">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                        <Users size={15} className="text-[#C8951E]" /> Pépite Cliente CRM
                      </span>
                      <p className="text-xs font-bold text-foreground">{debrief.client.name}</p>
                      {debrief.client.debtAmount && debrief.client.debtAmount > 0 ? (
                        <p className="text-[11px] text-red-400 font-bold">
                          Reste à payer : {xof(debrief.client.debtAmount)}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">Fiche mise à jour</p>
                      )}
                    </div>
                  )}

                  {/* Pépite Agenda */}
                  {debrief.hasAppointment && debrief.appointment && (
                    <div className="p-4 rounded-2xl border border-border bg-background/80 space-y-1.5 shadow-sm">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                        <Calendar size={15} className="text-[#C8951E]" /> Pépite Agenda
                      </span>
                      <p className="text-xs font-semibold text-foreground">
                        {debrief.appointment.serviceName}
                      </p>
                      <p className="text-[11px] text-primary font-medium">Contrôle planifié</p>
                    </div>
                  )}

                  {/* Pépite Petite Caisse */}
                  {debrief.hasExpense && debrief.expense && (
                    <div className="p-4 rounded-2xl border border-border bg-background/80 space-y-1.5 shadow-sm">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                        <Wallet size={15} className="text-amber-400" /> Petite Caisse
                      </span>
                      <p className="font-mono text-lg font-black text-amber-400">
                        -{xof(debrief.expense.amount)}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{debrief.expense.description}</p>
                    </div>
                  )}

                  {/* Pépite Relance WhatsApp */}
                  {debrief.hasRelance && debrief.relance && (
                    <div className="p-4 rounded-2xl border border-border bg-background/80 space-y-1.5 shadow-sm">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                        <Bell size={15} className="text-[#C8951E]" /> Relance WhatsApp
                      </span>
                      <p className="text-xs text-muted-foreground truncate">
                        {debrief.relance.message}
                      </p>
                      <p className="text-[11px] text-primary font-medium">Prévue à J+{debrief.relance.delayDays}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bouton Triomphal de Validation Atomique */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/80">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Info size={14} className="text-[#C8951E]" />
                  <span>Ventilation garantie dans la Caisse, le Stock, le CRM et la Compta.</span>
                </div>

                <Button
                  type="button"
                  onClick={handleExecute}
                  disabled={executing || executed}
                  className="w-full sm:w-auto k-btn-gold h-14 px-10 rounded-2xl font-black text-primary-foreground shadow-2xl flex items-center justify-center gap-3 text-sm transition-all"
                >
                  {executed ? (
                    <>
                      <CheckCircle2 size={20} className="text-white" />
                      <span>Point scellé et enregistré avec succès !</span>
                    </>
                  ) : executing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>Ventilation dans tous les onglets en cours...</span>
                    </>
                  ) : (
                    <>
                      <Crown size={20} />
                      <span>Valider &amp; Sceller dans tous les onglets (1-Tap) 👑</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ONGLET 2 : LE POINT DU SOIR (RITUEL DE CLÔTURE) ─── */}
      {activeTab === "evening" && (
        <div className="space-y-6 rounded-[36px] border border-[#C8951E]/40 bg-radial from-[#1E1712] via-card to-background p-6 sm:p-10 shadow-2xl animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-heading font-black text-foreground flex items-center gap-2.5">
                <Moon size={22} className="text-[#FFD700]" />
                <span>Le Rituel du Point du Soir</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Clôture de journée en 30 secondes · Vérification des recettes, des stocks et conte de prospérité
              </p>
            </div>

            <Button
              type="button"
              onClick={loadEveningSummary}
              disabled={loadingEvening}
              className="k-btn-gold h-12 px-6 rounded-2xl font-bold text-primary-foreground shadow-md flex items-center gap-2 self-start sm:self-center"
            >
              {loadingEvening ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Calcul du bilan...</span>
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  <span>Actualiser le Bilan</span>
                </>
              )}
            </Button>
          </div>

          {loadingEvening ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-4 text-center">
              <Loader2 size={36} className="animate-spin text-[#C8951E]" />
              <p className="text-sm font-semibold text-foreground">
                L&apos;Orbe compile tous les encaissements et mouvements du jour…
              </p>
            </div>
          ) : eveningData ? (
            <div className="space-y-6">
              {/* Carte Synthèse Vocale */}
              {eveningData.vocalSummary && (
                <div className="p-5 rounded-2xl bg-[#C8951E]/15 border border-[#C8951E]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <button
                      type="button"
                      onClick={() => togglePlayVocalSummary(eveningData.vocalSummary)}
                      className="size-12 rounded-2xl bg-[#C8951E]/30 hover:bg-[#C8951E]/50 flex items-center justify-center shrink-0 text-[#C8951E] transition-all shadow-md active:scale-95"
                      title={audioState === "playing" ? "Arrêter la voix" : "Écouter le conte du soir"}
                    >
                      {audioState === "playing" ? (
                        <VolumeX size={22} className="animate-pulse text-amber-400" />
                      ) : (
                        <Volume2 size={22} />
                      )}
                    </button>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[#FFD700] uppercase tracking-wider">
                        🌙 Le Conte de Clôture de l&apos;Assistante :
                      </p>
                      <p className="text-sm text-foreground/90 italic leading-relaxed">
                        &laquo; {eveningData.vocalSummary} &raquo;
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => togglePlayVocalSummary(eveningData.vocalSummary)}
                    className="shrink-0 border-[#C8951E]/40 hover:bg-[#C8951E]/20 text-xs font-bold self-end sm:self-center"
                  >
                    {audioState === "playing" ? "⏹️ Arrêter" : "🔊 Écouter"}
                  </Button>
                </div>
              )}

              {/* Total Journée & Répartition */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-black/40 border border-[#C8951E]/40 space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-[#C8951E]" /> Total Encaissé
                  </span>
                  <p className="font-mono text-2xl font-black text-gold-text">
                    {xof(eveningData.total)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {eveningData.salesCount} encaissement(s) au total
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-black/40 border border-blue-500/30 space-y-1">
                  <span className="text-xs text-blue-400 font-semibold">🌊 Wave Money</span>
                  <p className="font-mono text-xl font-bold text-foreground">
                    {xof(eveningData.waveTotal)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Paiements directs Wave</p>
                </div>

                <div className="p-5 rounded-2xl bg-black/40 border border-orange-500/30 space-y-1">
                  <span className="text-xs text-orange-400 font-semibold">🍊 Orange Money</span>
                  <p className="font-mono text-xl font-bold text-foreground">
                    {xof(eveningData.orangeTotal)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Paiements Orange CI</p>
                </div>

                <div className="p-5 rounded-2xl bg-black/40 border border-emerald-500/30 space-y-1">
                  <span className="text-xs text-emerald-400 font-semibold">💵 Espèces en Caisse</span>
                  <p className="font-mono text-xl font-bold text-foreground">
                    {xof(eveningData.cashTotal)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Billets et pièces</p>
                </div>
              </div>

              {/* Statistiques Métier */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-2xl font-heading font-black text-foreground">
                    {eveningData.uniqueClientsCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Clientes servies</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-2xl font-heading font-black text-[#C8951E]">
                    {eveningData.servicesCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Soins cabine</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-2xl font-heading font-black text-[#E07A2B]">
                    {eveningData.productsCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Produits vendus</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-2xl font-heading font-black text-emerald-400">
                    {xof(eveningData.cardTotal)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Carte Bancaire</p>
                </div>
              </div>

              {/* Alertes de Stock Bas */}
              {eveningData.lowStockProducts.length > 0 && (
                <div className="p-5 rounded-2xl bg-red-950/20 border border-red-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                    <AlertTriangle size={15} />
                    <span>Attention Maman : {eveningData.lowStockProducts.length} produit(s) en rupture imminente</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {eveningData.lowStockProducts.map((p) => (
                      <span
                        key={p.id}
                        className="text-xs bg-red-900/30 text-red-200 border border-red-500/30 px-3 py-1 rounded-xl font-medium"
                      >
                        {p.name} : reste {p.stock} unité(s)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Cliquez sur &laquo; Actualiser le Bilan &raquo; pour compiler la journée.
            </div>
          )}
        </div>
      )}

      {/* ─── 4. LES 8 DÉPARTEMENTS CONNECTÉS & PILOTÉS PAR L'ORBE (INDISPENSABLES) ─── */}
      <div className="rounded-[32px] border border-border/80 bg-card/70 p-6 sm:p-7 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <CauriIcon size={18} className="text-[#C8951E]" />
            <h3 className="text-sm sm:text-base font-heading font-black text-foreground">
              Accéder directement aux onglets alimentés par l&apos;Orbe :
            </h3>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            Mise à jour automatique par votre secrétaire IA
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: "caisse" as ProSectionId, label: "Caisse", desc: "Wave, Orange & Cash", icon: Receipt },
            { id: "stock" as ProSectionId, label: "Stock", desc: "Cabine & Vente", icon: Package },
            { id: "crm" as ProSectionId, label: "CRM Clientes", desc: "Fiches & Ardoises", icon: Users },
            { id: "agenda" as ProSectionId, label: "Agenda RDV", desc: "Planning salon", icon: Calendar },
            { id: "relances" as ProSectionId, label: "Relances", desc: "Suivi WhatsApp", icon: Bell },
            { id: "equipe" as ProSectionId, label: "Équipe & Paie", desc: "Commissions", icon: UserCheck },
            { id: "compta" as ProSectionId, label: "SYSCOHADA", desc: "Comptabilité", icon: BookOpen },
            { id: "dashboard" as ProSectionId, label: "Tableau de bord", desc: "Pilotage général", icon: Crown },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptic(HAPTIC.light);
                onNavigate?.(item.id);
              }}
              className="flex items-center justify-between p-3.5 rounded-2xl border border-border/80 bg-background/60 hover:bg-[#C8951E]/10 hover:border-[#C8951E]/40 text-left transition group shadow-xs active:scale-98"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-8 rounded-xl bg-[#C8951E]/15 flex items-center justify-center shrink-0 text-[#C8951E] group-hover:bg-[#C8951E]/25 transition-colors">
                  <item.icon size={16} />
                </div>
                <div className="truncate">
                  <p className="text-xs font-bold text-foreground group-hover:text-[#FFD700] transition-colors truncate">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{item.desc}</p>
                </div>
              </div>
              <ArrowRight size={13} className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
