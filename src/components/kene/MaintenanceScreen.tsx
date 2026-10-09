"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Wrench,
  Clock,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeneEmblem, CauriIcon } from "@/components/kene/icons";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import type { MaintenanceConfig } from "@/lib/kene/maintenance";

interface MaintenanceScreenProps {
  config: MaintenanceConfig;
  onRefresh?: () => void;
}

export function MaintenanceScreen({ config, onRefresh }: MaintenanceScreenProps) {
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    haptic(HAPTIC.medium);
    setChecking(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
    } finally {
      window.setTimeout(() => setChecking(false), 800);
    }
  };

  const handleEmergencyWhatsApp = () => {
    haptic(HAPTIC.tap);
    const phone = config.emergencyPhone || "+2250748894270";
    const text = "Bonjour l'équipe Kènè ! 🌿 Je constate que l'application est en maintenance. J'ai une question urgente concernant mon compte ou un rendez-vous.";
    openWhatsApp(phone, text, "CI");
  };

  return (
    <div className="min-h-dvh w-full bg-gradient-to-br from-[#1C1611] via-[#2A1F17] to-[#140F0B] text-[#FFF9EC] flex flex-col items-center justify-between p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Motifs géométriques décoratifs subtils en fond */}
      <div aria-hidden="true" className="absolute -right-20 -top-20 size-80 rounded-full bg-[#C8951E]/15 blur-3xl pointer-events-none" />
      <div aria-hidden="true" className="absolute -left-20 -bottom-20 size-72 rounded-full bg-[#8B1A3B]/20 blur-3xl pointer-events-none" />
      <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-10 pointer-events-none" />

      {/* Header Logo */}
      <header className="w-full max-w-md pt-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#C8951E]/20 border border-[#C8951E]/40 text-[#E3B04B] shadow-md">
            <KeneEmblem size={24} />
          </span>
          <div>
            <span className="font-heading font-black text-lg tracking-wider text-[#FFF9EC] block leading-none">
              KÈNÈ
            </span>
            <span className="text-[10px] text-[#EADCC9]/70 font-semibold tracking-widest uppercase">
              Beauté Mélanoderme
            </span>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-[10.5px] font-bold text-amber-300">
          <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
          Maintenance
        </span>
      </header>

      {/* Corps principal : Carte d'affiche */}
      <main className="w-full max-w-md py-6 my-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-[32px] border border-[#C8951E]/30 bg-[#241A13]/90 backdrop-blur-xl p-6 sm:p-7 shadow-2xl space-y-6 text-center"
        >
          {/* Badge & Icône animée */}
          <div className="mx-auto flex flex-col items-center gap-3">
            <div className="relative">
              <div className="grid size-18 place-items-center rounded-3xl bg-gradient-to-br from-[#C8951E]/30 to-[#8B1A3B]/30 border-2 border-[#C8951E]/50 text-[#E3B04B] shadow-inner">
                <Wrench className="size-8 animate-bounce" />
              </div>
              <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-[#C8951E] text-[#1A1410] shadow-sm">
                <Sparkles size={13} />
              </span>
            </div>

            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#E3B04B]">
                <CauriIcon size={12} /> Mise à jour plateforme
              </span>
              <h1 className="font-heading font-black text-2xl sm:text-3xl text-[#FFF9EC] leading-tight">
                Kènè fait peau neuve
              </h1>
            </div>
          </div>

          {/* Message officiel rédigé par l'administrateur */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs sm:text-sm text-[#EADCC9]/90 leading-relaxed text-left space-y-2">
            <p>{config.message}</p>
            <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-[11px] text-[#E3B04B]">
              <ShieldCheck size={14} className="shrink-0" />
              <span>Vos soins, réservations et données restent intacts et sécurisés.</span>
            </div>
          </div>

          {/* Heure de retour estimée (si renseignée) */}
          {config.estimatedEnd && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-3.5 py-2 text-xs font-bold text-amber-200">
              <Clock size={15} className="text-amber-300" />
              <span>Retour en ligne estimé : {config.estimatedEnd}</span>
            </div>
          )}

          {/* Actions : Réactualiser & Assistance WhatsApp d'urgence */}
          <div className="space-y-2.5 pt-2">
            <Button
              onClick={handleRefresh}
              disabled={checking}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#C8951E] via-[#D8A228] to-[#B37F14] hover:brightness-105 text-[#1A1410] font-heading font-black text-sm shadow-lg gap-2 active:scale-98 transition-all"
            >
              <RefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Vérification en cours..." : "Vérifier la réouverture"}
            </Button>

            <Button
              variant="outline"
              onClick={handleEmergencyWhatsApp}
              className="w-full h-11 rounded-2xl border-[#25D366]/40 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] font-bold text-xs gap-2"
            >
              <MessageCircle size={15} />
              Contacter le support d&apos;urgence sur WhatsApp
            </Button>
          </div>
        </motion.div>
      </main>

      {/* Footer & Accès Console d'administration */}
      <footer className="w-full max-w-md pb-2 text-center text-[10.5px] text-[#EADCC9]/60 space-y-2 relative z-10">
        <p>© {new Date().getFullYear()} Kènè · Dermo TIC — Tous droits réservés</p>
        <div>
          <a
            href="/console"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#EADCC9]/40 hover:text-[#E3B04B] transition-colors"
          >
            <Lock size={10} /> Accès Console Administrateur
          </a>
        </div>
      </footer>
    </div>
  );
}
