"use client";

// Kènè Pro — Visite Guidée & Formation Interactive Étape par Étape (2026)
// S'adapte automatiquement au profil connecté :
// • Gérante / Direction (Coulibaly Norbert)
// • Praticienne Cabine & Dermo-conseillère (Edith, Déborah, Delphine)
// • Réceptionniste & Caisse POS (Irène)
// • Responsable Stock & Logistique (Clément)
// Permet de tester chaque action en 1 clic ("Essayer maintenant") ou de suivre le parcours pas à pas.

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  LogIn,
  MessageSquare,
  ScanFace,
  CreditCard,
  Package,
  Calendar,
  LayoutDashboard,
  Bell,
  ArrowRight,
  ArrowLeft,
  X,
  CheckCircle2,
  Play,
  Sparkles,
  Volume2,
} from "lucide-react";
import { KeneEmblem } from "@/components/kene/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HAPTIC, haptic, playTeamAlertSound, unlockTeamAudio } from "@/lib/kene/ux";
import type { ProSectionId } from "./ProEnterpriseShell";

export const PRO_TOUR_STORAGE_KEY_PREFIX = "kene_pro_walkthrough_v1_";

export interface ProWalkthroughTourProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  userRole: string;
  isOwner: boolean;
  tenantName: string;
  onNavigate: (section: ProSectionId) => void;
  onOpenTeamHub: (openHandoff?: boolean) => void;
}

interface ProTourStep {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  stepsList: string[];
  tip: string;
  icon: React.ReactNode;
  gradient: string;
  pillColor: string;
  ctaLabel?: string;
  onTriggerAction?: () => void;
}

