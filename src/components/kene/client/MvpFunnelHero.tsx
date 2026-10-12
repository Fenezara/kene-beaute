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
  Sparkles,
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
    if (!institutes || institutes.length === 0) {
      if (user?.selectedTenant) {
        return {
          id: user.selectedTenant.id,
          name: user.selectedTenant.name,
          city: user.selectedTenant.city,
          address: user.selectedTenant.address || "",
          phone: user.selectedTenant.phone || "",
          ownerPhone: user.selectedTenant.ownerPhone || user.selectedTenant.phone || "",
          country: user.selectedTenant.country || "CI",
        } as any;
      }
      return null;
    }
    // 1. Institut coché explicitement par la cliente
    if (user?.selectedTenantId) {
      const selected = institutes.find((i) => i.id === user.selectedTenantId);
      if (selected) return selected;
    }
    if (user?.selectedTenant?.id) {
      const selected = institutes.find((i) => i.id === user.selectedTenant?.id);
      if (selected) return selected;
    }
    // 2. Institut passé en default
    if (defaultInstituteId) {
      const found = institutes.find((i) => i.id === defaultInstituteId);
      if (found) return found;
    }
    // 3. Correspondance ville
    const userCity = (user?.city || "").toLowerCase().trim();
    if (userCity) {
      const match = institutes.find((i) => i.city.toLowerCase().includes(userCity));
      if (match) return match;
    }
    return institutes[0] || null;
  }, [user?.selectedTenantId, user?.selectedTenant, defaultInstituteId, institutes, user?.city]);

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
      {/* ───── 1. CARTE HERO PRINCIPALE : LE DIAGNOSTIC DE PEAU (PRODUIT PHARE #1) ───── */}
      {!lastDiag ? (
        // ÉTAT 1 : Nouvelle cliente / Bilan de peau offert pour convaincre & convertir
        <section
          aria-label="Diagnostic cutané Kènè — Produit phare n°1"
          className="relative overflow-hidden rounded-[28px] border-2 border-[#C8951E]/60 bg-gradient-to-br from-[#1C1611] via-[#2A1F17] to-[#18130E] text-[#FFF9EC] p-5 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
        >
          {/* Halos dorés & texture bogolan */}
          <div aria-hidden="true" className="absolute -right-10 -top-10 size-56 rounded-full bg-[#C8951E]/25 blur-3xl pointer-events-none" />
          <div aria-hidden="true" className="absolute -left-12 -bottom-12 size-48 rounded-full bg-[#8B1A3B]/30 blur-2xl pointer-events-none" />
          <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-20 pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-4.5">
            {/* Badges d'excellence & Preuve sociale */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C8951E]/25 border border-[#C8951E]/60 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#FFD875] shadow-xs">
                <CauriIcon size={13} className="animate-pulse" />
                🥇 Produit Phare · Dermo-Botanique Africaine
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#EADCC9]/90 bg-[#FFF9EC]/10 px-2.5 py-0.5 rounded-full">
                <Sparkles size={11} className="text-[#FFD875]" /> +14 800 bilans réalisés
              </span>
            </div>

            {/* Titre & promesse choc */}
            <div className="space-y-1.5">
              <h3 className="font-heading font-black text-xl sm:text-[26px] leading-[1.2] text-[#FFF9EC] tracking-tight">
                Comprends enfin ta peau en 30 secondes chrono
              </h3>
              <p className="text-xs sm:text-[13.5px] text-[#EADCC9]/90 leading-relaxed font-medium">
                La 1<sup>ère</sup> IA dermo-botanique entraînée spécifiquement pour les <strong>phototypes III à VI</strong> (peaux noires, mates et métissées). Diagnostic immédiat et ordonnance botanique sur-mesure aux actifs purs d&apos;Afrique de l&apos;Ouest (Karité sauvage, Moringa, Balanites).
              </p>
            </div>

            {/* Gros Bouton CTA Principal Magnétique */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleStartScan}
              className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#C8951E] via-[#F3C258] to-[#B37F14] text-[#1A1410] font-heading font-black text-sm sm:text-base py-4 px-5 shadow-[0_6px_25px_rgba(200,149,30,0.45)] hover:shadow-[0_8px_30px_rgba(200,149,30,0.6)] flex items-center justify-between transition-all group"
            >
              <div className="flex items-center gap-3.5">
                <span className="grid size-11 place-items-center rounded-xl bg-[#1A1410] text-[#FFD875] shadow-md transition-transform group-hover:scale-110">
                  <ScanFace size={24} />
                </span>
                <div className="text-left">
                  <span className="block leading-tight text-sm sm:text-base font-black tracking-tight">
                    LANCER MON BILAN DE PEAU (30s) · OFFERT
                  </span>
                  <span className="block text-[11px] font-semibold opacity-90">
                    Photo directe sans filtre · Bilan cutané &amp; ordonnance immédiats
                  </span>
                </div>
              </div>
              <ChevronRight size={22} className="transition-transform group-hover:translate-x-1.5 text-[#1A1410]" />
            </motion.button>

            {/* 4 Puces de confiance immédiates & réassurance */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#FFF9EC]/15">
              <div className="flex items-center gap-2 bg-[#FFF9EC]/5 rounded-xl p-2 border border-[#FFF9EC]/10">
                <span className="grid size-6 place-items-center rounded-lg bg-[#C8951E]/20 text-[#FFD875] shrink-0">
                  <Zap size={13} />
                </span>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-[#FFF9EC] leading-tight">30s chrono</p>
                  <p className="text-[9.5px] text-[#EADCC9]/70 leading-tight">Résultat direct</p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-[#FFF9EC]/5 rounded-xl p-2 border border-[#FFF9EC]/10">
                <span className="grid size-6 place-items-center rounded-lg bg-[#C8951E]/20 text-[#FFD875] shrink-0">
                  <CauriIcon size={13} />
                </span>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-[#FFF9EC] leading-tight">Phototypes III-VI</p>
                  <p className="text-[9.5px] text-[#EADCC9]/70 leading-tight">Spécial mélanine</p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-[#FFF9EC]/5 rounded-xl p-2 border border-[#FFF9EC]/10">
                <span className="grid size-6 place-items-center rounded-lg bg-[#C8951E]/20 text-[#FFD875] shrink-0">
                  <ShieldCheck size={13} />
                </span>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-[#FFF9EC] leading-tight">100% privé</p>
                  <p className="text-[9.5px] text-[#EADCC9]/70 leading-tight">0 photo stockée</p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-[#FFF9EC]/5 rounded-xl p-2 border border-[#FFF9EC]/10">
                <span className="grid size-6 place-items-center rounded-lg bg-[#C8951E]/20 text-[#FFD875] shrink-0">
                  <Leaf size={13} />
                </span>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-[#FFF9EC] leading-tight">Actifs purs</p>
                  <p className="text-[9.5px] text-[#EADCC9]/70 leading-tight">Karité, Moringa</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        // ÉTAT 2 : Cliente ayant déjà au moins un diagnostic actif — Valorisation absolue de son score
        <section
          aria-label="Mon bilan cutané Kènè — Produit phare n°1"
          className="relative overflow-hidden rounded-[28px] border-2 border-[#C8951E]/40 bg-gradient-to-br from-card via-card/95 to-card p-5 sm:p-6 backdrop-blur-md shadow-lg"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-primary">
                  <CheckCircle2 size={13} />
                  🥇 Mon Bilan Cutané Actif
                </span>
                <span className="text-[11px] font-bold text-muted-foreground">
                  {user.fitzpatrick ? `Phototype Fitzpatrick ${user.fitzpatrick}` : "Profil Mélanoderme"}
                </span>
              </div>
              <h3 className="font-heading font-black text-xl sm:text-2xl text-foreground leading-tight">
                Santé globale de votre peau
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                Score calculé par intelligence artificielle dermo-botanique. Votre protocole d&apos;actifs est calibré pour ce profil.
              </p>
            </div>

            {/* Médaillon Score Impérial */}
            <div className="flex items-center gap-3 shrink-0 self-center sm:self-auto bg-muted/40 p-2.5 rounded-2xl border border-border/80">
              <div
                className="grid size-16 place-items-center rounded-2xl font-heading font-black text-2xl shadow-sm"
                style={{
                  backgroundColor: `${scoreColor(globalScore ?? lastDiag.scoreGlobal)}20`,
                  color: scoreColor(globalScore ?? lastDiag.scoreGlobal),
                  border: `2px solid ${scoreColor(globalScore ?? lastDiag.scoreGlobal)}`,
                }}
              >
                {globalScore ?? lastDiag.scoreGlobal}
              </div>
              <div className="text-left">
                <span className="block text-[11px] font-black uppercase tracking-wider text-foreground">Score Santé</span>
                <span className="block text-[10px] text-muted-foreground">sur 100 points</span>
              </div>
            </div>
          </div>

          {/* Boutons d'action rapides */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-5 pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={onOpenRoutine}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-heading font-black text-xs sm:text-sm py-3 px-4 shadow-sm hover:bg-primary/95 transition-all"
            >
              <Leaf size={16} />
              Mon Ordonnance Botanique Sur-Mesure
            </button>
            <button
              type="button"
              onClick={handleStartScan}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background hover:bg-accent text-foreground font-heading font-bold text-xs sm:text-sm py-3 px-4 transition-all"
            >
              <ScanFace size={16} className="text-primary" />
              Nouveau contrôle de peau (30s)
            </button>
          </div>
          <p className="text-[11px] text-center text-muted-foreground mt-2">
            💡 Contrôle recommandé tous les 14 jours pour mesurer l&apos;évolution de votre grain de peau.
          </p>
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
