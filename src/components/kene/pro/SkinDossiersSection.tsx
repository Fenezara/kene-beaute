"use client";
// Kènè Pro — 🔬 Dossiers Cutanés & Cahier de Formulation des Clientes
// Espace dédié exclusivement à la santé de la peau, phototypes mélanodermes,
// imagerie spectrale HD, suivi d'évolution avant/après et formulation d'actifs sur-mesure.
import { useEffect, useMemo, useState, useRef } from "react";
import {
  FolderHeart, Search, Sparkles, Filter, ChevronRight, Baby, Leaf,
  FlaskConical, Save, FileDown, MessageCircle, CheckCircle2, Phone,
  SlidersHorizontal, Eye, ShieldAlert, Sun, Moon, ArrowLeft,
  Calendar, Lock, Layers, Droplets, Camera, Check, Plus, AlertTriangle,
  Smartphone, Stethoscope, FileClock, Clock, UserCheck, Info, Users,
  ShoppingBag, Sparkle, Trash2, CalendarCheck, RefreshCw, ArrowRight, History, CheckCircle, XCircle, Loader2
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { formatPhoneDisplay } from "@/lib/kene/phone-normalize";
import { matchesSearch } from "@/lib/kene/search";
import {
  parseStructuredPrescription,
  serializeStructuredPrescription,
  createNewCureTransition,
  buildPrescriptionWhatsAppSummary,
  type PrescribedProductItem,
  type PrescribedCabineServiceItem,
  type StructuredPrescription,
  type PrescriptionVersion,
} from "@/lib/kene/prescription-schema";
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
        if (res.clients) return res.clients;
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
        const matches = matchesSearch(search, c.name, c.phone, c.district, c.email);
        if (!matches) return false;
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
          <>
            {activeClientId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveClientId(null);
                  onClearPreselected?.();
                }}
                className="gap-1.5 text-xs h-9 shrink-0"
              >
                <ArrowLeft className="size-3.5" />
                <span>Tous les dossiers</span>
              </Button>
            )}
            {onStartDiagnostic && (
              <Button
                onClick={() => onStartDiagnostic(activeClientId || "")}
                className="k-btn-gold text-primary-foreground font-semibold text-xs h-9 gap-1.5 shrink-0"
              >
                <Sparkles className="size-3.5" />
                <span>{activeClientId ? "Diagnostic de cette cliente" : "Nouveau diagnostic"}</span>
              </Button>
            )}
          </>
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
            <Card className="border-border/80 bg-card p-3.5 space-y-1 k-card-awwwards shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] uppercase font-bold tracking-wider">Patientes suivies</span>
                <Users className="size-3.5 text-gold-text" />
              </div>
              <p className="font-mono text-xl font-black text-foreground">{kpis.total}</p>
              <p className="text-[10px] text-muted-foreground">{kpis.withVisits} avec antécédents cabine</p>
            </Card>

            <Card className="border-border/80 bg-card p-3.5 space-y-1 k-card-awwwards shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] uppercase font-bold tracking-wider">Phototypes V &amp; VI</span>
                <Sparkles className="size-3.5 text-gold-text" />
              </div>
              <p className="font-mono text-xl font-black text-gold-text">{kpis.melanoVVI}</p>
              <p className="text-[10px] text-muted-foreground">Spécificité mélanoderme</p>
            </Card>

            <Card className="border-border/80 bg-card p-3.5 space-y-1 k-card-awwwards shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] uppercase font-bold tracking-wider">Vigilance Maternité</span>
                <Baby className="size-3.5 text-pink-500" />
              </div>
              <p className="font-mono text-xl font-black text-pink-500">{kpis.pregnantCount}</p>
              <p className="text-[10px] text-muted-foreground">Protocoles doux obligatoires</p>
            </Card>

            <Card className="border-border/80 bg-card p-3.5 space-y-1 k-card-awwwards shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] uppercase font-bold tracking-wider">Actifs Pharmacopée</span>
                <CheckCircle2 className="size-3.5 text-emerald-500" />
              </div>
              <p className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">100%</p>
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

              {/* Filtre Phototype mélanique */}
              <select
                value={selectedFitzy}
                onChange={(e) => setSelectedFitzy(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground"
                aria-label="Filtrer par phototype"
              >
                <option value="all">Tous les phototypes</option>
                <option value="albinos">Albinos (OCA — I africain)</option>
                <option value="rouquine">Afro-rousse / Rouquine (OCA3 / Phéomélanine)</option>
                <option value="III">Phototype III (Chabine / Doré très clair)</option>
                <option value="IV">Phototype IV (Caramel / Métissé)</option>
                <option value="V">Phototype V (Brun cuivré à chocolat)</option>
                <option value="VI">Phototype VI (Ébène / Cacao intense)</option>
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
                          <InitialAvatar name={client.name} userId={client.userId} className="size-10 text-xs shrink-0" />
                          <div className="min-w-0">
                            <h4 className="font-heading text-sm font-bold truncate group-hover:text-gold-text transition-colors">
                              {client.name}
                            </h4>
                            <p className="font-mono text-[11px] text-muted-foreground truncate">{formatPhoneDisplay(client.phone)}</p>
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

  // Routine à domicile & Ordonnance Structurée Hybride (Produits Domicile + Soins Cabine)
  const [cosmeticsUsed, setCosmeticsUsed] = useState("");
  const [prescriptionData, setPrescriptionData] = useState<StructuredPrescription>({
    version: 3,
    cureNumber: 1,
    status: "active",
    prescribedAt: new Date().toISOString(),
    products: [],
    cabineServices: [],
    notes: "",
    history: [],
  });
  const [cosmeticsBusy, setCosmeticsBusy] = useState(false);

  // État du renouvellement et transition de cure (Ordonnance beauté)
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [renewReason, setRenewReason] = useState("Bilan de contrôle à S+3");
  const [customRenewReason, setCustomRenewReason] = useState("");
  const [renewPrevScore, setRenewPrevScore] = useState<number>(70);
  const [renewNextScore, setRenewNextScore] = useState<number>(82);
  const [transitionProducts, setTransitionProducts] = useState<
    Array<{
      original: PrescribedProductItem;
      action: "keep" | "replace" | "stop";
      replacementName?: string;
      replacementProductId?: string;
      replacementCategory?: string;
      replacementPrice?: number;
      replacementPosology?: string;
      replacementMoment?: "matin" | "soir" | "matin_soir" | "hebdo";
      replacementPhotoUrl?: string;
      note?: string;
    }>
  >([]);

  // Ouvre le modal de transition en pré-remplissant les produits actuels
  function openRenewCureModal() {
    const currentProds = prescriptionData.products || [];
    setTransitionProducts(
      currentProds.map((p) => ({
        original: p,
        action: "keep",
        replacementName: "",
        replacementPosology: p.posology,
        replacementMoment: p.moment,
      }))
    );

    // Détermination des scores
    const lastDiagScore = d?.diagnoses?.[0]?.scoreGlobal ?? d?.proDiagnoses?.[0]?.scoreGlobal ?? 78;
    const prevDiagScore = d?.diagnoses?.[1]?.scoreGlobal ?? d?.proDiagnoses?.[1]?.scoreGlobal ?? Math.max(40, lastDiagScore - 8);
    setRenewPrevScore(prevDiagScore);
    setRenewNextScore(lastDiagScore);
    setRenewReason("Bilan de contrôle à S+3");
    setCustomRenewReason("");
    setIsRenewModalOpen(true);
  }

  // Confirme la transition vers la nouvelle cure
  function handleConfirmNewCure() {
    const finalReason = renewReason === "custom" ? (customRenewReason.trim() || "Ajustement sur-mesure") : renewReason;
    const newProductsList: PrescribedProductItem[] = [];

    transitionProducts.forEach((item) => {
      if (item.action === "keep") {
        newProductsList.push({
          ...item.original,
          transitionStatus: "keep",
          transitionNote: "Soin conservé de la cure précédente",
        });
      } else if (item.action === "replace") {
        newProductsList.push({
          productId: item.replacementProductId || undefined,
          name: item.replacementName?.trim() || `Soin ciblé (remplace ${item.original.name})`,
          category: item.replacementCategory || item.original.category,
          price: item.replacementPrice ?? item.original.price,
          moment: item.replacementMoment || item.original.moment,
          posology: item.replacementPosology?.trim() || item.original.posology,
          photoUrl: item.replacementPhotoUrl || undefined,
          transitionStatus: "replace",
          replacedProductName: item.original.name,
          transitionNote: item.note?.trim() || `Remplace ${item.original.name}`,
        });
      }
      // "stop" est archivé avec l'ancienne cure et retiré de la nouvelle cure active
    });

    const updated = createNewCureTransition(prescriptionData, {
      changeReason: finalReason,
      previousScore: renewPrevScore,
      newScore: renewNextScore,
      tenantId,
      tenantName: prescriptionData.tenantName,
      prescribedBy: "Dermo-Conseillère",
      products: newProductsList,
      cabineServices: prescriptionData.cabineServices,
    });

    void saveStructuredPrescription(updated);
    setIsRenewModalOpen(false);
  }

  // Catalogue de l'institut (Produits & Soins) pour sélection en 1 clic
  const catalogApi = useApi<{ services: any[]; products: any[] }>(
    () => (tenantId ? apiGet<{ services: any[]; products: any[] }>(`/api/pro/catalog?tenantId=${tenantId}`) : Promise.resolve({ services: [], products: [] })),
    [tenantId]
  );
  const instituteProducts = catalogApi.data?.products ?? [];
  const instituteServices = catalogApi.data?.services ?? [];

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
      setPrescriptionData(parseStructuredPrescription(c.cosmeticsUsed));
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

  // Sauvegarde de l'ordonnance beauté structurée
  async function saveStructuredPrescription(updatedPrescription?: StructuredPrescription) {
    const pToSave = updatedPrescription ?? prescriptionData;
    setCosmeticsBusy(true);
    try {
      const serialized = serializeStructuredPrescription({
        ...pToSave,
        prescribedAt: new Date().toISOString(),
        tenantId,
      });

      await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, {
        cosmeticsUsed: serialized,
      });

      setCosmeticsUsed(serialized);
      setPrescriptionData(pToSave);
      toast.success("Ordonnance Beauté & Soins Cabine enregistrée !", {
        description: "Transmise en temps réel sur l'application de la cliente.",
      });
      detail.refetch();
      onRefreshList?.();
    } catch (e) {
      proToastError(e, "Enregistrement de l'ordonnance impossible");
    } finally {
      setCosmeticsBusy(false);
    }
  }

  // Sauvegarde des caractéristiques de peau (Phototype, Type, Grossesse)
  async function saveSkinIdentity(showFeedback = true) {
    setIdentityBusy(true);
    try {
      await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, {
        skinType,
        fitzpatrick,
        pregnant,
      });
      if (showFeedback) {
        toast.success("Identité cutanée mise à jour", {
          description: `Phototype ${fitzpatrick} · Peau ${skinType} sauvegardés.`,
        });
      }
      detail.refetch();
      onRefreshList?.();
    } catch (e) {
      if (showFeedback) {
        proToastError(e, "Mise à jour impossible");
      }
    } finally {
      setIdentityBusy(false);
    }
  }

  // Auto-sauvegarde debouncée des observations / cahier de formulation
  const obsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isObsInitial = useRef(true);
  const [obsAutoSaveStatus, setObsAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (isObsInitial.current) {
      isObsInitial.current = false;
      return;
    }
    if (!clientId || !tenantId) return;

    if (obsSaveTimeoutRef.current) {
      clearTimeout(obsSaveTimeoutRef.current);
    }
    setObsAutoSaveStatus("saving");

    obsSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await apiPatch(`/api/pro/clients/${clientId}?tenantId=${tenantId}`, {
          productObservations: productObservations.trim() || null,
        });
        setObsAutoSaveStatus("saved");
        setTimeout(() => {
          setObsAutoSaveStatus((c) => (c === "saved" ? "idle" : c));
        }, 2000);
      } catch {
        setObsAutoSaveStatus("idle");
      }
    }, 800);

    return () => {
      if (obsSaveTimeoutRef.current) {
        clearTimeout(obsSaveTimeoutRef.current);
      }
    };
  }, [productObservations, clientId, tenantId]);

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
              <InitialAvatar name={c.name} userId={c.userId} className="size-13 text-base shadow-sm shrink-0" />
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
                  <span>{formatPhoneDisplay(c.phone)}</span>
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
                <span className="font-semibold text-muted-foreground">Phototype & Nuance :</span>
                <select
                  value={fitzpatrick}
                  onChange={(e) => setFitzpatrick(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                >
                  <option value="albinos">Albinos (OCA — I africain)</option>
                  <option value="rouquine">Afro-rousse / Rouquine (Phéomélanine)</option>
                  <option value="III">Phototype III (Chabine / Doré très clair)</option>
                  <option value="IV">Phototype IV (Caramel / Métissé)</option>
                  <option value="V">Phototype V (Brun cuivré à chocolat)</option>
                  <option value="VI">Phototype VI (Ébène / Cacao intense)</option>
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
              onClick={() => void saveSkinIdentity(true)}
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
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Synchronisé avec la fiche de consultation cabine et conservé au dossier.
                  </p>
                  {obsAutoSaveStatus === "saving" && (
                    <span className="text-[11px] font-bold text-primary flex items-center gap-1 animate-pulse">
                      <Loader2 className="size-3 animate-spin" /> Auto-sauvegarde…
                    </span>
                  )}
                  {obsAutoSaveStatus === "saved" && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="size-3" /> Enregistré ✓
                    </span>
                  )}
                </div>
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

        {/* ═════════ 5. ORDONNANCE BEAUTÉ & SOINS CABINE HYBRIDE ═════════ */}
        <TabsContent value="prescription" className="mt-4 space-y-5">
          {/* En-tête Ordonnance Officielle */}
          <div className="k-obsidian-luxury p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-[#D49A24]/20 border border-[#D49A24]/40 text-[#F3D98A] shadow-inner shrink-0">
                <Leaf className="size-5" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-heading text-base font-black text-[#FFF9EC]">
                    Ordonnance Dermo-Esthétique &amp; Soins Cabine
                  </h4>
                  <Badge variant="outline" className="border-[#D49A24]/40 bg-[#D49A24]/15 text-[#F3D98A] text-[10px] font-bold">
                    ✨ Connectée App Cliente
                  </Badge>
                </div>
                <p className="text-xs text-[#E6D5B8]/80 mt-0.5">
                  Prescrite pour {c.name} · Visible en temps réel sur son smartphone dans « Dossier peau » et « Soin &amp; rdv »
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {c?.phone && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const msg = buildPrescriptionWhatsAppSummary(c.name, prescriptionData);
                    openWhatsApp(c.phone, msg);
                  }}
                  className="text-xs h-8.5 gap-1.5 bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 border-[#25D366]/40 cursor-pointer font-bold"
                >
                  <MessageCircle className="size-3.5" /> WhatsApp
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={openRenewCureModal}
                className="text-xs h-8.5 gap-1.5 border-[#D49A24]/60 bg-[#D49A24]/15 hover:bg-[#D49A24]/25 text-[#F3D98A] font-bold cursor-pointer"
              >
                <RefreshCw className="size-3.5" />
                <span>Renouveler (Nouvelle Cure)</span>
              </Button>
              <a
                href={`/api/diagnoses/prescription?userId=${encodeURIComponent(c.userId || c.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-md border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-semibold text-[#FFF9EC] transition-colors"
              >
                <FileDown className="size-3.5" /> PDF Officiel
              </a>
              <Button
                size="sm"
                onClick={() => void saveStructuredPrescription()}
                disabled={cosmeticsBusy}
                className="text-xs h-8.5 gap-1.5 k-btn-gold text-[#18120C] font-black shadow-md cursor-pointer"
              >
                <Save className="size-3.5" />
                {cosmeticsBusy ? "Transmission…" : "Transmettre l'Ordonnance"}
              </Button>
            </div>
          </div>

          {/* 🌟 BANDEAU DE SUIVI DE CURE & MOTIF DE TRANSITION */}
          <div className="rounded-2xl border border-gold/30 bg-gold/10 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge className="bg-gold text-[#18120C] font-black text-xs px-2.5 py-1 rounded-lg shadow-xs">
                🟢 Cure Active #{prescriptionData.cureNumber || 1}
              </Badge>
              {prescriptionData.changeReason ? (
                <span className="text-xs text-foreground font-semibold">
                  Motif d&apos;ajustement : <span className="text-gold-text font-black">{prescriptionData.changeReason}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Protocole en cours · Établi le {formatDate(prescriptionData.prescribedAt)}
                </span>
              )}
            </div>
            {prescriptionData.evolutionDelta && (prescriptionData.evolutionDelta.previousScore !== undefined || prescriptionData.evolutionDelta.newScore !== undefined) && (
              <div className="flex items-center gap-2 text-xs bg-card/90 px-3 py-1.5 rounded-xl border border-border shadow-2xs">
                <span className="text-muted-foreground font-medium">Progression score :</span>
                <span className="font-mono font-bold text-muted-foreground">{prescriptionData.evolutionDelta.previousScore ?? "?"}</span>
                <ArrowRight className="size-3 text-gold" />
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                  {prescriptionData.evolutionDelta.newScore ?? "?"} / 100
                </span>
                {prescriptionData.evolutionDelta.previousScore && prescriptionData.evolutionDelta.newScore && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
                    +{prescriptionData.evolutionDelta.newScore - prescriptionData.evolutionDelta.previousScore} pts
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Section 1 : Produits Cosmétiques Prescrits (Domicile) */}
          <Card className="border-border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-amber-500/15 text-amber-500 shrink-0">
                  <ShoppingBag className="size-4.5" />
                </span>
                <div>
                  <h5 className="font-heading text-sm font-bold text-foreground">
                    1. Produits Cosmétiques Prescrits à Domicile
                  </h5>
                  <p className="text-xs text-muted-foreground">
                    Soins matin, soir ou hebdomadaires que la cliente doit appliquer au quotidien
                  </p>
                </div>
              </div>

              {/* Actions d'ajout de produit : depuis le catalogue ou saisie manuelle */}
              <div className="flex items-center gap-2 flex-wrap">
                {instituteProducts.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const prodId = e.target.value;
                      if (!prodId) return;
                      const selected = instituteProducts.find((p: any) => p.id === prodId);
                      if (selected) {
                        const newItem: PrescribedProductItem = {
                          productId: selected.id,
                          name: selected.name,
                          category: selected.category,
                          price: selected.price,
                          moment: "matin_soir",
                          posology: "Appliquer délicatement sur peau propre et légèrement humide",
                          botanicals: selected.botanicals,
                          photoUrl: selected.hasPhoto ? `/api/media/product/${selected.id}` : selected.image,
                        };
                        setPrescriptionData((prev) => ({
                          ...prev,
                          products: [...prev.products, newItem],
                        }));
                        toast.success(`${selected.name} ajouté à l'ordonnance`);
                      }
                      e.target.value = "";
                    }}
                    className="h-8.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold cursor-pointer"
                  >
                    <option value="">+ Choisir dans le catalogue...</option>
                    {instituteProducts.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {xof(p.price)}
                      </option>
                    ))}
                  </select>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const customItem: PrescribedProductItem = {
                      name: "Produit cosmétique sur-mesure",
                      moment: "matin_soir",
                      posology: "Appliquer matin et soir sur peau propre",
                    };
                    setPrescriptionData((prev) => ({ ...prev, products: [...prev.products, customItem] }));
                    toast.info("Nouveau produit manuel ajouté. Vous pouvez modifier le nom, le moment et le prix.");
                  }}
                  className="text-xs h-8.5 gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer font-bold"
                >
                  <Plus className="size-3.5" />
                  <span>Saisie manuelle d'un produit</span>
                </Button>
              </div>
            </div>

            {/* Liste des produits prescrits */}
            {prescriptionData.products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-5 text-center space-y-3">
                <p className="text-xs text-muted-foreground">
                  Aucun produit cosmétique sélectionné dans cette ordonnance.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const fallbackItem: PrescribedProductItem = {
                        name: "Sérum Anti-Taches & Éclat Hibiscus",
                        moment: "matin",
                        posology: "3 gouttes le matin avant le fluide hydratant",
                        price: 15000,
                      };
                      setPrescriptionData((prev) => ({ ...prev, products: [...prev.products, fallbackItem] }));
                    }}
                    className="text-xs h-8 gap-1.5 text-gold-text border-gold/40 font-bold"
                  >
                    <Plus className="size-3" /> Saisie manuelle d'un produit
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {prescriptionData.products.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl border border-border/80 bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold-text font-black text-xs shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrescriptionData((prev) => {
                                const next = [...prev.products];
                                next[idx] = { ...next[idx], name: val };
                                return { ...prev, products: next };
                              });
                            }}
                            className="font-heading font-black text-xs sm:text-sm text-foreground bg-transparent border-b border-border/60 hover:border-border focus:border-gold outline-none flex-1 min-w-[200px] py-0.5"
                            placeholder="Nom du produit cosmétique..."
                          />
                          {item.transitionStatus === "keep" && (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold shrink-0">
                              🟢 Conservé
                            </Badge>
                          )}
                          {item.transitionStatus === "replace" && (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold shrink-0" title={item.transitionNote}>
                              🔄 Remplace {item.replacedProductName || "l'ancien soin"}
                            </Badge>
                          )}
                          {item.transitionStatus === "new" && (
                            <Badge variant="outline" className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 text-[10px] font-bold shrink-0">
                              ✨ Nouveau
                            </Badge>
                          )}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step={500}
                              value={item.price || ""}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 0;
                                setPrescriptionData((prev) => {
                                  const next = [...prev.products];
                                  next[idx] = { ...next[idx], price: val };
                                  return { ...prev, products: next };
                                });
                              }}
                              placeholder="Prix FCFA (opt.)"
                              className="h-7 w-28 rounded-md border border-input bg-background px-2 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums"
                            />
                            <span className="text-[10px] text-muted-foreground font-semibold">FCFA</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-[11px] font-semibold text-muted-foreground">Moment d'application :</span>
                          <select
                            value={item.moment}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setPrescriptionData((prev) => {
                                const next = [...prev.products];
                                next[idx] = { ...next[idx], moment: val };
                                return { ...prev, products: next };
                              });
                            }}
                            className="h-7 rounded-md border border-input bg-background px-2 text-[11px] font-bold cursor-pointer"
                          >
                            <option value="matin">☀️ Matin</option>
                            <option value="soir">🌙 Soir</option>
                            <option value="matin_soir">☀️🌙 Matin &amp; Soir</option>
                            <option value="hebdo">✨ Hebdomadaire (1 à 2x)</option>
                          </select>
                        </div>

                        <div className="pt-0.5">
                          <input
                            type="text"
                            value={item.posology}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrescriptionData((prev) => {
                                const next = [...prev.products];
                                next[idx] = { ...next[idx], posology: val };
                                return { ...prev, products: next };
                              });
                            }}
                            placeholder="Posologie & conseils d'application (ex: 3 gouttes avant la crème)..."
                            className="w-full text-xs text-muted-foreground bg-transparent border-b border-border/40 focus:border-gold outline-none py-0.5"
                          />
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPrescriptionData((prev) => ({
                          ...prev,
                          products: prev.products.filter((_, i) => i !== idx),
                        }));
                      }}
                      className="text-destructive hover:bg-destructive/10 h-7 px-2 shrink-0 self-end md:self-center"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const customItem: PrescribedProductItem = {
                        name: "Autre produit cosmétique",
                        moment: "matin_soir",
                        posology: "Appliquer selon recommandations",
                      };
                      setPrescriptionData((prev) => ({ ...prev, products: [...prev.products, customItem] }));
                    }}
                    className="text-xs h-8 gap-1.5 text-gold-text border-gold/40 font-bold"
                  >
                    <Plus className="size-3.5" /> + Saisie manuelle d'un produit
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Section 2 : Soins Esthétiques Prescrits en Cabine (Cure Institut) */}
          <Card className="border-border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-indigo-500/15 text-indigo-500 shrink-0">
                  <CalendarCheck className="size-4.5" />
                </span>
                <div>
                  <h5 className="font-heading text-sm font-bold text-foreground">
                    2. Soins Esthétiques Prescrits en Cabine (Cure Salon)
                  </h5>
                  <p className="text-xs text-muted-foreground">
                    Séances à réaliser en institut, rythme conseillé et objectifs cutanés ciblés
                  </p>
                </div>
              </div>

              {/* Actions d'ajout de soin cabine : catalogue ou saisie manuelle */}
              <div className="flex items-center gap-2 flex-wrap">
                {instituteServices.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const servId = e.target.value;
                      if (!servId) return;
                      const selected = instituteServices.find((s: any) => s.id === servId);
                      if (selected) {
                        const newCabine: PrescribedCabineServiceItem = {
                          serviceId: selected.id,
                          name: selected.name,
                          category: selected.category,
                          price: selected.price,
                          durationMin: selected.durationMin,
                          frequency: "1 séance toutes les 2 à 3 semaines",
                          sessionsCount: 3,
                          objective: "Purification en profondeur & régénération mélanique",
                          photoUrl: selected.hasPhoto ? `/api/media/service/${selected.id}` : undefined,
                        };
                        setPrescriptionData((prev) => ({
                          ...prev,
                          cabineServices: [...prev.cabineServices, newCabine],
                        }));
                        toast.success(`${selected.name} ajouté aux soins cabine prescrits`);
                      }
                      e.target.value = "";
                    }}
                    className="h-8.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold cursor-pointer"
                  >
                    <option value="">+ Choisir dans le catalogue...</option>
                    {instituteServices.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.durationMin} min) · {xof(s.price)}
                      </option>
                    ))}
                  </select>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const customSoin: PrescribedCabineServiceItem = {
                      name: "Soin Esthétique Cabine Sur-Mesure",
                      frequency: "1 séance toutes les 2 à 3 semaines",
                      sessionsCount: 3,
                      durationMin: 60,
                    };
                    setPrescriptionData((prev) => ({ ...prev, cabineServices: [...prev.cabineServices, customSoin] }));
                    toast.info("Nouveau soin cabine manuel ajouté. Vous pouvez modifier le nom, la durée et le rythme.");
                  }}
                  className="text-xs h-8.5 gap-1.5 border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 cursor-pointer font-bold"
                >
                  <Plus className="size-3.5" />
                  <span>Saisie manuelle d'un soin</span>
                </Button>
              </div>
            </div>

            {/* Liste des soins cabine prescrits */}
            {prescriptionData.cabineServices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-5 text-center space-y-3">
                <p className="text-xs text-muted-foreground">
                  Aucun soin en cabine prescrit dans cette ordonnance.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const fallbackSoin: PrescribedCabineServiceItem = {
                        name: "Soin Cabine Dermo-Purifiant & Hydratation Profonde",
                        frequency: "1 séance / mois",
                        sessionsCount: 1,
                        durationMin: 60,
                        price: 25000,
                      };
                      setPrescriptionData((prev) => ({ ...prev, cabineServices: [...prev.cabineServices, fallbackSoin] }));
                    }}
                    className="text-xs h-8 gap-1.5 text-indigo-400 border-indigo-500/40 font-bold"
                  >
                    <Plus className="size-3" /> Saisie manuelle d'un soin cabine
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {prescriptionData.cabineServices.map((srv, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl border border-indigo-500/25 bg-indigo-500/5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="grid size-9 place-items-center rounded-xl bg-indigo-500/20 text-indigo-400 font-black text-xs shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={srv.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrescriptionData((prev) => {
                                const next = [...prev.cabineServices];
                                next[idx] = { ...next[idx], name: val };
                                return { ...prev, cabineServices: next };
                              });
                            }}
                            className="font-heading font-black text-xs sm:text-sm text-foreground bg-transparent border-b border-border/60 hover:border-border focus:border-indigo-400 outline-none flex-1 min-w-[200px] py-0.5"
                            placeholder="Nom du soin en cabine..."
                          />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground font-semibold">Durée :</span>
                            <input
                              type="number"
                              min={10}
                              max={240}
                              step={5}
                              value={srv.durationMin || ""}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 60;
                                setPrescriptionData((prev) => {
                                  const next = [...prev.cabineServices];
                                  next[idx] = { ...next[idx], durationMin: val };
                                  return { ...prev, cabineServices: next };
                                });
                              }}
                              className="h-7 w-16 rounded-md border border-input bg-background px-2 text-[11px] font-bold text-center"
                              placeholder="60"
                            />
                            <span className="text-[10px] text-muted-foreground">min</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={srv.price || ""}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 0;
                                setPrescriptionData((prev) => {
                                  const next = [...prev.cabineServices];
                                  next[idx] = { ...next[idx], price: val };
                                  return { ...prev, cabineServices: next };
                                });
                              }}
                              placeholder="Prix (opt.)"
                              className="h-7 w-24 rounded-md border border-input bg-background px-2 text-[11px] font-bold text-indigo-400 tabular-nums"
                            />
                            <span className="text-[10px] text-muted-foreground font-semibold">FCFA</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-muted-foreground">Rythme conseillé :</span>
                            <input
                              type="text"
                              value={srv.frequency}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPrescriptionData((prev) => {
                                  const next = [...prev.cabineServices];
                                  next[idx] = { ...next[idx], frequency: val };
                                  return { ...prev, cabineServices: next };
                                });
                              }}
                              placeholder="ex: 1 séance toutes les 2 semaines"
                              className="h-7 rounded-md border border-input bg-background px-2 text-[11px] font-bold"
                            />
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-muted-foreground">Cure de :</span>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={srv.sessionsCount || 1}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 1;
                                setPrescriptionData((prev) => {
                                  const next = [...prev.cabineServices];
                                  next[idx] = { ...next[idx], sessionsCount: val };
                                  return { ...prev, cabineServices: next };
                                });
                              }}
                              className="h-7 w-14 rounded-md border border-input bg-background px-2 text-[11px] font-bold text-center"
                            />
                            <span className="text-[11px] text-muted-foreground">séance(s)</span>
                          </div>
                        </div>

                        <div className="pt-0.5">
                          <input
                            type="text"
                            value={srv.objective || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrescriptionData((prev) => {
                                const next = [...prev.cabineServices];
                                next[idx] = { ...next[idx], objective: val };
                                return { ...prev, cabineServices: next };
                              });
                            }}
                            placeholder="Objectif du soin cabine (ex: Désincrustation douce et élimination comédons)..."
                            className="w-full text-xs text-muted-foreground bg-transparent border-b border-border/40 focus:border-indigo-400 outline-none py-0.5"
                          />
                        </div>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPrescriptionData((prev) => ({
                          ...prev,
                          cabineServices: prev.cabineServices.filter((_, i) => i !== idx),
                        }));
                      }}
                      className="text-destructive hover:bg-destructive/10 h-7 px-2 shrink-0 self-end md:self-center"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const customSoin: PrescribedCabineServiceItem = {
                        name: "Autre soin en cabine",
                        frequency: "1 séance par mois",
                        sessionsCount: 3,
                        durationMin: 60,
                      };
                      setPrescriptionData((prev) => ({ ...prev, cabineServices: [...prev.cabineServices, customSoin] }));
                    }}
                    className="text-xs h-8 gap-1.5 text-indigo-400 border-indigo-500/40 font-bold"
                  >
                    <Plus className="size-3.5" /> + Saisie manuelle d'un soin
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Section 3 : Consignes & Vigilance de la Dermo-Conseillère */}
          <Card className="border-border bg-card p-4 sm:p-5 space-y-3">
            <h5 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="size-4 text-emerald-500" />
              <span>3. Recommandations Particulières &amp; Vigilance</span>
            </h5>
            <Textarea
              rows={3}
              value={prescriptionData.notes || ""}
              onChange={(e) => setPrescriptionData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Conseils de la praticienne (ex : Éviter l'exposition directe au soleil entre 12h et 16h, appliquer l'huile de Balanites uniquement le soir sur peau humide)..."
              className="text-xs leading-relaxed font-sans bg-background/80"
            />
          </Card>

          {/* Section 4 : Historique des Cures & Anciennes Ordonnances */}
          {prescriptionData.history && prescriptionData.history.length > 0 && (
            <Card className="border-border bg-card p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 shrink-0">
                    <History className="size-4.5" />
                  </span>
                  <div>
                    <h5 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                      <span>4. Historique des Cures &amp; Anciennes Ordonnances</span>
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 text-[10px] font-bold">
                        {prescriptionData.history.length} version{prescriptionData.history.length > 1 ? "s" : ""} archivée{prescriptionData.history.length > 1 ? "s" : ""}
                      </Badge>
                    </h5>
                    <p className="text-xs text-muted-foreground">
                      Traçabilité dermo-cosmétique complète : chaque protocole précédent est conservé tel quel
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {prescriptionData.history.map((past, pIdx) => (
                  <div
                    key={past.id || pIdx}
                    className="p-3.5 rounded-2xl border border-border/70 bg-muted/20 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-muted-foreground/30 bg-muted text-foreground text-xs font-black">
                          Cure #{past.cureNumber}
                        </Badge>
                        <span className="text-xs font-semibold text-muted-foreground">
                          Prescrite le {formatDate(past.prescribedAt)} {past.archivedAt ? `· Clôturée le ${formatDate(past.archivedAt)}` : ""}
                        </span>
                      </div>
                      {past.changeReason && (
                        <Badge variant="outline" className="bg-gold/10 text-gold-text border-gold/30 text-[11px] font-bold">
                          Motif : {past.changeReason}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                      <div className="rounded-xl bg-background/60 p-2.5 border border-border/50">
                        <p className="font-bold text-foreground text-[11px] mb-1.5 flex items-center gap-1.5">
                          <ShoppingBag className="size-3.5 text-amber-500" />
                          <span>Produits de la cure ({past.products?.length || 0})</span>
                        </p>
                        <ul className="space-y-1">
                          {(past.products || []).map((p, idx) => (
                            <li key={idx} className="text-muted-foreground flex items-center justify-between text-[11px]">
                              <span className="truncate">• {p.name}</span>
                              <span className="shrink-0 text-[10px] font-mono text-muted-foreground/70">{p.moment}</span>
                            </li>
                          ))}
                          {(!past.products || past.products.length === 0) && (
                            <li className="text-muted-foreground italic text-[11px]">Aucun produit cosmétique</li>
                          )}
                        </ul>
                      </div>

                      <div className="rounded-xl bg-background/60 p-2.5 border border-border/50">
                        <p className="font-bold text-foreground text-[11px] mb-1.5 flex items-center gap-1.5">
                          <Sparkles className="size-3.5 text-indigo-500" />
                          <span>Soins cabine de la cure ({past.cabineServices?.length || 0})</span>
                        </p>
                        <ul className="space-y-1">
                          {(past.cabineServices || []).map((s, idx) => (
                            <li key={idx} className="text-muted-foreground flex items-center justify-between text-[11px]">
                              <span className="truncate">• {s.name}</span>
                              <span className="shrink-0 text-[10px] font-mono text-muted-foreground/70">{s.frequency}</span>
                            </li>
                          ))}
                          {(!past.cabineServices || past.cabineServices.length === 0) && (
                            <li className="text-muted-foreground italic text-[11px]">Aucun soin cabine</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ═════════ MODAL DE TRANSITION : RENOUVELER VERS UNE NOUVELLE CURE ═════════ */}
      <Dialog open={isRenewModalOpen} onOpenChange={setIsRenewModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto pretty-scroll p-5 sm:p-6 space-y-4">
          <DialogHeader className="space-y-1.5 text-left border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-gold/15 text-gold-text">
                <RefreshCw className="size-4 animate-spin-reverse" />
              </span>
              <DialogTitle className="font-heading text-lg font-black text-foreground">
                Évolution de l&apos;Ordonnance · Nouvelle Cure #{(prescriptionData.cureNumber || 1) + 1}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              L&apos;ordonnance active actuelle (Cure #{prescriptionData.cureNumber || 1}) sera automatiquement archivée dans l&apos;historique sans jamais être écrasée. Indiquez le sort de chaque soin actuel pour guider la cliente.
            </DialogDescription>
          </DialogHeader>

          {/* Étape 1 : Motif de l'évolution */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground">
              1. Pourquoi le protocole évolue-t-il aujourd&apos;hui ?
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Bilan de contrôle à S+3",
                "Changement de saison (Harmattan / Saison sèche)",
                "Changement de saison (Humidité / Saison des pluies)",
                "Objectif atteint (Passage en entretien)",
                "Grossesse / Maternité",
                "Sensibilité / Réaction cutanée",
                "custom",
              ].map((reasonKey) => {
                const label = reasonKey === "custom" ? "✏️ Autre motif..." : reasonKey;
                const isSelected = renewReason === reasonKey;
                return (
                  <button
                    key={reasonKey}
                    type="button"
                    onClick={() => setRenewReason(reasonKey)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer",
                      isSelected
                        ? "bg-gold text-[#18120C] border-gold font-bold shadow-xs"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {renewReason === "custom" && (
              <Input
                type="text"
                placeholder="Précisez le motif d'évolution de la routine..."
                value={customRenewReason}
                onChange={(e) => setCustomRenewReason(e.target.value)}
                className="h-8 text-xs mt-1.5"
              />
            )}
          </div>

          {/* Étape 2 : Évolution du score vitalité */}
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-bold text-foreground">
              2. Évolution constatée de la vitalité cutanée :
            </span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Score précédent :</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={renewPrevScore}
                onChange={(e) => setRenewPrevScore(Number(e.target.value))}
                className="h-7 w-16 text-xs text-center font-bold"
              />
              <ArrowRight className="size-3.5 text-gold" />
              <span className="text-muted-foreground">Nouveau score :</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={renewNextScore}
                onChange={(e) => setRenewNextScore(Number(e.target.value))}
                className="h-7 w-16 text-xs text-center font-bold text-emerald-600 dark:text-emerald-400"
              />
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {renewNextScore > renewPrevScore ? `(+${renewNextScore - renewPrevScore} pts)` : ""}
              </span>
            </div>
          </div>

          {/* Étape 3 : Transition des produits existants */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground">
                3. Que devient chaque soin de l&apos;ancienne ordonnance ?
              </label>
              <span className="text-[11px] text-muted-foreground">
                {transitionProducts.length} produit{transitionProducts.length > 1 ? "s" : ""} à statuer
              </span>
            </div>

            {transitionProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic border border-dashed rounded-xl p-3 text-center">
                Aucun produit dans l&apos;ordonnance précédente. Vous pourrez en ajouter directement.
              </p>
            ) : (
              <div className="space-y-2.5">
                {transitionProducts.map((item, idx) => {
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-xl border p-3 space-y-2 transition-colors",
                        item.action === "keep"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : item.action === "replace"
                          ? "border-amber-500/40 bg-amber-500/5"
                          : "border-rose-500/30 bg-rose-500/5 opacity-70"
                      )}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-xs text-foreground">{item.original.name}</p>
                          <p className="text-[11px] text-muted-foreground">{item.original.posology} · ({item.original.moment})</p>
                        </div>

                        {/* Sélecteur d'action en 3 boutons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...transitionProducts];
                              next[idx] = { ...next[idx], action: "keep" };
                              setTransitionProducts(next);
                            }}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer",
                              item.action === "keep"
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                : "bg-background text-muted-foreground border-border hover:bg-muted"
                            )}
                          >
                            <CheckCircle className="size-3" />
                            <span>Conserver</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const next = [...transitionProducts];
                              next[idx] = { ...next[idx], action: "replace" };
                              setTransitionProducts(next);
                            }}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer",
                              item.action === "replace"
                                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                : "bg-background text-muted-foreground border-border hover:bg-muted"
                            )}
                          >
                            <RefreshCw className="size-3" />
                            <span>Remplacer</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const next = [...transitionProducts];
                              next[idx] = { ...next[idx], action: "stop" };
                              setTransitionProducts(next);
                            }}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer",
                              item.action === "stop"
                                ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                : "bg-background text-muted-foreground border-border hover:bg-muted"
                            )}
                          >
                            <XCircle className="size-3" />
                            <span>Arrêter</span>
                          </button>
                        </div>
                      </div>

                      {/* Si action === 'replace', champ pour choisir le remplaçant */}
                      {item.action === "replace" && (
                        <div className="rounded-lg bg-background p-2.5 border border-amber-500/30 space-y-2 mt-2">
                          <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            Choisir le nouveau soin remplaçant :
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {instituteProducts.length > 0 && (
                              <SearchableSelect
                                options={instituteProducts.map((p: any) => ({
                                  value: p.id,
                                  label: p.name,
                                  subLabel: xof(p.price),
                                }))}
                                value={item.replacementProductId || ""}
                                onValueChange={(prodId) => {
                                  if (!prodId) return;
                                  const sel = instituteProducts.find((p: any) => p.id === prodId);
                                  if (sel) {
                                    const next = [...transitionProducts];
                                    next[idx] = {
                                      ...next[idx],
                                      replacementProductId: sel.id,
                                      replacementName: sel.name,
                                      replacementCategory: sel.category,
                                      replacementPrice: sel.price,
                                      replacementPhotoUrl: sel.hasPhoto ? `/api/media/product/${sel.id}` : sel.image,
                                    };
                                    setTransitionProducts(next);
                                  }
                                }}
                                placeholder="Saisir ou choisir dans le catalogue…"
                                searchPlaceholder="Rechercher un soin par nom…"
                                emptyMessage="Aucun produit trouvé"
                                size="sm"
                              />
                            )}
                            <Input
                              type="text"
                              placeholder="Ou saisir le nom du soin remplaçant..."
                              value={item.replacementName || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const next = [...transitionProducts];
                                next[idx] = { ...next[idx], replacementName: val };
                                setTransitionProducts(next);
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                          <Input
                            type="text"
                            placeholder="Motif de remplacement (ex : imperfections résorbées, passage à l'éclat)..."
                            value={item.note || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              const next = [...transitionProducts];
                              next[idx] = { ...next[idx], note: val };
                              setTransitionProducts(next);
                            }}
                            className="h-7 text-xs bg-muted/40"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 pt-3 flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRenewModalOpen(false)}
              className="text-xs h-9 cursor-pointer"
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmNewCure}
              className="text-xs h-9 k-btn-gold text-[#18120C] font-black gap-1.5 shadow-md cursor-pointer"
            >
              <Check className="size-4" />
              <span>Activer la Cure #{(prescriptionData.cureNumber || 1) + 1} &amp; Transmettre</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
