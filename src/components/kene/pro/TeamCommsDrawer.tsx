"use client";

// Kènè Team Live — Messagerie Interne & Coordination Cabine ↔ Accueil ↔ Stock (Remplace WhatsApp en salon)
// - 4 Canaux : #Général, #Accueil↔Cabine, #Stock, Direct (1-à-1)
// - 4 Bips Métiers 1-Clic : Cliente arrivée, Besoin produit cabine, Sortie de Cabine → Caisse, Alerte Stock
// - Notes vocales mains-libres (MediaRecorder + transcription Web Speech API)
// - Accusés de lecture nominatifs ("Vu par Edith, Irène ✓✓")
// - Consigne du jour épinglée + Cagnotte collective mensuelle

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  MessageSquare,
  Send,
  Mic,
  Square,
  Bell,
  Package,
  CreditCard,
  AlertTriangle,
  CheckCheck,
  Sparkles,
  Users,
  Pin,
  Trophy,
  Plus,
  Trash2,
  X,
  Volume2,
  Loader2,
  Edit3,
  Check,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof, formatTime, formatDate } from "@/lib/kene/format";
import { formatRole } from "@/lib/kene/hr-constants";
import { cn } from "@/lib/utils";
import { haptic, HAPTIC } from "@/lib/kene/ux";
import type { ProSectionId } from "./ProApp";

export interface TeamMessageItem {
  id: string;
  createdAt: string;
  channel: "general" | "cabine_accueil" | "stock" | "direct";
  senderName: string;
  senderRole: string;
  recipientName?: string | null;
  text: string;
  beepType?: "client_arrived" | "need_product" | "handoff_pos" | "stock_alert" | null;
  audioDataUrl?: string | null;
  readBy: string[];
}

export interface PosHandoffItem {
  id: string;
  createdAt: string;
  practitionerName: string;
  practitionerRole: string;
  clientId?: string | null;
  clientName: string;
  clientPhone?: string | null;
  notes?: string | null;
  items: Array<{
    kind: "service" | "product";
    id?: string;
    label: string;
    unitPrice: number;
    qty: number;
    practitionerName?: string;
  }>;
  totalAmount: number;
  status: "pending" | "completed" | "dismissed";
  completedSaleId?: string | null;
  completedAt?: string | null;
}

export interface TeamDirectiveState {
  text: string;
  focusProduct?: string | null;
  updatedBy: string;
  updatedAt: string;
  monthlyGoalFcfa: number;
  teamBonusFcfa: number;
}

export interface TeamHubResponse {
  team: Array<{ id: string; name: string; role: string; userId: string | null }>;
  messages: TeamMessageItem[];
  unreadCount: number;
  handoffs: PosHandoffItem[];
  directive: TeamDirectiveState | null;
  teamPot: {
    monthRevenueFcfa: number;
    monthlyGoalFcfa: number;
    teamBonusFcfa: number;
    progressPct: number;
    unlocked: boolean;
  };
}

interface TeamCommsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  currentUserName: string;
  currentUserRole: string;
  isOwner: boolean;
  refreshKey?: number;
  onNavigate?: (section: ProSectionId) => void;
  onUnreadChange?: (unread: number, pendingHandoffs: number) => void;
  initialHandoffComposerOpen?: boolean;
}

const CHANNELS: Array<{
  id: "general" | "cabine_accueil" | "stock" | "direct";
  label: string;
  shortLabel: string;
  emoji: string;
  desc: string;
}> = [
  { id: "general", label: "# Général Salon", shortLabel: "Général", emoji: "🏛️", desc: "Annonces & vie de l'équipe" },
  { id: "cabine_accueil", label: "# Accueil ↔ Cabine", shortLabel: "Cabine", emoji: "🛋️", desc: "Arrivées clientes & sorties de soin" },
  { id: "stock", label: "# Stock & Réassort", shortLabel: "Stock", emoji: "🧴", desc: "Besoins cabine & alertes Clément" },
  { id: "direct", label: "Direct (1-à-1)", shortLabel: "Direct", emoji: "🔒", desc: "Message ciblé à une collègue" },
];

