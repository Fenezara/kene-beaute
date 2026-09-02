"use client";
// Kènè Cliente — Accueil : score multi-zones, prochain RDV, wallet, recommandations, suivi
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, CheckCircle2, ChevronRight, BellRing, MapPin, MessageCircle, Plus, Sparkles, Star } from "lucide-react";
import { apiGet } from "@/lib/kene/api";
import { formatDate, formatTime, xof, CASHBACK_RATE } from "@/lib/kene/format";
import { nextClientStep } from "@/lib/kene/followups";
import { channelLabel, humanWhen } from "@/lib/kene/reminders";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { NeaOnnimIcon, SankofaIcon } from "@/components/kene/icons";
import { RitualJourney } from "@/components/kene/route/RitualJourney";
import { Skeleton } from "@/components/ui/skeleton";
import { useKene } from "@/store/kene";
import type { ApiAppointment, ApiDiagnosis, ApiProduct, ApiReminderFeed, ApiWallet } from "./types";
import { parseDiagnosis } from "./types";
import { ScoreGauge, SectionTitle, Stars, WalletPill } from "./bits";

interface HomeData {
  diagnoses: ApiDiagnosis[];
  appointments: ApiAppointment[];
  wallet: ApiWallet | null;
  products: ApiProduct[];
  reminders: ApiReminderFeed | null;
}

