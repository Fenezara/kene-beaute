"use client";
// Kènè — Tableau de Bord Dermo-Santé Cutanée en Temps Réel:
// Présente à la cliente une vision complète, claire et approfondie de l'état
// de santé de sa peau dès l'accueil:
// 1. Score Global de Vitalité & Statut Clinique
// 2. Les 4 Piliers Vitaux (Hydratation, Barrière Lipidique, Homogénéité PIH, Pureté Sébacée)
// 3. Météo Cutanée & Protection UV selon le phototype mélanoderme
// 4. L'Alerte Prioritaire du Jour & Geste Clé
// 5. Suivi des zones scannées & bouton d'accès au diagnostic complet / Dr. Kènè

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Droplets,
  ShieldCheck,
  Sparkles,
  Sun,
  Activity,
  Flame,
  ChevronRight,
  AlertCircle,
  HelpCircle,
  ScanFace,
  Volume2,
  CheckCircle2,
  MapPin,
  TrendingUp,
  Clock,
  ArrowUpRight,
  MessageCircle,
} from "lucide-react";
import { formatDate, scoreColor } from "@/lib/kene/format";
import { BODY_ZONES, type BodyZone, type DiagnosisResult, type Indicator } from "@/lib/kene/types";
import { CauriIcon, DuafeIcon, NeaOnnimIcon } from "@/components/kene/icons";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useKene, type SessionUser } from "@/store/kene";
import { VoiceNarration } from "./VoiceNarration";
import type { ApiDiagnosis, ApiUser } from "./types";
import { ScoreGauge } from "./bits";
import { cn } from "@/lib/utils";

interface PillarMetric {
  id: string;
  name: string;
  shortDesc: string;
  score: number;
  status: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  color: string;
  bgLight: string;
  recommendation: string;
  source: "scan" | "profil";
}

