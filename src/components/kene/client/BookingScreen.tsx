"use client";
// Kènè Cliente — RDV: réservation instituts (services, créneaux, acompte MoMo) + mes RDV (avis, annulation)
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, BadgeCheck, CalendarDays, CalendarPlus, Check, ChevronRight, Clock, Compass, FileText, Loader2, LocateFixed, Lock, MapPin,
  MessageCircle, MessageSquareQuote, Star, TriangleAlert, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { addDays, formatDate, formatTime, xof, DEPOSIT_RATE } from "@/lib/kene/format";
import { cancellationRefund } from "@/lib/kene/rfm";
import { waLink } from "@/lib/kene/followups";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { SankofaIcon } from "@/components/kene/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Chip, IconBadge, PrimaryCTA, Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKene } from "@/store/kene";
import { useSecurity } from "@/store/security";
import { cn } from "@/lib/utils";
import {
  SERVICE_CATEGORIES,
  getServiceCategoryMeta,
  getCategoryToneBadgeClass,
} from "@/lib/kene/catalog-taxonomy";
import type { ApiAppointment, ApiInstitute, ApiPayment, ApiResource, ApiReview, ApiReviewSummary, ApiService, ApiSlot } from "./types";
import { ApptBadge, EmptyBlock, MomoProcessing, SectionTitle, Stars, SuccessBurst } from "./bits";
import { SecureVerify } from "./SecureVerify";
import { HAPTIC, haptic } from "@/lib/kene/ux";

