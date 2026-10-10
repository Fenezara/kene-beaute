"use client";
// Kènè Pro — Section Assistante Intelligente de la Maman (Plein Écran Dédié & Zéro Scroll)
// Expérience immersive souveraine avec l'Orbe Sacré Cauri 3D, reconnaissance vocale
// tout-terrain (MediaRecorder + ASR Gemini / Whisper + retour Web Speech), analyse en temps réel,
// retour vocal chaleureux et dispatching multi-onglets 1-Tap.

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
  ChevronUp,
  ChevronDown,
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
    text: "Tantie Aminata a fait son Soin Visage à 20 000 F par Wave, je lui ai vendu un baume de karité à 5 000 F en espèces et elle revient dans 3 semaines.",
  },
  {
    tag: "Dépense caisse",
    text: "J'ai pris 2 500 F dans la caisse pour acheter de l'eau minérale et des sachets pour les clientes.",
  },
  {
    tag: "Acompte & Ardoise",
    text: "Mme Bintou a fait ses tresses 15 000 F, elle a versé 10 000 F par Orange Money, il lui reste 5 000 F d'ardoise pour vendredi.",
  },
  {
    tag: "Vente comptoir",
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
  const [showDebriefSheet, setShowDebriefSheet] = useState(false);
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

  // Nettoyage complet au démontage
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

    // Déverrouillage préalable AudioContext
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

    // 2) Fallback voix locale du navigateur
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
      setShowDebriefSheet(true);
      toast.success("L'Orbe a pesé et ventilé votre point !");

      // Écoute automatique de la réponse bienveillante de l'Assistante
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
    // 1. Déverrouiller le moteur audio dès le tap utilisateur
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
      // 2. Demande d'accès au micro
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      // 3. Mesure de volume en temps réel pour animer l'Orbe 3D
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
            const normalized = Math.min(1, Math.max(0, avg / 80));
            setAudioLevel(normalized);
            animFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }
      } catch {}

      // 4. Initialisation du MediaRecorder
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

        // Si la reconnaissance en direct a déjà capté un texte complet (> 6 lettres)
        const currentText = text.trim();
        if (currentText.length >= 6) {
          setIsTranscribing(false);
          setIsRecording(false);
          haptic(HAPTIC.success);
          void handleAnalyze(currentText);
          return;
        }

        // Sinon, envoi au moteur ASR serveur (/api/asr Gemini / Whisper / Z.ai)
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

      // 5. Initialisation Web Speech API parallèle (streaming des mots en direct si disponible)
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

      // 6. Démarrage de l'enregistrement
      setText("");
      setDebrief(null);
      setExecuted(false);
      setShowDebriefSheet(false);
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
      console.warn("[kene:assistant:mic]", err);
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
      rec.stop(); // déclenche onstop -> ASR / analyze
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

  /* ───────────────────────── Point du Soir ───────────────────────── */

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
    <div className="relative flex-1 min-h-0 w-full h-full max-w-5xl mx-auto flex flex-col justify-between overflow-hidden select-none px-2 sm:px-4 py-1.5">
      {/* ─── 1. BARRE SUPÉRIEURE SOUVERAINE ULTRA-COMPACTE (48px) ─── */}
      <header className="shrink-0 flex items-center justify-between gap-3 border-b border-[#C8951E]/25 pb-2 pt-0.5">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Badge className="bg-gradient-to-r from-[#C8951E] via-[#FFD700] to-[#E07A2B] text-[#16110D] font-black px-2.5 py-0.5 text-[11px] shadow-sm shrink-0">
            👑 MAMAN ASSISTANTE
          </Badge>
          <span className="text-xs font-semibold text-muted-foreground truncate hidden sm:inline">
            {tenantName}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[#E8C9A0] font-medium bg-white/5 border border-[#C8951E]/20 rounded-full px-2.5 py-0.5 shrink-0">
            <span
              className={`size-2 rounded-full ${
                isRecording ? "bg-red-500 animate-ping" : "bg-emerald-400"
              }`}
            />
            <span className="hidden xs:inline">
              {isRecording ? "À l'écoute…" : "Prête"}
            </span>
          </span>
        </div>

        {/* Sélecteur de rituel (Instant vs Bilan du Soir) */}
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shrink-0 shadow-inner">
          <button
            type="button"
            onClick={() => {
              setActiveTab("instant");
              audioRef.current?.pause();
              setAudioState("idle");
            }}
            className={`h-8 px-3 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
              activeTab === "instant"
                ? "bg-gradient-to-r from-[#C8951E] to-[#E07A2B] text-[#16110D] shadow-md scale-100"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CauriIcon size={14} />
            <span className="hidden xs:inline">Débriefing</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("evening");
              audioRef.current?.pause();
              setAudioState("idle");
              void loadEveningSummary();
            }}
            className={`h-8 px-3 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
              activeTab === "evening"
                ? "bg-gradient-to-r from-[#C8951E] to-[#E07A2B] text-[#16110D] shadow-md scale-100"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Moon size={14} />
            <span className="hidden xs:inline">Point du Soir</span>
          </button>
        </div>
      </header>

      {/* ─── 2. SCÈNE CENTRALE : L'ORBE 3D IMMERSIF (ZÉRO SCROLL) ─── */}
      {activeTab === "instant" && (
        <main className="flex-1 min-h-0 flex flex-col items-center justify-center relative py-1 sm:py-3 text-center overflow-hidden">
          {/* Halo d'or chaud en arrière-plan */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 sm:w-80 h-64 sm:h-80 rounded-full bg-[#C8951E]/15 blur-3xl pointer-events-none" />

          {/* L'Orbe 3D Procédural Cauri & Anneaux Akan */}
          <div className="relative z-10 my-auto flex flex-col items-center justify-center">
            <MamanOrb3D
              state={orbState}
              onClick={toggleListening}
              size={260}
              audioLevel={audioLevel}
              className="transition-transform active:scale-95 mx-auto"
            />

            {/* Badge de Statut Vivant de l'Orbe */}
            <div className="mt-2 inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-black/50 border border-[#C8951E]/30 text-xs font-semibold text-[#E8C9A0] shadow-sm backdrop-blur-md">
              {isRecording ? (
                <>
                  <span className="size-2 rounded-full bg-red-500 animate-ping" />
                  <span className="font-mono text-amber-300 font-bold">
                    {formatSeconds(recordElapsed)}
                  </span>
                  <span>· J&apos;écoute, Maman… Parlez librement</span>
                </>
              ) : isTranscribing ? (
                <>
                  <Loader2 size={13} className="animate-spin text-amber-400" />
                  <span>Transcription de votre voix en cours…</span>
                </>
              ) : loading || executing ? (
                <>
                  <Loader2 size={13} className="animate-spin text-[#C8951E]" />
                  <span>L&apos;Orbe pèse et ventile vos écritures…</span>
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
                  <span>Touchez l&apos;Orbe ou le micro pour dicter</span>
                </>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ─── 3. COMMANDES BASSES : BOUTON MICRO, BULLE & SUGGESTIONS ─── */}
      {activeTab === "instant" && (
        <footer className="shrink-0 space-y-2.5 z-20 pb-1">
          {/* Grand Bouton Tactile d'Invocation */}
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              onClick={toggleListening}
              disabled={loading || isTranscribing}
              className={`h-13 sm:h-14 px-8 rounded-2xl font-black text-sm tracking-wide shadow-xl flex items-center gap-3 transition-all ${
                isRecording
                  ? "bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white animate-pulse hover:brightness-110"
                  : "k-btn-gold text-primary-foreground hover:scale-102 active:scale-95"
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
                className="h-13 sm:h-14 px-5 rounded-2xl border-[#C8951E]/40 hover:bg-[#C8951E]/15 text-foreground font-bold text-xs sm:text-sm flex items-center gap-2"
              >
                <Send size={16} className="text-[#C8951E]" />
                <span>Analyser</span>
              </Button>
            )}

            {debrief && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDebriefSheet(!showDebriefSheet)}
                className="h-13 sm:h-14 px-4 rounded-2xl border-[#C8951E]/50 bg-[#C8951E]/10 hover:bg-[#C8951E]/20 text-[#E8C9A0] font-bold text-xs flex items-center gap-1.5"
              >
                <span>Pépites</span>
                {showDebriefSheet ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </Button>
            )}
          </div>

          {/* Bulle de Transcription Vocale / Texte en cours */}
          {(text.trim() || isEditingText) && (
            <div className="max-w-2xl mx-auto p-3 rounded-2xl bg-black/60 border border-[#C8951E]/30 text-left backdrop-blur-md space-y-1.5 animate-in fade-in slide-in-from-bottom-2 shadow-lg">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-bold flex items-center gap-1 text-[#E8C9A0]">
                  <CauriIcon size={13} /> Votre parole :
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingText(!isEditingText)}
                    className="flex items-center gap-1 text-[#C8951E] hover:underline"
                  >
                    <Edit3 size={12} />
                    <span>{isEditingText ? "Valider" : "Modifier"}</span>
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
                    <X size={12} />
                  </button>
                </div>
              </div>

              {isEditingText ? (
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl bg-background/80 text-xs border-border p-2 focus-visible:ring-primary"
                  placeholder="Tapez votre compte-rendu ici..."
                />
              ) : (
                <p className="text-xs sm:text-sm text-foreground/95 font-medium italic line-clamp-2">
                  &laquo; {text} &raquo;
                </p>
              )}
            </div>
          )}

          {/* 4 Suggestions rapides en rangée unique compacte */}
          <div className="flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {QUICK_EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setText(ex.text);
                  setIsEditingText(false);
                  haptic(HAPTIC.light);
                }}
                className="text-[11px] bg-white/5 hover:bg-[#C8951E]/20 border border-white/10 hover:border-[#C8951E]/40 rounded-xl px-2.5 py-1 transition text-muted-foreground hover:text-foreground shrink-0 flex items-center gap-1"
              >
                <span className="font-bold text-[#C8951E]">{ex.tag}</span>
              </button>
            ))}
          </div>
        </footer>
      )}

      {/* ─── 4. PANNEAU LATÉRAL / TIROIR DES PÉPITES D'OR (SI DÉBRIEFING ACTIF) ─── */}
      {activeTab === "instant" && debrief && showDebriefSheet && (
        <div className="fixed inset-x-2 sm:inset-x-auto sm:right-6 bottom-4 sm:bottom-6 sm:w-[460px] max-h-[85vh] z-50 rounded-3xl border border-[#C8951E]/50 bg-card/95 backdrop-blur-xl p-5 shadow-2xl flex flex-col gap-3.5 animate-in slide-in-from-bottom-4 pretty-scroll overflow-y-auto">
          {/* Entête du tiroir avec fermeture */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Crown size={18} className="text-[#FFD700]" />
              <h3 className="text-sm font-heading font-black text-foreground">
                Pépites Prêtes à Sceller
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowDebriefSheet(false)}
              className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Carte Réponse Vocale */}
          {debrief.vocalSummary && (
            <div className="p-3.5 rounded-2xl bg-[#C8951E]/15 border border-[#C8951E]/30 flex items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-bold text-[#FFD700] uppercase tracking-wider">
                  👑 Réponse de l&apos;Assistante :
                </p>
                <p className="text-xs text-foreground/90 italic line-clamp-3">
                  &laquo; {debrief.vocalSummary} &raquo;
                </p>
              </div>
              <button
                type="button"
                onClick={() => togglePlayVocalSummary(debrief.vocalSummary)}
                className="size-10 rounded-xl bg-[#C8951E]/30 hover:bg-[#C8951E]/50 flex items-center justify-center shrink-0 text-[#C8951E] transition-all shadow-sm"
                title={audioState === "playing" ? "Arrêter la voix" : "Écouter l'Assistante"}
              >
                {audioState === "loading" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : audioState === "playing" ? (
                  <VolumeX size={18} className="animate-pulse text-amber-400" />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>
            </div>
          )}

          {/* Grille des Pépites à ventiler */}
          <div className="space-y-2 text-xs">
            {/* Pépite Caisse */}
            {debrief.hasSale && debrief.sale && (
              <div className="p-3 rounded-xl border border-[#C8951E]/30 bg-background/80 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Receipt size={16} className="text-[#C8951E] shrink-0" />
                  <div className="truncate">
                    <p className="font-bold text-foreground">Pépite Caisse</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {debrief.sale.items.length} prestation(s) / vente(s)
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold text-gold-text">{xof(debrief.sale.total)}</p>
                  <Badge variant="outline" className="text-[9px] uppercase font-bold text-primary">
                    {debrief.sale.paymentMethod}
                  </Badge>
                </div>
              </div>
            )}

            {/* Pépite Stock */}
            {debrief.hasStockMovement && debrief.stock?.decrements && (
              <div className="p-3 rounded-xl border border-border bg-background/80 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Package size={16} className="text-[#C8951E] shrink-0" />
                  <div className="truncate">
                    <p className="font-bold text-foreground">Pépite Stock</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {debrief.stock.decrements.map((d) => `${d.productName} (-${d.qty})`).join(", ")}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] text-emerald-400">
                  Décompte auto
                </Badge>
              </div>
            )}

            {/* Pépite CRM Cliente */}
            {debrief.hasClient && debrief.client && (
              <div className="p-3 rounded-xl border border-border bg-background/80 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Users size={16} className="text-[#C8951E] shrink-0" />
                  <div className="truncate">
                    <p className="font-bold text-foreground">{debrief.client.name}</p>
                    <p className="text-[10px] text-muted-foreground">Fiche CRM mise à jour</p>
                  </div>
                </div>
                {debrief.client.debtAmount && debrief.client.debtAmount > 0 ? (
                  <Badge variant="outline" className="text-[9px] text-red-400 border-red-500/30">
                    Ardoise: {xof(debrief.client.debtAmount)}
                  </Badge>
                ) : null}
              </div>
            )}

            {/* Pépite Agenda */}
            {debrief.hasAppointment && debrief.appointment && (
              <div className="p-3 rounded-xl border border-border bg-background/80 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar size={16} className="text-[#C8951E] shrink-0" />
                  <div className="truncate">
                    <p className="font-bold text-foreground">{debrief.appointment.serviceName}</p>
                    <p className="text-[10px] text-muted-foreground">Contrôle planifié</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] text-primary">
                  Agenda
                </Badge>
              </div>
            )}

            {/* Pépite Dépense Petite Caisse */}
            {debrief.hasExpense && debrief.expense && (
              <div className="p-3 rounded-xl border border-border bg-background/80 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Wallet size={16} className="text-amber-400 shrink-0" />
                  <div className="truncate">
                    <p className="font-bold text-foreground">{debrief.expense.description}</p>
                    <p className="text-[10px] text-muted-foreground">Petite caisse</p>
                  </div>
                </div>
                <p className="font-mono font-bold text-amber-400">-{xof(debrief.expense.amount)}</p>
              </div>
            )}

            {/* Pépite Relance WhatsApp */}
            {debrief.hasRelance && debrief.relance && (
              <div className="p-3 rounded-xl border border-border bg-background/80 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Bell size={16} className="text-[#C8951E] shrink-0" />
                  <div className="truncate">
                    <p className="font-bold text-foreground">Relance WhatsApp</p>
                    <p className="text-[10px] text-muted-foreground truncate">{debrief.relance.message}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[9px] text-primary">
                  J+{debrief.relance.delayDays}
                </Badge>
              </div>
            )}
          </div>

          {/* Bouton de Validation Atomique 1-Tap */}
          <Button
            type="button"
            onClick={handleExecute}
            disabled={executing || executed}
            className="w-full k-btn-gold h-12 rounded-xl font-black text-primary-foreground shadow-lg flex items-center justify-center gap-2 text-xs transition-all mt-1"
          >
            {executed ? (
              <>
                <CheckCircle2 size={16} className="text-white" />
                <span>Scellé avec succès !</span>
              </>
            ) : executing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Ventilation en cours...</span>
              </>
            ) : (
              <>
                <Crown size={16} />
                <span>Valider &amp; Sceller dans tous les onglets (1-Tap) 👑</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* ─── 5. ONGLET 2 : LE POINT DU SOIR (RITUEL DE CLÔTURE ZÉRO SCROLL) ─── */}
      {activeTab === "evening" && (
        <main className="flex-1 min-h-0 flex flex-col justify-between py-2 sm:py-3 space-y-3 overflow-y-auto pretty-scroll">
          {/* Entête du soir */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="space-y-0.5">
              <h2 className="text-base sm:text-lg font-heading font-black text-foreground flex items-center gap-2">
                <Moon size={18} className="text-[#FFD700]" />
                <span>Le Rituel du Point du Soir</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Clôture de journée en 30 secondes · Vérification des encaissements et conte de prospérité
              </p>
            </div>

            <Button
              type="button"
              onClick={loadEveningSummary}
              disabled={loadingEvening}
              className="k-btn-gold h-9 px-4 rounded-xl font-bold text-primary-foreground text-xs shadow-sm flex items-center gap-1.5 shrink-0"
            >
              {loadingEvening ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Calcul...</span>
                </>
              ) : (
                <>
                  <RotateCcw size={14} />
                  <span>Actualiser</span>
                </>
              )}
            </Button>
          </div>

          {loadingEvening ? (
            <div className="my-auto py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <Loader2 size={32} className="animate-spin text-[#C8951E]" />
              <p className="text-xs font-semibold text-foreground">
                L&apos;Orbe compile tous les encaissements du jour…
              </p>
            </div>
          ) : eveningData ? (
            <div className="space-y-3 my-auto">
              {/* Carte Conte Audio du Soir */}
              {eveningData.vocalSummary && (
                <div className="p-3.5 rounded-2xl bg-[#C8951E]/15 border border-[#C8951E]/30 flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-[10px] font-bold text-[#FFD700] uppercase tracking-wider">
                      🌙 Le Conte de Clôture de l&apos;Assistante :
                    </p>
                    <p className="text-xs text-foreground/90 italic line-clamp-2">
                      &laquo; {eveningData.vocalSummary} &raquo;
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => togglePlayVocalSummary(eveningData.vocalSummary)}
                    className="shrink-0 border-[#C8951E]/40 hover:bg-[#C8951E]/20 text-xs font-bold"
                  >
                    {audioState === "playing" ? "⏹️ Arrêter" : "🔊 Écouter"}
                  </Button>
                </div>
              )}

              {/* Grille des 4 modes de paiement */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-black/40 border border-[#C8951E]/40 space-y-0.5">
                  <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1">
                    <TrendingUp size={12} className="text-[#C8951E]" /> Total Jour
                  </span>
                  <p className="font-mono text-lg font-black text-gold-text">
                    {xof(eveningData.total)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {eveningData.salesCount} encaissement(s)
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-black/40 border border-blue-500/30 space-y-0.5">
                  <span className="text-[11px] text-blue-400 font-semibold">🌊 Wave Money</span>
                  <p className="font-mono text-base font-bold text-foreground">
                    {xof(eveningData.waveTotal)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Paiements directs</p>
                </div>

                <div className="p-3 rounded-2xl bg-black/40 border border-orange-500/30 space-y-0.5">
                  <span className="text-[11px] text-orange-400 font-semibold">🍊 Orange Money</span>
                  <p className="font-mono text-base font-bold text-foreground">
                    {xof(eveningData.orangeTotal)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Orange CI</p>
                </div>

                <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/30 space-y-0.5">
                  <span className="text-[11px] text-emerald-400 font-semibold">💵 Espèces</span>
                  <p className="font-mono text-base font-bold text-foreground">
                    {xof(eveningData.cashTotal)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Caisse physique</p>
                </div>
              </div>

              {/* Métriques d'Activité */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-lg font-heading font-black text-foreground">
                    {eveningData.uniqueClientsCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Clientes</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-lg font-heading font-black text-[#C8951E]">
                    {eveningData.servicesCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Soins</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-lg font-heading font-black text-[#E07A2B]">
                    {eveningData.productsCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Ventes</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-lg font-heading font-black text-emerald-400">
                    {xof(eveningData.cardTotal)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Cartes</p>
                </div>
              </div>

              {/* Alerte Ruptures Stock */}
              {eveningData.lowStockProducts.length > 0 && (
                <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/30 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{eveningData.lowStockProducts.length} produit(s) en rupture imminente</span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {eveningData.lowStockProducts.map((p) => (
                      <span
                        key={p.id}
                        className="text-[10px] bg-red-900/30 text-red-200 border border-red-500/30 px-2 py-0.5 rounded-lg shrink-0"
                      >
                        {p.name} ({p.stock})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="my-auto py-10 text-center text-muted-foreground text-xs">
              Cliquez sur &laquo; Actualiser &raquo; pour compiler la journée.
            </div>
          )}

          {/* Raccourcis onglets */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-center gap-2">
            {[
              { id: "caisse" as ProSectionId, label: "Caisse", icon: Receipt },
              { id: "stock" as ProSectionId, label: "Stock", icon: Package },
              { id: "crm" as ProSectionId, label: "CRM", icon: Users },
              { id: "agenda" as ProSectionId, label: "Agenda", icon: Calendar },
              { id: "compta" as ProSectionId, label: "Compta", icon: BookOpen },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate?.(item.id)}
                className="px-3 py-1.5 rounded-xl border border-border/80 bg-background/50 hover:bg-[#C8951E]/10 hover:border-[#C8951E]/40 text-xs font-semibold text-foreground flex items-center gap-1.5 transition"
              >
                <item.icon size={13} className="text-[#C8951E]" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </main>
      )}
    </div>
  );
}
