"use client";
// Kènè Cliente — Onglet Agenda & Tous les Types de Rendez-Vous :
// 1. 📅 Tous les Types de RDV (Consultation Dermo-Optique, Soin Esthétique Cabine, Contrôle J+1/J+7/J+30, Coiffure & Trichologie, Onglerie & Pieds, Massage & Corps)
// 2. 🔄 Échéancier automatique de Suivi Post-Diagnostic (J+1 Tolérance, J+7 Observance SPF50, J+30 Bilan Time-Lapse)
// 3. 📦 Mes Commandes & Soins (Commandes WhatsApp saisies par l'entreprise côté Pro)
// 4. 👑 Conciergerie Privée WhatsApp 24/7

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  MapPin,
  MessageCircle,
  Sparkles,
  CalendarDays,
  CheckCircle2,
  Download,
  CalendarPlus,
  ShoppingBag,
  User,
  RefreshCw,
  Scissors,
  Hand,
  Crown,
  Heart,
  ScanFace,
  FileText,
  PackageCheck,
  Stethoscope,
  SlidersHorizontal,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate, formatTime, xof } from "@/lib/kene/format";
import {
  openWhatsApp,
  openWhatsAppAppointmentInquiry,
  openWhatsAppProductOrderInquiry,
} from "@/lib/kene/whatsapp-relay";
import { useKene } from "@/store/kene";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { cn } from "@/lib/utils";
import { BODY_ZONES } from "@/lib/kene/types";
import type { ApiAppointment, ApiDiagnosis, ApiInstitute } from "./types";
import { parseDiagnosis } from "./types";
import { ConciergerieWhatsAppSection } from "./ConciergerieWhatsAppSection";

