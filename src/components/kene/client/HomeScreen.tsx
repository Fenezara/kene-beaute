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
  ChevronRight,
  CloudSun,
  Crown,
  Leaf,
  MapPin,
  MessageCircle,
  Moon,
  Sparkles,
  SunMedium,
  Sunrise,
  Wind,
} from "lucide-react";
import { openWhatsApp, openWhatsAppAppointmentInquiry, openWhatsAppProductOrderInquiry } from "@/lib/kene/whatsapp-relay";
import { apiGet } from "@/lib/kene/api";
import { formatDate, formatTime } from "@/lib/kene/format";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { KeneEmblem, SankofaIcon, CauriIcon } from "@/components/kene/icons";
import { Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { useT } from "@/lib/kene/use-t";
import { useKene } from "@/store/kene";
import { MvpFunnelHero } from "./MvpFunnelHero";
import { SkinHealthDashboard } from "./SkinHealthDashboard";
import { AppointmentsCareSection } from "./AppointmentsCareSection";
import { ContactKeneModal } from "./ContactKeneModal";
import type { ApiAppointment, ApiDiagnosis, ApiInstitute, ApiProduct } from "./types";
import { parseDiagnosis } from "./types";
import { SectionTitle } from "./bits";

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

  /** Institut partenaire coché par la cliente */
  const selectedInst = useMemo(() => {
    if (!user.selectedTenantId || !data?.institutes) return null;
    return data.institutes.find((i) => i.id === user.selectedTenantId) ?? null;
  }, [user.selectedTenantId, data?.institutes]);

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
            <p className="text-xs uppercase tracking-[0.16em] text-primary font-semibold">{t("home.greeting")}</p>
            <h2 className="font-heading font-black text-[27px] sm:text-[29px] leading-tight tracking-tight truncate">
              <span className="kente-text-flow inline-block pr-1">{first}</span>
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 font-medium">
              <MapPin size={13} className="text-primary/80" /> {user.city || "Abidjan"} · {user.fitzpatrick ? `Fitzpatrick ${user.fitzpatrick}` : "Phototype à définir"}
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
                  <span className="rounded-full bg-gold/20 text-gold-text px-2 py-0.5 text-xs font-bold">
                    {subNotice.badge}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
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
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <span className="font-semibold text-foreground">{weatherAdvisory.temp}</span>
                  <span>·</span>
                  <span>Humidité {weatherAdvisory.humidity}</span>
                  <span>·</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{weatherAdvisory.uv}</span>
                </div>
              </div>
            </div>
            <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              Météo &amp; Peau
            </span>
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed pl-2 border-l-2 border-primary/50">
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
            if (lastResult) {
              const botanicals = (lastResult.recommandations?.botaniques_conseillees || []).slice(0, 3).join(", ");
              openWhatsAppProductOrderInquiry({
                productName: `Rituel formulé sur-mesure (${botanicals || "Actifs botaniques"})`,
              });
            } else {
              openWhatsAppProductOrderInquiry();
            }
          }}
          onOpenContactKene={() => setContactKeneOpen(true)}
        />
      </RevealItem>

      {/* ───── Mes Moments de Soin & Rendez-vous (Consultation, Contrôle, Soin éclat, Coiffure, Onglerie) ───── */}
      <RevealItem>
        <AppointmentsCareSection
          appointments={data?.appointments ?? []}
          onBookCare={() => openWhatsAppAppointmentInquiry()}
        />
      </RevealItem>

      {/* ───── Accès Privilégié : Échanger avec Dermo Kènè ───── */}
      <RevealItem>
        <section
          aria-label="Échanger avec Dermo Kènè"
          className="relative overflow-hidden rounded-[26px] border border-[#C8951E]/30 bg-gradient-to-br from-[#1C1611]/95 via-[#261B14]/90 to-[#18130E]/95 p-4 sm:p-5 text-[#FFF9EC] shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-white shrink-0 shadow-md">
                <Sparkles size={22} className="animate-pulse" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-black text-sm sm:text-base text-[#FFF9EC] truncate">
                    Dermo Kènè · Ton Guide
                  </h3>
                  <span className="rounded-full bg-[#C8951E]/20 border border-[#C8951E]/40 px-2 py-0.5 text-[9.5px] font-bold text-[#E3B04B]">
                    En écoute
                  </span>
                </div>
                <p className="text-xs text-[#EADCC9]/80 mt-0.5 leading-relaxed">
                  L&apos;intelligence dermo-botanique qui comprend ta mélanine. Pose tes questions à la voix ou par message.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-[#FFF9EC]/10 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#EADCC9]/70 italic truncate">
              « Comment se porte ta peau aujourd&apos;hui ? »
            </span>
            <button
              onClick={() => setClientTab("chat")}
              className="k-btn-gold shrink-0 h-9 px-3.5 rounded-xl text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
            >
              <MessageCircle size={14} />
              Échanger
            </button>
          </div>
        </section>
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

      {/* ───── Mon Protocole Botanique Personnalisé (Sans Prix) ───── */}
      {lastResult && (
        <RevealItem>
          <section aria-labelledby="rituel-t" className="rounded-[26px] border border-border/80 bg-card/80 p-4 sm:p-5 shadow-xs">
            <SectionTitle icon={<CauriIcon size={16} className="text-gold-text" />}>
              <span id="rituel-t">Mon Protocole Botanique</span>
            </SectionTitle>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {/* Rituel Matin */}
              <div className="rounded-2xl border border-[#C8951E]/20 bg-[#C8951E]/5 p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#C8951E]">
                  <Sunrise size={14} /> Rituel du Matin · Éveil &amp; Protection
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {lastResult.recommandations?.routine_matin?.slice(0, 2).join(" · ") || "Nettoyage doux au Moringa & émulsion hydratante protectrice"}
                </p>
              </div>

              {/* Rituel Soir */}
              <div className="rounded-2xl border border-terre/20 bg-terre/5 p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-terre">
                  <Moon size={14} /> Rituel du Soir · Réparation &amp; Nutrition
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {lastResult.recommandations?.routine_soir?.slice(0, 2).join(" · ") || "Soin réparateur Karité pur & scellage de la barrière lipidique"}
                </p>
              </div>
            </div>

            {/* Actifs clés */}
            {lastResult.recommandations?.botaniques_conseillees && lastResult.recommandations.botaniques_conseillees.length > 0 && (
              <div className="mt-3.5 pt-3 border-t border-border/60">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Trésors Botaniques recommandés pour ta peau :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {lastResult.recommandations.botaniques_conseillees.map((b) => (
                    <span key={b} className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary">
                      🌿 {b}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Commande de rituel sur-mesure via Conciergerie */}
            <div className="mt-4 pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <span className="text-xs text-muted-foreground leading-tight">
                Envie de recevoir tes soins formulés à base de ces actifs purs ?
              </span>
              <button
                onClick={() => {
                  const botanicals = (lastResult.recommandations?.botaniques_conseillees || []).slice(0, 3).join(", ");
                  openWhatsAppProductOrderInquiry({
                    productName: `Rituel formulé sur-mesure (${botanicals || "Actifs botaniques personnalisés"})`,
                  });
                }}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
              >
                <MessageCircle size={15} />
                Recevoir mon rituel (WhatsApp)
              </button>
            </div>
          </section>
        </RevealItem>
      )}

      {/* ───── Soin Signature en Cabine (Instituts Partenaires) ───── */}
      <RevealItem>
        <section aria-labelledby="cabine-t" className="rounded-[24px] border border-border/70 bg-card/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-xs">
          <div className="flex items-start gap-3 min-w-0">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary shrink-0 mt-0.5">
              <SankofaIcon size={18} />
            </span>
            <div className="min-w-0">
              <h3 id="cabine-t" className="font-heading font-black text-sm text-foreground">
                Soin Signature en Institut Partenaire
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Profite d&apos;un massage facial et d&apos;un soin profond adapté à ta mélanine dans les instituts certifiés Kènè.
              </p>
            </div>
          </div>
          <button
            onClick={() => openWhatsAppAppointmentInquiry()}
            className="shrink-0 h-10 px-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-[#128C7E] dark:text-[#25D366] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <MessageCircle size={15} />
            Réserver sur WhatsApp
          </button>
        </section>
      </RevealItem>

      {/* ───── Mon Institut Partenaire Référent (Coché) ou Découverte ───── */}
      {selectedInst ? (
        <RevealItem>
          <section aria-labelledby="mon-institut-t" className="rounded-[24px] border border-primary/30 bg-primary/5 p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
              <div className="flex items-start gap-3 min-w-0">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shrink-0 mt-0.5 shadow-xs">
                  <Building2 size={18} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-primary">Mon Institut Référent Coché ✅</span>
                  </div>
                  <h3 id="mon-institut-t" className="font-heading font-black text-sm sm:text-base text-foreground mt-0.5 truncate">
                    {selectedInst.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    📍 {selectedInst.city} {selectedInst.address ? `· ${selectedInst.address}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setClientTab("instituts")}
                  className="h-9 px-3.5 rounded-xl border border-border bg-card hover:bg-accent text-foreground text-xs font-semibold transition-colors"
                >
                  Changer
                </button>
                <button
                  onClick={() => {
                    const phone = selectedInst.phone || selectedInst.ownerPhone || "2250700000000";
                    openWhatsApp(phone, `Bonjour ${selectedInst.name} ! 🌸\nJe suis cliente Kènè (${user.name}). Je souhaite échanger avec vous.`);
                  }}
                  className="h-9 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </button>
              </div>
            </div>
          </section>
        </RevealItem>
      ) : (
        <RevealItem>
          <section aria-labelledby="choisir-institut-t" className="rounded-[24px] border border-border/80 bg-card/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-xs">
            <div className="flex items-start gap-3 min-w-0">
              <span className="grid size-10 place-items-center rounded-2xl bg-gold/15 text-gold-text shrink-0 mt-0.5">
                <Building2 size={18} />
              </span>
              <div className="min-w-0">
                <h3 id="choisir-institut-t" className="font-heading font-bold text-sm text-foreground">
                  Choisis ton institut partenaire
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Retrouve tous les instituts agréés et coche ton institut référent pour qu&apos;il reçoive tes bilans de peau.
                </p>
              </div>
            </div>
            <button
              onClick={() => setClientTab("instituts")}
              className="shrink-0 h-10 px-4 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
            >
              <Building2 size={14} />
              Voir les instituts
            </button>
          </section>
        </RevealItem>
      )}

      {/* ───── Fin de fil — mentions légales & confiance ───── */}
      <RevealItem>
        <footer className="pt-4 pb-2 text-center">
          <div aria-hidden="true" className="kente-band-soft h-[3px] w-24 mx-auto rounded-full mb-3" />
          <p suppressHydrationWarning className="text-xs text-muted-foreground font-medium">
            © {new Date().getFullYear()} Kènè · Développé par Dermo TIC — « La beauté mélanoderme, enfin comprise. »
          </p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Plateforme dermo-botanique éditée par Dermo TIC · Soins et protocoles personnalisés en instituts partenaires agréés
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
