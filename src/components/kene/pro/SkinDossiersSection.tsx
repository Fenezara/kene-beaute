"use client";
// Kènè Pro — 🔬 Dossiers Cutanés & Cahier de Formulation des Clientes
// Espace dédié exclusivement à la santé de la peau, phototypes mélanodermes,
// imagerie spectrale HD, suivi d'évolution avant/après et formulation d'actifs sur-mesure.
import { useEffect, useMemo, useState } from "react";
import {
  FolderHeart, Search, Sparkles, Filter, ChevronRight, Baby, Leaf,
  FlaskConical, Save, FileDown, MessageCircle, CheckCircle2, Phone,
  SlidersHorizontal, Eye, ShieldAlert, Sun, Moon, ArrowLeft,
  Calendar, Lock, Layers, Droplets, Camera, Check, Plus, AlertTriangle,
  Smartphone, Stethoscope, FileClock, Clock, UserCheck, Info
} from "lucide-react";
import { toast } from "sonner";
import { BissapFlowerIcon, CauriIcon, SankofaIcon } from "@/components/kene/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, scoreVar, xof } from "@/lib/kene/format";
import { apiGet, apiPatch } from "@/lib/kene/api";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { SkinTwinCard, type TwinEntry } from "@/components/kene/skintwin/SkinTwinCard";
import { ProEvolutionCard } from "@/components/kene/evolution/ProEvolutionCard";
import { BeforeAfterSlider } from "@/components/kene/evolution/BeforeAfterSlider";
import { PhotoLightboxModal, type LightboxPhoto } from "@/components/kene/common/PhotoLightboxModal";
import { parseDiagnosis, diagImgSrc } from "@/components/kene/client/types";
import { parseProDiagnosis } from "@/lib/kene/questionnaire";
import type { BodyZone } from "@/lib/kene/types";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, InitialAvatar, SectionHeader, KenteTop } from "./ui-bits";
import { proToastError } from "./ProApp";
import { DEFAULT_FALLBACK_CLIENTS } from "@/lib/kene/fallback-catalog";
import type { ProClient, ProClientDetail, ProDiagnosisItem } from "./types";

interface Props {
  tenantId: string;
  preselectedClientId?: string | null;
  onClearPreselected?: () => void;
  onStartDiagnostic?: (clientId: string) => void;
  onNavigateToCrm?: (clientId: string) => void;
}

