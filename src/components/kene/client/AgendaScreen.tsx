"use client";
// Kènè Cliente — Onglet Agenda & Suivi Connecté :
// 1. 📅 Mes Rendez-Vous (Synchronisés en direct avec l'institut partenaire via WhatsApp)
// 2. 📦 Mes Commandes & Soins (Commandes WhatsApp saisies par l'entreprise côté Pro)
// 3. 📁 Mon Dossier Peau (Fiche cutanée complète, ordonnance beauté, évolution & biomarqueurs)

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  FolderHeart,
  User,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  Scissors,
  Hand,
  Crown,
  Heart,
  Leaf,
  ScanFace,
  FileText,
  AlertCircle,
  Truck,
  PackageCheck,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet } from "@/lib/kene/api";
import { formatDate, formatTime, xof, scoreColor } from "@/lib/kene/format";
import { openWhatsApp, openWhatsAppAppointmentInquiry, openWhatsAppProductOrderInquiry } from "@/lib/kene/whatsapp-relay";
import { CauriIcon, KeneEmblem, SankofaIcon } from "@/components/kene/icons";
import { Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { useKene } from "@/store/kene";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { cn } from "@/lib/utils";
import type { ApiAppointment, ApiDiagnosis, ApiInstitute, ApiProduct } from "./types";
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

export function AgendaScreen() {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);

  const [activeSubTab, setActiveSubTab] = useState<"rdv" | "commandes" | "conciergerie">("rdv");
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [diagnoses, setDiagnoses] = useState<ApiDiagnosis[]>([]);
  const [institutes, setInstitutes] = useState<ApiInstitute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Chargement des rendez-vous, commandes WhatsApp et bilans
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [apptRes, ordersRes, diagRes, instRes] = await Promise.all([
        apiGet<{ appointments: ApiAppointment[] }>(`/api/appointments?userId=${user.id}`).catch(() => ({ appointments: [] })),
        apiGet<{ orders: OrderData[] }>(`/api/orders?userId=${user.id}`).catch(() => ({ orders: [] })),
        apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}`).catch(() => ({ diagnoses: [] })),
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
      toast.success("Agenda & Suivi actualisés en direct");
    });
  };

  const selectedInst = useMemo(() => {
    if (user.selectedTenantId && institutes.length > 0) {
      return institutes.find((i) => i.id === user.selectedTenantId) ?? null;
    }
    return user.selectedTenant ?? (institutes[0] ?? null);
  }, [user.selectedTenantId, user.selectedTenant, institutes]);

  // Rendez-vous à venir (non annulés, chronologiques)
  const now = Date.now();
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
        sub: `Votre cabine dédiée est prête chez ${nextAppt.tenant?.name || "votre institut"}. À tout de suite !`,
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
        title: `Rendez-vous dans ${diffDays} jours (${formatDate(nextAppt.startAt, { weekday: "short", day: "numeric", month: "short" })})`,
        sub: `Votre créneau est confirmé avec ${nextAppt.resource?.name || "votre praticienne"}.`,
        urgency: "soon" as const,
      };
    }
    return null;
  }, [nextAppt, now]);

  return (
    <div className="flex flex-col gap-5 pt-1 pb-16">
      {/* ───── En-tête : Mon Agenda & Suivi d'Institut ───── */}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            aria-hidden="true"
            className="mb-1.5 block h-[3px] w-10 rounded-full bg-gradient-to-r from-[#C8951E] via-[#A0522D] to-[#3F7D3F] opacity-80"
          />
          <p className="text-xs uppercase tracking-[0.16em] text-primary font-semibold">Suivi d&apos;Établissement &amp; Cabine</p>
          <h2 className="font-heading font-black text-[26px] sm:text-[28px] leading-tight tracking-tight truncate">
            Mon Agenda &amp; Soins
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Synchronisé en direct avec les notes de votre institut partenaire
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

      {/* ───── Sélecteur de sous-onglets : RDV / Commandes & Achats / Conciergerie VIP ───── */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted/50 border border-border/60">
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
          {upcomingAppts.length > 0 && (
            <span className="size-4.5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] grid place-items-center font-black shrink-0">
              {upcomingAppts.length}
            </span>
          )}
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

      {/* ═══════════════════════════════════════════════════════════
          SOUS-ONGLET 1 : MES RENDEZ-VOUS EN CABINE & INSTITUT
      ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "rdv" && (
        <div className="flex flex-col gap-4">
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

          {/* Bouton d'action proactif : Prendre RDV via WhatsApp */}
          <div className="rounded-[24px] border border-[#25D366]/40 bg-gradient-to-r from-[#25D366]/10 via-[#25D366]/5 to-transparent p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#128C7E] dark:text-[#25D366] uppercase tracking-wider">
                <MessageCircle size={12} /> Contact Direct Institut
              </span>
              <h4 className="font-heading font-bold text-sm text-foreground truncate mt-0.5">
                Prendre un nouveau rendez-vous
              </h4>
              <p className="text-xs text-muted-foreground truncate">
                {selectedInst ? `Avec ${selectedInst.name} (${selectedInst.city})` : "Avec votre institut référent"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                openWhatsAppAppointmentInquiry({
                  serviceCategory: "Soin esthétique",
                  serviceName: "Soin dermo-cosmétique ou consultation",
                  tenantPhone: selectedInst?.phone || (selectedInst as any)?.ownerPhone,
                  instituteName: selectedInst?.name,
                  country: ((selectedInst as any)?.country || "CI") as "CI" | "SN",
                });
              }}
              className="shrink-0 h-10 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
            >
              <MessageCircle size={15} />
              WhatsApp
            </button>
          </div>

          {/* Section : Rendez-vous programmés à venir */}
          <section aria-label="Rendez-vous à venir" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
                <CalendarDays size={16} className="text-primary" />
                Rendez-vous à venir ({upcomingAppts.length})
              </h3>
              <span className="text-[11px] text-muted-foreground">Enregistrés par l&apos;institut</span>
            </div>

            {loading ? (
              <div className="space-y-3">
                <div className="h-28 rounded-[22px] bg-muted/40 animate-pulse" />
                <div className="h-28 rounded-[22px] bg-muted/40 animate-pulse" />
              </div>
            ) : upcomingAppts.length === 0 ? (
              <div className="p-8 text-center rounded-[24px] border border-dashed border-border/80 bg-card/40 space-y-3">
                <span className="grid size-12 mx-auto place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Calendar size={24} />
                </span>
                <div>
                  <p className="font-heading font-bold text-sm text-foreground">Aucun rendez-vous à venir</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
                    Convenez d&apos;un créneau avec votre institut via WhatsApp. Dès que l&apos;institut note votre rendez-vous, il s&apos;affichera automatiquement ici en direct.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    openWhatsAppAppointmentInquiry({
                      serviceCategory: "Consultation",
                      serviceName: "Bilan & Soin en institut",
                      tenantPhone: selectedInst?.phone || (selectedInst as any)?.ownerPhone,
                      instituteName: selectedInst?.name,
                      country: ((selectedInst as any)?.country || "CI") as "CI" | "SN",
                    });
                  }}
                  className="k-btn-gold h-10 px-4 rounded-xl text-primary-foreground font-bold text-xs inline-flex items-center gap-1.5 shadow-sm"
                >
                  <MessageCircle size={14} />
                  Réserver sur WhatsApp
                </button>
              </div>
            ) : (
              upcomingAppts.map((appt) => {
                const serviceName = appt.service?.name || "Soin dermo-cosmétique";
                const tenantName = appt.tenant?.name || "Institut Partenaire";
                const practitionerName = appt.resource?.name || "Praticienne de cabine";
                const phone = appt.tenant?.phone || selectedInst?.phone || "";

                return (
                  <div
                    key={appt.id}
                    className="k-card rounded-[24px] p-4 sm:p-5 border border-border/80 shadow-xs space-y-3.5 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle2 size={11} /> Confirmé par l&apos;institut
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground">
                            {formatDate(appt.startAt, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
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

                    {/* Praticienne & Notes éventuelles */}
                    <div className="pt-2.5 border-t border-border/60 flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1.5 font-medium">
                        <User size={13} className="text-gold-text" />
                        <span>Praticienne : <strong className="text-foreground">{practitionerName}</strong></span>
                      </div>
                      {appt.price > 0 && (
                        <div className="font-mono font-bold text-foreground">
                          {xof(appt.price)}
                        </div>
                      )}
                    </div>

                    {/* Boutons d'actions pour le RDV */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {/* 1. Échanger sur WhatsApp pour ce RDV */}
                      <button
                        type="button"
                        onClick={() => {
                          const msg = `Bonjour ${tenantName} ! 🌸\nJe suis ${user.name}. Je vous contacte concernant mon rendez-vous de *${serviceName}* prévu le ${formatDate(appt.startAt)} à ${formatTime(appt.startAt)}.`;
                          openWhatsApp(phone, msg, ((appt.tenant as any)?.country || "CI") as "CI" | "SN");
                        }}
                        className="h-9 px-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <MessageCircle size={14} />
                        WhatsApp Institut
                      </button>

                      {/* 2. Télécharger le Pass RDV PDF */}
                      <a
                        href={`/api/appointments/pass?id=${encodeURIComponent(appt.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-accent text-foreground font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Download size={13} />
                        Pass Cabine PDF
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* Section : Historique des soins passés */}
          {pastAppts.length > 0 && (
            <section aria-label="Historique des soins" className="space-y-3 pt-3 border-t border-border/60">
              <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
                <CheckCircle2 size={15} className="text-muted-foreground" />
                Soins passés &amp; réalisés ({pastAppts.length})
              </h3>

              <div className="space-y-2.5">
                {pastAppts.slice(0, 5).map((p) => (
                  <div key={p.id} className="p-3.5 rounded-2xl border border-border/70 bg-card/50 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-foreground truncate">{p.service?.name || "Soin réalisé"}</p>
                      <p className="text-muted-foreground truncate text-[11px] mt-0.5">
                        {p.tenant?.name} · {formatDate(p.startAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        openWhatsAppAppointmentInquiry({
                          serviceCategory: "Soin esthétique",
                          serviceName: p.service?.name,
                          tenantPhone: p.tenant?.phone || selectedInst?.phone || undefined,
                          instituteName: p.tenant?.name,
                        });
                      }}
                      className="shrink-0 h-8 px-2.5 rounded-lg border border-primary/30 text-primary font-bold text-[11px] flex items-center gap-1 hover:bg-primary/10 transition-colors"
                    >
                      Renouveler
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SOUS-ONGLET 2 : MES COMMANDES & SOINS WHATSAPP
      ═══════════════════════════════════════════════════════════ */}
      {activeSubTab === "commandes" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[22px] p-4 border border-gold/30 bg-gold/5 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold-text">
              <ShoppingBag size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="font-heading font-bold text-sm text-foreground">Commandes &amp; Réassorts WhatsApp</h4>
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
                <p className="font-heading font-bold text-sm text-foreground">Aucune commande enregistrée</p>
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
                          <span>Établissement : <strong>{tenantName}</strong></span>
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

                    {/* Liste des articles commandés */}
                    {order.items && order.items.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-1.5">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Soins inclus :</p>
                        <div className="space-y-1">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-xs">
                              <span className="text-foreground/90 font-medium">
                                • {item.label} <span className="text-muted-foreground text-[11px]">(x{item.qty})</span>
                              </span>
                              <span className="font-mono text-muted-foreground">{xof(item.totalPrice)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions sur la commande */}
                    <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const msg = `Bonjour ${tenantName} ! 📦\nJe suis ${user.name}. Je souhaite avoir des nouvelles de ma commande #${order.id.slice(-6).toUpperCase()} d'un montant de ${xof(order.total)}. Merci !`;
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
          SOUS-ONGLET 3 : CONCIERGERIE PRIVÉE WHATSAPP 24/7
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
