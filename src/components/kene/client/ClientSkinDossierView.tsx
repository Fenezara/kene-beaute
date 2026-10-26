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
  Sparkles,
  Lock,
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
import { CauriIcon, KeneSunIcon, DuafeIcon, NeaOnnimIcon, NsorommaIcon, BissapFlowerIcon, KariteIcon } from "@/components/kene/icons";
import { parseDiagnosis, diagImgSrc, type ApiDiagnosis, type ApiInstitute } from "./types";
import { useKene, isSavedUser, type ClientTab } from "@/store/kene";
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
  const isGuestUser = !isSavedUser(storeUser);

  // Source et sélection du Comparateur Avant / Après
  const [avantApresSource, setAvantApresSource] = useState<"clinical" | "client">("clinical");
  const [selectedBeforeId, setSelectedBeforeId] = useState<string | null>(null);
  const [selectedAfterId, setSelectedAfterId] = useState<string | null>(null);

  // Diagnoses gérées localement si non injectées depuis l'extérieur
  const [diagnoses, setDiagnoses] = useState<ApiDiagnosis[]>(initialDiagnoses ?? []);

  // Routine quotidienne prescrite par l'institut (cosmeticsUsed)
  const [cosmeticsUsed, setCosmeticsUsed] = useState<string | null>(storeUser?.cosmeticsUsed ?? null);
  const [prescribedByTenant, setPrescribedByTenant] = useState<string | null>(storeUser?.prescribedByTenant ?? null);

  useEffect(() => {
    if (storeUser?.cosmeticsUsed) setCosmeticsUsed(storeUser.cosmeticsUsed);
    if (storeUser?.prescribedByTenant) setPrescribedByTenant(storeUser.prescribedByTenant);
  }, [storeUser?.cosmeticsUsed, storeUser?.prescribedByTenant]);

  useEffect(() => {
    if (initialDiagnoses && initialDiagnoses.length > 0) {
      setDiagnoses(initialDiagnoses);
    }
    if (storeUser?.id) {
      apiGet<{ diagnoses: ApiDiagnosis[]; cosmeticsUsed?: string | null; instituteName?: string | null }>(`/api/diagnoses?userId=${storeUser.id}`)
        .then((res) => {
          if (res?.diagnoses) setDiagnoses(res.diagnoses);
          if (res?.cosmeticsUsed) setCosmeticsUsed(res.cosmeticsUsed);
          if (res?.instituteName) setPrescribedByTenant(res.instituteName);
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

  // Score global unifié (multi-zones prioritaire, fallback sur dernier diagnostic)
  const globalScore = multi.score ?? lastDiag?.scoreGlobal ?? null;
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

  // Diagnostics valides avec photo
  const validWithImages = useMemo(() => {
    return [...diagnoses]
      .filter((d) => d.imageData && d.imageData.trim() !== "")
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)); // chronologique
  }, [diagnoses]);

  // Zone filtrée pour le comparateur Avant / Après
  const [comparisonZone, setComparisonZone] = useState<string>("visage");

  const availableComparisonZones = useMemo(() => {
    const counts: Record<string, number> = {};
    validWithImages.forEach((d) => {
      const z = d.zone || "visage";
      counts[z] = (counts[z] || 0) + 1;
    });
    return Object.entries(counts).map(([zone, count]) => ({ zone, count }));
  }, [validWithImages]);

  // Si visage a au moins 2 scans, par défaut "visage", sinon la zone avec le plus de scans
  useEffect(() => {
    if (availableComparisonZones.length > 0) {
      const visageZone = availableComparisonZones.find((z) => z.zone === "visage" && z.count >= 2);
      if (visageZone) {
        setComparisonZone("visage");
      } else {
        const best = [...availableComparisonZones].sort((a, b) => b.count - a.count)[0];
        if (best) setComparisonZone(best.zone);
      }
    }
  }, [availableComparisonZones]);

  // Diagnostics de la zone active
  const zoneValidWithImages = useMemo(() => {
    const filtered = validWithImages.filter((d) => (d.zone || "visage") === comparisonZone);
    return filtered.length > 0 ? filtered : validWithImages;
  }, [validWithImages, comparisonZone]);

  // Si la cliente a déjà 2 scans réels ou plus, basculer par défaut sur ses propres photos
  useEffect(() => {
    if (validWithImages.length >= 2) {
      setAvantApresSource("client");
    }
  }, [validWithImages.length]);

  const beforeDiag = useMemo(() => {
    if (selectedBeforeId) {
      return zoneValidWithImages.find((d) => d.id === selectedBeforeId) ?? zoneValidWithImages[0] ?? null;
    }
    return zoneValidWithImages[0] ?? null;
  }, [zoneValidWithImages, selectedBeforeId]);

  const afterDiag = useMemo(() => {
    if (selectedAfterId) {
      return zoneValidWithImages.find((d) => d.id === selectedAfterId) ?? zoneValidWithImages[zoneValidWithImages.length - 1] ?? null;
    }
    return zoneValidWithImages[zoneValidWithImages.length - 1] ?? null;
  }, [zoneValidWithImages, selectedAfterId]);

  // Données du comparateur selon la source active (Cas Clinique Témoin vs Scans Personnels)
  const comparisonData = useMemo(() => {
    if (avantApresSource === "clinical") {
      return {
        beforePhoto: "/skin/clinical-before.jpg",
        afterPhoto: "/skin/clinical-after.jpg",
        beforeLabel: "Avant (Jour 0)",
        afterLabel: "Après (Jour 30)",
        beforeDate: "Bilan initial",
        afterDate: "Suivi post-protocole",
        beforeScore: 56,
        afterScore: 82,
        zoneLabel: "Visage · Phototype V",
        hasRealPhotos: true,
        defaultLayoutMode: "slider" as const,
        description: "Cas clinique certifié Kènè : Traitement de l'hyperpigmentation post-inflammatoire (PIH) et du teint terne sur phototype V. Atténuation de 70% des taches et éclat solaire retrouvé en 30 jours.",
      };
    }

    // Source client (scans personnels)
    if (validWithImages.length >= 2 && beforeDiag && afterDiag) {
      const firstSrc = diagImgSrc(beforeDiag.imageData);
      const lastSrc = diagImgSrc(afterDiag.imageData);
      return {
        beforePhoto: firstSrc,
        afterPhoto: lastSrc,
        beforeLabel: `Avant (${beforeDiag.zone?.replace("_", " ") || "Séance"})`,
        afterLabel: `Après (${afterDiag.zone?.replace("_", " ") || "Séance"})`,
        beforeDate: formatDate(beforeDiag.createdAt),
        afterDate: formatDate(afterDiag.createdAt),
        beforeScore: beforeDiag.scoreGlobal ?? undefined,
        afterScore: afterDiag.scoreGlobal ?? undefined,
        zoneLabel: beforeDiag.zone === afterDiag.zone ? beforeDiag.zone : undefined,
        hasRealPhotos: true,
        defaultLayoutMode: "side" as const,
        description: "Vos scans authentiques de suivi cutané. Présentation intégrale côte à côte recommandée pour vos photos mobiles.",
      };
    }

    if (validWithImages.length === 1 && beforeDiag) {
      const single = diagImgSrc(beforeDiag.imageData);
      return {
        beforePhoto: single,
        afterPhoto: "/skin/clinical-after.jpg",
        beforeLabel: "Votre scan (J0)",
        afterLabel: "Objectif (J30)",
        beforeDate: formatDate(beforeDiag.createdAt),
        afterDate: "Projection J+30",
        beforeScore: beforeDiag.scoreGlobal ?? undefined,
        afterScore: 85,
        zoneLabel: beforeDiag.zone,
        hasRealPhotos: false,
        defaultLayoutMode: "side" as const,
        description: "1er cliché de référence enregistré. Prenez votre second scan à J+30 pour mesurer vos propres progrès.",
      };
    }

    return {
      beforePhoto: "/skin/clinical-before.jpg",
      afterPhoto: "/skin/clinical-after.jpg",
      beforeLabel: "Avant (Jour 0)",
      afterLabel: "Après (Jour 30)",
      beforeDate: "Référence",
      afterDate: "Objectif cabine",
      beforeScore: 56,
      afterScore: 82,
      zoneLabel: "Visage",
      hasRealPhotos: false,
      defaultLayoutMode: "slider" as const,
      description: "Prenez votre première photo de référence Jour 0 pour démarrer votre historique Avant / Après.",
    };
  }, [avantApresSource, validWithImages, beforeDiag, afterDiag]);

  // Partage WhatsApp du Bilan Personnel et Routine Beauté
  const shareMySkinReportWhatsApp = () => {
    haptic(HAPTIC.tap);
    if (isGuestUser) {
      toast.error("Inscription requise", {
        description: "Vous devez être inscrite pour partager votre dossier cutané et votre routine avec un institut partenaire.",
      });
      setLinkModalOpen(true);
      return;
    }
    const instName = selectedInstitute?.name || "mon institut partenaire";
    const botanicals = lastResult?.recommandations?.botaniques_conseillees?.join(", ") || "Moringa d'Afrique, Karité brut bio, Kinkeliba, Hibiscus";
    const soins = lastResult?.recommandations?.soins_conseilles?.slice(0, 2).join(" • ") || "Soin du visage dermo-cosmétique en cabine";

    const routinePart = cosmeticsUsed
      ? `\n🧴 *Routine Prescrite en Salon* : ${cosmeticsUsed}`
      : `\n🌿 *Actifs Recommandés* : ${botanicals}`;

    const msg = `Bonjour l'équipe de *${instName}* ! 🌿🔆\n\nVoici le point sur *Mon Dossier Peau & Routine Beauté Kènè* :\n\n📊 *Score Vitalité Cutanée* : ${globalScore}/100\n🔆 *Carnation (Teint)* : Type ${user.fitzpatrick || "V"} (Peau noire & métissée)${routinePart}\n💆‍♀️ *Soin Conseillé* : ${soins}\n\nJe souhaite faire le point sur mon évolution et programmer ma prochaine séance cabine. Merci ! 🌸`;

    const phone = selectedInstitute?.phone || (selectedInstitute as any)?.ownerPhone || "";
    openWhatsApp(phone, msg);
    toast.success("Ouverture de WhatsApp", { description: "Routine beauté prête à partager" });
  };

  // Échanger directement avec Dermo Kènè sur le dossier de peau
  const consultDermoKene = () => {
    haptic(HAPTIC.tap);
    let msg = `Bonjour Dermo Kènè ! 🌸 Je viens consulter mon Dossier Peau Kènè.`;
    if (lastResult) {
      const zoneLabel = BODY_ZONES.find((z) => z.id === lastResult.zone)?.label || lastResult.zone;
      const botanicals = lastResult.recommandations?.botaniques_conseillees?.slice(0, 3).join(", ") || "Actifs botaniques";
      msg += ` Mon dernier bilan sur la zone "${zoneLabel}" a un score de ${lastResult.score_global}/100. Les actifs conseillés sont : ${botanicals}. Peux-tu m'expliquer l'évolution de ma peau et me guider dans ma routine quotidienne ?`;
    } else {
      msg += ` Peux-tu m'aider à faire le point sur mes besoins cutanés et m'expliquer comment optimiser ma routine de soin ?`;
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("kene:pending_chat_message", msg);
      window.dispatchEvent(new CustomEvent("kene:chat:send", { detail: { message: msg, viewMode: "thread" } }));
    }
    setClientTab("chat");
  };

  const handleDownloadPdf = () => {
    haptic(HAPTIC.tap);
    toast.success("Routine Beauté & Dossier Peau générés", {
      description: "Document PDF haute définition prêt à imprimer ou conserver.",
    });
    try {
      window.print();
    } catch {
      // noop
    }
  };

  return (
    <div className="space-y-5 pb-2">
      {/* ───── En-tête : Mon Dossier Peau & Suivi Cutané ───── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span
            aria-hidden="true"
            className="mb-1.5 block h-[3.5px] w-12 rounded-full bg-gradient-to-r from-[#D49A24] via-[#C93B62] to-[#9E2045] shadow-xs opacity-90"
          />
          <h2 className="font-heading font-black text-xl sm:text-2xl text-foreground leading-tight">
            Mon Dossier Peau &amp; Suivi Cutané
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Indicateurs dermo-biométriques, routine beauté active, cosmétovigilance et comparateur Avant / Après
          </p>
        </div>

        <Button
          onClick={onStartScan || (() => setClientTab("diagnostic"))}
          className="k-btn-gold text-primary-foreground font-black text-xs h-10 px-4 rounded-xl gap-2 shrink-0 self-start sm:self-auto shadow-md active:scale-95 transition-all cursor-pointer"
        >
          <NeaOnnimIcon size={18} />
          <span>Nouveau Bilan</span>
        </Button>
      </div>

      {/* ───── Alerte bienveillante Compte Invité (Mode Découverte) ───── */}
      {isGuestUser && (
        <div className="rounded-[20px] border-2 border-[#C8951E]/40 bg-gradient-to-r from-[#C8951E]/15 via-[#A0522D]/10 to-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#C8951E]/20 text-[#C8951E]">
              <Sparkles size={16} className="animate-pulse" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[9.5px] font-black uppercase tracking-wider">
                  Dossier Temporaire
                </span>
                <span className="text-[11px] font-bold text-foreground">
                  Vos bilans de peau ne sont pas encore sécurisés
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Créez votre compte gratuit (0 FCFA) avec votre numéro WhatsApp pour conserver vos analyses à vie et synchroniser vos rituels avec votre institut.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLinkModalOpen(true)}
            className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-full k-btn-gold px-4 text-xs font-black text-primary-foreground shadow-xs shrink-0 self-start sm:self-auto hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
          >
            <span>Sécuriser mon dossier (0 FCFA)</span>
            <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* ───── 4 Cartes KPIs Cutanées de la Cliente (Architecture 2 niveaux sur mobile 320-360px : icône+titre en haut, valeur 100% largeur en bas) ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        <Card className="py-0 gap-0 border-border/80 bg-card/85 backdrop-blur-md shadow-xs">
          <CardContent className="p-2.5 sm:p-3.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="grid place-items-center size-7 sm:size-10 rounded-lg sm:rounded-xl bg-primary/10 text-primary shrink-0 shadow-xs">
                <Award className="size-4 sm:size-5" />
              </span>
              <p className="sm:hidden text-[9.5px] text-muted-foreground font-bold uppercase tracking-wider truncate">
                Score Global
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="hidden sm:block text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                Score Global
              </p>
              <div className="flex items-baseline gap-1 sm:mt-0.5 whitespace-nowrap">
                <span className={cn("text-base sm:text-lg font-black font-heading leading-none", scoreCl)}>
                  {globalScore !== null ? globalScore : "--"}
                </span>
                <span className="text-[10px] text-muted-foreground font-bold">/100</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="py-0 gap-0 border-border/80 bg-card/85 backdrop-blur-md shadow-xs">
          <CardContent className="p-2.5 sm:p-3.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="grid place-items-center size-7 sm:size-10 rounded-lg sm:rounded-xl bg-amber-500/10 text-amber-500 shrink-0 shadow-xs">
                <ShieldCheck className="size-4 sm:size-5" />
              </span>
              <p className="sm:hidden text-[9.5px] text-muted-foreground font-bold uppercase tracking-wider truncate">
                Carnation
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="hidden sm:block text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                Carnation
              </p>
              <p className="text-xs sm:text-sm font-black font-heading text-amber-500 truncate sm:mt-0.5 leading-tight" title="Peaux noires, mates et métissées">
                Type {user.fitzpatrick || "V"} · Mélanoderme
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="py-0 gap-0 border-border/80 bg-card/85 backdrop-blur-md shadow-xs">
          <CardContent className="p-2.5 sm:p-3.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="grid place-items-center size-7 sm:size-10 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0 shadow-xs">
                <History className="size-4 sm:size-5" />
              </span>
              <p className="sm:hidden text-[9.5px] text-muted-foreground font-bold uppercase tracking-wider truncate">
                Scans &amp; Bilans
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="hidden sm:block text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                Scans &amp; Bilans
              </p>
              <p className="text-xs sm:text-sm font-black font-heading text-foreground sm:mt-0.5 whitespace-nowrap truncate leading-tight">
                {diagnoses.length} analyse{diagnoses.length > 1 ? "s" : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("dossier");
          }}
          className="py-0 gap-0 border-border/80 bg-card/85 backdrop-blur-md shadow-xs cursor-pointer hover:border-[#C8951E]/60 transition-all select-none"
        >
          <CardContent className="p-2.5 sm:p-3.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="grid place-items-center size-7 sm:size-10 rounded-lg sm:rounded-xl bg-gold/15 text-gold-text shrink-0 shadow-xs">
                <Leaf className="size-4 sm:size-5" />
              </span>
              <p className="sm:hidden text-[9.5px] text-muted-foreground font-bold uppercase tracking-wider truncate">
                Ma Routine
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="hidden sm:block text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                Ma Routine
              </p>
              <p className="text-xs sm:text-sm font-black font-heading text-gold-text sm:mt-0.5 flex items-center gap-1.5 whitespace-nowrap leading-tight">
                <span className={cn("size-2 rounded-full inline-block shrink-0", cosmeticsUsed ? "bg-emerald-500 animate-pulse" : (globalScore !== null ? "bg-emerald-500" : "bg-muted-foreground"))} />
                <span className="truncate">{cosmeticsUsed ? "Prescrite en salon" : (globalScore !== null ? "Active" : "En attente")}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── Barre des 5 Sous-Vues Interactives — Calibrée 320px-360px (compteurs en pastille sur l'icône, zéro troncature) ───── */}
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-[18px] sm:rounded-[22px] bg-muted/50 border border-border/70 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("live");
          }}
          className={cn(
            "py-1.5 sm:py-2.5 px-0.5 sm:px-2 rounded-xl sm:rounded-2xl text-[9.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0 overflow-hidden",
            activeView === "live"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Activity size={14} className={cn("shrink-0", activeView === "live" ? "text-emerald-500 animate-pulse" : "text-muted-foreground")} />
          <span className="w-full truncate leading-tight">En Direct</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("dossier");
          }}
          className={cn(
            "py-1.5 sm:py-2.5 px-0.5 sm:px-2 rounded-xl sm:rounded-2xl text-[9.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0 overflow-hidden",
            activeView === "dossier"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderHeart size={14} className={cn("shrink-0", activeView === "dossier" ? "text-primary" : "text-muted-foreground")} />
          <span className="w-full truncate leading-tight">
            <span className="sm:hidden">Routine</span>
            <span className="hidden sm:inline">Ma Routine</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("avant_apres");
          }}
          className={cn(
            "py-1.5 sm:py-2.5 px-0.5 sm:px-2 rounded-xl sm:rounded-2xl text-[9px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0 overflow-hidden",
            activeView === "avant_apres"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Images size={14} className={cn("shrink-0", activeView === "avant_apres" ? "text-primary" : "text-muted-foreground")} />
          <span className="w-full truncate leading-tight">
            <span className="sm:hidden">Évolution</span>
            <span className="hidden sm:inline">Avant/Après</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("galerie");
          }}
          className={cn(
            "py-1.5 sm:py-2.5 px-0.5 sm:px-2 rounded-xl sm:rounded-2xl text-[9.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0 overflow-hidden",
            activeView === "galerie"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="inline-flex items-center gap-0.5 shrink-0">
            <Camera size={14} className={cn("shrink-0", activeView === "galerie" ? "text-primary" : "text-muted-foreground")} />
            <span className="sm:hidden text-[8.5px] font-black px-1 py-0 rounded-full bg-primary/15 text-primary leading-tight">
              {lightboxPhotos.length}
            </span>
          </span>
          <span className="w-full truncate leading-tight">
            <span className="sm:hidden">Galerie</span>
            <span className="hidden sm:inline">Galerie ({lightboxPhotos.length})</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveView("historique");
          }}
          className={cn(
            "py-1.5 sm:py-2.5 px-0.5 sm:px-2 rounded-xl sm:rounded-2xl text-[9.5px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer select-none min-w-0 overflow-hidden",
            activeView === "historique"
              ? "bg-card text-foreground shadow-sm border border-border/80 font-black ring-1 ring-[#C8951E]/30"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="inline-flex items-center gap-0.5 shrink-0">
            <History size={14} className={cn("shrink-0", activeView === "historique" ? "text-primary" : "text-muted-foreground")} />
            <span className="sm:hidden text-[8.5px] font-black px-1 py-0 rounded-full bg-primary/15 text-primary leading-tight">
              {diagnoses.length}
            </span>
          </span>
          <span className="w-full truncate leading-tight">
            <span className="sm:hidden">Bilans</span>
            <span className="hidden sm:inline">Historique ({diagnoses.length})</span>
          </span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SOUS-VUE 1 : SANTÉ DE TA PEAU EN DIRECT (TABLEAU DE BORD BIOMÉTRIQUE)
      ═══════════════════════════════════════════════════════════ */}
      {activeView === "live" && (
        <div className="space-y-4">
          {cosmeticsUsed && (
            <Card
              onClick={() => {
                haptic(HAPTIC.tap);
                setActiveView("dossier");
              }}
              className="cursor-pointer border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 via-card to-card p-3.5 sm:p-4 rounded-[22px] hover:border-emerald-500 transition-all shadow-xs select-none"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Sun size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-foreground flex items-center gap-1.5 truncate">
                      <span>🌿 Routine Quotidienne Prescrite en Salon</span>
                      <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">À domicile</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-medium">
                      {cosmeticsUsed}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1">
                  Voir ma routine →
                </span>
              </div>
            </Card>
          )}

          <SkinHealthDashboard
            user={user as any}
            multi={multi}
            lastResult={lastResult}
            onScanZone={onStartScan || (() => setClientTab("diagnostic"))}
            onOpenFullDiag={() => setActiveView("dossier")}
          />
        </div>
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
                      Phototype {user.fitzpatrick || "V"} · Peau {user.skinType || "mixte"} · 📍 {user.city || "Abidjan"}
                    </p>
                  </div>
                </div>

                <Badge variant="outline" className="text-amber-500 bg-amber-500/10 border-amber-500/30 text-xs font-black shrink-0 px-3 py-1 rounded-full">
                  Peau noire &amp; métissée ({user.fitzpatrick || "V"})
                </Badge>
              </div>

              {/* Constantes de peau & tolérance */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border/60 text-xs">
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Sensibilité</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">Modérée (Stable)</span>
                </div>
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Protection Naturelle</span>
                  <span className="font-bold text-[#C8951E] mt-0.5 block">Riche en mélanine</span>
                </div>
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Allergies</span>
                  <span className="font-bold text-foreground mt-0.5 block truncate">{user.allergies || "Aucune déclarée"}</span>
                </div>
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    {(user as any)?.gender === "homme" ? "Tolérance Barbe" : "Maternité"}
                  </span>
                  <span className="font-bold text-foreground mt-0.5 block">
                    {(user as any)?.gender === "homme"
                      ? "Protection rasage"
                      : (user.pregnant ? "🌸 Grossesse / Allaitement" : "Non")}
                  </span>
                </div>
              </div>

              {/* Actions directes du dossier */}
              <div className="pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  onClick={consultDermoKene}
                  className="k-btn-gold text-primary-foreground font-bold text-xs h-10 px-3 rounded-xl gap-2 shadow-xs active:scale-95 transition-all w-full cursor-pointer"
                >
                  <MessageCircle className="size-4 shrink-0" />
                  <span className="truncate">Échanger avec Dermo Kènè</span>
                </Button>

                <Button
                  onClick={shareMySkinReportWhatsApp}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 px-3 rounded-xl gap-2 shadow-xs active:scale-95 transition-all w-full cursor-pointer"
                >
                  <Share2 className="size-4 shrink-0" />
                  <span className="truncate">Partager par WhatsApp</span>
                </Button>

                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  className="text-xs h-10 px-3 rounded-xl gap-2 font-bold hover:bg-accent active:scale-95 transition-all w-full cursor-pointer"
                >
                  <Download className="size-4 shrink-0" />
                  <span className="truncate">Télécharger en PDF</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ══════════ 1. ROUTINE QUOTIDIENNE PRESCRITE EN SALON (cosmeticsUsed) ══════════ */}
          {cosmeticsUsed ? (
            <Card className="rounded-[26px] border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-card to-card p-4 sm:p-5 space-y-4 shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-xs shrink-0">
                    <Sun size={20} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="font-heading font-black text-base text-foreground truncate">
                      Routine cosmétique quotidienne à domicile
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {prescribedByTenant ? `Prescrite sur-mesure par ${prescribedByTenant}` : "Protocole de soins prescrit par votre dermo-conseillère"}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider shrink-0 gap-1 px-2.5 py-1">
                  <Lock size={11} /> Lecture Seule
                </Badge>
              </div>

              {/* Bloc de la routine exacte saisie côté salon */}
              <div className="rounded-2xl border border-emerald-500/30 bg-card/90 p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <Sparkles size={14} />
                  <span>Vos soins à appliquer quotidiennement chez vous :</span>
                </div>
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground font-medium">
                    {cosmeticsUsed}
                  </p>
                </div>
                <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck size={14} />
                    Validé en institut par votre dermo-conseillère
                  </span>
                  <span className="text-[10px] opacity-75">Modifiable uniquement en salon</span>
                </div>
              </div>
            </Card>
          ) : (
            <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 flex items-start gap-3 text-xs text-muted-foreground">
              <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-foreground">Aucune routine sur-mesure enregistrée en institut pour le moment</p>
                <p className="text-[11px] mt-0.5 leading-relaxed">
                  Votre dermo-conseillère consignera vos produits quotidiens lors de votre prochaine consultation en salon. En attendant, découvrez le protocole de référence ci-dessous :
                </p>
              </div>
            </div>
          )}

          {/* Routine Beauté Active — Les 4 Gestes Dermo-Cosmétiques */}
          <Card className="rounded-[26px] border-2 border-[#C8951E]/40 bg-gradient-to-br from-[#C8951E]/10 via-card to-card p-4 sm:p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 place-items-center rounded-xl bg-gold/25 text-gold-text shadow-xs">
                  <Leaf size={20} />
                </span>
                <div>
                  <h4 className="font-heading font-black text-base text-foreground">
                    Ma Routine Beauté Active
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Protocole dermo-cosmétique ciblé pour peau mélanoderme
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

            {/* Actifs Botaniques Conseillés */}
            <div className="p-3.5 rounded-2xl bg-card/75 border border-border/60 space-y-2">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CauriIcon size={14} className="text-[#C8951E]" />
                Actifs de la Pharmacopée Ouest-Africaine Conseillés :
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

            {/* 💄 Charte Make-Up Dermo-Compatible Peaux Noires & Métisses ou Soin Barbe si Homme */}
            {(user as any)?.gender === "homme" ? (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#C8951E]/12 to-[#8B1A3B]/10 border border-[#C8951E]/30 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary font-black text-xs">
                    <ShieldCheck size={16} />
                    <span>Protocole Rasage &amp; Barbe · Peaux Noires &amp; Métisses</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold border-primary/30 text-primary">
                    Anti-Poils Incarnés
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-card border border-border/80">
                    <p className="font-bold text-foreground">1. Préparation à chaud</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Assouplir le poil frisé avec une serviette tiède ou de l&apos;huile de Balanites avant le rasage.</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-card border border-border/80">
                    <p className="font-bold text-foreground">2. Rasage sens du poil</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Toujours raser dans le sens de pousse du poil sans repasser pour éviter boutons et folliculite.</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-card border border-border/80">
                    <p className="font-bold text-foreground">3. Apaisement sans alcool</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Sceller la zone au Karité pur bio ou baume apaisant Kinkeliba. Zéro parfum piquant.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#C8951E]/12 to-[#8B1A3B]/10 border border-[#C8951E]/30 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary font-black text-xs">
                    <DuafeIcon size={16} />
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
            )}

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
              <h3 className="font-heading font-black text-base sm:text-lg text-foreground flex items-center gap-2">
                <NsorommaIcon className="size-5 text-gold-text shrink-0" />
                <span>Comparateur Évolutif Avant / Après</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Appréciez les transformations de votre peau et l&apos;atténuation visible des imperfections
              </p>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-black self-start sm:self-auto px-3 py-1 rounded-full flex items-center gap-1.5">
              <KeneSunIcon className="size-3.5" />
              <span>+14 pts de vitalité Visia</span>
            </Badge>
          </div>

          {/* Onglets de sélection de source : Cas Clinique Témoin vs Mes Scans */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-muted/60 border border-border">
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                setAvantApresSource("clinical");
              }}
              className={cn(
                "h-9 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                avantApresSource === "clinical"
                  ? "bg-card text-foreground shadow-xs border border-border/80 font-black"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <NsorommaIcon className="size-3.5 text-gold-text" />
              <span>Cas Clinique Kènè (30j)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                setAvantApresSource("client");
              }}
              className={cn(
                "h-9 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                avantApresSource === "client"
                  ? "bg-card text-foreground shadow-xs border border-border/80 font-black"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <DuafeIcon className="size-3.5 text-primary" />
              <span>Mes Scans Personnels ({validWithImages.length})</span>
            </button>
          </div>

          {/* Note explicative selon le mode sélectionné */}
          <div className="rounded-xl p-3 bg-muted/30 border border-border/70 text-xs space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              {avantApresSource === "clinical" ? (
                <>
                  <CauriIcon className="size-3.5 text-gold-text shrink-0" />
                  <span>Cas clinique de référence · Phototype mélanoderme V</span>
                </>
              ) : (
                <>
                  <Camera className="size-3.5 text-primary shrink-0" />
                  <span>Vos scans cutanés réels enregistrés</span>
                </>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {comparisonData.description}
            </p>
          </div>

          {/* Sélecteur de séances pour les scans personnels avec filtre par zone */}
          {avantApresSource === "client" && validWithImages.length >= 2 && (
            <div className="p-3 rounded-2xl bg-card border border-border/80 shadow-2xs space-y-3">
              {/* Filtres de zone pour comparer uniquement la même zone */}
              {availableComparisonZones.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10.5px] font-bold text-muted-foreground mr-1">Zone :</span>
                  {availableComparisonZones.map(({ zone, count }) => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => setComparisonZone(zone)}
                      className={cn(
                        "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize border",
                        comparisonZone === zone
                          ? "bg-primary/15 text-primary border-primary ring-1 ring-primary/20 shadow-xs"
                          : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {zone.replace("_", " ")} ({count})
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-xs font-bold text-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" />
                  Sélectionner les deux bilans à comparer :
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-mono">
                  {zoneValidWithImages.length} clichés {comparisonZone.replace("_", " ")}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 block mb-1">
                    Cliché 1 · Séance Avant (J0)
                  </label>
                  <select
                    value={beforeDiag?.id || ""}
                    onChange={(e) => setSelectedBeforeId(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg bg-background border border-border text-xs text-foreground font-medium focus:ring-1 focus:ring-primary"
                  >
                    {zoneValidWithImages.map((d) => (
                      <option key={`before-${d.id}`} value={d.id}>
                        {formatDate(d.createdAt)} — {d.zone?.replace("_", " ") || "Visage"} ({d.scoreGlobal ?? 0}/100)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block mb-1">
                    Cliché 2 · Séance Après (Suivi)
                  </label>
                  <select
                    value={afterDiag?.id || ""}
                    onChange={(e) => setSelectedAfterId(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg bg-background border border-border text-xs text-foreground font-medium focus:ring-1 focus:ring-primary"
                  >
                    {zoneValidWithImages.map((d) => (
                      <option key={`after-${d.id}`} value={d.id}>
                        {formatDate(d.createdAt)} — {d.zone?.replace("_", " ") || "Visage"} ({d.scoreGlobal ?? 0}/100)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Curseur interactif Avant/Après & Côte à côte */}
          <div className="max-w-xl mx-auto pt-1 space-y-2">
            <BeforeAfterSlider
              key={`${avantApresSource}-${beforeDiag?.id || "default"}-${afterDiag?.id || "default"}`}
              beforePhoto={comparisonData.beforePhoto}
              afterPhoto={comparisonData.afterPhoto}
              beforeLabel={comparisonData.beforeLabel}
              afterLabel={comparisonData.afterLabel}
              beforeDate={comparisonData.beforeDate}
              afterDate={comparisonData.afterDate}
              beforeScore={comparisonData.beforeScore}
              afterScore={comparisonData.afterScore}
              zoneLabel={comparisonData.zoneLabel}
              defaultLayoutMode={comparisonData.defaultLayoutMode}
            />

            {avantApresSource === "client" && validWithImages.length < 2 && (
              <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/70 text-center space-y-2">
                <p className="text-xs text-foreground font-semibold">
                  {validWithImages.length === 1
                    ? "Votre premier scan de référence est bien enregistré. Réalisez votre scan de contrôle à J+30 pour générer votre comparatif personnel."
                    : "Prenez votre photo de référence Jour 0 pour démarrer votre historique Avant / Après personnalisé."}
                </p>
                <Button
                  size="sm"
                  onClick={onStartScan || (() => setClientTab("diagnostic"))}
                  className="k-btn-gold text-primary-foreground text-xs font-black h-9 px-4 rounded-xl gap-1.5 shadow-sm"
                >
                  <ScanFace size={15} />
                  <span>{validWithImages.length === 1 ? "Capturer mon scan de contrôle (J+30)" : "Capturer ma photo Jour 0"}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Mesure des progrès cutanés objectifs */}
          <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-border/60 text-center">
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Taches &amp; PIH</p>
              <p className="text-lg font-black text-emerald-500 font-heading mt-0.5">-70%</p>
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
            {/* Filtres de zone rapides dans la galerie */}
            {availableComparisonZones.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setComparisonZone("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border",
                    comparisonZone === "all"
                      ? "bg-primary/15 text-primary border-primary ring-1 ring-primary/20 shadow-xs"
                      : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  Tout ({lightboxPhotos.length})
                </button>
                {availableComparisonZones.map(({ zone, count }) => (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => setComparisonZone(zone)}
                    className={cn(
                      "px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize border",
                      comparisonZone === zone
                        ? "bg-primary/15 text-primary border-primary ring-1 ring-primary/20 shadow-xs"
                        : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {zone.replace("_", " ")} ({count})
                  </button>
                ))}
              </div>
            )}
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
              {lightboxPhotos
                .filter((p) => comparisonZone === "all" || (p.zone || "visage") === comparisonZone)
                .map((photo, idx) => (
                <div
                  key={photo.id}
                  onClick={() => openPhotoLightbox(photo.id)}
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

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          haptic(HAPTIC.light);
                          toast.info(`Ordonnance beauté du ${formatDate(diag.createdAt)} chargée`);
                          setActiveView("dossier");
                        }}
                        className="h-8.5 text-xs font-bold rounded-xl hover:bg-accent cursor-pointer"
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