interface OrderItem {
  id: string;
  label: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

interface OrderData {
  id: string;
  total: number;
  paymentMethod: string;
  deliveryStatus?: string;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryPhone?: string | null;
  createdAt: string;
  items: OrderItem[];
  tenant?: {
    id: string;
    name: string;
    city: string;
    phone?: string | null;
  } | null;
}

export type RdvTypeId =
  | "all"
  | "consultation"
  | "soin"
  | "controle"
  | "coiffure"
  | "onglerie"
  | "massage";

export interface RdvTypeDefinition {
  id: Exclude<RdvTypeId, "all">;
  label: string;
  shortLabel: string;
  categoryName: string;
  defaultServiceName: string;
  description: string;
  durationMin: number;
  indicativePrice: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badgeClass: string;
  cardBorderClass: string;
  iconBgClass: string;
}

export const RDV_TYPES_CATALOG: RdvTypeDefinition[] = [
  {
    id: "consultation",
    label: "Consultation & Diagnostic Dermo-Optique",
    shortLabel: "Consultation Dermo",
    categoryName: "Consultation",
    defaultServiceName: "Consultation dermo-cosmétique & Bilan optique 4 vues",
    description:
      "Bilan cutané complet en cabine (Lumière du jour, Polarisée, UV Wood, Mélanine/Sébum) adapté à votre zone anatomique.",
    durationMin: 45,
    indicativePrice: 15000,
    icon: ScanFace,
    badgeClass:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    cardBorderClass: "border-emerald-500/30 hover:border-emerald-500/60",
    iconBgClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "soin",
    label: "Soin Esthétique Cabine & Éclat",
    shortLabel: "Soin Cabine",
    categoryName: "Soin esthétique",
    defaultServiceName: "Soin esthétique cabine anti-taches PIH & Éclat",
    description:
      "Protocoles traitants pour peaux mélanodermes : peeling doux mandélique/PHA, soin anti-taches PIH, détox acné et hydratation.",
    durationMin: 60,
    indicativePrice: 25000,
    icon: Sparkles,
    badgeClass:
      "bg-[#C8951E]/15 text-[#C8951E] dark:text-[#E3B04B] border-[#C8951E]/30",
    cardBorderClass: "border-[#C8951E]/35 hover:border-[#C8951E]/70",
    iconBgClass: "bg-[#C8951E]/15 text-[#C8951E] dark:text-[#E3B04B]",
  },
  {
    id: "controle",
    label: "Contrôle Cutané & Suivi (J+1 / J+7 / J+30)",
    shortLabel: "Contrôle & Suivi",
    categoryName: "Contrôle",
    defaultServiceName: "Contrôle dermo-cutané & Bilan Time-Lapse J+30",
    description:
      "Vérification de tolérance post-cabine (J+1), point d'observance routine & SPF50 (J+7) et cliché comparatif Avant/Après (J+30).",
    durationMin: 30,
    indicativePrice: 10000,
    icon: CheckCircle2,
    badgeClass:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    cardBorderClass: "border-amber-500/30 hover:border-amber-500/60",
    iconBgClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  {
    id: "coiffure",
    label: "Coiffure & Soin Capillaire / Trichologie",
    shortLabel: "Coiffure & Cheveux",
    categoryName: "Coiffure",
    defaultServiceName: "Soin trichologique cuir chevelu & Coiffure protectrice",
    description:
      "Traitement du cuir chevelu, prévention de l'alopécie de traction (tempes/lisière), détox folliculaire et tresses sans tension.",
    durationMin: 90,
    indicativePrice: 20000,
    icon: Scissors,
    badgeClass:
      "bg-[#A0522D]/15 text-[#A0522D] dark:text-[#E89E78] border-[#A0522D]/30",
    cardBorderClass: "border-[#A0522D]/30 hover:border-[#A0522D]/60",
    iconBgClass: "bg-[#A0522D]/15 text-[#A0522D] dark:text-[#E89E78]",
  },
  {
    id: "onglerie",
    label: "Onglerie, Mains & Pieds Spa",
    shortLabel: "Onglerie & Pieds",
    categoryName: "Onglerie",
    defaultServiceName: "Soin spa Mains & Pieds, Kératolytique talons & Onglerie",
    description:
      "Manucure et pédicure douce, soin réparateur des talons fendillés, callosités, hyperpigmentation des phalanges et beauté des ongles.",
    durationMin: 60,
    indicativePrice: 15000,
    icon: Hand,
    badgeClass:
      "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
    cardBorderClass: "border-purple-500/30 hover:border-purple-500/60",
    iconBgClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  {
    id: "massage",
    label: "Massage, Corps & Gommage Botanique",
    shortLabel: "Massage & Corps",
    categoryName: "Massage & Corps",
    defaultServiceName: "Soin purifiant Dos / Corps, Gommage savon noir & Massage karité",
    description:
      "Gommage traditionnel au savon noir africain, soin anti-imperfections du dos, enveloppement au beurre de karité et drainage.",
    durationMin: 75,
    indicativePrice: 30000,
    icon: Heart,
    badgeClass:
      "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    cardBorderClass: "border-rose-500/30 hover:border-rose-500/60",
    iconBgClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
];

export function classifyAppointmentType(
  category?: string | null,
  serviceName = ""
): RdvTypeDefinition {
  const cat = (category || "").toLowerCase();
  const name = serviceName.toLowerCase();

  if (
    cat.includes("consult") ||
    name.includes("consult") ||
    name.includes("bilan") ||
    name.includes("diagnostic")
  ) {
    return RDV_TYPES_CATALOG[0];
  }
  if (
    cat.includes("control") ||
    cat.includes("contrôle") ||
    name.includes("control") ||
    name.includes("contrôle") ||
    name.includes("suivi") ||
    name.includes("j+30") ||
    name.includes("j+7")
  ) {
    return RDV_TYPES_CATALOG[2];
  }
  if (
    cat.includes("coiff") ||
    cat.includes("capill") ||
    name.includes("coiff") ||
    name.includes("tresse") ||
    name.includes("cheveu") ||
    name.includes("cuir chevelu") ||
    name.includes("tricho")
  ) {
    return RDV_TYPES_CATALOG[3];
  }
  if (
    cat.includes("ongl") ||
    cat.includes("manucure") ||
    cat.includes("pedicure") ||
    name.includes("ongl") ||
    name.includes("vernis") ||
    name.includes("pied") ||
    name.includes("talon")
  ) {
    return RDV_TYPES_CATALOG[4];
  }
  if (
    cat.includes("mass") ||
    cat.includes("corps") ||
    cat.includes("gommage") ||
    name.includes("mass") ||
    name.includes("gommage") ||
    name.includes("dos") ||
    name.includes("karité")
  ) {
    return RDV_TYPES_CATALOG[5];
  }
  return RDV_TYPES_CATALOG[1];
}

function makeGoogleCalendarUrl(appt: ApiAppointment) {
  const start = new Date(appt.startAt);
  const end = new Date(start.getTime() + (appt.durationMin || 60) * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtIso = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
      d.getUTCHours()
    )}${pad(d.getUTCMinutes())}00Z`;

  const title = encodeURIComponent(
    `Soin Kènè : ${appt.service?.name || "Moment de soin"} chez ${
      appt.tenant?.name || "Institut Partenaire"
    }`
  );
  const details = encodeURIComponent(
    `Rendez-vous bien-être Kènè.\nPrestation : ${
      appt.service?.name || "Soin"
    }\nPraticienne : ${appt.resource?.name || "Équipe Kènè"}\nInstitut : ${
      appt.tenant?.name || "Institut Partenaire"
    }\nDurée : ${appt.durationMin || 60} min`
  );
  const location = encodeURIComponent(
    `${appt.tenant?.name || ""}, ${appt.tenant?.address || appt.tenant?.city || "Abidjan"}`
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmtIso(
    start
  )}/${fmtIso(end)}&details=${details}&location=${location}`;
}

export function AgendaScreen() {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);

  const [activeSubTab, setActiveSubTab] = useState<"rdv" | "types" | "commandes" | "conciergerie">("rdv");
  const [selectedRdvType, setSelectedRdvType] = useState<RdvTypeId>("all");
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [diagnoses, setDiagnoses] = useState<ApiDiagnosis[]>([]);
  const [institutes, setInstitutes] = useState<ApiInstitute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Formulaire de réservation rapide d'un type de RDV
  const [quickBookType, setQuickBookType] = useState<RdvTypeDefinition | null>(null);
  const [quickDate, setQuickDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [quickTime, setQuickTime] = useState<string>("14:30");

  // Chargement des rendez-vous, commandes WhatsApp et bilans
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [apptRes, ordersRes, diagRes, instRes] = await Promise.all([
        apiGet<{ appointments: ApiAppointment[] }>(`/api/appointments?userId=${user.id}`).catch(() => ({
          appointments: [],
        })),
        apiGet<{ orders: OrderData[] }>(`/api/orders?userId=${user.id}`).catch(() => ({ orders: [] })),
        apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}`).catch(() => ({
          diagnoses: [],
        })),
        apiGet<{ institutes: ApiInstitute[] }>("/api/institutes").catch(() => ({ institutes: [] })),
      ]);

      setAppointments(apptRes.appointments ?? []);
      setOrders(ordersRes.orders ?? []);
      setDiagnoses(diagRes.diagnoses ?? []);
      setInstitutes(instRes.institutes ?? []);
    } catch (e) {
      console.error("[AgendaScreen] Erreur de chargement:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user.id]);

  const handleRefresh = () => {
    haptic(HAPTIC.light);
    setRefreshing(true);
    loadData(true).then(() => {
      toast.success("Agenda & types de RDV actualisés en direct");
    });
  };

  const selectedInst = useMemo(() => {
    if (user.selectedTenantId && institutes.length > 0) {
      return institutes.find((i) => i.id === user.selectedTenantId) ?? null;
    }
    return user.selectedTenant ?? institutes[0] ?? null;
  }, [user.selectedTenantId, user.selectedTenant, institutes]);

  const now = Date.now();

  // Rendez-vous à venir (non annulés, chronologiques)
  const upcomingAppts = useMemo(() => {
    return appointments
      .filter((a) => {
        const time = new Date(a.startAt).getTime();
        return time >= now - 2 * 3600 * 1000 && a.status !== "cancelled";
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [appointments, now]);

  // Rendez-vous passés / terminés
  const pastAppts = useMemo(() => {
    return appointments
      .filter((a) => {
        const time = new Date(a.startAt).getTime();
        return time < now - 2 * 3600 * 1000 || a.status === "completed";
      })
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [appointments, now]);

  // Filtrage des RDV selon le type sélectionné
  const filteredUpcomingAppts = useMemo(() => {
    if (selectedRdvType === "all") return upcomingAppts;
    return upcomingAppts.filter(
      (a) => classifyAppointmentType(a.service?.category, a.service?.name).id === selectedRdvType
    );
  }, [upcomingAppts, selectedRdvType]);

  const filteredPastAppts = useMemo(() => {
    if (selectedRdvType === "all") return pastAppts;
    return pastAppts.filter(
      (a) => classifyAppointmentType(a.service?.category, a.service?.name).id === selectedRdvType
    );
  }, [pastAppts, selectedRdvType]);

  // Compteur par type de RDV
  const countByType = useMemo(() => {
    const counts: Record<Exclude<RdvTypeId, "all">, number> = {
      consultation: 0,
      soin: 0,
      controle: 0,
      coiffure: 0,
      onglerie: 0,
      massage: 0,
    };
    for (const a of upcomingAppts) {
      const t = classifyAppointmentType(a.service?.category, a.service?.name).id;
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [upcomingAppts]);

  // Échéancier intelligent de RDV de suivi générés depuis les diagnostics de la cliente (J+1, J+7, J+30 & Dermato)
  const smartFollowUpMilestones = useMemo(() => {
    const doneDiags = [...diagnoses]
      .filter((d) => d.status === "done")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (doneDiags.length === 0) return [];

    const latest = doneDiags[0];
    const parsed = parseDiagnosis(latest.resultJson);
    const zoneLabel = BODY_ZONES.find((z) => z.id === latest.zone)?.label ?? "Visage";
    const baseTime = new Date(latest.createdAt).getTime();

    const milestones: {
      id: string;
      stage: "J+1" | "J+7" | "J+30" | "DERMATO";
      title: string;
      subtitle: string;
      recommendedDate: Date;
      zoneLabel: string;
      categoryName: string;
      serviceName: string;
      badgeColor: string;
      urgent?: boolean;
    }[] = [
      {
        id: `j1-${latest.id}`,
        stage: "J+1",
        title: `Point Tolérance & Réactivité (${zoneLabel})`,
        subtitle: "Vérification de l'apaisement cutané 24h après le démarrage de votre protocole.",
        recommendedDate: new Date(baseTime + 1 * 86400000),
        zoneLabel,
        categoryName: "Contrôle",
        serviceName: `Contrôle Tolérance J+1 (${zoneLabel})`,
        badgeColor: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
      },
      {
        id: `j7-${latest.id}`,
        stage: "J+7",
        title: `Contrôle Observance Routine & SPF50 (${zoneLabel})`,
        subtitle: "Suivi de régularité des actifs du soir et de la photoprotection quotidienne.",
        recommendedDate: new Date(baseTime + 7 * 86400000),
        zoneLabel,
        categoryName: "Contrôle",
        serviceName: `Contrôle Observance J+7 (${zoneLabel})`,
        badgeColor: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      },
      {
        id: `j30-${latest.id}`,
        stage: "J+30",
        title: `RDV Bilan Évolutif Time-Lapse Avant/Après (${zoneLabel})`,
        subtitle:
          "Cycle cellulaire de 28 jours : nouveau cliché multi-spectral pour mesurer l'évolution de votre score.",
        recommendedDate: new Date(baseTime + 30 * 86400000),
        zoneLabel,
        categoryName: "Contrôle",
        serviceName: `Bilan Évolutif Time-Lapse J+30 (${zoneLabel})`,
        badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      },
    ];

    if (parsed?.orientation_dermato) {
      milestones.unshift({
        id: `dermato-${latest.id}`,
        stage: "DERMATO",
        title: `Consultation Dermatologique Recommandée (${zoneLabel})`,
        subtitle:
          parsed.raison_orientation ||
          "Votre dernier bilan recommande un avis dermatologique spécialisé sur peau mélanoderme.",
        recommendedDate: new Date(Date.now() + 2 * 86400000),
        zoneLabel,
        categoryName: "Consultation",
        serviceName: `Consultation Dermatologique (${zoneLabel})`,
        badgeColor: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
        urgent: true,
      });
    }

    return milestones;
  }, [diagnoses]);

  // Alerte proactive J-1 / Jour J
  const nextAppt = upcomingAppts[0] ?? null;
  const proactiveReminder = useMemo(() => {
    if (!nextAppt) return null;
    const start = new Date(nextAppt.startAt);
    const startMs = start.getTime();
    const diffHours = (startMs - now) / (1000 * 3600);
    const diffDays = Math.floor(diffHours / 24);

    const isToday =
      start.getDate() === new Date().getDate() &&
      start.getMonth() === new Date().getMonth() &&
      start.getFullYear() === new Date().getFullYear();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      start.getDate() === tomorrow.getDate() &&
      start.getMonth() === tomorrow.getMonth() &&
      start.getFullYear() === tomorrow.getFullYear();

    if (isToday) {
      return {
        badge: "Aujourd'hui ✨",
        title: `Votre soin a lieu aujourd'hui à ${formatTime(nextAppt.startAt)}`,
        sub: `Votre cabine dédiée est prête chez ${
          nextAppt.tenant?.name || "votre institut"
        }. À tout de suite !`,
        urgency: "today" as const,
      };
    }
    if (isTomorrow) {
      return {
        badge: "Demain (J-1) 🌸",
        title: `Rappel : rendez-vous demain à ${formatTime(nextAppt.startAt)}`,
        sub: "Hydratez bien votre peau ce soir et évitez les gommages agressifs.",
        urgency: "tomorrow" as const,
      };
    }
    if (diffDays <= 4) {
      return {
        badge: `Dans ${diffDays} jours 📅`,
        title: `Rendez-vous dans ${diffDays} jours (${formatDate(nextAppt.startAt, {
          weekday: "short",
          day: "numeric",
          month: "short",
        })})`,
        sub: `Votre créneau est confirmé avec ${
          nextAppt.resource?.name || "votre praticienne"
        }.`,
        urgency: "soon" as const,
      };
    }
    return null;
  }, [nextAppt, now]);

