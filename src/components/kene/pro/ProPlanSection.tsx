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
  BadgeCheck, Building2, Calculator, CalendarCheck, Check, CheckCircle2, Clock, Crown, Loader2, ShoppingBag, Users,
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

export function ProPlanSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const user = useKene((s) => s.user) as SessionUser; // rôle « pro » garanti ici (isolation 69-a)

  const [data, setData] = useState<SubsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Flow de paiement / renouvellement Pro
  const [sheet, setSheet] = useState(false);
  const [targetPlan, setTargetPlan] = useState<"pro_essentiel" | "pro_complexe">("pro_essentiel");
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

  const essentiel = data?.plans.find((p) => p.id === "pro_essentiel") ?? null;
  const complexe = data?.plans.find((p) => p.id === "pro_complexe") ?? null;
  const activePlan = data?.plan === "pro_complexe" || data?.plan === "pro_essentiel" ? data.plan : null;
  const activeSub = activePlan ? data?.subscription : null;
  const targetDef = targetPlan === "pro_complexe" ? complexe : essentiel;

  /** Confirmation de souscription ou renouvellement Pro (redirection passerelle ou direct) */
  async function confirmPayment() {
    setBusy(true);
    setState("processing");
    try {
      const endpoint = activePlan === targetPlan ? "/api/subscriptions/renew" : "/api/subscriptions/activate";
      const r = await apiPost<{ subscription?: ApiSubscription; checkoutUrl?: string; paymentUrl?: string }>(endpoint, {
        userId: user.id,
        plan: targetPlan,
        source: operator,
      });

      const checkout = r.checkoutUrl || r.paymentUrl;
      if (checkout) {
        toast.info("Redirection vers la passerelle de facturation...", {
          description: `Règlement de l'abonnement ${targetDef?.name ?? ""} (${targetDef ? targetDef.priceFcfa.toLocaleString("fr-FR") : ""} FCFA).`,
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
    <div className="max-w-3xl space-y-4">
      <SectionHeader
        title="Abonnement & facturation"
        sub={`Offres Essentiel / Complexe de ${tenantName} — facturation certifiée`}
      />

      {/* Bannière explicative Pass Découverte 30 jours */}
      <div className="k-card rounded-[22px] p-4 sm:p-5 border-l-4 border-l-gold bg-gold/5 space-y-2.5">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-gold/20 text-gold-text shrink-0">
            <Clock size={19} />
          </span>
          <div>
            <h3 className="font-heading text-sm sm:text-[15px] font-bold text-foreground">
              Pass Découverte 30 jours offert pour tout nouvel établissement
            </h3>
            <p className="text-[11px] sm:text-xs text-muted-foreground">
              Accès complet et immédiat à l&apos;ensemble de la plateforme · 0 FCFA d&apos;engagement · Aucune carte bancaire requise
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2 bg-background/60 rounded-xl p-2.5 border border-border/50">
            <CheckCircle2 size={15} className="text-success shrink-0" />
            <span>Plan Essentiel offert pendant 30 jours</span>
          </div>
          <div className="flex items-center gap-2 bg-background/60 rounded-xl p-2.5 border border-border/50">
            <CheckCircle2 size={15} className="text-success shrink-0" />
            <span>Test grandeur nature Caisse & Agenda</span>
          </div>
          <div className="flex items-center gap-2 bg-background/60 rounded-xl p-2.5 border border-border/50">
            <CheckCircle2 size={15} className="text-success shrink-0" />
            <span>Aucun prélèvement automatique surprise</span>
          </div>
        </div>
      </div>

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

      {/* Statut courant — Essentiel affiché actif pendant le pass découverte */}
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
                {activePlan === "pro_complexe" ? "Complexe" : activePlan === "pro_essentiel" ? "Essentiel" : "Pass Découverte"}
                {activeSub ? (
                  <span className="ml-2 rounded-full bg-gold/15 text-gold-text px-2 py-0.5 text-[10px] font-bold align-middle">Actif</span>
                ) : (
                  <span className="ml-2 rounded-full bg-gold/15 text-gold-text px-2 py-0.5 text-[10px] font-bold align-middle">Offert · Pass Découverte 30j</span>
                )}
              </p>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug">
            <BadgeCheck size={13} className="mt-px shrink-0 text-gold-text" aria-hidden="true" />
            {activeSub
              ? `Ton abonnement est actif jusqu'au ${fmtJJMM(activeSub.expiresAt)} — il se renouvelle chaque mois (facturation certifiée).`
              : "Le plan Essentiel est offert pendant votre Pass Découverte de 30 jours — explorez agenda, CRM, caisse, catalogue et boutique en toute liberté."}
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
          <div className="k-card rounded-[20px] p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-[17px] font-bold">{essentiel.name}</p>
                <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[10px] font-bold text-gold-text">
                  {activeSub?.plan === "pro_essentiel" ? "Actif" : "Offert · Pass Découverte"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{essentiel.tagline}</p>
              <div className="mt-2 rounded-xl bg-muted/40 p-2 text-[11px] text-muted-foreground">
                🎯 <strong>Pour qui ?</strong> Salons indépendants, esthéticiennes installées et instituts de quartier (1 établissement).
              </div>
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
            <div className="mt-5 pt-3 border-t border-border/50 space-y-2">
              <button
                onClick={() => {
                  setTargetPlan("pro_essentiel");
                  setSheet(true);
                  setState("idle");
                }}
                className="w-full h-11 rounded-xl bg-terre/15 hover:bg-terre/25 text-terre border border-terre/30 font-bold text-xs inline-flex items-center justify-center gap-2 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Crown size={15} />
                {activeSub?.plan === "pro_essentiel" ? "Renouveler Essentiel (15 000 FCFA)" : "Régler mon abonnement Essentiel (15 000 FCFA)"}
              </button>
              <p className="text-center text-[10px] text-muted-foreground">
                Sans prélèvement automatique · Facture entreprise déductible
              </p>
            </div>
          </div>

          {/* Complexe — recommandé, CTA upgrade (paiement sécurisé) */}
          <div className="k-card k-glow-gold rounded-[20px] p-4 sm:p-5 relative flex flex-col justify-between">
            <div>
              {complexe.badge && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-bold shadow">{complexe.badge}</span>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-[17px] font-bold">{complexe.name}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{complexe.tagline}</p>
              <div className="mt-2 rounded-xl bg-gold/10 p-2 text-[11px] text-gold-text">
                ⭐ <strong>Pour qui ?</strong> Établissements avec personnel déclaré, cliniques dermo, spas ou réseaux multi-succursales.
              </div>
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
                      <span className="flex-1 font-medium">{perk}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="mt-5 space-y-2">
              <button
                onClick={() => {
                  setTargetPlan("pro_complexe");
                  setSheet(true);
                  setState("idle");
                }}
                className="k-btn-gold h-11 w-full rounded-xl text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95 transition-all"
              >
                <Crown size={15} /> {activePlan === "pro_complexe" ? "Prolonger Complexe (45 000 FCFA)" : "Passer à Complexe (45 000 FCFA)"}
              </button>
              <p className="text-center text-[10px] text-muted-foreground">Facturation sécurisée Mobile Money & Carte.</p>
            </div>
          </div>
        </div>
      ))}

      {/* Matrice comparative détaillée des fonctionnalités */}
      <div className="k-card rounded-[22px] p-4 sm:p-6 space-y-4">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">Tableau comparatif détaillé des fonctionnalités</h3>
          <p className="text-xs text-muted-foreground">Retrouvez en un coup d&apos;œil ce que comprend chaque formule pour votre institut.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2.5 px-3 font-bold text-muted-foreground">Fonctionnalité & Module</th>
                <th className="py-2.5 px-3 font-bold text-center w-28 text-terre">Essentiel</th>
                <th className="py-2.5 px-3 font-bold text-center w-28 text-gold-text">Complexe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr className="bg-muted/20">
                <td colSpan={3} className="py-2 px-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                  1. Gestion Quotidienne & Clientèle
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">Agenda en ligne 24/7 & gestion des rendez-vous</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">Caisse enregistreuse POS tactile & tickets de caisse</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">Fiches clientes CRM 360° & segmentation RFM</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">Stock & Inventaire (séparation Revente vs Cabine)</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">Boutique en ligne Kènè & click-and-collect</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>

              <tr className="bg-muted/20">
                <td colSpan={3} className="py-2 px-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                  2. Expertise Cutanée & Fidélisation
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">Diagnostics cabine assistés par IA Dr Kènè</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">Relances automatiques WhatsApp post-soin</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">Coupons promotionnels & codes de réduction</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
                <td className="py-2.5 px-3 text-center text-success font-bold">✓ Inclus</td>
              </tr>

              <tr className="bg-muted/20">
                <td colSpan={3} className="py-2 px-3 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                  3. Gestion Sociale, Comptable & Réseau
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">
                  <strong>Paie sociale réglementaire</strong> (CNPS Côte d&apos;Ivoire / IPRES & IPM Sénégal)
                </td>
                <td className="py-2.5 px-3 text-center text-muted-foreground font-semibold">— Non inclus</td>
                <td className="py-2.5 px-3 text-center text-gold-text font-bold">⭐ Inclus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">
                  <strong>Comptabilité SYSCOHADA</strong> (Plan OHADA, Journal, Grand Livre, Bilan)
                </td>
                <td className="py-2.5 px-3 text-center text-muted-foreground font-semibold">— Non inclus</td>
                <td className="py-2.5 px-3 text-center text-gold-text font-bold">⭐ Inclus</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-medium">
                  <strong>Multi-établissements</strong> (plusieurs succursales sous un même compte gérante)
                </td>
                <td className="py-2.5 px-3 text-center text-muted-foreground">1 salon unique</td>
                <td className="py-2.5 px-3 text-center text-gold-text font-bold">⭐ Illimité</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Foire aux questions (FAQ) Spéciale Établissements */}
      <div className="k-card rounded-[22px] p-4 sm:p-6 space-y-3.5">
        <h3 className="font-heading text-base font-bold text-foreground">Foire aux questions des Instituts & Salons</h3>
        
        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
            <p className="font-bold text-foreground">⏱️ Combien de temps dure le Pass Découverte offert ?</p>
            <p className="text-muted-foreground leading-relaxed">
              Le Pass Découverte dure <strong>30 jours complets</strong> à compter de l&apos;ouverture de votre compte. Durant ce mois offert, vous bénéficiez de toutes les fonctionnalités pour tester votre caisse, inscrire votre personnel et accueillir vos premières réservations.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
            <p className="font-bold text-foreground">💳 Y a-t-il un prélèvement automatique ou un risque de débit surprise ?</p>
            <p className="text-muted-foreground leading-relaxed">
              <strong>Aucun.</strong> Aucune carte bancaire n&apos;est demandée. À la fin des 30 jours, votre compte ne sera pas débité à votre insu. Vous décidez vous-même de poursuivre en réglant via Mobile Money (Wave, Orange Money, MTN MoMo).
            </p>
          </div>

          <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
            <p className="font-bold text-foreground">🏢 Comment choisir entre le plan Essentiel et le plan Complexe ?</p>
            <p className="text-muted-foreground leading-relaxed">
              Si vous gérez un seul salon indépendant, le plan <strong>Essentiel (15 000 FCFA/mois)</strong> couvre 100% de vos besoins quotidiens. Si vous avez des employées déclarées à la CNPS / IPRES, si vous devez tenir une comptabilité OHADA ou si vous ouvrez plusieurs succursales, le plan <strong>Complexe (45 000 FCFA/mois)</strong> est la formule recommandée.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
            <p className="font-bold text-foreground">🔄 Mes données sont-elles conservées si je tarde à renouveler ?</p>
            <p className="text-muted-foreground leading-relaxed">
              Oui, l&apos;ensemble de votre historique (catalogue de soins, fiches clientes, ventes passées et stocks) reste précieusement conservé et sécurisé en base de données.
            </p>
          </div>
        </div>
      </div>

      {/* Note honnête */}
      <p className="text-[11px] leading-relaxed text-muted-foreground px-1">
        Les offres Kènè+ clientes vivent dans l&apos;app cliente — chaque espace gère son propre abonnement (isolation des comptes).
      </p>

      {/* Sheet upgrade — mobile money SIMULÉ (même flow honnête que cliente) */}
      <Sheet open={sheet} onOpenChange={(o) => { setSheet(o); if (!o) setState("idle"); }}>
        <SheetContent side="bottom" className="max-w-[560px] mx-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">
              {targetPlan === "pro_complexe"
                ? (activePlan === "pro_complexe" ? "Prolonger le plan Complexe" : "Passer au plan Complexe")
                : (activePlan === "pro_essentiel" ? "Renouveler le plan Essentiel" : "Régler l'abonnement Essentiel")}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {state === "idle" && (
              <div className="space-y-4">
                <p className="rounded-xl bg-gold/10 border border-gold/30 px-3 py-2.5 text-[11px] font-semibold text-gold-text leading-snug">
                  Facturation sécurisée en direct par Mobile Money (Wave, Orange, MTN, Moov) & Carte bancaire via passerelle certifiée.
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
                    {targetDef ? targetDef.priceFcfa.toLocaleString("fr-FR") : (targetPlan === "pro_complexe" ? "45 000" : "15 000")} FCFA
                  </span>
                </p>
                <button onClick={confirmPayment} disabled={busy} className="k-btn-gold h-12 w-full rounded-xl text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />}
                  {activePlan === targetPlan ? "Confirmer et renouveler" : "Confirmer et payer"}
                </button>
              </div>
            )}
            {state === "processing" && (
              <div className="flex flex-col items-center gap-4 py-8" role="status" aria-live="polite">
                <div className="grid place-items-center w-16 h-16 rounded-3xl font-heading font-black text-2xl text-[#1A1410]" style={{ backgroundColor: MOMO_OPERATORS.find((o) => o.code === operator)?.color }}>
                  {MOMO_OPERATORS.find((o) => o.code === operator)?.name.charAt(0)}
                </div>
                <p className="font-mono text-2xl font-black tabular-nums">
                  {targetDef ? targetDef.priceFcfa.toLocaleString("fr-FR") : (targetPlan === "pro_complexe" ? "45 000" : "15 000")} FCFA
                </p>
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
