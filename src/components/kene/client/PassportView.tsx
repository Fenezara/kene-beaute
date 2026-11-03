"use client";
// Kènè — Passeport de Peau Dermo-Biométrique (Édition 2026) :
// Ce que voit une praticienne en institut (ou une amie) qui scanne le QR Code —
// SANS compte requis, SANS photo exposée, 100% conforme RGPD & Cosméto-Vigilance.
import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Baby,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Leaf,
  Loader2,
  MapPin,
  Printer,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { KeneEmblem, KenteIcon } from "@/components/kene/icons";
import { KenteIdentity } from "@/components/kene/loom/KenteIdentity";

interface PassportIndicator {
  nom: string;
  pourcentage: number;
  severite: number;
}

interface PassportData {
  name: string;
  city: string | null;
  district?: string | null;
  fitzpatrick: string | null;
  skinType: string | null;
  allergies: string | null;
  pregnant?: boolean;
  gender?: string;
  goals: string[];
  scanCount?: number;
  visitCount?: number;
  lastScan: {
    zone: string;
    score: number;
    date: string;
    indicators?: PassportIndicator[];
    botanicals?: string[];
    recommendedCare?: string[];
    routineMorning?: string[];
    routineEvening?: string[];
  } | null;
  lastCabinVisit?: {
    date: string;
    serviceName: string;
    instituteName: string;
  } | null;
  prescription?: {
    cureNumber?: number;
    tenantName?: string;
    notes?: string;
    products?: { name: string; moment: string; posology: string }[];
    cabineServices?: { name: string; frequency: string; durationMin?: number }[];
  } | null;
  threads: number;
  seed: number;
  since: string;
}

const SKIN_LABEL: Record<string, string> = {
  grasse: "Grasse / Séborrhéique",
  seche: "Sèche / Alipidique",
  mixte: "Mixte",
  normale: "Normale / Équilibrée",
};

const ZONE_LABEL: Record<string, string> = {
  visage: "Visage",
  dos: "Dos & Épaules",
  cuir_chevelu: "Cuir chevelu",
  mains: "Mains & Pieds",
  barbe: "Barbe & Cou",
  naevi: "Corps & Lésions",
};

function scoreTone(score: number): string {
  if (score >= 80) return "#10B981";
  if (score >= 60) return "#C8951E";
  if (score >= 40) return "#E07A2B";
  return "#E11D48";
}

function scoreStatusLabel(score: number): string {
  if (score >= 80) return "Équilibre Cutané Optimal";
  if (score >= 65) return "Bonne Vitalité Mélanique";
  if (score >= 45) return "Vigilance Ciblée Recommandée";
  return "Soin Réparateur Prioritaire";
}

/* Jeton de l'URL — écoute réactive sur window.location (query ?passport=) */
function subscribeToken(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("popstate", callback);
  window.addEventListener("hashchange", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("hashchange", callback);
  };
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("passport");
}

