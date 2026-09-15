"use client";
// Kènè Cliente — Abonnement: offres Kènè+ (2 500 FCFA/mois) et
// état du quota diagnostics (gratuit = 1/mois, Kènè+ = illimité).
// Paiement mobile money SIMULÉ: le Sheet d'activation propose Wave / Orange
// Money / MTN MoMo en pastilles texte stylées (aucune image externe) et
// affiche « paiement en mode essai — aucun débit réel » — l'argent est
// simulé, comme le reste de la version d'essai (honnêteté absolue).
// Libellés 100 % FR direct (i18n hors périmètre ce sprint).
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, BadgeCheck, Check, Crown, Loader2, Sparkles, TrendingUp, Trophy, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { MOMO_OPERATORS } from "@/lib/kene/rfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { IconBadge, Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { useKene, type SessionUser } from "@/store/kene";

/* ─── Contrat API ─── */
interface ApiPlanDef {
  id: string;
  audience: "client" | "pro";
  name: string;
  tagline: string;
  priceFcfa: number;
  perks: string[];
  badge?: string;
}
interface ApiSubscription {
  id: string;
  plan: string;
  status: string;
  priceFcfa: number;
  source: string;
  startedAt: string;
  expiresAt: string;
}
interface SubsData {
  plan: string;
  plans: ApiPlanDef[];
  quota: { quota: number; used: number; remaining: number; plan: string };
  subscription: ApiSubscription | null;
}

/** Icônes des perks Kènè+ — mappées par index sur l'ordre stable de
 * PLAN_DEFS (diagnostics illimités, suivi évolution, priorité, défis). */
const PLUS_PERK_ICONS = [Sparkles, TrendingUp, Zap, Trophy] as const;

