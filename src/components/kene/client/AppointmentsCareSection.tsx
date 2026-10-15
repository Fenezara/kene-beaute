"use client";
// Kènè Cliente — Mes Moments de Soin & Rendez-vous
// Affiche les rendez-vous pris par WhatsApp et notés par l'entreprise côté Pro :
// Consultation, Contrôle, Soin esthétique, Coiffure, Onglerie, Massage.
// Émet des alertes proactives (Aujourd'hui, Demain J-1, Dans X jours),
// bouton direct WhatsApp de confirmation avec l'institut, Pass Cabine QR code,
// et ajout en 1 clic au calendrier de la cliente.

import { useMemo } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  MessageCircle,
  Sparkles,
  CalendarPlus,
  FileText,
  User,
  Scissors,
  Hand,
  CheckCircle2,
  CalendarDays,
  BellRing,
} from "lucide-react";
import { formatDate, formatTime } from "@/lib/kene/format";
import { openWhatsApp, openWhatsAppAppointmentInquiry } from "@/lib/kene/whatsapp-relay";
import type { ApiAppointment, ApiInstitute } from "./types";

interface AppointmentsCareSectionProps {
  appointments: ApiAppointment[];
  onBookCare?: () => void;
  selectedInstitute?: ApiInstitute | { id: string; name: string; city: string; phone?: string | null; ownerPhone?: string | null; country?: string | null } | null;
}

