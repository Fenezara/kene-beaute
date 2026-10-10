"use client";
// Kènè Pro — Section Assistante Intelligente de la Maman
// Expérience immersive avec l'Orbe Sacré Cauri 3D, reconnaissance vocale
// en temps réel, dispatching multi-onglets 1-Tap et rituel du Point du Soir.

import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CauriIcon } from "@/components/kene/icons";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { fetchTtsAudioUrl, speakBrowserVoice, stopBrowserVoice } from "../client/ttsAudio";
import { MamanOrb3D, type OrbState } from "./MamanOrb3D";
import { MamanAssistantModal } from "./MamanAssistantModal";
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
  const [isListening, setIsListening] = useState(false);
  const [debrief, setDebrief] = useState<DebriefResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);

  // Audio TTS
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Modal de secours
  const [modalOpen, setModalOpen] = useState(false);

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

  // Reconnaissance Vocale (Web Speech API native)
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const reco = new SpeechRecognition();
        reco.continuous = true;
        reco.interimResults = true;
        reco.lang = "fr-FR";

        reco.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript + " ";
          }
          setText(currentTranscript.trim());
        };

        reco.onerror = () => {
          setIsListening(false);
        };

        reco.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = reco;
      }
    }

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  // Détermination de l'état 3D de l'Orbe
  const orbState: OrbState = useMemo(() => {
    if (executed) return "success";
    if (audioState === "playing") return "speaking";
    if (loading || executing) return "analyzing";
    if (isListening) return "listening";
    return "idle";
  }, [executed, audioState, loading, executing, isListening]);

  function toggleListening() {
    if (!recognitionRef.current) {
      toast.error("La reconnaissance vocale n'est pas supportée par votre navigateur actuel");
      setIsEditingText(true);
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      haptic(HAPTIC.light);
      if (text.trim()) {
        void handleAnalyze();
      }
    } else {
      try {
        setText("");
        setDebrief(null);
        setExecuted(false);
        recognitionRef.current.start();
        setIsListening(true);
        haptic(HAPTIC.success);
        toast.info("L'Orbe écoute, Maman… Parlez librement 🎙️");
      } catch {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    }
  }

  async function togglePlayVocalSummary(spokenText: string) {
    if (audioState === "playing") {
      audioRef.current?.pause();
      stopBrowserVoice();
      setAudioState("idle");
      return;
    }

    setAudioState("loading");

    // 1) Essai du TTS cloud
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

    fallbackBrowserVoice(spokenText);
  }

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

  async function handleAnalyze() {
    if (!text.trim() || loading) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    setLoading(true);
    setDebrief(null);
    setExecuted(false);
    haptic(HAPTIC.medium);

    try {
      const res = await apiPost<{ debrief: DebriefResult }>("/api/pro/assistant/debrief", {
        tenantId,
        text: text.trim(),
      });
      setDebrief(res.debrief);
      toast.success("L'Orbe a pesé et ventilé votre point !");
      if (res.debrief.vocalSummary) {
        void togglePlayVocalSummary(res.debrief.vocalSummary);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
    } finally {
      setExecuting(false);
    }
  }

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

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20 select-none">
      {/* ─── En-tête Souverain avec Bascule d'Onglets ─── */}
      <div className="relative overflow-hidden rounded-3xl border border-[#C8951E]/40 bg-gradient-to-b from-[#1E1712] via-card to-background p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-gradient-to-r from-[#C8951E] via-[#FFD700] to-[#E07A2B] text-[#16110D] font-black px-3.5 py-1 text-xs shadow-md">
                👑 ORBE SOUVERAIN · ASSISTANTE IA
              </Badge>
              <Badge variant="outline" className="border-[#C8951E]/40 text-[#E8C9A0] text-xs">
                {tenantName}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-foreground tracking-tight">
              L&apos;Orbe Sacré de la Maman
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl leading-relaxed">
              Dictez votre point après chaque soin, vente ou dépense. L&apos;Orbe Cauri écoute votre voix et renseigne instantanément <strong>la Caisse, le Stock, le CRM, l&apos;Agenda, les Relances et la Compta</strong>.
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
              className={`h-11 px-5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
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
              className={`h-11 px-5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
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

      {/* ─── ONGLET 1 : DÉBRIEFING D'ACTION AVEC L'ORBE 3D ─── */}
      {activeTab === "instant" && (
        <div className="space-y-8">
          {/* ─── SCÈNE 3D CENTRALE DE L'ORBE SACRÉ ─── */}
          <div className="relative rounded-[36px] border border-[#C8951E]/30 bg-radial from-[#2A1C12]/80 via-card/95 to-background/90 p-8 sm:p-12 shadow-2xl flex flex-col items-center justify-center text-center overflow-hidden">
            {/* Lueur d'or ambiante en arrière-plan */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[#C8951E]/15 blur-3xl pointer-events-none" />

            {/* L'Orbe 3D Procédural Cauri & Anneaux Akan */}
            <div className="relative z-10 mb-2">
              <MamanOrb3D
                state={orbState}
                onClick={toggleListening}
                size={300}
                className="transition-transform active:scale-95"
              />
            </div>

            {/* Légende & Statut Parlant de l'Orbe */}
            <div className="relative z-10 space-y-3 max-w-lg mx-auto">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-[#C8951E]/30 text-xs font-semibold text-[#E8C9A0] shadow-sm backdrop-blur-xs">
                {isListening ? (
                  <>
                    <span className="size-2 rounded-full bg-amber-400 animate-ping" />
                    <span>L&apos;Orbe écoute votre parole… Parlez naturellement</span>
                  </>
                ) : loading || executing ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-[#C8951E]" />
                    <span>L&apos;Orbe pèse l&apos;or et tisse vos données…</span>
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
                    <span>Touchez l&apos;Orbe ou le bouton pour dicter</span>
                  </>
                )}
              </div>

              {/* Grand Bouton Tactile d'Invocation */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  type="button"
                  onClick={toggleListening}
                  className={`h-14 px-8 rounded-2xl font-black text-sm tracking-wide shadow-xl flex items-center gap-3 transition-all ${
                    isListening
                      ? "bg-gradient-to-r from-red-600 to-amber-600 text-white animate-pulse"
                      : "k-btn-gold text-primary-foreground hover:scale-105 active:scale-95"
                  }`}
                >
                  {isListening ? (
                    <>
                      <MicOff size={20} />
                      <span>Terminer l&apos;écoute &amp; Analyser</span>
                    </>
                  ) : (
                    <>
                      <Mic size={20} className="animate-pulse" />
                      <span>Parle-moi, Maman… 🎙️</span>
                    </>
                  )}
                </Button>

                {text.trim() && !isListening && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAnalyze}
                    disabled={loading}
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
              <div className="relative z-10 w-full max-w-2xl mt-6 p-4 rounded-2xl bg-black/40 border border-[#C8951E]/30 text-left backdrop-blur-md space-y-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-bold flex items-center gap-1.5 text-[#E8C9A0]">
                    <CauriIcon size={14} /> Votre parole retranscrite :
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingText(!isEditingText)}
                    className="flex items-center gap-1 text-[#C8951E] hover:underline"
                  >
                    <Edit3 size={13} />
                    <span>{isEditingText ? "Fermer l'édition" : "Modifier"}</span>
                  </button>
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

            {/* Exemples fréquents de salon en un tap */}
            <div className="relative z-10 w-full max-w-2xl mt-5 pt-4 border-t border-white/5 space-y-2 text-left">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <span>💡 Suggestions rapides de salon :</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setText(ex.text);
                      setIsEditingText(false);
                      haptic(HAPTIC.light);
                    }}
                    className="text-xs bg-white/5 hover:bg-[#C8951E]/20 hover:text-foreground border border-white/10 hover:border-[#C8951E]/40 rounded-xl px-3 py-1.5 transition text-muted-foreground flex items-center gap-1.5"
                  >
                    <span className="text-[10px] font-bold text-[#C8951E]">{ex.tag} :</span>
                    <span className="truncate max-w-[220px]">{ex.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── PÉPITES D'OR : RÉSULTATS DU DÉBRIEFING & DISPATCH ─── */}
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

              {/* Grille des 6 Pépites d'Or Dispatchées */}
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

      {/* ─── Navigation Rapide vers les Onglets Connectés ─── */}
      <div className="rounded-3xl border border-border bg-card/60 p-6 space-y-3">
        <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
          <CauriIcon size={16} className="text-[#C8951E]" />
          <span>Accéder directement aux onglets alimentés par l&apos;Orbe :</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { id: "caisse" as ProSectionId, label: "Caisse", icon: Receipt },
            { id: "stock" as ProSectionId, label: "Stock", icon: Package },
            { id: "crm" as ProSectionId, label: "CRM Clientes", icon: Users },
            { id: "agenda" as ProSectionId, label: "Agenda RDV", icon: Calendar },
            { id: "relances" as ProSectionId, label: "Relances", icon: Bell },
            { id: "equipe" as ProSectionId, label: "Équipe & Paie", icon: UserCheck },
            { id: "compta" as ProSectionId, label: "SYSCOHADA", icon: BookOpen },
            { id: "dashboard" as ProSectionId, label: "Tableau de bord", icon: Crown },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate?.(item.id)}
              className="flex items-center justify-between p-3.5 rounded-2xl border border-border/80 bg-background/50 hover:bg-[#C8951E]/10 hover:border-[#C8951E]/40 text-left transition group"
            >
              <div className="flex items-center gap-2.5 text-xs font-semibold text-foreground">
                <item.icon size={15} className="text-[#C8951E]" />
                <span>{item.label}</span>
              </div>
              <ArrowRight size={13} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </button>
          ))}
        </div>
      </div>

      {/* Modale de l'Assistante (si ouverte manuellement) */}
      {modalOpen && (
        <MamanAssistantModal
          tenantId={tenantId}
          tenantName={tenantName}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onActionExecuted={() => {
            setModalOpen(false);
            toast.success("Point scellé avec succès !");
          }}
        />
      )}
    </div>
  );
}