/** « 25/03 » à partir d'une date ISO — pas de dépendance locale floue. */
function fmtJJMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PlanScreen() {
  const user = useKene((s) => s.user) as SessionUser;
  const setClientTab = useKene((s) => s.setClientTab);

  // ── Données (statut + plans + quota): squelettes → données / erreur datée ──
  const [data, setData] = useState<SubsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Flow d'activation (Sheet mobile money simulé) ──
  const [sheet, setSheet] = useState(false);
  const [operator, setOperator] = useState<"wave" | "orange" | "mtn">("wave");
  const [state, setState] = useState<"idle" | "processing" | "done">("idle");
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiGet<SubsData>(`/api/subscriptions?userId=${encodeURIComponent(user.id)}`)
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : "Abonnement indisponible"));
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const plusDef = data?.plans.find((p) => p.id === "kene_plus") ?? null;
  const isPlus = data?.plan === "kene_plus";
  const quota = data?.quota;

 /** Confirme l'activation (paiement SIMULÉ) → POST activate → succès. */
  async function confirmActivation() {
    setBusy(true);
    setState("processing");
    try {
      const r = await apiPost<{ subscription: ApiSubscription }>("/api/subscriptions/activate", {
        userId: user.id,
        plan: "kene_plus",
      });
      // Petite latence de « paiement » pour l'illusion de flux momo (simulée).
      await new Promise((res) => setTimeout(res, 1600));
      setState("done");
      setExpiresAt(r.subscription.expiresAt);
      toast.success("Kènè+ activé — diagnostics illimités ✨", {
        description: `Actif jusqu'au ${fmtJJMM(r.subscription.expiresAt)} · paiement en mode essai`,
      });
      load(); // statut + quota rafraîchis (illimité)
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Activation impossible");
    } finally {
      setBusy(false);
    }
  }

  // ── Flow de renouvellement (t. 138 — deux tapes depuis la carte active) ──
  const [renewBusy, setRenewBusy] = useState(false);

  /** Renouvelle +30 jours (paiement SIMULÉ) → POST renew → toast + reload. */
  async function renew() {
    setRenewBusy(true);
    try {
      const r = await apiPost<{ subscription: ApiSubscription }>("/api/subscriptions/renew", {
        userId: user.id,
      });
      toast.success("Abonnement renouvelé — merci 💛", {
        description: `Actif jusqu'au ${fmtJJMM(r.subscription.expiresAt)} · paiement en mode essai`,
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Renouvellement impossible");
    } finally {
      setRenewBusy(false);
    }
  }

  return (
    <Reveal className="pt-4 pb-2 flex flex-col gap-6" stagger={0.07}>
      <RevealItem className="self-start">
        <button onClick={() => setClientTab("accueil")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1" aria-label="Retour à l'accueil">
          <ArrowLeft size={15} /> Accueil
        </button>
      </RevealItem>

      {/* Erreur datée + ré-essai en un tap */}
      {error && (
        <RevealItem>
          <section role="alert" className="k-card rounded-[24px] p-4 flex items-center gap-3">
            <IconBadge icon={<Sparkles size={19} />} tone="bissap" />
            <div className="flex-1">
              <p className="text-xs font-bold">Abonnement indisponible</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{error}</p>
            </div>
            <button onClick={load} className="k-btn-gold h-11 px-4 rounded-xl text-primary-foreground text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Réessayer
            </button>
          </section>
        </RevealItem>
      )}

      {/* Carte STATUT — plan courant + quota diagnostics restant ce mois */}
      {!error && (!quota ? (
        <RevealItem>
          <div className="k-card rounded-[24px] p-5 space-y-3" role="status" aria-busy="true">
            <Shimmer className="h-4 w-28" />
            <Shimmer className="h-8 w-40" />
            <Shimmer className="h-3 w-full" />
            <span className="sr-only">Chargement de ton abonnement…</span>
          </div>
        </RevealItem>
      ) : (
        <RevealItem>
          <section aria-labelledby="sub-status-t" className="k-card overflow-hidden rounded-[24px]">
            <div className="kente-band h-1.5 w-full" aria-hidden="true" />
            <div className="p-5">
              <div className="flex items-center gap-3">
                <IconBadge icon={<Crown size={19} />} tone={isPlus ? "gold" : "terre"} />
                <div className="flex-1 min-w-0">
                  <p id="sub-status-t" className="text-xs font-bold">Plan actuel</p>
                  <p className="font-heading font-black text-[22px] leading-tight">
                    {isPlus ? "Kènè+" : "Gratuit"}
                  </p>
                </div>
                {isPlus ? (
                  <span className="rounded-full bg-gold/15 text-gold-text px-2.5 py-1 text-[10px] font-bold">Actif</span>
                ) : (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">Par défaut</span>
                )}
              </div>
              <p className="mt-3 font-mono text-2xl font-black tabular-nums">
                {isPlus ? (
                  <span className="text-gold-text">∞</span>
                ) : (
                  <span>{quota.remaining}</span>
                )}
                <span className="ml-2 font-sans text-xs font-semibold text-muted-foreground">
                  {isPlus ? "diagnostics — illimité" : quota.remaining > 1 ? "diagnostics restants ce mois" : "diagnostic restant ce mois"}
                </span>
              </p>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
                <BadgeCheck size={13} className="mt-px shrink-0 text-gold-text" aria-hidden="true" />
                {isPlus
                  ? "Kènè+ débloque les diagnostics illimités et le suivi d'évolution de ta peau."
                  : "Le plan gratuit inclut 1 diagnostic par mois — la limite s'applique côté serveur, dès le prochain scan."}
              </p>
            </div>
          </section>
        </RevealItem>
      ))}

      {/* Section Kènè+ — halo or, 4 perks, prix, CTA (ou carte active) */}
      {!error && (plusDef === null ? (
        <RevealItem>
          <div className="k-card rounded-[24px] p-5 space-y-4" role="status" aria-busy="true" aria-label="Chargement des offres">
            <Shimmer className="h-5 w-32" />
            <Shimmer className="h-14 w-full" />
            <Shimmer className="h-9 w-44" />
            <Shimmer className="h-12 w-full rounded-xl" />
          </div>
        </RevealItem>
      ) : isPlus && data?.subscription ? (
 /* Déjà abonnée: carte active (badge, expiration, renouvellement simulé,
 perks cochées) — honnêteté sur le paiement en mode essai. */
        <RevealItem>
          <section aria-labelledby="plus-active-t" className="k-card k-glow-gold rounded-[24px] p-5">
            <div className="flex items-center gap-3">
              <span className="k-glow-gold grid place-items-center h-12 w-12 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC]">
                <Crown size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <p id="plus-active-t" className="font-heading font-black text-lg leading-tight flex items-center gap-2">
                  Kènè+ <Check size={17} className="text-success" aria-hidden="true" />
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {plusDef.tagline} · {xof(plusDef.priceFcfa)}/mois
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {plusDef.perks.map((perk, i) => {
                const Icon = PLUS_PERK_ICONS[i] ?? Sparkles;
                return (
                  <li key={perk} className="flex items-center gap-2.5 text-sm">
                    <span className="grid place-items-center h-7 w-7 rounded-[10px] bg-success/15 text-success shrink-0">
                      <Check size={15} strokeWidth={3} aria-hidden="true" />
                    </span>
                    <span className="flex-1">{perk}</span>
                    <Icon size={15} className="text-muted-foreground/60 shrink-0" aria-hidden="true" />
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-success/10 px-3 py-2.5 text-[11px] text-success leading-snug">
              <BadgeCheck size={14} className="mt-px shrink-0" aria-hidden="true" />
              Ton abonnement est actif jusqu&apos;au {fmtJJMM(data.subscription.expiresAt)} — sans engagement, il expire naturellement à cette date (aucun prélèvement automatique, jamais).
            </p>
            {/* t. 138 — renouvellement en deux tapes: la carte J-3 de l'accueil
                et le rappel automatique mènent ici. Jours raccordés (IFRS 15). */}
            <button
              onClick={() => void renew()}
              disabled={renewBusy}
              className="k-btn-gold mt-3 h-12 w-full rounded-xl text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={`Renouveler Kènè+ pour 30 jours supplémentaires — ${plusDef ? xof(plusDef.priceFcfa) : "2 500 F"} par mois, paiement en mode essai`}
            >
              {renewBusy ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />}
              Renouveler +30 jours · {plusDef ? xof(plusDef.priceFcfa) : "2 500 F"}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              Les 30 jours se raccordent après ton échéance actuelle · paiement mobile money en mode essai, aucun débit réel.
            </p>
          </section>
        </RevealItem>
      ) : (
 /* Offre: carte halo or + perks + prix + CTA k-btn-gold. */
        <RevealItem>
          <section aria-labelledby="plus-offer-t" className="k-card k-glow-gold overflow-hidden rounded-[24px]">
            <div className="kente-band h-1.5 w-full" aria-hidden="true" />
            <div className="p-5">
              <div className="flex items-center gap-3">
                <span className="k-glow-gold grid place-items-center h-12 w-12 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC]">
                  <Crown size={22} />
                </span>
                <div className="flex-1 min-w-0">
                  <p id="plus-offer-t" className="font-heading font-black text-lg leading-tight flex items-center gap-2 flex-wrap">
                    {plusDef.name}
                    {plusDef.badge && <span className="rounded-full bg-gold/15 text-gold-text px-2.5 py-0.5 text-[10px] font-bold">{plusDef.badge}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{plusDef.tagline}</p>
                </div>
              </div>

              <ul className="mt-4 space-y-2.5">
                {plusDef.perks.map((perk, i) => {
                  const Icon = PLUS_PERK_ICONS[i] ?? Sparkles;
                  return (
                    <li key={perk} className="flex items-center gap-2.5 text-sm">
                      <span className="grid place-items-center h-7 w-7 rounded-[10px] bg-gold/15 text-gold-text shrink-0">
                        <Icon size={15} aria-hidden="true" />
                      </span>
                      <span className="flex-1">{perk}</span>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-mono font-black text-3xl tabular-nums text-gold-text">{plusDef.priceFcfa.toLocaleString("fr-FR")}</span>
                <span className="text-xs font-semibold text-muted-foreground">FCFA / mois</span>
              </p>

              <button
                onClick={() => { setSheet(true); setState("idle"); }}
                className="k-btn-gold mt-4 h-12 w-full rounded-xl text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Crown size={16} /> Activer Kènè+
              </button>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Paiement mobile money en mode essai — aucun débit réel.
              </p>
            </div>
          </section>
        </RevealItem>
      ))}

      {/* Note de bas d'écran: l'offre Pro vit sur un compte entreprise dédié. */}
      <RevealItem>
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground px-4">
          L&apos;abonnement Pro (Essentiel / Complexe) est réservé aux comptes entreprise — il se gère depuis l&apos;espace Pro.
        </p>
      </RevealItem>

      {/* Sheet d'activation — mobile money EN MODE ESSAI.
 Opérateurs en pastilles texte stylées (aucune image externe),
 numéro pré-rempli, mention « aucun débit réel » à chaque étape. */}
      <Sheet open={sheet} onOpenChange={(o) => { setSheet(o); if (!o) setState("idle"); }}>
        <SheetContent side="bottom" className="max-w-[560px] mx-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">Activer Kènè+</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {state === "idle" && (
              <div className="space-y-4">
                <p className="rounded-xl bg-[#6B2416]/10 border border-[#6B2416]/20 px-3 py-2.5 text-[11px] font-semibold text-terre leading-snug">
                  Mode essai : aucun débit réel. Le paiement mobile money certifié arrive bientôt.
                </p>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Opérateur</p>
                  <div className="grid grid-cols-3 gap-2">
                    {MOMO_OPERATORS.map((o) => (
                      <button
                        key={o.code}
                        onClick={() => setOperator(o.code as "wave" | "orange" | "mtn")}
                        aria-pressed={operator === o.code}
                        className={`h-12 rounded-xl border-2 flex items-center justify-center gap-1.5 text-[11px] font-bold active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${operator === o.code ? "bg-card" : "border-border bg-card opacity-60"}`}
                        style={{ borderColor: operator === o.code ? o.color : undefined }}
                      >
                        <span className="h-6 w-6 rounded-full grid place-items-center text-[#1A1410] font-black text-[11px]" style={{ backgroundColor: o.color }}>
                          {o.name.charAt(0)}
                        </span>
                        {o.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Numéro débité (simulation)</p>
                  <p className="k-input h-12 rounded-xl px-3 flex items-center font-mono text-sm tabular-nums">{user.phone}</p>
                </div>
                <p className="flex items-baseline justify-between px-1">
                  <span className="text-xs text-muted-foreground">Montant mensuel</span>
                  <span className="font-mono font-black text-xl tabular-nums text-gold-text">{plusDef ? plusDef.priceFcfa.toLocaleString("fr-FR") : "2 500"} FCFA</span>
                </p>
                <button onClick={confirmActivation} disabled={busy} className="k-btn-gold h-12 w-full rounded-xl text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />} Confirmer (simulation)
                </button>
              </div>
            )}
            {state === "processing" && (
              <div className="flex flex-col items-center gap-4 py-8" role="status" aria-live="polite">
                <div className="grid place-items-center w-16 h-16 rounded-3xl font-heading font-black text-2xl text-[#1A1410]" style={{ backgroundColor: MOMO_OPERATORS.find((o) => o.code === operator)?.color }}>
                  {MOMO_OPERATORS.find((o) => o.code === operator)?.name.charAt(0)}
                </div>
                <p className="font-mono text-2xl font-black tabular-nums">{plusDef ? plusDef.priceFcfa.toLocaleString("fr-FR") : "2 500"} FCFA</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Traitement en cours…</div>
                <p className="text-[10px] text-muted-foreground font-mono">{user.phone}</p>
              </div>
            )}
            {state === "done" && (
              <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 py-8 text-center">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 15 }} className="grid place-items-center h-16 w-16 rounded-full bg-[#346834]">
                  <Check size={32} className="text-white" strokeWidth={3} />
                </motion.span>
                <p className="font-heading font-black text-lg">Kènè+ activé</p>
                <p className="text-xs text-muted-foreground">
                  Actif jusqu&apos;au {expiresAt ? fmtJJMM(expiresAt) : "—"} · diagnostics illimités dès maintenant.
                </p>
                <p className="text-[10px] text-muted-foreground">Paiement en mode essai — aucun débit réel.</p>
                <button onClick={() => setSheet(false)} className="k-btn-gold mt-2 h-11 px-6 rounded-xl text-primary-foreground font-semibold text-sm focus-visible:outline-2 focus-visible:outline-primary">Fermer</button>
              </motion.div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Reveal>
  );
}
