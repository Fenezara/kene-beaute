"use client";
// Kènè Pro — Abonnement & facturation: offres pro « Essentiel »
// (15 000 FCFA/mois — RDV, clients, catalogue, boutique) et « Complexe »
// (45 000 FCFA/mois — + paie CNPS/IPM, comptabilité SYSCOHADA,
// multi-établissements). Paiement mobile money SIMULÉ (même flow honnête que
// l'app cliente: chips opérateurs, « paiement en mode essai »).
// Sans ligne d'abonnement active, Essentiel est affiché comme « plan
// actuel pendant l'essai » (aucune facturation réelle).
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck, Building2, Calculator, CalendarCheck, Check, Crown, Loader2, ShoppingBag, Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { MOMO_OPERATORS } from "@/lib/kene/rfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { IconBadge, Shimmer } from "@/components/kene/ui2026";
import { useKene, type SessionUser } from "@/store/kene";
import { SectionHeader } from "./ui-bits";

/* ─── Contrat API ( — audience pro) ─── */
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

/** Icônes des perks — mappées par index sur l'ordre stable de PLAN_DEFS. */
const ESSENTIEL_PERK_ICONS = [CalendarCheck, Users, ShoppingBag, ShoppingBag] as const;
const COMPLEXE_PERK_ICONS = [Check, BadgeCheck, Calculator, Building2] as const;

function fmtJJMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ProPlanSection({ tenantName }: { tenantId: string; tenantName: string }) {
  const user = useKene((s) => s.user) as SessionUser; // rôle « pro » garanti ici (isolation 69-a)

  const [data, setData] = useState<SubsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Flow upgrade Complexe (mobile money simulé).
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

  const essentiel = data?.plans.find((p) => p.id === "pro_essentiel") ?? null;
  const complexe = data?.plans.find((p) => p.id === "pro_complexe") ?? null;
  const activePlan = data?.plan === "pro_complexe" || data?.plan === "pro_essentiel" ? data.plan : null;
  const activeSub = activePlan ? data?.subscription : null;

 /** Upgrade vers Complexe — paiement SIMULÉ, POST activate (rôle pro). */
  async function confirmUpgrade() {
    setBusy(true);
    setState("processing");
    try {
      const r = await apiPost<{ subscription: ApiSubscription }>("/api/subscriptions/activate", {
        userId: user.id,
        plan: "pro_complexe",
      });
      await new Promise((res) => setTimeout(res, 1600));
      setState("done");
      setExpiresAt(r.subscription.expiresAt);
      toast.success("Complexe activé — paie & compta débloquées", {
        description: `Actif jusqu'au ${fmtJJMM(r.subscription.expiresAt)} · facturation en mode essai`,
      });
      load();
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Activation impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <SectionHeader
        title="Abonnement & facturation"
        sub={`Offres Essentiel / Complexe de ${tenantName} — facturation en mode essai`}
      />

      {/* Erreur datée + ré-essai (pattern ErrorState maison) */}
      {error && (
        <div role="alert" className="k-card rounded-[20px] p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold">Abonnement indisponible</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{error}</p>
          </div>
          <button onClick={load} className="k-btn-gold h-11 px-4 rounded-xl text-primary-foreground text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Réessayer
          </button>
        </div>
      )}

      {/* Statut courant — Essentiel affiché actif pendant l'essai sans ligne active */}
      {!error && (data === null ? (
        <div className="k-card rounded-[20px] p-4 space-y-3" role="status" aria-busy="true">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-7 w-48" />
          <Shimmer className="h-3 w-full" />
          <span className="sr-only">Chargement de l&apos;abonnement…</span>
        </div>
      ) : (
        <div className="k-card rounded-[20px] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={<Crown size={18} />} tone="gold" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold">Plan actuel</p>
              <p className="font-heading text-[17px] font-bold leading-tight truncate">
                {activePlan === "pro_complexe" ? "Complexe" : activePlan === "pro_essentiel" ? "Essentiel" : "Essentiel"}
                {activeSub ? (
                  <span className="ml-2 rounded-full bg-gold/15 text-gold-text px-2 py-0.5 text-[10px] font-bold align-middle">Actif</span>
                ) : (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground align-middle">Actuel · période d&apos;essai</span>
                )}
              </p>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
            <BadgeCheck size={13} className="mt-px shrink-0 text-gold-text" aria-hidden="true" />
            {activeSub
              ? `Ton abonnement est actif jusqu'au ${fmtJJMM(activeSub.expiresAt)} — il se renouvelle chaque mois (facturation en mode essai).`
              : "Le plan Essentiel est offert pendant la période d'essai — explore agenda, CRM, catalogue et boutique en toute liberté."}
          </p>
        </div>
      ))}

      {/* Comparatif Essentiel / Complexe */}
      {!error && (essentiel === null || complexe === null ? (
        <div className="grid gap-4 md:grid-cols-2" role="status" aria-busy="true" aria-label="Chargement des offres">
          <div className="k-card rounded-[20px] p-4 space-y-3"><Shimmer className="h-5 w-28" /><Shimmer className="h-8 w-32" /><Shimmer className="h-24 w-full" /></div>
          <div className="k-card rounded-[20px] p-4 space-y-3"><Shimmer className="h-5 w-28" /><Shimmer className="h-8 w-32" /><Shimmer className="h-24 w-full" /></div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Essentiel */}
          <div className="k-card rounded-[20px] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-heading text-[17px] font-bold">{essentiel.name}</p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Actuel · période d&apos;essai</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{essentiel.tagline}</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="font-mono font-black text-2xl tabular-nums text-gold-text">{essentiel.priceFcfa.toLocaleString("fr-FR")}</span>
              <span className="text-[11px] font-semibold text-muted-foreground">FCFA / mois</span>
            </p>
            <ul className="mt-4 space-y-2">
              {essentiel.perks.map((perk, i) => {
                const Icon = ESSENTIEL_PERK_ICONS[i] ?? Check;
                return (
                  <li key={perk} className="flex items-center gap-2.5 text-[13px]">
                    <span className="grid place-items-center h-6 w-6 rounded-[9px] bg-terre/10 text-terre shrink-0">
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <span className="flex-1">{perk}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Complexe — recommandé, CTA upgrade (paiement simulé) */}
          <div className="k-card k-glow-gold rounded-[20px] p-4 relative">
            {complexe.badge && (
              <span className="absolute -top-2 right-4 rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-bold shadow">{complexe.badge}</span>
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="font-heading text-[17px] font-bold">{complexe.name}</p>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{complexe.tagline}</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="font-mono font-black text-2xl tabular-nums text-gold-text">{complexe.priceFcfa.toLocaleString("fr-FR")}</span>
              <span className="text-[11px] font-semibold text-muted-foreground">FCFA / mois</span>
            </p>
            <ul className="mt-4 space-y-2">
              {complexe.perks.map((perk, i) => {
                const Icon = COMPLEXE_PERK_ICONS[i] ?? Check;
                return (
                  <li key={perk} className="flex items-center gap-2.5 text-[13px]">
                    <span className="grid place-items-center h-6 w-6 rounded-[9px] bg-gold/15 text-gold-text shrink-0">
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <span className="flex-1">{perk}</span>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={() => { setSheet(true); setState("idle"); }}
              className="k-btn-gold mt-4 h-11 w-full rounded-xl text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Crown size={15} /> {activePlan === "pro_complexe" ? "Prolonger Complexe" : "Passer à Complexe"}
            </button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">Facturation en mode essai — aucun débit réel.</p>
          </div>
        </div>
      ))}

      {/* Note honnête */}
      <p className="text-[11px] leading-relaxed text-muted-foreground px-1">
        Les offres Kènè+ clientes vivent dans l&apos;app cliente — chaque espace gère son propre abonnement (isolation des comptes).
      </p>

      {/* Sheet upgrade — mobile money SIMULÉ (même flow honnête que cliente) */}
      <Sheet open={sheet} onOpenChange={(o) => { setSheet(o); if (!o) setState("idle"); }}>
        <SheetContent side="bottom" className="max-w-[560px] mx-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">Passer à Complexe</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {state === "idle" && (
              <div className="space-y-4">
                <p className="rounded-xl bg-[#6B2416]/10 border border-[#6B2416]/20 px-3 py-2.5 text-[11px] font-semibold text-terre leading-snug">
                  Mode essai : aucun débit réel. La facturation passera au mobile money certifié dès sa mise en service.
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
                  <span className="font-mono font-black text-xl tabular-nums text-gold-text">{complexe ? complexe.priceFcfa.toLocaleString("fr-FR") : "45 000"} FCFA</span>
                </p>
                <button onClick={confirmUpgrade} disabled={busy} className="k-btn-gold h-12 w-full rounded-xl text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />} Confirmer (simulation)
                </button>
              </div>
            )}
            {state === "processing" && (
              <div className="flex flex-col items-center gap-4 py-8" role="status" aria-live="polite">
                <div className="grid place-items-center w-16 h-16 rounded-3xl font-heading font-black text-2xl text-[#1A1410]" style={{ backgroundColor: MOMO_OPERATORS.find((o) => o.code === operator)?.color }}>
                  {MOMO_OPERATORS.find((o) => o.code === operator)?.name.charAt(0)}
                </div>
                <p className="font-mono text-2xl font-black tabular-nums">{complexe ? complexe.priceFcfa.toLocaleString("fr-FR") : "45 000"} FCFA</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Traitement en cours…</div>
                <p className="text-[10px] text-muted-foreground font-mono">{user.phone}</p>
              </div>
            )}
            {state === "done" && (
              <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 py-8 text-center">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 15 }} className="grid place-items-center h-16 w-16 rounded-full bg-[#346834]">
                  <Check size={32} className="text-white" strokeWidth={3} />
                </motion.span>
                <p className="font-heading font-black text-lg">Complexe activé</p>
                <p className="text-xs text-muted-foreground">
                  Actif jusqu&apos;au {expiresAt ? fmtJJMM(expiresAt) : "—"} · paie CNPS/IPM, compta SYSCOHADA et multi-établissements débloqués.
                </p>
                <p className="text-[10px] text-muted-foreground">Facturation en mode essai — aucun débit réel.</p>
                <button onClick={() => setSheet(false)} className="k-btn-gold mt-2 h-11 px-6 rounded-xl text-primary-foreground font-semibold text-sm focus-visible:outline-2 focus-visible:outline-primary">Fermer</button>
              </motion.div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
