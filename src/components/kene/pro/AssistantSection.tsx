"use client";
// Kènè Pro — Section Assistante Intelligente de la Maman
// Page complète dédiée à l'Assistante au sein de la barre de navigation Pro
import { useRef, useState } from "react";
import {
  Crown,
  Mic,
  MicOff,
  Send,
  Sparkles,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { fetchTtsAudioUrl, speakBrowserVoice, stopBrowserVoice } from "../client/ttsAudio";
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
  "Tantie Aminata a fait son Soin Visage à 20 000 F par Wave, je lui ai vendu un baume de karité et elle revient dans 3 semaines.",
  "J'ai pris 2 500 F dans la caisse pour acheter de l'eau et des sachets pour les clientes.",
  "Mme Bintou a fait ses tresses 15 000 F, elle a versé 10 000 F par Orange Money, il lui reste 5 000 F d'ardoise.",
  "Awa a vendu 2 sérums éclat à 16 000 F en espèces au comptoir.",
];

export function AssistantSection({
  tenantId,
  tenantName,
  onNavigate,
}: AssistantSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [debrief, setDebrief] = useState<DebriefResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);

  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      audio.onerror = () => {
        fallbackBrowserVoice(spokenText);
      };
      await audio.play();
      setAudioState("playing");
      return;
    } catch {
      // Cloud TTS indisponible → bascule instantanée sur le navigateur
    }

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

    if (!started) {
      setAudioState("idle");
    }
  }

  async function handleAnalyze() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setDebrief(null);
    setExecuted(false);
    try {
      const res = await apiPost<{ debrief: DebriefResult }>("/api/pro/assistant/debrief", {
        tenantId,
        text: text.trim(),
      });
      setDebrief(res.debrief);
      toast.success("Débriefing analysé avec succès ! ✨");
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
    try {
      const res = await apiPost<{ ok: boolean; message: string }>("/api/pro/assistant/execute", {
        tenantId,
        debrief,
      });
      setExecuted(true);
      toast.success(res.message || "Point enregistré dans tous les onglets !");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'enregistrement");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* ─── Hero Header ─── */}
      <div className="relative overflow-hidden rounded-3xl border border-[#C8951E]/40 bg-gradient-to-br from-[#C8951E]/20 via-card to-background p-6 sm:p-8 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-gradient-to-r from-[#C8951E] to-[#E07A2B] text-[#16110D] font-black px-3 py-1 text-xs">
                👑 NOUVEAU · ASSISTANTE IA
              </Badge>
              <Badge variant="outline" className="border-gold/50 text-gold-text text-xs">
                Multi-onglets 1-Tap
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
              L&apos;Assistante Intelligente de la Maman
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Faites votre compte-rendu oral ou écrit après chaque soin, vente ou dépense. L&apos;Assistante se charge de renseigner <strong>tous vos onglets</strong> : Caisse, Stock, CRM, Agenda, Relances, Équipe et Comptabilité SYSCOHADA.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Button
              type="button"
              onClick={() => setModalOpen(true)}
              className="k-btn-gold h-12 px-6 rounded-2xl font-bold text-primary-foreground shadow-lg flex items-center gap-2.5 text-sm"
            >
              <Mic size={18} className="animate-pulse" />
              <span>Dicter au micro ✨</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(true)}
              className="h-12 px-5 rounded-2xl border-[#C8951E]/50 text-foreground hover:bg-[#C8951E]/10 font-semibold text-sm flex items-center gap-2"
            >
              <Moon size={16} className="text-[#C8951E]" />
              <span>Le Point du Soir</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Zone d'entrée de Débriefing Express ─── */}
      <div className="rounded-3xl border border-border bg-card/80 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles size={18} className="text-[#C8951E]" />
            <span>Votre Débriefing (oral ou tapé)</span>
          </h2>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Parlez en toute simplicité (FCFA, Wave, Orange, ardoise...)
          </span>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Exemple : Tantie Aminata a fait son Soin Visage à 20 000 F par Wave, je lui ai vendu un baume de karité et elle revient dans 3 semaines..."
          className="min-h-[110px] rounded-2xl text-sm leading-relaxed p-4 border-border/80 focus-visible:ring-primary bg-background/60"
        />

        {/* Suggestions rapides africaines */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            💡 Exemples fréquents de salon :
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setText(ex)}
                className="text-left text-xs bg-muted/70 hover:bg-[#C8951E]/15 hover:text-foreground border border-border/60 hover:border-[#C8951E]/40 rounded-xl px-3 py-1.5 transition text-muted-foreground max-w-full truncate"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            onClick={handleAnalyze}
            disabled={!text.trim() || loading}
            className="k-btn-gold h-11 px-6 rounded-xl font-bold text-primary-foreground shadow-sm flex items-center gap-2"
          >
            {loading ? (
              <>
                <Sparkles size={16} className="animate-spin" />
                <span>Analyse en cours...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>Analyser avec l&apos;Assistante</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ─── Résultats de l'analyse & Dispatch ─── */}
      {debrief && (
        <div className="space-y-5 rounded-3xl border border-[#C8951E]/40 bg-card p-6 shadow-md">
          {/* Vocal summary card interactif avec écoute vocale */}
          {debrief.vocalSummary && (
            <div className="p-4 rounded-2xl bg-[#C8951E]/15 border border-[#C8951E]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
              <div className="flex items-start gap-3.5">
                <button
                  type="button"
                  onClick={() => togglePlayVocalSummary(debrief.vocalSummary)}
                  className="size-10 rounded-xl bg-[#C8951E]/30 hover:bg-[#C8951E]/50 flex items-center justify-center shrink-0 text-[#C8951E] transition-colors"
                  title={audioState === "playing" ? "Arrêter la lecture" : "Écouter l'Assistante"}
                >
                  {audioState === "loading" ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : audioState === "playing" ? (
                    <VolumeX size={20} className="animate-pulse text-amber-500" />
                  ) : (
                    <Volume2 size={20} />
                  )}
                </button>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-foreground">Réponse vocale de l&apos;Assistante :</p>
                    {audioState === "playing" && (
                      <Badge className="bg-emerald-600/90 text-white text-[10px] py-0 px-2 animate-pulse">
                        En écoute 🔊
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-foreground/90 italic">&laquo; {debrief.vocalSummary} &raquo;</p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => togglePlayVocalSummary(debrief.vocalSummary)}
                className="shrink-0 border-[#C8951E]/40 hover:bg-[#C8951E]/20 text-xs font-semibold self-end sm:self-center"
              >
                {audioState === "playing" ? "⏹️ Arrêter l'écoute" : "🔊 Écouter"}
              </Button>
            </div>
          )}

          {/* Grille des impacts par onglet */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-success" />
              <span>Onglets prêts à être mis à jour automatiquement :</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Caisse */}
              {debrief.hasSale && debrief.sale && (
                <div className="p-3.5 rounded-2xl border border-border bg-background/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                      <Receipt size={14} className="text-gold" /> Onglet Caisse
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary">
                      {debrief.sale.paymentMethod}
                    </Badge>
                  </div>
                  <p className="font-mono text-base font-bold text-gold-text">
                    {xof(debrief.sale.total)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {debrief.sale.items.length} ligne(s) d&apos;encaissement
                  </p>
                </div>
              )}

              {/* Stock */}
              {debrief.hasStockMovement && debrief.stock?.decrements && (
                <div className="p-3.5 rounded-2xl border border-border bg-background/80 space-y-1">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <Package size={14} className="text-gold" /> Onglet Stock
                  </span>
                  <p className="text-xs font-semibold text-foreground">
                    {debrief.stock.decrements.map((d) => `${d.productName} (-${d.qty})`).join(", ")}
                  </p>
                  <p className="text-[11px] text-success">Inventaire décompté</p>
                </div>
              )}

              {/* CRM */}
              {debrief.hasClient && debrief.client && (
                <div className="p-3.5 rounded-2xl border border-border bg-background/80 space-y-1">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <Users size={14} className="text-gold" /> Onglet CRM (Cliente)
                  </span>
                  <p className="text-xs font-semibold text-foreground">{debrief.client.name}</p>
                  {debrief.client.debtAmount && debrief.client.debtAmount > 0 ? (
                    <p className="text-[11px] text-destructive font-bold">
                      Reste à payer : {xof(debrief.client.debtAmount)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Fiche client actualisée</p>
                  )}
                </div>
              )}

              {/* Agenda */}
              {debrief.hasAppointment && debrief.appointment && (
                <div className="p-3.5 rounded-2xl border border-border bg-background/80 space-y-1">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <Calendar size={14} className="text-gold" /> Onglet Agenda
                  </span>
                  <p className="text-xs font-semibold text-foreground">
                    {debrief.appointment.serviceName}
                  </p>
                  <p className="text-[11px] text-primary">Contrôle programmé</p>
                </div>
              )}

              {/* Petite Caisse */}
              {debrief.hasExpense && debrief.expense && (
                <div className="p-3.5 rounded-2xl border border-border bg-background/80 space-y-1">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <Wallet size={14} className="text-sunset-text" /> Petite Caisse
                  </span>
                  <p className="font-mono text-base font-bold text-sunset-text">
                    -{xof(debrief.expense.amount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{debrief.expense.description}</p>
                </div>
              )}

              {/* Équipe */}
              {debrief.hasTeamCredit && debrief.team && (
                <div className="p-3.5 rounded-2xl border border-border bg-background/80 space-y-1">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <UserCheck size={14} className="text-gold" /> Équipe / Paie
                  </span>
                  <p className="text-xs font-semibold text-foreground">{debrief.team.employeeName}</p>
                  <p className="text-[11px] text-gold-text">
                    Commission : {xof(debrief.team.commissionAmount)}
                  </p>
                </div>
              )}

              {/* Relances */}
              {debrief.hasRelance && debrief.relance && (
                <div className="p-3.5 rounded-2xl border border-border bg-background/80 space-y-1">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <Bell size={14} className="text-gold" /> Relance WhatsApp
                  </span>
                  <p className="text-xs text-muted-foreground truncate">
                    {debrief.relance.message}
                  </p>
                  <p className="text-[11px] text-primary">J+{debrief.relance.delayDays}</p>
                </div>
              )}

              {/* Compta */}
              <div className="p-3.5 rounded-2xl border border-border bg-background/80 space-y-1">
                <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                  <BookOpen size={14} className="text-gold" /> SYSCOHADA
                </span>
                <p className="text-xs text-foreground font-semibold">Écritures comptables prêtes</p>
                <p className="text-[11px] text-muted-foreground">TVA 18% & Comptes trésorerie</p>
              </div>
            </div>
          </div>

          {/* Action bouton 1-tap */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info size={14} />
              <span>Toutes les données seront enregistrées en base de façon atomique.</span>
            </div>

            <Button
              type="button"
              onClick={handleExecute}
              disabled={executing || executed}
              className="w-full sm:w-auto k-btn-gold h-12 px-8 rounded-2xl font-black text-primary-foreground shadow-lg flex items-center justify-center gap-2 text-sm"
            >
              {executed ? (
                <>
                  <CheckCircle2 size={18} className="text-white" />
                  <span>Enregistré avec succès ! ✨</span>
                </>
              ) : executing ? (
                <>
                  <Sparkles size={18} className="animate-spin" />
                  <span>Enregistrement dans tous les onglets...</span>
                </>
              ) : (
                <>
                  <Crown size={18} />
                  <span>Valider et Enregistrer (1-Tap)</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Cartes d'orientation vers les onglets ─── */}
      <div className="rounded-3xl border border-border bg-card/60 p-6 space-y-3">
        <h3 className="text-sm font-bold text-foreground">
          Navigation rapide vers les onglets renseignés :
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { id: "caisse" as ProSectionId, label: "Caisse", icon: Receipt },
            { id: "stock" as ProSectionId, label: "Stock", icon: Package },
            { id: "crm" as ProSectionId, label: "CRM", icon: Users },
            { id: "agenda" as ProSectionId, label: "Agenda", icon: Calendar },
            { id: "relances" as ProSectionId, label: "Relances", icon: Bell },
            { id: "equipe" as ProSectionId, label: "Équipe", icon: UserCheck },
            { id: "compta" as ProSectionId, label: "Compta", icon: BookOpen },
            { id: "dashboard" as ProSectionId, label: "Tableau de bord", icon: Sparkles },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate?.(item.id)}
              className="flex items-center justify-between p-3 rounded-2xl border border-border/80 bg-background/50 hover:bg-accent/40 text-left transition group"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <item.icon size={15} className="text-[#C8951E]" />
                <span>{item.label}</span>
              </div>
              <ArrowRight size={13} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </button>
          ))}
        </div>
      </div>

      {/* Modale de l'Assistante */}
      {modalOpen && (
        <MamanAssistantModal
          tenantId={tenantId}
          tenantName={tenantName}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onActionExecuted={() => {
            setModalOpen(false);
            toast.success("Point enregistré avec succès dans tous les onglets ! ✨");
          }}
        />
      )}
    </div>
  );
}