export function HomeScreen({ onScanZone }: { onScanZone: (z: BodyZone) => void }) {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);
  const [data, setData] = useState<HomeData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ritualOpen, setRitualOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, a, w, p, r] = await Promise.all([
          apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}`),
          apiGet<{ appointments: ApiAppointment[] }>(`/api/appointments?userId=${user.id}`),
          apiGet<{ wallet: ApiWallet }>(`/api/wallet?userId=${user.id}`).catch(() => null),
          apiGet<{ products: ApiProduct[] }>("/api/shop/products"),
          apiGet<ApiReminderFeed>(`/api/notifications?userId=${user.id}`).catch(() => null),
        ]);
        if (alive)
          setData({
            diagnoses: d.diagnoses ?? [],
            appointments: a.appointments ?? [],
            wallet: w?.wallet ?? null,
            products: p.products ?? [],
            reminders: r ?? null,
          });
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Chargement impossible");
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.id]);

  // Score multi-zones pondéré (PRD §8.8) — dernier diagnostic par zone
  const multi = useMemo(() => {
    const byZone = new Map<BodyZone, ApiDiagnosis>();
    [...data?.diagnoses ?? []]
      .filter((d) => d.status === "done")
      .sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt))
      .forEach((d) => {
        if (!byZone.has(d.zone)) byZone.set(d.zone, d);
      });
    const covered = BODY_ZONES.filter((z) => byZone.has(z.id));
    const weightSum = covered.reduce((s, z) => s + z.weight, 0);
    const score = covered.length && weightSum > 0 ? Math.round(covered.reduce((s, z) => s + (byZone.get(z.id)?.scoreGlobal ?? 0) * z.weight, 0) / weightSum) : null;
    const missing = BODY_ZONES.filter((z) => !byZone.has(z.id));
    const last = covered.length ? byZone.get(covered[0].id) : null;
    return { byZone, covered, score, missing, last };
  }, [data?.diagnoses]);

  const nextAppt = useMemo(() => {
    const now = Date.now();
    return (
      [...data?.appointments ?? []]
        .filter((a) => new Date(a.startAt).getTime() >= now && a.status !== "cancelled")
        .sort((x, y) => +new Date(x.startAt) - +new Date(y.startAt))[0] ?? null
    );
  }, [data?.appointments]);

  const reco = useMemo(() => {
    const all = data?.products ?? [];
    const byCat = (cats: string[]) => all.filter((p) => cats.includes(p.category));
    const pick =
      user.skinType === "grasse"
        ? byCat(["serum", "savon"])
        : user.skinType === "seche"
          ? byCat(["creme", "huile"])
          : byCat(["serum", "creme"]);
    return (pick.length >= 3 ? pick : [...pick, ...all.filter((p) => !pick.includes(p))]).slice(0, 3);
  }, [data?.products, user.skinType]);

  // Route de l'Or : dernier diagnostic parsable → rituel tissable depuis l'accueil
  const lastResult = useMemo(() => (multi.last ? parseDiagnosis(multi.last.resultJson) : null), [multi.last]);

  // Le Fil du Retour : prochaine étape dérivée de l'activité (contrôle protocole / soin de suite)
  const nextStep = useMemo(
    () => (data ? nextClientStep(new Date(), data.diagnoses, data.appointments) : null),
    [data]
  );

  const first = user.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-6 pt-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-primary font-semibold">Bonjour</p>
          <h1 className="font-heading font-black text-xl leading-tight truncate">{first}</h1>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <MapPin size={11} /> {user.city || "Abidjan"} · {user.fitzpatrick ? `Fitzpatrick ${user.fitzpatrick}` : "Phototype à définir"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.wallet && <WalletPill balance={data.wallet.balance} onClick={() => setClientTab("profil")} />}
          <button
            onClick={() => setClientTab("profil")}
            aria-label="Mon profil"
            className="h-11 w-11 grid place-items-center rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] font-heading font-bold shadow active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary"
          >
            {first.charAt(0)}
          </button>
        </div>
      </header>

      {err && <p className="rounded-xl bg-destructive/10 text-destructive text-xs p-3">{err}</p>}

      {/* Score multi-zones */}
      <section aria-labelledby="sc-t" className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="kente-band h-1.5 w-full" aria-hidden="true" />
        <div id="sc-t" className="p-5">
          {!data ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-[130px] w-[130px] rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ) : multi.score !== null ? (
            <div className="flex items-center gap-4">
              <ScoreGauge score={multi.score} label="Multi-zones" />
              <div className="min-w-0">
                <h2 className="font-heading font-bold text-base">Santé de ta peau</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {multi.covered.length} zone{multi.covered.length > 1 ? "s" : ""} analysée{multi.covered.length > 1 ? "s" : ""} · pondération PRD
                  {multi.last && <span className="block mt-1">Dernier scan : {formatDate(multi.last.createdAt)}</span>}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {multi.covered.map((z) => (
                    <span key={z.id} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                      {z.label} {byZoneScore(multi.byZone.get(z.id))}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <NeaOnnimIcon size={40} className="mx-auto text-primary" />
              <p className="font-heading font-bold mt-2">Ton premier diagnostic t&apos;attend</p>
              <p className="text-xs text-muted-foreground mt-1">Analyse IA de 6 zones — commence par le visage.</p>
            </div>
          )}
          {multi.missing.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dashed border-border">
              <p className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Sparkles size={12} className="text-primary" /> Zones à scanner pour compléter ton score
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {multi.missing.map((z) => (
                  <button
                    key={z.id}
                    onClick={() => onScanZone(z.id)}
                    className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    + {z.label} · {Math.round(z.weight * 100)} %
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA Scanner */}
      <motion.button
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setClientTab("diagnostic")}
        className="relative h-24 rounded-3xl bg-gradient-to-br from-[#C8951E] via-[#A0522D] to-[#8B1A3B] text-[#FFF9EC] shadow-lg overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label="Scanner ma peau maintenant"
      >
        <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-30" />
        <div className="relative h-full flex items-center justify-center gap-3 px-4">
          <span className="grid place-items-center h-14 w-14 rounded-2xl bg-[#FFF9EC]/15 backdrop-blur border border-[#FFF9EC]/30">
            <NeaOnnimIcon size={30} />
          </span>
          <span className="text-left">
            <span className="block font-heading font-black text-lg leading-tight">Scanner ma peau</span>
            <span className="block text-[11px] opacity-90">Analyse IA VISIA-like · 6 zones · 30 s</span>
          </span>
          <ChevronRight size={22} className="ml-auto opacity-80" />
        </div>
      </motion.button>

      {/* Route de l'Or — rituel tissé depuis le dernier scan */}
      {data && lastResult && multi.last && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setRitualOpen(true)}
          className="relative w-full rounded-3xl border-2 border-[#C8951E]/50 bg-card shadow-sm overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Reprendre la Route de l'Or — tisser ma routine depuis mon dernier diagnostic"
        >
          <div aria-hidden="true" className="h-2 w-full" style={{ backgroundImage: "repeating-linear-gradient(90deg,#8B1A3B 0 12px,#3F7D3F 12px 20px,#C8951E 20px 28px,#E07A2B 28px 36px,#A0522D 36px 46px)" }} />
          <div className="flex items-center gap-3 p-4">
            <span className="grid place-items-center h-12 w-12 rounded-2xl bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] shrink-0 shadow">
              <NeaOnnimIcon size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading font-bold text-sm">La Route de l&apos;Or</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Ta routine se tisse en 4 stations, selon ton scan du {formatDate(multi.last.createdAt, { day: "numeric", month: "short" })}
              </p>
            </div>
            <ChevronRight size={18} className="text-primary shrink-0" />
          </div>
        </motion.button>
      )}

      {/* Le Fil du Retour — ta prochaine étape (contrôle protocole / soin de suite) */}
      {nextStep && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          aria-labelledby="ns-t"
          className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 via-card to-card p-4 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-gold/15 text-gold shrink-0">
              <SankofaIcon size={19} />
            </span>
            <p id="ns-t" className="font-heading font-bold text-sm">Ta prochaine étape</p>
            <span
              className={
                "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums " +
                (nextStep.overdue ? "bg-bissap/15 text-destructive" : "bg-gold/15 text-gold-text")
              }
            >
              {nextStep.overdue ? `En retard de ${-nextStep.days} j` : nextStep.days === 0 ? "Aujourd'hui" : `Dans ${nextStep.days} j`}
            </span>
          </div>
          <p className="text-sm font-semibold mt-2">{nextStep.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{nextStep.detail}</p>
          <button
            onClick={() => setClientTab(nextStep.ctaTab)}
            className="mt-3 h-11 w-full rounded-xl bg-primary text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
          >
            {nextStep.ctaLabel}
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </motion.section>
      )}

      {/* Prochain RDV */}
      <section aria-labelledby="rdv-t">
        <SectionTitle icon={<SankofaIcon size={17} />}>
          <span id="rdv-t">Prochain rendez-vous</span>
        </SectionTitle>
        {!data ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : nextAppt ? (
          <button onClick={() => setClientTab("rdv")} className="w-full text-left rounded-2xl border border-border bg-card p-4 shadow-sm active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid place-items-center h-11 w-11 rounded-xl bg-primary/10 text-primary shrink-0">
                  <CalendarClock size={20} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{nextAppt.service?.name ?? "Soin"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {nextAppt.tenant?.name} · {nextAppt.resource?.name}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-sm font-bold text-primary">{formatTime(nextAppt.startAt)}</p>
                <p className="text-[11px] text-muted-foreground">{formatDate(nextAppt.startAt, { day: "numeric", month: "short" })}</p>
              </div>
            </div>
          </button>
        ) : (
          <button onClick={() => setClientTab("rdv")} className="w-full rounded-2xl border border-dashed border-border bg-card/60 p-4 flex items-center justify-between active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
            <span className="text-xs text-muted-foreground">Aucun RDV à venir — réserve un soin en 2 minutes.</span>
            <ChevronRight size={16} className="text-primary" />
          </button>
        )}
      </section>

      {/* Wallet */}
      {data && (
        <section aria-label="Mon wallet Kènè" className="rounded-2xl bg-[#1A1410] text-[#F8F1E4] p-4 shadow-md relative overflow-hidden">
          <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-20" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-70">Wallet Kènè</p>
              <p className="font-mono font-black text-2xl mt-1">{xof(data.wallet?.balance ?? 0)}</p>
              <p className="text-[11px] opacity-70 mt-1">Cashback {Math.round((data.wallet?.cashbackRate ?? CASHBACK_RATE) * 100)} % sur chaque commande</p>
            </div>
            <button
              onClick={() => setClientTab("profil")}
              className="h-11 w-11 grid place-items-center rounded-full bg-[#C8951E] text-[#FFF9EC] shadow active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-[#C8951E]"
              aria-label="Approvisionner mon wallet"
            >
              <Plus size={20} />
            </button>
          </div>
        </section>
      )}

      {/* Recommandé pour ta peau */}
      <section aria-labelledby="reco-t">
        <SectionTitle
          icon={<Sparkles size={16} />}
          action={
            <button onClick={() => setClientTab("boutique")} className="text-[11px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary rounded">
              Voir la boutique
            </button>
          }
        >
          <span id="reco-t">Recommandé pour ta peau</span>
        </SectionTitle>
        {!data ? (
          <Skeleton className="h-44 rounded-2xl" />
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin snap-x">
            {reco.map((p) => (
              <button key={p.id} onClick={() => setClientTab("boutique")} className="snap-start shrink-0 w-36 text-left rounded-2xl border border-border bg-card overflow-hidden shadow-sm active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
                <img src={p.image} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" />
                <div className="p-2.5">
                  <p className="text-xs font-semibold leading-tight line-clamp-2 min-h-8">{p.name}</p>
                  <p className="text-[10px] text-terre mt-0.5 truncate">{p.botanicals}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="font-mono text-xs font-bold">{xof(p.price)}</span>
                    <Stars rating={p.rating} size={9} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Suivi WhatsApp — rappels automatiques réels (protocole S+3, RDV J-1, historique) */}
      <section aria-labelledby="wa-t" className="mb-2">
        <SectionTitle icon={<MessageCircle size={16} />}>
          <span id="wa-t">Suivi WhatsApp</span>
        </SectionTitle>
        <div className="space-y-2">
          {data === null ? (
            <>
              <Skeleton className="h-[76px] rounded-2xl" />
              <Skeleton className="h-[76px] rounded-2xl" />
            </>
          ) : !data.reminders || (data.reminders.scheduled.length === 0 && data.reminders.sent.length === 0) ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-center">
              <BellRing size={22} className="mx-auto text-primary" aria-hidden />
              <p className="mt-2 text-xs font-semibold">Tes rappels s&apos;activent tout seuls</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Contrôle de protocole 3 semaines après un scan, rappel J-1 avant chaque RDV confirmé.
              </p>
            </div>
          ) : (
            <>
              {data.reminders.scheduled.slice(0, 2).map((m) => (
                <div key={m.id} className="flex items-start gap-3 rounded-2xl border border-[#3F7D3F]/25 bg-[#3F7D3F]/5 p-3.5">
                  <span className="grid place-items-center h-9 w-9 rounded-full bg-[#3F7D3F]/15 text-[#3F7D3F] shrink-0">
                    <BellRing size={16} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed">{m.message}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="rounded-full bg-[#3F7D3F]/15 text-[#3F7D3F] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">Programmé</span>
                      <span className="text-[10px] text-muted-foreground">
                        {m.scheduledAt ? humanWhen(m.scheduledAt) : "à venir"} · {channelLabel(m.channel)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {data.reminders.sent.slice(0, 3).map((m) => (
                <div key={m.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5">
                  <span className="grid place-items-center h-9 w-9 rounded-full bg-muted text-muted-foreground shrink-0">
                    <CheckCircle2 size={16} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed">{m.message}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">Envoyé</span>
                      <span className="text-[10px] text-muted-foreground">
                        {humanWhen(m.createdAt)} · {channelLabel(m.channel)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <p className="mt-3 text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
          <Star size={10} className="text-primary" aria-hidden /> Rappels automatiques — contrôle protocole S+3 &amp; RDV J-1 (POC, envois simulés)
        </p>
      </section>

      {ritualOpen && lastResult && multi.last && (
        <RitualJourney
          diag={{ id: multi.last.id, result: lastResult, createdAt: multi.last.createdAt }}
          products={data?.products ?? []}
          userName={user.name}
          onClose={() => setRitualOpen(false)}
        />
      )}
    </div>
  );
}

function byZoneScore(d?: ApiDiagnosis): string {
  return d ? `${d.scoreGlobal}` : "";
}
