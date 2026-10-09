"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ScanFace,
  ChevronRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  MessageCircle,
  Leaf,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { useKene } from "@/store/kene";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { scoreColor } from "@/lib/kene/format";
import { CauriIcon } from "@/components/kene/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ApiDiagnosis, ApiInstitute } from "./types";

interface MvpFunnelHeroProps {
  lastDiag: ApiDiagnosis | null;
  globalScore: number | null;
  institutes?: ApiInstitute[];
  defaultInstituteId?: string;
  onStartScan: () => void;
  onOpenRoutine: () => void;
  onOpenContactKene?: () => void;
}

export function MvpFunnelHero({
  lastDiag,
  globalScore,
  institutes = [],
  defaultInstituteId,
  onStartScan,
  onOpenRoutine,
  onOpenContactKene,
}: MvpFunnelHeroProps) {
  const user = useKene((s) => s.user)!;

  const [selectedInstituteId, setSelectedInstituteId] = useState<string>(() => {
    if (defaultInstituteId) return defaultInstituteId;
    if (institutes.length > 0) return institutes[0].id;
    return "";
  });
  const [selectorOpen, setSelectorOpen] = useState(false);

  useEffect(() => {
    if (defaultInstituteId) {
      setSelectedInstituteId(defaultInstituteId);
    } else if (!selectedInstituteId && institutes.length > 0) {
      const userCity = (user?.city || "").toLowerCase().trim();
      const match = userCity ? institutes.find((i) => i.city.toLowerCase().includes(userCity)) : null;
      setSelectedInstituteId(match?.id ?? institutes[0].id);
    }
  }, [defaultInstituteId, institutes, selectedInstituteId, user?.city]);

  const currentInstitute = useMemo(() => {
    if (!institutes || institutes.length === 0) return null;
    return institutes.find((i) => i.id === selectedInstituteId) || institutes[0] || null;
  }, [institutes, selectedInstituteId]);

  // Ouverture WhatsApp vers la première responsable de l'institut partenaire
  const handleOpenInstituteWhatsApp = () => {
    haptic(HAPTIC.tap);
    if (!currentInstitute) {
      toast.info("Aucun institut partenaire disponible pour le moment");
      return;
    }

    const targetPhone = currentInstitute.ownerPhone?.trim() || currentInstitute.phone?.trim();
    if (!targetPhone) {
      toast.error(`Coordonnées WhatsApp de ${currentInstitute.name} indisponibles`);
      return;
    }

    const managerName = currentInstitute.ownerName?.trim();
    const instName = currentInstitute.name?.trim() || "votre institut";
    const text = `Bonjour ${managerName ? `Mme ${managerName} (${instName})` : instName} ! 🌿 Je suis ${user.name || "une cliente"} sur l'application Kènè. J'aimerais échanger avec vous concernant mes soins et recommandations personnalisées.`;
    const country = currentInstitute.country === "SN" ? "SN" : "CI";

    openWhatsApp(targetPhone, text, country);
  };

  const handleStartScan = () => {
    haptic(HAPTIC.medium);
    onStartScan();
  };

  return (
    <div className="flex flex-col gap-4.5">
      {/* ───── 1. CARTE HERO PRINCIPALE : L'APPEL AU DIAGNOSTIC ───── */}
      {!lastDiag ? (
        // ÉTAT 1 : Nouvelle cliente / Aucun diagnostic encore réalisé
        <section
          aria-label="Diagnostic cutané Kènè"
          className="relative overflow-hidden rounded-[28px] border border-[#C8951E]/40 bg-gradient-to-br from-[#1C1611] via-[#2A1F17] to-[#18130E] text-[#FFF9EC] p-5 sm:p-6 shadow-xl"
        >
          {/* Motifs géométriques décoratifs subtils en fond */}
          <div aria-hidden="true" className="absolute -right-12 -top-12 size-48 rounded-full bg-[#C8951E]/15 blur-3xl" />
          <div aria-hidden="true" className="absolute -left-10 -bottom-10 size-40 rounded-full bg-[#8B1A3B]/20 blur-2xl" />
          <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-15 pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-4">
            {/* Badge supérieur */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C8951E]/20 border border-[#C8951E]/40 px-3 py-1 text-[10.5px] font-black uppercase tracking-wider text-[#E3B04B]">
                <CauriIcon size={12} className="animate-pulse" />
                Haute Précision Dermo-Botanique Africaine
              </span>
            </div>

            {/* Titre & promesse */}
            <div className="space-y-1.5">
              <h3 className="font-heading font-black text-xl sm:text-2xl leading-tight text-[#FFF9EC] tracking-tight">
                Comprends ta peau en 30 secondes &amp; révèle son éclat
              </h3>
              <p className="text-xs sm:text-[13px] text-[#EADCC9]/85 leading-relaxed">
                Photo selfie instantanée ou 3 questions simples. Un diagnostic bienveillant sans tabou, formulé spécifiquement pour les peaux noires &amp; métissées.
              </p>
            </div>

            {/* Gros Bouton CTA Principal */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleStartScan}
              className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#C8951E] via-[#D8A228] to-[#B37F14] text-[#1A1410] font-heading font-black text-sm sm:text-base py-3.5 px-4 shadow-[0_4px_20px_rgba(200,149,30,0.35)] flex items-center justify-between transition-all group"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[#1A1410]/15 text-[#1A1410] transition-transform group-hover:scale-110">
                  <ScanFace size={22} />
                </span>
                <div className="text-left">
                  <span className="block leading-tight font-black">Lancer mon Diagnostic Gratuit</span>
                  <span className="block text-[10.5px] font-semibold opacity-85">Bilan dermo-biométrique · Zéro frais</span>
                </div>
              </div>
              <ChevronRight size={20} className="transition-transform group-hover:translate-x-1" />
            </motion.button>

            {/* 3 Puces de confiance immédiates */}
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#FFF9EC]/10 text-center">
              <div className="flex flex-col items-center gap-0.5">
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#E3B04B]">
                  <Zap size={12} /> 30s chrono
                </span>
                <span className="text-[9.5px] text-[#EADCC9]/70">Gratuit &amp; direct</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#E3B04B]">
                  <Leaf size={12} /> Actifs purs
                </span>
                <span className="text-[9.5px] text-[#EADCC9]/70">Karité, Moringa</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#E3B04B]">
                  <ShieldCheck size={12} /> 100% privé
                </span>
                <span className="text-[9.5px] text-[#EADCC9]/70">Données sécurisées</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        // ÉTAT 2 : Cliente ayant déjà au moins un diagnostic actif
        <section
          aria-label="Mon bilan cutané Kènè"
          className="relative overflow-hidden rounded-[28px] border border-[#C8951E]/30 bg-card/90 p-5 backdrop-blur-md shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary">
                <CheckCircle2 size={13} />
                Ton Bilan Cutané Actif
              </span>
              <h3 className="font-heading font-black text-lg sm:text-xl text-foreground leading-tight">
                {user.fitzpatrick ? `Phototype Fitzpatrick ${user.fitzpatrick}` : "Profil Cutané Mélanoderme"}
              </h3>
              <p className="text-xs text-muted-foreground leading-snug">
                Dernière analyse effectuée avec succès. Ta routine personnalisée est prête.
              </p>
            </div>

            {/* Score avec badge */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className="grid size-14 place-items-center rounded-2xl font-heading font-black text-xl shadow-sm"
                style={{
                  backgroundColor: `${scoreColor(globalScore ?? lastDiag.scoreGlobal)}20`,
                  color: scoreColor(globalScore ?? lastDiag.scoreGlobal),
                  border: `2px solid ${scoreColor(globalScore ?? lastDiag.scoreGlobal)}`,
                }}
              >
                {globalScore ?? lastDiag.scoreGlobal}
              </div>
              <span className="text-[9.5px] font-semibold text-muted-foreground mt-1">Score Santé</span>
            </div>
          </div>

          {/* Boutons d'action rapides */}
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            <button
              type="button"
              onClick={onOpenRoutine}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-heading font-bold text-xs py-2.5 px-3 shadow-xs hover:bg-primary/95 transition-all"
            >
              <Leaf size={15} />
              Ma Routine Idéale
            </button>
            <button
              type="button"
              onClick={handleStartScan}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background hover:bg-accent text-foreground font-heading font-bold text-xs py-2.5 px-3 transition-all"
            >
              <ScanFace size={15} className="text-primary" />
              Re-scanner ma peau
            </button>
          </div>
        </section>
      )}

      {/* ───── 3. ÉCHANGER AVEC LA RESPONSABLE DE L'INSTITUT SUR WHATSAPP ───── */}
      <section
        aria-label="Contacter la responsable de l'institut"
        className="rounded-2xl border border-[#25D366]/30 bg-[#25D366]/5 p-3.5 sm:p-4 flex flex-col gap-2.5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white shadow-sm">
              <MessageCircle size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-heading font-bold text-xs sm:text-sm text-foreground truncate">
                Une question ? Échanger avec la responsable
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] text-muted-foreground truncate">
                  {currentInstitute ? (
                    <>
                      <span className="font-semibold text-foreground">{currentInstitute.name}</span>
                      {currentInstitute.ownerName && (
                        <span> · {currentInstitute.ownerName}</span>
                      )}
                    </>
                  ) : (
                    "Institut partenaire · Conseil personnalisé & soins"
                  )}
                </p>
                {institutes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectorOpen(true)}
                    className="text-[10px] font-bold text-primary underline underline-offset-2 hover:opacity-80"
                  >
                    (Changer)
                  </button>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenInstituteWhatsApp}
            className="shrink-0 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-[11px] px-3.5 py-2 flex items-center gap-1.5 shadow-xs transition-transform active:scale-95"
          >
            <MessageCircle size={14} />
            Discuter
          </button>
        </div>

        {/* Passerelle vers le Support Kènè */}
        {onOpenContactKene && (
          <div className="pt-2 border-t border-[#25D366]/20 flex items-center justify-between text-[10.5px] text-muted-foreground">
            <span>Une question sur l&apos;application Kènè ?</span>
            <button
              type="button"
              onClick={onOpenContactKene}
              className="font-bold text-primary hover:underline"
            >
              Contactez le support Kènè →
            </button>
          </div>
        )}
      </section>

      {/* Dialogue de sélection de l'institut partenaire */}
      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="max-w-md p-5 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading font-bold text-base flex items-center gap-2">
              <Store size={18} className="text-primary" />
              Choisir votre institut partenaire
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sélectionnez l&apos;établissement avec lequel vous souhaitez échanger directement sur WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto pretty-scroll space-y-2 py-2 pr-1">
            {institutes.map((inst) => {
              const active = inst.id === currentInstitute?.id;
              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => {
                    setSelectedInstituteId(inst.id);
                    setSelectorOpen(false);
                    toast.success(`Institut sélectionné : ${inst.name}`);
                  }}
                  className={cn(
                    "w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-3",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50 bg-card"
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-xs text-foreground truncate">{inst.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {inst.city} · {inst.ownerName ? `Gérante : ${inst.ownerName}` : "Institut certifié"}
                    </p>
                  </div>
                  {active && (
                    <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
