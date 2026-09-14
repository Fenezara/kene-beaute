"use client";
// Kènè Pro — Diagnostic en cabine : L'ENTREPRISE réalise le diagnostic de peau
// au sein de sa structure, accompagné d'un questionnaire dermatologique.
// Assistant 4 étapes : Cliente → Questionnaire → Photo (option) → Résultat.
// Fusion serveur : entretien déclaratif (38 %) ± photo analysée par le VLM (62 %).
// Chaque diagnostic enrichit le CRM (visite, peau, notes) et notifie la cliente
// si elle est aussi sur l'app Kènè.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera, ChevronLeft, ChevronRight, FileDown, ImagePlus, Info, Loader2, OctagonAlert,
  Printer, Search, ShieldCheck, Sparkles, Stethoscope, Trash2, UserPlus, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, resizeImage } from "@/lib/kene/api";
import { formatDate, formatTime, scoreVar } from "@/lib/kene/format";
import { BODY_ZONES } from "@/lib/kene/types";
import type { BodyZone } from "@/lib/kene/types";
import {
  QUESTIONS, QUESTIONNAIRE_SECTIONS, defaultAnswers, questionnaireProgress, parseProDiagnosis,
} from "@/lib/kene/questionnaire";
import type { ProDiagnosisResult, QAnswers } from "@/lib/kene/questionnaire";
import { useApi } from "./useApi";
import type { ProClient, ProDiagnosesKpis, ProDiagnosisItem } from "./types";
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

export function DiagnosticsSection({ tenantId, refreshKey = 0, preselectCommand, onCommandHandled, onNavigate }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Commande CRM « Lancer un diagnostic » : détectée pendant le RENDU (pattern
  // React « ajustement d'état », pas d'effet). La comparaison par nonce gère
  // le montage frais (section CRM → section Diagnostic) ET la relance : le
  // composant peut ne pas être monté quand la commande arrive.
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

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Diagnostic en cabine"
        sub="L'institut réalise le diagnostic peau, guidé par le questionnaire dermatologique"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => window.open(`/api/pro/consultation-sheet?tenantId=${tenantId}`, "_blank")}
              className="gap-2"
              aria-label="Imprimer une fiche de consultation vierge (support papier de l'entretien)"
            >
              <Printer className="size-4" aria-hidden="true" />
              Fiche vierge
            </Button>
            <Button onClick={() => setWizardOpen(true)} className="gap-2 font-semibold" aria-label="Lancer un nouveau diagnostic en cabine">
              <Stethoscope className="size-4" aria-hidden="true" />
              Nouveau diagnostic
            </Button>
          </div>
        }
      />

      {/* Principe de fusion — pédagogie rapide pour la praticienne */}
      <Card className="overflow-hidden pt-0 border-gold/25">
        <KenteTop />
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gold/12 text-gold-text shrink-0">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Entretien + photo fusionnés.</span> Le questionnaire
            capture ce que la cliente <em>déclare</em> (38 %), la photo de cabine apporte ce que l&apos;IA{" "}
            <em>observe</em> (62 %). Sans photo, le diagnostic reste valable sur l&apos;entretien seul. Chaque passage
            enrichit la fiche CRM et notifie la cliente.
          </p>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiStat icon={<Stethoscope className="size-4" />} label="Diagnostics" value={String(kpis.total)} hint={`${kpis.monthCount} ce mois-ci`} />
        <KpiStat icon={<Sparkles className="size-4" />} label="Score moyen" value={`${kpis.avgScore}/100`} hint="santé de peau fusionnée" monetary={false} />
        <KpiStat icon={<Camera className="size-4" />} label="Avec photo IA" value={`${kpis.photoShare} %`} hint="analyse VLM couplée" monetary={false} />
      </div>

      {/* Historique */}
      <Card className="overflow-hidden">
        {list.error && !list.data ? (
          <CardContent className="p-4">
            <ErrorState message={`Diagnostics indisponibles : ${list.error}`} onRetry={list.refetch} />
          </CardContent>
        ) : list.loading && !list.data ? (
          <CardContent className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </CardContent>
        ) : diagnoses.length === 0 ? (
          <CardContent>
            <EmptyState
              label="Aucun diagnostic en cabine"
              sub="Lancez le premier : questionnaire guidé, photo optionnelle, résultat dans le CRM."
            />
            <div className="mt-2 flex justify-center">
              <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5">
                <Stethoscope className="size-3.5" aria-hidden="true" />
                Premier diagnostic
              </Button>
            </div>
          </CardContent>
        ) : (
          <ul className="divide-y divide-border max-h-[28rem] overflow-y-auto pretty-scroll">
            {diagnoses.map((d) => {
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
            onCommandHandled?.(); // ProApp oublie la commande → pas de réouverture
          }}
          onSaved={() => void list.refetch()}
        />
      )}

      {detail && (
        <DetailSheet
          item={detail}
          tenantId={tenantId}
          onClose={() => setDetailId(null)}
          onNavigate={onNavigate}
        />
      )}
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
  { n: 1, label: "Cliente" },
  { n: 2, label: "Questionnaire" },
  { n: 3, label: "Photo" },
  { n: 4, label: "Résultat" },
];