type PayMethod = "momo" | "wave";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingScreen() {
  const user = useKene((s) => s.user)!;
  const [tab, setTab] = useState<"book" | "mine">("book");

  // ── Réserver ──
  const [institutes, setInstitutes] = useState<ApiInstitute[] | null>(null);
  const [inst, setInst] = useState<ApiInstitute | null>(null);
  const [services, setServices] = useState<ApiService[]>([]);
  const [resources, setResources] = useState<ApiResource[]>([]);
  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [reviewsInstitute, setReviewsInstitute] = useState<ApiInstitute | null>(null);
  const [modalReviews, setModalReviews] = useState<ApiReview[]>([]);
  const [reviewsSummary, setReviewsSummary] = useState<ApiReviewSummary | null>(null);
  const [reviewsFilter, setReviewsFilter] = useState<number | "all">("all");
  const [reviewModalInstitute, setReviewModalInstitute] = useState<ApiInstitute | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [service, setService] = useState<ApiService | null>(null);
  const [serviceCatFilter, setServiceCatFilter] = useState<string>("all");

  const availableCategories = useMemo(() => {
    const presentCatIds = Array.from(new Set(services.map((s) => s.category)));
    return presentCatIds.map((id) => getServiceCategoryMeta(id));
  }, [services]);

  const filteredServices = useMemo(() => {
    if (serviceCatFilter === "all") return services;
    return services.filter((s) => s.category.toLowerCase() === serviceCatFilter.toLowerCase());
  }, [services, serviceCatFilter]);

  const [day, setDay] = useState<Date>(new Date());
  const [slots, setSlots] = useState<ApiSlot[] | null>(null);
  const [slot, setSlot] = useState<ApiSlot | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("momo");
  const [paying, setPaying] = useState(false);
  const [payOverlay, setPayOverlay] = useState<{ phase: "processing" | "done"; amount: number } | null>(null);
  const [confirmed, setConfirmed] = useState<ApiAppointment | null>(null);

  // Partage des self-scans avec l'institut choisi: consentement EXPLICITE
  // (case décochée par défaut). État initial = dernier choix connu pour CET
  // institut ; l'accord n'est enregistré qu'une fois la réservation réussie
  // (la fiche CRM — créée par le RDV — doit exister pour pouvoir partager).
  const [scanShare, setScanShare] = useState<{ granted: boolean; initial: boolean; scansTotal: number } | null>(null);

  // Sécurité renforcée (2FA-lite): si activée ET acompte payant, la cliente
  // re-vérifie son code AVANT la confirmation du RDV (voir startBook + SecureVerify).
  const securityEnabled = useSecurity((s) => s.enabled);
  const [pendingBook, setPendingBook] = useState(false);

  // ── Mes RDV ──
  const [mine, setMine] = useState<ApiAppointment[] | null>(null);
  const [reviewFor, setReviewFor] = useState<ApiAppointment | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [cancelFor, setCancelFor] = useState<ApiAppointment | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);
  const deposit = service ? Math.round(service.price * DEPOSIT_RATE) : 0;
  const practitioner = useMemo(() => (slot?.resourceIds?.length ? resources.find((r) => r.id === slot.resourceIds![0]) ?? null : null), [slot, resources]);

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");

  const loadInstitutes = useCallback(async (coords?: { lat: number; lng: number } | null, district?: string) => {
    setInstitutes(null);
    try {
      const p = new URLSearchParams();
      if (coords) {
        p.set("lat", String(coords.lat));
        p.set("lng", String(coords.lng));
      }
      if (district && district !== "all") {
        p.set("city", district);
      }
      const qs = p.toString();
      const r = await apiGet<{ institutes: ApiInstitute[] }>(`/api/institutes${qs ? `?${qs}` : ""}`);
      setInstitutes(r.institutes ?? []);
    } catch {
      setInstitutes([]);
    }
  }, []);

  function requestGeo() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      toast.error("La géolocalisation n'est pas supportée par votre appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(c);
        loadInstitutes(c, selectedDistrict);
        toast.success("Salons triés par proximité GPS 📍");
      },
      (err) => {
        setLocating(false);
        toast.error("Signal GPS indisponible — vous pouvez filtrer par quartier.");
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  }

  function onFilterDistrict(d: string) {
    setSelectedDistrict(d);
    loadInstitutes(userCoords, d);
  }

  const loadMine = useCallback(async () => {
    setMine(null);
    try {
      const r = await apiGet<{ appointments: ApiAppointment[] }>(`/api/appointments?userId=${user.id}`);
      setMine(r.appointments ?? []);
    } catch {
      setMine([]);
    }
  }, [user.id]);

  useEffect(() => {
    loadInstitutes();
  }, [loadInstitutes]);

  useEffect(() => {
    if (tab === "mine") loadMine();
  }, [tab, loadMine]);

  async function openInstitute(i: ApiInstitute) {
    setInst(i);
    setService(null);
    setSlot(null);
    setSlots(null);
    setServiceCatFilter("all");
    setDetailLoading(true);
    // État de partage self-scans pour CET institut (non bloquant: pas de
    // case affichée si l'état est inconnu ou si la cliente n'a aucun scan).
    apiGet<{ scansTotal: number; shares: { tenantId: string; granted: boolean }[] }>(`/api/auth/shares?userId=${user.id}`)
      .then((r) => {
        const mine = r.shares.find((s) => s.tenantId === i.id);
        setScanShare({ granted: mine?.granted ?? false, initial: mine?.granted ?? false, scansTotal: r.scansTotal });
      })
      .catch(() => setScanShare(null));
    try {
      const r = await apiGet<{ institute: ApiInstitute; services: ApiService[]; resources: ApiResource[]; reviews: ApiReview[] }>(`/api/institutes/${i.id}`);
      setServices(r.services ?? []);
      setResources(r.resources ?? []);
      setReviews(r.reviews ?? []);
    } catch {
      toast.error("Institut indisponible");
      setInst(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const refreshCurrentInstitute = useCallback(async (tenantId: string) => {
    try {
      const r = await apiGet<{ institute: ApiInstitute; services: ApiService[]; resources: ApiResource[]; reviews: ApiReview[] }>(`/api/institutes/${tenantId}`);
      setInst(r.institute);
      setReviews(r.reviews ?? []);
    } catch {}
  }, []);

  const openReviewsModal = useCallback(async (targetInst: ApiInstitute) => {
    setReviewsInstitute(targetInst);
    setReviewsFilter("all");
    setShowReviewsModal(true);
    if (inst && inst.id === targetInst.id && reviews.length > 0) {
      setModalReviews(reviews);
    }
    try {
      const res = await apiGet<{ reviews: ApiReview[]; summary: ApiReviewSummary }>(`/api/institutes/${targetInst.id}/reviews`);
      setModalReviews(res.reviews ?? []);
      setReviewsSummary(res.summary ?? null);
    } catch {
      // fallback
    }
  }, [inst, reviews]);

  const filteredModalReviews = useMemo(() => {
    if (reviewsFilter === "all") return modalReviews;
    return modalReviews.filter((r) => r.rating === reviewsFilter);
  }, [modalReviews, reviewsFilter]);

  async function pickDay(d: Date) {
    setDay(d);
    setSlot(null);
    setSlots(null);
    if (!service || !inst) return;
    try {
      const r = await apiGet<{ slots: ApiSlot[] }>(`/api/institutes/${inst.id}/availability?date=${isoDate(d)}&serviceId=${service.id}`);
      setSlots(r.slots ?? []);
    } catch {
      setSlots([]);
    }
  }

  async function chooseService(s: ApiService) {
    setService(s);
    setSlot(null);
    setSlots(null);
    if (!inst) return;
    try {
      const r = await apiGet<{ slots: ApiSlot[] }>(`/api/institutes/${inst.id}/availability?date=${isoDate(day)}&serviceId=${s.id}`);
      setSlots(r.slots ?? []);
    } catch {
      setSlots([]);
    }
  }

 /** Passerelle confirmation: vérification d'identité par code si la
 * sécurité renforcée est active et qu'un acompte est réglé — la
 * réservation (book) ne part qu'une fois le code confirmé. */
  function startBook() {
    if (securityEnabled && deposit > 0) {
      haptic(HAPTIC.tap);
      setPendingBook(true);
      return;
    }
    void book();
  }

  async function book() {
    if (!inst || !service || !slot) return;
    setPaying(true);
    try {
      const [h, m] = slot.time.split(":").map(Number);
      const startAt = new Date(day);
      startAt.setHours(h, m, 0, 0);
      const r = await apiPost<{
        appointment: ApiAppointment;
        payment?: ApiPayment;
        paymentUrl?: string | null;
        saspayLaunchUrl?: string | null;
        winipayerLaunchUrl?: string | null;
        waveLaunchUrl?: string | null;
      }>("/api/appointments", {
        tenantId: inst.id,
        serviceId: service.id,
        resourceId: slot.resourceIds?.[0] ?? resources[0]?.id,
        startAt: startAt.toISOString(),
        clientName: user.name,
        clientPhone: user.phone,
        userId: user.id,
        depositAmount: deposit,
        paymentMethod: payMethod === "momo" ? "saspay" : payMethod,
      });

      const checkoutUrl = r.paymentUrl || r.saspayLaunchUrl || r.winipayerLaunchUrl || (payMethod === "wave" ? r.waveLaunchUrl : null);
      if (checkoutUrl && typeof window !== "undefined") {
        toast.info("Redirection vers la passerelle sécurisée...", {
          description: "Finalise le règlement de ton acompte par Mobile Money ou Carte 💳",
        });
        window.location.href = checkoutUrl;
        return;
      }

      if (r.payment) {
        // Contrat confirmToken: un acompte mobile money en attente porte son jeton
        const confirmToken = r.payment.confirmToken;
        if (!confirmToken) {
          setPayOverlay(null);
          toast.error("Paiement impossible — réessaie dans quelques instants");
          return;
        }
        setPayOverlay({ phase: "processing", amount: deposit });
        await new Promise((res) => setTimeout(res, 2000));
        await apiPost("/api/payments/confirm", { paymentId: r.payment.id, confirmToken });
      } else {
        setPayOverlay({ phase: "processing", amount: deposit });
        await new Promise((res) => setTimeout(res, 1200));
      }
      setPayOverlay({ phase: "done", amount: deposit });
      haptic(HAPTIC.success);
      setTimeout(() => setPayOverlay(null), 1400);
      setConfirmed(r.appointment);
      // Consentement de partage self-scans: enregistré une fois la fiche CRM
      // créée par le RDV (silencieux en cas d'échec — révocable depuis le profil).
      if (scanShare?.granted && !scanShare.initial) {
        apiPost("/api/auth/shares", { userId: user.id, tenantId: inst.id, granted: true })
          .then(() => {
            toast.success(`Diagnostics partagés avec ${inst.name}`, {
              description: "Ton esthéticienne voit ton historique de scans pour personnaliser tes soins.",
            });
            setScanShare({ ...scanShare, initial: true });
          })
          .catch(() => {});
      }
    } catch (e) {
      setPayOverlay(null);
      toast.error(e instanceof Error ? e.message : "Réservation impossible");
    } finally {
      setPaying(false);
    }
  }

  async function submitReview() {
    const targetTenantId = reviewFor?.tenantId || reviewModalInstitute?.id || inst?.id;
    if (!targetTenantId) return;
    setSubmittingReview(true);
    try {
      await apiPost(`/api/institutes/${targetTenantId}/reviews`, {
        userId: user.id,
        rating,
        comment: comment.trim() || undefined,
        appointmentId: reviewFor?.id,
      });
      toast.success("Merci ! Ton avis a bien été publié.");
      haptic(HAPTIC.success);
      setReviewFor(null);
      setReviewModalInstitute(null);
      setComment("");
      setRating(5);
      loadMine();
      if (inst && inst.id === targetTenantId) {
        refreshCurrentInstitute(targetTenantId);
      }
      if (reviewsInstitute && reviewsInstitute.id === targetTenantId) {
        openReviewsModal(reviewsInstitute);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setSubmittingReview(false);
    }
  }

  async function doCancel() {
    if (!cancelFor) return;
    try {
      const r = await apiPost<{ appointment: ApiAppointment; refund: { amount: number; label: string } }>(`/api/appointments/${cancelFor.id}/cancel`, { userId: user.id });
      toast.success(r.refund.amount > 0 ? `RDV annulé — ${xof(r.refund.amount)} remboursés` : "RDV annulé");
      setCancelFor(null);
      loadMine();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Annulation impossible");
    }
  }

  const now = Date.now();
  const upcoming = (mine ?? []).filter((a) => new Date(a.startAt).getTime() >= now && a.status !== "cancelled").sort((x, y) => +new Date(x.startAt) - +new Date(y.startAt));
  const past = (mine ?? []).filter((a) => new Date(a.startAt).getTime() < now || a.status === "cancelled" || a.status === "completed").sort((x, y) => +new Date(y.startAt) - +new Date(x.startAt));
  const unreviewedAppt = (past ?? []).find((a) => a.status === "completed" && !a.review);

  return (
    <div className="pt-4 pb-2">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "book" | "mine")}>
        <TabsList className="w-full grid grid-cols-2 bg-muted/60 rounded-2xl p-1">
          <TabsTrigger value="book" className="rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary font-semibold text-sm py-2.5">Réserver</TabsTrigger>
          <TabsTrigger value="mine" className="rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary font-semibold text-sm py-2.5">Mes RDV</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ═══════ RÉSERVER ═══════ */}
      {tab === "book" && (
        <AnimatePresence mode="wait">
          {confirmed ? (
 /* — Confirmation — */
            <motion.div key="ok" exit={{ opacity: 0, x: -30 }}>
              <Reveal className="flex flex-col items-center pt-8 text-center">
                <RevealItem>
                  <span className="grid place-items-center h-20 w-20 rounded-full bg-[#3F7D3F]/15 text-[#3F7D3D]">
                    <SankofaIcon size={38} />
                  </span>
                </RevealItem>
                <RevealItem>
                  <h2 className="font-heading font-black text-xl mt-4">Rendez-vous confirmé</h2>
                </RevealItem>
                <RevealItem className="w-full">
                  <div className="mt-4 w-full k-card k-card-hero rounded-[24px] p-4 text-left space-y-1.5">
                    <p className="font-semibold text-sm">{confirmed.service?.name ?? "Soin"}</p>
                    <p className="text-xs text-muted-foreground">{confirmed.tenant?.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarDays size={13} /> {formatDate(confirmed.startAt)} · <Clock size={13} /> {formatTime(confirmed.startAt)}</p>
                    {confirmed.resource?.name && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Users size={13} /> {confirmed.resource.name}</p>}
                    {confirmed.depositAmount > 0 && <p className="text-xs font-mono text-primary font-bold tabular-nums pt-1 border-t border-dashed border-border">Acompte réglé : {xof(confirmed.depositAmount)}</p>}
                  </div>
                </RevealItem>
                <RevealItem>
                  <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#3F7D3F]/10 text-[#3F7D3D] px-3 py-1.5 text-[11px] font-semibold">
                    <MessageSquareQuote size={13} /> Rappel SMS J-1 programmé
                  </p>
                </RevealItem>
                <RevealItem className="w-full">
                  <a
                    href={`/api/appointments/pass?id=${confirmed.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 h-12 w-full rounded-xl border border-primary/40 bg-primary/10 text-primary text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <FileText size={16} /> Télécharger mon Pass RDV (PDF)
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const appUrl = typeof window !== "undefined" ? window.location.origin : "https://kene.app";
                      const passUrl = `${appUrl}/api/appointments/pass?id=${encodeURIComponent(confirmed.id)}`;
                      const msg = `Bonjour ! 💆‍♀️ Mon soin *${confirmed.service?.name ?? "Soin"}* chez *${confirmed.tenant?.name ?? "l'institut"}* est confirmé pour le ${formatDate(confirmed.startAt)} à ${formatTime(confirmed.startAt)}.\n\nMon Pass Rendez-Vous officiel Kènè : ${passUrl}`;
                      openWhatsApp(user?.phone || "", msg);
                    }}
                    className="mt-2.5 h-12 w-full rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/30 text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <MessageCircle size={16} className="text-[#25D366]" /> Partager sur WhatsApp
                  </button>
                </RevealItem>
                <RevealItem className="w-full">
                  <div className="mt-3 grid grid-cols-2 gap-3 w-full">
                    <button onClick={() => { setConfirmed(null); setInst(null); setService(null); loadInstitutes(); }} className="h-12 rounded-xl border border-primary/60 text-primary text-sm font-bold active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
                      Autre RDV
                    </button>
                    <button onClick={() => setTab("mine")} className="k-btn-gold h-12 rounded-xl text-primary-foreground text-sm font-bold focus-visible:outline-2 focus-visible:outline-primary">
                      Mes RDV
                    </button>
                  </div>
                </RevealItem>
              </Reveal>
            </motion.div>
          ) : !inst ? (
 /* — Liste instituts — */
            <motion.div key="list" exit={{ opacity: 0, x: -30 }}>
              <Reveal className="space-y-3">
                <RevealItem>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <SectionTitle icon={<MapPin size={16} />}>Instituts partenaires</SectionTitle>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Prenez rendez-vous directement auprès des salons, spas et cabinets certifiés
                        </p>
                      </div>
                      <button
                        onClick={requestGeo}
                        disabled={locating}
                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold transition-all ${
                          userCoords
                            ? "bg-[#3F7D3F]/15 text-[#3F7D3F] border border-[#3F7D3F]/40"
                            : "k-chip text-muted-foreground hover:text-foreground"
                        }`}
                        title="Trier par distance GPS depuis votre position"
                      >
                        {locating ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <LocateFixed size={13} className={userCoords ? "text-[#3F7D3F]" : ""} />
                        )}
                        <span>{userCoords ? "GPS actif" : "Autour de moi"}</span>
                      </button>
                    </div>

                    {/* Puces de filtrage de quartiers phares */}
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
                      {[
                        { id: "all", label: "Tous les salons" },
                        { id: "cocody", label: "Cocody" },
                        { id: "marcory", label: "Marcory" },
                        { id: "plateau", label: "Plateau" },
                        { id: "almadies", label: "Almadies" },
                      ].map((d) => (
                        <button
                          key={d.id}
                          onClick={() => onFilterDistrict(d.id)}
                          className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition ${
                            selectedDistrict === d.id
                              ? "bg-primary text-primary-foreground font-bold shadow-sm"
                              : "k-chip text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </RevealItem>
                {institutes === null ? (
                  <div className="space-y-3">
                    {[0, 1].map((i) => <Shimmer key={i} className="h-36 rounded-[24px]" />)}
                  </div>
                ) : institutes.length === 0 ? (
                  <EmptyBlock icon={<MapPin size={22} />} title="Aucun institut pour l'instant" text="De nouveaux instituts Kènè arrivent à Abidjan et Dakar." />
                ) : (
                  institutes.map((i) => (
                    <RevealItem key={i.id}>
                      <button onClick={() => openInstitute(i)} className="k-card k-card-hover block w-full rounded-[24px] p-2.5 text-left transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary">
                        <div className="relative">
                          <img src={i.image} alt={i.name} loading="lazy" className="h-32 w-full rounded-[18px] object-cover" />
                          <div aria-hidden="true" className="absolute inset-0 rounded-[18px] bg-gradient-to-t from-[#1A1410]/65 via-[#1A1410]/15 to-transparent" />
                          <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2 text-[#F8F1E4]">
                            <div className="min-w-0">
                              <p className="font-heading text-sm font-bold leading-tight">{i.name}</p>
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="k-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-foreground">
                                  <MapPin size={10} aria-hidden="true" /> {i.address || `${i.city}, ${i.country}`}
                                </span>
                                {i.distanceKm !== null && i.distanceKm !== undefined && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#3F7D3F]/20 text-[#8FD18F] px-2 py-0.5 text-[10px] font-bold font-mono">
                                    <LocateFixed size={9} /> {i.distanceKm} km
                                  </span>
                                )}
                              </div>
                            </div>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                openReviewsModal(i);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                  openReviewsModal(i);
                                }
                              }}
                              className="flex shrink-0 items-center gap-1 rounded-full bg-[#1A1410]/70 hover:bg-[#1A1410]/90 px-2 py-0.5 text-[10px] font-bold text-[#F8F1E4] transition-colors cursor-pointer"
                              title="Consulter les avis vérifiés de cet institut"
                            >
                              <Star size={10} className="fill-[#C8951E] text-[#C8951E]" aria-hidden="true" /> {i.rating.toFixed(1)} ({i.reviewCount})
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-2.5 text-[11px] text-muted-foreground">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              openReviewsModal(i);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                openReviewsModal(i);
                              }
                            }}
                            className="hover:text-foreground hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span>{i._count?.services ?? 0} soins · <strong className="text-foreground font-semibold">{i._count?.reviews ?? i.reviewCount ?? 0} avis</strong></span>
                          </span>
                          <span className="k-btn-gold inline-flex items-center gap-0.5 rounded-full px-3.5 py-1.5 font-bold text-primary-foreground">
                            Réserver <ChevronRight size={13} aria-hidden="true" />
                          </span>
                        </div>
                      </button>
                    </RevealItem>
                  ))
                )}
              </Reveal>
            </motion.div>
          ) : (
 /* — Détail institut — */
            <motion.div key="detail" exit={{ opacity: 0, x: -30 }}>
              <Reveal>
                <RevealItem>
                  <button onClick={() => setInst(null)} className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded" aria-label="Retour aux instituts">
                    <ArrowLeft size={15} /> Tous les instituts
                  </button>
                  <div className="k-card mt-3 rounded-[24px] p-2.5">
                    <div className="relative">
                      <img src={inst.image} alt={inst.name} className="h-44 w-full rounded-[18px] object-cover" />
                      <div aria-hidden="true" className="absolute inset-0 rounded-[18px] bg-gradient-to-t from-[#1A1410]/75 via-[#1A1410]/15 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4 text-[#F8F1E4]">
                        <h2 className="font-heading font-black text-lg leading-tight">{inst.name}</h2>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 px-1 pt-2.5">
                      <button
                        type="button"
                        onClick={() => openReviewsModal(inst)}
                        className="k-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold hover:bg-primary/10 transition-colors"
                        title="Consulter les avis vérifiés"
                      >
                        <Star size={11} className="fill-[#C8951E] text-[#C8951E]" aria-hidden="true" />
                        <span className="font-bold">{inst.rating.toFixed(1)}</span>
                        <span className="text-muted-foreground">({inst.reviewCount} avis)</span>
                      </button>
                      <span className="k-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                        <MapPin size={11} aria-hidden="true" /> {inst.address || inst.city}
                      </span>
                      {inst.distanceKm !== null && inst.distanceKm !== undefined && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#3F7D3F]/15 text-[#3F7D3F] dark:text-[#8FD18F] border border-[#3F7D3F]/30 px-2.5 py-1 text-[11px] font-bold font-mono">
                          <LocateFixed size={11} /> {inst.distanceKm} km d&apos;ici
                        </span>
                      )}
                      <span className="k-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                        <Clock size={11} aria-hidden="true" /> {inst.openingHour}h–{inst.closingHour}h
                      </span>
                    </div>
                  </div>
                </RevealItem>
                <RevealItem>
                  {inst.description && <p className="text-xs text-muted-foreground leading-relaxed mt-3">{inst.description}</p>}
                </RevealItem>

                {/* — WhatsApp direct cliente → institut: message
 pré-rempli, sans quitter l'app (lien wa.me officiel). */}
                {inst.phone && (
                  <RevealItem>
                    <a
                      href={waLink(inst.phone, `Bonjour ${inst.name} 👋 Je suis sur l'app Kènè et j'aimerais des informations sur vos soins.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#3F7D3F]/12 text-[#2E5C2E] text-sm font-bold ring-1 ring-[#3F7D3F]/30 transition-all hover:bg-[#3F7D3F]/20 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#3F7D3F] dark:text-[#8FD18F]"
                      aria-label={`Écrire à ${inst.name} sur WhatsApp`}
                    >
                      <MessageCircle size={17} aria-hidden="true" /> Écrire à l&apos;institut sur WhatsApp
                    </a>
                  </RevealItem>
                )}

              {detailLoading ? (
                <div className="space-y-2 mt-4">{[0, 1, 2].map((i) => <Shimmer key={i} className="h-16 rounded-[18px]" />)}</div>
              ) : (
                <>
                  {/* Avis clientes & Réputation vérifiée */}
                  <RevealItem>
                    <div className="k-card mt-4 rounded-[22px] p-3.5 border border-[#C8951E]/20 bg-gradient-to-br from-[#C8951E]/5 via-card to-card">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex items-center justify-center size-10 rounded-2xl bg-[#C8951E]/15 text-[#C8951E] font-heading font-black text-sm shrink-0">
                            {inst.rating.toFixed(1)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <Stars rating={Math.round(inst.rating)} size={11} />
                              <span className="text-xs font-bold text-foreground ml-1">{inst.rating.toFixed(1)}/5</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {inst.reviewCount > 0 ? `${inst.reviewCount} avis vérifiés de la communauté` : "Soyez la première à donner votre avis"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setReviewModalInstitute(inst);
                              setReviewFor(null);
                              setRating(5);
                              setComment("");
                            }}
                            className="h-8 px-2.5 rounded-full border border-[#C8951E]/40 text-[#C8951E] text-[11px] font-bold hover:bg-[#C8951E]/10 transition-colors active:scale-95"
                          >
                            Noter
                          </button>
                          {reviews.length > 0 && (
                            <button
                              type="button"
                              onClick={() => openReviewsModal(inst)}
                              className="h-8 px-3 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold transition-colors active:scale-95"
                            >
                              Tous les avis ({reviews.length})
                            </button>
                          )}
                        </div>
                      </div>

                      {reviews.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                            {reviews.slice(0, 5).map((rv) => (
                              <div key={rv.id} className="rounded-2xl bg-muted/40 p-2.5 shrink-0 w-52 border border-border/40 space-y-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[11px] font-bold truncate">{rv.user?.name ?? "Cliente Kènè"}</span>
                                  <Stars rating={rv.rating} size={8} />
                                </div>
                                {rv.serviceName && (
                                  <p className="text-[9px] text-[#3F7D3F] dark:text-[#8FD18F] font-semibold flex items-center gap-0.5 truncate">
                                    <BadgeCheck size={10} className="shrink-0" /> {rv.serviceName}
                                  </p>
                                )}
                                <p className="text-[10px] text-muted-foreground line-clamp-2 italic leading-tight">
                                  « {rv.comment || "Très satisfaite de la prestation."} »
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </RevealItem>

                  {/* Services — cartes radio avec filtres par catégorie */}
                  <RevealItem>
                    <div className="mt-5 mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Soins & tarifs ({filteredServices.length})
                      </p>
                    </div>

                    {/* Chips des types de soins disponibles dans cet institut */}
                    {availableCategories.length > 1 && (
                      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin -mx-1 px-1 mb-2" role="group" aria-label="Filtrer les soins par type">
                        <Chip
                          selected={serviceCatFilter === "all"}
                          onClick={() => setServiceCatFilter("all")}
                          className="min-h-9 text-xs shrink-0"
                        >
                          Tous ({services.length})
                        </Chip>
                        {availableCategories.map((c) => {
                          const count = services.filter((s) => s.category === c.id).length;
                          return (
                            <Chip
                              key={c.id}
                              selected={serviceCatFilter === c.id}
                              onClick={() => setServiceCatFilter(c.id)}
                              className="min-h-9 text-xs shrink-0"
                            >
                              {c.shortLabel} ({count})
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                  </RevealItem>

                  {filteredServices.length === 0 ? (
                    <RevealItem>
                      <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        Aucun soin disponible dans cette catégorie.
                      </p>
                    </RevealItem>
                  ) : (
                    filteredServices.map((s) => {
                      const sel = service?.id === s.id;
                      const catMeta = getServiceCategoryMeta(s.category);
                      return (
                        <RevealItem key={s.id}>
                          <div className="k-card rounded-[24px] p-2">
                            <div className={`flex items-start gap-3 rounded-[18px] p-3 transition-all duration-300 ${sel ? "bg-primary/8 ring-2 ring-primary/60" : ""}`}>
                              {/* — visuel du soin si l'institut en a posé un, sinon le badge horloge */}
                              {s.hasPhoto ? (
                                <span className="mt-0.5 size-10 shrink-0 overflow-hidden rounded-[12px] ring-1 ring-border">
                                  <img src={`/api/media/service/${s.id}`} alt={`Illustration du soin ${s.name}`} loading="lazy" className="size-full object-cover" />
                                </span>
                              ) : (
                                <IconBadge icon={sel ? <Check size={17} /> : <Clock size={17} />} tone={sel ? "gold" : "terre"} className="mt-0.5" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 border font-medium", getCategoryToneBadgeClass(catMeta.tone))}>
                                        {catMeta.label}
                                      </Badge>
                                    </div>
                                    <p className="min-w-0 text-sm font-semibold leading-snug">{s.name}</p>
                                  </div>
                                  <p className="shrink-0 font-mono text-sm font-bold tabular-nums text-gold-text">{xof(s.price)}</p>
                                </div>
                                <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="flex shrink-0 items-center gap-1">{s.durationMin} min</span>
                                  {s.botanicals && <span className="truncate text-terre font-medium">{s.botanicals}</span>}
                                </p>
                                <button onClick={() => chooseService(s)} className={`mt-2.5 h-11 w-full rounded-full text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${sel ? "k-btn-gold text-primary-foreground" : "k-chip text-primary"}`}>
                                  {sel ? "Choisi" : "Choisir"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </RevealItem>
                      );
                    })
                  )}

                  {/* Jours + créneaux */}
                  {service && (
                    <Reveal className="mt-6">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Choisis ton jour</p>
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {days.map((d) => {
                          const sel = isoDate(d) === isoDate(day);
                          return (
                            <button key={d.toISOString()} onClick={() => pickDay(d)} aria-pressed={sel} className={`shrink-0 rounded-[18px] border px-3.5 py-2 text-center transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${sel ? "k-btn-gold border-transparent text-primary-foreground" : "border-border bg-card text-foreground"}`}>
                              <span className="block text-[9px] uppercase font-bold opacity-70">{formatDate(d, { weekday: "short" })}</span>
                              <span className="block font-mono text-sm font-bold mt-0.5">{d.getDate()}</span>
                            </button>
                          );
                        })}
                      </div>

                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-5 mb-2">Créneaux — {formatDate(day, { weekday: "long", day: "numeric", month: "long" })}</p>
                      {slots === null ? (
                        <div className="flex justify-center py-6"><Loader2 size={22} className="animate-spin text-primary" /></div>
                      ) : slots.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Aucun créneau affiché — choisis un autre jour.</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {slots.map((s) =>
                            s.available ? (
                              <Chip key={s.time} selected={slot?.time === s.time} onClick={() => setSlot(s)} className="min-h-11 w-full justify-center font-mono font-bold">
                                {s.time}
                              </Chip>
                            ) : (
                              <span key={s.time} aria-disabled="true" className="grid min-h-11 w-full place-items-center rounded-full bg-muted font-mono text-xs font-semibold text-muted-foreground/40 line-through">
                                {s.time}
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </Reveal>
                  )}

                  {/* Récap + paiement */}
                  {service && slot && (
                    <Reveal className="k-card k-card-hero mt-6 rounded-[24px] p-4">
                      <p className="font-heading font-bold text-sm mb-3 flex items-center gap-2.5">
                        <IconBadge icon={<CalendarPlus size={15} />} size="sm" /> Récapitulatif
                      </p>
                      <div className="space-y-1.5 text-xs">
                        <p className="flex justify-between"><span className="text-muted-foreground">Établissement</span><span className="font-semibold text-primary">{inst.name}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Soin</span><span className="font-semibold">{service.name}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Quand</span><span className="font-semibold font-mono tabular-nums">{formatDate(day, { weekday: "short", day: "numeric", month: "short" })} {slot.time}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Praticienne</span><span className="font-semibold">{practitioner?.name ?? "Assignée à l'arrivée"}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Prix du soin</span><span className="font-mono font-semibold tabular-nums">{xof(service.price)}</span></p>
                        <p className="flex justify-between border-t border-dashed border-border pt-1.5"><span className="font-semibold">Acompte 30 % (aujourd&apos;hui)</span><span className="font-mono font-black tabular-nums text-primary">{xof(deposit)}</span></p>
                        <p className="text-[10px] text-muted-foreground">Solde de {xof(service.price - deposit)} à régler sur place auprès de {inst.name}. Annulation gratuite &gt; 72 h.</p>
                      </div>

                      {/* Consentement explicite: partage de l'historique de
                     self-scans avec CET institut (décoché par défaut). */}
                      {scanShare && scanShare.scansTotal > 0 && (
                        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 p-3">
                          <div className="flex items-start gap-2.5">
                            <Checkbox
                              id="share-scans"
                              checked={scanShare.granted}
                              onCheckedChange={(v) => setScanShare({ ...scanShare, granted: v === true })}
                              className="mt-0.5"
                            />
                            <label htmlFor="share-scans" className="cursor-pointer text-[11px] leading-relaxed">
                              <span className="font-semibold">Partager mes {scanShare.scansTotal} diagnostics de peau avec {inst.name}</span>
                              <span className="text-muted-foreground">
                                {" "}— pour que mon esthéticienne personnalise mes soins. Je peux retirer ce partage à tout moment depuis mon profil.
                              </span>
                            </label>
                          </div>
                        </div>
                      )}

                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-4 mb-2">Payer l&apos;acompte avec</p>
                      {securityEnabled && deposit > 0 && (
                        <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1">
                          <Lock size={10} aria-hidden="true" /> Vérification par code activée
                        </p>
                      )}
                      <div className="space-y-2">
                        <button
                          onClick={() => setPayMethod("momo")}
                          aria-pressed={true}
                          className="w-full h-12 rounded-xl border-2 border-gold-text bg-primary/10 text-primary flex items-center justify-center gap-2.5 text-xs font-bold active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <span className="flex -space-x-1 items-center">
                            <span className="h-5 w-5 rounded-full grid place-items-center text-[9px] font-black text-white bg-[#1DC8FF]">W</span>
                            <span className="h-5 w-5 rounded-full grid place-items-center text-[9px] font-black text-white bg-[#FF6600]">O</span>
                            <span className="h-5 w-5 rounded-full grid place-items-center text-[9px] font-black text-[#1A1410] bg-[#FFCC00]">M</span>
                          </span>
                          <span>Régler l&apos;acompte par Mobile Money (Wave, Orange, MTN)</span>
                        </button>
                      </div>

                      <PrimaryCTA onClick={startBook} disabled={paying} className="mt-3 w-full">
                        {paying ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />} Confirmer pour {xof(deposit)}
                      </PrimaryCTA>
                    </Reveal>
                  )}
                </>
              )}
              </Reveal>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ═══════ MES RDV ═══════ */}
      {tab === "mine" && (
        <div className="mt-4 space-y-6">
          <section aria-labelledby="up-t">
            <SectionTitle icon={<CalendarDays size={16} />}><span id="up-t">À venir</span></SectionTitle>
            {mine === null ? (
              <div className="space-y-2">{[0, 1].map((i) => <Shimmer key={i} className="h-24 rounded-[24px]" />)}</div>
            ) : upcoming.length === 0 ? (
              <EmptyBlock icon={<CalendarDays size={22} />} title="Aucun RDV à venir" text="Réserve un soin chez un institut partenaire en 2 minutes." />
            ) : (
              <Reveal className="space-y-2.5">
                {upcoming.map((a) => (
                  <RevealItem key={a.id}>
                    <div className="k-card rounded-[24px] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{a.service?.name ?? "Soin"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{a.tenant?.name} · {a.resource?.name}</p>
                          <p className="text-xs font-mono mt-1 text-primary">{formatDate(a.startAt, { weekday: "short", day: "numeric", month: "short" })} · {formatTime(a.startAt)}</p>
                        </div>
                        <ApptBadge status={a.status} />
                      </div>
                      {a.depositAmount > 0 && <p className="text-[10px] text-muted-foreground mt-2 font-mono">Acompte {xof(a.depositAmount)} réglé</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <a
                          href={`/api/appointments/pass?id=${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-10 px-3.5 rounded-xl border border-primary/40 bg-primary/5 text-primary text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
                          aria-label={`Télécharger le Pass RDV PDF pour ${a.service?.name ?? "le soin"}`}
                        >
                          <FileText size={14} aria-hidden="true" />
                          <span>Pass RDV (PDF)</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            const appUrl = typeof window !== "undefined" ? window.location.origin : "https://kene.app";
                            const passUrl = `${appUrl}/api/appointments/pass?id=${encodeURIComponent(a.id)}`;
                            const msg = `Bonjour ! 💆‍♀️ Mon soin *${a.service?.name ?? "Soin"}* chez *${a.tenant?.name ?? "l'institut"}* est prévu le ${formatDate(a.startAt)} à ${formatTime(a.startAt)}.\n\nPass RDV Kènè : ${passUrl}`;
                            openWhatsApp(user?.phone || "", msg);
                          }}
                          className="h-10 px-3 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 text-[#128C7E] dark:text-[#25D366] text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform hover:bg-[#25D366]/20"
                          title="Partager sur WhatsApp"
                        >
                          <MessageCircle size={14} className="text-[#25D366]" />
                          <span>WhatsApp</span>
                        </button>
                        <button
                          onClick={() => setCancelFor(a)}
                          disabled={a.status === "cancelled"}
                          className="h-10 px-4 rounded-xl border border-destructive/40 text-destructive text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-destructive"
                        >
                          <X size={14} /> Annuler
                        </button>
                      </div>
                    </div>
                  </RevealItem>
                ))}
              </Reveal>
            )}
          </section>

          <section aria-labelledby="past-t" className="pb-2">
            <SectionTitle icon={<MessageSquareQuote size={16} />}><span id="past-t">Passés</span></SectionTitle>

            {unreviewedAppt && (
              <div className="mb-3.5 rounded-[22px] bg-gradient-to-br from-[#C8951E]/15 via-[#C8951E]/5 to-card border border-[#C8951E]/30 p-3.5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-2xl bg-[#C8951E]/20 text-[#C8951E] flex items-center justify-center shrink-0 mt-0.5">
                    <Star size={18} className="fill-[#C8951E]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-foreground">Votre avis compte pour la communauté !</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      Comment s&apos;est passé votre soin {unreviewedAppt.service?.name} chez {unreviewedAppt.tenant?.name} ?
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewFor(unreviewedAppt);
                        setReviewModalInstitute(null);
                        setRating(5);
                        setComment("");
                      }}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#C8951E] text-white px-3.5 py-1.5 text-xs font-bold shadow hover:bg-[#b08216] active:scale-95 transition-all"
                    >
                      <Star size={13} className="fill-white" /> Évaluer mon soin maintenant
                    </button>
                  </div>
                </div>
              </div>
            )}

            {mine === null ? (
              <Shimmer className="h-20 rounded-[24px]" />
            ) : past.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Tes RDV passés apparaîtront ici.</p>
            ) : (
              <Reveal className="space-y-2.5">
                {past.map((a) => (
                  <RevealItem key={a.id}>
                    <div className="k-card flex items-center gap-3 rounded-[24px] p-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{a.service?.name ?? "Soin"}</p>
                        <p className="text-[11px] text-muted-foreground">{a.tenant?.name} · {formatDate(a.startAt)}</p>
                      </div>
                      <ApptBadge status={a.status} />
                      {a.status === "completed" && (
                        a.review ? (
                          <span className="h-8 px-2.5 rounded-full bg-[#C8951E]/15 text-[#C8951E] text-[11px] font-bold flex items-center gap-1 shrink-0" title={`Avis déposé : ${a.review.rating}/5`}>
                            <Star size={11} className="fill-[#C8951E]" aria-hidden="true" /> {a.review.rating}/5
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewFor(a);
                              setReviewModalInstitute(null);
                              setRating(5);
                              setComment("");
                            }}
                            className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-transform shadow-sm focus-visible:outline-2 focus-visible:outline-primary shrink-0"
                          >
                            <Star size={11} className="fill-current" aria-hidden="true" /> Noter
                          </button>
                        )
                      )}
                    </div>
                  </RevealItem>
                ))}
              </Reveal>
            )}
          </section>
        </div>
      )}

      {/* Dialog avis — soumission après RDV ou directe institut */}
      <Dialog
        open={!!reviewFor || !!reviewModalInstitute}
        onOpenChange={(o) => {
          if (!o) {
            setReviewFor(null);
            setReviewModalInstitute(null);
          }
        }}
      >
        <DialogContent className="max-w-[380px] rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle className="font-heading font-black text-base flex items-center gap-2">
              <Star size={18} className="fill-[#C8951E] text-[#C8951E]" />
              {reviewFor ? "Votre avis sur ce soin" : `Avis sur ${reviewModalInstitute?.name ?? "l'institut"}`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            {reviewFor ? `${reviewFor.service?.name} · ${reviewFor.tenant?.name}` : "Partagez votre retour d'expérience avec les autres clientes"}
          </p>
          <div className="flex justify-center gap-2 py-3" role="radiogroup" aria-label="Note sur 5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setRating(i);
                  haptic(HAPTIC.tap);
                }}
                role="radio"
                aria-checked={rating === i}
                aria-label={`${i} étoile${i > 1 ? "s" : ""}`}
                className="active:scale-90 transition-transform focus-visible:outline-2 focus-visible:outline-primary rounded p-1"
              >
                <Star size={30} className={i <= rating ? "fill-[#C8951E] text-[#C8951E]" : "text-muted-foreground/30"} />
              </button>
            ))}
          </div>
          <p className="text-center font-bold text-xs text-[#C8951E] -mt-1 mb-2">
            {rating === 5 ? "Exceptionnel (5/5)" : rating === 4 ? "Très bien (4/5)" : rating === 3 ? "Bien (3/5)" : rating === 2 ? "Moyen (2/5)" : "Décevant (1/5)"}
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Accueil chaleureux, propreté, professionnalisme, résultat du soin…"
            aria-label="Commentaire"
            className="k-input w-full rounded-2xl p-3 text-xs leading-relaxed"
          />
          <button
            type="button"
            disabled={submittingReview}
            onClick={submitReview}
            className="k-btn-gold h-12 rounded-2xl text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
          >
            {submittingReview ? <Loader2 size={16} className="animate-spin" /> : <Star size={14} className="fill-current" />}
            Publier mon avis vérifié
          </button>
        </DialogContent>
      </Dialog>

      {/* Modal consultation publique de TOUS les avis de l'institut */}
      <Dialog open={showReviewsModal} onOpenChange={(o) => !o && setShowReviewsModal(false)}>
        <DialogContent className="max-w-[480px] max-h-[85vh] flex flex-col rounded-3xl p-5 overflow-hidden">
          <DialogHeader className="shrink-0 pb-2">
            <DialogTitle className="font-heading font-black text-base flex items-center justify-between">
              <span>Avis clientes vérifiés</span>
              {reviewsInstitute && (
                <span className="text-xs font-normal text-muted-foreground truncate max-w-[190px]">
                  {reviewsInstitute.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Synthèse des notes */}
          <div className="rounded-2xl bg-muted/40 p-3.5 flex items-center justify-between gap-3 border border-border/50 shrink-0">
            <div className="text-center shrink-0 pr-3 border-r border-border/60">
              <p className="font-heading font-black text-3xl text-foreground">
                {(reviewsSummary?.averageRating ?? reviewsInstitute?.rating ?? 5.0).toFixed(1)}
              </p>
              <div className="flex justify-center mt-0.5">
                <Stars rating={Math.round(reviewsSummary?.averageRating ?? reviewsInstitute?.rating ?? 5.0)} size={11} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                {reviewsSummary?.totalCount ?? modalReviews.length ?? 0} avis
              </p>
            </div>

            <div className="flex-1 space-y-1 text-[11px]">
              {[5, 4, 3, 2, 1].map((star) => {
                const total = reviewsSummary?.totalCount || modalReviews.length || 1;
                const count = reviewsSummary?.breakdown?.[star] ?? modalReviews.filter((r) => r.rating === star).length;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={star} className="flex items-center gap-1.5">
                    <span className="w-3 text-[10px] text-muted-foreground font-mono">{star}</span>
                    <Star size={9} className="fill-[#C8951E] text-[#C8951E] shrink-0" />
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-[#C8951E]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-[9px] text-muted-foreground font-mono">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filtres par étoile */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 shrink-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setReviewsFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors",
                reviewsFilter === "all" ? "bg-primary text-primary-foreground font-bold shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              Tous ({modalReviews.length})
            </button>
            {[5, 4, 3].map((star) => {
              const count = modalReviews.filter((r) => r.rating === star).length;
              if (count === 0 && modalReviews.length > 0) return null;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewsFilter(star)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1",
                    reviewsFilter === star ? "bg-[#C8951E] text-white font-bold shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <Star size={9} className="fill-current" /> {star}★ ({count})
                </button>
              );
            })}
          </div>

          {/* Liste des avis */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 pretty-scroll mt-1">
            {filteredModalReviews.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground">Aucun avis dans cette catégorie pour le moment.</p>
              </div>
            ) : (
              filteredModalReviews.map((rv) => (
                <div key={rv.id} className="rounded-2xl border border-border/60 bg-card p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {(rv.user?.name || "C")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold leading-tight">{rv.user?.name ?? "Cliente Kènè"}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(rv.createdAt)}</p>
                      </div>
                    </div>
                    <Stars rating={rv.rating} size={10} />
                  </div>

                  {rv.serviceName && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#3F7D3F]/12 text-[#2E5C2E] dark:text-[#8FD18F] px-2 py-0.5 text-[10px] font-semibold">
                      <BadgeCheck size={11} /> Soin vérifié : {rv.serviceName}
                    </span>
                  )}

                  {rv.comment ? (
                    <p className="text-xs text-foreground/90 leading-relaxed bg-muted/30 rounded-xl p-2.5 mt-1">
                      « {rv.comment} »
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">Expérience agréable et soignée.</p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Action : donner mon avis */}
          <div className="pt-2 border-t border-border shrink-0">
            <button
              type="button"
              onClick={() => {
                if (reviewsInstitute) {
                  setReviewModalInstitute(reviewsInstitute);
                  setReviewFor(null);
                  setRating(5);
                  setComment("");
                  setShowReviewsModal(false);
                }
              }}
              className="k-btn-gold w-full h-10 rounded-xl text-primary-foreground font-semibold text-xs flex items-center justify-center gap-1.5 shadow"
            >
              <Star size={13} className="fill-current" /> Donner mon avis sur cet institut
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog annulation */}
      <Dialog open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)}>
        <DialogContent className="max-w-[380px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading font-black flex items-center gap-2"><TriangleAlert size={18} className="text-destructive" /> Annuler ce RDV ?</DialogTitle>
          </DialogHeader>
          {cancelFor && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{cancelFor.service?.name} · {formatDate(cancelFor.startAt)} {formatTime(cancelFor.startAt)}</p>
              <div className="rounded-xl bg-muted/60 p-3 space-y-1.5">
                {[100, 48, 12, 1].map((h) => {
                  const { label } = cancellationRefund(h);
                  return (
                    <p key={h} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <span className="text-primary" aria-hidden>›</span> {label}
                    </p>
                  );
                })}
              </div>
              {(() => {
                const hours = Math.max(0, (new Date(cancelFor.startAt).getTime() - Date.now()) / 3.6e6);
                const { rate, label } = cancellationRefund(hours);
                const refund = Math.round((cancelFor.depositAmount ?? 0) * rate);
                return (
                  <div className={`rounded-xl p-3 text-xs font-semibold flex items-center justify-between ${refund > 0 ? "bg-[#3F7D3F]/10 text-[#3F7D3F]" : "bg-destructive/10 text-destructive"}`}>
                    <span>{label}</span>
                    <span className="font-mono">{refund > 0 ? `+${xof(refund)}` : "0 FCFA"}</span>
                  </div>
                );
              })()}
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><BadgeCheck size={12} className="text-primary" /> Remboursement selon les conditions de l&apos;institut.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setCancelFor(null)} className="h-11 rounded-xl border border-border text-sm font-semibold active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">Garder</button>
                <button onClick={doCancel} className="h-11 rounded-xl bg-destructive text-white text-sm font-bold active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-destructive">Annuler le RDV</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sécurité renforcée — code OTP exigé avant de confirmer l'acompte */}
      <SecureVerify
        open={pendingBook}
        phone={user.phone}
        amount={deposit > 0 ? deposit : undefined}
        onVerified={() => {
          setPendingBook(false);
          void book();
        }}
        onCancel={() => setPendingBook(false)}
      />

      {/* Overlay paiement acompte simulé — dialog accessible (pattern RitualJourney) */}
      <AnimatePresence>
        {payOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={payOverlay.phase === "processing" ? `Paiement de l'acompte en cours, ${xof(payOverlay.amount)}` : "Acompte confirmé"}
            aria-live="polite"
            className="fixed inset-0 z-[70] bg-[#1A1410]/97 grid place-items-center"
          >
            <div className="w-full max-w-[560px] mx-auto px-6">
              {payOverlay.phase === "processing" ? (
                <MomoProcessing operator="Mobile Money" color="#C8951E" amount={payOverlay.amount} phone={user.phone} />
              ) : (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="flex flex-col items-center gap-4 text-center py-6">
                  <SuccessBurst />
                  <p className="font-heading font-black text-xl text-[#F8F1E4]">Acompte confirmé</p>
                  <p className="font-mono text-sm font-bold text-[#F8F1E4]/90">{xof(payOverlay.amount)}</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
