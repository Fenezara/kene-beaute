"use client";
// Kènè Cliente — Fil d'accueil (façon feed Instagram/TikTok) :
// stories de zones (scan rapide + scores), carte score multi-zones avec lecture
// vocale TTS, CTA scan, Route de l'Or, prochain RDV, wallet, recommandations
// et suivi WhatsApp. Les mentions légales vivent en fin de fil (app-like).

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BellRing,
  Brush,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Hand,
  MapPin,
  MessageCircle,
  PersonStanding,
  Plus,
  ScanFace,
  Sparkles,
  Star,
  Waves,
} from "lucide-react";
import { apiGet } from "@/lib/kene/api";
import { formatDate, formatTime, scoreColor, readableTextColor, xof, CASHBACK_RATE } from "@/lib/kene/format";
import { nextClientStep } from "@/lib/kene/followups";
import type { GoldThreads } from "@/lib/kene/gold-threads";
import { channelLabel, humanWhen } from "@/lib/kene/reminders";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { KeneEmblem, NeaOnnimIcon, SankofaIcon } from "@/components/kene/icons";
import { KenteIdentity } from "@/components/kene/loom/KenteIdentity";
import { WovenDivider } from "@/components/kene/loom/WovenDivider";
import { InstallBanner } from "@/components/kene/pwa/InstallBanner";
import { RitualJourney } from "@/components/kene/route/RitualJourney";
import { GlassCard, Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { useT } from "@/lib/kene/use-t";
import { cn } from "@/lib/utils";
import { useKene } from "@/store/kene";
import { VoiceNarration } from "./VoiceNarration";
import type { ApiAppointment, ApiDiagnosis, ApiProduct, ApiReminderFeed, ApiWallet } from "./types";
import { parseDiagnosis } from "./types";
import { ScoreGauge, ScrollFadeRow, SectionTitle, Stars, WalletPill } from "./bits";

interface HomeData {
  diagnoses: ApiDiagnosis[];
  appointments: ApiAppointment[];
  wallet: ApiWallet | null;
  products: ApiProduct[];
  reminders: ApiReminderFeed | null;
  gold?: GoldThreads | null;
}

/** Icône par zone de scan (stories du feed) */
const ZONE_ICON: Record<BodyZone, React.ComponentType<{ className?: string }>> = {
  visage: ScanFace,
  dos: PersonStanding,
  cuir_chevelu: Waves,
  mains: Hand,
  barbe: Brush,
  naevi: CircleDot,
};

/** Libellé court des stories (2 lignes autorisées, façon Instagram) */
const STORY_LABEL: Record<BodyZone, string> = {
  visage: "Visage",
  dos: "Dos",
  cuir_chevelu: "Cuir chevelu",
  mains: "Mains",
  barbe: "Barbe",
  naevi: "Grains de beauté",
};

export function HomeScreen({
  onScanZone,
  refreshKey = 0,
  onRefreshed,
}: {
  onScanZone: (z: BodyZone) => void;
  /** Incrémenté par le pull-to-refresh du shell — déclenche un rechargement */
  refreshKey?: number;
  /** Appelé à la fin du chargement (le shell ferme l'indicateur de tirage) */
  onRefreshed?: () => void;
}) {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);
  const { t } = useT();
  const [data, setData] = useState<HomeData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ritualOpen, setRitualOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, a, w, p, r, g] = await Promise.all([
          apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}`),
          apiGet<{ appointments: ApiAppointment[] }>(`/api/appointments?userId=${user.id}`),
          apiGet<{ wallet: ApiWallet }>(`/api/wallet?userId=${user.id}`).catch(() => null),
          apiGet<{ products: ApiProduct[] }>("/api/shop/products"),
          apiGet<ApiReminderFeed>(`/api/notifications?userId=${user.id}`).catch(() => null),
          // Fils d'Or (t. 82) — non bloquant : la carte ne s'affiche pas si
          // l'API ne répond pas (le feed reste vivant avant tout).
          apiGet<GoldThreads>(`/api/gold-threads?userId=${user.id}`).catch(() => null),
        ]);
        if (alive) {
          setData({
            diagnoses: d.diagnoses ?? [],
            appointments: a.appointments ?? [],
            wallet: w?.wallet ?? null,
            products: p.products ?? [],
            reminders: r ?? null,
            gold: g,
          });
          if (alive) onRefreshed?.();
        }
      } catch (e) {
        if (alive) {
          setErr(e instanceof Error ? e.message : "Chargement impossible");
          onRefreshed?.();
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.id, refreshKey, onRefreshed]);

  // Score multi-zones pondéré (PRD §8.8) — dernier diagnostic par zone
  const multi = useMemo(() => {
    const byZone = new Map<BodyZone, ApiDiagnosis>();
    [...(data?.diagnoses ?? [])]
      .filter((d) => d.status === "done")
      .sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt))
      .forEach((d) => {
        if (!byZone.has(d.zone)) byZone.set(d.zone, d);
      });
    const covered = BODY_ZONES.filter((z) => byZone.has(z.id));
    const weightSum = covered.reduce((s, z) => s + z.weight, 0);
    const score =
      covered.length && weightSum > 0
        ? Math.round(covered.reduce((s, z) => s + (byZone.get(z.id)?.scoreGlobal ?? 0) * z.weight, 0) / weightSum)
        : null;
    const missing = BODY_ZONES.filter((z) => !byZone.has(z.id));
    const last = covered.length ? byZone.get(covered[0].id) : null;
    return { byZone, covered, score, missing, last };
  }, [data?.diagnoses]);

  const nextAppt = useMemo(() => {
    const now = Date.now();
    return (
      [...(data?.appointments ?? [])]
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
    [data],
  );

  const first = user.name.split(" ")[0];

  return (
    // Reveal = entrée en cascade spring (respecte prefers-reduced-motion) :
    // chaque bloc du fil est un RevealItem — le contenu/logique est inchangé.
    <Reveal className="flex flex-col gap-6 pt-1">
      {/* ───── Salutation ───── */}
      <RevealItem>
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {/* Filet kente — signature du bloc (décoratif) */}
            <span
              aria-hidden="true"
              className="mb-1.5 block h-[3px] w-10 rounded-full bg-gradient-to-r from-[#C8951E] via-[#A0522D] to-[#3F7D3F] opacity-80"
            />
            <p className="text-[11px] uppercase tracking-[0.16em] text-primary font-semibold">{t("home.greeting")}</p>
            <h2 className="font-heading font-black text-[29px] leading-tight tracking-tight truncate"><span className="kente-text-flow">{first}</span> ✨</h2>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
              <MapPin size={11} /> {user.city || "Abidjan"} · {user.fitzpatrick ? `Fitzpatrick ${user.fitzpatrick}` : "Phototype à définir"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data?.wallet && <WalletPill balance={data.wallet.balance} onClick={() => setClientTab("profil")} />}
            {/* Médaillon de marque (t. 77) — le 04b choisi par la fondatrice vit
                AUSSI dans l'app (splash + Seuil ne suffisaient pas : une cliente
                connectée ne les voit jamais). ≥ 56 px conformément au système
                de marque 3 étages ; décoratif — le prénom est dans le h2. */}
            <span aria-hidden="true" className="shrink-0 select-none">
              <KeneEmblem size={56} className="drop-shadow-[0_2px_8px_rgba(200,149,30,0.22)]" />
            </span>
          </div>
        </header>
      </RevealItem>

      {/* ───── Bannière d'installation PWA (auto-masquée : installée / fermée / standalone) ───── */}
      <RevealItem>
        <InstallBanner />
      </RevealItem>

      {/* ───── Stories : scan rapide + zones avec score ───── */}
      <RevealItem className="-mx-3 sm:-mx-5">
        <section aria-label="Scan rapide par zone" className="px-3 sm:px-5">
          <ScrollFadeRow label="Stories des zones — fais défiler horizontalement" className="flex gap-3.5 overflow-x-auto no-scrollbar py-1.5 pr-2">
            {/* Story Scanner — anneau signature k-cta (dégradé + halo) */}
            <button
              onClick={() => setClientTab("diagnostic")}
              aria-label={t("home.scan.story.aria")}
              className="shrink-0 w-[68px] flex flex-col items-center gap-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary rounded-xl"
            >
              <span className="grid place-items-center h-[66px] w-[66px] rounded-full p-[3px] k-cta active:scale-95 transition-transform">
                <span className="grid place-items-center h-full w-full rounded-full bg-background">
                  <NeaOnnimIcon size={26} className="text-primary" />
                </span>
              </span>
              <span className="text-[10px] font-bold text-primary">{t("tab.scan")}</span>
            </button>

          {/* Stories zones */}
          {BODY_ZONES.map((z) => {
            const d = multi.byZone.get(z.id);
            const covered = !!d;
            const Icon = ZONE_ICON[z.id];
            const color = covered ? scoreColor(d!.scoreGlobal) : "var(--border)";
            return (
              <button
                key={z.id}
                onClick={() => onScanZone(z.id)}
                aria-label={`${covered ? `Re-scanner ${z.label} — dernier score ${d!.scoreGlobal}` : `Scanner ${z.label} pour compléter ton score`} · pondération ${Math.round(z.weight * 100)} %`}
                className="shrink-0 w-[68px] flex flex-col items-center gap-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary rounded-xl"
              >
              <span
                className={cn(
                  "relative grid place-items-center h-[66px] w-[66px] p-[3px] active:scale-95 transition-transform",
                  covered ? "rounded-full k-glow-gold" : "rounded-[22px]",
                )}
                style={
                  covered
                    ? { background: `conic-gradient(from 210deg, ${color} 0%, ${color} 45%, #C8951E 68%, ${color} 100%)` }
                    : undefined
                }
              >
                <span
                  className={cn(
                    "grid place-items-center h-full w-full bg-background",
                    covered ? "rounded-full" : "rounded-[19px] border-[2.5px] border-dashed border-border",
                  )}
                >
                  <Icon className={covered ? "text-foreground/80" : "text-muted-foreground"} />
                </span>
                  {!covered && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid place-items-center h-6 w-6 rounded-full bg-primary text-primary-foreground border-2 border-background">
                      <Plus size={13} strokeWidth={2.5} />
                    </span>
                  )}
                  {covered && (
                    <span
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px font-mono text-[10px] font-bold tabular-nums shadow-sm"
                      style={{ backgroundColor: color, color: readableTextColor(color) }}
                    >
                      {d!.scoreGlobal}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] w-full text-center leading-tight line-clamp-2 break-words min-h-[26px] ${covered ? "font-semibold" : "text-muted-foreground font-medium"}`}>{STORY_LABEL[z.id]}</span>
              </button>
            );
          })}
          </ScrollFadeRow>
        </section>
      </RevealItem>

      {err && <p className="rounded-xl bg-destructive/10 text-destructive text-xs p-3">{err}</p>}

      {/* ───── Fil conducteur d'or (t. 82) — le fil qui relie les sections ───── */}
      <WovenDivider label="Ton score se tisse" />

      {/* ───── Carte score multi-zones (avec lecture vocale) — héro verre ───── */}
      <RevealItem>
        <section aria-labelledby="sc-t">
          <GlassCard hero className="overflow-hidden rounded-[26px]">
            <div className="kente-band h-[3px] w-full" aria-hidden="true" />
            <div id="sc-t" className="p-6">
              {!data ? (
                <div className="flex items-center gap-4">
                  <Shimmer className="h-[130px] w-[130px] rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Shimmer className="h-4 w-3/4" />
                    <Shimmer className="h-3 w-full" />
                    <Shimmer className="h-3 w-2/3" />
                  </div>
                </div>
              ) : multi.score !== null ? (
            <div className="flex flex-wrap items-center gap-4">
              <ScoreGauge score={multi.score} label={t("home.score.zone")} />
              <div className="min-w-0 flex-1">
                <h3 className="font-heading font-bold text-base">{t("home.score.title")}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {multi.covered.length} zone{multi.covered.length > 1 ? "s" : ""} analysée{multi.covered.length > 1 ? "s" : ""} · pondération PRD
                  {multi.last && <span className="block mt-1">Dernier scan : {formatDate(multi.last.createdAt)}</span>}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {multi.covered.map((z) => (
                    <span key={z.id} className="k-chip rounded-full px-2 py-0.5 text-[10px] font-medium">
                      {z.label} {multi.byZone.get(z.id)?.scoreGlobal}
                    </span>
                  ))}
                  {multi.missing.map((z) => (
                    <motion.button
                      key={z.id}
                      onClick={() => onScanZone(z.id)}
                      whileTap={{ scale: 0.94 }}
                      transition={{ type: "spring", stiffness: 500, damping: 24 }}
                      className="rounded-full border border-primary/40 bg-primary/10 px-3 min-h-10 inline-flex items-center text-[11px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      + {z.label}
                    </motion.button>
                  ))}
                </div>
                {/* Lecture vocale du dernier diagnostic (accès non-lectrices) */}
                {lastResult && (
                  <div className="mt-5 pt-4 border-t border-border/60">
                    <VoiceNarration result={lastResult} userName={user.name} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <NeaOnnimIcon size={40} className="mx-auto text-primary" />
              <p className="font-heading font-bold mt-2">{t("home.first.title")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("home.first.sub")}</p>
            </div>
          )}
          {data && multi.missing.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dashed border-border">
              <p className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Sparkles size={12} className="text-primary" /> {t("home.missing.title")}
              </p>
              <ScrollFadeRow label="Zones manquantes — fais défiler" className="flex gap-2 overflow-x-auto no-scrollbar pb-1 pr-1">
                {multi.missing.map((z) => (
                  <motion.button
                    key={z.id}
                    onClick={() => onScanZone(z.id)}
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: "spring", stiffness: 500, damping: 24 }}
                    className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 min-h-10 inline-flex items-center text-[11px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    + {z.label} · {Math.round(z.weight * 100)} %
                  </motion.button>
                ))}
              </ScrollFadeRow>
            </div>
          )}
          </div>
        </GlassCard>
      </section>
      </RevealItem>

      {/* ───── CTA Scanner ───── */}
      <RevealItem>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setClientTab("diagnostic")}
          className="relative h-24 rounded-3xl k-cta text-[#FFF9EC] overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={t("home.scan.aria")}
        >
          <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-30" />
          <div className="relative h-full flex items-center justify-center gap-3 px-4">
            <span className="grid place-items-center h-14 w-14 rounded-2xl bg-[#FFF9EC]/15 border border-[#FFF9EC]/30">
              <NeaOnnimIcon size={30} />
            </span>
            <span className="text-left">
              <span className="block font-black text-lg tracking-tight">{t("home.scan.cta")}</span>
              <span className="block text-[11px] opacity-90">{t("home.scan.sub")}</span>
            </span>
            <ChevronRight size={22} className="ml-auto opacity-80" aria-hidden="true" />
          </div>
        </motion.button>
      </RevealItem>

      {/* ───── Route de l'Or — rituel tissé depuis le dernier scan ───── */}
      {data && lastResult && multi.last && (
        <RevealItem>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setRitualOpen(true)}
            className="relative w-full k-card rounded-[24px] overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
        </RevealItem>
      )}

      {/* ───── Fils d'Or — la fidélité tissée (t. 82) ───── */}
      {data?.gold && data.gold.threads >= 0 && (
        <RevealItem>
          <button
            onClick={() => setClientTab("profil")}
            className="w-full text-left k-card k-card-hover rounded-[24px] p-4 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={`Mes Fils d'Or — ${data.gold.threads} fils, rang ${data.gold.rank}. Voir mon kente identitaire dans le profil`}
          >
            <div className="flex items-center gap-3.5">
              <span className="w-[92px] shrink-0 overflow-hidden rounded-[10px] ring-1 ring-border/80">
                <KenteIdentity seed={data.gold.seed} threads={data.gold.threads} compact height={44} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-heading font-bold text-sm text-foreground">{data.gold.threads} fil{data.gold.threads > 1 ? "s" : ""} d&apos;or</span>
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-gold-text">{data.gold.rank}</span>
                </span>
                <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-[#A0522D] to-[#E3B04B] transition-[width] duration-700"
                    style={{ width: `${Math.min(100, Math.round(data.gold.milestone.progress * 100))}%` }}
                  />
                </span>
                <span className="mt-1.5 block text-[11px] leading-snug text-muted-foreground">
                  {data.gold.threads === 0
                    ? "Ton premier scan tissera ton premier fil"
                    : data.gold.milestone.remaining > 0
                      ? `Encore ${data.gold.milestone.remaining} action${data.gold.milestone.remaining > 1 ? "s" : ""} pour le palier des ${data.gold.milestone.next} fils`
                      : `Palier des ${data.gold.milestone.next} fils atteint — ton pagne continue de grandir`}
                </span>
              </span>
              <ChevronRight size={16} className="text-primary shrink-0" aria-hidden="true" />
            </div>
          </button>
        </RevealItem>
      )}

      <WovenDivider label="Le fil continue" />

      {/* ───── Le Fil du Retour — ta prochaine étape ───── */}
      {nextStep && (
        <RevealItem>
          <section
            aria-labelledby="ns-t"
            className="k-card k-card-hero rounded-[24px] p-4"
          >
            <div className="flex items-center gap-2">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-gold/15 text-gold shrink-0">
                <SankofaIcon size={19} />
              </span>
              <p id="ns-t" className="font-heading font-bold text-sm">{t("home.next.title")}</p>
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
              className="mt-3 h-11 w-full rounded-2xl k-btn-gold text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {nextStep.ctaLabel}
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </section>
        </RevealItem>
      )}

      {/* ───── Prochain RDV ───── */}
      <RevealItem>
        <section aria-labelledby="rdv-t">
          <SectionTitle icon={<SankofaIcon size={17} />}>
            <span id="rdv-t">{t("home.rdv.title")}</span>
          </SectionTitle>
          {!data ? (
            <Shimmer className="h-24 rounded-[24px]" />
          ) : nextAppt ? (
            <button onClick={() => setClientTab("rdv")} className="w-full text-left k-card k-card-hover rounded-[24px] p-4 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
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
          <button onClick={() => setClientTab("rdv")} className="w-full rounded-[24px] border border-dashed border-border bg-card/60 p-4 flex items-center justify-between active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
            <span className="text-xs text-muted-foreground">{t("home.rdv.empty")}</span>
            <ChevronRight size={16} className="text-primary" />
          </button>
        )}
        </section>
      </RevealItem>

      {/* ───── Wallet ───── */}
      {data && (
        <RevealItem>
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
                className="h-11 w-11 grid place-items-center rounded-full bg-[#A0522D] text-[#FFF9EC] shadow active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-[#A0522D]"
                aria-label="Approvisionner mon wallet"
              >
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
          </section>
        </RevealItem>
      )}

      <WovenDivider label="Ta trame boutique" />

      {/* ───── Recommandé pour ta peau ───── */}
      <RevealItem>
        <section aria-labelledby="reco-t">
          <SectionTitle
            icon={<Sparkles size={16} />}
            action={
              <button onClick={() => setClientTab("boutique")} className="text-[11px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1">
                {t("home.shop.cta")}
              </button>
            }
          >
            <span id="reco-t">{t("home.reco.title")}</span>
          </SectionTitle>
          {!data ? (
            <Shimmer className="h-44 rounded-[24px]" />
          ) : (
            <ScrollFadeRow label="Produits recommandés — fais défiler" className="flex gap-3 overflow-x-auto no-scrollbar pb-2 snap-x pr-1">
              {reco.map((p) => (
                <button key={p.id} onClick={() => setClientTab("boutique")} className="snap-start shrink-0 w-36 text-left k-card k-card-hover rounded-[24px] overflow-hidden active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
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
            </ScrollFadeRow>
          )}
        </section>
      </RevealItem>

      {/* ───── Suivi WhatsApp ───── */}
      <RevealItem>
        <section aria-labelledby="wa-t">
          <SectionTitle icon={<MessageCircle size={16} />}>
            <span id="wa-t">{t("home.whatsapp.title")}</span>
          </SectionTitle>
          <div className="space-y-2">
            {data === null ? (
              <>
                <Shimmer className="h-[76px] rounded-[24px]" />
                <Shimmer className="h-[76px] rounded-[24px]" />
              </>
            ) : !data.reminders || (data.reminders.scheduled.length === 0 && data.reminders.sent.length === 0) ? (
              <div className="rounded-[24px] border border-dashed border-border bg-card/60 p-5 text-center">
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
                <div key={m.id} className="flex items-start gap-3 k-card rounded-[24px] p-3.5">
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
      </RevealItem>

      {/* ───── Fin de fil — mentions légales (app-like) ───── */}
      <RevealItem>
        <footer className="pt-4 pb-2 text-center">
          <div aria-hidden="true" className="kente-band-soft h-[3px] w-24 mx-auto rounded-full mb-3" />
          <p suppressHydrationWarning className="text-[10px] text-muted-foreground">
            © {new Date().getFullYear()} Kènè — « La beauté mélanoderme, enfin comprise. »
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            POC — Paiements Wave / Orange Money simulés · Estimations IA non médicales · CNPS CI / IPM SN / SYSCOHADA
          </p>
        </footer>
      </RevealItem>

      {ritualOpen && lastResult && multi.last && (
        <RitualJourney
          diag={{ id: multi.last.id, result: lastResult, createdAt: multi.last.createdAt }}
          products={data?.products ?? []}
          userName={user.name}
          onClose={() => setRitualOpen(false)}
        />
      )}
    </Reveal>
  );
}
