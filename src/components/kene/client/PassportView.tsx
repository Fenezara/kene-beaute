"use client";
// Kènè — Passeport de Peau, vue publique (t. 82, vague 1) : ce que voit un
// institut (ou une amie) qui scanne le QR — SANS compte, SANS photo. Monté à
// la racine (au-dessus de tous les espaces, y compris le Seuil). Le lien vit
// dans l'URL jusqu'à fermeture par l'utilisatrice (replaceState nettoie).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Loader2, MapPin, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { KenteIdentity } from "@/components/kene/loom/KenteIdentity";

interface PassportData {
  name: string;
  city: string | null;
  fitzpatrick: string | null;
  skinType: string | null;
  allergies: string | null;
  goals: string[];
  lastScan: { zone: string; score: number; date: string } | null;
  threads: number;
  seed: number;
  since: string;
}

const SKIN_LABEL: Record<string, string> = { grasse: "Grasse", seche: "Sèche", mixte: "Mixte", normale: "Normale" };
const ZONE_LABEL: Record<string, string> = {
  visage: "Visage",
  dos: "Dos",
  cuir_chevelu: "Cuir chevelu",
  mains: "Mains",
  barbe: "Barbe",
  naevi: "Grains de beauté",
};

function scoreTone(score: number): string {
  if (score >= 80) return "#3F7D3F";
  if (score >= 60) return "#C8951E";
  if (score >= 40) return "#E07A2B";
  return "#8B1A3B";
}

/* Jeton de l'URL — lu UNE fois côté client via useSyncExternalStore (même
   pattern que useLoomMode) : snapshot serveur null → correction post-
   hydratation SANS setState dans un effet. */
let cachedToken: string | null | undefined;
function readToken(): string | null {
  if (cachedToken === undefined) {
    cachedToken = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("passport");
  }
  return cachedToken;
}
const noopSubscribe = () => () => {};

