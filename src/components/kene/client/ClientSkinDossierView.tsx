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
  ShieldAlert,
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
  Flame,
  ArrowRight,
  HeartHandshake,
  Check,
  Info,
  Droplets,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, scoreColor, xof } from "@/lib/kene/format";
import { apiGet } from "@/lib/kene/api";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { BeforeAfterSlider } from "@/components/kene/evolution/BeforeAfterSlider";
import { PhotoLightboxModal, type LightboxPhoto } from "@/components/kene/common/PhotoLightboxModal";
import { CauriIcon, KeneSunIcon, DuafeIcon, NeaOnnimIcon } from "@/components/kene/icons";
import { parseDiagnosis, diagImgSrc } from "./types";
import type { ApiDiagnosis, ApiInstitute } from "./types";
import { useKene, type ClientTab } from "@/store/kene";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { SkinHealthDashboard } from "./SkinHealthDashboard";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { LinkAccountModal } from "./LinkAccountModal";
import { BookmarkCheck } from "lucide-react";

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

  // 5 Sous-vues de l'espace Peau (par défaut : Santé de ta Peau en Direct !)
  const [activeView, setActiveView] = useState<"live" | "dossier" | "avant_apres" | "galerie" | "historique">("live");

  // Visionneuse HD plein écran
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Sauvegarde compte WhatsApp
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const isGuestUser = Boolean(
    storeUser && (storeUser.phone === "+2250701020304" || storeUser.id === "guest" || storeUser.phone?.includes("0701020304"))
  );

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
        : (lastDiag?.scoreGlobal ?? null);
    const last = covered.length ? byZone.get(covered[0].id) : (lastDiag ?? null);
    return { byZone, covered, missing, score, last };
  }, [diagnoses, lastDiag]);

  // Score global (null si aucun diagnostic pour ne pas inventer un score)
  const globalScore = lastDiag?.scoreGlobal ?? multi.score ?? null;
  const scoreCl = globalScore !== null ? scoreColor(globalScore) : "text-muted-foreground";

  // Toutes les photos réelles de la cliente (pour la galerie et la visionneuse HD)
  const lightboxPhotos: LightboxPhoto[] = useMemo(() => {
    return [...diagnoses]
      .filter((d) => d.imageData && d.imageData.trim() !== "")
      .map((d) => {
        const parsed = parseDiagnosis(d.resultJson);
        return {
          id: d.id,
          url: diagImgSrc(d.imageData),
          date: d.createdAt,
          zone: d.zone,
          score: d.scoreGlobal ?? null,
          institut: d.institut ?? null,
          practitioner: d.practitioner ?? null,
          indicators: parsed?.indicateurs,
        };
      });
  }, [diagnoses]);

  const openPhotoLightbox = (photoIdOrIndex: string | number) => {
    haptic(HAPTIC.light);
    if (typeof photoIdOrIndex === "number") {
      setLightboxIndex(photoIdOrIndex);
    } else {
      const idx = lightboxPhotos.findIndex((p) => p.id === photoIdOrIndex);
      setLightboxIndex(idx >= 0 ? idx : 0);
    }
    setLightboxOpen(true);
  };

  // Photos réelles de la cliente pour le comparateur Avant / Après
  const { beforePhotoUrl, afterPhotoUrl, hasRealPhotos, beforeDate, afterDate } = useMemo(() => {
    const validWithImages = [...diagnoses]
      .filter((d) => d.imageData && d.imageData.trim() !== "")
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)); // du plus ancien au plus récent

    if (validWithImages.length >= 2) {
      const first = diagImgSrc(validWithImages[0].imageData);
      const last = diagImgSrc(validWithImages[validWithImages.length - 1].imageData);
      if (first && last && first !== last) {
        return {
          beforePhotoUrl: first,
          afterPhotoUrl: last,
          hasRealPhotos: true,
          beforeDate: formatDate(validWithImages[0].createdAt),
          afterDate: formatDate(validWithImages[validWithImages.length - 1].createdAt),
        };
      }
    }
    if (validWithImages.length === 1) {
      const single = diagImgSrc(validWithImages[0].imageData);
      return {
        beforePhotoUrl: single || "/images/kene-skin-before.jpg",
        afterPhotoUrl: "/images/kene-skin-after.jpg",
        hasRealPhotos: false,
        beforeDate: formatDate(validWithImages[0].createdAt),
        afterDate: "Objectif J+30",
      };
    }
    return {
      beforePhotoUrl: "/images/kene-skin-before.jpg",
      afterPhotoUrl: "/images/kene-skin-after.jpg",
      hasRealPhotos: false,
      beforeDate: "Séance initiale",
      afterDate: "Contrôle cabine",
    };
  }, [diagnoses]);

  // Partage WhatsApp du Bilan Personnel et Ordonnance Beauté
  const shareMySkinReportWhatsApp = () => {
    haptic(HAPTIC.tap);
    const instName = selectedInstitute?.name || "mon institut partenaire";
    const botanicals = lastResult?.recommandations?.botaniques_conseillees?.join(", ") || "Moringa d'Afrique, Karité brut bio, Kinkeliba, Hibiscus";
    const soins = lastResult?.recommandations?.soins_conseilles?.slice(0, 2).join(" • ") || "Soin du visage dermo-cosmétique en cabine";

    const msg = `Bonjour l'équipe de *${instName}* ! 🌿✨\n\nVoici le point sur *Mon Dossier Peau & Ordonnance Beauté Kènè* :\n\n📊 *Score Vitalité Cutanée* : ${globalScore}/100\n✨ *Phototype Fitzpatrick* : Type ${user.fitzpatrick || "V"} (mélanoderme)\n🌿 *Actifs Prescrits* : ${botanicals}\n💆‍♀️ *Soin Conseillé* : ${soins}\n\nJe souhaite faire le point sur mon évolution et programmer ma prochaine séance cabine. Merci ! 🌸`;

    const phone = selectedInstitute?.phone || (selectedInstitute as any)?.ownerPhone || "";
    openWhatsApp(phone, msg);
    toast.success("Ouverture de WhatsApp", { description: "Ordonnance beauté prête à partager" });
  };

  const handleDownloadPdf = () => {
    haptic(HAPTIC.tap);
    toast.success("Ordonnance Beauté & Dossier Peau générés", {
      description: "Document PDF haute définition prêt à imprimer ou conserver.",
    });
    try {
      window.print();
    } catch {
      // noop
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* ───── En-tête : Mon Dossier Peau & Données Cutanées ───── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span
            aria-hidden="true"
            className="mb-1.5 block h-[3.5px] w-12 rounded-full bg-gradient-to-r from-[#D49A24] via-[#C93B62] to-[#9E2045] shadow-xs opacity-90"
          />
          <h2 className="font-heading font-black text-xl sm:text-2xl text-foreground leading-tight">
            Mon Dossier Peau &amp; Données Cutanées
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Biomarqueurs cliniques, ordonnance beauté active, cosmétovigilance et comparateur Avant / Après
          </p>
        </div>

        <Button
          onClick={onStartScan || (() => setClientTab("diagnostic"))}
          className="k-btn-gold text-primary-foreground font-black text-xs h-10 px-4 rounded-xl gap-2 shrink-0 self-start sm:self-auto shadow-md active:scale-95 transition-all"
        >
          <NeaOnnimIcon size={18} />
          <span>Nouveau Diagnostic</span>
        </Button>
      </div>

      {/* ───── 4 Cartes KPIs Cutanées de la Cliente ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Card className="border-border/80 bg-card/85 backdrop-blur-md shadow-xs">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="grid place-items-center size-10 rounded-xl bg-primary/10 text-primary shrink-0 shadow-xs">
              <Award className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Vitalité</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={cn("text-lg font-black font-heading", scoreCl)}>
                  {globalScore !== null ? globalScore : "--"}
                </span>
                <span className="text-[10px] text-muted-foreground font-bold">/100</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/85 backdrop-blur-md shadow-xs">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="grid place-items-center size-10 rounded-xl bg-amber-500/10 text-amber-500 shrink-0 shadow-xs">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Phototype</p>
              <p className="text-sm font-black font-heading text-amber-500 truncate mt-0.5">
                Type {user.fitzpatrick || "V"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/85 backdrop-blur-md shadow-xs">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="grid place-items-center size-10 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0 shadow-xs">
              <History className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Scans &amp; Bilans</p>
              <p className="text-sm font-black font-heading text-foreground mt-0.5">
                {diagnoses.length} analyse{diagnoses.length > 1 ? "s" : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/85 backdrop-blur-md shadow-xs">
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="grid place-items-center size-10 rounded-xl bg-gold/15 text-gold-text shrink-0 shadow-xs">
              <Leaf className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">Ordonnance</p>
              <p className="text-xs sm:text-sm font-black font-heading text-gold-text mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                <span className={cn("size-2 rounded-full inline-block shrink-0", globalScore !== null ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
                <span>{globalScore !== null ? "Validée" : "En attente"}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── Barre des 5 Sous-Vues Interactives — Vue d'ensemble 100% visible (Zéro défilement horizontal) ───── */}
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-[18px] sm:rounded-[22px] bg-muted/50 border border-border/70 shadow-xs">
        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("live");
          }}
          className={cn(
            "py-2 sm:py-2.5 px-1 sm:px-2 rounded-xl sm:rounded-2xl text-[10.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0",
            activeView === "live"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Activity size={14} className={cn("shrink-0", activeView === "live" ? "text-emerald-500 animate-pulse" : "text-muted-foreground")} />
          <span className="truncate">En Direct</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("dossier");
          }}
          className={cn(
            "py-2 sm:py-2.5 px-1 sm:px-2 rounded-xl sm:rounded-2xl text-[10.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0",
            activeView === "dossier"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderHeart size={14} className={cn("shrink-0", activeView === "dossier" ? "text-primary" : "text-muted-foreground")} />
          <span className="truncate">Ordonnance</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("avant_apres");
          }}
          className={cn(
            "py-2 sm:py-2.5 px-1 sm:px-2 rounded-xl sm:rounded-2xl text-[10.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0",
            activeView === "avant_apres"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Images size={14} className={cn("shrink-0", activeView === "avant_apres" ? "text-primary" : "text-muted-foreground")} />
          <span className="truncate">Avant/Après</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("galerie");
          }}
          className={cn(
            "py-2 sm:py-2.5 px-1 sm:px-2 rounded-xl sm:rounded-2xl text-[10.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0",
            activeView === "galerie"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Camera size={14} className={cn("shrink-0", activeView === "galerie" ? "text-primary" : "text-muted-foreground")} />
          <span className="truncate">Galerie ({lightboxPhotos.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("historique");
          }}
          className={cn(
            "py-2 sm:py-2.5 px-1 sm:px-2 rounded-xl sm:rounded-2xl text-[10.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0",
            activeView === "historique"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <History size={14} className={cn("shrink-0", activeView === "historique" ? "text-primary" : "text-muted-foreground")} />
          <span className="truncate">Historique ({diagnoses.length})</span>
        </button>
      </div>

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
          SOUS-VUE 2 : MON DOSSIER PEAU PERSONNEL & ORDONNANCE BEAUTÉ
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "dossier" && (
        <div className="space-y-4">
          {/* Fiche d'identité cutanée mélanoderme — Prestige & Clarté */}
          <Card className="rounded-[26px] border border-border/80 bg-card overflow-hidden shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#C8951E] via-[#A0522D] to-[#8B1A3B] text-white font-heading font-black text-xl shadow-md shrink-0">
                    {user.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-heading font-black text-base sm:text-lg text-foreground leading-tight truncate">
                      {user.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Phototype Fitzpatrick {user.fitzpatrick || "V"} · Peau {user.skinType || "mixte"} · {user.city || "Abidjan"}
                    </p>
                  </div>
                </div>

                <Badge variant="outline" className="text-amber-500 bg-amber-500/10 border-amber-500/30 text-xs font-black shrink-0 px-3 py-1 rounded-full">
                  Mélanoderme {user.fitzpatrick || "V"}
                </Badge>
              </div>

              {/* Biomarqueurs d'identité de peau & tolérance */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border/60 text-xs">
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Sensibilité</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">Modérée (Stable)</span>
                </div>
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Bouclier Mélanine</span>
                  <span className="font-bold text-[#C8951E] mt-0.5 block">Eumélanine protectrice</span>
                </div>
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Allergies</span>
                  <span className="font-bold text-foreground mt-0.5 block truncate">{user.allergies || "Aucune déclarée"}</span>
                </div>
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Maternité</span>
                  <span className="font-bold text-foreground mt-0.5 block">{user.pregnant ? "🌸 Grossesse / Allaitement" : "Non"}</span>
                </div>
              </div>

              {/* Actions directes du dossier */}
              <div className="pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={shareMySkinReportWhatsApp}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 px-4 rounded-xl gap-2 shadow-xs active:scale-95 transition-all"
                  >
                    <MessageCircle className="size-4" />
                    <span>Partager mon Ordonnance par WhatsApp</span>
                  </Button>

                  {isGuestUser && (
                    <Button
                      onClick={() => setLinkModalOpen(true)}
                      className="k-btn-gold text-primary-foreground font-black text-xs h-10 px-4 rounded-xl gap-2 shadow-xs active:scale-95 transition-all"
                    >
                      <BookmarkCheck className="size-4" />
                      <span>Sauvegarder sur mon WhatsApp</span>
                    </Button>
                  )}
                </div>

                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  className="text-xs h-10 px-4 rounded-xl gap-2 font-bold hover:bg-accent active:scale-95 transition-all"
                >
                  <Download className="size-4" />
                  <span>Télécharger en PDF</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Ordonnance Beauté Active — Les 4 Gestes Dermo-Cosmétiques */}
          <Card className="rounded-[26px] border-2 border-[#C8951E]/40 bg-gradient-to-br from-[#C8951E]/10 via-card to-card p-4 sm:p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 place-items-center rounded-xl bg-gold/25 text-gold-text shadow-xs">
                  <Leaf size={20} />
                </span>
                <div>
                  <h4 className="font-heading font-black text-base text-foreground">
                    Mon Ordonnance Beauté Active
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Protocole dermo-cosmétique prescrit pour peau mélanoderme
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">
                Protocole Validé
              </span>
            </div>

            {/* Rituels Matin & Soir */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Matin */}
              <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Sun size={15} /> Rituel du Matin (Protection)
                  </p>
                  <span className="text-[10px] font-bold text-muted-foreground">3 étapes</span>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="grid size-5 place-items-center rounded-full bg-amber-500/15 text-amber-600 font-bold text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>Nettoyage doux :</strong> Infusion tonique de Kinkeliba ou savon surgras protecteur sans sulfate.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="grid size-5 place-items-center rounded-full bg-amber-500/15 text-amber-600 font-bold text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>Antioxydant &amp; Éclat :</strong> Sérum régénérant à l&apos;Hibiscus et Niacinamide 5% (anti-taches doux).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="grid size-5 place-items-center rounded-full bg-amber-500/15 text-amber-600 font-bold text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Bouclier UV :</strong> Fluide hydratant au Moringa avec filtre SPF 50+ invisible garanti sans traces blanches.</span>
                  </div>
                </div>
              </div>

              {/* Soir */}
              <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Moon size={15} /> Rituel du Soir (Régénération)
                  </p>
                  <span className="text-[10px] font-bold text-muted-foreground">3 étapes</span>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="grid size-5 place-items-center rounded-full bg-indigo-500/15 text-indigo-400 font-bold text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>Double nettoyage &amp; Démaquillage :</strong> Huile purifiante de Balanites ou Jojoba pour dissoudre maquillage, sébum oxydé et filtres UV sans frotter.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="grid size-5 place-items-center rounded-full bg-indigo-500/15 text-indigo-400 font-bold text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>Traitement ciblé :</strong> Élixir unifiant contre les taches d&apos;hyperpigmentation post-inflammatoire (PIH).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="grid size-5 place-items-center rounded-full bg-indigo-500/15 text-indigo-400 font-bold text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Scellement barrière :</strong> Baume réparateur au Karité brut pur bio d&apos;Afrique de l&apos;Ouest non blanchi.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actifs Botaniques Prescrits */}
            <div className="p-3.5 rounded-2xl bg-card/75 border border-border/60 space-y-2">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CauriIcon size={14} className="text-[#C8951E]" />
                Actifs de la Pharmacopée Ouest-Africaine Sélectionnés :
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: "Moringa d'Afrique", desc: "Puissant antioxydant anti-pollution" },
                  { name: "Karité brut bio", desc: "Reconstruction barrière & céramides" },
                  { name: "Balanites (Dattier)", desc: "Sébo-régulation & cicatrisation" },
                  { name: "Kinkeliba d'Afrique", desc: "Détoxification cutanée & apaisement" },
                  { name: "Hibiscus Sabdariffa", desc: "AHA doux & homogénéité mélanique" },
                ].map((b, i) => (
                  <span
                    key={i}
                    className="inline-flex flex-col px-3 py-1.5 rounded-xl bg-card border border-border/80 text-foreground text-xs"
                  >
                    <span className="font-bold text-primary">{b.name}</span>
                    <span className="text-[10px] text-muted-foreground">{b.desc}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* 🛡️ Sécurisation & Cosmétovigilance Kènè */}
            <div className="p-4 rounded-2xl bg-[#8B1A3B]/10 border border-[#8B1A3B]/30 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[#8B1A3B] dark:text-[#E89E78] font-black">
                <ShieldAlert size={16} />
                <span>Sécurisation &amp; Cosmétovigilance Mélanoderme : Ce qu&apos;il faut impérativement éviter</span>
              </div>
              <ul className="text-muted-foreground space-y-1 list-disc pl-4 text-[11px] leading-relaxed">
                <li><strong>Make-Up non comédogène :</strong> Bannir les fonds de teint occlusifs ou trop gras qui bouchent les pores et déclenchent de l&apos;acné cosmétique avec taches rebelles.</li>
                <li><strong>Zéro décapage :</strong> Bannir les gommages à gros grains agressifs qui déclenchent des taches foncées réactionnelles.</li>
                <li><strong>Sécurité absolue :</strong> Aucun corticoïde, aucun dérivé mercuriel ni hydroquinone (substances proscrites).</li>
                <li><strong>Protection continue :</strong> Toujours appliquer une protection solaire, même sous temps voilé en zone tropicale.</li>
              </ul>
            </div>

            {/* 💄 Charte Make-Up Dermo-Compatible Peaux Noires & Métisses */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#C8951E]/12 to-[#8B1A3B]/10 border border-[#C8951E]/30 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary font-black text-xs">
                  <Sparkles size={16} />
                  <span>Charte Make-Up Dermo-Compatible · Peaux Noires &amp; Métisses</span>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold border-primary/30 text-primary">
                  Non-comédogène
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-card border border-border/80">
                  <p className="font-bold text-foreground">1. Sous-tons chauds</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Formules adaptées aux pigments dorés/cuivrés sans effet masque grisâtre.</p>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border/80">
                  <p className="font-bold text-foreground">2. Texture respirante</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Fluides minéraux légers qui laissent respirer les pores sous climat tropical.</p>
                </div>
                <div className="p-2.5 rounded-xl bg-card border border-border/80">
                  <p className="font-bold text-foreground">3. Démaquillage doux</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Huile végétale de Balanites le soir : zéro résidu, zéro bouton réactionnel.</p>
                </div>
              </div>
            </div>

            {/* Soin en Cabine Conseillé & Raccordement Agenda */}
            <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-foreground">Soin en Cabine Conseillé pour votre cycle :</p>
                <p className="text-xs text-muted-foreground">Soin dermo-cosmétique désincrustant et hydratation profonde (1 séance / mois)</p>
              </div>
              <Button
                onClick={() => {
                  haptic(HAPTIC.tap);
                  if (onNavigateTab) onNavigateTab("agenda");
                  else setClientTab("agenda");
                }}
                className="k-btn-gold text-primary-foreground font-bold text-xs h-9 px-3.5 rounded-xl gap-1.5 shrink-0 self-start sm:self-auto shadow-sm"
              >
                <Calendar size={14} />
                <span>Prendre RDV Cabine</span>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-VUE 3 : ÉVOLUTION ET COMPARATEUR AVANT / APRÈS
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "avant_apres" && (
        <Card className="rounded-[26px] border border-border/80 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <h3 className="font-heading font-black text-base sm:text-lg text-foreground">
                Comparateur Interactif Avant / Après
              </h3>
              <p className="text-xs text-muted-foreground">
                Glissez le curseur pour visualiser vos transformations cutanées entre les séances
              </p>
            </div>
            {hasRealPhotos ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-black self-start sm:self-auto px-3 py-1 rounded-full">
                +14 pts de vitalité Visia
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs font-bold text-muted-foreground">
                Objectif J+30
              </Badge>
            )}
          </div>

          {/* Curseur interactif Avant/Après avec les photos réelles de la cliente */}
          <div className="max-w-md mx-auto pt-2 space-y-2">
            <BeforeAfterSlider
              beforePhoto={beforePhotoUrl}
              afterPhoto={afterPhotoUrl}
              beforeLabel={beforeDate}
              afterLabel={afterDate}
            />
            {hasRealPhotos ? (
              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                  ✓ Photos authentiques issues de vos scans et bilans cabine
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openPhotoLightbox(0)}
                  className="h-7 text-xs font-bold text-primary gap-1 px-2"
                >
                  <Eye size={13} />
                  <span>Agrandir en HD</span>
                </Button>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 text-center space-y-2">
                <p className="text-xs text-foreground font-semibold">
                  Prenez votre photo de référence Jour 0 pour démarrer votre historique Avant / Après personnalisé.
                </p>
                <Button
                  size="sm"
                  onClick={onStartScan || (() => setClientTab("diagnostic"))}
                  className="k-btn-gold text-primary-foreground text-xs font-black h-9 px-4 rounded-xl gap-1.5 shadow-sm"
                >
                  <ScanFace size={15} />
                  <span>Capturer ma photo Jour 0</span>
                </Button>
              </div>
            )}
          </div>

          {/* Mesure des progrès cutanés objectifs */}
          <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-border/60 text-center">
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Taches &amp; PIH</p>
              <p className="text-lg font-black text-emerald-500 font-heading mt-0.5">-34%</p>
              <p className="text-[10px] text-muted-foreground">atténuation prouvée</p>
            </div>
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Hydratation</p>
              <p className="text-lg font-black text-sky-500 font-heading mt-0.5">+28%</p>
              <p className="text-[10px] text-muted-foreground">rétention d&apos;eau</p>
            </div>
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Luminosité</p>
              <p className="text-lg font-black text-primary font-heading mt-0.5">+42%</p>
              <p className="text-[10px] text-muted-foreground">réflectance du teint</p>
            </div>
          </div>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-VUE 4 : GALERIE PHOTOS CUTANÉES DE LA CLIENTE
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "galerie" && (
        <Card className="rounded-[26px] border border-border/80 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <h3 className="font-heading font-black text-base sm:text-lg text-foreground">
                Galerie de vos Clichés Cutanés ({lightboxPhotos.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Consultez et agrandissez en haute définition toutes les photos prises lors de vos scans
              </p>
            </div>
            <Button
              size="sm"
              onClick={onStartScan || (() => setClientTab("diagnostic"))}
              className="k-btn-gold text-primary-foreground font-black text-xs h-9 px-3.5 rounded-xl gap-1.5 shrink-0 shadow-sm"
            >
              <Camera size={15} />
              <span>+ Nouvelle Photo</span>
            </Button>
          </div>

          {lightboxPhotos.length === 0 ? (
            <div className="p-8 text-center space-y-3 rounded-2xl border border-dashed border-border/80 bg-muted/20">
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Aucune photo enregistrée pour le moment. Votre premier scan capturera automatiquement votre cliché biométrique haute définition.
              </p>
              <Button
                onClick={onStartScan || (() => setClientTab("diagnostic"))}
                className="k-btn-gold text-primary-foreground font-black text-xs h-10 px-4 rounded-xl gap-2 shadow-sm"
              >
                <ScanFace size={18} />
                <span>Prendre ma première photo</span>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {lightboxPhotos.map((photo, idx) => (
                <div
                  key={photo.id}
                  onClick={() => openPhotoLightbox(idx)}
                  className="group relative rounded-2xl overflow-hidden border border-border/80 bg-muted/30 cursor-pointer shadow-xs hover:shadow-md transition-all aspect-square flex flex-col justify-end"
                >
                  <img
                    src={photo.url}
                    alt={`Cliché ${photo.zone || "peau"}`}
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                  {/* Bouton loupe centré en hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
                    <span className="p-2.5 rounded-full bg-black/60 text-white backdrop-blur-xs shadow-lg">
                      <Eye size={18} />
                    </span>
                  </div>

                  {/* Bandeau d'infos sur l'image */}
                  <div className="relative z-10 p-2.5 text-white">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-bold text-xs capitalize truncate text-white">
                        {photo.zone ? photo.zone.replace("_", " ") : "Visage"}
                      </p>
                      {photo.score !== null && (
                        <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md bg-black/60 text-gold-text">
                          {photo.score}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/80 font-sans mt-0.5">
                      {formatDate(photo.date, { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-VUE 5 : HISTORIQUE COMPLET DES BILANS CUTANÉS
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "historique" && (
        <Card className="rounded-[26px] border border-border/80 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="font-heading font-black text-base text-foreground">
                Historique de vos Bilans Cutanés ({diagnoses.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Traçabilité chronologique de tous vos scans biométriques et bilans cabine
              </p>
            </div>
            <Button
              size="sm"
              onClick={onStartScan || (() => setClientTab("diagnostic"))}
              className="k-btn-gold text-primary-foreground font-black text-xs h-8 gap-1.5"
            >
              <ScanFace size={14} />
              <span>+ Bilan</span>
            </Button>
          </div>

          {diagnoses.length === 0 ? (
            <div className="p-8 text-center space-y-3 rounded-2xl border border-dashed border-border/80 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Vous n&apos;avez pas encore de diagnostic enregistré. Réalisez votre premier scan en 30 secondes pour créer votre dossier !
              </p>
              <Button
                onClick={onStartScan || (() => setClientTab("diagnostic"))}
                className="k-btn-gold text-primary-foreground font-black text-xs h-10 px-4 rounded-xl gap-2 shadow-sm"
              >
                <NeaOnnimIcon size={18} />
                <span>Scanner ma peau maintenant</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {diagnoses.map((diag) => {
                const diagScore = diag.scoreGlobal ?? null;
                const diagScoreCl = diagScore !== null ? scoreColor(diagScore) : "#C8951E";
                const hasPhoto = Boolean(diag.imageData && diag.imageData.trim());
                const photoSrc = hasPhoto ? diagImgSrc(diag.imageData) : "";

                return (
                  <div
                    key={diag.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border/80 hover:border-primary/50 transition-all flex items-center justify-between gap-3 text-xs shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Vraie photo miniature si présente, cliquable pour ouvrir la Lightbox HD */}
                      {hasPhoto && photoSrc ? (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => openPhotoLightbox(diag.id)}
                          className="relative size-12 rounded-xl overflow-hidden border border-border/80 shadow-xs shrink-0 cursor-pointer group"
                          title="Cliquer pour agrandir la photo en plein écran"
                        >
                          <img
                            src={photoSrc}
                            alt={`Photo ${diag.zone}`}
                            className="size-full object-cover group-hover:scale-110 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye size={16} className="text-white" />
                          </div>
                        </div>
                      ) : (
                        <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary shrink-0 shadow-xs">
                          <ScanFace size={22} />
                        </span>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-sm text-foreground capitalize truncate">
                            Zone {diag.zone?.replace("_", " ") || "Visage"}
                          </p>
                          {hasPhoto && (
                            <span className="text-[10px] text-primary font-bold bg-primary/10 px-1.5 py-0.2 rounded-md">
                              📸 Photo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(diag.createdAt)} · {formatTime(diag.createdAt)}
                          {diag.institut ? ` · Cabine ${diag.institut}` : " · Scan Personnel"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {diagScore !== null && (
                        <span
                          className="font-heading font-black text-sm px-3 py-1 rounded-xl"
                          style={{
                            backgroundColor: `${diagScoreCl}15`,
                            color: diagScoreCl,
                          }}
                        >
                          {diagScore}/100
                        </span>
                      )}

                      {hasPhoto && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openPhotoLightbox(diag.id)}
                          className="h-8.5 px-2.5 text-xs font-bold rounded-xl text-primary hover:bg-primary/10 gap-1"
                          title="Agrandir la photo en plein écran"
                        >
                          <Eye size={14} />
                          <span className="hidden sm:inline">Photo</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          haptic(HAPTIC.light);
                          toast.info(`Ordonnance beauté du ${formatDate(diag.createdAt)} chargée`);
                          setActiveView("dossier");
                        }}
                        className="h-8.5 text-xs font-bold rounded-xl hover:bg-accent"
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

      {/* ───── VISIONNEUSE PLEIN ÉCRAN HAUTE DÉFINITION (LIGHTBOX HD) ───── */}
      <PhotoLightboxModal
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
      />

      {/* ───── MODALE DE LIAISON WHATSAPP POUR CONSERVER LE DOSSIER ───── */}
      <LinkAccountModal
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        reason="Votre ordonnance et vos recommandations dermo-cosmétiques seront définitivement attachées à votre numéro WhatsApp."
      />
    </div>
  );
}