const ANALYSIS_STEPS = [
  "Analyse de l'entretien (questionnaire)…",
  "Lecture de la photo par l'IA…",
  "Fusion déclaratif + observation…",
  "Rédaction des recommandations…",
];

function DiagWizard({
  tenantId,
  preselectClientId,
  onClose,
  onSaved,
}: {
  tenantId: string;
  preselectClientId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(1);
  const [zone, setZone] = useState<BodyZone>("visage");
  const [selected, setSelected] = useState<WizardClient | null>(null);
  const [answers, setAnswers] = useState<QAnswers>(defaultAnswers);
  const [photo, setPhoto] = useState<string | null>(null);
  const [practitioner, setPractitioner] = useState("Fatou Koné");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ProDiagnosisResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [analysisMsg, setAnalysisMsg] = useState(ANALYSIS_STEPS[0]);
  // Consentements cabine (t. 119) — recueillis à l'étape cliente, requis pour
  // lancer le questionnaire ; tracés sur le diagnostic + registre Consent.
  const [consent, setConsent] = useState({ photo: false, data: false });
  const [savedId, setSavedId] = useState<string | null>(null);

  // Message d'attente rotatif pendant l'analyse VLM (10-30 s possibles)
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
    setResult(null);
    setSubmitError(null);
    setConsent({ photo: false, data: false });
    setSavedId(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    setStep(4);
    try {
      const res = await apiPost<{ diagnosis: ProDiagnosisItem; result: ProDiagnosisResult; reusedClient: boolean }>(
        "/api/pro/diagnoses",
        {
          tenantId,
          zone,
          answers,
          clientProfileId: selected?.id,
          photo: photo ?? undefined,
          practitioner: practitioner.trim() || undefined,
          consent,
        }
      );
      setResult(res.result);
      setSavedId(res.diagnosis.id);
      toast.success(`Diagnostic enregistré — ${res.diagnosis.clientName} · ${res.result.score_global}/100`, {
        description: res.result.questionnaire.flags.length > 0 ? `${res.result.questionnaire.flags.length} point(s) de vigilance noté(s) — visible dans la fiche CRM.` : "Résultat fusionné disponible dans le CRM.",
        duration: 7_000,
      });
      if (res.reusedClient) toast.info("Fiche CRM existante réutilisée (téléphone déjà enregistré).");
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
            Diagnostic en cabine {result ? "— résultat" : `— étape ${step}/3`}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {result
              ? `${selected?.name ?? ""} · ${zoneLabel.toLowerCase()} · ${practitioner || "praticienne"}`.replace(/^ · /, "")
              : "Questionnaire dermatologique ± photo — fusionnée en un score unique."}
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
              photo={photo}
              onPhoto={setPhoto}
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
              printUrl={savedId ? `/api/pro/diagnoses/report?tenantId=${tenantId}&id=${savedId}` : null}
              onRetryBack={() => setStep(3)}
              onNew={reset}
              onDone={onClose}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Étape 1 : cliente + consentements + zone + praticienne ──
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
  onNext: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [express, setExpress] = useState({ name: "", phone: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  // Préselection CRM : charge la fiche dès l'ouverture
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

  const createExpress = async () => {
    if (express.name.trim().length < 2) return toast.error("Nom trop court");
    if (express.phone.replace(/\D/g, "").length < 8) return toast.error("Téléphone invalide (8 chiffres min.)");
    setCreating(true);
    try {
      const res = await apiPost<{ client: ProClient; reused: boolean }>("/api/pro/clients", {
        tenantId,
        name: express.name,
        phone: express.phone,
      });
      onSelect({ id: res.client.id, name: res.client.name, phone: res.client.phone });
      toast.success(res.reused ? `Fiche existante retrouvée : ${res.client.name}` : `Cliente créée : ${res.client.name}`);
    } catch (e) {
      toastError(e, "Création impossible");
    } finally {
      setCreating(false);
    }
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
              <Input value={express.name} onChange={(e) => setExpress((s) => ({ ...s, name: e.target.value }))} placeholder="Nom complet" aria-label="Nom de la cliente" />
              <Input value={express.phone} onChange={(e) => setExpress((s) => ({ ...s, phone: e.target.value }))} placeholder="Téléphone" aria-label="Téléphone de la cliente" inputMode="tel" />
              <Button variant="outline" onClick={createExpress} disabled={creating} className="gap-1.5">
                {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Users className="size-4" aria-hidden="true" />}
                Créer
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Zone */}
      <div>
        <p className="text-sm font-semibold mb-1.5">Zone à diagnostiquer</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Zone à diagnostiquer">
          {BODY_ZONES.map((z) => (
            <button
              key={z.id}
              role="radio"
              aria-checked={zone === z.id}
              onClick={() => onZone(z.id)}
              className={cn(
                "rounded-full px-3 py-1.5 min-h-11 text-xs font-medium transition-colors",
                zone === z.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* Praticienne */}
      <div>
        <label htmlFor="diag-practitioner" className="text-sm font-semibold mb-1.5 block">
          Praticienne
        </label>
        <Input
          id="diag-practitioner"
          value={practitioner}
          onChange={(e) => onPractitioner(e.target.value)}
          placeholder="Qui réalise le diagnostic ?"
          aria-label="Praticienne qui réalise le diagnostic"
        />
      </div>

      {/* Consentements cabine (t. 119) — obligatoires avant l'entretien */}
      <div className="rounded-xl border border-gold/35 bg-gold/5 p-3.5 space-y-2.5" aria-label="Consentements de la cliente">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          Consentements de la cliente
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Obligatoires</span>
        </p>
        {([
          ["photo", "Photos", "Elle accepte la prise et la conservation de photos de sa peau dans son dossier client."],
          ["data", "Données de peau", "Elle accepte la conservation de ses données de peau et de diagnostic par l'institut."],
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
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <p className="text-[11px] text-muted-foreground">La fiche papier (ci-dessous) porte sa signature.</p>
          <button
            type="button"
            onClick={() =>
              window.open(
                `/api/pro/consultation-sheet?tenantId=${tenantId}${selected ? `&clientId=${selected.id}` : ""}&practitioner=${encodeURIComponent(practitioner)}`,
                "_blank"
              )
            }
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-accent/50 transition-colors min-h-8"
            aria-label="Imprimer la fiche de consultation (pré-remplie pour la cliente sélectionnée)"
          >
            <Printer className="size-3" aria-hidden="true" />
            Fiche de consultation
          </button>
        </div>
      </div>

      <Button onClick={onNext} disabled={!selected || !consent.photo || !consent.data} className="w-full gap-1.5 font-semibold">
        Commencer le questionnaire
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

// ── Étape 2 : questionnaire ──
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
          <span className="text-muted-foreground">Progression de l&apos;entretien</span>
          <span className="font-mono font-semibold">{Math.round(progress * 100)} %</span>
        </div>
        <Progress value={progress * 100} aria-label="Progression du questionnaire" />
      </div>

      {QUESTIONNAIRE_SECTIONS.map((section) => (
        <section key={section.id} aria-label={section.label}>
          <h3 className="font-heading text-sm font-bold flex items-baseline gap-2">
            {section.label}
            <span className="text-[11px] font-normal text-muted-foreground">{section.description}</span>
          </h3>
          <div className="mt-2.5 space-y-3">
            {QUESTIONS.filter((q) => q.section === section.id).map((q) => {
              const current = answers[q.id];
              const isText = q.type === "text";
              return (
                <div
                  key={q.id}
                  className={cn(
                    "rounded-xl border p-3",
                    q.sensitive ? "border-gold/40 bg-gold/[0.04]" : "border-border bg-card"
                  )}
                >
                  <p className="text-sm font-medium">
                    {q.label}
                    {q.required && (
                      <span className="ml-1 text-bissap" aria-hidden="true">
                        *
                      </span>
                    )}
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
                        className="mt-2 bg-card"
                      />
                    ) : (
                      <Input
                        value={typeof current === "string" ? current : ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder}
                        aria-label={q.label}
                        className="mt-2 bg-card"
                      />
                    )
                  ) : (
                    <div
                      className={cn("mt-2 flex flex-wrap gap-1.5", q.type === "multi" ? "pt-0" : "pt-0")}
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
                              "rounded-full px-3 py-1.5 min-h-11 text-xs font-medium transition-colors",
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
        <Button onClick={onNext} disabled={progress < 1} className="flex-1 gap-1.5 font-semibold">
          {progress < 1 ? `Questionnaire à compléter (${Math.round(progress * 100)} %)` : "Étape photo (option)"}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ── Étape 3 : photo optionnelle ──
function PhotoStep({
  photo,
  onPhoto,
  zoneLabel,
  onBack,
  onSubmit,
}: {
  photo: string | null;
  onPhoto: (p: string | null) => void;
  zoneLabel: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file);
      onPhoto(dataUrl);
      toast.success("Photo prête — compressée pour l'analyse");
    } catch {
      toast.error("Photo illisible — réessayez");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Camera className="size-4 text-primary" aria-hidden="true" />
          Photo de la zone « {zoneLabel} »
        </p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Optionnelle mais recommandée : l&apos;IA observe la peau (62 % du score) et repère taches, imperfections,
          lésions. Sans photo, le diagnostic repose sur l&apos;entretien (déclaratif) — valable pour un premier passage.
        </p>
      </div>

      {photo ? (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={photo} alt={`Photo de la zone ${zoneLabel}`} className="w-full aspect-square object-cover" />
            <button
              onClick={() => onPhoto(null)}
              className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background/85 text-foreground shadow-sm hover:bg-background"
              aria-label="Retirer la photo"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {(photo.length * 0.75 / 1024).toFixed(0)} Ko — prête pour l&apos;analyse VLM.
          </p>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 py-8 cursor-pointer hover:border-primary/50 transition-colors">
          {busy ? (
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm font-medium">{busy ? "Compression…" : "Prendre / choisir une photo"}</span>
          <span className="text-[11px] text-muted-foreground">Lumière naturelle, cadre sur la zone</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
            aria-label={`Photo de la zone ${zoneLabel}`}
          />
        </label>
      )}

      <div className="flex gap-2 pb-2">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Retour
        </Button>
        <Button onClick={onSubmit} disabled={busy} className="flex-1 gap-1.5 font-semibold">
          <Sparkles className="size-4" aria-hidden="true" />
          {photo ? "Lancer l'analyse (10-30 s)" : "Analyser sans photo"}
        </Button>
      </div>
    </div>
  );
}

// ── Étape 4 : analyse / résultat ──
function ResultStep({
  submitting,
  analysisMsg,
  error,
  result,
  clientName,
  printUrl,
  onRetryBack,
  onNew,
  onDone,
}: {
  submitting: boolean;
  analysisMsg: string;
  error: string | null;
  result: ProDiagnosisResult | null;
  clientName?: string;
  printUrl: string | null;
  onRetryBack: () => void;
  onNew: () => void;
  onDone: () => void;
}) {
  if (submitting) {
    return (
      <div className="py-10 flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        <div className="relative size-16">
          <Loader2 className="size-16 animate-spin text-primary" aria-hidden="true" />
          <Stethoscope className="absolute inset-0 m-auto size-6 text-primary/70" aria-hidden="true" />
        </div>
        <div>
          <p className="font-heading font-bold">Analyse en cours…</p>
          <motion.p key={analysisMsg} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1 text-sm text-muted-foreground">
            {analysisMsg}
          </motion.p>
        </div>
        <p className="text-[11px] text-muted-foreground">La photo peut demander jusqu&apos;à 30 s — ne fermez pas l&apos;assistant.</p>
      </div>
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
      <ResultView result={result} clientName={clientName} />
      <div className="flex flex-wrap gap-2 pb-2">
        {printUrl && (
          <Button
            variant="outline"
            onClick={() => window.open(printUrl, "_blank")}
            className="gap-1.5"
            aria-label="Imprimer le compte-rendu PDF du diagnostic pour la cliente"
          >
            <FileDown className="size-4" aria-hidden="true" />
            Compte-rendu PDF
          </Button>
        )}
        <Button variant="outline" onClick={onNew} className="gap-1.5">
          Nouveau diagnostic
        </Button>
        <Button onClick={onDone} className="flex-1 gap-1.5 font-semibold">
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
  photo,
  meta,
}: {
  result: ProDiagnosisResult;
  clientName?: string;
  photo?: string | null;
  meta?: { zone?: string; createdAt?: string; practitioner?: string | null };
}) {
  const color = scoreVar(result.score_global);
  const pct = Math.max(4, Math.min(100, result.score_global));
  const verdict =
    result.score_global >= 80 ? "Peau équilibrée" : result.score_global >= 65 ? "Équilibre correct" : result.score_global >= 50 ? "Attention ciblée" : "Protocole de fond";

  const flags = result.questionnaire?.flags ?? [];
  const sortedIndicators = [...result.indicateurs].sort((a, b) => a.pourcentage - b.pourcentage);
  const rec = result.recommandations;

  return (
    <div className="space-y-5">
      {/* En-tête score */}
      <Card className="overflow-hidden pt-0">
        <KenteTop />
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div
              className="relative size-24 shrink-0 rounded-full grid place-items-center"
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
                {(meta?.zone ?? result.zone).replace("_", " ")}
                {meta?.practitioner ? ` · ${meta.practitioner}` : ""}
              </p>
              {meta?.createdAt && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  {formatDate(meta.createdAt)} {formatTime(meta.createdAt)}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
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
          <p className="mt-3 text-sm leading-relaxed">{rec?.resume}</p>
        </CardContent>
      </Card>

      {/* Vigilances */}
      {flags.length > 0 && (
        <section aria-label="Points de vigilance">
          <h3 className="font-heading text-sm font-bold mb-2">Vigilances de l&apos;entretien</h3>
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

      {/* Photo + indicateurs */}
      <section aria-label="Indicateurs">
        <h3 className="font-heading text-sm font-bold mb-2">Indicateurs de la zone</h3>
        <div className={cn("grid gap-3", photo ? "sm:grid-cols-[10rem_1fr]" : "")}>
          {photo && (
            <div className="rounded-xl overflow-hidden border border-border h-fit">
              <img src={photo} alt="Photo de cabine du diagnostic" className="w-full aspect-square object-cover" />
              <p className="p-1.5 text-[10px] text-muted-foreground text-center">Photo de cabine</p>
            </div>
          )}
          <ul className="space-y-2 min-w-0">
            {sortedIndicators.map((ind) => {
              const c = scoreVar(ind.pourcentage);
              return (
                <li key={ind.nom}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-medium truncate">{ind.nom}</p>
                    <p className="font-mono text-xs font-bold tabular-nums shrink-0" style={{ color: c }}>
                      {ind.pourcentage}
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
        </div>
      </section>

      {/* Recommandations */}
      {rec && (
        <section aria-label="Recommandations">
          <h3 className="font-heading text-sm font-bold mb-2">Protocole recommandé</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rec.routine_matin?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Matin</p>
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
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Soir</p>
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
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Botaniques</p>
                  <div className="flex flex-wrap gap-1.5">
                    {rec.botaniques_conseillees.map((b, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] bg-gold/8 text-gold-text border-gold/25">
                        {b}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {rec.soins_conseilles?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Soins en institut</p>
                  <ul className="space-y-1">
                    {rec.soins_conseilles.map((s, i) => (
                      <li key={i} className="text-xs flex gap-1.5">
                        <span className="text-success" aria-hidden="true">
                          •
                        </span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {rec.conseils_hygiene_vie?.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Hygiène de vie</p>
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
}: {
  item: ProDiagnosisItem;
  tenantId: string;
  onClose: () => void;
  onNavigate?: (s: ProSectionId) => void;
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
                photo={fullItem?.photoData ?? null}
                meta={{ zone: item.zone, createdAt: item.createdAt, practitioner: item.practitioner }}
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