  const handleBookRdvType = (typeDef: RdvTypeDefinition) => {
    haptic(HAPTIC.tap);
    setQuickBookType(typeDef);
  };

  const confirmQuickBook = () => {
    if (!quickBookType) return;
    haptic(HAPTIC.medium);
    const startIso = `${quickDate}T${quickTime}:00`;
    const newLocalAppt: ApiAppointment = {
      id: `local_rdv_${Date.now()}`,
      tenantId: selectedInst?.id || "kene_partner",
      serviceId: `srv_${quickBookType.id}`,
      resourceId: "prac_1",
      startAt: new Date(startIso).toISOString(),
      durationMin: quickBookType.durationMin,
      status: "confirmed",
      price: quickBookType.indicativePrice,
      depositAmount: 0,
      clientName: user.name,
      clientPhone: user.phone,
      createdAt: new Date().toISOString(),
      service: {
        id: `srv_${quickBookType.id}`,
        name: quickBookType.defaultServiceName,
        category: quickBookType.categoryName,
        durationMin: quickBookType.durationMin,
        price: quickBookType.indicativePrice,
      },
      tenant: selectedInst
        ? {
            id: selectedInst.id,
            name: selectedInst.name,
            city: selectedInst.city,
            country: (selectedInst as any).country || "CI",
            phone: selectedInst.phone ?? undefined,
          }
        : {
            id: "kene_partner",
            name: "Institut Partenaire Kènè",
            city: user.city || "Abidjan",
            country: "CI",
          },
      resource: {
        id: "prac_1",
        name: "Spécialiste Dermo Kènè",
        role: "Praticienne Cabine",
      },
    };

    setAppointments((prev) => [newLocalAppt, ...prev]);
    toast.success(`Rendez-vous « ${quickBookType.shortLabel} » programmé ! ✨`, {
      description: `Créneau réservé le ${formatDate(newLocalAppt.startAt)} à ${quickTime}`,
    });

    openWhatsAppAppointmentInquiry({
      serviceCategory: quickBookType.categoryName,
      serviceName: `${quickBookType.defaultServiceName} (souhaité le ${quickDate} à ${quickTime})`,
      tenantPhone: selectedInst?.phone || (selectedInst as any)?.ownerPhone,
      instituteName: selectedInst?.name,
      country: ((selectedInst as any)?.country || "CI") as "CI" | "SN",
    });

    setQuickBookType(null);
    setActiveSubTab("rdv");
    setSelectedRdvType(quickBookType.id);
  };

