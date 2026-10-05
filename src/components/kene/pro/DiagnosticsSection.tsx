"use client";
// Kènè Pro — Diagnostic en cabine : L'ENTREPRISE réalise le diagnostic de peau
// au sein de sa structure, accompagné d'un questionnaire dermatologique.
// Assistant 4 étapes : Cliente & Zone (avec sélecteur 3D anatomique & signature tactile)
// → Questionnaire dynamique → Photo en cabine → Résultat immersif (Scroll 3D, multi-spectral, projection).
// Fusion serveur : entretien déclaratif (38 %) ± photo analysée par le VLM (62 %).
// Chaque diagnostic enrichit le CRM, permet la vente directe au comptoir et le partage WhatsApp.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Camera, ChevronLeft, ChevronRight, Compass, FileDown, Filter, ImagePlus, Info,
  Layers, Loader2, OctagonAlert, PenLine, Printer, Search, Share2, ShieldCheck,
  ShoppingBag, SlidersHorizontal, Sparkles, Stethoscope, Trash2, UserPlus, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CABIN_SAFETY_CHECKLIST, evaluateSafetyChecklist, type CosmetovigilanceIncident, type ReactionType, type ReactionSeverity } from "@/lib/kene/cosmetovigilance";
import { apiGet, apiPost, resizeImage } from "@/lib/kene/api";
import { formatDate, formatTime, scoreVar } from "@/lib/kene/format";
import { BODY_ZONES, ZONE_PHOTO_SLOTS } from "@/lib/kene/types";
import type { BodyZone, Indicator } from "@/lib/kene/types";
import {
  QUESTIONS, QUESTIONNAIRE_SECTIONS, defaultAnswers, questionnaireProgress, parseProDiagnosis,
} from "@/lib/kene/questionnaire";
import type { ProDiagnosisResult, QAnswers } from "@/lib/kene/questionnaire";
import { SkinDescent } from "@/components/kene/descent/SkinDescent";
import { SkinZoneSelector } from "./diagnostic/SkinZoneSelector";
import { TouchSignaturePad } from "./diagnostic/TouchSignaturePad";
import { SpectralViewer } from "./diagnostic/SpectralViewer";
import { SkinProjectionCurve } from "./diagnostic/SkinProjectionCurve";
import { PhotoScanAnimation } from "./diagnostic/PhotoScanAnimation";
import { useApi } from "./useApi";
import type { EmployeesResponse, ProClient, ProDiagnosesKpis, ProDiagnosisItem } from "./types";
import { EmptyState, ErrorState, InitialAvatar, KenteTop, SectionHeader } from "./ui-bits";
import type { ProSectionId } from "./ProApp";

interface Props {
  tenantId: string;
  refreshKey?: number;
  /** Commande « Lancer un diagnostic » depuis la fiche CRM (nonce = rouvre l'assistant) */
  preselectCommand?: { clientId: string; nonce: number } | null;
  /** Accusé de réception de la commande (le wizard s'est ouvert puis refermé) */
  onCommandHandled?: () => void;
  onNavigate?: (s: ProSectionId) => void;
}

const EMPTY_KPIS: ProDiagnosesKpis = { monthCount: 0, avgScore: 0, photoShare: 0, total: 0 };

function toastError(e: unknown, fallback = "Action impossible") {
  toast.error(e instanceof Error ? e.message : fallback);
}

function buildWhatsAppDiagUrl(clientName: string, phone: string, result: ProDiagnosisResult, tenantName?: string) {
  const digits = phone.replace(/\D/g, "");
  const target =
    digits.startsWith("225") || digits.startsWith("221")
      ? digits
      : digits.length === 10
      ? `225${digits}`
      : digits.length === 9
      ? `221${digits}`
      : digits;
  const botaniques = result.recommandations.botaniques_conseillees?.join(", ") || "Karité, Moringa, Baobab";
  const soins = result.recommandations.soins_conseilles?.slice(0, 2).join(" • ") || "Soin dermo-botanique";
  const text = `Bonjour ${clientName.split(" ")[0]} 🌸\n\nVoici votre bilan de peau personnalisé réalisé en institut${tenantName ? ` chez « ${tenantName} »` : ""} :\n\n📊 Score santé cutanée : ${result.score_global}/100\n📍 Zone : ${result.zone.replace("_", " ")}\n🌿 Botaniques clés : ${botaniques}\n💆‍♀️ Soin cabine conseillé : ${soins}\n\nRetrouvez votre protocole complet et vos progrès sur l'application Kènè ! ✨`;
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
}