export function PassportGate() {
  const token = useSyncExternalStore<string | null>(noopSubscribe, readToken, () => null);
  const [data, setData] = useState<PassportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiGet<{ passport: PassportData }>(`/api/passport?token=${encodeURIComponent(token)}`)
      .then((r) => setData(r.passport))
      .catch((e) => setError(e instanceof Error ? e.message : "Passeport introuvable"));
  }, [token]);

  if (!token || closed) return null;

  function close() {
    // Nettoyage de l'URL : le lien QR reste valable (même jeton), seul cet
    // affichage se ferme — on retombe sur l'app normale.
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* historique indisponible — on ferme quand même */
    }
    setClosed(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] overflow-y-auto bg-[#1A1410] text-[#F8F1E4]"
      role="dialog"
      aria-label="Passeport de Peau Kènè"
    >
      {/* Atmosphère — braises chaudes (le public voit la marque, pas l'app) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(62% 48% at 50% 12%, rgba(200,149,30,0.16) 0%, transparent 66%), radial-gradient(48% 40% at 85% 85%, rgba(139,26,59,0.12) 0%, transparent 70%), radial-gradient(40% 34% at 12% 80%, rgba(160,82,45,0.10) 0%, transparent 72%)",
        }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[520px] flex-col px-5 py-8">
        {/* En-tête de marque */}
        <div className="flex items-center justify-between">
          <p className="font-heading text-[19px] font-black tracking-[0.02em]">
            Kènè<span className="ml-2 align-middle text-[9px] font-semibold uppercase tracking-[0.22em] text-[#C8951E]">Beauté mélanoderme</span>
          </p>
          <span className="rounded-full bg-[#6B2416]/70 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.14em]">Lecture publique</span>
        </div>

        {error ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-[#8B1A3B]/20 text-[#E89AB3]">
              <TriangleAlert size={26} />
            </span>
            <p className="mt-5 font-heading text-xl font-black">Passeport introuvable</p>
            <p className="mt-2 max-w-[36ch] text-[13px] leading-relaxed text-[#F8F1E4]/70">{error} — le code a peut-être été régénéré.</p>
            <button onClick={close} className="mt-7 inline-flex h-12 items-center gap-2 rounded-full k-btn-gold px-6 font-heading font-bold text-[14px] text-primary-foreground">
              Découvrir Kènè <ArrowRight size={15} />
            </button>
          </div>
        ) : !data ? (
          <div className="mt-24 flex flex-col items-center gap-4 text-[#F8F1E4]/70">
            <Loader2 size={26} className="animate-spin text-[#C8951E]" />
            <p className="text-sm">Ouverture du passeport…</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-7 flex flex-1 flex-col">
            {/* Carte passeport */}
            <div className="overflow-hidden rounded-[26px] bg-[#241A10]/80 ring-1 ring-[#C8951E]/30 shadow-2xl">
              <div className="kente-band h-[5px] w-full" aria-hidden="true" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#C8951E]">Passeport de Peau</p>
                    <p className="mt-1.5 font-heading text-[26px] font-black leading-tight">{data.name}</p>
                    {data.city && (
                      <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[#F8F1E4]/70">
                        <MapPin size={12} /> {data.city}
                      </p>
                    )}
                  </div>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#C8951E]/15 text-[#C8951E]">
                    <ShieldCheck size={22} />
                  </span>
                </div>

                {/* Profil peau — les 3 tuiles principales */}
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    { k: "Phototype", v: data.fitzpatrick ? `Fitz ${data.fitzpatrick}` : "—" },
                    { k: "Type de peau", v: data.skinType ? (SKIN_LABEL[data.skinType] ?? data.skinType) : "—" },
                    {
                      k: "Allergies",
                      v: data.allergies ? "Signalées" : "Aucune",
                      warn: !!data.allergies,
                    },
                  ].map((tile) => (
                    <div key={tile.k} className="rounded-[14px] bg-[#1A1410]/60 p-2.5 text-center ring-1 ring-[#F8F1E4]/10">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F8F1E4]/55">{tile.k}</p>
                      <p className={`mt-1 text-[13px] font-bold ${tile.warn ? "text-[#E89AB3]" : ""}`}>{tile.v}</p>
                    </div>
                  ))}
                </div>
                {data.allergies && (
                  <p className="mt-2.5 rounded-[12px] bg-[#8B1A3B]/15 px-3 py-2 text-[11.5px] leading-relaxed text-[#F3D9E0]">
                    <TriangleAlert size={12} className="mr-1.5 inline align-[-2px]" aria-hidden="true" />
                    {data.allergies} — à vérifier avant tout soin.
                  </p>
                )}

                {data.goals.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {data.goals.map((g) => (
                      <span key={g} className="rounded-full bg-[#F8F1E4]/10 px-2.5 py-1 text-[10.5px] text-[#F8F1E4]/85">
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Dernier score + kente identitaire */}
                <div className="mt-4 flex items-center gap-3.5 rounded-[16px] bg-[#1A1410]/60 p-3 ring-1 ring-[#F8F1E4]/10">
                  {data.lastScan ? (
                    <>
                      <span
                        className="grid h-14 w-14 shrink-0 place-items-center rounded-full font-heading font-black text-lg"
                        style={{ backgroundColor: scoreTone(data.lastScan.score), color: "#FFF9EC" }}
                        aria-label={`Dernier score ${data.lastScan.score} sur 100`}
                      >
                        {data.lastScan.score}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-bold">
                          Dernier scan · {ZONE_LABEL[data.lastScan.zone] ?? data.lastScan.zone}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#F8F1E4]/65">
                          {formatDate(data.lastScan.date)} — estimation IA, non médicale
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-[12px] text-[#F8F1E4]/70">Aucun scan pour l&apos;instant — profil déclaratif.</p>
                  )}
                </div>

                <div className="mt-3.5">
                  <div className="flex items-center justify-between text-[10.5px] text-[#F8F1E4]/65">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={11} className="text-[#C8951E]" aria-hidden="true" /> Kente identitaire
                    </span>
                    <span className="font-bold text-[#C8951E]">{data.threads} fil{data.threads > 1 ? "s" : ""} d&apos;or</span>
                  </div>
                  <div className="mt-1.5 rounded-[10px] ring-1 ring-[#F8F1E4]/12">
                    <KenteIdentity seed={data.seed} threads={data.threads} compact height={40} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[#F8F1E4]/10 bg-[#1A1410]/70 px-5 py-3">
                <p className="flex items-center gap-1.5 text-[10px] text-[#F8F1E4]/60">
                  <BadgeCheck size={12} className="text-[#C8951E]" aria-hidden="true" />
                  Membre Kènè depuis {formatDate(data.since, { month: "long", year: "numeric" })}
                </p>
                <p className="font-mono text-[9px] tracking-wider text-[#F8F1E4]/40">{token}</p>
              </div>
            </div>

            <p className="mt-4 text-center text-[10.5px] leading-relaxed text-[#F8F1E4]/55">
              Aucune photo n&apos;est partagée. Ce passeport présente le profil peau déclaré et les scores Kènè.
            </p>

            <button
              onClick={close}
              className="mx-auto mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#C8951E] px-7 font-heading font-bold text-[14px] text-[#1A1410] shadow-lg shadow-[#C8951E]/25 transition hover:brightness-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-[#F8F1E4]"
            >
              Entrer dans Kènè <ArrowRight size={15} />
            </button>
            <p className="mt-auto pt-6 text-center text-[9.5px] text-[#F8F1E4]/40">
              Kènè — la beauté mélanoderme, enfin comprise · POC
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