export function SkinDossiersSection({
  tenantId,
  preselectedClientId,
  onClearPreselected,
  onStartDiagnostic,
  onNavigateToCrm,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedFitzy, setSelectedFitzy] = useState<string>("all");
  const [selectedSkinType, setSelectedSkinType] = useState<string>("all");
  const [selectedFilter, setSelectedFilter] = useState<"all" | "pregnant" | "formulated" | "unformulated">("all");
  const [activeClientId, setActiveClientId] = useState<string | null>(preselectedClientId ?? null);

  useEffect(() => {
    if (preselectedClientId) {
      setActiveClientId(preselectedClientId);
    }
  }, [preselectedClientId]);

  // Synchronisation avec le cache partagé du CRM
  const cachedClients = useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_FALLBACK_CLIENTS;
    try {
      const stored = window.localStorage.getItem(`kene_pro_clients_${tenantId || "default"}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as ProClient[];
      }
    } catch {}
    return DEFAULT_FALLBACK_CLIENTS;
  }, [tenantId]);

  const clientsApi = useApi<ProClient[]>(
    async () => {
      if (!tenantId) return cachedClients;
      try {
        const res = await apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}`);
        if (res.clients && res.clients.length > 0) return res.clients;
        return cachedClients;
      } catch {
        return cachedClients;
      }
    },
    [tenantId, cachedClients],
    { cacheKey: `kene_pro_clients_${tenantId || "default"}`, fallbackData: cachedClients }
  );

  const allClients = clientsApi.data ?? [];

  // Filtrage des fiches
  const filteredClients = useMemo(() => {
    return allClients.filter((c) => {
      // Si la liste contient de vrais clients, ne pas polluer l'affichage avec l'entrée fictive
      if (c.id === "cli_comptoir_express" && allClients.length > 1) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = c.name.toLowerCase().includes(q);
        const matchPhone = (c.phone || "").includes(q);
        if (!matchName && !matchPhone) return false;
      }
      const fitz = c.fitzpatrick || "V";
      if (selectedFitzy !== "all" && fitz !== selectedFitzy) return false;
      const skin = (c.skinType || "mixte").toLowerCase();
      if (selectedSkinType !== "all" && skin !== selectedSkinType.toLowerCase()) return false;
      if (selectedFilter === "pregnant" && !c.pregnant) return false;
      if (selectedFilter === "formulated" && (!c.productObservations || !c.productObservations.trim())) return false;
      if (selectedFilter === "unformulated" && c.productObservations && c.productObservations.trim()) return false;
      return true;
    });
  }, [allClients, search, selectedFitzy, selectedSkinType, selectedFilter]);

  // KPIs cutanés globaux
  const kpis = useMemo(() => {
    const valid = allClients.filter((c) => c.id !== "cli_comptoir_express" || allClients.length === 1);
    const total = valid.length;
    const melanoVVI = valid.filter((c) => (c.fitzpatrick || "V") === "V" || c.fitzpatrick === "VI").length;
    const pregnantCount = valid.filter((c) => c.pregnant).length;
    const withVisits = valid.filter((c) => (c.visitsCount || 0) > 0).length;
    return { total, melanoVVI, pregnantCount, withVisits };
  }, [allClients]);

  const selectedClientSummary = useMemo(() => {
    if (!activeClientId) return null;
    return allClients.find((c) => c.id === activeClientId) ?? null;
  }, [allClients, activeClientId]);

  return (
    <div className="space-y-4">
      {/* En-tête de la section */}
      <SectionHeader
        title="Dossiers Cutanés & Cabine"
        sub="Fiches biométriques, phototypes mélanodermes, imagerie HD, formulations & ordonnances"
        actions={
          <div className="flex items-center gap-2">
            {activeClientId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveClientId(null);
                  onClearPreselected?.();
                }}
                className="gap-1.5 text-xs h-9"
              >
                <ArrowLeft className="size-3.5" />
                <span>Tous les dossiers</span>
              </Button>
            )}
            {onStartDiagnostic && (
              <Button
                onClick={() => onStartDiagnostic(activeClientId || "")}
                className="k-btn-gold text-primary-foreground font-semibold text-xs h-9 gap-1.5"
              >
                <Sparkles className="size-3.5" />
                <span>{activeClientId ? "Diagnostic de cette cliente" : "Nouveau diagnostic"}</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Si aucune cliente sélectionnée : Vue globale des dossiers cutanés */}
      {!activeClientId ? (
        <div className="space-y-4">
          {/* Bannière de sensibilisation clinique */}
          <Card className="overflow-hidden border-gold/30 bg-gradient-to-r from-gold/10 via-card to-card">
            <KenteTop />
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold-text shrink-0">
                  <FolderHeart className="size-5" />
                </span>
                <div>
                  <h4 className="font-heading text-sm font-bold text-foreground">
                    Espace Clinique Dermo-Cosmétique & Pharmacopée
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Cet espace regroupe les biomarqueurs, les photographies spectrales, les rituels et la traçabilité des
                    <strong> actifs formulés en cabine</strong> pour chaque cliente, en toute confidentialité.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cartes statistiques cutanées */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Card className="border-border bg-card p-3 space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Patientes suivies</span>
              <p className="font-mono text-xl font-bold text-foreground">{kpis.total}</p>
              <p className="text-[10px] text-muted-foreground">{kpis.withVisits} avec antécédents cabine</p>
            </Card>
            <Card className="border-border bg-card p-3 space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Phototypes V &amp; VI</span>
              <p className="font-mono text-xl font-bold text-gold-text">{kpis.melanoVVI}</p>
              <p className="text-[10px] text-muted-foreground">Spécificité mélanoderme</p>
            </Card>
            <Card className="border-border bg-card p-3 space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Vigilance Maternité</span>
              <p className="font-mono text-xl font-bold text-pink-500">{kpis.pregnantCount}</p>
              <p className="text-[10px] text-muted-foreground">Protocoles doux obligatoires</p>
            </Card>
            <Card className="border-border bg-card p-3 space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Actifs Pharmacopée</span>
              <p className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">100%</p>
              <p className="text-[10px] text-muted-foreground">Karité, Moringa, Balanites...</p>
            </Card>
          </div>

          {/* Barre de recherche et filtres de consultation */}
          <div className="rounded-2xl border border-border bg-card p-3 space-y-2.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom de patiente ou numéro de téléphone…"
                  className="pl-8 text-xs h-9 bg-background"
                />
              </div>

              {/* Filtre Fitzpatrick */}
              <select
                value={selectedFitzy}
                onChange={(e) => setSelectedFitzy(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground"
                aria-label="Filtrer par phototype"
              >
                <option value="all">Tous les phototypes</option>
                <option value="III">Phototype III (Mat clair)</option>
                <option value="IV">Phototype IV (Mat méditerranéen)</option>
                <option value="V">Phototype V (Brun foncé métis)</option>
                <option value="VI">Phototype VI (Noir profond)</option>
              </select>

              {/* Filtre Type de peau */}
              <select
                value={selectedSkinType}
                onChange={(e) => setSelectedSkinType(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground"
                aria-label="Filtrer par type de peau"
              >
                <option value="all">Tous types de peau</option>
                <option value="mixte">Peau Mixte</option>
                <option value="grasse">Peau Grasse</option>
                <option value="seche">Peau Sèche</option>
                <option value="normale">Peau Normale</option>
              </select>

              {/* Filtre vigilance maternité */}
              <Button
                variant={selectedFilter === "pregnant" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedFilter(selectedFilter === "pregnant" ? "all" : "pregnant")}
                className="h-9 text-xs gap-1.5 shrink-0"
              >
                <Baby className="size-3.5 text-pink-500" />
                <span>Maternité ({kpis.pregnantCount})</span>
              </Button>
            </div>
          </div>

          {/* Grille des dossiers cutanés */}
          {clientsApi.loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : filteredClients.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <EmptyState
                label="Aucun dossier cutané trouvé"
                sub={
                  search
                    ? `Aucun dossier ne correspond à « ${search} »`
                    : selectedFitzy !== "all" || selectedSkinType !== "all" || selectedFilter !== "all"
                    ? "Aucun dossier cutané ne correspond aux critères de filtre sélectionnés."
                    : "Aucun dossier cutané n'est encore enregistré pour cet institut."
                }
              />
              {selectedFitzy !== "all" || selectedSkinType !== "all" || selectedFilter !== "all" || search ? (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setSelectedFitzy("all");
                      setSelectedSkinType("all");
                      setSelectedFilter("all");
                    }}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <Filter className="size-3.5" /> Réinitialiser les filtres
                  </Button>
                </div>
              ) : (
                <div className="flex justify-center gap-2 pt-2">
                  {onStartDiagnostic && (
                    <Button
                      size="sm"
                      className="k-btn-gold text-primary-foreground font-semibold text-xs gap-1.5"
                      onClick={() => onStartDiagnostic("")}
                    >
                      <Sparkles className="size-3.5" /> Lancer un diagnostic cutané
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredClients.map((client) => {
                const fitz = client.fitzpatrick || "V";
                const skin = client.skinType || "mixte";
                return (
                  <Card
                    key={client.id}
                    onClick={() => setActiveClientId(client.id)}
                    className="overflow-hidden border-border bg-card hover:border-gold/60 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="p-3.5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <InitialAvatar name={client.name} className="size-10 text-xs shrink-0" />
                          <div className="min-w-0">
                            <h4 className="font-heading text-sm font-bold truncate group-hover:text-gold-text transition-colors">
                              {client.name}
                            </h4>
                            <p className="font-mono text-[11px] text-muted-foreground truncate">{client.phone}</p>
                          </div>
                        </div>
                        {client.pregnant && (
                          <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30 text-[9px] px-1.5 shrink-0">
                            👶 Grossesse
                          </Badge>
                        )}
                      </div>

                      {/* Badges cutanés */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                        <span className="px-2 py-0.5 rounded-md bg-gold/15 text-gold-text font-bold">
                          Phototype {fitz}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground capitalize">
                          Peau {skin}
                        </span>
                        {client.district && (
                          <span className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground text-[10px]">
                            {client.district}
                          </span>
                        )}
                      </div>

                      {/* Informations de suivi */}
                      <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {client.visitsCount > 0 ? (
                            <strong className="text-foreground">{client.visitsCount} visite(s)</strong>
                          ) : (
                            "Nouveau dossier"
                          )}
                        </span>
                        <span className="flex items-center gap-1 text-gold-text font-semibold text-xs group-hover:translate-x-0.5 transition-transform">
                          Ouvrir le dossier <ChevronRight className="size-3.5" />
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Vue détaillée du dossier cutané d'une cliente */
        <ClientSkinDossierDetail
          clientId={activeClientId}
          tenantId={tenantId}
          onBack={() => {
            setActiveClientId(null);
            onClearPreselected?.();
          }}
          onStartDiagnostic={onStartDiagnostic}
          onNavigateToCrm={onNavigateToCrm}
          onRefreshList={clientsApi.refetch}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// COMPOSANT DÉTAILLÉ DU DOSSIER CUTANÉ & FORMULATION PATIENTE
// ═════════════════════════════════════════════════════════════════════
function ClientSkinDossierDetail({
  clientId,
  tenantId,
  onBack,
  onStartDiagnostic,
  onNavigateToCrm,
  onRefreshList,
}: {
  clientId: string;
  tenantId: string;
  onBack: () => void;
  onStartDiagnostic?: (clientId: string) => void;
  onNavigateToCrm?: (clientId: string) => void;
  onRefreshList?: () => void;
}) {
  // Données de formulation et actifs utilisés
  const [productObservations, setProductObservations] = useState("");
  const [obsBusy, setObsBusy] = useState(false);

  // Routine à domicile
  const [cosmeticsUsed, setCosmeticsUsed] = useState("");
  const [cosmeticsBusy, setCosmeticsBusy] = useState(false);

  // Identité cutanée modifiable
  const [skinType, setSkinType] = useState<string>("mixte");
  const [fitzpatrick, setFitzpatrick] = useState<string>("V");
  const [pregnant, setPregnant] = useState<boolean>(false);
  const [identityBusy, setIdentityBusy] = useState(false);

  // Visionneuse HD
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Filtre de la frise d'historique (Tous / Cabine / Cliente)
  const [historyFilter, setHistoryFilter] = useState<"all" | "cabine" | "client">("all");
  // Source pour la courbe d'évolution & biomarqueurs
  const [biomarkersSource, setBiomarkersSource] = useState<"all" | "cabine" | "client">("all");

  const detail = useApi<ProClientDetail>(
    () => apiGet<ProClientDetail>(`/api/pro/clients/${clientId}?tenantId=${tenantId}`),
    [clientId, tenantId]
  );

  const d = detail.data;
  const c = d?.client;

  // Synchronisation des états locaux avec la fiche en base
  useEffect(() => {
    if (c) {
      setProductObservations(c.productObservations ?? "");
      setCosmeticsUsed(c.cosmeticsUsed ?? "");
      setSkinType(c.skinType ?? "mixte");
      setFitzpatrick(c.fitzpatrick ?? "V");
      setPregnant(Boolean(c.pregnant));
    }
  }, [c]);

  // Sauvegarde des observations composants et actifs formulés
  async function saveProductObservations() {
    setObsBusy(true);
    try {
      await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, {
        productObservations: productObservations.trim() || null,
      });
      toast.success("Cahier de formulation enregistré", {
        description: "Les actifs utilisés et observations de tolérance sont sauvegardés au dossier.",
      });
      detail.refetch();
      onRefreshList?.();
    } catch (e) {
      proToastError(e, "Enregistrement impossible");
    } finally {
      setObsBusy(false);
    }
  }

  // Sauvegarde de la routine quotidienne
  async function saveCosmeticsUsed() {
    setCosmeticsBusy(true);
    try {
      await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, {
        cosmeticsUsed: cosmeticsUsed.trim() || null,
      });
      toast.success("Routine cosmétique enregistrée", {
        description: "Les produits appliqués à domicile par la cliente sont conservés au dossier.",
      });
      detail.refetch();
      onRefreshList?.();
    } catch (e) {
      proToastError(e, "Enregistrement impossible");
    } finally {
      setCosmeticsBusy(false);
    }
  }

  // Sauvegarde des caractéristiques de peau (Phototype, Type, Grossesse)
  async function saveSkinIdentity() {
    setIdentityBusy(true);
    try {
      await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, {
        skinType,
        fitzpatrick,
        pregnant,
      });
      toast.success("Identité cutanée mise à jour", {
        description: `Phototype ${fitzpatrick} · Peau ${skinType} sauvegardés.`,
      });
      detail.refetch();
      onRefreshList?.();
    } catch (e) {
      proToastError(e, "Mise à jour impossible");
    } finally {
      setIdentityBusy(false);
    }
  }

  // Insertion automatique d'un canevas de formulation magistrale
  function handleInsertFormulationTemplate() {
    const template = `[CAHIER DE FORMULATION CABINE & ACTIFS UTILISÉS]
• Actifs botaniques formulés : Huile pure de Balanites (30%), Extrait de Moringa (25%), Karité brut non raffiné (40%), Niacinamide (5%)
• Tolérance cutanée constatée : Excellente réceptivité, aucun échauffement
• Posologie prescrite : 3 gouttes le soir sur peau légèrement humide avant le baume
• Objectif du soin sur-mesure : Régulation du sébum et atténuation des taches d'hyperpigmentation`;

    setProductObservations((prev) => (prev ? `${prev}\n\n${template}` : template));
    toast.info("Modèle de formulation inséré", {
      description: "Vous pouvez ajuster les pourcentages et actifs selon la préparation réalisée.",
    });
  }

  // Type unifié des bilans cutanés
  interface UnifiedBilanItem {
    id: string;
    source: "cabine" | "client";
    zone: string;
    scoreGlobal: number;
    createdAt: string;
    practitioner?: string | null;
    vlmUsed?: boolean;
    photoData?: string | null;
    resultJson?: string;
  }

  // Frise unifiée des bilans cutanés (Cabine Institut + Auto-scans Cliente)
  const unifiedBilans = useMemo<UnifiedBilanItem[]>(() => {
    const list: UnifiedBilanItem[] = [];
    for (const pb of d?.proDiagnoses ?? []) {
      list.push({
        id: pb.id,
        source: "cabine",
        zone: pb.zone,
        scoreGlobal: pb.scoreGlobal,
        createdAt: pb.createdAt,
        practitioner: pb.practitioner,
        vlmUsed: pb.vlmUsed,
        photoData: pb.photoData,
        resultJson: pb.resultJson || (pb as any).questionnaireJson,
      });
    }
    for (const cb of d?.diagnoses ?? []) {
      list.push({
        id: cb.id,
        source: "client",
        zone: cb.zone,
        scoreGlobal: cb.scoreGlobal,
        createdAt: cb.createdAt,
        vlmUsed: true,
        photoData: cb.imageData,
        resultJson: cb.resultJson,
      });
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [d?.proDiagnoses, d?.diagnoses]);

  const filteredBilans = useMemo(() => {
    if (historyFilter === "all") return unifiedBilans;
    return unifiedBilans.filter((b) => b.source === historyFilter);
  }, [unifiedBilans, historyFilter]);

  const latestCabine = useMemo(() => d?.proDiagnoses?.[0] ?? null, [d?.proDiagnoses]);
  const latestClient = useMemo(() => d?.diagnoses?.[0] ?? null, [d?.diagnoses]);
  const scoreDelta = useMemo(() => {
    if (!latestCabine || !latestClient) return null;
    return latestCabine.scoreGlobal - latestClient.scoreGlobal;
  }, [latestCabine, latestClient]);

  // Données pour la courbe d'évolution selon la source choisie
  const evolutionRows = useMemo(() => {
    if (biomarkersSource === "cabine") return (d?.proDiagnoses ?? []) as any[];
    if (biomarkersSource === "client") return (d?.diagnoses ?? []) as any[];
    return unifiedBilans as any[];
  }, [biomarkersSource, d?.proDiagnoses, d?.diagnoses, unifiedBilans]);

  // Photos de la cliente et de cabine pour la visionneuse
  const lightboxPhotos: (LightboxPhoto & { source?: "cabine" | "client" })[] = useMemo(() => {
    const list: (LightboxPhoto & { source?: "cabine" | "client" })[] = [];
    // 1. Photos d'auto-scan cliente
    for (const dg of d?.diagnoses ?? []) {
      if (dg.imageData && dg.imageData.trim()) {
        const parsed = parseDiagnosis(dg.resultJson);
        list.push({
          id: dg.id,
          url: diagImgSrc(dg.imageData),
          date: dg.createdAt,
          zone: `${dg.zone.replace("_", " ")} · Auto-scan Cliente`,
          score: dg.scoreGlobal,
          indicators: parsed?.indicateurs,
          source: "client",
        });
      }
    }
    // 2. Photos de bilan cabine
    for (const pd of d?.proDiagnoses ?? []) {
      if (pd.photoData && pd.photoData.trim()) {
        const parsed = parseProDiagnosis(pd.resultJson || (pd as any).questionnaireJson);
        list.push({
          id: pd.id,
          url: diagImgSrc(pd.photoData),
          date: pd.createdAt,
          zone: `${pd.zone.replace("_", " ")} · Bilan Cabine`,
          score: pd.scoreGlobal,
          indicators: (parsed as any)?.indicateurs,
          source: "cabine",
        });
      }
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [d?.diagnoses, d?.proDiagnoses]);

  // Jumeau de Peau 3D
  const twinEntries = useMemo<TwinEntry[]>(
    () =>
      (d?.diagnoses ?? []).map((dg) => {
        const r = parseDiagnosis(dg.resultJson);
        return {
          id: dg.id,
          zone: dg.zone as BodyZone,
          score: dg.scoreGlobal,
          fitz: r?.fitzpatrick_estime,
          marks: r?.zones_marquages ?? [],
          date: dg.createdAt,
          indicators: r?.indicateurs,
        };
      }),
    [d?.diagnoses]
  );

  if (detail.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (detail.error || !c) {
    return (
      <Card className="p-6 text-center space-y-3">
        <ErrorState message={detail.error || "Dossier introuvable"} onRetry={detail.refetch} />
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5 mr-1.5" /> Revenir à la liste
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Bandeau d'en-tête du Dossier Cutané ── */}
      <Card className="overflow-hidden border-border bg-card shadow-sm">
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <InitialAvatar name={c.name} className="size-13 text-base shadow-sm shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-heading font-black text-lg text-foreground truncate">{c.name}</h3>
                  <Badge variant="outline" className="bg-gold/15 text-gold-text border-gold/30 font-bold text-xs">
                    Phototype {fitzpatrick}
                  </Badge>
                  {pregnant && (
                    <Badge variant="outline" className="bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30 text-xs font-bold">
                      👶 Maternité active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 font-mono">
                  <span>{c.phone}</span>
                  {c.district && <span className="font-sans">· {c.district}</span>}
                  <span className="font-sans">· {d?.proDiagnoses.length ?? 0} cabine · {d?.diagnoses.length ?? 0} auto-scan(s) cliente</span>
                </p>
              </div>
            </div>

            {/* Actions principales du dossier */}
            <div className="flex flex-wrap items-center gap-2">
              {onStartDiagnostic && (
                <Button
                  size="sm"
                  onClick={() => onStartDiagnostic(c.id)}
                  className="k-btn-gold text-primary-foreground font-bold text-xs gap-1.5 shadow-xs"
                >
                  <Sparkles className="size-3.5" /> Lancer un diagnostic
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/pro/consultation-sheet?tenantId=${tenantId}&clientId=${c.id}&_t=${Date.now()}`, "_blank")}
                className="text-xs gap-1.5"
              >
                <FileDown className="size-3.5" /> Fiche clinique (PDF)
              </Button>
              <button
                type="button"
                onClick={() => {
                  const msg = `Bonjour ${c.name.split(" ")[0]} 🌸 Votre institut Kènè reste à votre écoute pour le suivi de votre routine et vos soins de peau dermo-cosmétiques.`;
                  openWhatsApp(c.phone, msg);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] text-xs font-bold border border-[#25D366]/30 transition-colors cursor-pointer"
              >
                <MessageCircle className="size-3.5 text-[#25D366]" /> WhatsApp
              </button>
              {onNavigateToCrm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigateToCrm(c.id)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Fiche CRM &amp; Ventes →
                </Button>
              )}
            </div>
          </div>

          {/* Sélecteurs rapides d'ajustement du profil cutané */}
          <div className="pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 bg-muted/30 p-2.5 rounded-xl">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-muted-foreground">Type de peau :</span>
                <select
                  value={skinType}
                  onChange={(e) => setSkinType(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                >
                  <option value="mixte">Mixte</option>
                  <option value="grasse">Grasse</option>
                  <option value="seche">Sèche</option>
                  <option value="normale">Normale</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-muted-foreground">Phototype Fitzpatrick :</span>
                <select
                  value={fitzpatrick}
                  onChange={(e) => setFitzpatrick(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                >
                  <option value="III">Phototype III</option>
                  <option value="IV">Phototype IV</option>
                  <option value="V">Phototype V</option>
                  <option value="VI">Phototype VI</option>
                </select>
              </div>

              <label className="flex items-center gap-1.5 font-semibold text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pregnant}
                  onChange={(e) => setPregnant(e.target.checked)}
                  className="rounded border-input text-pink-500 focus:ring-pink-500 size-3.5"
                />
                <span className="text-pink-600 dark:text-pink-400">Grossesse / Allaitement</span>
              </label>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={saveSkinIdentity}
              disabled={identityBusy}
              className="h-8 text-xs gap-1 border-gold/40 text-gold-text hover:bg-gold/10"
            >
              <Save className="size-3" />
              {identityBusy ? "Enregistrement…" : "Sauvegarder l'identité"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Alerte Vigilance Maternité si active */}
      {pregnant && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-pink-500/10 border border-pink-500/30 text-pink-800 dark:text-pink-300 text-xs">
          <Baby className="size-5 shrink-0 text-pink-500 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-sm">⚠️ Protocole Sécurisé Cabine : Cliente enceinte / allaitante</p>
            <p className="text-[11.5px] leading-relaxed opacity-90">
              Exclure impérativement les rétinoïdes, les peelings chimiques à haute concentration (AHA/BHA forts) et les
              huiles essentielles pures. Privilégier les beurres purs non raffinés (Karité brut), l&apos;huile de Balanites et l&apos;hydratation apaisante.
            </p>
          </div>
        </div>
      )}

      {/* ── 5 Onglets Spécialisés du Dossier Cutané ── */}
      <Tabs defaultValue="formulation" className="w-full">
        <TabsList className="w-full grid grid-cols-5 h-11 bg-muted/60 p-1 rounded-2xl">
          <TabsTrigger value="formulation" className="text-xs font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs">
            <FlaskConical className="size-3.5 text-emerald-500" />
            <span className="truncate">Cahier de Formulation</span>
          </TabsTrigger>
          <TabsTrigger value="imaging" className="text-xs font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs">
            <Camera className="size-3.5 text-gold-text" />
            <span className="truncate">Imagerie HD &amp; Progrès</span>
          </TabsTrigger>
          <TabsTrigger value="biomarkers" className="text-xs font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs">
            <Layers className="size-3.5 text-primary" />
            <span className="truncate">Biomarqueurs &amp; 3D</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs">
            <FileClock className="size-3.5 text-muted-foreground" />
            <span className="truncate">Historique Bilans ({unifiedBilans.length})</span>
          </TabsTrigger>
          <TabsTrigger value="prescription" className="text-xs font-bold gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs">
            <Leaf className="size-3.5 text-amber-500" />
            <span className="truncate">Ordonnance Beauté</span>
          </TabsTrigger>
        </TabsList>

        {/* ═════════ 1. CAHIER DE FORMULATION & ACTIFS UTILISÉS ═════════ */}
        <TabsContent value="formulation" className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <FlaskConical className="size-4.5" />
                  </span>
                  <div>
                    <h4 className="font-heading text-sm font-bold text-foreground">
                      Actifs utilisés dans la préparation des produits cosmétiques
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Consignez ici la composition des soins sur-mesure, synergies, pourcentages d&apos;actifs et tolérance constatée
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleInsertFormulationTemplate}
                  className="text-xs gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 shrink-0"
                >
                  <BissapFlowerIcon className="size-3.5" />
                  <span>Insérer modèle de formulation</span>
                </Button>
              </div>

              <Textarea
                rows={6}
                value={productObservations}
                onChange={(e) => setProductObservations(e.target.value)}
                placeholder="Ex : Soin personnalisé préparé pour la cliente :
• Actifs formulés : Karité bio non raffiné (50%), Huile de Moringa pure (30%), Huile de Balanites (15%), Niacinamide (5%)
• Tolérance cutanée : Très bien toléré, aucun picotement
• Conseils de pose : Appliquer le soir sur visage propre
• Précautions notées : Éviter l'exposition solaire directe sans SPF50…"
                className="text-xs font-mono leading-relaxed"
                aria-label="Observations sur les composants et actifs formulés"
              />

              {/* Raccourcis d'actifs botaniques de la pharmacopée */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Actifs de la pharmacopée africaine &amp; dermo-cosmétique :
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Moringa pur d'Afrique",
                    "Karité brut bio",
                    "Huile de Balanites (Dattier)",
                    "Extrait de Kinkeliba",
                    "Hibiscus Sabdariffa (AHA doux)",
                    "Niacinamide 5%",
                    "Acide Hyaluronique",
                    "Bisabolol apaisant",
                    "Filtre minéral SPF50",
                  ].map((active) => (
                    <button
                      key={active}
                      type="button"
                      onClick={() => {
                        setProductObservations((prev) => (prev ? `${prev.trim()}, ${active}` : active));
                      }}
                      className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-gold/15 hover:text-gold-text hover:border-gold/30 transition-colors cursor-pointer"
                    >
                      + {active}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Synchronisé avec la fiche de consultation cabine et conservé au dossier.
                </p>
                <Button
                  size="sm"
                  onClick={() => void saveProductObservations()}
                  disabled={obsBusy}
                  className="k-btn-gold text-primary-foreground font-bold text-xs gap-1.5"
                >
                  <Save className="size-3.5" />
                  {obsBusy ? "Enregistrement…" : "Enregistrer la préparation"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Routine quotidienne déclarée par la patiente */}
          <Card className="border-border bg-card">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold-text shrink-0">
                    <Sun className="size-4.5" />
                  </span>
                  <div>
                    <h4 className="font-heading text-sm font-bold text-foreground">
                      Routine cosmétique quotidienne à domicile
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Produits appliqués chaque jour par la cliente (nettoyant, sérum, crème de jour, solaire, nuit)
                    </p>
                  </div>
                </div>
              </div>

              <Textarea
                rows={3}
                value={cosmeticsUsed}
                onChange={(e) => setCosmeticsUsed(e.target.value)}
                placeholder="Ex : Matin : Savon doux surgras, Sérum hydratant Moringa, Fluide SPF50. Soir : Huile démaquillante Balanites, Baume Karité brut…"
                className="text-xs leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">Partagé sur les bilans de suivi</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void saveCosmeticsUsed()}
                  disabled={cosmeticsBusy}
                  className="text-xs gap-1.5"
                >
                  <Save className="size-3.5" />
                  {cosmeticsBusy ? "Enregistrement…" : "Enregistrer la routine"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═════════ 2. IMAGERIE HD & ÉVOLUTION VISUELLE ═════════ */}
        <TabsContent value="imaging" className="mt-4 space-y-4">
          {/* Comparateur Avant / Après tactile si 2 diagnostics ou plus */}
          {d && d.diagnoses.length >= 2 && (() => {
            const sorted = [...d.diagnoses].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            const beforeDiag = sorted[0];
            const afterDiag = sorted[sorted.length - 1];
            return (
              <Card className="border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                    <SankofaIcon className="size-4 text-gold-text" />
                    Comparateur Avant / Après Tactile (Curseur Évolution)
                  </h4>
                  <Badge variant="outline" className="text-[10px] text-gold-text border-gold/30">
                    Bilan Initial vs Plus Récent
                  </Badge>
                </div>
                <BeforeAfterSlider
                  before={{
                    imageUrl: diagImgSrc(beforeDiag.imageData),
                    label: "Bilan Initial J0",
                    date: beforeDiag.createdAt,
                    score: beforeDiag.scoreGlobal,
                  }}
                  after={{
                    imageUrl: diagImgSrc(afterDiag.imageData),
                    label: "Bilan Récent",
                    date: afterDiag.createdAt,
                    score: afterDiag.scoreGlobal,
                  }}
                  showSpectralUvToggle={true}
                />
              </Card>
            );
          })()}

          {/* Galerie Haute Définition de toutes les photos cutanées */}
          <Card className="border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                  <Camera className="size-4 text-primary" />
                  Galerie Imagerie HD Plein Écran ({lightboxPhotos.length} clichés)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Cliquez sur un cliché pour l&apos;examiner avec la loupe haute résolution plein écran
                </p>
              </div>
            </div>

            {lightboxPhotos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground">Aucune photographie de cabine enregistrée pour cette cliente.</p>
                {onStartDiagnostic && (
                  <Button size="sm" onClick={() => onStartDiagnostic(c.id)} className="text-xs gap-1.5 k-btn-gold text-primary-foreground">
                    <Camera className="size-3.5" /> Prendre une photo en cabine
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {lightboxPhotos.map((photo, idx) => (
                  <div
                    key={photo.id}
                    onClick={() => {
                      setLightboxIndex(idx);
                      setLightboxOpen(true);
                    }}
                    className="group relative aspect-square rounded-xl overflow-hidden border border-border bg-muted cursor-pointer hover:border-gold/80 transition-all select-none shadow-xs"
                    title="Agrandir en haute définition plein écran"
                  >
                    <div className="absolute top-1.5 left-1.5 z-10">
                      {photo.source === "cabine" ? (
                        <Badge className="bg-[#C8951E] text-white text-[9px] font-bold border-none px-1.5 py-0.5 shadow-sm">
                          🔬 Cabine
                        </Badge>
                      ) : (
                        <Badge className="bg-sky-600 text-white text-[9px] font-bold border-none px-1.5 py-0.5 shadow-sm">
                          📱 Auto-scan
                        </Badge>
                      )}
                    </div>
                    <img src={photo.url} alt={photo.zone ? `Photo ${photo.zone}` : "Photo cutanée"} className="size-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="px-2 py-1 rounded-full bg-black/70 text-white text-[11px] font-bold flex items-center gap-1">
                        <Eye className="size-3" /> Zoom HD
                      </span>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white text-[10px]">
                      <p className="font-bold capitalize truncate">{(photo.zone || "Zone cutanée").replace("_", " ")}</p>
                      <p className="opacity-80 font-mono text-[9px]">{formatDate(photo.date, { day: "numeric", month: "short" })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ═════════ 3. BIOMARQUEURS & JUMEAU DE PEAU 3D ═════════ */}
        <TabsContent value="biomarkers" className="mt-4 space-y-4">
          {twinEntries.length > 0 && (
            <SkinTwinCard context="pro" entries={twinEntries} className="border-border shadow-xs" />
          )}

          {/* Sélecteur de source de la courbe d'évolution */}
          {d && (d.diagnoses.length > 0 || d.proDiagnoses.length > 0) && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-primary" />
                  <span className="text-xs font-bold text-foreground">Courbe d&apos;évolution &amp; Fil du Temps :</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={biomarkersSource === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBiomarkersSource("all")}
                    className={cn("h-7 text-xs px-2.5", biomarkersSource === "all" ? "k-btn-gold text-primary-foreground font-bold" : "")}
                  >
                    Tous ({unifiedBilans.length})
                  </Button>
                  {d.proDiagnoses.length > 0 && (
                    <Button
                      variant={biomarkersSource === "cabine" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBiomarkersSource("cabine")}
                      className={cn("h-7 text-xs px-2.5", biomarkersSource === "cabine" ? "k-btn-gold text-primary-foreground font-bold" : "")}
                    >
                      🔬 Cabine ({d.proDiagnoses.length})
                    </Button>
                  )}
                  {d.diagnoses.length > 0 && (
                    <Button
                      variant={biomarkersSource === "client" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBiomarkersSource("client")}
                      className={cn("h-7 text-xs px-2.5", biomarkersSource === "client" ? "k-btn-gold text-primary-foreground font-bold" : "")}
                    >
                      📱 Auto-scans ({d.diagnoses.length})
                    </Button>
                  )}
                </div>
              </div>

              {evolutionRows.length > 0 ? (
                <ProEvolutionCard rows={evolutionRows} className="border-border shadow-xs" />
              ) : (
                <p className="text-xs text-muted-foreground italic text-center py-4">Aucune donnée sur ce filtre.</p>
              )}
            </div>
          )}

          {twinEntries.length === 0 && (!d || (d.diagnoses.length === 0 && d.proDiagnoses.length === 0)) && (
            <Card className="p-8 text-center space-y-2 border-dashed">
              <EmptyState
                label="Aucune donnée biométrique disponible"
                sub="Réalisez un premier diagnostic avec la cliente pour générer sa Cartographie Cutanée 3D et sa courbe d'évolution."
              />
            </Card>
          )}
        </TabsContent>

        {/* ═════════ 4. HISTORIQUE UNIFIÉ & FRISE CHRONOLOGIQUE ═════════ */}
        <TabsContent value="history" className="mt-4 space-y-4">
          {/* Synthèse comparative si bilans cabine et auto-scans existent */}
          {latestCabine && latestClient && (
            <Card className="p-4 border-border bg-card/60 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-gold-text" /> Comparatif Bilan Cabine vs Auto-scan Cliente
                </span>
                {scoreDelta !== null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px] font-bold font-mono",
                      scoreDelta >= 0
                        ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                        : "border-amber-500/40 text-amber-600 bg-amber-500/10"
                    )}
                  >
                    {scoreDelta > 0 ? `+${scoreDelta} pts en cabine` : scoreDelta === 0 ? "Scores identiques" : `${scoreDelta} pts`}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl border border-gold/30 bg-gold/5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Badge className="bg-[#C8951E] text-white border-none text-[9px] font-bold">🔬 Cabine</Badge>
                      <span className="font-bold text-foreground text-xs capitalize">{latestCabine.zone.replace("_", " ")}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDate(latestCabine.createdAt)} {latestCabine.practitioner ? `· ${latestCabine.practitioner}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-base font-bold" style={{ color: scoreVar(latestCabine.scoreGlobal) }}>
                    {latestCabine.scoreGlobal}/100
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Badge className="bg-sky-600 text-white border-none text-[9px] font-bold">📱 Auto-scan</Badge>
                      <span className="font-bold text-foreground text-xs capitalize">{latestClient.zone.replace("_", " ")}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDate(latestClient.createdAt)} · Smartphone app
                    </p>
                  </div>
                  <span className="font-mono text-base font-bold" style={{ color: scoreVar(latestClient.scoreGlobal) }}>
                    {latestClient.scoreGlobal}/100
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Statut du consentement de partage */}
          {!d?.scansShared && (
            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-bold">Partage d&apos;auto-scans suspendu par la cliente</p>
                <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                  La cliente a révoqué le partage en direct : les bilans réalisés avant la suspension restent archivés ci-dessous pour assurer la continuité des soins, mais ses prochains scans réalisés sur smartphone ne seront plus transmis.
                </p>
              </div>
            </div>
          )}

          {/* Barre d'outils & Filtre de la frise */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant={historyFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryFilter("all")}
                className={cn("h-8 text-xs font-bold", historyFilter === "all" ? "k-btn-gold text-primary-foreground" : "")}
              >
                Tous les bilans ({unifiedBilans.length})
              </Button>
              <Button
                variant={historyFilter === "cabine" ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryFilter("cabine")}
                className={cn("h-8 text-xs font-bold gap-1", historyFilter === "cabine" ? "k-btn-gold text-primary-foreground" : "")}
              >
                🔬 Cabine Institut ({d?.proDiagnoses.length ?? 0})
              </Button>
              <Button
                variant={historyFilter === "client" ? "default" : "outline"}
                size="sm"
                onClick={() => setHistoryFilter("client")}
                className={cn("h-8 text-xs font-bold gap-1", historyFilter === "client" ? "k-btn-gold text-primary-foreground" : "")}
              >
                📱 Auto-scans Cliente ({d?.diagnoses.length ?? 0})
              </Button>
            </div>

            {onStartDiagnostic && (
              <Button
                size="sm"
                onClick={() => onStartDiagnostic(c.id)}
                className="h-8 text-xs gap-1.5 k-btn-gold text-primary-foreground font-bold ml-auto"
              >
                <Sparkles className="size-3.5" /> Nouveau diagnostic cabine
              </Button>
            )}
          </div>

          {/* Liste des bilans selon filtre */}
          {filteredBilans.length === 0 ? (
            <Card className="p-6 text-center space-y-2 border-dashed">
              <p className="text-xs text-muted-foreground">Aucun bilan cutané correspondant au filtre sélectionné.</p>
              {historyFilter === "cabine" && onStartDiagnostic && (
                <Button size="sm" onClick={() => onStartDiagnostic(c.id)} className="text-xs gap-1.5 k-btn-gold text-primary-foreground font-semibold">
                  <Sparkles className="size-3.5" /> Lancer le premier diagnostic cabine
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredBilans.map((item) => {
                const isCabine = item.source === "cabine";
                const parsed = item.resultJson ? parseDiagnosis(item.resultJson) : null;
                const indicators = parsed?.indicateurs ?? [];

                return (
                  <Card
                    key={`${item.source}-${item.id}`}
                    className={cn(
                      "p-3.5 bg-card space-y-2.5 transition-all",
                      isCabine
                        ? "border-[#C8951E]/35 hover:border-[#C8951E]/70"
                        : "border-sky-500/30 hover:border-sky-500/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Miniature photo si disponible */}
                        {item.photoData && item.photoData.trim() ? (
                          <div
                            onClick={() => {
                              const foundIdx = lightboxPhotos.findIndex((p) => p.id === item.id);
                              if (foundIdx >= 0) {
                                setLightboxIndex(foundIdx);
                                setLightboxOpen(true);
                              }
                            }}
                            className="size-14 rounded-xl overflow-hidden border border-border bg-muted shrink-0 cursor-pointer hover:opacity-90 relative group"
                            title="Agrandir le cliché HD"
                          >
                            <img src={diagImgSrc(item.photoData)} alt="Photo bilan" className="size-full object-cover" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="size-3 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "size-11 rounded-xl flex items-center justify-center shrink-0",
                              isCabine ? "bg-[#C8951E]/15 text-[#C8951E]" : "bg-sky-500/15 text-sky-600"
                            )}
                          >
                            {isCabine ? <Stethoscope className="size-5" /> : <Smartphone className="size-5" />}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isCabine ? (
                              <Badge className="bg-[#C8951E] text-white border-none text-[9.5px] font-bold">
                                🔬 Bilan Cabine Institut
                              </Badge>
                            ) : (
                              <Badge className="bg-sky-600 text-white border-none text-[9.5px] font-bold">
                                📱 Auto-scan Cliente (Mobile)
                              </Badge>
                            )}
                            <span className="font-heading font-bold text-xs capitalize text-foreground">
                              Zone {item.zone.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {formatDate(item.createdAt)} {formatTime(item.createdAt)}
                            {isCabine && item.practitioner ? ` · Praticienne : ${item.practitioner}` : ""}
                            {!isCabine ? " · Déclaratif cliente via smartphone" : ""}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-mono text-base font-bold leading-none" style={{ color: scoreVar(item.scoreGlobal) }}>
                          {item.scoreGlobal}/100
                        </p>
                        <p className="text-[9px] text-muted-foreground font-semibold mt-1">
                          Score santé peau
                        </p>
                      </div>
                    </div>

                    {/* Indicateurs ou spécificités */}
                    {indicators.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {indicators.slice(0, 4).map((ind, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-medium text-foreground"
                          >
                            <span>{ind.nom}</span>
                            <span className="font-mono text-[9px] opacity-75">{ind.pourcentage}%</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-muted-foreground">
                        {isCabine
                          ? item.vlmUsed
                            ? "Biométrie spectrale couplée · Examen cabine validé"
                            : "Entretien cabine seul"
                          : "Auto-diagnostic assisté par IA VLM Kènè"}
                      </span>

                      {isCabine && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/api/pro/diagnoses/report?tenantId=${encodeURIComponent(tenantId)}&id=${item.id}`, "_blank")}
                          className="text-[10.5px] h-7 gap-1"
                        >
                          <FileDown className="size-3" /> Compte-rendu cabine (PDF)
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═════════ 5. ORDONNANCE BEAUTÉ & COSMÉTOVIGILANCE ═════════ */}
        <TabsContent value="prescription" className="mt-4 space-y-4">
          <Card className="border-border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Leaf className="size-5 text-[#C8951E]" />
                <h4 className="font-heading text-sm font-bold text-foreground">Ordonnance Beauté &amp; Pharmacopée Active</h4>
              </div>
              <Badge variant="outline" className="text-xs font-bold border-gold/30 text-gold-text bg-gold/10">
                Protocole Dermo-Compatible
              </Badge>
            </div>

            {/* Rituels Matin & Soir */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
                <p className="font-bold text-amber-500 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                  <Sun className="size-3.5" /> Matin (Protection Anti-Pollution &amp; UV)
                </p>
                <ul className="space-y-1.5 text-muted-foreground text-[11px] list-disc pl-4">
                  <li>Nettoyage doux au savon surgras ou infusion de Kinkeliba</li>
                  <li>Sérum antioxydant à l&apos;Hibiscus et Niacinamide 5%</li>
                  <li>Protection solaire SPF50 fluide garantie sans traces blanches</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
                <p className="font-bold text-indigo-400 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                  <Moon className="size-3.5" /> Soir (Régénération &amp; Unification)
                </p>
                <ul className="space-y-1.5 text-muted-foreground text-[11px] list-disc pl-4">
                  <li>Démaquillage à l&apos;huile pure de Balanites pour dissoudre les impuretés</li>
                  <li>Soin ciblé anti-taches formulé pour peau mélanoderme</li>
                  <li>Scellement barrière au Karité brut pur bio non raffiné</li>
                </ul>
              </div>
            </div>

            {/* Cosmétovigilance anti-dépigmentation */}
            <div className="p-3.5 rounded-xl bg-[#8B1A3B]/10 border border-[#8B1A3B]/30 text-xs space-y-1.5">
              <p className="font-bold text-[#8B1A3B] dark:text-[#E89E78] flex items-center gap-1.5">
                <ShieldAlert className="size-4" /> Règles de Vigilance &amp; Sécurité Cutanée Kènè
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Interdiction formelle de tout produit dépigmentant (hydroquinone, corticoïdes, mercure). En cas de rougeur ou
                d&apos;intolérance à un composant, consigner l&apos;événement dans le Cahier de formulation et suspendre l&apos;actif.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Visionneuse HD plein écran */}
      <PhotoLightboxModal
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
      />
    </div>
  );
}