export function TeamCommsDrawer({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  currentUserName,
  currentUserRole,
  isOwner,
  refreshKey = 0,
  onNavigate,
  onUnreadChange,
  initialHandoffComposerOpen = false,
}: TeamCommsDrawerProps) {
  const [hub, setHub] = useState<TeamHubResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState<"general" | "cabine_accueil" | "stock" | "direct">("general");
  const [directRecipient, setDirectRecipient] = useState<string>("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Édition de la Consigne du Jour & Objectif d'équipe (Gérante / Manager)
  const [editingDirective, setEditingDirective] = useState(false);
  const [dirText, setDirText] = useState("");
  const [dirFocus, setDirFocus] = useState("");
  const [dirGoal, setDirGoal] = useState("2000000");
  const [dirBonus, setDirBonus] = useState("10000");
  const [savingDirective, setSavingDirective] = useState(false);

  // Modale Bips Rapides & Sortie de Cabine → Caisse
  const [beepModal, setBeepModal] = useState<null | "client_arrived" | "need_product" | "handoff_pos">(null);
  const [beepTargetPractitioner, setBeepTargetPractitioner] = useState("");
  const [beepClientName, setBeepClientName] = useState("");
  const [beepProductLabel, setBeepProductLabel] = useState("");
  const [beepCabinName, setBeepCabinName] = useState("Cabine 1");

  // Formulaire Sortie de Cabine → Caisse (Panier pré-rempli pour Irène)
  const [handoffClientName, setHandoffClientName] = useState("");
  const [handoffClientId, setHandoffClientId] = useState("");
  const [handoffPractitioner, setHandoffPractitioner] = useState(currentUserName);
  const [handoffNotes, setHandoffNotes] = useState("");
  const [handoffItems, setHandoffItems] = useState<
    Array<{ kind: "service" | "product"; id?: string; label: string; unitPrice: number; qty: number }>
  >([]);
  const [catalogData, setCatalogData] = useState<{ services: any[]; products: any[] } | null>(null);
  const [clientsData, setClientsData] = useState<any[]>([]);

  // Enregistrement vocal mains-libres
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<any>(null);
  const speechTranscriptRef = useRef<string>("");
  const timerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialHandoffComposerOpen && open) {
      setBeepModal("handoff_pos");
      setHandoffPractitioner(currentUserName);
    }
  }, [initialHandoffComposerOpen, open, currentUserName]);

  const fetchHub = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const res = await apiGet<TeamHubResponse>(
        `/api/pro/team-hub?tenantId=${encodeURIComponent(tenantId)}&viewerName=${encodeURIComponent(currentUserName)}`
      );
      setHub(res);
      onUnreadChange?.(res.unreadCount ?? 0, (res.handoffs ?? []).length);
      if (res.directive && !editingDirective) {
        setDirText(res.directive.text || "");
        setDirFocus(res.directive.focusProduct || "");
        setDirGoal(String(res.directive.monthlyGoalFcfa || 2000000));
        setDirBonus(String(res.directive.teamBonusFcfa || 10000));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tenantId, currentUserName, editingDirective, onUnreadChange]);

  useEffect(() => {
    void fetchHub();
  }, [fetchHub, refreshKey, open]);

  // Charger catalogue & clientes quand on ouvre le créateur de Sortie de Cabine
  useEffect(() => {
    if (beepModal === "handoff_pos" && tenantId && !catalogData) {
      void apiGet<{ services: any[]; products: any[] }>(`/api/pro/catalog?tenantId=${tenantId}`)
        .then((c) => setCatalogData(c))
        .catch(() => {});
      void apiGet<{ clients: any[] }>(`/api/pro/clients?tenantId=${tenantId}`)
        .then((c) => setClientsData(c.clients ?? []))
        .catch(() => {});
    }
  }, [beepModal, tenantId, catalogData]);

  // Marquer les messages visibles comme lus à l'ouverture
  useEffect(() => {
    if (!open || !hub?.messages?.length || !currentUserName) return;
    const cleanMe = currentUserName.trim().toLowerCase();
    const unreadIds = hub.messages
      .filter((m) => !m.readBy.some((r) => r.trim().toLowerCase() === cleanMe))
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      void apiPost("/api/pro/team-hub", {
        action: "mark_read",
        tenantId,
        readerName: currentUserName,
        messageIds: unreadIds,
      }).then(() => {
        onUnreadChange?.(0, (hub.handoffs ?? []).length);
      }).catch(() => {});
    }
  }, [open, hub?.messages, currentUserName, tenantId, hub?.handoffs, onUnreadChange]);

  const filteredMessages = useMemo(() => {
    const all = hub?.messages ?? [];
    const cleanMe = currentUserName.trim().toLowerCase();
    return all.filter((m) => {
      if (channel === "direct") {
        if (m.channel !== "direct") return false;
        const isSender = m.senderName.trim().toLowerCase() === cleanMe;
        const isRecipient = (m.recipientName || "").trim().toLowerCase() === cleanMe;
        if (!isOwner && !isSender && !isRecipient) return false;
        if (directRecipient) {
          const target = directRecipient.trim().toLowerCase();
          return (
            m.senderName.trim().toLowerCase() === target ||
            (m.recipientName || "").trim().toLowerCase() === target
          );
        }
        return true;
      }
      return m.channel === channel;
    });
  }, [hub?.messages, channel, directRecipient, currentUserName, isOwner]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 120);
    }
  }, [open, filteredMessages.length, channel]);

  const handleSendMessage = async (opts?: {
    customText?: string;
    customChannel?: "general" | "cabine_accueil" | "stock" | "direct";
    customRecipient?: string;
    beepType?: "client_arrived" | "need_product" | "handoff_pos" | "stock_alert";
    audioDataUrl?: string;
  }) => {
    const msgText = (opts?.customText ?? text).trim();
    if (!msgText && !opts?.audioDataUrl) return;
    setSending(true);
    try {
      haptic(HAPTIC.tap);
      await apiPost("/api/pro/team-hub", {
        action: "send_message",
        tenantId,
        channel: opts?.customChannel ?? channel,
        senderName: currentUserName,
        senderRole: currentUserRole,
        recipientName:
          opts?.customRecipient ??
          (channel === "direct" && directRecipient ? directRecipient : undefined),
        text: msgText || "🎤 Note vocale d'équipe",
        beepType: opts?.beepType,
        audioDataUrl: opts?.audioDataUrl,
      });
      if (!opts?.customText) setText("");
      await fetchHub();
    } catch (e: any) {
      toast.error(e?.message || "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  // Enregistrement vocal (Audio + Transcription directe si supportée)
  const startVoiceNote = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      speechTranscriptRef.current = "";

      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        setRecording(false);
        setRecordingSeconds(0);

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size < 400) return;

        // Convertir en DataURL compact
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = typeof reader.result === "string" ? reader.result : undefined;
          const transcript = speechTranscriptRef.current.trim();
          const finalLabel = transcript
            ? `🎤 « ${transcript} »`
            : `🎤 Note vocale de ${currentUserName}`;
          void handleSendMessage({
            customText: finalLabel,
            audioDataUrl: base64Audio && base64Audio.length < 320_000 ? base64Audio : undefined,
          });
        };
        reader.readAsDataURL(blob);
      };

      // Tenter la reconnaissance vocale FR simultanée
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.lang = "fr-FR";
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (event: any) => {
            let str = "";
            for (let i = 0; i < event.results.length; i++) {
              str += event.results[i][0].transcript + " ";
            }
            speechTranscriptRef.current = str.trim();
          };
          rec.start();
          speechRecRef.current = rec;
        } catch {}
      }

      mr.start();
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 29) {
            stopVoiceNote();
            return 30;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("Microphone non autorisé sur cet appareil.");
    }
  };

  const stopVoiceNote = () => {
    try {
      speechRecRef.current?.stop?.();
    } catch {}
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleSaveDirective = async () => {
    if (!dirText.trim()) {
      toast.error("Veuillez saisir la consigne du jour.");
      return;
    }
    setSavingDirective(true);
    try {
      await apiPost("/api/pro/team-hub", {
        action: "set_directive",
        tenantId,
        updatedBy: currentUserName,
        text: dirText.trim(),
        focusProduct: dirFocus.trim() || undefined,
        monthlyGoalFcfa: parseInt(dirGoal.replace(/\D/g, ""), 10) || 2000000,
        teamBonusFcfa: parseInt(dirBonus.replace(/\D/g, ""), 10) || 10000,
      });
      toast.success("Consigne du jour & Cagnotte d'équipe publiées !");
      setEditingDirective(false);
      await fetchHub();
    } catch (e: any) {
      toast.error(e?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSavingDirective(false);
    }
  };

  const handleCreateHandoff = async () => {
    if (!handoffClientName.trim()) {
      toast.error("Indiquez le prénom ou nom de la cliente qui sort de cabine.");
      return;
    }
    if (handoffItems.length === 0) {
      toast.error("Ajoutez au moins un soin réalisé ou un produit conseillé.");
      return;
    }
    setSending(true);
    try {
      const selectedClient = clientsData.find((c) => c.id === handoffClientId);
      await apiPost("/api/pro/team-hub", {
        action: "create_handoff",
        tenantId,
        practitionerName: handoffPractitioner || currentUserName,
        practitionerRole: currentUserRole,
        clientId: handoffClientId || undefined,
        clientName: selectedClient?.name || handoffClientName.trim(),
        clientPhone: selectedClient?.phone || undefined,
        notes: handoffNotes.trim() || undefined,
        items: handoffItems.map((it) => ({
          ...it,
          practitionerName: handoffPractitioner || currentUserName,
        })),
      });
      toast.success(`Panier Sortie de Cabine transmis à la Caisse pour ${handoffPractitioner || currentUserName} !`);
      setBeepModal(null);
      setHandoffItems([]);
      setHandoffClientName("");
      setHandoffClientId("");
      setHandoffNotes("");
      setChannel("cabine_accueil");
      await fetchHub();
    } catch (e: any) {
      toast.error(e?.message || "Impossible de transmettre à la caisse");
    } finally {
      setSending(false);
    }
  };

  const teamMembers = useMemo(() => {
    const raw = hub?.team ?? [];
    return raw.length > 0
      ? raw
      : [
          { id: "edith", name: "Edith", role: "estheticienne", userId: null },
          { id: "deborah", name: "Déborah", role: "dermo_conseillere", userId: null },
          { id: "delphine", name: "Delphine", role: "dermo_conseillere", userId: null },
          { id: "irene", name: "Irène", role: "receptionniste", userId: null },
          { id: "clement", name: "Clément", role: "responsable_stock", userId: null },
        ];
  }, [hub?.team]);

  const practitionersOnly = useMemo(
    () =>
      teamMembers.filter((m) =>
        ["estheticienne", "dermo_conseillere", "praticienne", "coiffeuse", "masseuse"].includes(
          (m.role || "").toLowerCase()
        )
      ),
    [teamMembers]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col h-dvh bg-background border-l border-gold/30"
      >
        {/* ── EN-TÊTE KÈNÈ TEAM LIVE ── */}
        <SheetHeader className="p-4 pb-3 border-b border-border/60 bg-gradient-to-r from-[#1A130D] via-[#241911] to-[#1A130D] text-[#FFF9EC] shrink-0">
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2.5">
              <div className="size-9 rounded-xl bg-gold/20 border border-gold/40 flex items-center justify-center text-[#E5A93C] shadow-xs">
                <MessageSquare className="size-5" />
              </div>
              <div>
                <SheetTitle className="font-heading text-base font-bold text-[#FFF9EC] flex items-center gap-2">
                  <span>Kènè Team Live</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] py-0 px-2">
                    Zéro WhatsApp · Temps réel
                  </Badge>
                </SheetTitle>
                <SheetDescription className="text-[11px] text-[#F5ECDD]/75">
                  {tenantName} · Connectée : <strong className="text-[#E5A93C]">{currentUserName}</strong>
                </SheetDescription>
              </div>
            </div>
          </div>

          {/* ── CONSIGNE DU JOUR & CAGNOTTE D'ÉQUIPE ── */}
          <div className="mt-2.5 rounded-xl border border-[#D49A24]/35 bg-black/30 p-2.5 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Pin className="size-3.5 text-[#E5A93C] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#E5A93C]">
                    Consigne du Jour ({hub?.directive?.updatedBy || "Direction"}) :
                  </span>
                  <p className="text-[11.5px] text-[#FFF9EC] font-medium leading-snug mt-0.5">
                    {hub?.directive?.text ||
                      "Excellence accueil & diagnostic systématique avant chaque soin cabine. Chaque sortie de cabine est transmise à la caisse avec le nom de la praticienne."}
                  </p>
                  {hub?.directive?.focusProduct && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full bg-[#D49A24]/20 text-[#F5D37E] font-bold">
                      🎯 Focus : {hub.directive.focusProduct}
                    </span>
                  )}
                </div>
              </div>
              {(isOwner || currentUserRole === "manager") && (
                <button
                  type="button"
                  onClick={() => setEditingDirective((v) => !v)}
                  className="shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[#E5A93C] transition-colors cursor-pointer"
                  title="Modifier la consigne du jour et l'objectif d'équipe"
                >
                  <Edit3 className="size-3.5" />
                </button>
              )}
            </div>

            {/* Barre Cagnotte Collective */}
            {hub?.teamPot && (
              <div className="pt-1.5 border-t border-white/10 space-y-1">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="flex items-center gap-1 font-bold text-[#F5D37E]">
                    <Trophy className="size-3 text-[#E5A93C]" />
                    Cagnotte Salon : +{xof(hub.teamPot.teamBonusFcfa)} / membre
                  </span>
                  <span className="font-mono text-[10px] text-[#F5ECDD]/80">
                    {xof(hub.teamPot.monthRevenueFcfa)} / {xof(hub.teamPot.monthlyGoalFcfa)} ({hub.teamPot.progressPct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#D49A24] to-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.max(4, hub.teamPot.progressPct)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Éditeur Consigne & Objectif (Gérante) */}
            {editingDirective && (
              <div className="pt-2 border-t border-white/15 space-y-2 bg-black/40 p-2 rounded-lg">
                <Input
                  value={dirText}
                  onChange={(e) => setDirText(e.target.value)}
                  placeholder="Consigne du jour pour toute l'équipe..."
                  className="h-8 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <Input
                    value={dirFocus}
                    onChange={(e) => setDirFocus(e.target.value)}
                    placeholder="Produit focus..."
                    className="h-7 text-[11px] bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  />
                  <Input
                    value={dirGoal}
                    onChange={(e) => setDirGoal(e.target.value)}
                    placeholder="Objectif CA (F)"
                    className="h-7 text-[11px] font-mono bg-white/10 border-white/20 text-white"
                  />
                  <Input
                    value={dirBonus}
                    onChange={(e) => setDirBonus(e.target.value)}
                    placeholder="Prime/pers (F)"
                    className="h-7 text-[11px] font-mono bg-white/10 border-white/20 text-white"
                  />
                </div>
                <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingDirective(false)}
                    className="h-7 text-[11px] text-white/70"
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    disabled={savingDirective}
                    onClick={handleSaveDirective}
                    className="h-7 text-[11px] k-btn-gold text-black font-bold gap-1"
                  >
                    {savingDirective ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    Publier à l&apos;équipe
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── BARRE DES 4 BIPS MÉTIERS 1-CLIC (ZÉRO CLAVIER) ── */}
          <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setBeepTargetPractitioner(practitionersOnly[0]?.name || "Edith");
                setBeepModal("client_arrived");
              }}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1.5 text-left text-[11px] font-bold text-emerald-200 transition-all active:scale-95 cursor-pointer"
            >
              <Bell className="size-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Cliente arrivée</span>
            </button>

            <button
              type="button"
              onClick={() => setBeepModal("need_product")}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1.5 text-left text-[11px] font-bold text-amber-200 transition-all active:scale-95 cursor-pointer"
            >
              <Package className="size-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Besoin Cabine</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setHandoffPractitioner(currentUserName);
                setBeepModal("handoff_pos");
              }}
              className="flex items-center gap-1.5 rounded-xl border border-[#E5A93C]/60 bg-[#D49A24]/25 hover:bg-[#D49A24]/35 px-2.5 py-1.5 text-left text-[11px] font-bold text-[#FFF9EC] transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              <CreditCard className="size-3.5 text-[#E5A93C] shrink-0" />
              <span className="truncate">Sortie → Caisse</span>
            </button>

            <button
              type="button"
              onClick={() => {
                void handleSendMessage({
                  customChannel: "stock",
                  customText: `⚠️ [ALERTE STOCK] Merci à Clément de vérifier le réassort des produits cabine du jour.`,
                  beepType: "stock_alert",
                });
                setChannel("stock");
                toast.success("Alerte Stock envoyée sur #Stock !");
              }}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 px-2.5 py-1.5 text-left text-[11px] font-bold text-rose-200 transition-all active:scale-95 cursor-pointer"
            >
              <AlertTriangle className="size-3.5 text-rose-400 shrink-0" />
              <span className="truncate">Alerte Stock</span>
            </button>
          </div>
        </SheetHeader>

        {/* ── PANNEAU BIPS INTERACTIFS (Cliente arrivée / Besoin produit / Sortie de Cabine → Caisse) ── */}
        {beepModal && (
          <div className="p-3.5 border-b border-gold/40 bg-gold/5 space-y-3 shrink-0 max-h-[55vh] overflow-y-auto pretty-scroll">
            <div className="flex items-center justify-between">
              <p className="font-heading text-xs font-bold text-foreground flex items-center gap-1.5">
                {beepModal === "client_arrived" && "🔔 Bip Accueil → Cabine : Cliente arrivée en salle d'attente"}
                {beepModal === "need_product" && "🧴 Bip Cabine → Stock (Clément) : Besoin urgent en cabine"}
                {beepModal === "handoff_pos" && "💳 Sortie de Cabine → Caisse (Pré-remplit le ticket d'Irène + verrouille ta commission)"}
              </p>
              <button
                type="button"
                onClick={() => setBeepModal(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {beepModal === "client_arrived" && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {teamMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setBeepTargetPractitioner(m.name)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                        beepTargetPractitioner === m.name
                          ? "k-btn-gold text-black border-transparent"
                          : "bg-card text-foreground border-border"
                      )}
                    >
                      Pour {m.name}
                    </button>
                  ))}
                </div>
                <Input
                  value={beepClientName}
                  onChange={(e) => setBeepClientName(e.target.value)}
                  placeholder="Nom de la cliente (ex: Mme Koné)..."
                  className="h-9 text-xs"
                />
                <Button
                  size="sm"
                  disabled={sending}
                  onClick={async () => {
                    const cName = beepClientName.trim() || "Ta cliente";
                    const target = beepTargetPractitioner || "Cabine";
                    await handleSendMessage({
                      customChannel: "cabine_accueil",
                      customRecipient: target,
                      customText: `🔔 [CLIENTE ARRIVÉE] @${target} : ${cName} est installée en salle d'attente et prête pour son soin.`,
                      beepType: "client_arrived",
                    });
                    setBeepClientName("");
                    setBeepModal(null);
                    setChannel("cabine_accueil");
                    toast.success(`Bip envoyé à ${target} !`);
                  }}
                  className="w-full h-9 k-btn-gold text-black font-bold text-xs gap-1.5"
                >
                  <Bell className="size-3.5" />
                  Sonner {beepTargetPractitioner || "la praticienne"} maintenant
                </Button>
              </div>
            )}

            {beepModal === "need_product" && (
              <div className="space-y-2.5">
                <div className="flex gap-1.5">
                  {["Cabine 1", "Cabine 2", "Salle Diagnostic", "Comptoir"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBeepCabinName(c)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer",
                        beepCabinName === c ? "k-btn-gold text-black border-transparent" : "bg-card border-border"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <Input
                  value={beepProductLabel}
                  onChange={(e) => setBeepProductLabel(e.target.value)}
                  placeholder="Produit / consommable demandé (ex: Sérum Moringa, Gants, Cotons)..."
                  className="h-9 text-xs"
                />
                <Button
                  size="sm"
                  disabled={sending}
                  onClick={async () => {
                    const prod = beepProductLabel.trim() || "Réassort produit cabine";
                    await handleSendMessage({
                      customChannel: "stock",
                      customRecipient: "Clément",
                      customText: `🧴 [BESOIN CABINE] @Clément : ${currentUserName} demande « ${prod} » en ${beepCabinName}.`,
                      beepType: "need_product",
                    });
                    setBeepProductLabel("");
                    setBeepModal(null);
                    setChannel("stock");
                    toast.success("Demande envoyée à Clément (Stock) !");
                  }}
                  className="w-full h-9 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs gap-1.5"
                >
                  <Package className="size-3.5" />
                  Demander à Clément en 1 clic
                </Button>
              </div>
            )}

            {beepModal === "handoff_pos" && (
              <div className="space-y-2.5">
                {/* Choix de la praticienne qui a réalisé le soin (ex: Edith) */}
                <div className="space-y-1">
                  <span className="text-[10.5px] font-bold text-muted-foreground">
                    1. Praticienne créditée pour la commission :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {teamMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setHandoffPractitioner(m.name)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                          handoffPractitioner === m.name
                            ? "k-btn-gold text-black border-transparent shadow-xs"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cliente */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={handoffClientId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setHandoffClientId(id);
                      const found = clientsData.find((c) => c.id === id);
                      if (found) setHandoffClientName(found.name);
                    }}
                    className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs"
                  >
                    <option value="">-- Choisir une cliente du carnet --</option>
                    {clientsData.slice(0, 60).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                  <Input
                    value={handoffClientName}
                    onChange={(e) => setHandoffClientName(e.target.value)}
                    placeholder="Ou saisir le nom de la cliente..."
                    className="h-9 text-xs"
                  />
                </div>

                {/* Sélection rapide des soins & produits */}
                <div className="space-y-1">
                  <span className="text-[10.5px] font-bold text-muted-foreground">
                    2. Toucher les soins réalisés &amp; produits prescrits :
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-1.5 rounded-lg border border-border bg-card/60">
                    {(catalogData?.services ?? [])
                      .filter((s) => s.active)
                      .slice(0, 12)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setHandoffItems((prev) => {
                              const ex = prev.find((i) => i.id === s.id);
                              if (ex) return prev.map((i) => (i.id === s.id ? { ...i, qty: i.qty + 1 } : i));
                              return [...prev, { kind: "service", id: s.id, label: s.name, unitPrice: s.price, qty: 1 }];
                            })
                          }
                          className="px-2 py-1 rounded-md text-[10.5px] font-semibold bg-gold/10 hover:bg-gold/20 text-foreground border border-gold/30 cursor-pointer"
                        >
                          + 💆‍♀️ {s.name} ({xof(s.price)})
                        </button>
                      ))}
                    {(catalogData?.products ?? [])
                      .filter((p) => p.active)
                      .slice(0, 12)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setHandoffItems((prev) => {
                              const ex = prev.find((i) => i.id === p.id);
                              if (ex) return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
                              return [...prev, { kind: "product", id: p.id, label: p.name, unitPrice: p.price, qty: 1 }];
                            })
                          }
                          className="px-2 py-1 rounded-md text-[10.5px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-foreground border border-emerald-500/30 cursor-pointer"
                        >
                          + 🧴 {p.name} ({xof(p.price)})
                        </button>
                      ))}
                  </div>
                </div>

                {/* Panier sélectionné */}
                {handoffItems.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-2 space-y-1">
                    {handoffItems.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">
                          {it.qty}× {it.label}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-gold-text">{xof(it.unitPrice * it.qty)}</span>
                          <button
                            type="button"
                            onClick={() => setHandoffItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="pt-1 border-t border-border/50 flex justify-between text-xs font-bold">
                      <span>Total à encaisser par Irène (Caisse)</span>
                      <span className="font-mono text-gold-text">
                        {xof(handoffItems.reduce((s, i) => s + i.unitPrice * i.qty, 0))}
                      </span>
                    </div>
                  </div>
                )}

                <Input
                  value={handoffNotes}
                  onChange={(e) => setHandoffNotes(e.target.value)}
                  placeholder="Note pour la caisse (ex: acompte déjà réglé, prochain RDV dans 15j)..."
                  className="h-8 text-xs"
                />

                <Button
                  size="sm"
                  disabled={sending || handoffItems.length === 0}
                  onClick={handleCreateHandoff}
                  className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm"
                >
                  {sending ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
                  Transmettre à la Caisse (Commission attribuée à {handoffPractitioner})
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── SORTIES DE CABINE EN ATTENTE D'ENCAISSEMENT ── */}
        {(hub?.handoffs ?? []).length > 0 && (
          <div className="px-3.5 py-2 bg-emerald-500/10 border-b border-emerald-500/30 flex items-center justify-between gap-2 shrink-0">
            <div className="text-xs min-w-0">
              <span className="font-bold text-emerald-700 dark:text-emerald-300">
                🛋️ {hub!.handoffs.length} sortie(s) de cabine prête(s) à encaisser
              </span>
              <p className="text-[10.5px] text-muted-foreground truncate">
                {hub!.handoffs.map((h) => `${h.clientName} (${h.practitionerName} · ${xof(h.totalAmount)})`).join(" • ")}
              </p>
            </div>
            {onNavigate && (
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onNavigate("caisse");
                }}
                className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0"
              >
                Ouvrir Caisse
              </Button>
            )}
          </div>
        )}

        {/* ── ONGLETS DES 4 CANAUX ── */}
        <div className="px-3 pt-2 pb-1.5 border-b border-border/60 bg-muted/30 shrink-0 space-y-1.5">
          <div className="grid grid-cols-4 gap-1">
            {CHANNELS.map((c) => {
              const active = channel === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id)}
                  className={cn(
                    "py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer border",
                    active
                      ? "k-btn-gold text-black border-transparent shadow-xs"
                      : "bg-card text-muted-foreground border-border/60 hover:text-foreground"
                  )}
                >
                  <span>{c.emoji}</span>
                  <span className="truncate">{c.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Filtre destinataire pour canal Direct (1-à-1) */}
          {channel === "direct" && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] font-bold text-muted-foreground shrink-0 mr-1">Destinataire :</span>
              <button
                type="button"
                onClick={() => setDirectRecipient("")}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10.5px] font-bold border shrink-0 cursor-pointer",
                  !directRecipient ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
                )}
              >
                Toutes mes discussions
              </button>
              {teamMembers
                .filter((m) => m.name.toLowerCase() !== currentUserName.toLowerCase())
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDirectRecipient(m.name)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border shrink-0 cursor-pointer",
                      directRecipient === m.name
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border"
                    )}
                  >
                    {m.name} ({formatRole(m.role)})
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* ── FLUX DES MESSAGES D'ÉQUIPE ── */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 pretty-scroll">
          {loading && !hub ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-gold-text" />
              <p className="text-xs">Synchronisation Kènè Team Live...</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="mx-auto size-12 rounded-2xl bg-gold/10 border border-gold/25 flex items-center justify-center text-gold-text">
                <Users className="size-6" />
              </div>
              <p className="font-heading text-sm font-bold text-foreground">
                Canal {CHANNELS.find((c) => c.id === channel)?.label} prêt
              </p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Envoyez un message, une note vocale mains-libres ou utilisez les 4 Bips Métiers en haut pour coordonner le salon sans WhatsApp.
              </p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isMe = msg.senderName.trim().toLowerCase() === currentUserName.trim().toLowerCase();
              const isBeep = Boolean(msg.beepType);
              return (
                <div
                  key={msg.id}
                  className={cn("flex flex-col gap-1", isMe ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs border",
                      isBeep
                        ? "bg-gradient-to-r from-amber-500/15 via-gold/15 to-card border-gold/50 text-foreground"
                        : isMe
                        ? "bg-primary text-primary-foreground border-primary/80 rounded-br-xs"
                        : "bg-card text-foreground border-border/80 rounded-bl-xs"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={cn("font-bold text-[10.5px]", isMe && !isBeep ? "text-primary-foreground/90" : "text-gold-text")}>
                        {msg.senderName}
                        <span className="font-normal opacity-75"> · {formatRole(msg.senderRole)}</span>
                        {msg.recipientName && (
                          <span className="ml-1 px-1.5 py-0.2 rounded bg-black/15 text-[9.5px]">
                            → @{msg.recipientName}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[9.5px] opacity-70 shrink-0">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>

                    <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>

                    {msg.audioDataUrl && (
                      <div className="mt-2 flex items-center gap-2 bg-black/15 rounded-xl p-1.5">
                        <Volume2 className="size-4 text-gold-text shrink-0" />
                        <audio controls src={msg.audioDataUrl} className="h-7 w-48 max-w-full" />
                      </div>
                    )}

                    {/* Accusés de lecture nominatifs ("Vu par Edith, Irène ✓✓") */}
                    {msg.readBy && msg.readBy.length > 0 && (
                      <div className="mt-1.5 pt-1 border-t border-current/10 flex items-center justify-end gap-1 text-[9.5px] opacity-80">
                        <CheckCheck className="size-3 text-emerald-400 shrink-0" />
                        <span className="truncate">Vu par {msg.readBy.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── COMPOSITEUR BAS : TEXTE + MICRO MAINS-LIBRES (Gants Cabine) ── */}
        <div className="p-3 border-t border-border/70 bg-card shrink-0 space-y-2">
          {recording ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/50 bg-rose-500/10 px-3.5 py-2">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
                <span className="size-2.5 rounded-full bg-rose-500 animate-ping" />
                <span>Enregistrement vocal mains-libres... ({recordingSeconds}s)</span>
              </div>
              <Button
                size="sm"
                onClick={stopVoiceNote}
                className="h-8 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs gap-1.5"
              >
                <Square className="size-3.5 fill-white" />
                Envoyer la note
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <button
                type="button"
                onClick={startVoiceNote}
                title="Maintenir / toucher pour dicter une note vocale mains-libres (idéal en cabine avec des gants)"
                className="size-10 rounded-xl border border-gold/40 bg-gold/15 hover:bg-gold/25 text-gold-text flex items-center justify-center shrink-0 transition-all active:scale-95 cursor-pointer"
              >
                <Mic className="size-4" />
              </button>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  channel === "direct" && directRecipient
                    ? `Message direct pour ${directRecipient}...`
                    : `Écrire dans ${CHANNELS.find((c) => c.id === channel)?.label || "#Équipe"}...`
                }
                className="h-10 text-xs rounded-xl flex-1"
              />
              <Button
                type="submit"
                disabled={sending || !text.trim()}
                className="h-10 px-3.5 rounded-xl k-btn-gold text-black font-bold text-xs gap-1.5 shrink-0"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                <span className="hidden sm:inline">Envoyer</span>
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
