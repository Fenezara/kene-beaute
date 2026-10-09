"use client";
// Kènè Cliente — Fil d'accueil MVP épuré et centré sur l'action :
// 1. Header (Nom, Ville/Phototype, Badge)
// 2. Hero Diagnostic & Rituel (MvpFunnelHero : Score, 3 étapes de soin, Commande express, Concierge WhatsApp)
// 3. Prochain RDV en institut
// 4. Soins recommandés pour ta peau (Carrousel produits)
// 5. Mentions légales & Sécurité paiements

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CloudSun,
  Crown,
  MapPin,
  Star,
  SunMedium,
  Wind,
} from "lucide-react";
import { apiGet } from "@/lib/kene/api";
import { formatDate, formatTime, xof } from "@/lib/kene/format";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { KeneEmblem, SankofaIcon, CauriIcon } from "@/components/kene/icons";
import { RitualJourney } from "@/components/kene/route/RitualJourney";
import { Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { useT } from "@/lib/kene/use-t";
import { useKene } from "@/store/kene";
import { MvpFunnelHero } from "./MvpFunnelHero";
import { SkinHealthDashboard } from "./SkinHealthDashboard";
import { ContactKeneModal } from "./ContactKeneModal";
import type { ApiAppointment, ApiDiagnosis, ApiInstitute, ApiProduct } from "./types";
import { parseDiagnosis } from "./types";
import { ScrollFadeRow, SectionTitle, Stars } from "./bits";

interface HomeData {
  diagnoses: ApiDiagnosis[];
  appointments: ApiAppointment[];
  products: ApiProduct[];
  institutes: ApiInstitute[];
  subscription: {
    plan: string;
    expiresAt?: string | null;
  } | null;
}

export function HomeScreen({
  onScanZone,
  refreshKey = 0,
  onRefreshed,
}: {
  onScanZone: (z: BodyZone) => void;
  refreshKey?: number;
  onRefreshed?: () => void;
}) {
  const user = useKene((s) => s.user)!;
  const setClientTab = useKene((s) => s.setClientTab);
  const { t } = useT();
  const [data, setData] = useState<HomeData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ritualOpen, setRitualOpen] = useState(false);
  const [contactKeneOpen, setContactKeneOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, a, p, s, insts] = await Promise.all([
          apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}`),
          apiGet<{ appointments: ApiAppointment[] }>(`/api/appointments?userId=${user.id}`),
          apiGet<{ products: ApiProduct[] }>("/api/shop/products"),
          apiGet<{ plan: string; subscription: { plan: string; expiresAt: string } | null }>(`/api/subscriptions?userId=${user.id}`).catch(() => null),
          apiGet<{ institutes: ApiInstitute[] }>("/api/institutes").catch(() => ({ institutes: [] })),
        ]);
        if (alive) {
          setData({
            diagnoses: d.diagnoses ?? [],
            appointments: a.appointments ?? [],
            products: p.products ?? [],
            institutes: insts?.institutes ?? [],
            subscription: s?.subscription ?? null,
          });
          onRefreshed?.();
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

  // Score multi-zones pondéré (dernier diagnostic par zone)
  const multi = useMemo(() => {
    const byZone = new Map<BodyZone, ApiDiagnosis>();
    [...(data?.diagnoses ?? [])]
      .filter((d) => d.status === "done")
      .sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt))
      .forEach((d) => {
        if (!byZone.has(d.zone)) byZone.set(d.zone, d);
      });
    const covered = BODY_ZONES.filter((z) => byZone.has(z.id));
    const missing = BODY_ZONES.filter((z) => !byZone.has(z.id));
    const weightSum = covered.reduce((s, z) => s + z.weight, 0);
    const score =
      covered.length && weightSum > 0
        ? Math.round(covered.reduce((s, z) => s + (byZone.get(z.id)?.scoreGlobal ?? 0) * z.weight, 0) / weightSum)
        : null;
    const last = covered.length ? byZone.get(covered[0].id) : null;
    return { byZone, covered, missing, score, last };
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

  const lastResult = useMemo(() => (multi.last ? parseDiagnosis(multi.last.resultJson) : null), [multi.last]);

  const first = user.name.split(" ")[0];

  /** Échéance Kènè+ : alerte élégante à J-3 / J-0 ou rattrapage si expiré récent */
  const subNotice = useMemo(() => {
    const sub = data?.subscription;
    if (!sub || !sub.expiresAt) return null;
    const now = Date.now();
    const exp = new Date(sub.expiresAt).getTime();
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= 3) {
      return {
        type: "warning" as const,
        title: "Échéance Kènè+ proche",
        badge: diffDays === 0 ? "Aujourd'hui" : `Dans ${diffDays}j`,
        description:
          diffDays === 0
            ? "Ton pass Kènè+ expire ce soir. Renouvelle pour 30 jours sans aucune interruption de tes analyses."
            : `Il te reste ${diffDays} jour${diffDays > 1 ? "s" : ""} de pass Kènè+. Les 30 jours supplémentaires se raccordent directement.`,
        btnText: "Prolonger (+30 j)",
      };
    }

    if (diffDays < 0 && diffDays >= -14) {
      return {
        type: "expired" as const,
        title: "Pass Kènè+ arrivé à terme",
        badge: "Expiré",
        description: "Tes diagnostics illimités et ton suivi Dr Kènè sont en pause. Réactive Kènè+ pour continuer.",
        btnText: "Réactiver (2 500 F)",
      };
    }

    return null;
  }, [data?.subscription]);

  /** Conseil Climat & Dermo-Météo contextualisé pour peau mélanoderme */
  const weatherAdvisory = useMemo(() => {
    const city = (user.city || user.district || "Abidjan").toLowerCase();
    if (city.includes("dakar") || city.includes("senegal") || city.includes("ngor") || city.includes("almadie")) {
      return {
        cityLabel: "Dakar · Climat océanique & alizés",
        temp: "27°C",
        humidity: "62%",
        uv: "UV 7 · Élevé",
        advice: "Particules & brise marine : applique un sérum antioxydant (Moringa/Vitamine C) et scelle l'hydratation le soir.",
        icon: <Wind size={15} className="text-[#3F7D3F]" />,
      };
    }
    if (city.includes("bouake") || city.includes("yamoussoukro") || city.includes("korhogo")) {
      return {
        cityLabel: "Intérieur · Climat chaud & ensoleillé",
        temp: "32°C",
        humidity: "48%",
        uv: "UV 9 · Très fort",
        advice: "Ensoleillement marqué : brumise dans la journée et répare ta barrière cutanée au beurre de karité au coucher.",
        icon: <SunMedium size={15} className="text-gold-text" />,
      };
    }
    return {
      cityLabel: `${user.city ? user.city : "Abidjan"} · Humidité tropicale`,
      temp: "29°C",
      humidity: "84%",
      uv: "UV 8 · Très fort",
      advice: "Forte humidité stimulant le sébum : préférez un nettoyage doux au zinc, texture fluide légère et écran solaire SPF 50.",
      icon: <CloudSun size={15} className="text-primary" />,
    };
  }, [user.city, user.district]);

  return (
    <Reveal className="flex flex-col gap-6 pt-1">
      {/* ───── Salutation épurée ───── */}
      <RevealItem>
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span
              aria-hidden="true"
              className="mb-1.5 block h-[3px] w-10 rounded-full bg-gradient-to-r from-[#C8951E] via-[#A0522D] to-[#3F7D3F] opacity-80"
            />
            <p className="text-[11px] uppercase tracking-[0.16em] text-primary font-semibold">{t("home.greeting")}</p>
            <h2 className="font-heading font-black text-[27px] sm:text-[29px] leading-tight tracking-tight truncate">
              <span className="kente-text-flow inline-block pr-1">{first}</span>
            </h2>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
              <MapPin size={11} /> {user.city || "Abidjan"} · {user.fitzpatrick ? `Fitzpatrick ${user.fitzpatrick}` : "Phototype à définir"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {user.hasAvatar ? (
              <button
                onClick={() => setClientTab("profil")}
                aria-label={`Mon profil — ${user.name}`}
                className="shrink-0 size-14 rounded-full overflow-hidden ring-2 ring-gold/50 hover:ring-gold focus-visible:outline-2 focus-visible:outline-primary transition-all"
              >
                <img src={`/api/media/user/${user.id}`} alt="" className="size-full object-cover" />
              </button>
            ) : (
              <span aria-hidden="true" className="shrink-0 select-none">
                <KeneEmblem size={56} className="drop-shadow-[0_2px_8px_rgba(200,149,30,0.22)]" />
              </span>
            )}
          </div>
        </header>
      </RevealItem>

      {/* ───── Rappel d'échéance Kènè+ (J-3 ou Expiré récent) ───── */}
      {subNotice && (
        <RevealItem>
          <div
            className={`k-card rounded-[22px] p-4 flex items-center justify-between gap-3.5 border ${
              subNotice.type === "warning"
                ? "bg-gradient-to-r from-gold/15 via-gold/10 to-transparent border-gold/40 shadow-sm"
                : "bg-gradient-to-r from-terre/15 via-terre/10 to-transparent border-terre/40 shadow-sm"
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="grid place-items-center h-10 w-10 rounded-2xl bg-gold/20 text-gold-text shrink-0 mt-0.5 shadow-sm">
                <Crown size={19} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-heading font-black text-sm text-foreground">{subNotice.title}</p>
                  <span className="rounded-full bg-gold/20 text-gold-text px-2 py-0.5 text-[10px] font-bold">
                    {subNotice.badge}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                  {subNotice.description}
                </p>
              </div>
            </div>
            <button
              onClick={() => setClientTab("abonnement")}
              className="k-btn-gold shrink-0 h-10 px-3.5 rounded-xl text-primary-foreground text-xs font-bold whitespace-nowrap shadow-sm active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
            >
              {subNotice.btnText}
            </button>
          </div>
        </RevealItem>
      )}

      {/* ───── Conseil Dermo-Météo du Jour ───── */}
      <RevealItem>
        <div className="rounded-[22px] border border-border/80 bg-gradient-to-r from-card/90 via-card/60 to-card/90 backdrop-blur-xs p-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid place-items-center size-8 rounded-xl bg-primary/10 text-primary shrink-0">
                {weatherAdvisory.icon}
              </span>
              <div className="min-w-0">
                <p className="font-heading font-bold text-xs text-foreground truncate">
                  {weatherAdvisory.cityLabel}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                  <span className="font-semibold text-foreground">{weatherAdvisory.temp}</span>
                  <span>·</span>
                  <span>Humidité {weatherAdvisory.humidity}</span>
                  <span>·</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{weatherAdvisory.uv}</span>
                </div>
              </div>
            </div>
            <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              Météo &amp; Peau
            </span>
          </div>
          <p className="mt-2.5 text-[11px] text-muted-foreground leading-snug pl-2 border-l-2 border-primary/50">
            {weatherAdvisory.advice}
          </p>
        </div>
      </RevealItem>

      {/* ───── Cœur MVP : Hero Diagnostic + Rituel 3 Étapes + Concierge WhatsApp ───── */}
      <RevealItem>
        <MvpFunnelHero
          lastDiag={multi.last ?? null}
          globalScore={multi.score}
          institutes={data?.institutes ?? []}
          defaultInstituteId={nextAppt?.tenantId || nextAppt?.tenant?.id}
          onStartScan={() => onScanZone("visage")}
          onOpenRoutine={() => {
            if (lastResult && multi.last) {
              setRitualOpen(true);
            } else {
              setClientTab("boutique");
            }
          }}
          onOpenContactKene={() => setContactKeneOpen(true)}
        />
      </RevealItem>

      {/* ───── État Actuel & Constantes de Santé Cutanée en Temps Réel ───── */}
      <RevealItem>
        <SkinHealthDashboard
          user={user}
          multi={multi}
          lastResult={lastResult}
          onScanZone={onScanZone}
          onOpenFullDiag={() => setClientTab("diagnostic")}
        />
      </RevealItem>

      {err && <p className="rounded-xl bg-destructive/10 text-destructive text-xs p-3">{err}</p>}

      {/* ───── Prochain Rendez-vous en Institut ───── */}
      <RevealItem>
        <section aria-labelledby="rdv-t">
          <SectionTitle icon={<SankofaIcon size={17} />}>
            <span id="rdv-t">{t("home.rdv.title")}</span>
          </SectionTitle>
          {!data ? (
            <Shimmer className="h-24 rounded-[24px]" />
          ) : nextAppt ? (
            <button
              onClick={() => setClientTab("rdv")}
              className="w-full text-left k-card k-card-hover rounded-[24px] p-4 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid place-items-center h-11 w-11 rounded-xl bg-primary/10 text-primary shrink-0">
                    <CalendarClock size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{nextAppt.service?.name ?? "Soin en institut"}</p>
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
            <button
              onClick={() => setClientTab("rdv")}
              className="w-full rounded-[24px] border border-dashed border-border bg-card/60 p-4 flex items-center justify-between active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="flex items-center gap-3">
                <span className="grid place-items-center h-10 w-10 rounded-xl bg-gold/15 text-gold-text">
                  <CalendarDays size={18} />
                </span>
                <div className="text-left">
                  <p className="text-xs font-bold text-foreground">Prendre RDV en salon</p>
                  <p className="text-[11px] text-muted-foreground">Soins personnalisés dans les instituts partenaires</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-primary" />
            </button>
          )}
        </section>
      </RevealItem>

      {/* ───── Salons & Instituts partenaires ───── */}
      <RevealItem>
        <section aria-labelledby="institutes-t">
          <SectionTitle
            icon={<Building2 size={16} />}
            action={
              <button
                onClick={() => setClientTab("rdv")}
                className="text-[11px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1"
              >
                Tous les instituts ({data?.institutes?.length ?? 0})
              </button>
            }
          >
            <span id="institutes-t">Instituts &amp; Salons partenaires</span>
          </SectionTitle>
          {!data ? (
            <Shimmer className="h-44 rounded-[24px]" />
          ) : data.institutes.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border bg-card/60 p-4 text-center text-xs text-muted-foreground">
              Les instituts partenaires Kènè arrivent bientôt dans votre ville.
            </div>
          ) : (
            <ScrollFadeRow label="Instituts partenaires — fais défiler" className="flex gap-3 overflow-x-auto no-scrollbar pb-2 snap-x pr-1">
              {data.institutes.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.sessionStorage.setItem("kene_pending_institute", inst.id);
                      window.dispatchEvent(new CustomEvent("kene:select-institute", { detail: { instituteId: inst.id } }));
                    }
                    setClientTab("rdv");
                  }}
                  className="snap-start shrink-0 w-60 sm:w-64 text-left k-card k-card-hover rounded-[24px] overflow-hidden active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary border border-border/80 shadow-xs"
                >
                  <div className="relative h-32 w-full">
                    <img src={inst.image} alt={inst.name} loading="lazy" className="h-full w-full object-cover" />
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white">
                      <Star size={10} className="fill-[#C8951E] text-[#C8951E]" /> {inst.rating.toFixed(1)}
                    </span>
                    <div className="absolute bottom-2.5 left-3 right-3 text-white">
                      <p className="font-heading font-bold text-xs leading-tight truncate">{inst.name}</p>
                      <p className="text-[10px] text-white/80 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin size={9} /> {inst.address || `${inst.city}, ${inst.country}`}
                        {inst.distanceKm !== null && inst.distanceKm !== undefined && (
                          <span className="text-[#8FD18F] font-mono font-bold">· {inst.distanceKm} km</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="p-3 flex items-center justify-between text-[11px] bg-card/50">
                    <span className="text-muted-foreground truncate">{inst._count?.services ?? 0} soins disponibles</span>
                    <span className="text-primary font-bold flex items-center gap-0.5 shrink-0">
                      Découvrir <ChevronRight size={13} />
                    </span>
                  </div>
                </button>
              ))}
            </ScrollFadeRow>
          )}
        </section>
      </RevealItem>

      {/* ───── Recommandé pour ta peau ───── */}
      <RevealItem>
        <section aria-labelledby="reco-t">
          <SectionTitle
            icon={<CauriIcon size={16} className="text-gold-text" />}
            action={
              <button
                onClick={() => setClientTab("boutique")}
                className="text-[11px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1"
              >
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
                <button
                  key={p.id}
                  onClick={() => setClientTab("boutique")}
                  className="snap-start shrink-0 w-40 sm:w-44 text-left k-card k-card-hover rounded-[24px] overflow-hidden active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <img src={p.image} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" />
                  <div className="p-2.5">
                    <p className="text-xs font-semibold leading-tight line-clamp-2 min-h-8">{p.name}</p>
                    <p className="text-[10px] text-terre mt-0.5 truncate">{p.botanicals}</p>
                    <div className="flex flex-wrap items-center justify-between gap-1 mt-1.5">
                      <span className="font-mono text-xs font-bold whitespace-nowrap text-gold-text">{xof(p.price)}</span>
                      <Stars rating={p.rating} size={9} />
                    </div>
                  </div>
                </button>
              ))}
            </ScrollFadeRow>
          )}
        </section>
      </RevealItem>

      {/* ───── Fin de fil — mentions légales & confiance ───── */}
      <RevealItem>
        <footer className="pt-4 pb-2 text-center">
          <div aria-hidden="true" className="kente-band-soft h-[3px] w-24 mx-auto rounded-full mb-3" />
          <p suppressHydrationWarning className="text-[10px] text-muted-foreground">
            © {new Date().getFullYear()} Kènè · Développé par Dermo TIC — « La beauté mélanoderme, enfin comprise. »
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Plateforme technologique éditée par Dermo TIC · Vente des produits et soins assurée exclusivement par les instituts partenaires agréés
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

      <ContactKeneModal
        open={contactKeneOpen}
        onOpenChange={setContactKeneOpen}
        userName={user.name}
      />
    </Reveal>
  );
}