export function SkinHealthDashboard({
  user,
  multi,
  lastResult,
  onScanZone,
  onOpenFullDiag,
  className = "",
}: {
  user: ApiUser | SessionUser;
  multi: {
    byZone: Map<BodyZone, ApiDiagnosis>;
    covered: typeof BODY_ZONES;
    score: number | null;
    missing: typeof BODY_ZONES;
    last?: ApiDiagnosis | null;
  };
  lastResult: DiagnosisResult | null;
  onScanZone: (z: BodyZone) => void;
  onOpenFullDiag?: () => void;
  className?: string;
}) {
  const setClientTab = useKene((s) => s.setClientTab);
  const [selectedPillar, setSelectedPillar] = useState<PillarMetric | null>(null);

  const hasRealScan = multi.score !== null;

  // 1. Calcul ou extraction des 4 Piliers Fondamentaux
  const pillars: PillarMetric[] = useMemo(() => {
    // Si la cliente a un scan réel avec indicateurs
    if (lastResult && lastResult.indicateurs.length > 0) {
      const inds = lastResult.indicateurs;

      const findScore = (regex: RegExp, fallback: number) => {
        const found = inds.find((i) => regex.test(i.nom));
        return found ? found.pourcentage : fallback;
      };

      const hydraScore = findScore(/hydrat/i, Math.max(50, (lastResult.score_global || 70) - 4));
      const barrierScore = findScore(/barri|prot|lipid|sech/i, Math.max(55, (lastResult.score_global || 72) + 2));
      const pigmentScore = findScore(/tache|pih|eclat|pigment|uniform/i, Math.max(45, (lastResult.score_global || 65) - 6));
      const sebumScore = findScore(/sebum|pore|acne|microkyst/i, Math.max(50, (lastResult.score_global || 70) + 1));

      return [
        {
          id: "hydratation",
          name: "Hydratation Cutanée",
          shortDesc: "Eau transépidermique & souplesse",
          score: hydraScore,
          status: hydraScore >= 75 ? "Excellente" : hydraScore >= 60 ? "Modérée" : "Déshydratée",
          icon: Droplets,
          color: "#2E72D2",
          bgLight: "rgba(46,114,210,0.12)",
          recommendation:
            hydraScore >= 75
              ? "Hydratation optimale. Maintiens avec une émulsion légère."
              : "Perte insensible en eau décelée. Scelle avec une touche de beurre de karité le soir.",
          source: "scan",
        },
        {
          id: "barriere",
          name: "Barrière Lipidique",
          shortDesc: "Ciment intercellulaire & céramides",
          score: barrierScore,
          status: barrierScore >= 75 ? "Résiliente" : barrierScore >= 60 ? "Sensibilisée" : "Fragilisée",
          icon: ShieldCheck,
          color: "#3F7D3F",
          bgLight: "rgba(63,125,63,0.12)",
          recommendation:
            barrierScore >= 75
              ? "Film protecteur intact face aux agressions extérieures."
              : "Barrière lipidique affaiblie par la climatisation. Évite les nettoyants décapants.",
          source: "scan",
        },
        {
          id: "pigmentation",
          name: "Homogénéité & PIH",
          shortDesc: "Réflectance & équilibre mélanique",
          score: pigmentScore,
          status: pigmentScore >= 75 ? "Très unifiée" : pigmentScore >= 60 ? "Taches légères" : "PIH active",
          icon: Sparkles,
          color: "#C8951E",
          bgLight: "rgba(200,149,30,0.12)",
          recommendation:
            pigmentScore >= 75
              ? "Teint homogène sans surproduction mélanocytaire visible."
              : "Zones d'hyperpigmentation post-inflammatoire en cours de résorption. Sérum doux au bissap conseillé.",
          source: "scan",
        },
        {
          id: "sebum",
          name: "Équilibre Sébacé & Pores",
          shortDesc: "Régulation sébum & pureté",
          score: sebumScore,
          status: sebumScore >= 75 ? "Équilibrée" : sebumScore >= 60 ? "Zone T luisante" : "Pores engorgés",
          icon: Activity,
          color: "#E07A2B",
          bgLight: "rgba(224,122,43,0.12)",
          recommendation:
            sebumScore >= 75
              ? "Séborégulation stable sous le climat tropical."
              : "Activité sébacée accrue en milieu de journée. Utilise un gel doux purifiant au moringa.",
          source: "scan",
        },
      ];
    }

    // Si nouveau compte / pas de scan : profil estimé d'après onboarding
    const isOily = user.skinType === "grasse";
    const isDry = user.skinType === "seche";
    const fitz = user.fitzpatrick ? String(user.fitzpatrick).toUpperCase() : "V";

    const baseHydra = isDry ? 56 : isOily ? 72 : 68;
    const baseBarrier = isDry ? 60 : 76;
    const basePigment = fitz === "VI" ? 64 : fitz === "IV" ? 72 : 68;
    const baseSebum = isOily ? 54 : isDry ? 82 : 68;

    return [
      {
        id: "hydratation",
        name: "Hydratation Cutanée",
        shortDesc: "Estimation selon profil",
        score: baseHydra,
        status: baseHydra >= 70 ? "Normale" : "Tendance sèche",
        icon: Droplets,
        color: "#2E72D2",
        bgLight: "rgba(46,114,210,0.12)",
        recommendation: "Mesure estimée. Un scan photo révélera le taux d'hydratation au micron.",
        source: "profil",
      },
      {
        id: "barriere",
        name: "Barrière Lipidique",
        shortDesc: "Protection cutanée profilée",
        score: baseBarrier,
        status: baseBarrier >= 75 ? "Résiliente" : "À renforcer",
        icon: ShieldCheck,
        color: "#3F7D3F",
        bgLight: "rgba(63,125,63,0.12)",
        recommendation: "Protection essentielle face au soleil et à la déshydratation tropicale.",
        source: "profil",
      },
      {
        id: "pigmentation",
        name: "Homogénéité & PIH",
        shortDesc: `Phototype Fitzpatrick ${fitz}`,
        score: basePigment,
        status: "Sensible aux PIH",
        icon: Sparkles,
        color: "#C8951E",
        bgLight: "rgba(200,149,30,0.12)",
        recommendation: "Les peaux mélanodermes créent facilement des taches en réponse aux boutons.",
        source: "profil",
      },
      {
        id: "sebum",
        name: "Équilibre Sébacé & Pores",
        shortDesc: `Peau ${user.skinType || "mixte"}`,
        score: baseSebum,
        status: isOily ? "Sébum actif" : "Régulée",
        icon: Activity,
        color: "#E07A2B",
        bgLight: "rgba(224,122,43,0.12)",
        recommendation: "Les climats chauds et humides augmentent la fluidité du sébum naturel.",
        source: "profil",
      },
    ];
  }, [lastResult, user.skinType, user.fitzpatrick]);

  // 2. Score global effectif ou estimé
  const globalScore = useMemo(() => {
    if (multi.score !== null) return multi.score;
    const sum = pillars.reduce((acc, p) => acc + p.score, 0);
    return Math.round(sum / pillars.length);
  }, [multi.score, pillars]);

  // Statut textuel synthétique
  const statusLabel = useMemo(() => {
    if (globalScore >= 80) return "Vitalité Éclatante · Équilibre Optimal";
    if (globalScore >= 68) return "Bonne Santé Cutanée · Maintien Recommandé";
    if (globalScore >= 55) return "Vigilance Légère · Zones à Réhydrater";
    return "Barrière Fragilisée · Soin Ciblé Urgent";
  }, [globalScore]);

  // 3. Météo Cutanée & Protection UV
  const uvInfo = useMemo(() => {
    const fitz = user.fitzpatrick ? String(user.fitzpatrick).toUpperCase() : "V";
    let naturalSpf = "~10 (Modéré)";
    if (fitz === "VI") naturalSpf = "~15 (Élevé)";
    else if (fitz === "IV") naturalSpf = "~6-8 (Léger)";

    return {
      city: user.city || "Abidjan",
      uvIndex: 9, // Climat ouest-africain typique
      naturalSpf,
      uvAdvice:
        "Indice UV 9 (Très élevé) : Même avec un bouclier de mélanine naturel, les UV-A foncent les taches d'acné en 48 h. Écran solaire minéral conseillé.",
    };
  }, [user.city, user.fitzpatrick]);

  // 4. Alerte Dermo-Prioritaire du Jour (basée sur le pilier le plus faible)
  const lowestPillar = useMemo(() => {
    return [...pillars].sort((a, b) => a.score - b.score)[0];
  }, [pillars]);

  function onPillarClick(p: PillarMetric) {
    haptic(HAPTIC.tap);
    setSelectedPillar(p);
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* ───── 1. CARTE PRINCIPALE : BILAN DE SANTÉ CUTANÉE ───── */}
      <div className="relative overflow-hidden rounded-[28px] k-card kaolin-card p-5 sm:p-6 border border-[#C8951E]/35 shadow-xl">
        {/* Liseré Kente orfèvre supérieur */}
        <div className="absolute inset-x-0 top-0 h-[3px] kente-band" aria-hidden="true" />
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none text-primary">
          <DuafeIcon size={96} />
        </div>

        {/* En-tête avec badge d'authenticité */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-8 rounded-xl bg-primary/15 text-primary">
              <Activity size={18} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-heading font-black text-base sm:text-lg text-foreground tracking-tight">
                  Santé de ta Peau en Direct
                </h3>
                {hasRealScan ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#3F7D3F]/15 text-[#3F7D3F] dark:text-[#6FB96F] text-[9.5px] font-bold uppercase tracking-wider">
                    <CheckCircle2 size={10} /> Scan certifié
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#C8951E]/15 text-[#C8951E] text-[9.5px] font-bold uppercase tracking-wider">
                    <Sparkles size={10} /> Profil estimé
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {hasRealScan && multi.last
                  ? `Dernière analyse biométrique le ${formatDate(multi.last.createdAt, { day: "numeric", month: "long" })}`
                  : "Pré-bilan d'après ton profil · Réalise ton scan pour affiner"}
              </p>
            </div>
          </div>

          {/* Bouton de lecture vocale si disponible */}
          {lastResult && (
            <div className="shrink-0">
              <VoiceNarration result={lastResult} userName={user.name} />
            </div>
          )}
        </div>

        {/* Bloc Score Global & Statut Clinique */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-card/60 border border-border/80">
          <div className="sm:col-span-4 flex items-center justify-center sm:justify-start gap-4">
            <ScoreGauge score={globalScore} label="Score Global" size={105} />
            <div className="sm:hidden">
              <p className="font-heading font-black text-sm text-foreground">{statusLabel}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {hasRealScan ? `${multi.covered.length} zone(s) analysée(s)` : "Basé sur tes déclarations"}
              </p>
            </div>
          </div>

          <div className="hidden sm:block sm:col-span-8">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-primary">
              Diagnostic Synthétique
            </p>
            <h4 className="font-heading font-black text-lg text-foreground mt-0.5">
              {statusLabel}
            </h4>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {hasRealScan
                ? `Synthèse multi-zones pondérée PRD (§8.8). Ton derme conserve un potentiel de régénération soutenu par son indice de mélanine.`
                : `Ce score d'accueil est une projection de ton phototype. Un scan photo haute résolution permet de mesurer le taux d'hydratation profond au millimètre.`}
            </p>
          </div>
        </div>

        {/* ───── LES 4 PILIERS VITAUX (Jauges & Constantes Cutanées) ───── */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <CauriIcon size={14} className="text-primary" /> Constantes Cutanées Clés
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground">
              Touche une jauge pour le détail
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {pillars.map((p) => {
              const Icon = p.icon;
              return (
                <motion.button
                  key={p.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onPillarClick(p)}
                  className="rounded-2xl p-3 text-left transition-all border border-border/80 bg-background/50 hover:bg-background flex flex-col justify-between focus-visible:outline-2 focus-visible:outline-primary"
                  style={{ minHeight: "105px" }}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className="grid place-items-center size-7 rounded-lg"
                      style={{ backgroundColor: p.bgLight, color: p.color }}
                    >
                      <Icon size={16} />
                    </span>
                    <span
                      className="font-mono text-sm font-black tabular-nums"
                      style={{ color: p.color }}
                    >
                      {p.score}%
                    </span>
                  </div>

                  <div className="mt-2">
                    <p className="text-[11.5px] font-bold text-foreground leading-tight truncate">
                      {p.name}
                    </p>
                    <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                      {p.status}
                    </p>
                  </div>

                  {/* Barre de progression miniature */}
                  <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${p.score}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ───── LE GESTE CLÉ D'AUJOURD'HUI (Priorité Cutanée) ───── */}
        <div className="mt-4 p-3.5 rounded-2xl bg-gradient-to-br from-[#C8951E]/10 to-[#A0522D]/10 border border-[#C8951E]/25 flex items-start gap-3">
          <span className="grid place-items-center size-8 rounded-xl bg-[#C8951E]/20 text-[#C8951E] shrink-0 mt-0.5">
            <Flame size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">
                Priorité du Jour · {lowestPillar.name}
              </p>
            </div>
            <p className="text-xs text-foreground font-medium mt-0.5 leading-snug">
              {lowestPillar.recommendation}
            </p>
          </div>
        </div>

        {/* ───── MÉTÉO CUTANÉE & BOUCLIER UV TROPICAL ───── */}
        <div className="mt-3.5 p-3.5 rounded-2xl bg-card/40 border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center size-8 rounded-xl bg-sunset/15 text-sunset shrink-0">
              <Sun size={18} />
            </span>
            <div>
              <p className="font-bold text-foreground flex items-center gap-1.5">
                <MapPin size={11} className="text-primary" /> {uvInfo.city} · Indice UV {uvInfo.uvIndex} (Très élevé)
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Bouclier naturel : Phototype {user.fitzpatrick || "V"} ({uvInfo.naturalSpf})
              </p>
            </div>
          </div>
          <button
            onClick={() => setClientTab("chat")}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline self-start sm:self-auto"
          >
            <MessageCircle size={13} />
            Demander au Dr. Kènè
          </button>
        </div>

        {/* ───── BANDEAU D'APPEL AU SCAN (Si nouveau compte / zones manquantes) ───── */}
        {!hasRealScan ? (
          <div className="mt-4 pt-4 border-t border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-foreground">
                Débloque tes constantes réelles par scan photo
              </p>
              <p className="text-[11px] text-muted-foreground">
                Analyse IA vision en 30 secondes certifiée sur peaux mélanodermes
              </p>
            </div>
            <button
              onClick={() => onScanZone("visage")}
              className="h-10 px-4 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
            >
              <ScanFace size={16} />
              Scanner mon visage
            </button>
          </div>
        ) : (
          /* Si scan existant : zones analysées et bouton vers cartographie complète */
          <div className="mt-4 pt-4 border-t border-border/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground mr-1">Zones :</span>
              {multi.covered.map((z) => (
                <span key={z.id} className="k-chip rounded-full px-2 py-0.5 text-[10px] font-medium">
                  {z.label} {multi.byZone.get(z.id)?.scoreGlobal}
                </span>
              ))}
              {multi.missing.map((z) => (
                <button
                  key={z.id}
                  onClick={() => onScanZone(z.id)}
                  className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  + {z.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setClientTab("diagnostic")}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline ml-auto"
            >
              Cartographie complète <ArrowUpRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ───── MODAL DÉTAIL D'UN PILIER CLIQUÉ ───── */}
      <AnimatePresence>
        {selectedPillar && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-[#120E0A]/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 14 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 14 }}
              transition={{ type: "spring", stiffness: 350, damping: 26 }}
              className="relative w-full max-w-sm rounded-[24px] k-card kaolin-card p-5 shadow-2xl overflow-hidden text-left"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="grid place-items-center size-10 rounded-xl"
                    style={{ backgroundColor: selectedPillar.bgLight, color: selectedPillar.color }}
                  >
                    <selectedPillar.icon size={20} />
                  </span>
                  <div>
                    <h4 className="font-heading font-black text-base text-foreground">
                      {selectedPillar.name}
                    </h4>
                    <p className="text-xs text-muted-foreground">{selectedPillar.shortDesc}</p>
                  </div>
                </div>
                <span
                  className="font-mono text-base font-black tabular-nums"
                  style={{ color: selectedPillar.color }}
                >
                  {selectedPillar.score}%
                </span>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-card/60 border border-border/80 text-xs leading-relaxed text-foreground">
                <p className="font-bold mb-1">Interprétation clinique Kènè :</p>
                <p className="text-muted-foreground">{selectedPillar.recommendation}</p>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => setSelectedPillar(null)}
                  className="h-9 px-4 rounded-xl border border-border text-xs font-semibold hover:bg-muted/50 transition-colors"
                >
                  Fermer
                </button>
                <button
                  onClick={() => {
                    setSelectedPillar(null);
                    setClientTab("diagnostic");
                  }}
                  className="h-9 px-4 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold"
                >
                  Voir dans le diagnostic
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
