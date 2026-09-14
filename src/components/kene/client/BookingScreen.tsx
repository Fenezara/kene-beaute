"use client";
// Kènè Cliente — RDV : réservation instituts (services, créneaux, acompte MoMo/wallet) + mes RDV (avis, annulation)
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, BadgeCheck, CalendarDays, CalendarPlus, Check, ChevronRight, Clock, Loader2, Lock, MapPin,
  MessageSquareQuote, Star, TriangleAlert, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { addDays, formatDate, formatTime, xof, DEPOSIT_RATE } from "@/lib/kene/format";
import { cancellationRefund } from "@/lib/kene/rfm";
import { SankofaIcon } from "@/components/kene/icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Chip, IconBadge, PrimaryCTA, Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKene } from "@/store/kene";
import { useSecurity } from "@/store/security";
import type { ApiAppointment, ApiInstitute, ApiPayment, ApiResource, ApiReview, ApiService, ApiSlot, ApiWallet } from "./types";
import { ApptBadge, EmptyBlock, MomoProcessing, SectionTitle, Stars, SuccessBurst } from "./bits";
import { SecureVerify } from "./SecureVerify";
import { HAPTIC, haptic } from "@/lib/kene/ux";

type PayMethod = "wave" | "wallet";

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
  const [detailLoading, setDetailLoading] = useState(false);
  const [service, setService] = useState<ApiService | null>(null);
  const [day, setDay] = useState<Date>(new Date());
  const [slots, setSlots] = useState<ApiSlot[] | null>(null);
  const [slot, setSlot] = useState<ApiSlot | null>(null);
  const [wallet, setWallet] = useState<ApiWallet | null>(null);
  // Fin des échecs silencieux : solde inconnu → encart discret + Réessayer
  // (le bouton Wallet reste désactivé tant que le solde est inconnu).
  const [walletError, setWalletError] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("wave");
  const [paying, setPaying] = useState(false);
  const [payOverlay, setPayOverlay] = useState<{ phase: "processing" | "done"; amount: number } | null>(null);
  const [confirmed, setConfirmed] = useState<ApiAppointment | null>(null);

  // Sécurité renforcée (2FA-lite) : si activée ET acompte payant, la cliente
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

  const loadInstitutes = useCallback(async () => {
    setInstitutes(null);
    try {
      const r = await apiGet<{ institutes: ApiInstitute[] }>("/api/institutes");
      setInstitutes(r.institutes ?? []);
    } catch {
      setInstitutes([]);
    }
  }, []);

  const loadMine = useCallback(async () => {
    setMine(null);
    try {
      const r = await apiGet<{ appointments: ApiAppointment[] }>(`/api/appointments?userId=${user.id}`);
      setMine(r.appointments ?? []);
    } catch {
      setMine([]);
    }
  }, [user.id]);

  /* Solde wallet — échec explicite (walletError) plutôt que « … » éternel. */
  const loadWallet = useCallback(() => {
    apiGet<{ wallet: ApiWallet }>(`/api/wallet?userId=${user.id}`)
      .then((r) => { setWallet(r.wallet); setWalletError(false); })
      .catch(() => setWalletError(true));
  }, [user.id]);

  useEffect(() => {
    loadInstitutes();
    loadWallet();
  }, [loadInstitutes, loadWallet]);

  useEffect(() => {
    if (tab === "mine") loadMine();
  }, [tab, loadMine]);

  async function openInstitute(i: ApiInstitute) {
    setInst(i);
    setService(null);
    setSlot(null);
    setSlots(null);
    setDetailLoading(true);
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

  /** Passerelle confirmation : vérification d'identité par code si la
   *  sécurité renforcée est active et qu'un acompte est réglé — la
   *  réservation (book) ne part qu'une fois le code confirmé. */
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
      const r = await apiPost<{ appointment: ApiAppointment; payment?: ApiPayment }>("/api/appointments", {
        tenantId: inst.id,
        serviceId: service.id,
        resourceId: slot.resourceIds?.[0] ?? resources[0]?.id,
        startAt: startAt.toISOString(),
        clientName: user.name,
        clientPhone: user.phone,
        userId: user.id,
        depositAmount: deposit,
        paymentMethod: payMethod,
      });
      if (payMethod === "wave" && r.payment) {
        // Contrat confirmToken (63-b/63-c) : un acompte mobile money en attente
        // porte son jeton — absent, on n'appelle JAMAIS confirm et on rollback
        // l'état UI comme un échec de réservation (aucun overlay, récap intact).
        const confirmToken = r.payment.confirmToken;
        if (!confirmToken) {
          setPayOverlay(null);
          toast.error("Paiement impossible — réessaie dans quelques instants");
          return;
        }
        setPayOverlay({ phase: "processing", amount: deposit });
        await new Promise((res) => setTimeout(res, 3000));
        await apiPost("/api/payments/confirm", { paymentId: r.payment.id, confirmToken });
      } else {
        setPayOverlay({ phase: "processing", amount: deposit });
        await new Promise((res) => setTimeout(res, 1200));
      }
      setPayOverlay({ phase: "done", amount: deposit });
      haptic(HAPTIC.success);
      setTimeout(() => setPayOverlay(null), 1400);
      setConfirmed(r.appointment);
      const w = await apiGet<{ wallet: ApiWallet }>(`/api/wallet?userId=${user.id}`).catch(() => null);
      if (w) setWallet(w.wallet);
    } catch (e) {
      setPayOverlay(null);
      toast.error(e instanceof Error ? e.message : "Réservation impossible");
    } finally {
      setPaying(false);
    }
  }

  async function submitReview() {
    if (!reviewFor) return;
    try {
      await apiPost(`/api/appointments/${reviewFor.id}/review`, { userId: user.id, rating, comment: comment.trim() || undefined });
      toast.success("Merci pour ton avis");
      setReviewFor(null);
      setComment("");
      setRating(5);
      loadMine();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible");
    }
  }

  async function doCancel() {
    if (!cancelFor) return;
    try {
      const r = await apiPost<{ appointment: ApiAppointment; refund: { amount: number; label: string } }>(`/api/appointments/${cancelFor.id}/cancel`, { userId: user.id });
      toast.success(r.refund.amount > 0 ? `RDV annulé — ${xof(r.refund.amount)} remboursés sur ton wallet` : "RDV annulé");
      setCancelFor(null);
      loadMine();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Annulation impossible");
    }
  }

  const now = Date.now();
  const upcoming = (mine ?? []).filter((a) => new Date(a.startAt).getTime() >= now && a.status !== "cancelled").sort((x, y) => +new Date(x.startAt) - +new Date(y.startAt));
  const past = (mine ?? []).filter((a) => new Date(a.startAt).getTime() < now || a.status === "cancelled" || a.status === "completed").sort((x, y) => +new Date(y.startAt) - +new Date(x.startAt));

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
                  <div className="mt-6 grid grid-cols-2 gap-3 w-full">
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
                  <SectionTitle icon={<MapPin size={16} />}>Instituts partenaires</SectionTitle>
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
                              <span className="k-chip mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-foreground">
                                <MapPin size={10} aria-hidden="true" /> {i.city}, {i.country}
                              </span>
                            </div>
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#1A1410]/60 px-2 py-0.5 text-[10px] font-bold">
                              <Star size={10} className="fill-[#C8951E] text-[#C8951E]" aria-hidden="true" /> {i.rating.toFixed(1)} ({i.reviewCount})
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-2.5 text-[11px] text-muted-foreground">
                          <span>{i._count?.services ?? 0} soins · {i._count?.reviews ?? 0} avis</span>
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
                      <span className="k-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                        <Star size={11} className="fill-[#C8951E] text-[#C8951E]" aria-hidden="true" /> {inst.rating.toFixed(1)}
                      </span>
                      <span className="k-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                        <MapPin size={11} aria-hidden="true" /> {inst.city}
                      </span>
                      <span className="k-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                        <Clock size={11} aria-hidden="true" /> {inst.openingHour}h–{inst.closingHour}h
                      </span>
                    </div>
                  </div>
                </RevealItem>
                <RevealItem>
                  {inst.description && <p className="text-xs text-muted-foreground leading-relaxed mt-3">{inst.description}</p>}
                </RevealItem>

              {detailLoading ? (
                <div className="space-y-2 mt-4">{[0, 1, 2].map((i) => <Shimmer key={i} className="h-16 rounded-[18px]" />)}</div>
              ) : (
                <>
                  {/* Avis */}
                  {reviews.length > 0 && (
                    <RevealItem>
                      <div className="mt-4">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ce que disent les clientes</p>
                        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                          {reviews.slice(0, 5).map((rv) => (
                            <div key={rv.id} className="k-card shrink-0 w-56 rounded-[18px] p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold">{rv.user?.name ?? "Cliente"}</p>
                                <Stars rating={rv.rating} size={9} />
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug line-clamp-3">{rv.comment ?? "Expérience agréable."}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </RevealItem>
                  )}

                  {/* Services — cartes radio : k-card + état sélectionné or (ring + teinte) */}
                  <RevealItem>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-5 mb-2">Soins & tarifs</p>
                  </RevealItem>
                  {services.map((s) => {
                    const sel = service?.id === s.id;
                    return (
                      <RevealItem key={s.id}>
                        <div className="k-card rounded-[24px] p-2">
                          <div className={`flex items-start gap-3 rounded-[18px] p-3 transition-all duration-300 ${sel ? "bg-primary/8 ring-2 ring-primary/60" : ""}`}>
                            <IconBadge icon={sel ? <Check size={17} /> : <Clock size={17} />} tone={sel ? "gold" : "terre"} className="mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="min-w-0 text-sm font-semibold">{s.name}</p>
                                <p className="shrink-0 font-mono text-sm font-bold tabular-nums">{xof(s.price)}</p>
                              </div>
                              <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="flex shrink-0 items-center gap-1">{s.durationMin} min</span>
                                {s.botanicals && <span className="truncate text-terre">{s.botanicals}</span>}
                              </p>
                              <button onClick={() => chooseService(s)} className={`mt-2.5 h-11 w-full rounded-full text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${sel ? "k-btn-gold text-primary-foreground" : "k-chip text-primary"}`}>
                                {sel ? "Choisi" : "Choisir"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </RevealItem>
                    );
                  })}

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
                        <p className="flex justify-between"><span className="text-muted-foreground">Soin</span><span className="font-semibold">{service.name}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Quand</span><span className="font-semibold font-mono tabular-nums">{formatDate(day, { weekday: "short", day: "numeric", month: "short" })} {slot.time}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Praticienne</span><span className="font-semibold">{practitioner?.name ?? "Assignée à l'arrivée"}</span></p>
                        <p className="flex justify-between"><span className="text-muted-foreground">Prix du soin</span><span className="font-mono font-semibold tabular-nums">{xof(service.price)}</span></p>
                        <p className="flex justify-between border-t border-dashed border-border pt-1.5"><span className="font-semibold">Acompte 30 % (aujourd&apos;hui)</span><span className="font-mono font-black tabular-nums text-primary">{xof(deposit)}</span></p>
                        <p className="text-[10px] text-muted-foreground">Solde de {xof(service.price - deposit)} à régler sur place. Annulation gratuite &gt; 72 h.</p>
                      </div>

                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-4 mb-2">Payer l&apos;acompte avec</p>
                      {securityEnabled && deposit > 0 && (
                        <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1">
                          <Lock size={10} aria-hidden="true" /> Vérification par code activée
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setPayMethod("wave")} aria-pressed={payMethod === "wave"} className={`h-11 rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${payMethod === "wave" ? "border-[#1DC8FF] bg-[#1DC8FF]/10" : "border-border bg-card"}`}>
                          <span className="h-5 w-5 rounded-full grid place-items-center text-[#1A1410] text-[10px] font-black" style={{ backgroundColor: "#1DC8FF" }}>W</span> Wave
                        </button>
                        <button
                          onClick={() => setPayMethod("wallet")}
                          aria-pressed={payMethod === "wallet"}
                          disabled={(wallet?.balance ?? 0) < deposit}
                          className={`h-11 rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${payMethod === "wallet" ? "border-melanine bg-melanine/10" : "border-border bg-card"}`}
                        >
                          <span className="h-5 w-5 rounded-full grid place-items-center bg-melanine text-[#C8951E] text-[10px] font-black">K</span> Wallet {wallet ? `(${xof(wallet.balance, { compact: true })})` : walletError ? "(indisponible)" : ""}
                        </button>
                      </div>
                      {wallet && wallet.balance < deposit && <p className="text-[10px] text-destructive mt-1.5">Solde wallet insuffisant pour l&apos;acompte.</p>}
                      {walletError && (
                        <div role="alert" className="mt-1.5 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 flex items-center gap-2.5">
                          <TriangleAlert size={14} className="text-terre shrink-0" aria-hidden="true" />
                          <p className="flex-1 min-w-0 text-[11px] text-muted-foreground leading-snug">Solde indisponible — réessaie</p>
                          <button onClick={loadWallet} className="k-btn-gold h-11 shrink-0 rounded-xl px-3.5 text-xs font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary">
                            Réessayer
                          </button>
                        </div>
                      )}

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
                      <div className="mt-3 flex gap-2">
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
                        <button onClick={() => { setReviewFor(a); setRating(5); setComment(""); }} className="h-9 px-3 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary">
                          <Star size={12} aria-hidden="true" /> Avis
                        </button>
                      )}
                    </div>
                  </RevealItem>
                ))}
              </Reveal>
            )}
          </section>
        </div>
      )}

      {/* Dialog avis */}
      <Dialog open={!!reviewFor} onOpenChange={(o) => !o && setReviewFor(null)}>
        <DialogContent className="max-w-[380px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading font-black">Ton avis compte</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">{reviewFor?.service?.name} · {reviewFor?.tenant?.name}</p>
          <div className="flex justify-center gap-2 py-2" role="radiogroup" aria-label="Note sur 5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} onClick={() => setRating(i)} role="radio" aria-checked={rating === i} aria-label={`${i} étoile${i > 1 ? "s" : ""}`} className="active:scale-90 transition-transform focus-visible:outline-2 focus-visible:outline-primary rounded">
                <Star size={32} className={i <= rating ? "fill-[#C8951E] text-[#C8951E]" : "text-muted-foreground/40"} />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Partage ton expérience (accueil, résultat du soin…)"
            aria-label="Commentaire"
            className="k-input w-full rounded-xl px-3 py-2.5 text-sm"
          />
          <button onClick={submitReview} className="k-btn-gold h-12 rounded-xl text-primary-foreground font-semibold text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Publier mon avis
          </button>
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
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><BadgeCheck size={12} className="text-primary" /> Le remboursement est crédité sur ton wallet Kènè.</p>
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
                payMethod === "wave" ? (
                  <MomoProcessing operator="Wave" color="#1DC8FF" amount={payOverlay.amount} phone={user.phone} />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <span className="grid place-items-center h-20 w-20 rounded-3xl bg-melanine text-[#C8951E] font-heading font-black text-2xl">K</span>
                    <p className="font-heading font-bold text-lg text-[#F8F1E4]">Wallet Kènè</p>
                    <p className="font-mono text-3xl font-black text-[#F8F1E4]">{xof(payOverlay.amount)}</p>
                    <div className="flex items-center gap-2 text-sm text-[#F8F1E4]/80"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Débit du wallet…</div>
                  </div>
                )
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