export function DiagnosticsSection({ tenantId, refreshKey = 0, preselectCommand, onCommandHandled, onNavigate }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Cosmétovigilance & Sécurité cabine
  const [vigilanceOpen, setVigilanceOpen] = useState(false);
  const [vigilanceSubmitting, setVigilanceSubmitting] = useState(false);
  const [incidentClientName, setIncidentClientName] = useState("");
  const [incidentClientPhone, setIncidentClientPhone] = useState("");
  const [incidentProductOrService, setIncidentProductOrService] = useState("");
  const [incidentBatch, setIncidentBatch] = useState("");
  const [incidentType, setIncidentType] = useState<ReactionType>("erytheme_persistant");
  const [incidentSeverity, setIncidentSeverity] = useState<ReactionSeverity>("moderee");
  const [incidentSymptoms, setIncidentSymptoms] = useState("");
  const [incidentAction, setIncidentAction] = useState("");
  const [incidentReporter, setIncidentReporter] = useState("");

  const vigilanceApi = useApi<{ incidents: CosmetovigilanceIncident[] }>(
    () => (tenantId ? apiGet<{ incidents: CosmetovigilanceIncident[] }>(`/api/pro/cosmetovigilance?tenantId=${tenantId}`) : Promise.resolve({ incidents: [] })),
    [tenantId, refreshKey]
  );

  const handleSubmitIncident = async () => {
    if (!tenantId) return;
    if (incidentClientName.trim().length < 2) return toast.error("Nom de la cliente requis");
    if (incidentProductOrService.trim().length < 2) return toast.error("Produit ou soin incriminé requis");
    if (incidentSymptoms.trim().length < 5) return toast.error("Veuillez décrire précisément les symptômes observés");
    if (incidentAction.trim().length < 3) return toast.error("Veuillez renseigner les mesures d'urgence prises");

    setVigilanceSubmitting(true);
    try {
      await apiPost("/api/pro/cosmetovigilance", {
        tenantId,
        clientName: incidentClientName.trim(),
        clientPhone: incidentClientPhone.trim() || undefined,
        productOrServiceName: incidentProductOrService.trim(),
        batchNumber: incidentBatch.trim() || undefined,
        reactionType: incidentType,
        severity: incidentSeverity,
        symptoms: incidentSymptoms.trim(),
        actionTaken: incidentAction.trim(),
        reportedBy: incidentReporter.trim() || "Praticienne de garde",
      });
      toast.success("Signalement de cosmétovigilance enregistré et archivé !");
      void vigilanceApi.refetch();
      setIncidentClientName("");
      setIncidentClientPhone("");
      setIncidentProductOrService("");
      setIncidentBatch("");
      setIncidentSymptoms("");
      setIncidentAction("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'enregistrement");
    } finally {
      setVigilanceSubmitting(false);
    }
  };

  // Filtres de recherche & d'analyse
  const [searchQuery, setSearchQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<"all" | "danger" | "photo" | "entretien">("all");

  // État d'immersion 3D au défilement (Descente de Peau plein cadre)
  const [skinDescentData, setSkinDescentData] = useState<{
    indicators: Indicator[];
    score: number;
    zoneLabel: string;
  } | null>(null);

  // Commande CRM « Lancer un diagnostic »: détectée pendant le RENDU
  const [seenNonce, setSeenNonce] = useState(-1);
  if (preselectCommand && preselectCommand.nonce > seenNonce) {
    setSeenNonce(preselectCommand.nonce);
    setWizardOpen(true);
  }

  const list = useApi<{ diagnoses: ProDiagnosisItem[]; kpis: ProDiagnosesKpis }>(
    () =>
      tenantId
        ? apiGet<{ diagnoses: ProDiagnosisItem[]; kpis: ProDiagnosesKpis }>(`/api/pro/diagnoses?tenantId=${tenantId}`)
        : Promise.resolve({ diagnoses: [], kpis: EMPTY_KPIS }),
    [tenantId, refreshKey]
  );

  const diagnoses = list.data?.diagnoses ?? [];
  const kpis = list.data?.kpis ?? EMPTY_KPIS;
  const detail = detailId ? diagnoses.find((d) => d.id === detailId) : null;

  // Filtrage multi-critères
  const filteredDiagnoses = useMemo(() => {
    return diagnoses.filter((d) => {
      // Filtre texte (nom cliente ou praticienne)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = d.clientName.toLowerCase().includes(q);
        const pracMatch = d.practitioner ? d.practitioner.toLowerCase().includes(q) : false;
        if (!nameMatch && !pracMatch) return false;
      }
      // Filtre zone
      if (zoneFilter !== "all" && d.zone !== zoneFilter) return false;
      // Filtre risque / méthode
      if (riskFilter === "photo" && !d.vlmUsed) return false;
      if (riskFilter === "entretien" && d.vlmUsed) return false;
      if (riskFilter === "danger") {
        const flags = parseProDiagnosis(d.resultJson)?.questionnaire.flags ?? [];
        if (!flags.some((f) => f.level === "danger")) return false;
      }
      return true;
    });
  }, [diagnoses, searchQuery, zoneFilter, riskFilter]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Diagnostic en cabine"
        sub="L'institut réalise le diagnostic peau, guidé par le questionnaire dermatologique et l'IA visuelle"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setVigilanceOpen(true)}
              className="gap-2 text-bissap border-bissap/40 hover:bg-bissap/10 font-semibold text-xs"
            >
              <AlertTriangle className="size-4" />
              Cosmétovigilance ({vigilanceApi.data?.incidents?.length ?? 0})
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(`/api/pro/consultation-sheet?tenantId=${tenantId}`, "_blank")}
              className="gap-2"
              aria-label="Imprimer une fiche de consultation vierge (support papier de l'entretien)"
            >
              <Printer className="size-4" aria-hidden="true" />
              Fiche vierge
            </Button>
            <Button onClick={() => setWizardOpen(true)} className="gap-2 font-semibold k-btn-gold text-primary-foreground" aria-label="Lancer un nouveau diagnostic en cabine">
              <Stethoscope className="size-4" aria-hidden="true" />
              Nouveau diagnostic
            </Button>
          </div>
        }
      />

      {/* Principe de fusion — pédagogie rapide pour la praticienne */}
      <Card className="overflow-hidden pt-0 border-gold/25">
        <KenteTop />
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold-text shrink-0">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Entretien + observation VLM fusionnés.</span> Le questionnaire
              capture ce que la cliente <em>déclare</em> (38 %), la photo de cabine apporte ce que l&apos;IA{" "}
              <em>observe</em> (62 %). Les bilans intègrent la <strong>Descente de Peau 3D au scroll</strong>, l&apos;analyse multi-spectrale et l&apos;envoi WhatsApp.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiStat icon={<Stethoscope className="size-4" />} label="Diagnostics" value={String(kpis.total)} hint={`${kpis.monthCount} ce mois-ci`} />
        <KpiStat icon={<Sparkles className="size-4" />} label="Score moyen" value={`${kpis.avgScore}/100`} hint="santé de peau fusionnée" monetary={false} />
        <KpiStat icon={<Camera className="size-4" />} label="Avec photo IA" value={`${kpis.photoShare} %`} hint="analyse VLM couplée" monetary={false} />
      </div>

      {/* Barre de recherche et filtres de consultation */}
      <div className="rounded-2xl border border-border bg-card p-3 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par cliente ou praticienne…"
              className="pl-9 h-9 text-xs"
            />
          </div>

          <Select value={zoneFilter} onValueChange={setZoneFilter}>
            <SelectTrigger className="h-9 text-xs w-full sm:w-44" aria-label="Filtrer par zone">
              <SelectValue placeholder="Toutes les zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les zones</SelectItem>
              {BODY_ZONES.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-xl border border-border shrink-0">
            {(
              [
                ["all", "Tous"],
                ["danger", "Vigilances"],
                ["photo", "Photo IA"],
                ["entretien", "Entretien"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setRiskFilter(val)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors",
                  riskFilter === val
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredDiagnoses.length !== diagnoses.length && (
          <p className="text-[11px] text-muted-foreground font-mono">
            {filteredDiagnoses.length} résultat{filteredDiagnoses.length > 1 ? "s" : ""} sur {diagnoses.length} diagnostic{diagnoses.length > 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Historique */}
      <Card className="overflow-hidden">
        {list.error && !list.data ? (
          typeof navigator !== "undefined" && !navigator.onLine ? (
            <CardContent className="p-8 text-center space-y-3">
              <EmptyState
                label="Diagnostics hors-ligne"
                sub="L'historique des diagnostics cabine n'a pas encore été synchronisé sur cet appareil. Vos analyses s'afficheront dès la reconnexion."
              />
              <Button onClick={list.refetch} variant="outline" className="text-xs">
                Réessayer la connexion
              </Button>
            </CardContent>
          ) : (
            <CardContent className="p-4">
              <ErrorState message={`Diagnostics indisponibles : ${list.error}`} onRetry={list.refetch} />
            </CardContent>
          )
        ) : list.loading && !list.data ? (
          <CardContent className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </CardContent>
        ) : filteredDiagnoses.length === 0 ? (
          <CardContent className="py-8">
            <EmptyState
              label={diagnoses.length === 0 ? "Aucun diagnostic en cabine" : "Aucun résultat correspondant"}
              sub={
                diagnoses.length === 0
                  ? "Lancez le premier : questionnaire guidé, photo optionnelle, immersion 3D et résultat dans le CRM."
                  : "Essayez de modifier vos filtres ou votre recherche."
              }
            />
            {diagnoses.length === 0 && (
              <div className="mt-3 flex justify-center">
                <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5 k-btn-gold text-primary-foreground font-semibold">
                  <Stethoscope className="size-3.5" aria-hidden="true" />
                  Premier diagnostic
                </Button>
              </div>
            )}
          </CardContent>
        ) : (
          <ul className="divide-y divide-border max-h-[30rem] overflow-y-auto pretty-scroll">
            {filteredDiagnoses.map((d) => {
              const flags = parseProDiagnosis(d.resultJson)?.questionnaire.flags ?? [];
              const danger = flags.some((f) => f.level === "danger");
              return (
                <li key={d.id}>
                  <button
                    onClick={() => setDetailId(d.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 focus-visible:bg-accent/50 outline-none transition-colors"
                    aria-label={`Ouvrir le diagnostic de ${d.clientName} — score ${d.scoreGlobal}/100`}
                  >
                    <InitialAvatar name={d.clientName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.clientName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        <span className="capitalize">{d.zone.replace("_", " ")}</span>
                        {d.practitioner ? ` · ${d.practitioner}` : ""}
                        {flags.length > 0 ? ` · ${flags.length} vigilance${flags.length > 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                    {danger && (
                      <Badge variant="outline" className="hidden sm:inline-flex bg-bissap/10 text-bissap border-bissap/30 text-[10px]">
                        <OctagonAlert className="size-3" aria-hidden="true" />
                        Vigilance
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn("text-[10px]", d.vlmUsed ? "bg-gold/10 text-gold-text border-gold/30" : "bg-muted text-muted-foreground")}>
                      {d.vlmUsed ? "Photo IA" : "Entretien"}
                    </Badge>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold tabular-nums" style={{ color: scoreVar(d.scoreGlobal) }}>
                        {d.scoreGlobal}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {formatDate(d.createdAt, { day: "2-digit", month: "2-digit" })} {formatTime(d.createdAt)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {wizardOpen && (
        <DiagWizard
          tenantId={tenantId}
          preselectClientId={preselectCommand?.clientId ?? null}
          onClose={() => {
            setWizardOpen(false);
            onCommandHandled?.();
          }}
          onSaved={() => void list.refetch()}
          onNavigate={onNavigate}
          onOpenDescent={(data) => setSkinDescentData(data)}
        />
      )}

      {detail && (
        <DetailSheet
          item={detail}
          tenantId={tenantId}
          onClose={() => setDetailId(null)}
          onNavigate={onNavigate}
          onOpenDescent={(data) => setSkinDescentData(data)}
        />
      )}

      {/* Overlay plein écran : Descente de Peau 3D au Défilement */}
      {skinDescentData && (
        <SkinDescent
          indicators={skinDescentData.indicators}
          score={skinDescentData.score}
          zoneLabel={skinDescentData.zoneLabel}
          onClose={() => setSkinDescentData(null)}
        />
      )}

      {/* ── Modal Cosmétovigilance & Signalement d'Effets Indésirables ── */}
      <Dialog open={vigilanceOpen} onOpenChange={setVigilanceOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto pretty-scroll p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 text-bissap">
              <AlertTriangle className="size-5" />
              <DialogTitle className="font-heading text-lg">Cosmétovigilance &amp; Fiche d&apos;Incidents Cabine</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Déclaration et archivage réglementaire des effets indésirables (érythèmes, brûlures, réactions allergiques, hyperpigmentation post-acte).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-bissap/30 bg-bissap/5 p-3 space-y-3">
              <h4 className="text-xs font-bold text-bissap uppercase tracking-wider">Nouveau Signalement d&apos;Effet Indésirable</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Nom de la cliente *</label>
                  <Input
                    value={incidentClientName}
                    onChange={(e) => setIncidentClientName(e.target.value)}
                    placeholder="Ex: Aminata Diop"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Téléphone contact</label>
                  <Input
                    value={incidentClientPhone}
                    onChange={(e) => setIncidentClientPhone(e.target.value)}
                    placeholder="Ex: 07 00 00 00 00"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Soin ou Produit suspecté *</label>
                  <Input
                    value={incidentProductOrService}
                    onChange={(e) => setIncidentProductOrService(e.target.value)}
                    placeholder="Ex: Peeling Glycolique 30% ou Sérum Niacinamide"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">N° de lot produit (si applicable)</label>
                  <Input
                    value={incidentBatch}
                    onChange={(e) => setIncidentBatch(e.target.value)}
                    placeholder="Ex: LOT-2026-08B"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Type de réaction</label>
                  <Select value={incidentType} onValueChange={(v: any) => setIncidentType(v)}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="erytheme_persistant">Érythème persistant / rougeur vive</SelectItem>
                      <SelectItem value="brulure_chimique">Brûlure chimique ou picotement intolérable</SelectItem>
                      <SelectItem value="oedeme_gonflement">Œdème / gonflement visage</SelectItem>
                      <SelectItem value="reaction_allergique">Réaction allergique / urticaire</SelectItem>
                      <SelectItem value="hyperpigmentation_post_peeling">Hyperpigmentation post-peeling (HPI)</SelectItem>
                      <SelectItem value="desquamation_excessive">Desquamation excessive / croûtes</SelectItem>
                      <SelectItem value="autre">Autre réaction cutanée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Gravité</label>
                  <Select value={incidentSeverity} onValueChange={(v: any) => setIncidentSeverity(v)}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mineure">Mineure (inconfort passager, réversible)</SelectItem>
                      <SelectItem value="moderee">Modérée (gêne prononcée, soins requis)</SelectItem>
                      <SelectItem value="severe">Sévère (orientation dermato requise)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Description des symptômes observés *</label>
                <Textarea
                  value={incidentSymptoms}
                  onChange={(e) => setIncidentSymptoms(e.target.value)}
                  placeholder="Ex: Érythème intense apparu 10 minutes après l'application, sensation de brûlure vive, œdème localisé sur les pommettes..."
                  className="text-xs min-h-[60px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Mesures d&apos;urgence prises en cabine *</label>
                  <Input
                    value={incidentAction}
                    onChange={(e) => setIncidentAction(e.target.value)}
                    placeholder="Ex: Neutralisation immédiate, compresse eau thermale, crème cica"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Déclaré par (Praticienne)</label>
                  <Input
                    value={incidentReporter}
                    onChange={(e) => setIncidentReporter(e.target.value)}
                    placeholder="Nom de l'esthéticienne"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={handleSubmitIncident}
                  disabled={vigilanceSubmitting}
                  className="gap-1.5 text-xs font-bold bg-bissap text-white hover:bg-bissap/90"
                >
                  {vigilanceSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <AlertTriangle className="size-3.5" />}
                  Archiver la fiche d&apos;incident
                </Button>
              </div>
            </div>

            {/* Registre des incidents déclarés */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Registre historique des signalements ({vigilanceApi.data?.incidents?.length ?? 0})
              </h4>
              {(vigilanceApi.data?.incidents ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-xl">
                  Aucun incident déclaré. Tous les soins de l&apos;institut sont à ce jour conformes aux normes.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto pretty-scroll space-y-2 pr-1">
                  {vigilanceApi.data?.incidents.map((inc) => (
                    <div key={inc.id} className="p-3 rounded-xl border bg-card text-xs space-y-1.5 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">
                          {inc.id} · {inc.clientName} ({inc.productOrServiceName})
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold",
                            inc.severity === "severe" ? "bg-red-500/15 text-red-700 border-red-500/30" : inc.severity === "moderee" ? "bg-amber-500/15 text-amber-700 border-amber-500/30" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {inc.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        <strong>Symptômes :</strong> {inc.symptoms}
                      </p>
                      <p className="text-primary text-[11px]">
                        <strong>Mesures prises :</strong> {inc.actionTaken}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                        <span>Signalé par {inc.reportedBy}</span>
                        <span>{formatDate(inc.createdAt)} à {formatTime(inc.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-3 border-t">
            <Button variant="outline" size="sm" onClick={() => setVigilanceOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiStat({ icon, label, value, hint, monetary = false }: { icon: React.ReactNode; label: string; value: string; hint?: string; monetary?: boolean }) {
  return (
    <Card className="overflow-hidden pt-0">
      <KenteTop />
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <span className="text-primary shrink-0">{icon}</span>
        </div>
        <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums leading-tight">{monetary ? `${value} F` : value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ═════════════ Assistant 4 étapes ═════════════

type WizardClient = { id: string; name: string; phone: string };

const STEPS = [
  { n: 1, label: "Cliente & Zone" },
  { n: 2, label: "Questionnaire" },
  { n: 3, label: "Photo Cabine" },
  { n: 4, label: "Résultat 3D" },
];

const ANALYSIS_STEPS = [
  "Analyse de l'entretien (déclaratif dermo)…",
  "Lecture optique de la photo par le VLM…",
  "Fusion multi-spectrale & cartographie 3D…",
  "Calcul des recommandations botaniques…",
];

function DiagWizard({
  tenantId,
  preselectClientId,
  onClose,
  onSaved,
  onNavigate,
  onOpenDescent,
}: {
  tenantId: string;
  preselectClientId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onNavigate?: (s: ProSectionId) => void;
  onOpenDescent: (d: { indicators: Indicator[]; score: number; zoneLabel: string }) => void;
}) {
  const [step, setStep] = useState(1);
  const [zone, setZone] = useState<BodyZone>("visage");
  const [selected, setSelected] = useState<WizardClient | null>(null);
  const [answers, setAnswers] = useState<QAnswers>(defaultAnswers);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [practitioner, setPractitioner] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ProDiagnosisResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [analysisMsg, setAnalysisMsg] = useState(ANALYSIS_STEPS[0]);
  const [consent, setConsent] = useState({ photo: false, data: false });
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Message rotatif
  const msgIdx = useRef(0);
  useEffect(() => {
    if (!submitting) return;
    msgIdx.current = 0;
    setAnalysisMsg(ANALYSIS_STEPS[0]);
    const t = window.setInterval(() => {
      msgIdx.current = (msgIdx.current + 1) % ANALYSIS_STEPS.length;
      setAnalysisMsg(ANALYSIS_STEPS[msgIdx.current]);
    }, 4_000);
    return () => window.clearInterval(t);
  }, [submitting]);

  const progress = useMemo(() => questionnaireProgress(answers), [answers]);
  const zoneLabel = BODY_ZONES.find((z) => z.id === zone)?.label ?? zone;

  const reset = () => {
    setStep(1);
    setZone("visage");
    setSelected(null);
    setAnswers(defaultAnswers());
    setPhoto(null);
    setPhotos({});
    setResult(null);
    setSubmitError(null);
    setConsent({ photo: false, data: false });
    setSignatureData(null);
    setSavedId(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    setStep(4);
    const slots = ZONE_PHOTO_SLOTS[zone] ?? [{ id: "main", label: "Vue principale", hint: "Cadrez la zone", required: true }];
    const photosList = slots.map((s) => photos[s.id]).filter(Boolean) as string[];
    const primaryPhoto = photosList[0] || photo || undefined;
    try {
      const res = await apiPost<{ diagnosis: ProDiagnosisItem; result: ProDiagnosisResult; reusedClient: boolean }>(
        "/api/pro/diagnoses",
        {
          tenantId,
          zone,
          answers,
          clientProfileId: selected?.id,
          photo: primaryPhoto,
          photos: photosList.length > 0 ? photosList : undefined,
          practitioner: practitioner.trim() || undefined,
          consent,
        },
        { timeoutMs: 90_000 }
      );
      setResult(res.result);
      setSavedId(res.diagnosis.id);
      toast.success(`Diagnostic enregistré — ${res.diagnosis.clientName} · ${res.result.score_global}/100`, {
        description:
          res.result.questionnaire.flags.length > 0
            ? `${res.result.questionnaire.flags.length} point(s) de vigilance noté(s).`
            : "Résultat fusionné et protocole de soin généré.",
        duration: 7_000,
      });
      if (res.reusedClient) toast.info("Fiche CRM existante réutilisée.");
      onSaved();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Analyse impossible");
      toastError(e, "Analyse impossible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="w-full sm:max-w-xl overflow-y-auto pretty-scroll p-0 [&>button]:z-30">
        <SheetHeader className="p-4 pb-3 border-b border-border bg-muted/40 sticky top-0 z-10">
          <SheetTitle className="font-heading text-lg leading-tight">
            Diagnostic en cabine {result ? "— résultat 3D" : `— étape ${step}/3`}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {result
              ? `${selected?.name ?? ""} · ${zoneLabel.toLowerCase()} · ${practitioner || "praticienne"}`.replace(/^ · /, "")
              : "Questionnaire dermatologique + photo optionnelle — fusionnés en un score unique."}
          </SheetDescription>
          {/* Stepper */}
          <div className="mt-2 flex items-center gap-1.5" role="group" aria-label="Étapes du diagnostic">
            {STEPS.map((s, i) => {
              const state = result ? 4 : step;
              const active = s.n === state;
              const done = s.n < state;
              return (
                <div key={s.n} className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      active ? "bg-primary text-primary-foreground" : done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    )}
                    aria-current={active ? "step" : undefined}
                  >
                    <span className="font-mono">{done ? "✓" : s.n}</span>
                    <span className="hidden xs:inline sm:inline">{s.label}</span>
                  </span>
                  {i < STEPS.length - 1 && <span className="h-px w-3 bg-border shrink-0" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {step === 1 && (
            <ClientStep
              tenantId={tenantId}
              preselectClientId={preselectClientId}
              selected={selected}
              onSelect={setSelected}
              zone={zone}
              onZone={setZone}
              practitioner={practitioner}
              onPractitioner={setPractitioner}
              consent={consent}
              onConsent={setConsent}
              onSignature={setSignatureData}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <QuestionnaireStep
              answers={answers}
              onChange={setAnswers}
              progress={progress}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <PhotoStep
              zone={zone}
              photo={photo}
              photos={photos}
              onPhoto={setPhoto}
              onPhotos={setPhotos}
              zoneLabel={zoneLabel}
              onBack={() => setStep(2)}
              onSubmit={submit}
            />
          )}
          {step === 4 && (
            <ResultStep
              submitting={submitting}
              analysisMsg={analysisMsg}
              error={submitError}
              result={result}
              clientName={selected?.name}
              clientPhone={selected?.phone}
              photo={Object.values(photos).filter(Boolean).length > 1 ? JSON.stringify(Object.values(photos).filter(Boolean)) : photo || Object.values(photos)[0] || null}
              zoneLabel={zoneLabel}
              printUrl={savedId ? `/api/pro/diagnoses/report?tenantId=${tenantId}&id=${savedId}` : null}
              onRetryBack={() => setStep(3)}
              onNew={reset}
              onDone={onClose}
              onNavigate={onNavigate}
              onOpenDescent={onOpenDescent}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Étape 1: cliente + sélecteur anatomique + praticienne réelle + signature tactile ──
function ClientStep({
  tenantId,
  preselectClientId,
  selected,
  onSelect,
  zone,
  onZone,
  practitioner,
  onPractitioner,
  consent,
  onConsent,
  onSignature,
  onNext,
}: {
  tenantId: string;
  preselectClientId?: string | null;
  selected: WizardClient | null;
  onSelect: (c: WizardClient) => void;
  zone: BodyZone;
  onZone: (z: BodyZone) => void;
  practitioner: string;
  onPractitioner: (v: string) => void;
  consent: { photo: boolean; data: boolean };
  onConsent: (c: { photo: boolean; data: boolean }) => void;
  onSignature: (sig: string | null) => void;
  onNext: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [express, setExpress] = useState({ name: "", phone: "" });
  const [creating, setCreating] = useState(false);
  const [contraindications, setContraindications] = useState<Record<string, boolean>>({});

  const safetyEvaluation = useMemo(
    () => evaluateSafetyChecklist("peeling soin cabine", contraindications),
    [contraindications]
  );

  // Équipe active de l'institut pour la sélection de la praticienne
  const teamApi = useApi<EmployeesResponse>(
    () => (tenantId ? apiGet<EmployeesResponse>(`/api/pro/employees?tenantId=${tenantId}`) : Promise.resolve({ employees: [], attendanceToday: [] })),
    [tenantId]
  );
  const activeEmployees = (teamApi.data?.employees ?? []).filter((e) => e.active);

  useEffect(() => {
    // Si aucune praticienne sélectionnée et que l'équipe est chargée, pré-sélectionner la première
    if (!practitioner && activeEmployees.length > 0) {
      onPractitioner(activeEmployees[0].name);
    }
  }, [activeEmployees, practitioner, onPractitioner]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  // Préselection CRM
  const preselected = useApi<WizardClient | null>(
    () =>
      preselectClientId
        ? apiGet<{ client: { id: string; name: string; phone: string } }>(`/api/pro/clients/${preselectClientId}`).then((r) => r.client)
        : Promise.resolve(null),
    [preselectClientId]
  );
  useEffect(() => {
    if (preselected.data && !selected) onSelect(preselected.data);
  }, [preselected.data, selected, onSelect]);

  const results = useApi<ProClient[]>(
    () =>
      tenantId && debounced.length >= 2
        ? apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}&q=${encodeURIComponent(debounced)}`).then((r) => r.clients ?? [])
        : Promise.resolve([]),
    [tenantId, debounced]
  );

  const createExpress = async (): Promise<boolean> => {
    if (express.name.trim().length < 2) {
      toast.error("Nom trop court (2 caractères minimum)");
      return false;
    }
    if (express.phone.replace(/\D/g, "").length < 8) {
      toast.error("Téléphone invalide (8 chiffres minimum)");
      return false;
    }
    setCreating(true);
    try {
      const res = await apiPost<{ client: ProClient; reused: boolean }>("/api/pro/clients", {
        tenantId,
        name: express.name,
        phone: express.phone,
      });
      onSelect({ id: res.client.id, name: res.client.name, phone: res.client.phone });
      toast.success(res.reused ? `Fiche existante retrouvée : ${res.client.name}` : `Cliente créée : ${res.client.name}`);
      return true;
    } catch (e) {
      toastError(e, "Création impossible");
      return false;
    } finally {
      setCreating(false);
    }
  };

  const canAutoCreate = !selected && express.name.trim().length >= 2 && express.phone.replace(/\D/g, "").length >= 8;

  const handleProceed = async () => {
    if (!selected) {
      if (canAutoCreate) {
        const ok = await createExpress();
        if (!ok) return;
      } else {
        toast.error("Veuillez sélectionner ou créer une cliente pour démarrer le diagnostic");
        return;
      }
    }
    onNext();
  };

  return (
    <div className="space-y-5">
      {/* Cliente sélectionnée */}
      {selected ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="p-3.5 flex items-center gap-3">
            <InitialAvatar name={selected.name} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{selected.name}</p>
              <p className="text-xs font-mono text-muted-foreground">{selected.phone}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onSelect(null as unknown as WizardClient)} className="gap-1">
              <UserPlus className="size-3.5" aria-hidden="true" />
              Changer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Recherche CRM */}
          <div>
            <label htmlFor="diag-search" className="text-sm font-semibold mb-1.5 block">
              Cliente du CRM
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="diag-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom ou téléphone…"
                className="pl-8"
                aria-label="Rechercher une cliente du CRM"
              />
            </div>
            {results.loading && debounced.length >= 2 && <Skeleton className="mt-2 h-16" />}
            {results.data && results.data.length > 0 && (
              <ul className="mt-2 rounded-xl border border-border divide-y divide-border overflow-hidden max-h-56 overflow-y-auto pretty-scroll">
                {results.data.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => onSelect({ id: c.id, name: c.name, phone: c.phone })}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
                      aria-label={`Sélectionner ${c.name}`}
                    >
                      <InitialAvatar name={c.name} className="size-8 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{c.phone}</p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {results.data && debounced.length >= 2 && results.data.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Aucune fiche — créez-la express ci-dessous.</p>
            )}
          </div>

          {/* Express */}
          <div className="rounded-xl border border-dashed border-border p-3.5">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <UserPlus className="size-4 text-primary" aria-hidden="true" />
              Cliente nouvelle — création express
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                value={express.name}
                onChange={(e) => setExpress((s) => ({ ...s, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && createExpress()}
                placeholder="Nom complet"
                aria-label="Nom de la cliente"
              />
              <Input
                value={express.phone}
                onChange={(e) => setExpress((s) => ({ ...s, phone: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && createExpress()}
                placeholder="Téléphone"
                aria-label="Téléphone de la cliente"
                inputMode="tel"
              />
              <Button variant="outline" onClick={createExpress} disabled={creating} className="gap-1.5">
                {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Users className="size-4" aria-hidden="true" />}
                Créer
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Sélecteur Anatomique Interactif (Innovation 3D tactile) */}
      <SkinZoneSelector selectedZone={zone} onSelectZone={onZone} />

      {/* Praticienne connectée à l'équipe réelle */}
      <div>
        <label htmlFor="diag-practitioner" className="text-sm font-semibold mb-1.5 block">
          Praticienne en cabine
        </label>
        {activeEmployees.length > 0 ? (
          <Select value={practitioner} onValueChange={onPractitioner}>
            <SelectTrigger id="diag-practitioner" aria-label="Praticienne en cabine">
              <SelectValue placeholder="Sélectionner une praticienne" />
            </SelectTrigger>
            <SelectContent>
              {activeEmployees.map((emp) => (
                <SelectItem key={emp.id} value={emp.name}>
                  {emp.name} ({emp.role.replace("_", " ")})
                </SelectItem>
              ))}
              <SelectItem value="Autre praticienne">Autre praticienne</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="diag-practitioner"
            value={practitioner}
            onChange={(e) => onPractitioner(e.target.value)}
            placeholder="Nom de la praticienne"
            aria-label="Praticienne qui réalise le diagnostic"
          />
        )}
      </div>

      {/* Checklist Sécurité Cabine & Contre-indications (Cosmétovigilance) */}
      <div className="rounded-xl border border-bissap/25 bg-bissap/5 p-3.5 space-y-2.5" aria-label="Checklist sécurité cabine">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold flex items-center gap-1.5 text-bissap">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Sécurité Cabine & Antécédents
          </p>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {Object.values(contraindications).filter(Boolean).length} facteur(s) coché(s)
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Cochez si la cliente présente l&apos;une de ces situations à risque pour adapter le protocole de soin en cabine :
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {CABIN_SAFETY_CHECKLIST.map((item) => {
            const isChecked = Boolean(contraindications[item.id]);
            return (
              <label
                key={item.id}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors",
                  isChecked
                    ? "border-bissap bg-bissap/15 text-bissap font-medium"
                    : "border-border/60 bg-card hover:bg-muted/40 text-foreground"
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) =>
                    setContraindications((prev) => ({ ...prev, [item.id]: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 accent-[#9B2C2C]"
                />
                <span className="min-w-0 leading-snug">
                  {item.label}
                </span>
              </label>
            );
          })}
        </div>

        {safetyEvaluation.blockers.length > 0 && (
          <div className="rounded-lg bg-bissap/15 border border-bissap/30 p-2.5 space-y-1 mt-2">
            <p className="text-xs font-bold text-bissap flex items-center gap-1">
              <OctagonAlert className="size-3.5 shrink-0" />
              Contre-indications cliniques identifiées :
            </p>
            {safetyEvaluation.blockers.map((b, i) => (
              <p key={i} className="text-[11px] text-bissap leading-tight font-medium">
                • {b}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Consentements cabine & Pad d'émargement digital tactile */}
      <div className="space-y-3">
        <div className="rounded-xl border border-gold/35 bg-gold/5 p-3.5 space-y-2.5" aria-label="Consentements de la cliente">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Consentements déontologiques
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Obligatoires</span>
          </p>
          {([
            ["photo", "Photos", "Elle accepte la prise et la conservation de photos de sa peau dans son dossier."],
            ["data", "Données de peau", "Elle accepte la conservation de ses biomarqueurs cutanés par l'institut."],
          ] as const).map(([key, title, text]) => (
            <label key={key} className="flex items-start gap-2.5 cursor-pointer active:scale-[0.99] transition-transform">
              <input
                type="checkbox"
                checked={consent[key]}
                onChange={(e) => onConsent({ ...consent, [key]: e.target.checked })}
                className="mt-0.5 h-5 w-5 accent-[#C8951E]"
                aria-label={`Consentement ${title}`}
              />
              <span className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-bold text-foreground">{title} — </span>
                {text}
              </span>
            </label>
          ))}
        </div>

        {/* Signature tactile électronique en cabine */}
        <TouchSignaturePad clientName={selected?.name} onSigned={onSignature} />
      </div>

      <Button
        onClick={handleProceed}
        disabled={creating || (!selected && !canAutoCreate) || !consent.photo || !consent.data}
        className="w-full gap-1.5 font-semibold k-btn-gold text-primary-foreground"
      >
        {creating ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Création de la cliente...
          </>
        ) : !selected && canAutoCreate ? (
          <>
            Créer la cliente et commencer
            <ChevronRight className="size-4" aria-hidden="true" />
          </>
        ) : (
          <>
            Commencer le questionnaire
            <ChevronRight className="size-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </div>
  );
}

// ── Étape 2: questionnaire dermatologique avec jauge en direct ──
function QuestionnaireStep({
  answers,
  onChange,
  progress,
  onBack,
  onNext,
}: {
  answers: QAnswers;
  onChange: (a: QAnswers) => void;
  progress: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const setAnswer = (id: string, value: string | string[]) => onChange({ ...answers, [id]: value });
  const toggleMulti = (id: string, value: string) => {
    const cur = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    setAnswer(id, cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground font-medium">Progression de l&apos;entretien cabine</span>
          <span className="font-mono font-bold text-gold-text">{Math.round(progress * 100)} %</span>
        </div>
        <Progress value={progress * 100} aria-label="Progression du questionnaire" className="h-2" />
      </div>

      {QUESTIONNAIRE_SECTIONS.map((section) => (
        <section key={section.id} aria-label={section.label} className="space-y-2">
          <h3 className="font-heading text-sm font-bold flex items-baseline gap-2">
            {section.label}
            <span className="text-[11px] font-normal text-muted-foreground">{section.description}</span>
          </h3>
          <div className="space-y-3">
            {QUESTIONS.filter((q) => q.section === section.id).map((q) => {
              const current = answers[q.id];
              const isText = q.type === "text";
              return (
                <div
                  key={q.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    q.sensitive ? "border-gold/40 bg-gold/[0.04]" : "border-border bg-card"
                  )}
                >
                  <p className="text-sm font-medium">
                    {q.label}
                    {q.required && <span className="ml-1 text-bissap" aria-hidden="true">*</span>}
                    {q.sensitive && (
                      <Badge variant="outline" className="ml-2 bg-gold/10 text-gold-text border-gold/30 text-[9px] align-middle">
                        important
                      </Badge>
                    )}
                  </p>
                  {q.help && <p className="mt-0.5 text-[11px] text-muted-foreground">{q.help}</p>}

                  {isText ? (
                    q.id === "notes" ? (
                      <Textarea
                        rows={2}
                        value={typeof current === "string" ? current : ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder}
                        aria-label={q.label}
                        className="mt-2 bg-card text-xs"
                      />
                    ) : (
                      <Input
                        value={typeof current === "string" ? current : ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder}
                        aria-label={q.label}
                        className="mt-2 bg-card text-xs"
                      />
                    )
                  ) : (
                    <div
                      className="mt-2 flex flex-wrap gap-1.5"
                      role={q.type === "single" ? "radiogroup" : "group"}
                      aria-label={q.label}
                      aria-required={q.required}
                    >
                      {q.options.map((o) => {
                        const active =
                          q.type === "multi" ? Array.isArray(current) && current.includes(o.value) : current === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role={q.type === "single" ? "radio" : "checkbox"}
                            aria-checked={active}
                            aria-pressed={q.type === "multi" ? active : undefined}
                            onClick={() => (q.type === "multi" ? toggleMulti(q.id, o.value) : setAnswer(q.id, o.value))}
                            className={cn(
                              "rounded-full px-3 py-1.5 min-h-10 text-xs font-medium transition-all",
                              active
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex gap-2 pb-2">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Retour
        </Button>
        <Button onClick={onNext} disabled={progress < 1} className="flex-1 gap-1.5 font-semibold k-btn-gold text-primary-foreground">
          {progress < 1 ? `Compléter le questionnaire (${Math.round(progress * 100)} %)` : "Étape photo cabine"}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ── Étape 3: photo cabine avec viseur dermoscopique & multi-angles ──
function PhotoStep({
  zone,
  photo,
  photos,
  onPhoto,
  onPhotos,
  zoneLabel,
  onBack,
  onSubmit,
}: {
  zone: BodyZone;
  photo: string | null;
  photos: Record<string, string>;
  onPhoto: (p: string | null) => void;
  onPhotos: (p: Record<string, string>) => void;
  zoneLabel: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const slots = useMemo(() => ZONE_PHOTO_SLOTS[zone] ?? [{ id: "main", label: "Vue principale", hint: "Cadrez la zone", required: true }], [zone]);
  const [activeSlotId, setActiveSlotId] = useState<string>(() => slots[0]?.id ?? "face");
  const activeSlot = slots.find((s) => s.id === activeSlotId) ?? slots[0];
  const activePhoto = photos[activeSlotId] ?? (activeSlotId === slots[0]?.id ? photo : null);
  const totalPhotos = Object.values(photos).filter(Boolean).length || (photo ? 1 : 0);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file);
      const nextPhotos = { ...photos, [activeSlotId]: dataUrl };
      onPhotos(nextPhotos);
      if (activeSlotId === slots[0]?.id) onPhoto(dataUrl);
      const nextEmpty = slots.find((s) => s.id !== activeSlotId && !nextPhotos[s.id]);
      if (nextEmpty) {
        toast.success(`Photo « ${activeSlot.label} » prête`, {
          description: `Angle suivant disponible : « ${nextEmpty.label} ».`,
        });
        setActiveSlotId(nextEmpty.id);
      } else {
        toast.success(`Photo « ${activeSlot.label} » prête pour l'analyse`);
      }
    } catch {
      toast.error("Photo illisible — réessayez");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = () => {
    const nextPhotos = { ...photos };
    delete nextPhotos[activeSlotId];
    onPhotos(nextPhotos);
    if (activeSlotId === slots[0]?.id) onPhoto(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gold/30 bg-gold/5 p-3.5 space-y-1.5">
        <p className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
          <Camera className="size-4 text-gold-text" aria-hidden="true" />
          Capture en cabine — zone « {zoneLabel} »
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Conseil phototypes III à VI : lumière blanche naturelle ou ring light indirecte, sans flash direct pour préserver la lecture des mélanocytes et des pores.
        </p>
      </div>

      {/* Sélecteur d'angles de cabine */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-bold text-foreground">Angles de vue ({zoneLabel}) :</span>
          <span className="text-[11px] text-gold font-semibold">
            {totalPhotos === 0 ? "Optionnel" : `${totalPhotos}/${slots.length} angle${totalPhotos > 1 ? "s" : ""} capturé${totalPhotos > 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slots.map((s) => {
            const hasImg = Boolean(photos[s.id] || (s.id === slots[0]?.id && photo));
            const isActive = activeSlotId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSlotId(s.id)}
                className={cn(
                  "p-2 rounded-xl text-left border transition-all flex flex-col justify-between min-h-[58px]",
                  isActive
                    ? "border-gold bg-gold/10 ring-1 ring-gold shadow-sm"
                    : hasImg
                    ? "border-emerald-500/50 bg-emerald-500/5 text-foreground"
                    : "border-border bg-card/40 hover:bg-card text-muted-foreground"
                )}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span className="text-[11px] font-bold text-foreground truncate">{s.label}</span>
                  {hasImg ? (
                    <span className="grid size-3.5 place-items-center rounded-full bg-emerald-500 text-white text-[8px] font-bold">
                      ✓
                    </span>
                  ) : s.required ? (
                    <span className="text-[8.5px] text-gold font-bold bg-gold/10 px-1 rounded">Requis</span>
                  ) : (
                    <span className="text-[8.5px] text-muted-foreground">Opt.</span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground line-clamp-1">{s.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cadre de capture / aperçu pour le slot actif */}
      {activePhoto ? (
        <div className="space-y-2">
          <div className="relative rounded-2xl overflow-hidden border border-border">
            <img src={activePhoto} alt={`Photo ${activeSlot.label} de la zone ${zoneLabel}`} className="w-full aspect-square object-cover" />
            <button
              type="button"
              onClick={removePhoto}
              className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background/85 text-foreground shadow-sm hover:bg-background"
              aria-label={`Retirer la photo ${activeSlot.label}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
            <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-full border border-white/10">
              {activeSlot.label}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground font-mono text-center">
            {((activePhoto.length * 0.75) / 1024).toFixed(0)} Ko — angle « {activeSlot.label} » prêt
          </p>
        </div>
      ) : (
        <label className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gold/40 bg-muted/20 py-8 cursor-pointer hover:border-gold transition-colors">
          {busy ? (
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <div className="relative grid place-items-center size-12 rounded-full bg-gold/15 text-gold-text">
              <ImagePlus className="size-6" aria-hidden="true" />
            </div>
          )}
          <div className="text-center space-y-1 px-4">
            <span className="text-sm font-bold block text-foreground">
              {busy ? "Compression en cours…" : `Prendre / importer « ${activeSlot.label} »`}
            </span>
            <span className="text-xs text-muted-foreground block">
              {activeSlot.hint}
            </span>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
            aria-label={`Photo « ${activeSlot.label} »`}
          />
        </label>
      )}

      {/* Boutons d'action */}
      <div className="flex gap-2 pb-2">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Retour
        </Button>
        <Button onClick={onSubmit} disabled={busy} className="flex-1 gap-1.5 font-semibold k-btn-gold text-primary-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
          {totalPhotos > 1
            ? `Lancer l'analyse 3D & VLM 360° (${totalPhotos} photos)`
            : totalPhotos === 1
            ? "Lancer l'analyse 3D & VLM"
            : "Analyser sans photo"}
        </Button>
      </div>
    </div>
  );
}

// ── Étape 4: analyse / résultat 3D ──
function ResultStep({
  submitting,
  analysisMsg,
  error,
  result,
  clientName,
  clientPhone,
  photo,
  zoneLabel,
  printUrl,
  onRetryBack,
  onNew,
  onDone,
  onNavigate,
  onOpenDescent,
}: {
  submitting: boolean;
  analysisMsg: string;
  error: string | null;
  result: ProDiagnosisResult | null;
  clientName?: string;
  clientPhone?: string;
  photo?: string | null;
  zoneLabel: string;
  printUrl: string | null;
  onRetryBack: () => void;
  onNew: () => void;
  onDone: () => void;
  onNavigate?: (s: ProSectionId) => void;
  onOpenDescent: (d: { indicators: Indicator[]; score: number; zoneLabel: string }) => void;
}) {
  if (submitting) {
    return (
      <PhotoScanAnimation
        photo={photo}
        zoneLabel={zoneLabel}
        analysisMsg={analysisMsg}
        clientName={clientName}
      />
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorState message={`Analyse échouée : ${error}`} onRetry={onRetryBack} />
        <Button variant="outline" onClick={onRetryBack} className="w-full">
          Reprendre
        </Button>
      </div>
    );
  }

  if (!result) return null;
  return (
    <div className="space-y-5">
      <ResultView
        result={result}
        clientName={clientName}
        clientPhone={clientPhone}
        photo={photo}
        onNavigate={onNavigate}
        onOpenDescent={() =>
          onOpenDescent({
            indicators: result.indicateurs,
            score: result.score_global,
            zoneLabel: result.zone.replace("_", " "),
          })
        }
      />
      <div className="flex flex-wrap gap-2 pb-2">
        {printUrl && (
          <Button
            variant="outline"
            onClick={() => window.open(printUrl, "_blank")}
            className="gap-1.5"
            aria-label="Imprimer le compte-rendu PDF"
          >
            <FileDown className="size-4" aria-hidden="true" />
            Compte-rendu PDF
          </Button>
        )}
        <Button variant="outline" onClick={onNew} className="gap-1.5">
          Nouveau diagnostic
        </Button>
        <Button onClick={onDone} className="flex-1 gap-1.5 font-semibold k-btn-gold text-primary-foreground">
          Terminer
        </Button>
      </div>
    </div>
  );
}

// ═════════════ Vue résultat partagée (assistant + fiche liste) ═════════════

const FLAG_STYLES = {
  danger: { icon: OctagonAlert, cls: "border-bissap/40 bg-bissap/5 text-bissap" },
  warn: { icon: OctagonAlert, cls: "border-gold/40 bg-gold/5 text-gold-text" },
  info: { icon: Info, cls: "border-border bg-muted/50 text-muted-foreground" },
} as const;

const SEVERITY_LABEL = ["aucun", "léger", "moyen", "fort"];

export function ResultView({
  result,
  clientName,
  clientPhone,
  photo,
  meta,
  tenantName,
  onNavigate,
  onOpenDescent,
}: {
  result: ProDiagnosisResult;
  clientName?: string;
  clientPhone?: string;
  photo?: string | null;
  meta?: { zone?: string; createdAt?: string; practitioner?: string | null };
  tenantName?: string;
  onNavigate?: (s: ProSectionId) => void;
  onOpenDescent?: () => void;
}) {
  const color = scoreVar(result.score_global);
  const pct = Math.max(4, Math.min(100, result.score_global));
  const verdict =
    result.score_global >= 80 ? "Peau équilibrée" : result.score_global >= 65 ? "Équilibre correct" : result.score_global >= 50 ? "Attention ciblée" : "Protocole de fond";

  const flags = result.questionnaire?.flags ?? [];
  const sortedIndicators = [...result.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage);
  const rec = result.recommandations;
  const zoneLabel = (meta?.zone ?? result.zone).replace("_", " ");

  const waUrl = clientPhone ? buildWhatsAppDiagUrl(clientName || "Cliente", clientPhone, result, tenantName) : null;

  return (
    <div className="space-y-5">
      {/* En-tête score global */}
      <Card className="overflow-hidden pt-0 border-gold/30">
        <KenteTop />
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div
              className="relative size-24 shrink-0 rounded-full grid place-items-center shadow-inner"
              style={{ background: `conic-gradient(${color} ${pct}%, color-mix(in srgb, currentColor 12%, transparent) 0)` }}
              role="img"
              aria-label={`Score santé de peau : ${result.score_global} sur 100`}
            >
              <div className="absolute inset-[7px] rounded-full bg-card grid place-items-center">
                <div className="text-center leading-none">
                  <p className="font-mono text-2xl font-bold" style={{ color }}>
                    {result.score_global}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">/ 100</p>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-lg font-bold leading-tight" style={{ color }}>
                {verdict}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                {clientName ? `${clientName} · ` : ""}
                {zoneLabel}
                {meta?.practitioner ? ` · ${meta.practitioner}` : ""}
              </p>
              {meta?.createdAt && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  {formatDate(meta.createdAt)} {formatTime(meta.createdAt)}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className={cn("text-[10px]", result.source.includes("vlm") ? "bg-gold/10 text-gold-text border-gold/30" : "bg-muted text-muted-foreground")}>
                  {result.source === "vlm+questionnaire" ? "Entretien + photo IA" : "Entretien seul"}
                </Badge>
                {result.questionnaire && (
                  <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                    {result.questionnaire.answered}/{result.questionnaire.total} réponses
                  </Badge>
                )}
                {result.orientation_dermato && (
                  <Badge variant="outline" className="text-[10px] bg-bissap/10 text-bissap border-bissap/30">
                    Orientation dermato
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground border-t border-border/40 pt-2.5">
            {rec?.resume}
          </p>
        </CardContent>
      </Card>

      {/* ── INNOVATION MAJEURE : Carte d'Accès à la « Descente de Peau 3D au Défilement » ── */}
      {onOpenDescent && (
        <div className="rounded-2xl border-2 border-gold/50 bg-gradient-to-br from-[#241A10] to-[#120B06] p-4 sm:p-5 text-white shadow-xl relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 size-32 rounded-full bg-gold/15 blur-2xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="grid place-items-center size-7 rounded-xl bg-gold text-[#120B06] font-bold shrink-0">
                  <Layers className="size-4" />
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-gold">
                  Immersion 3D Clinique Kènè
                </span>
              </div>
              <h4 className="font-heading font-black text-base sm:text-lg text-[#FFF9EC]">
                Voyager dans sa peau en 3D (Scroll)
              </h4>
              <p className="text-xs text-[#FFF9EC]/80 max-w-md leading-relaxed">
                Traversez les 3 couches cutanées (Épiderme, Derme, Hypoderme) au défilement. Les indicateurs s&apos;illuminent aux scores réels avec diffusion microscopique des botaniques.
              </p>
            </div>
            <Button
              type="button"
              onClick={onOpenDescent}
              className="shrink-0 k-btn-gold text-primary-foreground font-heading font-bold text-xs h-10 px-4 gap-2 shadow-lg hover:scale-105 transition-transform"
            >
              <Compass className="size-4" />
              <span>Lancer la Descente 3D</span>
            </Button>
          </div>
        </div>
      )}

      {/* ── INNOVATION MULTI-SPECTRALE : Observation VISIA-like (si photo présente) ── */}
      {photo && (
        <SpectralViewer photo={photo} zoneMarks={result.zones_marquages} zoneLabel={zoneLabel} />
      )}

      {/* Vigilances dermo */}
      {flags.length > 0 && (
        <section aria-label="Points de vigilance">
          <h3 className="font-heading text-sm font-bold mb-2 flex items-center gap-1.5">
            <OctagonAlert className="size-4 text-bissap" />
            Vigilances de l&apos;entretien
          </h3>
          <ul className="space-y-2">
            {flags.map((f, i) => {
              const st = FLAG_STYLES[f.level] ?? FLAG_STYLES.info;
              const Icon = st.icon;
              return (
                <li key={i} className={cn("flex gap-2.5 rounded-xl border p-3", st.cls)}>
                  <Icon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{f.label}</p>
                    {f.detail && <p className="mt-0.5 text-xs leading-relaxed opacity-90">{f.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Indicateurs biomarqueurs de la zone */}
      <section aria-label="Indicateurs">
        <h3 className="font-heading text-sm font-bold mb-2">Biomarqueurs cutanés de la zone</h3>
        <ul className="space-y-2 rounded-2xl border border-border bg-card p-3.5 sm:p-4">
          {sortedIndicators.map((ind) => {
            const c = scoreVar(ind.pourcentage);
            return (
              <li key={ind.nom}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium truncate">{ind.nom}</p>
                  <p className="font-mono text-xs font-bold tabular-nums shrink-0" style={{ color: c }}>
                    {ind.pourcentage}/100
                    <span className="ml-1 text-[9px] font-normal text-muted-foreground">{SEVERITY_LABEL[ind.severite] ?? ""}</span>
                  </p>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(3, ind.pourcentage)}%`, background: c }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── INNOVATION PROJECTION CUTANÉE : Simulation J+14, J+30, J+60 ── */}
      <SkinProjectionCurve
        initialScore={result.score_global}
        clientName={clientName}
        onBookFollowUp={() => onNavigate?.("agenda")}
      />

      {/* Recommandations & Protocole Cabine */}
      {rec && (
        <section aria-label="Recommandations">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading text-sm font-bold">Recommandations &amp; Protocole Cabine</h3>
            <div className="flex items-center gap-2">
              {waUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(waUrl, "_blank")}
                  className="h-8 text-xs gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                >
                  <Share2 className="size-3.5" />
                  <span>Envoyer sur WhatsApp</span>
                </Button>
              )}
              {onNavigate && (
                <Button
                  size="sm"
                  onClick={() => onNavigate("caisse")}
                  className="h-8 text-xs gap-1.5 k-btn-gold text-primary-foreground font-semibold"
                >
                  <ShoppingBag className="size-3.5" />
                  <span>Ajouter à la Caisse</span>
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rec.routine_matin?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-bold">Matin</p>
                  <ul className="space-y-1">
                    {rec.routine_matin.map((s, i) => (
                      <li key={i} className="text-xs flex gap-1.5">
                        <span className="text-gold-text font-mono shrink-0" aria-hidden="true">
                          {i + 1}.
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rec.routine_soir?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-bold">Soir</p>
                  <ul className="space-y-1">
                    {rec.routine_soir.map((s, i) => (
                      <li key={i} className="text-xs flex gap-1.5">
                        <span className="text-sunset font-mono shrink-0" aria-hidden="true">
                          {i + 1}.
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rec.botaniques_conseillees?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-bold">Botaniques Ouest-Africaines</p>
                  <div className="flex flex-wrap gap-1.5">
                    {rec.botaniques_conseillees.map((b, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] bg-gold/10 text-gold-text border-gold/25 font-semibold">
                        {b}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {rec.soins_conseilles?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-bold">Soins en cabine</p>
                  <ul className="space-y-1">
                    {rec.soins_conseilles.map((s, i) => (
                      <li key={i} className="text-xs flex gap-1.5">
                        <span className="text-success" aria-hidden="true">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {rec.conseils_hygiene_vie?.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-bold">Conseils d&apos;hygiène de vie</p>
                <ul className="space-y-1">
                  {rec.conseils_hygiene_vie.map((s, i) => (
                    <li key={i} className="text-xs flex gap-1.5">
                      <Info className="size-3 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{result.avertissement}</p>
        </section>
      )}
    </div>
  );
}

// ═════════════ Fiche détail depuis l'historique ═════════════

function DetailSheet({
  item,
  tenantId,
  onClose,
  onNavigate,
  onOpenDescent,
}: {
  item: ProDiagnosisItem;
  tenantId: string;
  onClose: () => void;
  onNavigate?: (s: ProSectionId) => void;
  onOpenDescent: (d: { indicators: Indicator[]; score: number; zoneLabel: string }) => void;
}) {
  // Photo + contexte CRM complets depuis la fiche cliente
  const detail = useApi<{ client: ProClient; proDiagnoses: ProDiagnosisItem[] } | null>(
    () =>
      item.clientProfileId
        ? apiGet<{ client: ProClient; proDiagnoses: ProDiagnosisItem[] }>(`/api/pro/clients/${item.clientProfileId}`)
        : Promise.resolve(null),
    [item.clientProfileId]
  );
  const result = parseProDiagnosis(item.resultJson);
  const fullItem = detail.data?.proDiagnoses?.find((d) => d.id === item.id);
  const clientPhone = detail.data?.client?.phone;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="w-full sm:max-w-xl overflow-y-auto pretty-scroll p-0">
        <SheetHeader className="p-4 pb-3 border-b border-border bg-muted/40">
          <SheetTitle className="font-heading text-lg leading-tight">Diagnostic — {item.clientName}</SheetTitle>
          <SheetDescription className="text-xs">
            Réalisé en institut{item.practitioner ? ` par ${item.practitioner}` : ""} ·{" "}
            <span className="capitalize">{item.zone.replace("_", " ")}</span>
          </SheetDescription>
        </SheetHeader>
        <div className="p-4">
          {!result ? (
            <ErrorState message="Résultat illisible pour ce diagnostic" />
          ) : (
            <>
              <ResultView
                result={result}
                clientName={item.clientName}
                clientPhone={clientPhone}
                photo={fullItem?.photoData ?? null}
                meta={{ zone: item.zone, createdAt: item.createdAt, practitioner: item.practitioner }}
                onNavigate={onNavigate}
                onOpenDescent={() =>
                  onOpenDescent({
                    indicators: result.indicateurs,
                    score: result.score_global,
                    zoneLabel: item.zone.replace("_", " "),
                  })
                }
              />
              {onNavigate && (
                <Button
                  variant="outline"
                  className="mt-4 w-full gap-1.5"
                  onClick={() => {
                    onClose();
                    onNavigate("crm");
                  }}
                >
                  Voir la fiche CRM de {item.clientName}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              )}
              <Button
                variant="outline"
                className="mt-2 w-full gap-1.5"
                onClick={() => window.open(`/api/pro/diagnoses/report?tenantId=${tenantId}&id=${item.id}`, "_blank")}
                aria-label={`Imprimer le compte-rendu PDF du diagnostic de ${item.clientName}`}
              >
                <FileDown className="size-4" aria-hidden="true" />
                Compte-rendu PDF
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