  return (
    <div className="flex flex-col gap-5 pt-1 pb-2">
      {/* ───── En-tête : Mon Agenda & Tous mes Types de RDV ───── */}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            aria-hidden="true"
            className="mb-1.5 block h-[3px] w-10 rounded-full bg-gradient-to-r from-[#C8951E] via-[#A0522D] to-[#3F7D3F] opacity-80"
          />
          <p className="text-xs uppercase tracking-[0.16em] text-primary font-semibold">
            Agenda Dermo-Clinique &amp; Cabine
          </p>
          <h2 className="font-heading font-black text-[24px] sm:text-[28px] leading-tight tracking-tight truncate">
            Mon Agenda &amp; Tous mes RDV
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consultations, soins cabine, contrôles J+1/J+7/J+30, coiffure, onglerie &amp; massage
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Actualiser les rendez-vous et commandes"
          className="shrink-0 size-10 rounded-full border border-border bg-card/80 hover:bg-accent grid place-items-center text-foreground transition-all active:scale-95 shadow-xs"
        >
          <RefreshCw size={16} className={cn("text-primary", refreshing && "animate-spin")} />
        </button>
      </header>

      {/* ───── Sélecteur de sous-onglets : Mes RDV / Types de RDV / Commandes / Conciergerie ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-muted/50 border border-border/60">
        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveSubTab("rdv");
          }}
          className={cn(
            "py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
            activeSubTab === "rdv"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarDays size={14} className={activeSubTab === "rdv" ? "text-primary" : ""} />
          <span className="truncate">Mes RDV</span>
          <span className="size-4.5 px-1 rounded-full bg-primary/15 text-primary text-[10px] grid place-items-center font-black shrink-0">
            {upcomingAppts.length + smartFollowUpMilestones.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveSubTab("types");
          }}
          className={cn(
            "py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
            activeSubTab === "types"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <SlidersHorizontal size={14} className={activeSubTab === "types" ? "text-gold-text" : ""} />
          <span className="truncate">6 Types de RDV</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveSubTab("commandes");
          }}
          className={cn(
            "py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
            activeSubTab === "commandes"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ShoppingBag size={14} className={activeSubTab === "commandes" ? "text-gold-text" : ""} />
          <span className="truncate">Commandes</span>
          {orders.length > 0 && (
            <span className="size-4.5 px-1 rounded-full bg-gold/30 text-gold-text text-[10px] grid place-items-center font-bold shrink-0">
              {orders.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(HAPTIC.tap);
            setActiveSubTab("conciergerie");
          }}
          className={cn(
            "py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
            activeSubTab === "conciergerie"
              ? "bg-gradient-to-r from-[#C8951E]/20 to-[#8B1A3B]/20 text-[#C8951E] shadow-xs border border-[#C8951E]/50 font-black"
              : "text-muted-foreground hover:text-[#C8951E]"
          )}
        >
          <Crown size={14} className={activeSubTab === "conciergerie" ? "text-[#C8951E]" : "text-amber-500"} />
          <span className="truncate">Conciergerie</span>
        </button>
      </div>

      {/* ───── Modal / Carte de Réservation Rapide d'un Type de RDV ───── */}
      {quickBookType && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[24px] border-2 border-gold/50 bg-gradient-to-br from-card via-card to-gold/5 p-4 sm:p-5 shadow-lg space-y-3.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border", quickBookType.badgeClass)}>
                Programmation Directe
              </span>
              <h3 className="font-heading font-black text-base text-foreground mt-1">
                {quickBookType.label}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedInst ? `Chez ${selectedInst.name} (${selectedInst.city})` : "Dans votre institut partenaire Kènè"} · Durée : {quickBookType.durationMin} min
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuickBookType(null)}
              className="text-xs font-bold text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg"
            >
              Fermer ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-foreground block mb-1">
                Date souhaitée
              </label>
              <input
                type="date"
                value={quickDate}
                onChange={(e) => setQuickDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-semibold"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-foreground block mb-1">
                Créneau horaire préféré
              </label>
              <select
                value={quickTime}
                onChange={(e) => setQuickTime(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-semibold"
              >
                {["09:30", "10:30", "11:30", "14:00", "14:30", "15:30", "16:30", "17:30"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setQuickBookType(null)}
              className="h-9 px-3 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={confirmQuickBook}
              className="h-9 px-4 rounded-xl k-btn-gold text-primary-foreground text-xs font-black flex items-center gap-1.5 shadow-sm"
            >
              <CalendarPlus size={14} />
              Valider &amp; Synchroniser avec l&apos;Institut
            </button>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-ONGLET 1 : MES RENDEZ-VOUS (FILTRABLES PAR TYPE + SUIVIS J+1/J+7/J+30)
      ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "rdv" && (
        <div className="flex flex-col gap-4">
          {/* Barre de filtre rapide par Type de RDV */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Filtrer par type de rendez-vous :
              </span>
              <button
                type="button"
                onClick={() => setActiveSubTab("types")}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                Voir le catalogue des 6 types →
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.light);
                  setSelectedRdvType("all");
                }}
                className={cn(
                  "shrink-0 h-8 px-3 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5",
                  selectedRdvType === "all"
                    ? "k-btn-gold text-primary-foreground border-transparent shadow-2xs"
                    : "bg-card border-border/70 text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Tous les types</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background/25">
                  {upcomingAppts.length}
                </span>
              </button>

              {RDV_TYPES_CATALOG.map((rt) => {
                const Icon = rt.icon;
                const active = selectedRdvType === rt.id;
                const count = countByType[rt.id] || 0;
                return (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => {
                      haptic(HAPTIC.light);
                      setSelectedRdvType(rt.id);
                    }}
                    className={cn(
                      "shrink-0 h-8 px-3 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5",
                      active
                        ? "k-btn-gold text-primary-foreground border-transparent shadow-2xs"
                        : "bg-card border-border/70 text-foreground/85 hover:border-gold/40"
                    )}
                  >
                    <Icon size={13} />
                    <span>{rt.shortLabel}</span>
                    {count > 0 && (
                      <span className="text-[10px] px-1.5 rounded-full bg-primary/20 text-primary font-black">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Alerte proactive J-1 / Jour J si RDV imminent */}
          {proactiveReminder && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "rounded-[22px] p-4 border flex items-start gap-3 shadow-sm",
                proactiveReminder.urgency === "today"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-100"
                  : "bg-gold/10 border-gold/30 text-foreground"
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-text">
                <Sparkles size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-gold/25 px-2 py-0.5 text-[10px] font-black uppercase text-gold-text">
                    {proactiveReminder.badge}
                  </span>
                </div>
                <p className="font-heading font-black text-sm mt-1">{proactiveReminder.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{proactiveReminder.sub}</p>
              </div>
            </motion.div>
          )}

          {/* Section : Rendez-vous programmés à venir */}
          <section aria-label="Rendez-vous à venir" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
                <CalendarDays size={16} className="text-primary" />
                Rendez-vous en institut ({filteredUpcomingAppts.length})
              </h3>
              <button
                type="button"
                onClick={() => setActiveSubTab("types")}
                className="text-xs font-bold text-gold-text hover:underline inline-flex items-center gap-1"
              >
                <PlusCircle size={13} />
                Programmer un RDV
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                <div className="h-28 rounded-[22px] bg-muted/40 animate-pulse" />
                <div className="h-28 rounded-[22px] bg-muted/40 animate-pulse" />
              </div>
            ) : filteredUpcomingAppts.length === 0 ? (
              <div className="p-5 rounded-[24px] border border-dashed border-border/80 bg-card/50 space-y-3.5">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Calendar size={22} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-sm text-foreground">
                      {selectedRdvType === "all"
                        ? "Aucun rendez-vous en cabine programmé pour le moment"
                        : `Aucun rendez-vous de type « ${
                            RDV_TYPES_CATALOG.find((t) => t.id === selectedRdvType)?.shortLabel
                          } » à venir`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Sélectionnez directement ci-dessous le type de rendez-vous souhaité pour le réserver auprès de{" "}
                      <strong>{selectedInst?.name || "votre institut partenaire"}</strong> :
                    </p>
                  </div>
                </div>

                {/* Boutons directs des 6 types de RDV */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {RDV_TYPES_CATALOG.map((rt) => {
                    const Icon = rt.icon;
                    return (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => handleBookRdvType(rt)}
                        className={cn(
                          "p-2.5 rounded-2xl border bg-card/90 text-left transition-all flex items-center gap-2 hover:shadow-xs active:scale-95",
                          rt.cardBorderClass
                        )}
                      >
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", rt.iconBgClass)}>
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{rt.shortLabel}</p>
                          <p className="text-[10px] text-muted-foreground">{rt.durationMin} min</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              filteredUpcomingAppts.map((appt) => {
                const serviceName = appt.service?.name || "Soin dermo-cosmétique";
                const tenantName = appt.tenant?.name || "Institut Partenaire";
                const practitionerName = appt.resource?.name || "Praticienne de cabine";
                const phone = appt.tenant?.phone || selectedInst?.phone || "";
                const typeMeta = classifyAppointmentType(appt.service?.category, serviceName);
                const TypeIcon = typeMeta.icon;

                return (
                  <div
                    key={appt.id}
                    className="k-card rounded-[24px] p-4 sm:p-5 border border-border/80 shadow-xs space-y-3.5 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1",
                              typeMeta.badgeClass
                            )}
                          >
                            <TypeIcon size={11} />
                            {typeMeta.shortLabel}
                          </span>
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle2 size={10} /> Confirmé
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground">
                            {formatDate(appt.startAt, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>

                        <h4 className="font-heading font-black text-base text-foreground mt-1.5 leading-snug">
                          {serviceName}
                        </h4>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <MapPin size={13} className="text-primary shrink-0" />
                          <span>{tenantName}</span>
                          {appt.tenant?.city && <span>· {appt.tenant.city}</span>}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="block font-heading font-black text-base text-primary">
                          {formatTime(appt.startAt)}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end">
                          <Clock size={11} /> {appt.durationMin || 60} min
                        </span>
                      </div>
                    </div>

                    {/* Praticienne & Tarif */}
                    <div className="pt-2.5 border-t border-border/60 flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1.5 font-medium">
                        <User size={13} className="text-gold-text" />
                        <span>
                          Praticienne : <strong className="text-foreground">{practitionerName}</strong>
                        </span>
                      </div>
                      {appt.price > 0 && (
                        <div className="font-mono font-bold text-foreground">{xof(appt.price)}</div>
                      )}
                    </div>

                    {/* Boutons d'actions pour le RDV */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const msg = `Bonjour ${tenantName} ! 🌸\nJe suis ${user.name}. Je vous contacte concernant mon rendez-vous (${typeMeta.shortLabel}) de *${serviceName}* prévu le ${formatDate(
                            appt.startAt
                          )} à ${formatTime(appt.startAt)}.`;
                          openWhatsApp(phone, msg, ((appt.tenant as any)?.country || "CI") as "CI" | "SN");
                        }}
                        className="h-9 px-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <MessageCircle size={14} />
                        WhatsApp Institut
                      </button>

                      <a
                        href={makeGoogleCalendarUrl(appt)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-accent text-foreground font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <CalendarPlus size={13} className="text-primary" />
                        Ajouter Agenda
                      </a>

                      <a
                        href={`/api/appointments/pass?id=${encodeURIComponent(appt.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-accent text-foreground font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Download size={13} className="text-gold-text" />
                        Pass Cabine PDF
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* Section : Échéancier de Contrôles & Suivis Dermo-Cliniques (J+1 / J+7 / J+30 / Dermato) */}
          {(selectedRdvType === "all" ||
            selectedRdvType === "controle" ||
            selectedRdvType === "consultation") &&
            smartFollowUpMilestones.length > 0 && (
              <section
                aria-label="Échéancier de suivi dermo-clinique"
                className="space-y-3 pt-2 border-t border-border/60"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
                      <Stethoscope size={16} className="text-primary" />
                      Mon Protocole de Contrôle Recommandé ({smartFollowUpMilestones.length} Jalons)
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Échéances cliniques calibrées par l&apos;IA pour mesurer scientifiquement les progrès de votre peau
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {smartFollowUpMilestones.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-[22px] p-3.5 sm:p-4 border bg-card/85 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs",
                        m.urgent ? "border-rose-500/40 bg-rose-500/5" : "border-border/80"
                      )}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border",
                              m.badgeColor
                            )}
                          >
                            {m.stage === "DERMATO" ? "🩺 Consultation Recommandée" : `Étape Conseillée · ${m.stage}`}
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground">
                            Date conseillée :{" "}
                            {formatDate(m.recommendedDate.toISOString(), {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                        <p className="font-heading font-bold text-sm text-foreground">{m.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{m.subtitle}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {m.stage === "J+30" && (
                          <button
                            type="button"
                            onClick={() => setClientTab("diagnostic")}
                            className="h-8 px-3 rounded-xl border border-gold/40 bg-gold/10 text-gold-text text-xs font-bold hover:bg-gold/20 active:scale-95 transition-all"
                          >
                            📸 Scanner J+30
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const targetType =
                              m.stage === "DERMATO" ? RDV_TYPES_CATALOG[0] : RDV_TYPES_CATALOG[2];
                            setQuickDate(m.recommendedDate.toISOString().slice(0, 10));
                            handleBookRdvType({
                              ...targetType,
                              defaultServiceName: m.serviceName,
                            });
                          }}
                          className="h-8 px-3 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                        >
                          <CalendarPlus size={13} />
                          Programmer ce contrôle
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

          {/* Section : Historique des soins passés */}
          {filteredPastAppts.length > 0 && (
            <section aria-label="Historique des soins" className="space-y-3 pt-3 border-t border-border/60">
              <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
                <CheckCircle2 size={15} className="text-muted-foreground" />
                Soins passés &amp; réalisés ({filteredPastAppts.length})
              </h3>

              <div className="space-y-2.5">
                {filteredPastAppts.slice(0, 8).map((p) => {
                  const meta = classifyAppointmentType(p.service?.category, p.service?.name);
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-2xl border border-border/70 bg-card/50 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={cn("text-[9.5px] font-bold px-2 py-0.2 rounded-full border", meta.badgeClass)}>
                            {meta.shortLabel}
                          </span>
                        </div>
                        <p className="font-heading font-bold text-foreground truncate">
                          {p.service?.name || "Soin réalisé"}
                        </p>
                        <p className="text-muted-foreground truncate text-[11px] mt-0.5">
                          {p.tenant?.name} · {formatDate(p.startAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBookRdvType(meta)}
                        className="shrink-0 h-8 px-2.5 rounded-lg border border-primary/30 text-primary font-bold text-[11px] flex items-center gap-1 hover:bg-primary/10 transition-colors"
                      >
                        Renouveler
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-ONGLET 2 : CATALOGUE COMPLET DES 6 TYPES DE RDV KÈNÈ
      ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "types" && (
        <div className="space-y-4">
          <div className="rounded-[22px] p-4 border border-gold/30 bg-gold/5 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-text">
              <CalendarDays size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading font-bold text-sm text-foreground">
                Les 6 Familles de Rendez-Vous Kènè
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Choisissez le type de rendez-vous adapté à votre besoin (Visage, Cuir chevelu, Mains/Pieds, Dos &amp; Corps ou Contrôle J+30) pour le programmer avec{" "}
                <strong>{selectedInst?.name || "votre institut partenaire"}</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RDV_TYPES_CATALOG.map((rt) => {
              const Icon = rt.icon;
              const scheduledCount = countByType[rt.id] || 0;
              return (
                <div
                  key={rt.id}
                  className={cn(
                    "k-card rounded-[24px] p-4 border transition-all flex flex-col justify-between gap-3",
                    rt.cardBorderClass
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn("grid size-10 place-items-center rounded-2xl shrink-0", rt.iconBgClass)}>
                        <Icon size={20} />
                      </span>
                      <div className="flex items-center gap-1.5">
                        {scheduledCount > 0 && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            {scheduledCount} programmé{scheduledCount > 1 ? "s" : ""}
                          </span>
                        )}
                        <span className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full border", rt.badgeClass)}>
                          {rt.durationMin} min
                        </span>
                      </div>
                    </div>

                    <h4 className="font-heading font-black text-sm text-foreground leading-snug">
                      {rt.label}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {rt.description}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-border/60 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">
                      Dès {xof(rt.indicativePrice)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {scheduledCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRdvType(rt.id);
                            setActiveSubTab("rdv");
                          }}
                          className="h-8 px-2.5 rounded-xl border border-border text-[11px] font-bold text-foreground hover:bg-accent"
                        >
                          Voir ({scheduledCount})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleBookRdvType(rt)}
                        className="h-8 px-3 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all"
                      >
                        <CalendarPlus size={13} />
                        Prendre RDV
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-ONGLET 3 : MES COMMANDES & SOINS WHATSAPP
      ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "commandes" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[22px] p-4 border border-gold/30 bg-gold/5 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-text">
              <ShoppingBag size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="font-heading font-bold text-sm text-foreground">
                Commandes &amp; Réassorts WhatsApp
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Toutes les commandes de soins botaniques convenues sur WhatsApp et saisies par votre institut partenaire ou le concierge Kènè s&apos;affichent ici en direct.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-28 rounded-[22px] bg-muted/40 animate-pulse" />
              <div className="h-28 rounded-[22px] bg-muted/40 animate-pulse" />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center rounded-[24px] border border-dashed border-border/80 bg-card/40 space-y-3">
              <span className="grid size-12 mx-auto place-items-center rounded-2xl bg-primary/10 text-primary">
                <ShoppingBag size={24} />
              </span>
              <div>
                <p className="font-heading font-bold text-sm text-foreground">
                  Aucune commande enregistrée
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
                  Vous n&apos;avez pas encore de commande de soins enregistrée. Échangez avec votre institut pour formuler vos produits sur-mesure d&apos;après votre ordonnance beauté.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  openWhatsAppProductOrderInquiry({
                    productName: "Mon ordonnance beauté & soins sur-mesure",
                    tenantPhone: selectedInst?.phone || (selectedInst as any)?.ownerPhone,
                    instituteName: selectedInst?.name,
                    country: ((selectedInst as any)?.country || "CI") as "CI" | "SN",
                  });
                }}
                className="k-btn-gold h-10 px-4 rounded-xl text-primary-foreground font-bold text-xs inline-flex items-center gap-1.5 shadow-sm"
              >
                <MessageCircle size={14} />
                Commander mes soins sur WhatsApp
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const tenantName = order.tenant?.name || "Institut Partenaire";
                const phone = order.tenant?.phone || selectedInst?.phone || "";

                return (
                  <div
                    key={order.id}
                    className="k-card rounded-[24px] p-4 sm:p-5 border border-border/80 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <PackageCheck size={11} /> {order.deliveryStatus || "Enregistrée"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(order.createdAt)}
                          </span>
                        </div>
                        <h4 className="font-heading font-black text-sm text-foreground mt-1.5">
                          Commande #{order.id.slice(-6).toUpperCase()}
                        </h4>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <span>
                            Établissement : <strong>{tenantName}</strong>
                          </span>
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="font-heading font-black text-base text-primary block">
                          {xof(order.total)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {order.paymentMethod?.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {order.items && order.items.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-1.5">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          Soins inclus :
                        </p>
                        <div className="space-y-1">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-xs">
                              <span className="text-foreground/90 font-medium">
                                • {item.label}{" "}
                                <span className="text-muted-foreground text-[11px]">(x{item.qty})</span>
                              </span>
                              <span className="font-mono text-muted-foreground">
                                {xof(item.totalPrice)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const msg = `Bonjour ${tenantName} ! 📦\nJe suis ${user.name}. Je souhaite avoir des nouvelles de ma commande #${order.id
                            .slice(-6)
                            .toUpperCase()} d'un montant de ${xof(order.total)}. Merci !`;
                          openWhatsApp(phone, msg);
                        }}
                        className="h-8 px-3 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] font-bold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <MessageCircle size={13} />
                        Suivi WhatsApp
                      </button>

                      <a
                        href={`/api/orders/invoice?id=${encodeURIComponent(order.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 px-3 rounded-lg border border-border text-foreground hover:bg-accent font-semibold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <FileText size={13} />
                        Facture PDF
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-ONGLET 4 : CONCIERGERIE PRIVÉE WHATSAPP 24/7
      ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "conciergerie" && (
        <ConciergerieWhatsAppSection
          selectedInstitute={selectedInst}
          onNavigateTab={setClientTab}
        />
      )}
    </div>
  );
}