export function ProWalkthroughTour({
  open,
  onOpenChange,
  userName,
  userRole,
  isOwner,
  tenantName,
  onNavigate,
  onOpenTeamHub,
}: ProWalkthroughTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const roleLower = (userRole || "").toLowerCase();

  // Construction dynamique des étapes selon le rôle exact dans le salon
  const steps = useMemo<ProTourStep[]>(() => {
    // 1. PARCOURS GÉRANTE / DIRECTION
    if (isOwner || roleLower === "manager" || roleLower.includes("gerant")) {
      return [
        {
          id: "owner-dashboard",
          badge: "Étape 1 / 5 • Pilotage Salon",
          title: `Bienvenue dans le Cockpit de ${tenantName}`,
          subtitle: "Suivez votre chiffre d'affaires, vos cabines et votre équipe en temps réel",
          stepsList: [
            "Consultez vos KPIs du jour (Ventes Caisse, Rendez-vous Cabine, Dépenses et Trésorerie) dès l'ouverture.",
            "Naviguez entre vos 5 pôles métiers (Pilotage, Cabine, Caisse & Stock, Relation Clientes, RH & Compta OHADA) via la barre du bas ou le menu gauche.",
            "Utilisez le bouton « Secrétariat & Rappels » pour laisser l'IA préparer vos relances WhatsApp clientes.",
          ],
          tip: "Astuce : Tout encaissement saisi par la caisse met à jour votre tableau de bord instantanément sans recharger la page.",
          icon: <LayoutDashboard className="size-10 text-[#E5A93C]" />,
          gradient: "from-[#D49A24]/25 via-[#D49A24]/5 to-transparent",
          pillColor: "bg-gold/15 text-gold-text border-gold/30",
          ctaLabel: "Voir le Tableau de bord",
          onTriggerAction: () => {
            onOpenChange(false);
            onNavigate("dashboard");
          },
        },
        {
          id: "owner-team-live",
          badge: "Étape 2 / 5 • Kènè Team Live (Zéro WhatsApp)",
          title: "Coordonnez l'équipe avec Sonnerie & Vibreur",
          subtitle: "Remplace WhatsApp pour Edith, Déborah, Delphine, Irène et Clément",
          stepsList: [
            "Touchez le bouton « Kènè Team » en haut à droite pour ouvrir la messagerie interne du salon.",
            "Publiez la « Consigne du Jour » et l'objectif de la Cagnotte Collective avec le crayon d'édition.",
            "Envoyez un message ou une note vocale : les téléphones de l'équipe sonnent et vibrent immédiatement.",
          ],
          tip: "Astuce : Dans Kènè Team, touchez « 🔊 Sonnerie & Vibreur » pour tester le carillon d'alerte sur un nouveau téléphone.",
          icon: <MessageSquare className="size-10 text-emerald-500" />,
          gradient: "from-emerald-500/25 via-emerald-500/5 to-transparent",
          pillColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
          ctaLabel: "Ouvrir Kènè Team Live",
          onTriggerAction: () => {
            unlockTeamAudio();
            playTeamAlertSound("message");
            onOpenChange(false);
            onOpenTeamHub(false);
          },
        },
        {
          id: "owner-clinique",
          badge: "Étape 3 / 5 • Clinique & Agenda Cabine",
          title: "Diagnostics Visia IA & Agenda des Praticiennes",
          subtitle: "Suivi dermo-biométrique d'Edith, Déborah et Delphine",
          stepsList: [
            "Dans « 📸 Diagnostic Peau », prenez en photo la cliente pour générer son ordonnance beauté personnalisée.",
            "Dans « 🔬 Dossiers Cutanés », comparez les photos Avant / Après et suivez les cures en cours.",
            "Dans « Agenda & Soins », assignez chaque rendez-vous à Edith, Déborah ou Delphine.",
          ],
          tip: "Astuce : Vous pouvez imprimer ou partager l'ordonnance PDF directement sur le WhatsApp de la cliente.",
          icon: <ScanFace className="size-10 text-primary" />,
          gradient: "from-primary/25 via-primary/5 to-transparent",
          pillColor: "bg-primary/15 text-primary border-primary/30",
          ctaLabel: "Ouvrir l'Agenda Cabine",
          onTriggerAction: () => {
            onOpenChange(false);
            onNavigate("agenda");
          },
        },
        {
          id: "owner-pos",
          badge: "Étape 4 / 5 • Caisse POS & Commissions",
          title: "Encaissement & Attribution par Praticienne",
          subtitle: "Espèces, Wave, Orange Money, MTN et calcul automatique des primes",
          stepsList: [
            "Quand une praticienne termine un soin, elle envoie une « Sortie → Caisse » qui pré-remplit le ticket de caisse.",
            "Sur chaque ligne du panier (soin ou produit), choisissez ou vérifiez la praticienne créditée pour sa commission.",
            "En fin de journée, cliquez sur « Clôture de Caisse Z » pour verrouiller le bilan journalier.",
          ],
          tip: "Astuce : La caisse fonctionne même en cas de coupure Internet et se synchronise dès le retour du réseau.",
          icon: <CreditCard className="size-10 text-[#E5A93C]" />,
          gradient: "from-[#D49A24]/25 via-[#D49A24]/5 to-transparent",
          pillColor: "bg-gold/15 text-gold-text border-gold/30",
          ctaLabel: "Ouvrir la Caisse POS",
          onTriggerAction: () => {
            onOpenChange(false);
            onNavigate("caisse");
          },
        },
        {
          id: "owner-hr-compta",
          badge: "Étape 5 / 5 • RH, Paie CNPS & Compta OHADA",
          title: "Pointage GPS, Bulletins de Paie & Sauvegardes",
          subtitle: "Gestion administrative complète et sécurisée",
          stepsList: [
            "Dans « Équipe & Pointage », suivez les heures d'arrivée/sortie validées par GPS au salon.",
            "Dans « Paie & Cotisations », éditez les bulletins de salaire incluant automatiquement les commissions du mois.",
            "Dans « Compta SYSCOHADA », exportez votre Grand Livre PDF/CSV pour votre comptable.",
          ],
          tip: "Astuce : Vous pouvez relancer ce guide à tout moment via le bouton « 🎓 Guide » en haut de l'écran.",
          icon: <CheckCircle2 className="size-10 text-emerald-500" />,
          gradient: "from-emerald-500/25 via-emerald-500/5 to-transparent",
          pillColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
          ctaLabel: "Gérer l'Équipe & Pointage",
          onTriggerAction: () => {
            onOpenChange(false);
            onNavigate("equipe");
          },
        },
      ];
    }

    // 2. PARCOURS RÉCEPTIONNISTE / CAISSIÈRE (ex: Irène)
    if (roleLower.includes("reception") || roleLower.includes("caiss")) {
      return [
        {
          id: "rec-pointage",
          badge: "Étape 1 / 4 • Arrivée au Salon",
          title: `Bienvenue ${userName} ! Pointez en 1 clic`,
          subtitle: "Votre rituel d'ouverture de journée à l'accueil",
          stepsList: [
            "Dès votre arrivée au cabinet, touchez le bouton vert « Pointer mon arrivée » en haut de votre écran.",
            "Lisez la « Consigne du Jour » épinglée par la direction sur votre tableau de bord.",
            "Vérifiez la liste des rendez-vous attendus aujourd'hui.",
          ],
          tip: "Astuce : N'oubliez pas de toucher « Pointer ma sortie » avant de quitter l'institut le soir.",
          icon: <LogIn className="size-10 text-emerald-500" />,
          gradient: "from-emerald-500/25 via-emerald-500/5 to-transparent",
          pillColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        },
        {
          id: "rec-beep-arrival",
          badge: "Étape 2 / 4 • Bip Cliente Arrivée",
          title: "Prévenir la Cabine sans vous déplacer",
          subtitle: "Fini les allers-retours ou les messages WhatsApp perdus",
          stepsList: [
            "Quand une cliente arrive à l'accueil, ouvrez « Kènè Team » (ou cliquez sur « Bip Cliente arrivée »).",
            "Sélectionnez la praticienne (Edith, Déborah ou Delphine) et saisissez le nom de la cliente.",
            "Touchez « Sonner la praticienne » : son téléphone en cabine sonne et vibre immédiatement !",
          ],
          tip: "Astuce : Vous verrez la mention « Vu par Edith ✓✓ » dès qu'elle a lu votre alerte.",
          icon: <Bell className="size-10 text-[#E5A93C]" />,
          gradient: "from-[#D49A24]/25 via-[#D49A24]/5 to-transparent",
          pillColor: "bg-gold/15 text-gold-text border-gold/30",
          ctaLabel: "Tester un Bip Accueil → Cabine",
          onTriggerAction: () => {
            unlockTeamAudio();
            playTeamAlertSound("client_arrived");
            onOpenChange(false);
            onOpenTeamHub(false);
          },
        },
        {
          id: "rec-pos-handoff",
          badge: "Étape 3 / 4 • Encaissement Caisse POS",
          title: "Encaisser les Sorties de Cabine en 1 clic",
          subtitle: "Zéro erreur de prix et commission praticienne garantie",
          stepsList: [
            "Quand une cliente sort de cabine, votre téléphone sonne et affiche « Sortie de Cabine → Caisse ».",
            "Ouvrez « Ventes & Caisse » : un bandeau vert vous propose les sorties de cabine en attente.",
            "Cliquez sur « Charger au panier » : les soins, produits et le nom de la praticienne se remplissent tout seuls !",
            "Choisissez le mode de paiement (Espèces, Wave, Orange Money, Carte) et validez.",
          ],
          tip: "Astuce : Vous pouvez aussi attribuer une praticienne différente sur chaque ligne du panier avant d'encaisser.",
          icon: <CreditCard className="size-10 text-emerald-500" />,
          gradient: "from-emerald-500/25 via-emerald-500/5 to-transparent",
          pillColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
          ctaLabel: "Ouvrir la Caisse POS",
          onTriggerAction: () => {
            onOpenChange(false);
            onNavigate("caisse");
          },
        },
        {
          id: "rec-agenda-crm",
          badge: "Étape 4 / 4 • Agenda & Fiches Clientes",
          title: "Planifier les RDV & Relances",
          subtitle: "Fidélisation de la clientèle du cabinet",
          stepsList: [
            "Dans « Agenda & Soins », créez un nouveau RDV en choisissant le soin et la praticienne (Edith, Déborah, Delphine).",
            "Dans « CRM Clientes », retrouvez l'historique complet des achats et soins de chaque cliente.",
          ],
          tip: "Vous pouvez rouvrir ce guide étape par étape à tout moment via le bouton « 🎓 Guide » en haut.",
          icon: <Calendar className="size-10 text-primary" />,
          gradient: "from-primary/25 via-primary/5 to-transparent",
          pillColor: "bg-primary/15 text-primary border-primary/30",
          ctaLabel: "Ouvrir l'Agenda",
          onTriggerAction: () => {
            onOpenChange(false);
            onNavigate("agenda");
          },
        },
      ];
    }

    // 3. PARCOURS RESPONSABLE STOCK (ex: Clément)
    if (roleLower.includes("stock")) {
      return [
        {
          id: "stock-pointage",
          badge: "Étape 1 / 3 • Arrivée & Consigne",
          title: `Bienvenue ${userName} ! Pointage & Priorités`,
          subtitle: "Gestion des stocks et réassort des cabines",
          stepsList: [
            "Touchez « Pointer mon arrivée » en haut de l'écran en arrivant au cabinet.",
            "Vérifiez la Consigne du Jour et le « Produit Focus » mis en avant par la direction.",
          ],
          tip: "Gardez le son de votre téléphone actif pour entendre les demandes de réassort des cabines.",
          icon: <LogIn className="size-10 text-emerald-500" />,
          gradient: "from-emerald-500/25 via-emerald-500/5 to-transparent",
          pillColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        },
        {
          id: "stock-alerts",
          badge: "Étape 2 / 3 • Bips Besoin Cabine (#Stock)",
          title: "Recevoir les demandes urgentes des praticiennes",
          subtitle: "Livraison rapide en Cabine 1, Cabine 2 ou Comptoir",
          stepsList: [
            "Lorsqu'Edith, Déborah ou Delphine manque d'un produit en plein soin, elle clique sur « Besoin Cabine ».",
            "Votre téléphone sonne et vibre avec le nom exact du produit et le numéro de la cabine.",
            "Ouvrez « Kènè Team » → canal « # Stock » pour confirmer la livraison en 1 clic.",
          ],
          tip: "Touchez « 🔊 Sonnerie & Vibreur » dans Kènè Team pour vérifier que votre alerte sonore est bien active.",
          icon: <Bell className="size-10 text-[#E5A93C]" />,
          gradient: "from-[#D49A24]/25 via-[#D49A24]/5 to-transparent",
          pillColor: "bg-gold/15 text-gold-text border-gold/30",
          ctaLabel: "Ouvrir le canal #Stock",
          onTriggerAction: () => {
            unlockTeamAudio();
            playTeamAlertSound("need_product");
            onOpenChange(false);
            onOpenTeamHub(false);
          },
        },
        {
          id: "stock-inventory",
          badge: "Étape 3 / 3 • Inventaire & Seuils d'Alerte",
          title: "Ajuster les quantités et éviter les ruptures",
          subtitle: "Suivi rigoureux des cosmétiques et consommables",
          stepsList: [
            "Ouvrez « Inventaire Stock » pour voir les produits en alerte de seuil critique.",
            "Ajoutez les réceptions fournisseurs (+ Réassort) ou signalez une anomalie à la direction.",
          ],
          tip: "Chaque vente encaissée par Irène déduit automatiquement le stock en temps réel.",
          icon: <Package className="size-10 text-primary" />,
          gradient: "from-primary/25 via-primary/5 to-transparent",
          pillColor: "bg-primary/15 text-primary border-primary/30",
          ctaLabel: "Ouvrir l'Inventaire Stock",
          onTriggerAction: () => {
            onOpenChange(false);
            onNavigate("stock");
          },
        },
      ];
    }

    // 4. PARCOURS PRATICIENNE CABINE / ESTHÉTICIENNE / DERMO-CONSEILLÈRE (Edith, Déborah, Delphine)
    return [
      {
        id: "prac-pointage",
        badge: "Étape 1 / 4 • Arrivée & Planning Cabine",
        title: `Bienvenue ${userName} ! Votre journée en 1 coup d'œil`,
        subtitle: "Pointage GPS, Consigne du jour et vos clientes attendues",
        stepsList: [
          "En arrivant au salon, touchez « Pointer mon arrivée » sur votre carte d'accueil.",
          "Consultez la « Consigne du Jour » et le produit focus à conseiller à vos clientes.",
          "Quand votre cliente arrive à l'accueil, Irène vous envoie un Bip : votre téléphone sonne et vibre !",
        ],
        tip: "Astuce : Activez « 🔊 Sonnerie & Vibreur » dans Kènè Team pour ne jamais manquer l'arrivée d'une cliente.",
        icon: <LogIn className="size-10 text-emerald-500" />,
        gradient: "from-emerald-500/25 via-emerald-500/5 to-transparent",
        pillColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      },
      {
        id: "prac-diag",
        badge: "Étape 2 / 4 • Diagnostic Peau & Dossier Cutané",
        title: "Analyser la peau & prescrire la routine",
        subtitle: "Scanner Visia IA et suivi Avant / Après en cabine",
        stepsList: [
          "Ouvrez « 📸 Diagnostic Peau » pour photographier la zone (Visage, Cou, Dos, Mains) de votre cliente.",
          "L'IA analyse les biomarqueurs (taches, sébum, hydratation) et génère l'ordonnance de soins et produits.",
          "Retrouvez tout l'historique photos et les notes techniques dans « 🔬 Dossiers Cutanés ».",
        ],
        tip: "Astuce : En cabine avec des gants, utilisez le bouton Micro dans Kènè Team pour dicter une note vocale mains-libres !",
        icon: <ScanFace className="size-10 text-primary" />,
        gradient: "from-primary/25 via-primary/5 to-transparent",
        pillColor: "bg-primary/15 text-primary border-primary/30",
        ctaLabel: "Lancer un Diagnostic Peau",
        onTriggerAction: () => {
          onOpenChange(false);
          onNavigate("diagnostic");
        },
      },
      {
        id: "prac-handoff",
        badge: "Étape 3 / 4 • Sortie de Cabine → Caisse",
        title: "Transmettez le panier à Irène & verrouillez votre commission",
        subtitle: "Fini les oublis de produits conseillés ou d'attribution de commission !",
        stepsList: [
          "À la fin du soin, touchez le bouton doré « Transmettre Sortie de Cabine → Caisse » (ou dans Kènè Team).",
          "Choisissez la cliente et touchez les soins réalisés + les produits que vous lui avez conseillés.",
          "Validez : le téléphone de la caisse sonne, le ticket d'Irène est déjà prêt et votre commission est créditée à votre nom !",
        ],
        tip: "Vos commissions sur les soins et sur les produits vendus s'ajoutent automatiquement sur votre tableau de bord.",
        icon: <CreditCard className="size-10 text-[#E5A93C]" />,
        gradient: "from-[#D49A24]/25 via-[#D49A24]/5 to-transparent",
        pillColor: "bg-gold/15 text-gold-text border-gold/30",
        ctaLabel: "Tester une Sortie → Caisse",
        onTriggerAction: () => {
          onOpenChange(false);
          onOpenTeamHub(true);
        },
      },
      {
        id: "prac-stock-beep",
        badge: "Étape 4 / 4 • Besoin Produit en Cabine",
        title: "Appelez Clément (Stock) en 1 clic sans quitter votre soin",
        subtitle: "Réassort immédiat en Cabine 1, Cabine 2 ou Salle Diagnostic",
        stepsList: [
          "Il vous manque un sérum, des gants ou du coton pendant un soin ?",
          "Ouvrez « Kènè Team » → touchez « Besoin Cabine », indiquez votre cabine et le produit.",
          "Clément reçoit une alerte sonore immédiate pour vous l'apporter.",
        ],
        tip: "Vous pouvez revoir ce guide à tout moment en touchant le bouton « 🎓 Guide » en haut de l'application.",
        icon: <Package className="size-10 text-amber-500" />,
        gradient: "from-amber-500/25 via-amber-500/5 to-transparent",
        pillColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        ctaLabel: "Ouvrir Kènè Team Live",
        onTriggerAction: () => {
          onOpenChange(false);
          onOpenTeamHub(false);
        },
      },
    ];
  }, [isOwner, roleLower, tenantName, userName, onNavigate, onOpenChange, onOpenTeamHub]);

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
    }
  }, [open]);

  if (!open) return null;

  const step = steps[currentStep] || steps[0];

  const handleClose = () => {
    haptic(HAPTIC.tap);
    onOpenChange(false);
  };

  const handleNext = () => {
    haptic(HAPTIC.tap);
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      haptic(HAPTIC.success);
      onOpenChange(false);
    }
  };

  const handlePrev = () => {
    haptic(HAPTIC.tap);
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative w-full max-w-xl bg-card border border-gold/40 rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        >
          {/* Lueur d'ambiance */}
          <div
            className={`pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-gradient-to-b ${step.gradient} blur-3xl opacity-75 transition-all duration-500`}
          />

          {/* En-tête */}
          <div className="relative z-10 flex items-center justify-between px-5 sm:px-6 pt-5 pb-2">
            <div className="flex items-center gap-2.5">
              <KeneEmblem size={36} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-tight text-foreground">
                    Guide Interactif Kènè Pro
                  </span>
                  <Badge className="bg-gold/15 text-gold-text border-gold/30 text-[9.5px] py-0 px-2">
                     Parcours {isOwner ? "Direction" : userName}
                  </Badge>
                </div>
                <span className="text-[10.5px] text-muted-foreground block font-mono">
                  Étape {currentStep + 1} sur {steps.length} · {tenantName}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="h-8 w-8 rounded-full bg-muted/60 hover:bg-muted border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              aria-label="Fermer le guide"
              title="Fermer le guide"
            >
              <X size={15} />
            </button>
          </div>

          {/* Barre de progression cliquable */}
          <div className="relative z-10 flex items-center gap-1.5 px-5 sm:px-6 pt-2 pb-3">
            {steps.map((_, idx) => (
              <div
                key={idx}
                onClick={() => {
                  haptic(HAPTIC.tap);
                  setCurrentStep(idx);
                }}
                className={`h-1.5 flex-1 rounded-full cursor-pointer transition-all duration-300 ${
                  idx === currentStep
                    ? "bg-gold shadow-xs"
                    : idx < currentStep
                    ? "bg-gold/45"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Corps de l'étape */}
          <div className="relative z-10 px-5 sm:px-6 py-2 overflow-y-auto pretty-scroll flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.22 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-center shrink-0">
                    {step.icon}
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${step.pillColor}`}
                    >
                      {step.badge}
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-foreground mt-1 tracking-tight leading-snug">
                      {step.title}
                    </h3>
                    <p className="text-xs font-bold text-gold-text mt-0.5">{step.subtitle}</p>
                  </div>
                </div>

                {/* Liste numérotée étape par étape */}
                <div className="rounded-2xl border border-border/80 bg-muted/25 p-3.5 space-y-2.5">
                  {step.stepsList.map((line, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-foreground leading-relaxed">
                      <span className="size-5 rounded-full bg-gold/20 border border-gold/40 text-gold-text font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>

                {/* Astuce métier */}
                <div className="p-3 rounded-xl bg-gold/10 border border-gold/30 text-[11.5px] text-foreground font-medium flex items-start gap-2">
                  <Compass size={15} className="text-gold-text shrink-0 mt-0.5" />
                  <span>{step.tip}</span>
                </div>

                {/* Bouton d'action directe pour pratiquer l'étape */}
                {step.ctaLabel && step.onTriggerAction && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic(HAPTIC.medium);
                      step.onTriggerAction?.();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-gold/50 bg-gold/15 hover:bg-gold/25 text-gold-text font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <Play size={13} className="fill-current" />
                    <span>Essayer maintenant : {step.ctaLabel}</span>
                  </button>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Pied de modale : Navigation Précédent / Suivant */}
          <div className="relative z-10 p-5 sm:px-6 pt-3 bg-card border-t border-border/60 flex items-center justify-between gap-3 shrink-0">
            {currentStep > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                className="rounded-xl h-10 px-3.5 text-xs font-bold gap-1.5"
              >
                <ArrowLeft size={14} />
                Précédent
              </Button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 font-medium cursor-pointer"
              >
                Passer le guide
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  unlockTeamAudio();
                  playTeamAlertSound("message");
                }}
                title="Tester le son du guide"
                className="h-10 px-2.5 rounded-xl border border-border/70 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
              >
                <Volume2 size={14} className="text-gold-text" />
                <span className="hidden sm:inline">Tester Son</span>
              </button>

              {currentStep < steps.length - 1 ? (
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="k-btn-gold rounded-xl h-10 px-5 text-xs font-black text-[#18120C] gap-1.5 shadow-sm"
                >
                  Étape suivante
                  <ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-5 text-xs font-black gap-1.5 shadow-sm"
                >
                  <Sparkles size={14} />
                  J&apos;ai compris, commencer !
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
