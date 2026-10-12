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

      {/* ───── 🥇 PRODUIT PHARE N°1 : HERO DU DIAGNOSTIC DE PEAU & BILAN CUTANÉ ───── */}
      <RevealItem>
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
      </RevealItem>

      {/* ───── 🥈 PRODUIT PHARE N°2 : DERMO KÈNÈ · L'EXPERTE DERMO-BOTANIQUE 24/7 ───── */}
      <RevealItem>
        <section
          aria-label="Dermo Kènè — Produit phare n°2"
          className="relative overflow-hidden rounded-[26px] border border-[#C8951E]/40 bg-gradient-to-br from-[#1C1611] via-[#241A14] to-[#18130E] p-4.5 sm:p-5 text-[#FFF9EC] shadow-lg"
        >
          {/* Halos dorés subtils */}
          <div aria-hidden="true" className="absolute -right-8 -top-8 size-36 rounded-full bg-[#C8951E]/15 blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C8951E]/20 border border-[#C8951E]/40 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-[#FFD875]">
                <Sparkles size={11} className="animate-pulse" />
                🥈 Produit Phare · Conseillère IA 24/7
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
                onClick={() => setClientTab("chat")}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#FFF9EC]/10 hover:bg-[#FFF9EC]/20 text-[#EADCC9] font-medium transition-colors"
              >
                🧴 Analyser un produit
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

      {/* ───── 🥉 PRODUIT PHARE N°3 : LA SECRÉTAIRE IA & VOS MOMENTS DE SOIN ───── */}
      <RevealItem>
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

      {/* ───── Mon Protocole Botanique Personnalisé ───── */}
      {lastResult && (
        <RevealItem>
          <section aria-labelledby="rituel-t" className="rounded-[26px] border border-border/80 bg-card/80 p-4 sm:p-5 shadow-xs">
            <SectionTitle icon={<CauriIcon size={16} className="text-gold-text" />}>
              <span id="rituel-t">Mon Protocole Botanique</span>
            </SectionTitle>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
              {/* Rituel Matin */}
              <div className="rounded-2xl border border-[#C8951E]/20 bg-[#C8951E]/5 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#C8951E]">
                  <Sunrise size={14} /> Rituel Matin
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {lastResult.recommandations?.routine_matin?.slice(0, 2).join(" · ") || "Nettoyage doux au Moringa & émulsion protectrice"}
                </p>
              </div>

              {/* Rituel Soir */}
              <div className="rounded-2xl border border-terre/20 bg-terre/5 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-terre">
                  <Moon size={14} /> Rituel Soir
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {lastResult.recommandations?.routine_soir?.slice(0, 2).join(" · ") || "Karité brut pur & régénération nocturne"}
                </p>
              </div>
            </div>

            {/* Actifs clés */}
            {lastResult.recommandations?.botaniques_conseillees && lastResult.recommandations.botaniques_conseillees.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex flex-wrap gap-1.5">
                  {lastResult.recommandations.botaniques_conseillees.slice(0, 4).map((b) => (
                    <span key={b} className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                      🌿 {b}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const botanicals = (lastResult.recommandations?.botaniques_conseillees || []).slice(0, 3).join(", ");
                    openWhatsAppProductOrderInquiry({
                      productName: `Rituel formulé sur-mesure (${botanicals || "Actifs botaniques personnalisés"})`,
                      tenantPhone: selectedInst?.phone || (selectedInst as any)?.ownerPhone,
                      instituteName: selectedInst?.name,
                      country: ((selectedInst as any)?.country || "CI") as "CI" | "SN",
                    });
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
                >
                  <MessageCircle size={13} />
                  Commander (WhatsApp)
                </button>
              </div>
            )}
          </section>
        </RevealItem>
      )}

      {/* ───── Soin Signature en Cabine ───── */}
      <RevealItem>
        <section aria-labelledby="cabine-t" className="rounded-[22px] border border-border/70 bg-card/60 p-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
              <SankofaIcon size={16} />
            </span>
            <div className="min-w-0">
              <h3 id="cabine-t" className="font-heading font-black text-sm text-foreground truncate">
                {selectedInst ? `Soin chez ${selectedInst.name}` : "Soin en Institut Partenaire"}
              </h3>
              <p className="text-xs text-muted-foreground truncate">
                Soin cabine &amp; massage facial adapté à ta peau.
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              openWhatsAppAppointmentInquiry({
                serviceCategory: "Soin esthétique",
                serviceName: "Soin signature cabine & éclat",
                tenantPhone: selectedInst?.phone || (selectedInst as any)?.ownerPhone,
                instituteName: selectedInst?.name,
                country: ((selectedInst as any)?.country || "CI") as "CI" | "SN",
              })
            }
            className="shrink-0 h-9 px-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-[#128C7E] dark:text-[#25D366] text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <MessageCircle size={14} />
            Réserver
          </button>
        </section>
      </RevealItem>

      {/* ───── Mon Institut Partenaire Référent ───── */}
      {selectedInst ? (
        <RevealItem>
          <section aria-labelledby="mon-institut-t" className="rounded-[22px] border border-primary/30 bg-primary/5 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shrink-0 shadow-xs">
                  <Building2 size={16} />
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Institut Référent ✅</span>
                  <h3 id="mon-institut-t" className="font-heading font-black text-sm text-foreground truncate">
                    {selectedInst.name}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    📍 {selectedInst.city}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setClientTab("profil")}
                  className="h-8 px-3 rounded-lg border border-border bg-card hover:bg-accent text-foreground text-xs font-semibold"
                >
                  Changer
                </button>
                <button
                  onClick={() => {
                    const phone = selectedInst.phone || (selectedInst as any).ownerPhone || "2250700000000";
                    const country = ((selectedInst as any).country || "CI") as "CI" | "SN";
                    openWhatsApp(phone, `Bonjour ${selectedInst.name} ! 🌸\nJe suis cliente Kènè (${user.name}). Je souhaite échanger avec vous.`, country);
                  }}
                  className="h-8 px-3 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                >
                  <MessageCircle size={13} />
                  WhatsApp
                </button>
              </div>
            </div>
          </section>
        </RevealItem>
      ) : (
        <RevealItem>
          <section aria-labelledby="choisir-institut-t" className="rounded-[22px] border border-border/80 bg-card/60 p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold-text shrink-0">
                <Building2 size={16} />
              </span>
              <div className="min-w-0">
                <h3 id="choisir-institut-t" className="font-heading font-bold text-sm text-foreground truncate">
                  Choisir mon institut partenaire
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  Coche ton institut référent dans ton profil pour lui transmettre tes bilans.
                </p>
              </div>
            </div>
            <button
              onClick={() => setClientTab("profil")}
              className="shrink-0 h-9 px-3.5 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Building2 size={13} />
              Choisir
            </button>
          </section>
        </RevealItem>
      )}

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