export function AppointmentsCareSection({ appointments, onBookCare, selectedInstitute }: AppointmentsCareSectionProps) {
  const now = Date.now();

  // Tous les rendez-vous valides (non annulés) de la cliente
  const validAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.status !== "cancelled")
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [appointments]);

  // Rendez-vous à venir (du plus proche au plus lointain)
  const upcoming = useMemo(() => {
    return validAppointments.filter((a) => new Date(a.startAt).getTime() >= now - 4 * 3600 * 1000);
  }, [validAppointments, now]);

  // Rendez-vous actif prioritaire : soit le prochain à venir, soit le plus récent saisi par l'institut
  const nextAppt = upcoming[0] ?? (validAppointments.length > 0 ? validAppointments[validAppointments.length - 1] : null);
  const otherUpcoming = nextAppt ? validAppointments.filter((a) => a.id !== nextAppt.id) : [];

  // Alerte proactive (compte à rebours bienveillant)
  const reminder = useMemo(() => {
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
        badge: "Aujourd'hui",
        urgency: "today" as const,
        title: `Votre soin a lieu aujourd'hui à ${formatTime(nextAppt.startAt)} ✨`,
        sub: "Votre praticienne vous prépare une cabine dédiée. À très bientôt !",
      };
    }

    if (isTomorrow) {
      return {
        badge: "Demain (J-1)",
        urgency: "tomorrow" as const,
        title: `Rappel : rendez-vous demain à ${formatTime(nextAppt.startAt)} 🌸`,
        sub: "Pensez à bien hydrater votre peau la veille.",
      };
    }

    if (diffDays <= 4) {
      return {
        badge: `Dans ${diffDays} jours`,
        urgency: "soon" as const,
        title: `Rendez-vous dans ${diffDays} jours (${formatDate(nextAppt.startAt, { weekday: "short", day: "numeric", month: "short" })})`,
        sub: "Votre créneau VIP est réservé et confirmé.",
      };
    }

    return null;
  }, [nextAppt, now]);

  // Catégorie visuelle de la prestation
  function getServiceMeta(category?: string | null, serviceName = "") {
    const cat = (category || "").toLowerCase();
    const name = serviceName.toLowerCase();

    if (cat.includes("consult") || name.includes("consult")) {
      return {
        label: "Consultation Dermo-Cosmétique",
        icon: Sparkles,
        badgeBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
        pillColor: "#10B981",
      };
    }
    if (cat.includes("control") || cat.includes("contrôle") || name.includes("control") || name.includes("contrôle")) {
      return {
        label: "Contrôle Cutané & Évolution",
        icon: CheckCircle2,
        badgeBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
        pillColor: "#F59E0B",
      };
    }
    if (cat.includes("coiff") || cat.includes("capill") || name.includes("coiff") || name.includes("tresse") || name.includes("cheveu")) {
      return {
        label: "Coiffure & Soin Capillaire",
        icon: Scissors,
        badgeBg: "bg-[#A0522D]/15 text-[#A0522D] dark:text-[#E89E78] border-[#A0522D]/30",
        pillColor: "#A0522D",
      };
    }
    if (cat.includes("ongl") || cat.includes("manucure") || cat.includes("pedicure") || name.includes("ongl") || name.includes("vernis")) {
      return {
        label: "Onglerie & Manucure Spa",
        icon: Hand,
        badgeBg: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
        pillColor: "#A855F7",
      };
    }
    return {
      label: "Soin Esthétique Cabine & Éclat",
      icon: Sparkles,
      badgeBg: "bg-[#C8951E]/15 text-[#C8951E] dark:text-[#E3B04B] border-[#C8951E]/30",
      pillColor: "#C8951E",
    };
  }

  // Génération du lien Google Calendar pour la cliente
  function makeGoogleCalendarUrl(appt: ApiAppointment) {
    const start = new Date(appt.startAt);
    const end = new Date(start.getTime() + (appt.durationMin || 60) * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmtIso = (d: Date) =>
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

    const title = encodeURIComponent(`Soin Kènè : ${appt.service?.name || "Moment de soin"} chez ${appt.tenant?.name || "Institut Partenaire"}`);
    const details = encodeURIComponent(
      `Rendez-vous bien-être Kènè.\nPrestation : ${appt.service?.name || "Soin"}\nPraticienne : ${appt.resource?.name || "Équipe Kènè"}\nInstitut : ${appt.tenant?.name || "Institut Partenaire"}\nDurée : ${appt.durationMin || 60} min`
    );
    const location = encodeURIComponent(`${appt.tenant?.name || ""}, ${appt.tenant?.address || appt.tenant?.city || "Abidjan"}`);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmtIso(start)}/${fmtIso(end)}&details=${details}&location=${location}`;
  }

  // Prise de rendez-vous directe ciblée par catégorie vers l'entreprise choisie
  function handleBookCategory(category: string, serviceName: string) {
    const tenantPhone = selectedInstitute?.phone || selectedInstitute?.ownerPhone;
    openWhatsAppAppointmentInquiry({
      serviceCategory: category,
      serviceName,
      instituteName: selectedInstitute?.name,
      tenantPhone: tenantPhone || undefined,
      country: (selectedInstitute?.country || "CI") as "CI" | "SN",
    });
  }

  // Message WhatsApp pré-rempli pour confirmer auprès de l'institut
  function handleConfirmOnWhatsApp(appt: ApiAppointment) {
    const tenantPhone = appt.tenant?.phone || (appt.tenant as any)?.ownerPhone || selectedInstitute?.phone || selectedInstitute?.ownerPhone || "2250700000000";
    const instName = appt.tenant?.name || selectedInstitute?.name || "l'institut";
    const country = ((appt.tenant as any)?.country || selectedInstitute?.country || "CI") as "CI" | "SN";
    const serviceName = appt.service?.name || "mon soin";
    const dateStr = formatDate(appt.startAt);
    const timeStr = formatTime(appt.startAt);
    const msg = `Bonjour ${instName} ! 🌸\n\nJe confirme ma venue pour mon rendez-vous de soin *${serviceName}* prévu le *${dateStr}* à *${timeStr}* (avec ${appt.resource?.name || "ma praticienne"}).\n\nNom : ${appt.clientName}\nÀ très vite ! ✨`;
    openWhatsApp(tenantPhone, msg, country);
  }

  if (!nextAppt) {
    return (
      <section
        aria-labelledby="care-appts-heading"
        className="rounded-[26px] border border-border/80 bg-gradient-to-br from-card/90 via-card/50 to-card/90 backdrop-blur-xs p-4 sm:p-5 shadow-xs"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays size={18} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#A0522D]/15 text-[#A0522D] dark:text-[#E89E78] border border-[#A0522D]/30">
                  ✨ Rendez-vous &amp; Soins Cabine
                </span>
              </div>
              <h3 id="care-appts-heading" className="font-heading font-black text-sm sm:text-base text-foreground mt-0.5">
                Mes Moments de Soin &amp; Rendez-vous
              </h3>
              <p className="text-[11px] text-muted-foreground">Coordination intelligente · Rappels WhatsApp J-1 proactifs</p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            Espace Cabine
          </span>
        </div>

        <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-4 text-center space-y-3">
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Aucun rendez-vous planifié. Vos séances réservées sur WhatsApp s&apos;affichent ici avec vos rappels automatiques.
          </p>

          {selectedInstitute && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary">
              <span>🎯 Lié à votre institut : {selectedInstitute.name} ({selectedInstitute.city})</span>
            </div>
          )}

          {/* Boutons d'accès directs par type de soin vers l'entreprise */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              onClick={() => handleBookCategory("Consultation", "Consultation dermo-cosmétique")}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold active:scale-95 transition-all"
            >
              <Sparkles size={13} />
              Consultation
            </button>
            <button
              onClick={() => handleBookCategory("Soin esthétique", "Soin esthétique cabine & éclat")}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#C8951E]/15 hover:bg-[#C8951E]/25 text-[#C8951E] dark:text-[#E3B04B] border border-[#C8951E]/30 text-xs font-bold active:scale-95 transition-all"
            >
              <Sparkles size={13} />
              Soin cabine
            </button>
            <button
              onClick={() => handleBookCategory("Contrôle", "Contrôle dermo & suivi cutané")}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-bold active:scale-95 transition-all"
            >
              <CheckCircle2 size={13} />
              Contrôle
            </button>
            <button
              onClick={() => handleBookCategory("Coiffure", "Coiffure & soin capillaire")}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#A0522D]/15 hover:bg-[#A0522D]/25 text-[#A0522D] dark:text-[#E89E78] border-[#A0522D]/30 text-xs font-bold active:scale-95 transition-all"
            >
              <Scissors size={13} />
              Coiffure
            </button>
            <button
              onClick={() => handleBookCategory("Onglerie", "Onglerie & manucure spa")}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border-purple-500/30 text-xs font-bold active:scale-95 transition-all"
            >
              <Hand size={13} />
              Onglerie
            </button>
          </div>

          <button
            onClick={() => onBookCare?.() ?? handleBookCategory("Soin en institut", "Prestation personnalisée")}
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
          >
            <MessageCircle size={14} />
            Prendre rendez-vous (WhatsApp) {selectedInstitute ? `avec ${selectedInstitute.name}` : ""}
          </button>
        </div>
      </section>
    );
  }

  const nextMeta = getServiceMeta(nextAppt.service?.category, nextAppt.service?.name);
  const NextIcon = nextMeta.icon;

  return (
    <section aria-labelledby="care-appts-heading" className="space-y-3">
      {/* ───── 1. Alerte Proactive & Compte à Rebours ───── */}
      {reminder && (
        <div
          className={`rounded-[22px] border p-3.5 flex items-center justify-between gap-3 shadow-sm transition-all ${
            reminder.urgency === "today"
              ? "bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-transparent border-emerald-500/40 text-emerald-950 dark:text-emerald-100"
              : reminder.urgency === "tomorrow"
              ? "bg-gradient-to-r from-gold/15 via-gold/10 to-transparent border-gold/40 text-amber-950 dark:text-amber-100"
              : "bg-gradient-to-r from-primary/10 via-card to-transparent border-primary/25"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`grid size-9 place-items-center rounded-xl shrink-0 ${
                reminder.urgency === "today"
                  ? "bg-emerald-500 text-white animate-pulse"
                  : reminder.urgency === "tomorrow"
                  ? "bg-[#C8951E] text-white"
                  : "bg-primary/20 text-primary"
              }`}
            >
              <BellRing size={16} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-xs sm:text-sm truncate">{reminder.title}</span>
                <span
                  className={`text-[9.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    reminder.urgency === "today"
                      ? "bg-emerald-500 text-white"
                      : "bg-[#C8951E]/20 text-[#C8951E] dark:text-[#E3B04B]"
                  }`}
                >
                  {reminder.badge}
                </span>
              </div>
              <p className="text-[11px] opacity-80 mt-0.5 truncate">{reminder.sub}</p>
            </div>
          </div>
          <button
            onClick={() => handleConfirmOnWhatsApp(nextAppt)}
            className="shrink-0 h-8 px-3 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-[11px] font-bold flex items-center gap-1 shadow-xs active:scale-95 transition-all"
          >
            <MessageCircle size={13} />
            Confirmer
          </button>
        </div>
      )}

      {/* ───── 2. Carte VIP du Rendez-vous le plus proche ───── */}
      <div className="rounded-[26px] border border-border/80 bg-card/90 backdrop-blur-xs p-4 sm:p-5 shadow-xs relative overflow-hidden">
        {/* En-tête de section */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays size={18} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#A0522D]/15 text-[#A0522D] dark:text-[#E89E78] border border-[#A0522D]/30">
                  ✨ Soin en Institut Partenaire
                </span>
              </div>
              <h3 id="care-appts-heading" className="font-heading font-black text-sm sm:text-base text-foreground mt-0.5">
                {new Date(nextAppt.startAt).getTime() >= now - 4 * 3600 * 1000 ? "Mon Prochain Moment de Soin" : "Mon Rendez-vous en Institut"}
              </h3>
              <p className="text-[11px] text-muted-foreground">Rappels proactifs WhatsApp &amp; coordination de vos séances</p>
            </div>
          </div>
          <span className={`text-[10.5px] font-bold border px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${nextMeta.badgeBg}`}>
            <NextIcon size={12} />
            {nextMeta.label}
          </span>
        </div>

        {/* Détails du Soin */}
        <div className="rounded-2xl border border-border/70 bg-muted/30 p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-2.5">
            <div>
              <h4 className="font-heading font-black text-base text-foreground flex items-center gap-2">
                {nextAppt.service?.name || "Protocole Dermo-Cosmétique"}
              </h4>
              {nextAppt.service?.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{nextAppt.service.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={12} /> Confirmé
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {nextAppt.durationMin || 60} min
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {/* Date & Heure */}
            <div className="flex items-center gap-2 rounded-xl bg-card p-2 border border-border/50">
              <Calendar size={15} className="text-primary shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-muted-foreground font-medium block">Date &amp; Heure</span>
                <span className="font-semibold text-foreground truncate block capitalize">
                  {formatDate(nextAppt.startAt, { weekday: "short", day: "numeric", month: "short" })} à {formatTime(nextAppt.startAt)}
                </span>
              </div>
            </div>

            {/* Praticienne dédiée */}
            <div className="flex items-center gap-2 rounded-xl bg-card p-2 border border-border/50">
              <User size={15} className="text-gold-text shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-muted-foreground font-medium block">Praticienne</span>
                <span className="font-semibold text-foreground truncate block">
                  {nextAppt.resource?.name || "Spécialiste Kènè"}
                </span>
              </div>
            </div>

            {/* Institut & Lieu */}
            <div className="flex items-center gap-2 rounded-xl bg-card p-2 border border-border/50">
              <MapPin size={15} className="text-terre shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] uppercase text-muted-foreground font-medium block">Établissement</span>
                <span className="font-semibold text-foreground truncate block">
                  {nextAppt.tenant?.name || "Institut Partenaire Kènè"}
                </span>
              </div>
            </div>
          </div>

          {nextAppt.notes && (
            <p className="text-[11px] text-muted-foreground/90 italic bg-card/60 rounded-xl p-2 border border-border/40">
              « {nextAppt.notes} »
            </p>
          )}
        </div>

        {/* Boutons d'Action VIP */}
        <div className="mt-3.5 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Ajouter au calendrier du smartphone */}
            <a
              href={makeGoogleCalendarUrl(nextAppt)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <CalendarPlus size={14} className="text-primary" />
              Ajouter à mon agenda
            </a>

            {/* Pass Cabine QR code */}
            <a
              href={`/api/appointments/pass?id=${encodeURIComponent(nextAppt.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileText size={14} className="text-gold-text" />
              Pass Cabine
            </a>
          </div>

          {/* Bouton WhatsApp de confirmation ou échange direct avec le salon */}
          <button
            onClick={() => handleConfirmOnWhatsApp(nextAppt)}
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold shadow-xs active:scale-95 transition-all ml-auto"
          >
            <MessageCircle size={15} />
            Confirmer / Échanger sur WhatsApp
          </button>
        </div>
      </div>

      {/* ───── 3. Autres Rendez-vous à venir (s'il y en a plusieurs) ───── */}
      {otherUpcoming.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground px-1">
            Autres rendez-vous enregistrés ({otherUpcoming.length}) :
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {otherUpcoming.map((item) => {
              const meta = getServiceMeta(item.service?.category, item.service?.name);
              const ItemIcon = meta.icon;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border/70 bg-card/70 p-3 flex items-center justify-between gap-2.5 shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9.5px] font-bold border px-2 py-0.2 rounded-full ${meta.badgeBg}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="font-heading font-bold text-xs text-foreground truncate mt-1">
                      {item.service?.name || "Soin"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDate(item.startAt, { weekday: "short", day: "numeric", month: "short" })} à {formatTime(item.startAt)} · {item.resource?.name || "Praticienne"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleConfirmOnWhatsApp(item)}
                    className="shrink-0 size-8 rounded-xl bg-[#25D366]/10 text-[#128C7E] dark:text-[#25D366] hover:bg-[#25D366]/20 grid place-items-center transition-colors"
                    aria-label="Contacter sur WhatsApp"
                  >
                    <MessageCircle size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───── Programmer un autre soin ou contrôle chez l'institut choisi ───── */}
      <div className="rounded-2xl border border-border/70 bg-card/60 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {selectedInstitute ? `Programmer chez ${selectedInstitute.name}` : "Programmer un nouveau soin (WhatsApp)"} :
          </p>
          {selectedInstitute && (
            <span className="text-[10px] text-primary font-semibold">📍 {selectedInstitute.city}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleBookCategory("Consultation", "Consultation dermo-cosmétique")}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold active:scale-95 transition-all"
          >
            <Sparkles size={11} />
            Consultation
          </button>
          <button
            onClick={() => handleBookCategory("Soin esthétique", "Soin esthétique cabine & éclat")}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[#C8951E]/15 hover:bg-[#C8951E]/25 text-[#C8951E] dark:text-[#E3B04B] border border-[#C8951E]/30 text-[11px] font-bold active:scale-95 transition-all"
          >
            <Sparkles size={11} />
            Soin cabine
          </button>
          <button
            onClick={() => handleBookCategory("Contrôle", "Contrôle dermo & suivi cutané")}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold active:scale-95 transition-all"
          >
            <CheckCircle2 size={11} />
            Contrôle
          </button>
          <button
            onClick={() => handleBookCategory("Coiffure", "Coiffure & soin capillaire")}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[#A0522D]/15 hover:bg-[#A0522D]/25 text-[#A0522D] dark:text-[#E89E78] border-[#A0522D]/30 text-[11px] font-bold active:scale-95 transition-all"
          >
            <Scissors size={11} />
            Coiffure
          </button>
          <button
            onClick={() => handleBookCategory("Onglerie", "Onglerie & manucure spa")}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[11px] font-bold active:scale-95 transition-all"
          >
            <Hand size={11} />
            Onglerie
          </button>
        </div>
      </div>
    </section>
  );
}
