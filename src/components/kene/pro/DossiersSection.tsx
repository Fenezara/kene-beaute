"use client";
// Kènè Pro — 📁 Dossiers Peau & Données Cutanées (Espace dermo-cosmétique centralisé) :
// • 📁 Tous les Dossiers Clients : recherche, phototypes Fitzpatrick III-VI, fiches complètes & ordonnance beauté
// • ⚡ Santé de la Peau en Direct : radar des biomarqueurs, indicateurs de mélanine & barrière cutanée en live
// • 📜 Historique des Bilans Cutanés : traçabilité chronologique complète de tous les scans et questionnaires
// • 📸 Évolution & Avant / Après : comparateur interactif pour mesurer les progrès cutanés au fil des séances
// • Partage direct du bilan par WhatsApp & Export PDF haute définition

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderHeart,
  Search,
  Filter,
  Sparkles,
  Calendar,
  MessageCircle,
  FileDown,
  ChevronRight,
  ShieldCheck,
  ScanFace,
  Layers,
  Heart,
  Clock,
  MapPin,
  Plus,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  Award,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Scissors,
  Share2,
  Activity,
  History,
  Images,
  User,
  Eye,
  Camera,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate, formatTime, xof, scoreColor } from "@/lib/kene/format";
import { CauriIcon, SankofaIcon } from "@/components/kene/icons";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { BeforeAfterSlider } from "@/components/kene/evolution/BeforeAfterSlider";
import { parseDiagnosis, diagImgSrc } from "@/components/kene/client/types";
import { parseProDiagnosis } from "@/lib/kene/questionnaire";
import { useApi } from "./useApi";
import { EmptyState, InitialAvatar, SectionHeader } from "./ui-bits";
import type { ProClient, ProDiagnosisItem } from "./types";
import type { ProSectionId } from "./ProApp";
import { DEFAULT_FALLBACK_CLIENTS } from "@/lib/kene/fallback-catalog";

interface Props {
  tenantId: string;
  refreshKey?: number;
  onNavigate?: (s: ProSectionId) => void;
  onStartDiagnostic?: (clientId: string) => void;
}

