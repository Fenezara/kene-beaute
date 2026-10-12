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
} from "lucide-react";
import { toast } from "sonner";
import { useKene } from "@/store/kene";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { scoreColor } from "@/lib/kene/format";
import { CauriIcon } from "@/components/kene/icons";
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

  const currentInstitute = useMemo(() => {
    if (!institutes || institutes.length === 0) return null;
    if (defaultInstituteId) {
      const found = institutes.find((i) => i.id === defaultInstituteId);
      if (found) return found;
    }
    const userCity = (user?.city || "").toLowerCase().trim();
    if (userCity) {
      const match = institutes.find((i) => i.city.toLowerCase().includes(userCity));
      if (match) return match;
    }
    return institutes[0] || null;
  }, [defaultInstituteId, institutes, user?.city]);

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

            {/* Titre & promesse synthétique */}
            <div className="space-y-1">
              <h3 className="font-heading font-black text-xl sm:text-2xl leading-tight text-[#FFF9EC] tracking-tight">
                Comprends ta peau en 30 secondes
              </h3>
              <p className="text-xs sm:text-sm text-[#EADCC9]/85 leading-snug">
                Bilan IA instantané &amp; protocole botanique adapté à ta mélanine.
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
                  <span className="block leading-tight font-black">Scanner ma peau</span>
                  <span className="block text-[10.5px] font-semibold opacity-85">Photo directe · Analyse gratuite</span>
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
                <span className="text-[9.5px] text-[#EADCC9]/70">Instantané</span>
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
                <span className="text-[9.5px] text-[#EADCC9]/70">Sécurisé</span>
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
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-wider text-primary">
                <CheckCircle2 size={13} />
                Bilan Cutané Actif
              </span>
              <h3 className="font-heading font-black text-lg sm:text-xl text-foreground leading-tight truncate">
                {user.fitzpatrick ? `Phototype Fitzpatrick ${user.fitzpatrick}` : "Profil Mélanoderme"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Score santé global : <strong className="text-foreground">{globalScore ?? lastDiag.scoreGlobal}/100</strong>
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

      {/* ───── 3. CONCIERGERIE PRIVÉE KÈNÈ (WHATSAPP DÉDIÉ) ───── */}
      <section
        aria-label="Conciergerie Privée Kènè"
        className="rounded-[24px] border border-[#25D366]/30 bg-gradient-to-br from-[#25D366]/10 via-[#25D366]/5 to-transparent p-4 sm:p-5 flex flex-col gap-2.5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white shadow-md">
              <MessageCircle size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-heading font-black text-sm text-foreground truncate">
                Conciergerie WhatsApp
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Conseils, soins cabine &amp; commandes en direct
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenInstituteWhatsApp}
            className="shrink-0 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
          >
            <MessageCircle size={14} />
            Échanger
          </button>
        </div>

        {/* Passerelle vers le Support d'écoute Kènè */}
        {onOpenContactKene && (
          <div className="pt-2 border-t border-[#25D366]/20 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Besoin d&apos;orientation ?</span>
            <button
              type="button"
              onClick={onOpenContactKene}
              className="font-bold text-primary hover:underline"
            >
              Support Kènè →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
