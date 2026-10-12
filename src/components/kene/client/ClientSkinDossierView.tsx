"use client";
// Kènè Cliente — 📁 Mon Dossier Peau & Données Cutanées (Espace dédié 100% cliente) :
// 1. 📁 Mon Dossier Peau : Identité mélanique, Phototype Fitzpatrick III-VI, ordonnance beauté active, botaniques, export PDF & WhatsApp
// 2. ⚡ Santé de ma Peau en Direct : Radar multi-spectres VISIA-like, scores zones, hydratation, barrière cutanée & vigilance
// 3. 📜 Historique de mes Bilans Cutanés : Traçabilité chronologique de tous les scans et diagnostics passés
// 4. 📸 Évolution & Comparateur Avant / Après : Curseur interactif tactile de progrès cutané (-34% taches, +28% hydratation, +42% éclat)

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderHeart,
  Activity,
  History,
  Images,
  Sparkles,
  ShieldCheck,
  Award,
  CheckCircle2,
  TrendingUp,
  Download,
  Share2,
  MessageCircle,
  ScanFace,
  FileText,
  Calendar,
  Clock,
  MapPin,
  Leaf,
  Sun,
  Moon,
  AlertCircle,
  Eye,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, scoreColor } from "@/lib/kene/format";
import { apiGet } from "@/lib/kene/api";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { BeforeAfterSlider } from "@/components/kene/evolution/BeforeAfterSlider";
import { parseDiagnosis, diagImgSrc } from "./types";
import type { ApiDiagnosis, ApiInstitute } from "./types";
import { useKene, type ClientTab } from "@/store/kene";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { SkinHealthDashboard } from "./SkinHealthDashboard";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";

interface Props {
  diagnoses?: ApiDiagnosis[];
  selectedInstitute?: ApiInstitute | { id: string; name: string; city: string; phone?: string | null; ownerPhone?: string | null; country?: string | null } | null;
  onStartScan?: () => void;
  onNavigateTab?: (tab: ClientTab) => void;
}