export function PassportGate() {
  const token = useSyncExternalStore<string | null>(subscribeToken, readToken, () => null);
  const [data, setData] = useState<PassportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!token) return;
    setClosed(false);

    // Restauration immédiate depuis le cache local (idéal en cabine de soin à faible couverture 3G/4G)
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(`kene_passport_data_${token}`);
        if (cached) {
          setData(JSON.parse(cached));
        }
      } catch {}
    }

    apiGet<{ passport: PassportData }>(`/api/passport?token=${encodeURIComponent(token)}`)
      .then((r) => {
        setData(r.passport);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(`kene_passport_data_${token}`, JSON.stringify(r.passport));
          } catch {}
        }
      })
      .catch((e) => {
        setData((prev) => {
          if (!prev) {
            setError(e instanceof Error ? e.message : "Passeport introuvable");
          }
          return prev;
        });
      });
  }, [token]);

  if (!token || closed) return null;

  function close() {
    try {
      window.history.replaceState(null, "", window.location.pathname);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {}
    setClosed(true);
  }

  async function sharePassport() {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Passeport Dermo-Biométrique Kènè — ${data?.name || ""}`,
          text: "Consultez mon Passeport Cutané Certifié Kènè (phototype, allergies, constantes de peau & score VISIA).",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Lien du Passeport copié dans le presse-papiers");
      }
    } catch {}
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] overflow-y-auto bg-[#140E0A] text-[#F8F1E4]"
      role="dialog"
      aria-label="Passeport Dermo-Biométrique Kènè"
    >
      {/* Atmosphère de prestige Or & Ébène */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(65% 50% at 50% 8%, rgba(212,154,36,0.20) 0%, transparent 68%), radial-gradient(50% 42% at 88% 88%, rgba(139,26,59,0.14) 0%, transparent 72%), radial-gradient(45% 36% at 10% 82%, rgba(160,82,45,0.12) 0%, transparent 74%)",
        }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[540px] flex-col px-4 sm:px-6 py-6 sm:py-8">
        {/* En-tête de marque — Sceau officiel + Badge de certification */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="dark" aria-hidden="true">
              <KeneEmblem size={40} className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
            </span>
            <div>
              <p className="font-heading text-[19px] font-black tracking-[0.02em] leading-none">
                Kènè
              </p>
              <p className="text-[9.5px] uppercase tracking-[0.18em] text-[#D49A24] font-bold mt-0.5">
                Registre Dermo-Biométrique
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 px-3 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-emerald-300 shadow-sm">
            <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
            Passeport Certifié
          </span>
        </div>

        {error ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-[#8B1A3B]/20 text-[#E89AB3]">
              <TriangleAlert size={26} />
            </span>
            <p className="mt-5 font-heading text-xl font-black">Passeport introuvable ou révoqué</p>
            <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-[#F8F1E4]/70">
              {error} — la titulaire a peut-être généré un nouveau QR Code de sécurité.
            </p>
            <button
              onClick={close}
              className="mt-7 inline-flex h-12 items-center gap-2 rounded-full k-btn-gold px-6 font-heading font-bold text-[14px] text-primary-foreground"
            >
              Découvrir Kènè <ArrowRight size={15} />
            </button>
          </div>
        ) : !data ? (
          <div className="mt-24 flex flex-col items-center gap-4 text-[#F8F1E4]/70">
            <Loader2 size={28} className="animate-spin text-[#C8951E]" />
            <p className="text-sm font-medium">Vérification du certificat biométrique…</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-5 flex flex-1 flex-col"
          >
            {/* ══════════ CARTE MAÎTRESSE DU PASSEPORT DE PEAU ══════════ */}
            <div className="overflow-hidden rounded-[28px] bg-gradient-to-b from-[#251A11]/95 via-[#1E150D]/95 to-[#18110B]/95 ring-1 ring-[#D49A24]/40 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
              <div className="kente-band h-[5px] w-full" aria-hidden="true" />

              <div className="p-5 sm:p-6 space-y-5">
                {/* Identité Titulaire & Sceau */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#D49A24]">
                        Passeport de Peau Officiel
                      </span>
                      {(data.scanCount ?? 0) > 0 && (
                        <span className="rounded-full bg-[#D49A24]/15 border border-[#D49A24]/30 px-2 py-0.5 text-[9px] font-bold text-[#F3D98A]">
                          {data.scanCount} bilan{(data.scanCount ?? 0) > 1 ? "s" : ""} IA
                        </span>
                      )}
                    </div>
                    <h1 className="mt-1 font-heading text-[26px] sm:text-[28px] font-black leading-tight text-[#FFF9EC] truncate">
                      {data.name}
                    </h1>
                    <div className="mt-1 flex items-center gap-3 flex-wrap text-[12px] text-[#F8F1E4]/75">
                      {data.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="text-[#D49A24]" />
                          {data.city}{data.district ? ` · ${data.district}` : ""}
                        </span>
                      )}
                      {(data.visitCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
                          <Building2 size={12} />
                          {data.visitCount} soin{(data.visitCount ?? 0) > 1 ? "s" : ""} en institut
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#D49A24]/25 to-[#8B1A3B]/20 border border-[#D49A24]/40 text-[#F3D98A] shadow-inner">
                      <ShieldCheck size={24} />
                    </span>
                  </div>
                </div>

                {/* 3 Tuiles Biométriques Principales */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-[16px] bg-[#140E0A]/75 p-3 text-center ring-1 ring-[#F8F1E4]/12">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#F8F1E4]/55">
                      Phototype
                    </p>
                    <p className="mt-1 text-[13.5px] font-black text-[#F3D98A]">
                      {data.fitzpatrick ? `Fitzpatrick ${data.fitzpatrick}` : "Mélanoderme"}
                    </p>
                  </div>

                  <div className="rounded-[16px] bg-[#140E0A]/75 p-3 text-center ring-1 ring-[#F8F1E4]/12">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#F8F1E4]/55">
                      Nature Cutanée
                    </p>
                    <p className="mt-1 text-[13px] font-black text-[#FFF9EC] truncate">
                      {data.skinType ? (SKIN_LABEL[data.skinType] ?? data.skinType) : "Mixte"}
                    </p>
                  </div>

                  <div
                    className={`rounded-[16px] p-3 text-center ring-1 ${
                      data.allergies
                        ? "bg-rose-950/50 ring-rose-500/40"
                        : "bg-emerald-950/35 ring-emerald-500/30"
                    }`}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#F8F1E4]/65">
                      Vigilance
                    </p>
                    <p
                      className={`mt-1 text-[12.5px] font-black ${
                        data.allergies ? "text-rose-300" : "text-emerald-300"
                      }`}
                    >
                      {data.allergies ? "Allergie signalée" : "RAS · Tolérante"}
                    </p>
                  </div>
                </div>

                {/* Bandeau d'alerte Cosméto-Vigilance (Allergies ou Maternité) */}
                {(data.allergies || data.pregnant) && (
                  <div className="space-y-2">
                    {data.allergies && (
                      <div className="flex items-start gap-2.5 rounded-[14px] bg-rose-950/60 border border-rose-500/40 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-rose-200">
                        <ShieldAlert size={16} className="text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-black uppercase tracking-wider text-[10px] text-rose-300 block">
                            Alerte Cabine — Ingrédients / Allergies à proscrire :
                          </span>
                          <span className="font-semibold">{data.allergies}</span>
                        </div>
                      </div>
                    )}
                    {data.pregnant && (
                      <div className="flex items-center gap-2.5 rounded-[14px] bg-amber-950/50 border border-amber-500/40 px-3.5 py-2 text-[11.5px] text-amber-200">
                        <Baby size={15} className="text-amber-400 shrink-0" />
                        <span>
                          <strong className="font-bold">Protocole Maternité / Allaitement :</strong> exclure rétinoïdes, huiles essentielles et acides forts.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Objectifs prioritaires */}
                {data.goals.length > 0 && (
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#F8F1E4]/55 mb-2">
                      Objectifs Dermo-Esthétiques Ciblés
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.goals.map((g) => (
                        <span
                          key={g}
                          className="rounded-full bg-[#D49A24]/15 border border-[#D49A24]/35 px-3 py-1 text-[11px] font-bold text-[#F3D98A]"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bloc Score Biométrique & Constantes du Dernier Scan */}
                <div className="rounded-[20px] bg-[#140E0A]/80 p-4 ring-1 ring-[#F8F1E4]/12 space-y-3.5">
                  {data.lastScan ? (
                    <>
                      <div className="flex items-center gap-3.5">
                        <div
                          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl font-heading font-black text-2xl shadow-lg border border-white/15"
                          style={{ backgroundColor: scoreTone(data.lastScan.score), color: "#FFF9EC" }}
                          aria-label={`Score cutané ${data.lastScan.score} sur 100`}
                        >
                          {data.lastScan.score}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#D49A24]">
                              Indice Santé Cutanée · {ZONE_LABEL[data.lastScan.zone] ?? data.lastScan.zone}
                            </span>
                          </div>
                          <p className="text-[14px] font-black text-[#FFF9EC] mt-0.5">
                            {scoreStatusLabel(data.lastScan.score)}
                          </p>
                          <p className="text-[11px] text-[#F8F1E4]/65 mt-0.5">
                            Bilan du {formatDate(data.lastScan.date)} · Imagerie spectrale Kènè
                          </p>
                        </div>
                      </div>

                      {/* Barres des 4 constantes biométriques (Hydratation, Éclat, Texture, etc.) */}
                      {data.lastScan.indicators && data.lastScan.indicators.length > 0 && (
                        <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-[#F8F1E4]/10">
                          {data.lastScan.indicators.map((ind) => (
                            <div key={ind.nom} className="bg-[#1E150D] rounded-xl p-2.5 border border-[#F8F1E4]/8">
                              <div className="flex items-center justify-between gap-1 text-[10.5px]">
                                <span className="font-semibold text-[#F8F1E4]/80 truncate">{ind.nom}</span>
                                <span className="font-black tabular-nums text-[#F3D98A]">{ind.pourcentage}%</span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.max(12, Math.min(100, ind.pourcentage))}%`,
                                    backgroundColor: scoreTone(ind.pourcentage),
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actifs Botaniques & Soins Conseillés pour la Cabine */}
                      {((data.lastScan.botanicals && data.lastScan.botanicals.length > 0) ||
                        (data.lastScan.recommendedCare && data.lastScan.recommendedCare.length > 0)) && (
                        <div className="pt-3 border-t border-[#F8F1E4]/10 space-y-2.5">
                          {data.lastScan.botanicals && data.lastScan.botanicals.length > 0 && (
                            <div>
                              <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 mb-1.5">
                                <Leaf size={11} /> Actifs &amp; Botaniques Recommandés
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {data.lastScan.botanicals.map((bot) => (
                                  <span
                                    key={bot}
                                    className="rounded-lg bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-200"
                                  >
                                    {bot}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {data.lastScan.recommendedCare && data.lastScan.recommendedCare.length > 0 && (
                            <div>
                              <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#D49A24] mb-1">
                                <Activity size={11} /> Protocole Cabine Suggéré
                              </p>
                              <ul className="space-y-1 text-[11.5px] text-[#F8F1E4]/85">
                                {data.lastScan.recommendedCare.map((care) => (
                                  <li key={care} className="flex items-start gap-1.5">
                                    <span className="text-[#D49A24] font-bold">•</span>
                                    <span>{care}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] text-[#F8F1E4]/70">
                      Aucun scan biométrique enregistré — profil déclaratif initial.
                    </p>
                  )}
                </div>

                {/* Ordonnance Dermo-Esthétique Hybride (Produits & Soins Cabine) */}
                {(data.prescription || data.lastCabinVisit) && (
                  <div className="rounded-[20px] bg-[#140E0A]/80 p-4 ring-1 ring-[#D49A24]/30 space-y-3">
                    {data.prescription ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-[#F8F1E4]/10 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="grid size-7 place-items-center rounded-lg bg-[#D49A24]/20 text-[#F3D98A]">
                              <Sun size={14} />
                            </span>
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-wider text-[#F3D98A] leading-tight">
                                Ordonnance de Soins Active
                              </p>
                              {data.prescription.tenantName && (
                                <p className="text-[10px] text-[#F8F1E4]/60">
                                  Prescrite par {data.prescription.tenantName}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="rounded-full bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                            Cure #{data.prescription.cureNumber || 1}
                          </span>
                        </div>

                        {/* Produits prescrits */}
                        {data.prescription.products && data.prescription.products.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#F8F1E4]/60">
                              Cosmétiques Quotidiens :
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              {data.prescription.products.map((prod, idx) => (
                                <div key={idx} className="bg-[#1E150D] rounded-xl p-2.5 border border-[#F8F1E4]/8 flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[12px] font-black text-[#FFF9EC] leading-tight truncate">
                                      {prod.name}
                                    </p>
                                    <p className="text-[10.5px] text-[#F8F1E4]/70 mt-0.5 leading-snug">
                                      {prod.posology}
                                    </p>
                                  </div>
                                  <span className="rounded-md bg-[#D49A24]/15 border border-[#D49A24]/30 px-1.5 py-0.5 text-[9px] font-bold text-[#F3D98A] shrink-0 uppercase">
                                    {prod.moment === "matin" ? "Matin" : prod.moment === "soir" ? "Soir" : prod.moment === "matin_soir" ? "Matin & Soir" : "Hebdo"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Soins cabine prescrits */}
                        {data.prescription.cabineServices && data.prescription.cabineServices.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#F8F1E4]/60">
                              Protocole en Institut :
                            </p>
                            <div className="space-y-1.5">
                              {data.prescription.cabineServices.map((srv, idx) => (
                                <div key={idx} className="flex items-center justify-between gap-2 text-[11px] bg-[#1E150D]/60 rounded-lg px-2.5 py-1.5 border border-[#F8F1E4]/6">
                                  <span className="font-semibold text-emerald-300 truncate">
                                    ✦ {srv.name}
                                  </span>
                                  <span className="text-[10px] text-[#F8F1E4]/60 shrink-0 font-medium">
                                    {srv.frequency}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notes / Instructions spécifiques */}
                        {data.prescription.notes && (
                          <div className="bg-[#1E150D]/40 rounded-xl p-2.5 border border-dashed border-[#F8F1E4]/12 text-[11px] text-[#F8F1E4]/80 leading-relaxed italic">
                            « {data.prescription.notes} »
                          </div>
                        )}
                      </div>
                    ) : null}

                    {data.lastCabinVisit && (
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F8F1E4]/10 text-[11px] text-[#F8F1E4]/75">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                          <CalendarCheck2 size={12} />
                          Dernier soin : {data.lastCabinVisit.serviceName}
                        </span>
                        <span className="text-[10.5px] text-[#F8F1E4]/55">
                          {data.lastCabinVisit.instituteName} ({formatDate(data.lastCabinVisit.date)})
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Signature Kente Identitaire */}
                <div>
                  <div className="flex items-center justify-between text-[10.5px] text-[#F8F1E4]/65">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <KenteIcon size={12} className="text-[#C8951E]" aria-hidden="true" />
                      Empreinte Kente Identitaire
                    </span>
                    <span className="font-extrabold text-[#F3D98A]">
                      {data.threads} fil{data.threads > 1 ? "s" : ""} d&apos;or tissé{data.threads > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 rounded-[12px] overflow-hidden ring-1 ring-[#F8F1E4]/15">
                    <KenteIdentity seed={data.seed} threads={data.threads} compact height={38} />
                  </div>
                </div>
              </div>

              {/* Pied de Passeport Officiel */}
              <div className="flex items-center justify-between border-t border-[#F8F1E4]/10 bg-[#120C08]/90 px-5 py-3">
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#F8F1E4]/70">
                  <BadgeCheck size={13} className="text-[#D49A24]" aria-hidden="true" />
                  Membre depuis {formatDate(data.since, { month: "long", year: "numeric" })}
                </p>
                <p className="font-mono text-[10px] font-bold tracking-wider text-[#D49A24]/80">{token}</p>
              </div>
            </div>

            {/* Barre d'actions rapides (Partager / Imprimer / Ouvrir Kènè) */}
            <div className="mt-5 grid grid-cols-2 gap-2.5 print:hidden">
              <button
                type="button"
                onClick={sharePassport}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#251A11] border border-[#D49A24]/35 px-4 text-xs font-bold text-[#F8F1E4] hover:bg-[#2F2116] active:scale-95 transition"
              >
                <Share2 size={14} className="text-[#D49A24]" />
                Partager ce Passeport
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#251A11] border border-[#F8F1E4]/15 px-4 text-xs font-bold text-[#F8F1E4]/90 hover:bg-[#2F2116] active:scale-95 transition"
              >
                <Printer size={14} className="text-[#D49A24]" />
                Exporter / PDF
              </button>
            </div>

            <button
              onClick={close}
              className="mx-auto mt-3 w-full inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#D49A24] via-[#C8951E] to-[#A0522D] px-7 font-heading font-black text-[14px] text-[#140E0A] shadow-lg shadow-[#C8951E]/25 transition hover:brightness-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-[#F8F1E4] print:hidden"
            >
              Entrer dans l&apos;application Kènè <ArrowRight size={16} />
            </button>

            <p className="mt-4 text-center text-[10.5px] leading-relaxed text-[#F8F1E4]/55">
              Confidentialité garantie : aucune photo personnelle ni coordonnée téléphonique n&apos;est exposée sur ce certificat.
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