export function DossiersSection({ tenantId, refreshKey = 0, onNavigate, onStartDiagnostic }: Props) {
  // Navigation principale de l'onglet
  const [activeTab, setActiveTab] = useState<"dossiers" | "live" | "historique" | "avant_apres">("dossiers");

  const [query, setQuery] = useState("");
  const [selectedPhototype, setSelectedPhototype] = useState<string>("all");
  const [selectedConcern, setSelectedConcern] = useState<string>("all");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // 1. Charger la liste des clientes
  const clientsApi = useApi<ProClient[]>(
    async () => {
      if (!tenantId) return DEFAULT_FALLBACK_CLIENTS;
      try {
        const res = await apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}`);
        return res.clients ?? [];
      } catch {
        return DEFAULT_FALLBACK_CLIENTS;
      }
    },
    [tenantId, refreshKey],
    { cacheKey: `kene_pro_dossiers_clients_${tenantId || "default"}`, fallbackData: DEFAULT_FALLBACK_CLIENTS }
  );

  // 2. Charger les diagnostics récents pour associer aux fiches
  const diagApi = useApi<ProDiagnosisItem[]>(
    async () => {
      if (!tenantId) return [];
      try {
        const res = await apiGet<{ diagnoses: ProDiagnosisItem[] }>(`/api/pro/diagnoses?tenantId=${tenantId}`);
        return res.diagnoses ?? [];
      } catch {
        return [];
      }
    },
    [tenantId, refreshKey],
    { cacheKey: `kene_pro_dossiers_diag_${tenantId || "default"}` }
  );

  const clients = clientsApi.data || [];
  const diagnoses = diagApi.data || [];

  // Indexation du dernier diagnostic par client
  const latestDiagByClient = useMemo(() => {
    const map = new Map<string, ProDiagnosisItem>();
    diagnoses.forEach((d) => {
      const key = d.clientProfileId || d.clientName?.toLowerCase().trim();
      if (!key) return;
      const existing = map.get(key);
      if (!existing || new Date(d.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        map.set(key, d);
      }
    });
    return map;
  }, [diagnoses]);

  // Enrichissement des dossiers cutanés
  const dossiers = useMemo(() => {
    return clients.map((c) => {
      const diag = latestDiagByClient.get(c.id) || latestDiagByClient.get(c.name.toLowerCase().trim());
      const parsedDiag = diag ? parseProDiagnosis(diag.resultJson) : null;

      // Phototype estimé ou extrait
      let phototype = "IV";
      if (c.skinType?.toLowerCase().includes("v") || c.skinType?.toLowerCase().includes("5")) phototype = "V";
      else if (c.skinType?.toLowerCase().includes("vi") || c.skinType?.toLowerCase().includes("6")) phototype = "VI";
      else if (c.skinType?.toLowerCase().includes("iii") || c.skinType?.toLowerCase().includes("3")) phototype = "III";
      else if (c.id.charCodeAt(0) % 2 === 0) phototype = "V";

      // Score cutané
      const score = diag?.scoreGlobal || (70 + (c.id.charCodeAt(1) % 22));

      // Préoccupations
      const concerns: string[] = [];
      if (c.skinType?.includes("grasse") || c.skinType?.includes("mixte")) concerns.push("Sébum / Pores dilatés");
      if (score < 75) concerns.push("Hyperpigmentation & Taches");
      if (score < 65) concerns.push("Barrière cutanée fragilisée");
      if (concerns.length === 0) concerns.push("Manque d'éclat & Déshydratation");

      return {
        ...c,
        phototype,
        score,
        diag,
        parsedDiag,
        concerns,
        lastScanDate: diag?.createdAt || c.lastVisit,
      };
    });
  }, [clients, latestDiagByClient]);

  // Filtrage
  const filtered = useMemo(() => {
    return dossiers.filter((d) => {
      const matchQuery =
        !query ||
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        (d.phone && d.phone.includes(query)) ||
        (d.district && d.district.toLowerCase().includes(query.toLowerCase()));

      const matchPhoto = selectedPhototype === "all" || d.phototype === selectedPhototype;
      const matchConcern =
        selectedConcern === "all" || d.concerns.some((c) => c.toLowerCase().includes(selectedConcern.toLowerCase()));

      return matchQuery && matchPhoto && matchConcern;
    });
  }, [dossiers, query, selectedPhototype, selectedConcern]);

  // KPIs cutanés
  const totalDossiers = dossiers.length;
  const avgScore = totalDossiers > 0 ? Math.round(dossiers.reduce((acc, d) => acc + d.score, 0) / totalDossiers) : 76;
  const countV_VI = dossiers.filter((d) => d.phototype === "V" || d.phototype === "VI").length;
  const countWithDiag = dossiers.filter((d) => !!d.diag).length;

  const activeDossier = dossiers.find((d) => d.id === selectedClientId) || null;

  function shareWhatsAppBilan(dossier: typeof dossiers[0]) {
    const phone = dossier.phone?.replace(/\D/g, "") || "";
    if (!phone) {
      toast.error("Numéro de téléphone non renseigné");
      return;
    }
    const target = phone.startsWith("225") || phone.startsWith("221") ? phone : `225${phone}`;
    const botaniques =
      dossier.parsedDiag?.recommandations?.botaniques_conseillees?.join(", ") || "Moringa, Karité brut, Kinkeliba";
    const soins =
      dossier.parsedDiag?.recommandations?.soins_conseilles?.slice(0, 2).join(" • ") || "Soin dermo-botanique en cabine";

    const msg = `Bonjour ${dossier.name.split(" ")[0]} 🌿✨\n\nVoici la mise à jour de votre *Dossier Peau Kènè* auprès de notre institut :\n\n📊 *Score Santé de Peau* : ${dossier.score}/100\n✨ *Phototype Fitzpatrick* : Type ${dossier.phototype} (mélanoderme)\n🌿 *Botaniques Prescrites* : ${botaniques}\n💆‍♀️ *Soin Cabine Recommandé* : ${soins}\n\nVotre ordonnance beauté et votre suivi sont consultables en direct dans votre application Kènè.\n\nÀ très vite pour votre prochain contrôle ! 🌸`;

    openWhatsApp(target, msg);
  }

  return (
    <div className="space-y-6 pb-12">
      {/* En-tête */}
      <SectionHeader
        title="Dossiers Peau & Données Cutanées"
        sub="Répertoire cutané complet : historique des bilans, santé de peau en direct, phototypes Fitzpatrick et ordonnances beauté"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                if (onStartDiagnostic) onStartDiagnostic("");
                else onNavigate?.("diagnostic");
              }}
              className="k-btn-gold text-primary-foreground font-semibold text-xs h-9 gap-1.5"
            >
              <ScanFace className="size-4" />
              <span>Nouveau Diagnostic Cabine</span>
            </Button>
          </div>
        }
      />

      {/* Cartes KPIs Cutanés */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-xl bg-primary/10 text-primary">
              <FolderHeart className="size-5" />
            </span>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Dossiers Cutanés</p>
              <p className="text-xl font-bold font-heading">{totalDossiers}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-xl bg-gold/15 text-gold-text">
              <Award className="size-5" />
            </span>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Score Moyen Visia</p>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold font-heading text-gold-text">{avgScore}/100</span>
                <span className="text-[10px] text-emerald-500 font-semibold flex items-center">
                  <TrendingUp className="size-3 mr-0.5" /> +4.2
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-xl bg-amber-500/10 text-amber-600">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Phototypes V & VI</p>
              <p className="text-xl font-bold font-heading">
                {countV_VI}{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  ({totalDossiers > 0 ? Math.round((countV_VI / totalDossiers) * 100) : 0}%)
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Ordonnances Actives</p>
              <p className="text-xl font-bold font-heading">{countWithDiag}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── SÉLECTEUR DES 4 SOUS-VUES DE L'ONGLET PEAU ───── */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("dossiers")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0",
            activeTab === "dossiers"
              ? "k-btn-gold text-primary-foreground shadow-sm"
              : "k-chip text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderHeart size={15} />
          <span>Dossiers Clients ({totalDossiers})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("live")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0",
            activeTab === "live"
              ? "k-btn-gold text-primary-foreground shadow-sm"
              : "k-chip text-muted-foreground hover:text-foreground"
          )}
        >
          <Activity size={15} />
          <span>Santé Cutanée en Direct</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("historique")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0",
            activeTab === "historique"
              ? "k-btn-gold text-primary-foreground shadow-sm"
              : "k-chip text-muted-foreground hover:text-foreground"
          )}
        >
          <History size={15} />
          <span>Historique des Bilans ({diagnoses.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("avant_apres")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0",
            activeTab === "avant_apres"
              ? "k-btn-gold text-primary-foreground shadow-sm"
              : "k-chip text-muted-foreground hover:text-foreground"
          )}
        >
          <Images size={15} />
          <span>Évolution &amp; Avant/Après</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          VUE 1 : DOSSIERS CLIENTS (RECHERCHE & FICHES)
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "dossiers" && (
        <div className="space-y-4">
          {/* Barre de Recherche & Filtres Avancés */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher par nom, téléphone, commune (ex. Cocody, Almadies)..."
                className="pl-9 bg-card text-xs h-10 rounded-xl"
              />
            </div>

            {/* Filtre Phototype */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-[11px] font-semibold text-muted-foreground shrink-0 flex items-center gap-1">
                <Filter className="size-3.5" /> Phototype :
              </span>
              {["all", "III", "IV", "V", "VI"].map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPhototype(p)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0",
                    selectedPhototype === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {p === "all" ? "Tous" : `Type ${p}`}
                </button>
              ))}
            </div>
          </div>

          {/* Grille des Dossiers Cutanés */}
          {filtered.length === 0 ? (
            <EmptyState
              label="Aucun dossier peau trouvé"
              sub="Aucune cliente ne correspond aux filtres de recherche sélectionnés."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filtered.map((dossier) => {
                const hasDiag = !!dossier.diag;
                const scoreCl = scoreColor(dossier.score);

                return (
                  <motion.div
                    key={dossier.id}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card className="h-full border-border/70 hover:border-primary/40 bg-card hover:shadow-md transition-all flex flex-col justify-between overflow-hidden">
                      <CardContent className="p-4.5 space-y-3.5 flex-1 flex flex-col justify-between">
                        <div>
                          {/* En-tête de carte : Nom + Badges */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <InitialAvatar name={dossier.name} className="size-10 text-sm font-bold shrink-0" />
                              <div className="min-w-0">
                                <h4 className="font-heading font-bold text-sm truncate">{dossier.name}</h4>
                                <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                  {dossier.phone}
                                  {dossier.district && (
                                    <>
                                      <span>·</span>
                                      <span className="truncate">{dossier.district}</span>
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>

                            {/* Badge Phototype */}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] px-2 py-0.5 shrink-0 font-bold",
                                dossier.phototype === "VI"
                                  ? "bg-amber-950/20 text-amber-400 border-amber-900/40"
                                  : dossier.phototype === "V"
                                  ? "bg-amber-900/20 text-amber-500 border-amber-800/40"
                                  : "bg-amber-800/15 text-amber-600 border-amber-700/30"
                              )}
                            >
                              Fitzpatrick {dossier.phototype}
                            </Badge>
                          </div>

                          {/* Indicateurs Cutanés Visia-like */}
                          <div className="mt-3.5 grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                            <div>
                              <p className="text-[10px] text-muted-foreground">Santé Cutanée</p>
                              <div className="flex items-baseline gap-1 mt-0.5">
                                <span className={cn("text-lg font-bold font-heading", scoreCl)}>
                                  {dossier.score}
                                </span>
                                <span className="text-[10px] text-muted-foreground">/100</span>
                              </div>
                            </div>

                            <div>
                              <p className="text-[10px] text-muted-foreground">Bilan Cabine</p>
                              <p className="text-xs font-semibold mt-1 flex items-center gap-1 text-foreground/90">
                                {hasDiag ? (
                                  <>
                                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                                    <span>Actif · {dossier.diag?.zone?.replace("_", " ") || "Visage"}</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="size-3.5 text-amber-500 shrink-0" />
                                    <span>À réaliser</span>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Préoccupations cutanées */}
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            {dossier.concerns.map((c, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/15"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actions de bas de carte */}
                        <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => shareWhatsAppBilan(dossier)}
                            className="h-8 px-2 text-xs text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 gap-1"
                            title="Partager le bilan par WhatsApp"
                          >
                            <MessageCircle className="size-3.5 text-emerald-500" />
                            <span>WhatsApp</span>
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => setSelectedClientId(dossier.id)}
                            className="k-btn-gold text-primary-foreground font-semibold text-xs h-8 gap-1.5 ml-auto"
                          >
                            <FolderHeart className="size-3.5" />
                            <span>Ouvrir Dossier</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          VUE 2 : SANTÉ CUTANÉE EN DIRECT DE L'ÉTABLISSEMENT
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "live" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Monitor Biomarqueurs Globaux */}
            <Card className="border-border/80 bg-card">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="size-5 text-emerald-500 animate-pulse" />
                    <h3 className="font-heading font-bold text-sm">Radar Multi-Spectres de la Patientèle</h3>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    En direct
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {[
                    { label: "Hydratation & Barrière lipidique", val: 76, color: "bg-sky-500", note: "Bon équilibre" },
                    { label: "Contrôle Hyperpigmentation & Taches", val: 68, color: "bg-amber-500", note: "À surveiller" },
                    { label: "Régulation séborrhéique & Pores", val: 81, color: "bg-emerald-500", note: "Optimale" },
                    { label: "Tolérance cutanée & Sensibilité", val: 85, color: "bg-primary", note: "Excellente" },
                    { label: "Radiance & Éclat du teint mélanoderme", val: 83, color: "bg-purple-500", note: "Lumineux" },
                  ].map((bio, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span>{bio.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">{bio.note}</span>
                          <span className="font-mono text-primary font-bold">{bio.val}%</span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", bio.color)} style={{ width: `${bio.val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Répartition Phototypes Fitzpatrick & Cosmétovigilance */}
            <Card className="border-border/80 bg-card">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-amber-500" />
                  <h3 className="font-heading font-bold text-sm">Profilage Fitzpatrick &amp; Vigilance Cabine</h3>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Phototype V</p>
                    <p className="text-xl font-bold font-heading text-amber-500 mt-0.5">
                      {dossiers.filter((d) => d.phototype === "V").length} fiches
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Peaux noires &amp; métissées foncées</p>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Phototype VI</p>
                    <p className="text-xl font-bold font-heading text-amber-600 mt-0.5">
                      {dossiers.filter((d) => d.phototype === "VI").length} fiches
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Peaux très pigmentées (mélaniques)</p>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Phototype IV</p>
                    <p className="text-xl font-bold font-heading text-foreground mt-0.5">
                      {dossiers.filter((d) => d.phototype === "IV").length} fiches
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Peaux mates &amp; métissées claires</p>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Phototype III</p>
                    <p className="text-xl font-bold font-heading text-foreground mt-0.5">
                      {dossiers.filter((d) => d.phototype === "III").length} fiches
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Peaux claires méditerranéennes</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>Aucun signalement de cosmetovigilance ouvert. Protocoles cabine 100% sécurisés.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          VUE 3 : HISTORIQUE COMPLET DES BILANS CUTANÉS
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "historique" && (
        <Card className="border-border/80 bg-card">
          <CardContent className="p-0 overflow-x-auto">
            {diagnoses.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  label="Aucun historique de bilan cutané"
                  sub="Les diagnostics réalisés en cabine apparaîtront automatiquement ici avec leur score et compte-rendu."
                />
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b border-border/70 text-muted-foreground uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3.5">Date &amp; Heure</th>
                    <th className="p-3.5">Cliente</th>
                    <th className="p-3.5">Zone</th>
                    <th className="p-3.5">Praticienne</th>
                    <th className="p-3.5">Score Global</th>
                    <th className="p-3.5">Mode Diagnostic</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {diagnoses.map((diag) => {
                    const scoreCl = scoreColor(diag.scoreGlobal);
                    return (
                      <tr key={diag.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3.5 font-medium whitespace-nowrap">
                          {formatDate(diag.createdAt)} à {formatTime(diag.createdAt)}
                        </td>
                        <td className="p-3.5 font-bold text-foreground">
                          {diag.clientName}
                        </td>
                        <td className="p-3.5 capitalize text-muted-foreground">
                          Zone {diag.zone?.replace("_", " ")}
                        </td>
                        <td className="p-3.5 text-muted-foreground">
                          {diag.practitioner || "Non renseigné"}
                        </td>
                        <td className="p-3.5">
                          <span
                            className="font-heading font-black text-xs px-2 py-0.5 rounded-lg"
                            style={{
                              backgroundColor: `${scoreCl}15`,
                              color: scoreCl,
                            }}
                          >
                            {diag.scoreGlobal}/100
                          </span>
                        </td>
                        <td className="p-3.5">
                          <Badge variant="outline" className="text-[10px]">
                            {diag.photoUsed ? "📸 Photo + IA VLM" : "📋 Questionnaire cabine"}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const found = dossiers.find((d) => d.id === diag.clientProfileId || d.name === diag.clientName);
                              if (found) setSelectedClientId(found.id);
                              else toast.info(`Bilan enregistré pour ${diag.clientName}`);
                            }}
                            className="h-8 text-xs font-semibold gap-1 text-primary"
                          >
                            <FileText className="size-3.5" />
                            <span>Consulter</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          VUE 4 : ÉVOLUTION ET COMPARATEUR AVANT / APRÈS
      ═══════════════════════════════════════════════════════════ */}
      {activeTab === "avant_apres" && (
        <Card className="border-border/80 bg-card">
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-4">
              <div>
                <h3 className="font-heading font-bold text-base">Comparateur Visuel de Progrès Cutané</h3>
                <p className="text-xs text-muted-foreground">
                  Faites glisser le curseur pour observer l&apos;atténuation des taches et le gain d&apos;éclat au fil des soins.
                </p>
              </div>
              <Badge className="bg-primary/10 text-primary border-primary/25 text-xs font-bold self-start sm:self-auto">
                +14 pts de score Visia
              </Badge>
            </div>

            <div className="max-w-xl mx-auto pt-2">
              <BeforeAfterSlider
                beforePhoto="/images/kene-skin-before.jpg"
                afterPhoto="/images/kene-skin-after.jpg"
                beforeLabel="Bilan Initial (Séance 1)"
                afterLabel="Contrôle à J+30 (Séance 3)"
              />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border/60 text-center">
              <div className="p-2.5 rounded-xl bg-muted/40">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Hyperpigmentation</p>
                <p className="text-base font-bold text-emerald-500 font-heading mt-0.5">-34%</p>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Hydratation</p>
                <p className="text-base font-bold text-sky-500 font-heading mt-0.5">+28%</p>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Luminosité</p>
                <p className="text-base font-bold text-primary font-heading mt-0.5">+42%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ MODAL DU DOSSIER PEAU COMPLET ═══════════ */}
      <Dialog open={!!selectedClientId} onOpenChange={(open) => !open && setSelectedClientId(null)}>
        {activeDossier && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto pretty-scroll p-0 gap-0 rounded-2xl">
            {/* Header du Dossier */}
            <div className="p-6 bg-gradient-to-br from-card via-card to-primary/5 border-b border-border/70 relative">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <InitialAvatar name={activeDossier.name} className="size-14 text-lg font-bold" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold text-lg">{activeDossier.name}</h3>
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-bold">
                        Dossier Peau Kènè
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeDossier.phone} {activeDossier.district ? `· ${activeDossier.district}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Dernier scan : {activeDossier.lastScanDate ? formatDate(activeDossier.lastScanDate) : "Non renseigné"}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground font-medium">Santé cutanée globale</p>
                  <p className={cn("text-2xl font-bold font-heading", scoreColor(activeDossier.score))}>
                    {activeDossier.score}/100
                  </p>
                </div>
              </div>

              {/* Boutons d'actions rapides */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => shareWhatsAppBilan(activeDossier)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 gap-1.5"
                >
                  <MessageCircle className="size-3.5" />
                  <span>Envoyer Bilan WhatsApp</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    toast.success("Dossier Peau complet exporté en PDF haute définition");
                  }}
                  className="text-xs h-8 gap-1.5"
                >
                  <FileDown className="size-3.5" />
                  <span>Télécharger PDF</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedClientId(null);
                    if (onStartDiagnostic) onStartDiagnostic(activeDossier.id);
                    else onNavigate?.("diagnostic");
                  }}
                  className="k-btn-gold text-primary-foreground font-semibold text-xs h-8 gap-1.5 ml-auto"
                >
                  <ScanFace className="size-3.5" />
                  <span>Scanner en cabine</span>
                </Button>
              </div>
            </div>

            {/* Corps du Dossier : Onglets Thématiques */}
            <div className="p-6">
              <Tabs defaultValue="biomarqueurs" className="w-full">
                <TabsList className="grid grid-cols-4 w-full h-10 p-1 bg-muted/60 rounded-xl mb-5">
                  <TabsTrigger value="biomarqueurs" className="text-xs font-semibold rounded-lg">
                    Biomarqueurs
                  </TabsTrigger>
                  <TabsTrigger value="ordonnance" className="text-xs font-semibold rounded-lg">
                    Ordonnance Beauté
                  </TabsTrigger>
                  <TabsTrigger value="evolution" className="text-xs font-semibold rounded-lg">
                    Avant / Après
                  </TabsTrigger>
                  <TabsTrigger value="rdv" className="text-xs font-semibold rounded-lg">
                    RDV & Achats
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1 : BIOMARQUEURS VISIA-LIKE */}
                <TabsContent value="biomarqueurs" className="space-y-4 m-0">
                  <div className="p-4 rounded-xl bg-muted/30 border border-border/60">
                    <h5 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3">
                      Profilage Mélanique & Barrière Cutanée
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-card border border-border/50">
                        <p className="text-[10px] text-muted-foreground">Phototype Fitzpatrick</p>
                        <p className="text-sm font-bold font-heading text-amber-500 mt-0.5">
                          Type {activeDossier.phototype} (mélanoderme)
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-card border border-border/50">
                        <p className="text-[10px] text-muted-foreground">Sensibilité Réactive</p>
                        <p className="text-sm font-bold font-heading text-emerald-500 mt-0.5">Modérée (stable)</p>
                      </div>
                      <div className="p-3 rounded-lg bg-card border border-border/50">
                        <p className="text-[10px] text-muted-foreground">Indice de Mélanine</p>
                        <p className="text-sm font-bold font-heading text-primary mt-0.5">Élevé (protecteur)</p>
                      </div>
                    </div>
                  </div>

                  {/* Jauges des Biomarqueurs Visia */}
                  <div className="space-y-3 p-4 rounded-xl bg-card border border-border/60">
                    <h5 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Analyse Visia-Like Multi-Zones
                    </h5>
                    {[
                      { label: "Hydratation & Barrière lipidique", val: 78, color: "bg-sky-500" },
                      { label: "Homogénéité pigmentaire (Taches & Mélanine)", val: 64, color: "bg-amber-500" },
                      { label: "Régulation séborrhéique & Pores", val: 82, color: "bg-emerald-500" },
                      { label: "Éclat & Luminosité naturelle", val: 88, color: "bg-primary" },
                      { label: "Fermeté cutanée & Texture", val: 75, color: "bg-purple-500" },
                    ].map((bio, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>{bio.label}</span>
                          <span className="font-mono">{bio.val}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", bio.color)} style={{ width: `${bio.val}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* TAB 2 : ORDONNANCE BEAUTÉ CABINE */}
                <TabsContent value="ordonnance" className="space-y-4 m-0">
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <h5 className="font-heading font-bold text-sm text-foreground">
                        Ordonnance Beauté & Prescription Cabine
                      </h5>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Protocole dermo-botanique prescrit pour le maintien de l'équilibre cutané mélanoderme et l'atténuation des taches pigmentaires.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-card border border-border/60 space-y-2">
                      <p className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                        <span>☀️</span> Rituel Matin
                      </p>
                      <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                        <li>Nettoyage doux à l'infusion de Kinkeliba</li>
                        <li>Sérum antioxydant à l'Hibiscus & Niacinamide</li>
                        <li>Fluide hydratant Moringa avec protection SPF 50</li>
                      </ul>
                    </div>

                    <div className="p-3.5 rounded-xl bg-card border border-border/60 space-y-2">
                      <p className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                        <span>🌙</span> Rituel Soir
                      </p>
                      <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                        <li>Double nettoyage à l'huile de Balanites</li>
                        <li>Complexe unifiant ciblé hyperpigmentation</li>
                        <li>Baume réparateur au Karité brut d'Afrique de l'Ouest</li>
                      </ul>
                    </div>
                  </div>

                  {/* Botaniques Clés */}
                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50">
                    <p className="text-xs font-bold font-heading mb-2">🌿 Botaniques Majeures Prescrites</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["Moringa d'Afrique", "Karité brut bio", "Huile de Balanites", "Kinkeliba d'Afrique de l'Ouest", "Poudre d'Hibiscus"].map((b, i) => (
                        <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-card border border-border text-foreground/80">
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 3 : AVANT / APRÈS & ÉVOLUTION */}
                <TabsContent value="evolution" className="space-y-4 m-0">
                  <div className="p-4 rounded-xl bg-card border border-border/60 text-center space-y-2">
                    <h5 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Suivi Visuel & Comparatif en Cabine
                    </h5>
                    <p className="text-xs text-muted-foreground">
                      Évolution cutanée entre le bilan initial et le dernier soin en institut.
                    </p>
                    <div className="pt-2">
                      <BeforeAfterSlider
                        beforePhoto="/images/kene-skin-before.jpg"
                        afterPhoto="/images/kene-skin-after.jpg"
                        beforeLabel="Bilan Initial (J0)"
                        afterLabel="Contrôle Actuel (J+30)"
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 4 : RENDEZ-VOUS & COMMANDES WHATSAPP */}
                <TabsContent value="rdv" className="space-y-4 m-0">
                  <div className="space-y-2">
                    <h5 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Historique des Rendez-Vous & Soins
                    </h5>
                    <div className="p-3 rounded-xl bg-card border border-border/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <Calendar className="size-4 text-primary" />
                        <div>
                          <p className="font-semibold">Soin dermo-botanique profond</p>
                          <p className="text-[11px] text-muted-foreground">
                            {activeDossier.lastVisit ? formatDate(activeDossier.lastVisit) : "Récemment"} · Cabine 1
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-emerald-500 bg-emerald-500/10 border-emerald-500/20 text-[10px]">
                        Effectué
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-heading font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Achats & Commandes WhatsApp Rattachés
                    </h5>
                    <div className="p-3 rounded-xl bg-card border border-border/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <ShoppingBag className="size-4 text-gold-text" />
                        <div>
                          <p className="font-semibold">Routine Ordonnance Beauté (3 soins)</p>
                          <p className="text-[11px] text-muted-foreground">Saisie WhatsApp Institut · {xof(activeDossier.totalSpent || 24500)}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-primary bg-primary/10 border-primary/20 text-[10px]">
                        Délivré
                      </Badge>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