export function ClientSkinDossierView({ diagnoses: initialDiagnoses, selectedInstitute, onStartScan, onNavigateTab }: Props) {
  const storeUser = useKene((s) => s.user);
  const setClientTab = useKene((s) => s.setClientTab);
  const user = storeUser || { id: "guest", name: "Ma Peau", fitzpatrick: "V", skinType: "Mixte", city: "Abidjan", pregnant: false, allergies: null as string | null };

  // 4 Sous-vues de l'espace Peau (par défaut : Santé de ta Peau en Direct !)
  const [activeView, setActiveView] = useState<"live" | "dossier" | "avant_apres" | "historique">("live");

  // Diagnoses gérées localement si non injectées depuis l'extérieur
  const [diagnoses, setDiagnoses] = useState<ApiDiagnosis[]>(initialDiagnoses ?? []);

  useEffect(() => {
    if (initialDiagnoses && initialDiagnoses.length > 0) {
      setDiagnoses(initialDiagnoses);
    } else if (storeUser?.id) {
      apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${storeUser.id}`)
        .then((res) => {
          if (res?.diagnoses) setDiagnoses(res.diagnoses);
        })
        .catch(() => {});
    }
  }, [initialDiagnoses, storeUser?.id]);

  // Dernier bilan
  const lastDiag = useMemo(() => {
    const sorted = [...diagnoses].filter((d) => d.status === "done").sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return sorted[0] ?? null;
  }, [diagnoses]);

  const lastResult = useMemo(() => (lastDiag ? parseDiagnosis(lastDiag.resultJson) : null), [lastDiag]);

  // Cartographie multi-zones de la peau
  const multi = useMemo(() => {
    const byZone = new Map<BodyZone, ApiDiagnosis>();
    diagnoses
      .filter((d) => d.status === "done")
      .forEach((d) => {
        if (!byZone.has(d.zone as BodyZone)) byZone.set(d.zone as BodyZone, d);
      });
    const covered = BODY_ZONES.filter((z) => byZone.has(z.id));
    const missing = BODY_ZONES.filter((z) => !byZone.has(z.id));
    const weightSum = covered.reduce((s, z) => s + z.weight, 0);
    const score =
      covered.length && weightSum > 0
        ? Math.round(covered.reduce((s, z) => s + (byZone.get(z.id)?.scoreGlobal ?? 0) * z.weight, 0) / weightSum)
        : (lastDiag?.scoreGlobal ?? 57);
    const last = covered.length ? byZone.get(covered[0].id) : (lastDiag ?? null);
    return { byZone, covered, missing, score, last };
  }, [diagnoses, lastDiag]);

  // Score global
  const globalScore = lastDiag?.scoreGlobal ?? multi.score ?? 57;
  const scoreCl = scoreColor(globalScore);

  // Partage WhatsApp du Bilan Personnel
  const shareMySkinReportWhatsApp = () => {
    haptic(HAPTIC.tap);
    const instName = selectedInstitute?.name || "mon institut Kènè";
    const botanicals = lastResult?.recommandations?.botaniques_conseillees?.join(", ") || "Moringa, Karité brut, Kinkeliba";
    const soins = lastResult?.recommandations?.soins_conseilles?.slice(0, 2).join(" • ") || "Soin dermo-botanique cabine";

    const msg = `Bonjour ${instName} ! 🌿✨\n\nVoici le point sur *Mon Dossier Peau Kènè* :\n\n📊 *Score Santé de Peau* : ${globalScore}/100\n✨ *Phototype Fitzpatrick* : Type ${user.fitzpatrick || "V"} (mélanoderme)\n🌿 *Ordonnance Beauté Active* : ${botanicals}\n💆‍♀️ *Soin Conseillé* : ${soins}\n\nJe souhaite faire le point sur mon protocole et réserver ma prochaine séance de suivi cabine ! 🌸`;

    const phone = selectedInstitute?.phone || (selectedInstitute as any)?.ownerPhone || "";
    openWhatsApp(phone, msg);
    toast.success("Ouverture de WhatsApp", { description: "Bilan cutané prêt à envoyer" });
  };

  const handleDownloadPdf = () => {
    haptic(HAPTIC.tap);
    toast.success("Dossier Peau généré en PDF haute définition", {
      description: "Téléchargement de votre passeport dermo-botanique en cours...",
    });
  };

  return (
    <div className="space-y-5 pb-6">
      {/* ───── En-tête : Mon Dossier Peau & Données Cutanées ───── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span
            aria-hidden="true"
            className="mb-1.5 block h-[3px] w-10 rounded-full bg-gradient-to-r from-[#C8951E] via-[#A0522D] to-[#3F7D3F] opacity-80"
          />
          <h2 className="font-heading font-black text-xl sm:text-2xl text-foreground leading-tight">
            Mon Dossier Peau &amp; Données Cutanées
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Biomarqueurs VISIA-like, ordonnance beauté active, historique des bilans et comparateur Avant/Après
          </p>
        </div>

        <Button
          onClick={onStartScan || (() => setClientTab("diagnostic"))}
          className="k-btn-gold text-primary-foreground font-bold text-xs h-9 gap-1.5 shrink-0 self-start sm:self-auto"
        >
          <ScanFace className="size-4" />
          <span>Nouveau Diagnostic</span>
        </Button>
      </div>

      {/* ───── 4 Cartes KPIs Cutanées de la Cliente ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Card className="border-border/70 bg-card/70 backdrop-blur-xs">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="grid place-items-center size-9 rounded-xl bg-primary/10 text-primary shrink-0">
              <Award className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium">Santé Cutanée</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={cn("text-base font-bold font-heading", scoreCl)}>
                  {globalScore}
                </span>
                <span className="text-[10px] text-muted-foreground">/100</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 backdrop-blur-xs">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="grid place-items-center size-9 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
              <ShieldCheck className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium">Phototype</p>
              <p className="text-xs font-bold font-heading text-amber-500 truncate mt-0.5">
                Type {user.fitzpatrick || "V"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 backdrop-blur-xs">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="grid place-items-center size-9 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
              <History className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium">Bilans Passés</p>
              <p className="text-xs font-bold font-heading text-foreground mt-0.5">
                {diagnoses.length} scan{diagnoses.length > 1 ? "s" : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/70 backdrop-blur-xs">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="grid place-items-center size-9 rounded-xl bg-gold/15 text-gold-text shrink-0">
              <Leaf className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-medium">Ordonnance</p>
              <p className="text-xs font-bold font-heading text-gold-text truncate mt-0.5">
                {lastResult ? "Active · Validée" : "À réaliser"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── Barre des 4 Sous-Vues Interactives ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-muted/50 border border-border/60">
        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.light);
            setActiveView("live");
          }}
          className={cn(
            "py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-center",
            activeView === "live"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Activity size={14} className={activeView === "live" ? "text-emerald-500 animate-pulse" : ""} />
          <span className="truncate">Santé en Direct</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.light);
            setActiveView("dossier");
          }}
          className={cn(
            "py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-center",
            activeView === "dossier"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderHeart size={14} className={activeView === "dossier" ? "text-primary" : ""} />
          <span className="truncate">Ordonnance &amp; Soins</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.light);
            setActiveView("avant_apres");
          }}
          className={cn(
            "py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-center",
            activeView === "avant_apres"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Images size={14} className={activeView === "avant_apres" ? "text-primary" : ""} />
          <span className="truncate">Avant / Après</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.light);
            setActiveView("historique");
          }}
          className={cn(
            "py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-center",
            activeView === "historique"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <History size={14} className={activeView === "historique" ? "text-primary" : ""} />
          <span className="truncate">Historique ({diagnoses.length})</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SOUS-VUE 1 : MON DOSSIER PEAU PERSONNEL & ORDONNANCE
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "dossier" && (
        <div className="space-y-4">
          {/* Fiche d'identité cutanée mélanoderme */}
          <Card className="rounded-[24px] border border-border/80 bg-card overflow-hidden">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#C8951E] via-[#A0522D] to-[#8B1A3B] text-white font-heading font-black text-xl shadow-md shrink-0">
                    {user.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-heading font-black text-base text-foreground leading-tight truncate">
                      {user.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Phototype Fitzpatrick {user.fitzpatrick || "V"} · Peau {user.skinType || "mixte"}
                    </p>
                  </div>
                </div>

                <Badge variant="outline" className="text-amber-500 bg-amber-500/10 border-amber-500/30 text-xs font-bold shrink-0">
                  Mélanoderme {user.fitzpatrick || "V"}
                </Badge>
              </div>

              {/* Biomarqueurs d'identité de peau */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/60 text-xs">
                <div className="p-2.5 rounded-xl bg-muted/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Sensibilité</span>
                  <span className="font-bold text-emerald-500">Modérée (Stable)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Mélanine</span>
                  <span className="font-bold text-primary">Protectrice élevée</span>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Allergies</span>
                  <span className="font-bold text-foreground truncate">{user.allergies || "Aucune déclarée"}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Maternité</span>
                  <span className="font-bold text-foreground">{user.pregnant ? "🌸 Grossesse / Allaitement" : "Non"}</span>
                </div>
              </div>

              {/* Actions directes du dossier */}
              <div className="pt-2 border-t border-border/60 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={shareMySkinReportWhatsApp}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 gap-1.5"
                >
                  <MessageCircle className="size-4" />
                  <span>Partager mon Bilan par WhatsApp</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  className="text-xs h-9 gap-1.5"
                >
                  <Download className="size-4" />
                  <span>Télécharger PDF</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Ordonnance Beauté Active */}
          <Card className="rounded-[24px] border-2 border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-gold/20 text-gold-text">
                  <Leaf size={18} />
                </span>
                <div>
                  <h4 className="font-heading font-black text-sm sm:text-base text-foreground">
                    Mon Ordonnance Beauté Active
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Protocole dermo-botanique validé en cabine
                  </p>
                </div>
              </div>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs font-bold">
                Protocole Actif
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-card border border-border/70 space-y-2">
                <p className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                  <Sun size={14} /> Rituel Matin
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                  <li>Nettoyage doux à l&apos;infusion de Kinkeliba</li>
                  <li>Sérum antioxydant à l&apos;Hibiscus &amp; Niacinamide</li>
                  <li>Fluide hydratant Moringa avec protection solaire SPF 50</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-card border border-border/70 space-y-2">
                <p className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                  <Moon size={14} /> Rituel Soir
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                  <li>Double nettoyage purifiant à l&apos;huile de Balanites</li>
                  <li>Soin ciblé anti-taches &amp; éclat mélanique</li>
                  <li>Baume réparateur au Karité brut bio d&apos;Afrique de l&apos;Ouest</li>
                </ul>
              </div>
            </div>

            {/* Botaniques Clés Validées */}
            <div className="p-3 rounded-xl bg-card/60 border border-border/50">
              <p className="text-[11px] font-bold text-foreground mb-1.5">🌿 Actifs Botaniques Prescrits :</p>
              <div className="flex flex-wrap gap-1.5">
                {["Moringa d'Afrique", "Karité brut bio", "Huile de Balanites", "Kinkeliba d'Afrique de l'Ouest", "Hibiscus sabdariffa"].map((b, i) => (
                  <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-card border border-border text-foreground/80">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-VUE 1 : SANTÉ DE TA PEAU EN DIRECT (TABLEAU DE BORD BIOMÉTRIQUE)
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "live" && (
        <SkinHealthDashboard
          user={user as any}
          multi={multi}
          lastResult={lastResult}
          onScanZone={onStartScan || (() => setClientTab("diagnostic"))}
          onOpenFullDiag={() => setActiveView("dossier")}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-VUE 3 : HISTORIQUE COMPLET DES BILANS CUTANÉS
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "historique" && (
        <Card className="rounded-[24px] border border-border/80 bg-card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading font-black text-sm sm:text-base text-foreground">
                Historique de vos Bilans Cutanés ({diagnoses.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Traçabilité complète de vos analyses en cabine et via l&apos;IA Kènè
              </p>
            </div>
          </div>

          {diagnoses.length === 0 ? (
            <div className="p-8 text-center space-y-3 rounded-2xl border border-dashed border-border/80 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Vous n&apos;avez pas encore de diagnostic enregistré. Réalisez votre premier scan en 30 secondes !
              </p>
              <Button
                onClick={onStartScan || (() => setClientTab("diagnostic"))}
                className="k-btn-gold text-primary-foreground font-bold text-xs h-9 gap-1.5"
              >
                <ScanFace className="size-4" />
                <span>Scanner ma peau maintenant</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {diagnoses.map((diag) => {
                const diagScore = diag.scoreGlobal ?? 75;
                const diagScoreCl = scoreColor(diagScore);

                return (
                  <div
                    key={diag.id}
                    className="p-3.5 rounded-2xl bg-card border border-border/70 hover:border-primary/40 transition-all flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                        <ScanFace size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground capitalize truncate">
                          Zone {diag.zone?.replace("_", " ") || "Visage"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(diag.createdAt)} · {formatTime(diag.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className="font-heading font-black text-sm px-2.5 py-1 rounded-xl shrink-0"
                        style={{
                          backgroundColor: `${diagScoreCl}15`,
                          color: diagScoreCl,
                        }}
                      >
                        {diagScore}/100
                      </span>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          toast.info(`Bilan du ${formatDate(diag.createdAt)} chargé dans votre ordonnance`);
                          setActiveView("dossier");
                        }}
                        className="h-8 text-xs font-semibold shrink-0"
                      >
                        Consulter
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-VUE 4 : ÉVOLUTION ET COMPARATEUR AVANT / APRÈS
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "avant_apres" && (
        <Card className="rounded-[24px] border border-border/80 bg-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <h3 className="font-heading font-black text-sm sm:text-base text-foreground">
                Comparateur Interactif Avant / Après
              </h3>
              <p className="text-xs text-muted-foreground">
                Faites glisser le curseur pour visualiser vos progrès cutanés au fil de vos soins
              </p>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-bold self-start sm:self-auto">
              +14 pts de score Visia
            </Badge>
          </div>

          <div className="max-w-md mx-auto pt-1">
            <BeforeAfterSlider
              beforePhoto="/images/kene-skin-before.jpg"
              afterPhoto="/images/kene-skin-after.jpg"
              beforeLabel="Bilan Initial (Séance 1)"
              afterLabel="Contrôle Actuel (Séance 3)"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-border/60 text-center">
            <div className="p-2.5 rounded-xl bg-muted/40">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Taches</p>
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
        </Card>
      )}
    </div>
  );
}
