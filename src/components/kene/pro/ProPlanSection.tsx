"use client";
// Kènè Pro — Abonnement & facturation
// Offres Pro : Pro Starter (10 000 F -> 5 000 F), Pro Institut (20 000 F -> 10 000 F), Pro Complexe (30 000 F -> 20 000 F).
// 1er mois 100% gratuit (30 jours, 0 FCFA) avec accès complet à toutes les fonctionnalités.
// Règle de fidélité : tarif dégressif chaque mois. Si un mois est sauté sans payer (+5 jours de grâce Mobile Money),
// le tarif redémarre au Mois 1.
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck, Building2, Calculator, CalendarCheck, Check, CheckCircle2, Clock, Crown, HelpCircle, Loader2, ShieldCheck, UserCheck, Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { MOMO_OPERATORS } from "@/lib/kene/rfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { IconBadge, Shimmer } from "@/components/kene/ui2026";
import { CauriIcon } from "@/components/kene/icons";
import { useKene, type SessionUser } from "@/store/kene";
import { SectionHeader } from "./ui-bits";

/* ─── Contrat API ─── */
interface ApiPlanTier {
  month: number;
  priceFcfa: number;
  label: string;
}

interface ApiPlanDef {
  id: string;
  audience: "client" | "pro";
  name: string;
  tagline: string;
  priceFcfa: number;
  minPriceFcfa: number;
  trialDays: number;
  tiers: ApiPlanTier[];
  perks: string[];
  badge?: string;
  consecutiveMonths?: number;
  currentTierPrice?: number;
  nextTierPrice?: number;
  isTrial?: boolean;
  trialDaysLeft?: number;
}

interface ApiSubscription {
  id: string;
  plan: string;
  status: string;
  priceFcfa: number;
  source: string;
  isTrial?: boolean;
  trialDaysLeft?: number;
  startedAt: string;
  expiresAt: string;
}

interface LoyaltyInfo {
  isTrial: boolean;
  trialDaysLeft: number;
  consecutiveMonths: number;
  currentTierMonth: number;
  nextTierMonth: number;
  currentTierPrice: number;
  nextTierPrice: number;
  floorPrice: number;
  graceDays: number;
}

interface SubsData {
  plan: string;
  plans: ApiPlanDef[];
  quota: { quota: number; used: number; remaining: number; plan: string };
  loyalty?: LoyaltyInfo;
  subscription: ApiSubscription | null;
}

function fmtJJMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ProPlanSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const user = useKene((s) => s.user) as SessionUser;

  const [data, setData] = useState<SubsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Flow de paiement / renouvellement Pro
  const [sheet, setSheet] = useState(false);
  const [targetPlan, setTargetPlan] = useState<"pro_starter" | "pro_institut" | "pro_complexe">("pro_institut");
  const [operator, setOperator] = useState<"wave" | "orange" | "mtn">("wave");
  const [state, setState] = useState<"idle" | "processing" | "done">("idle");
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiGet<SubsData>(`/api/subscriptions?userId=${encodeURIComponent(user.id)}&tenantId=${encodeURIComponent(tenantId)}`)
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : "Abonnement indisponible"));
  }, [user.id, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const starter = data?.plans.find((p) => p.id === "pro_starter") ?? null;
  const institut = data?.plans.find((p) => p.id === "pro_institut" || p.id === "pro_essentiel") ?? null;
  const complexe = data?.plans.find((p) => p.id === "pro_complexe") ?? null;

  const activePlan = data?.plan ?? null;
  const activeSub = data?.subscription ?? null;

  const targetDef =
    targetPlan === "pro_starter"
      ? starter
      : targetPlan === "pro_complexe"
      ? complexe
      : institut;

  const isTrialActive = Boolean(
    activeSub && (activeSub.source === "welcome_offer" || activeSub.source === "welcome_trial" || activeSub.priceFcfa === 0)
  );

  const currentTargetPrice = targetDef?.nextTierPrice ?? targetDef?.priceFcfa ?? 10000;

  /** Confirmation de souscription ou renouvellement Pro */
  async function confirmPayment() {
    setBusy(true);
    setState("processing");
    try {
      const isSamePlan = activePlan === targetPlan || (activePlan === "pro_essentiel" && targetPlan === "pro_institut");
      const endpoint = isSamePlan ? "/api/subscriptions/renew" : "/api/subscriptions/activate";

      const r = await apiPost<{ subscription?: ApiSubscription; checkoutUrl?: string; paymentUrl?: string }>(endpoint, {
        userId: user.id,
        plan: targetPlan,
        source: operator,
      });

      const checkout = r.checkoutUrl || r.paymentUrl;
      if (checkout) {
        toast.info("Redirection vers la passerelle de facturation...", {
          description: `Règlement de l'abonnement ${targetDef?.name ?? ""} (${xof(currentTargetPrice)}).`,
        });
        window.location.href = checkout;
        return;
      }

      if (r.subscription) {
        await new Promise((res) => setTimeout(res, 800));
        setState("done");
        setExpiresAt(r.subscription.expiresAt);
        toast.success(`${targetDef?.name ?? "Abonnement"} validé 🌿`, {
          description: `Actif jusqu'au ${fmtJJMM(r.subscription.expiresAt)} · facturation certifiée`,
        });
        load();
      }
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Paiement impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <SectionHeader
        title="Abonnement & Facturation Établissement"
        sub={`Gestion des formules et de la fidélité pour ${tenantName} — facturation certifiée`}
      />

      {/* Bannière 1er mois 100% gratuit */}
      <div className="k-card rounded-[24px] p-5 border-l-4 border-l-gold bg-gold/5 space-y-3">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-10 w-10 rounded-xl bg-gold/20 text-gold-text shrink-0">
            <Clock size={20} />
          </span>
          <div className="flex-1">
            <h3 className="font-heading text-sm sm:text-base font-bold text-foreground flex items-center gap-2 flex-wrap">
              1er mois 100% gratuit (Pass Découverte 30 jours)
              <span className="rounded-full bg-success/15 text-success px-2.5 py-0.5 text-[10px] font-bold">
                0 FCFA d'engagement
              </span>
            </h3>
            <p className="text-[11.5px] sm:text-xs text-muted-foreground mt-0.5">
              Accès illimité à <strong>100% des fonctionnalités Pro</strong> (Caisse POS, Agenda 24/7, CRM, Stock, SYSCOHADA, Paie CNPS) sans carte bancaire ni prélèvement surprise.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2 bg-background/70 rounded-xl p-2.5 border border-border/50">
            <CheckCircle2 size={15} className="text-success shrink-0" />
            <span>Toutes fonctionnalités débloquées</span>
          </div>
          <div className="flex items-center gap-2 bg-background/70 rounded-xl p-2.5 border border-border/50">
            <CheckCircle2 size={15} className="text-success shrink-0" />
            <span>Tarif dégressif à la fidélité ensuite</span>
          </div>
          <div className="flex items-center gap-2 bg-background/70 rounded-xl p-2.5 border border-border/50">
            <CheckCircle2 size={15} className="text-success shrink-0" />
            <span>Tolérance Mobile Money +5 jours</span>
          </div>
        </div>
      </div>

      {/* Erreur datée + ré-essai */}
      {error && (
        <div role="alert" className="k-card rounded-[20px] p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Abonnement indisponible</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{error}</p>
          </div>
          <button
            onClick={load}
            className="k-btn-gold h-11 px-4 rounded-xl text-primary-foreground text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Statut actuel de l'établissement */}
      {!error && (data === null ? (
        <div className="k-card rounded-[20px] p-4 space-y-3" role="status" aria-busy="true">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-7 w-48" />
          <Shimmer className="h-3 w-full" />
          <span className="sr-only">Chargement de l'abonnement…</span>
        </div>
      ) : (
        <div className="k-card rounded-[22px] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <IconBadge icon={<Crown size={20} />} tone="gold" />
            <div>
              <p className="text-xs font-bold text-muted-foreground">Formule active de l'établissement</p>
              <p className="font-heading text-lg font-black leading-tight flex items-center gap-2 flex-wrap">
                {activePlan === "pro_complexe"
                  ? "Pro Complexe"
                  : activePlan === "pro_starter"
                  ? "Pro Starter"
                  : "Pro Institut"}
                {isTrialActive ? (
                  <span className="rounded-full bg-gold/15 text-gold-text px-2.5 py-0.5 text-[10px] font-bold">
                    Pass Découverte 30j (0 FCFA)
                  </span>
                ) : activeSub ? (
                  <span className="rounded-full bg-success/15 text-success px-2.5 py-0.5 text-[10px] font-bold">
                    Actif · Palier Mois {(data.loyalty?.consecutiveMonths ?? 0) + 1}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-bold">
                    Standard
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs text-muted-foreground">
            {activeSub ? (
              <p>
                Échéance : <strong>{fmtJJMM(activeSub.expiresAt)}</strong>
                {activeSub.trialDaysLeft ? ` (reste ${activeSub.trialDaysLeft}j)` : ""}
              </p>
            ) : (
              <p>Aucun abonnement en cours</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Renouvellement souple par Mobile Money (Wave, Orange, MTN, Moov)
            </p>
          </div>
        </div>
      ))}

      {/* Règle du tarif dégressif à la fidélité */}
      <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Crown size={15} className="text-gold-text" />
          <h4 className="font-heading text-xs font-bold text-foreground">
            Principe de l'Abonnement Dégressif à la Fidélité
          </h4>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Chaque mois d'abonnement renouvelé sans interruption réduit automatiquement votre mensualité jusqu'à son <strong>tarif plancher à vie</strong> (Mois 6+).
          <br />
          ⚠️ <strong>Règle du mois sauté :</strong> Si vous sautez un mois sans payer, une période de grâce de <strong>5 jours (J+5)</strong> est tolérée pour votre réapprovisionnement Mobile Money. Au-delà, le tarif de fidélité se réinitialise au prix de départ du Mois 1.
        </p>
      </div>

      {/* Grille des 3 offres Pro */}
      {!error && (starter === null || institut === null || complexe === null ? (
        <div className="grid gap-4 md:grid-cols-3" role="status" aria-busy="true">
          <div className="k-card rounded-[20px] p-4 space-y-3"><Shimmer className="h-5 w-28" /><Shimmer className="h-8 w-32" /><Shimmer className="h-28 w-full" /></div>
          <div className="k-card rounded-[20px] p-4 space-y-3"><Shimmer className="h-5 w-28" /><Shimmer className="h-8 w-32" /><Shimmer className="h-28 w-full" /></div>
          <div className="k-card rounded-[20px] p-4 space-y-3"><Shimmer className="h-5 w-28" /><Shimmer className="h-8 w-32" /><Shimmer className="h-28 w-full" /></div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 1. Pro Starter */}
          <div className="k-card rounded-[22px] p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-lg font-bold text-foreground">{starter.name}</p>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  Solo & Indépendant
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{starter.tagline}</p>

              {/* Prix */}
              <div className="pt-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-black text-2xl text-gold-text">
                    {starter.nextTierPrice ? starter.nextTierPrice.toLocaleString("fr-FR") : starter.priceFcfa.toLocaleString("fr-FR")}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">FCFA / mois</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Descend de 10 000 F à <strong>5 000 F/mois à vie</strong>
                </p>
              </div>

              {/* Échelle dégressive */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Échelle de fidélité mensuelle</p>
                <div className="grid grid-cols-6 gap-1 text-center">
                  {starter.tiers.filter((t) => t.month > 0).map((t) => (
                    <div key={t.month} className="rounded-lg bg-card p-1 border border-border/40">
                      <p className="text-[9px] font-bold text-muted-foreground">M{t.month}</p>
                      <p className="text-[10px] font-black font-mono text-foreground">{t.priceFcfa / 1000}k</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Avantages */}
              <ul className="space-y-2 text-xs pt-1">
                {starter.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <Check size={14} className="text-success mt-0.5 shrink-0" />
                    <span className="text-[12px]">{perk}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-border/50">
              <button
                onClick={() => {
                  setTargetPlan("pro_starter");
                  setSheet(true);
                  setState("idle");
                }}
                className="w-full h-11 rounded-xl bg-muted/60 hover:bg-muted text-foreground border border-border font-bold text-xs inline-flex items-center justify-center gap-2 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Crown size={14} />
                {activePlan === "pro_starter"
                  ? `Renouveler Starter (${xof(starter.nextTierPrice ?? starter.priceFcfa)})`
                  : `Choisir Pro Starter (${xof(starter.nextTierPrice ?? starter.priceFcfa)})`}
              </button>
            </div>
          </div>

          {/* 2. Pro Institut (Recommandé) */}
          <div className="k-card k-glow-gold rounded-[22px] p-5 flex flex-col justify-between space-y-4 relative border-2 border-gold/50 bg-gold/5">
            <span className="absolute -top-2.5 right-4 rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-bold shadow">
              Recommandé Salons
            </span>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-lg font-bold text-foreground">{institut.name}</p>
                <span className="rounded-full bg-gold/20 text-gold-text px-2.5 py-0.5 text-[10px] font-bold">
                  Multi-praticiennes
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{institut.tagline}</p>

              {/* Prix */}
              <div className="pt-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-black text-2xl text-gold-text">
                    {institut.nextTierPrice ? institut.nextTierPrice.toLocaleString("fr-FR") : institut.priceFcfa.toLocaleString("fr-FR")}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">FCFA / mois</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Descend de 20 000 F à <strong>10 000 F/mois à vie</strong>
                </p>
              </div>

              {/* Échelle dégressive */}
              <div className="rounded-xl border border-gold/30 bg-gold/10 p-2.5 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gold-text">Échelle de fidélité mensuelle</p>
                <div className="grid grid-cols-6 gap-1 text-center">
                  {institut.tiers.filter((t) => t.month > 0).map((t) => (
                    <div key={t.month} className="rounded-lg bg-card p-1 border border-gold/30">
                      <p className="text-[9px] font-bold text-muted-foreground">M{t.month}</p>
                      <p className="text-[10px] font-black font-mono text-gold-text">{t.priceFcfa / 1000}k</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Avantages */}
              <ul className="space-y-2 text-xs pt-1">
                {institut.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <Check size={14} className="text-success mt-0.5 shrink-0" />
                    <span className="text-[12px] font-medium">{perk}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-border/50">
              <button
                onClick={() => {
                  setTargetPlan("pro_institut");
                  setSheet(true);
                  setState("idle");
                }}
                className="w-full h-11 rounded-xl k-btn-gold text-primary-foreground font-bold text-xs inline-flex items-center justify-center gap-2 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary shadow"
              >
                <Crown size={14} />
                {activePlan === "pro_institut" || activePlan === "pro_essentiel"
                  ? `Renouveler Institut (${xof(institut.nextTierPrice ?? institut.priceFcfa)})`
                  : `Choisir Pro Institut (${xof(institut.nextTierPrice ?? institut.priceFcfa)})`}
              </button>
            </div>
          </div>

          {/* 3. Pro Complexe (Excellence) */}
          <div className="k-card rounded-[22px] p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-lg font-bold text-foreground">{complexe.name}</p>
                <span className="rounded-full bg-gold/15 text-gold-text px-2.5 py-0.5 text-[10px] font-bold">
                  Excellence & Réseau
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{complexe.tagline}</p>

              {/* Prix */}
              <div className="pt-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-black text-2xl text-gold-text">
                    {complexe.nextTierPrice ? complexe.nextTierPrice.toLocaleString("fr-FR") : complexe.priceFcfa.toLocaleString("fr-FR")}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">FCFA / mois</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Descend de 30 000 F à <strong>20 000 F/mois à vie</strong>
                </p>
              </div>

              {/* Échelle dégressive */}
              <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Échelle de fidélité mensuelle</p>
                <div className="grid grid-cols-6 gap-1 text-center">
                  {complexe.tiers.filter((t) => t.month > 0).map((t) => (
                    <div key={t.month} className="rounded-lg bg-card p-1 border border-border/40">
                      <p className="text-[9px] font-bold text-muted-foreground">M{t.month}</p>
                      <p className="text-[10px] font-black font-mono text-foreground">{(t.priceFcfa / 1000).toLocaleString("fr-FR")}k</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Avantages */}
              <ul className="space-y-2 text-xs pt-1">
                {complexe.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <Check size={14} className="text-success mt-0.5 shrink-0" />
                    <span className="text-[12px]">{perk}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-border/50">
              <button
                onClick={() => {
                  setTargetPlan("pro_complexe");
                  setSheet(true);
                  setState("idle");
                }}
                className="w-full h-11 rounded-xl bg-terre/15 hover:bg-terre/25 text-terre border border-terre/30 font-bold text-xs inline-flex items-center justify-center gap-2 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Crown size={14} />
                {activePlan === "pro_complexe"
                  ? `Renouveler Complexe (${xof(complexe.nextTierPrice ?? complexe.priceFcfa)})`
                  : `Choisir Pro Complexe (${xof(complexe.nextTierPrice ?? complexe.priceFcfa)})`}
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Matrice comparative détaillée des fonctionnalités */}
      <div className="k-card rounded-[22px] p-5 space-y-4">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">Tableau comparatif détaillé des 3 formules</h3>
          <p className="text-xs text-muted-foreground">Choisissez l'outil parfaitement dimensionné pour votre établissement.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2.5 px-3 font-bold text-muted-foreground">Fonctionnalités & Modules</th>
                <th className="py-2.5 px-3 font-bold text-center w-28 text-foreground">Starter</th>
                <th className="py-2.5 px-3 font-bold text-center w-28 text-gold-text">Institut</th>
                <th className="py-2.5 px-3 font-bold text-center w-28 text-terre">Complexe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr className="bg-muted/20">
                <td colSpan={4} className="py-2 px-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                  1. Capacité & Infrastructure
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">1er mois 100% offert (Pass Découverte)</td>
                <td className="py-2 px-3 text-center text-success font-bold">30j (0 F)</td>
                <td className="py-2 px-3 text-center text-success font-bold">30j (0 F)</td>
                <td className="py-2 px-3 text-center text-success font-bold">30j (0 F)</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Tarif fidélité dégressif (M1 → M6+)</td>
                <td className="py-2 px-3 text-center font-mono font-bold">10k → 5k</td>
                <td className="py-2 px-3 text-center font-mono font-bold text-gold-text">20k → 10k</td>
                <td className="py-2 px-3 text-center font-mono font-bold text-terre">30k → 20k</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Praticiennes & Cabines de soin</td>
                <td className="py-2 px-3 text-center text-muted-foreground">1 Praticienne</td>
                <td className="py-2 px-3 text-center font-bold">Jusqu'à 6</td>
                <td className="py-2 px-3 text-center text-gold-text font-bold">Illimitées</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Nombre d'établissements / succursales</td>
                <td className="py-2 px-3 text-center text-muted-foreground">1 salon</td>
                <td className="py-2 px-3 text-center text-muted-foreground">1 salon</td>
                <td className="py-2 px-3 text-center text-gold-text font-bold">Multi-succursales</td>
              </tr>

              <tr className="bg-muted/20">
                <td colSpan={4} className="py-2 px-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                  2. Gestion Quotidienne & Clientèle
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Agenda en ligne 24/7 & réservations clientes</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Acomptes Mobile Money anti-désistement</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Caisse enregistreuse POS tactile & tickets Bluetooth</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Basique</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Gestion des stocks (Revente vs Cabine)</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Basique</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">CRM avancé & segmentation RFM</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Fiches simples</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>

              <tr className="bg-muted/20">
                <td colSpan={4} className="py-2 px-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                  3. Gestion Sociale & Comptabilité OHADA
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Paie RH certifiée CNPS (CI) / IPRES (SN) & commissions</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Non</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Non</td>
                <td className="py-2 px-3 text-center text-gold-text font-bold">⭐ Inclus</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Comptabilité SYSCOHADA (Clôtures, TVA, Bilan)</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Non</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Non</td>
                <td className="py-2 px-3 text-center text-gold-text font-bold">⭐ Inclus</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-medium">Assistant vocal gérante « Maman Kènè »</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Non</td>
                <td className="py-2 px-3 text-center text-muted-foreground">— Non</td>
                <td className="py-2 px-3 text-center text-gold-text font-bold">⭐ Inclus</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Foire aux questions (FAQ) */}
      <div className="k-card rounded-[22px] p-5 space-y-3.5">
        <h3 className="font-heading text-base font-bold text-foreground">Foire aux questions des Professionnels</h3>
        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
            <p className="font-bold text-foreground">⏱️ Le Pass Découverte de 30 jours donne-t-il accès à TOUTES les fonctionnalités ?</p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Oui, absolument à 100%.</strong> Pendant votre mois d'essai offert de 30 jours (0 FCFA), aucune fonctionnalité n'est bridée. Vous pouvez tester la caisse enregistreuse tactile, l'agenda synchronisé, la paie CNPS, les fiches clientes et la comptabilité SYSCOHADA sans restriction.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
            <p className="font-bold text-foreground">📉 Comment fonctionne la dégressivité des tarifs à la fidélité ?</p>
            <p className="text-muted-foreground leading-relaxed">
              Après les 30 jours offerts, chaque mois renouvelé sans interruption fait baisser votre tarif mensuel jusqu'au tarif plancher à vie (Mois 6+) :
              <br />
              • <strong>Pro Starter :</strong> de 10 000 F à 5 000 F/mois à vie (-1 000 F/mois).
              <br />
              • <strong>Pro Institut :</strong> de 20 000 F à 10 000 F/mois à vie (-2 000 F/mois).
              <br />
              • <strong>Pro Complexe :</strong> de 30 000 F à 20 000 F/mois à vie (-2 500 F/mois, plancher 20 000 F atteint dès le 5e mois).
            </p>
          </div>

          <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
            <p className="font-bold text-foreground">⚠️ Que se passe-t-il si un mois est sauté sans payer ?</p>
            <p className="text-muted-foreground leading-relaxed">
              Pour tenir compte des réalités Mobile Money locales, nous accordons une <strong>période de grâce de 5 jours</strong> après l'échéance. Si vous renouvelez dans ces 5 jours, votre continuité de fidélité est préservée. Au-delà de ces 5 jours sans renouvellement, la continuité est rompue et le tarif redémarre au tarif du Mois 1 lors de votre réactivation. Vos données ne sont jamais supprimées.
            </p>
          </div>
        </div>
      </div>

      {/* Sheet de paiement Mobile Money Pro */}
      <Sheet open={sheet} onOpenChange={(o) => { setSheet(o); if (!o) setState("idle"); }}>
        <SheetContent side="bottom" className="max-w-[560px] mx-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">
              Facturation {targetDef?.name ?? "Abonnement Pro"}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {state === "idle" && (
              <div className="space-y-4">
                <p className="rounded-xl bg-gold/10 border border-gold/30 px-3 py-2.5 text-[11px] font-semibold text-gold-text leading-snug">
                  Facturation sécurisée par Mobile Money (Wave, Orange, MTN, Moov) & Carte bancaire via SasPay/WiniPayer.
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
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Numéro de facturation Mobile Money</p>
                  <p className="k-input h-12 rounded-xl px-3 flex items-center font-mono text-sm tabular-nums">{user.phone}</p>
                </div>
                <p className="flex items-baseline justify-between px-1">
                  <span className="text-xs text-muted-foreground">Montant de facturation</span>
                  <span className="font-mono font-black text-xl tabular-nums text-gold-text">
                    {currentTargetPrice.toLocaleString("fr-FR")} FCFA
                  </span>
                </p>
                <button
                  onClick={confirmPayment}
                  disabled={busy}
                  className="k-btn-gold h-12 w-full rounded-xl text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />}
                  Confirmer et régler ({xof(currentTargetPrice)})
                </button>
              </div>
            )}
            {state === "processing" && (
              <div className="flex flex-col items-center gap-4 py-8" role="status" aria-live="polite">
                <div className="grid place-items-center w-16 h-16 rounded-3xl font-heading font-black text-2xl text-[#1A1410]" style={{ backgroundColor: MOMO_OPERATORS.find((o) => o.code === operator)?.color }}>
                  {MOMO_OPERATORS.find((o) => o.code === operator)?.name.charAt(0)}
                </div>
                <p className="font-mono text-2xl font-black tabular-nums">{currentTargetPrice.toLocaleString("fr-FR")} FCFA</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Traitement en cours…</div>
                <p className="text-[10px] text-muted-foreground font-mono">{user.phone}</p>
              </div>
            )}
            {state === "done" && (
              <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 py-8 text-center">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 15 }} className="grid place-items-center h-16 w-16 rounded-full bg-[#346834]">
                  <Check size={32} className="text-white" strokeWidth={3} />
                </motion.span>
                <p className="font-heading font-black text-lg">{targetDef?.name ?? "Abonnement"} activé 🌿</p>
                <p className="text-xs text-muted-foreground">
                  Actif jusqu&apos;au {expiresAt ? fmtJJMM(expiresAt) : "—"} · facturation certifiée.
                </p>
                <p className="text-[10px] text-muted-foreground">Facturation sécurisée Mobile Money & SYSCOHADA.</p>
                <button onClick={() => setSheet(false)} className="k-btn-gold mt-2 h-11 px-6 rounded-xl text-primary-foreground font-semibold text-sm focus-visible:outline-2 focus-visible:outline-primary">Fermer</button>
              </motion.div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
