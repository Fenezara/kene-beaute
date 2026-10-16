"use client";
// Kènè Cliente — Fil d'accueil MVP épuré et centré sur l'action :
// 1. Header (Nom, Ville/Phototype, Badge)
// 2. Hero Diagnostic & Rituel (MvpFunnelHero : Score, 3 étapes de soin, Commande express, Concierge WhatsApp)
// 3. Prochain RDV en institut
// 4. Soins recommandés pour ta peau (Carrousel produits)
// 5. Mentions légales & Sécurité paiements

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CloudSun,
  Crown,
  MapPin,
  MessageCircle,
  ScanFace,
  ShieldAlert,
  Sparkles,
  SunMedium,
  Wind,
} from "lucide-react";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { openWhatsAppAppointmentInquiry, openWhatsAppProductOrderInquiry } from "@/lib/kene/whatsapp-relay";
import { apiGet } from "@/lib/kene/api";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { KeneEmblem } from "@/components/kene/icons";
import { Reveal, RevealItem } from "@/components/kene/ui2026";
import { useT } from "@/lib/kene/use-t";
import { useKene } from "@/store/kene";
import { MvpFunnelHero } from "./MvpFunnelHero";
import { AppointmentsCareSection } from "./AppointmentsCareSection";
import { ContactKeneModal } from "./ContactKeneModal";
import type { ApiAppointment, ApiDiagnosis, ApiInstitute, ApiProduct } from "./types";
import { parseDiagnosis } from "./types";

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
  const [contactKeneOpen, setContactKeneOpen] = useState(false);
  const routineSectionRef = useRef<HTMLDivElement>(null);
  const careSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, a, p, s, insts] = await Promise.all([
          apiGet<{ diagnoses: ApiDiagnosis[] }>(`/api/diagnoses?userId=${user.id}&light=1`),
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
    const sortedDone = [...(data?.diagnoses ?? [])]
      .filter((d) => d.status === "done")
      .sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt));
    const score =
      covered.length && weightSum > 0
        ? Math.round(covered.reduce((s, z) => s + (byZone.get(z.id)?.scoreGlobal ?? 0) * z.weight, 0) / weightSum)
        : (sortedDone[0]?.scoreGlobal ?? null);
    const last = covered.length ? byZone.get(covered[0].id) : (sortedDone[0] ?? null);
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
        description: "Tes diagnostics illimités et ton suivi Dermo Kènè sont en pause. Réactive Kènè+ pour continuer.",
        btnText: "Réactiver (2 500 F)",
      };
    }

    return null;
  }, [data?.subscription]);

  /** Conseil Climat & Dermo-Météo contextualisé pour peau mélanoderme */
  /** Conseil Climat & Dermo-Météo contextualisé pour peau mélanoderme */
  const weatherAdvisory = useMemo(() => {
    const city = (user.city || user.district || "Abidjan").toLowerCase();
    if (city.includes("dakar") || city.includes("senegal") || city.includes("ngor") || city.includes("almadie")) {
      return {
        cityLabel: "Dakar · Climat océanique",
        temp: "27°C",
        humidity: "62%",
        uv: "UV 7 · Élevé",
        advice: "Particules & brise : Sérum antioxydant (Moringa) & hydratation du soir.",
        icon: <Wind size={15} className="text-[#3F7D3F]" />,
      };
    }
    if (city.includes("bouake") || city.includes("yamoussoukro") || city.includes("korhogo")) {
      return {
        cityLabel: "Intérieur · Ensoleillé",
        temp: "32°C",
        humidity: "48%",
        uv: "UV 9 · Très fort",
        advice: "Fort ensoleillement : Hydratation active & karité brut au coucher.",
        icon: <SunMedium size={15} className="text-gold-text" />,
      };
    }
    return {
      cityLabel: `${user.city ? user.city : "Abidjan"} · Humide`,
      temp: "29°C",
      humidity: "84%",
      uv: "UV 8 · Très fort",
      advice: "Forte humidité : Nettoyage doux au zinc & écran solaire SPF 50.",
      icon: <CloudSun size={15} className="text-primary" />,
    };
  }, [user.city, user.district]);

  /** Institut partenaire coché par la cliente */
  const selectedInst = useMemo(() => {
    if (data?.institutes && user.selectedTenantId) {
      const match = data.institutes.find((i) => i.id === user.selectedTenantId);
      if (match) return match;
    }
    if (user.selectedTenant) return user.selectedTenant;
    return null;
  }, [user.selectedTenantId, user.selectedTenant, data?.institutes]);

  return (
    <Reveal className="flex flex-col gap-6 pt-1">
      {/* ───── Salutation épurée ───── */}
      <RevealItem>
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span
              aria-hidden="true"
              className="mb-1.5 block h-[3.5px] w-12 rounded-full bg-gradient-to-r from-[#D49A24] via-[#C93B62] to-[#9E2045] shadow-xs opacity-90"
            />
            <p className="text-xs uppercase tracking-[0.16em] text-primary font-semibold">{t("home.greeting")}</p>
            <h2 className="font-heading font-black text-[27px] sm:text-[29px] leading-tight tracking-tight truncate">
              <span className="kente-text-flow inline-block pr-1">{first}</span>
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 font-medium">
              <MapPin size={13} className="text-primary/80" /> {user.city || "Abidjan"} · {user.fitzpatrick ? `Carnation Type ${user.fitzpatrick}` : "Carnation à définir"}
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

      {/* ───── 0. HUB D'INTENTIONS EXPRESS : QUE SOUHAITES-TU POUR TA PEAU ? ───── */}
      <RevealItem>
        <section
          aria-label="Que souhaites-tu pour ta peau aujourd'hui ?"
          className="rounded-[24px] border border-border/80 bg-gradient-to-br from-card via-card/75 to-card p-3.5 sm:p-4 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-primary animate-pulse" />
              <h3 className="text-xs sm:text-[13px] font-heading font-black tracking-tight text-foreground">
                Que souhaites-tu pour ta peau aujourd&apos;hui ?
              </h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground/75 px-2 py-0.5 rounded-full bg-muted">
              Intention directe
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
            {/* 1. Scanner ma peau */}
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.medium);
                onScanZone("visage");
              }}
              className="group relative flex flex-col items-start p-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card hover:border-primary/50 text-left transition-all active:scale-[0.97] shadow-xs cursor-pointer"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary mb-2 transition-transform group-hover:scale-105 shadow-2xs">
                <ScanFace size={18} />
              </span>
              <span className="font-heading font-black text-xs sm:text-[13px] text-foreground leading-tight">
                {multi.score ? "Nouveau Scan" : "Scanner ma peau"}
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                {multi.score ? `Score actuel ${multi.score}/100` : "Miroir vérité (30s)"}
              </span>
            </button>

            {/* 2. Scanner un produit cosmétique INCI */}
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("kene:open-inci-scanner"));
                }
              }}
              className="group relative flex flex-col items-start p-3 rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/15 via-card to-card hover:border-gold text-left transition-all active:scale-[0.97] shadow-xs cursor-pointer"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-gold/25 text-gold-text mb-2 transition-transform group-hover:scale-105 shadow-2xs">
                <ShieldAlert size={18} />
              </span>
              <span className="font-heading font-black text-xs sm:text-[13px] text-foreground leading-tight">
                Scanner produit INCI
              </span>
              <span className="text-[10px] text-gold-text font-bold mt-0.5 line-clamp-1">
                Anti-dépigmentant 🧴
              </span>
            </button>

            {/* 3. Conseil Dermo Kènè */}
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                setClientTab("chat");
              }}
              className="group relative flex flex-col items-start p-3 rounded-2xl border border-finance/25 bg-gradient-to-br from-finance/10 via-card to-card hover:border-finance/50 text-left transition-all active:scale-[0.97] shadow-xs cursor-pointer"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-finance/15 text-finance dark:text-blue-400 mb-2 transition-transform group-hover:scale-105 shadow-2xs">
                <MessageCircle size={18} />
              </span>
              <span className="font-heading font-black text-xs sm:text-[13px] text-foreground leading-tight">
                Dermo Kènè
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                Conseils & analyse
              </span>
            </button>

            {/* 4. Mon soin en institut */}
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                careSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="group relative flex flex-col items-start p-3 rounded-2xl border border-success/25 bg-gradient-to-br from-success/10 via-card to-card hover:border-success/50 text-left transition-all active:scale-[0.97] shadow-xs cursor-pointer"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-success/15 text-success dark:text-emerald-400 mb-2 transition-transform group-hover:scale-105 shadow-2xs">
                <CalendarDays size={18} />
              </span>
              <span className="font-heading font-black text-xs sm:text-[13px] text-foreground leading-tight">
                Soin en institut
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                {nextAppt ? "RDV & Pass Cabine" : "Prendre RDV"}
              </span>
            </button>
          </div>
        </section>
      </RevealItem>

      {/* ───── Rappel d'échéance Kènè+ (J-3 ou Expiré récent) ───── */}
      {subNotice && (
        <RevealItem>
          <div
            className={`k-card rounded-[22px] p-3.5 flex items-center justify-between gap-3 border ${
              subNotice.type === "warning"
                ? "bg-gradient-to-r from-gold/15 via-gold/10 to-transparent border-gold/40 shadow-sm"
                : "bg-gradient-to-r from-terre/15 via-terre/10 to-transparent border-terre/40 shadow-sm"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid place-items-center size-9 rounded-xl bg-gold/20 text-gold-text shrink-0 shadow-sm">
                <Crown size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-heading font-black text-sm text-foreground">{subNotice.title}</p>
                  <span className="rounded-full bg-gold/20 text-gold-text px-2 py-0.5 text-[10px] font-bold">
                    {subNotice.badge}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {subNotice.description}
                </p>
              </div>
            </div>
            <button
              onClick={() => setClientTab("abonnement")}
              className="k-btn-gold shrink-0 h-9 px-3 rounded-xl text-primary-foreground text-xs font-bold whitespace-nowrap shadow-sm active:scale-95 transition-all"
            >
              {subNotice.btnText}
            </button>
          </div>
        </RevealItem>
      )}

      {/* ───── 1. HERO DU DIAGNOSTIC DE PEAU & BILAN CUTANÉ ───── */}
      <RevealItem>
        <div ref={routineSectionRef} className="scroll-mt-4">
          <MvpFunnelHero
            lastDiag={multi.last ?? null}
            globalScore={multi.score}
            institutes={data?.institutes ?? []}
            defaultInstituteId={selectedInst?.id || nextAppt?.tenantId || nextAppt?.tenant?.id}
            onStartScan={() => onScanZone("visage")}
            onOpenRoutine={() => {
              const botanicals = lastResult ? (lastResult.recommandations?.botaniques_conseillees || []).slice(0, 3).join(", ") : undefined;
              openWhatsAppProductOrderInquiry({
                productName: botanicals ? `Rituel formulé sur-mesure (${botanicals})` : undefined,
                tenantPhone: selectedInst?.phone || (selectedInst as any)?.ownerPhone,
                instituteName: selectedInst?.name,
                country: ((selectedInst as any)?.country || "CI") as "CI" | "SN",
              });
            }}
            onOpenContactKene={() => setContactKeneOpen(true)}
          />
        </div>
      </RevealItem>

      {/* ───── 2. DERMO KÈNÈ · L'EXPERTE DERMO-COSMÉTIQUE 24/7 ───── */}
      <RevealItem>
        <section
          aria-label="Dermo Kènè — Conseillère dermo-cosmétique 24/7"
          className="relative overflow-hidden rounded-[26px] border border-[#C8951E]/40 bg-gradient-to-br from-[#1C1611] via-[#241A14] to-[#18130E] p-4.5 sm:p-5 text-[#FFF9EC] shadow-lg"
        >
          {/* Halos dorés subtils */}
          <div aria-hidden="true" className="absolute -right-8 -top-8 size-36 rounded-full bg-[#C8951E]/15 blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C8951E]/20 border border-[#C8951E]/40 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-[#FFD875]">
                <Sparkles size={11} className="animate-pulse" />
                ✨ Dermo Kènè · Conseillère IA 24/7
              </span>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Disponible
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#C8951E] via-[#A0522D] to-[#8B1A3B] text-white shrink-0 shadow-md">
                  <Sparkles size={22} className="animate-pulse" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-heading font-black text-base sm:text-lg text-[#FFF9EC] truncate">
                    Dermo Kènè · Ton Experte Peau
                  </h3>
                  <p className="text-xs text-[#EADCC9]/85 line-clamp-2 leading-relaxed">
                    Pose tes questions beauté à la voix ou par écrit. Analyse d&apos;ingrédients et conseils sur-mesure.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setClientTab("chat")}
                className="k-btn-gold shrink-0 h-10 px-4 rounded-xl text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <MessageCircle size={15} />
                Échanger
              </button>
            </div>

            {/* Questions fréquentes en 1 clic */}
            <div className="flex items-center gap-1.5 overflow-x-auto pretty-scroll pt-1 border-t border-[#FFF9EC]/10 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("kene:open-inci-scanner"));
                  }
                }}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#FFF9EC]/10 hover:bg-[#FFF9EC]/20 text-[#EADCC9] font-medium transition-colors cursor-pointer"
              >
                🧴 Analyser un produit (INCI)
              </button>
              <button
                type="button"
                onClick={() => setClientTab("chat")}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#FFF9EC]/10 hover:bg-[#FFF9EC]/20 text-[#EADCC9] font-medium transition-colors"
              >
                ✨ Routine anti-taches
              </button>
              <button
                type="button"
                onClick={() => setClientTab("chat")}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#FFF9EC]/10 hover:bg-[#FFF9EC]/20 text-[#EADCC9] font-medium transition-colors"
              >
                🌿 Bienfaits du Moringa
              </button>
            </div>
          </div>
        </section>
      </RevealItem>

      {/* ───── 3. LA SECRÉTAIRE IA & VOS MOMENTS DE SOIN ───── */}
      <RevealItem>
        <div ref={careSectionRef} className="scroll-mt-4">
          <AppointmentsCareSection
            appointments={data?.appointments ?? []}
            selectedInstitute={selectedInst}
            onBookCare={() =>
              openWhatsAppAppointmentInquiry({
                serviceCategory: "Soin esthétique",
                serviceName: "Soin en institut partenaire",
                tenantPhone: selectedInst?.phone || (selectedInst as any)?.ownerPhone,
                instituteName: selectedInst?.name,
                country: ((selectedInst as any)?.country || "CI") as "CI" | "SN",
              })
            }
          />
        </div>
      </RevealItem>

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
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <span className="font-semibold text-foreground">{weatherAdvisory.temp}</span>
                  <span>·</span>
                  <span>Humidité {weatherAdvisory.humidity}</span>
                  <span>·</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{weatherAdvisory.uv}</span>
                </div>
              </div>
            </div>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              Météo
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground pl-2 border-l-2 border-primary/50">
            {weatherAdvisory.advice}
          </p>
        </div>
      </RevealItem>

      {err && <p className="rounded-xl bg-destructive/10 text-destructive text-xs p-3">{err}</p>}

      {/* ───── Fin de fil — mentions simples ───── */}
      <RevealItem>
        <footer className="pt-3 pb-2 text-center">
          <p suppressHydrationWarning className="text-xs text-muted-foreground font-medium">
            © {new Date().getFullYear()} Kènè · La beauté mélanoderme, enfin comprise.
          </p>
        </footer>
      </RevealItem>

      <ContactKeneModal
        open={contactKeneOpen}
        onOpenChange={setContactKeneOpen}
        userName={user.name}
      />
    </Reveal>
  );
}
