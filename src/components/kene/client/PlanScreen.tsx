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
  ArrowLeft, BadgeCheck, Check, CheckCircle2, Clock, Crown, Loader2, ShieldCheck, TrendingUp, Trophy, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { MOMO_OPERATORS } from "@/lib/kene/rfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { IconBadge, Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { CauriIcon } from "@/components/kene/icons";
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
const PLUS_PERK_ICONS = [CauriIcon, TrendingUp, Zap, Trophy] as const;

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

  // ── Flow d'activation & renouvellement (Sheet mobile money) ──
  const [sheet, setSheet] = useState(false);
  const [sheetMode, setSheetMode] = useState<"activate" | "renew">("activate");
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

  /** Confirme l'activation ou le renouvellement → POST activate/renew → passerelle ou succès. */
  async function confirmPayment() {
    setBusy(true);
    setState("processing");
    try {
      const endpoint = sheetMode === "renew" ? "/api/subscriptions/renew" : "/api/subscriptions/activate";
      const r = await apiPost<{ subscription?: ApiSubscription; checkoutUrl?: string; paymentUrl?: string; mode?: string }>(endpoint, {
        userId: user.id,
        plan: "kene_plus",
        source: operator,
      });

      const checkout = r.checkoutUrl || r.paymentUrl;
      if (checkout) {
        toast.info("Redirection vers la passerelle de paiement...", {
          description: "Finalisez votre règlement de 2 500 FCFA par Mobile Money ou Carte 💳",
        });
        window.location.href = checkout;
        return;
      }

      if (r.subscription) {
        // Petite latence pour confirmer le paiement
        await new Promise((res) => setTimeout(res, 800));
        setState("done");
        setExpiresAt(r.subscription.expiresAt);
        toast.success(
          sheetMode === "renew"
            ? "Abonnement renouvelé avec succès"
            : "Kènè+ activé — diagnostics illimités",
          {
            description: `Actif jusqu'au ${fmtJJMM(r.subscription.expiresAt)} · abonnement prolongé`,
          }
        );
        load(); // statut + quota rafraîchis (illimité)
      }
    } catch (e) {
      setState("idle");
      toast.error(
        e instanceof Error
          ? e.message
          : sheetMode === "renew"
            ? "Renouvellement impossible"
            : "Activation impossible"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Reveal className="pt-4 pb-2 flex flex-col gap-6" stagger={0.07}>
      <RevealItem className="self-start">
        <button onClick={() => setClientTab("parametres")} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1" aria-label="Retour aux paramètres">
          <ArrowLeft size={15} /> Retour
        </button>
      </RevealItem>

      {/* Erreur datée + ré-essai en un tap */}
      {error && (
        <RevealItem>
          <section role="alert" className="k-card rounded-[24px] p-4 flex items-center gap-3">
            <IconBadge icon={<CauriIcon size={19} />} tone="bissap" />
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
                <p id="plus-active-t" className="font-heading font-black text-lg leading-tight flex items-center gap-2 flex-wrap">
                  Kènè+ <Check size={17} className="text-success" aria-hidden="true" />
                  {data.subscription.source === "welcome_trial" && (
                    <span className="rounded-full bg-gold/20 text-gold-text px-2.5 py-0.5 text-[10px] font-bold">Pass Découverte 30j</span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {data.subscription.source === "welcome_trial"
                    ? "30 jours offerts pour explorer tous les privilèges · 0 FCFA"
                    : `${plusDef.tagline} · ${xof(plusDef.priceFcfa)}/mois`}
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {plusDef.perks.map((perk, i) => {
                const Icon = PLUS_PERK_ICONS[i] ?? CauriIcon;
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
              {data.subscription.source === "welcome_trial"
                ? `Ton Pass Découverte de 30 jours est actif jusqu'au ${fmtJJMM(data.subscription.expiresAt)} — sans engagement, aucun prélèvement automatique.`
                : `Ton abonnement est actif jusqu'au ${fmtJJMM(data.subscription.expiresAt)} — sans engagement, il expire naturellement à cette date (aucun prélèvement automatique, jamais).`}
            </p>
            {/* t. 138 — renouvellement en deux tapes: la carte J-3 de l'accueil
                et le rappel automatique mènent ici. Jours raccordés (IFRS 15). */}
            <button
              onClick={() => {
                setSheetMode("renew");
                setSheet(true);
                setState("idle");
              }}
              disabled={busy}
              className="k-btn-gold mt-3 h-12 w-full rounded-xl text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={`Renouveler Kènè+ pour 30 jours supplémentaires — ${plusDef ? xof(plusDef.priceFcfa) : "2 500 F"} par mois`}
            >
              <Crown size={16} />
              Renouveler +30 jours · {plusDef ? xof(plusDef.priceFcfa) : "2 500 F"}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              Les 30 jours se raccordent après ton échéance actuelle · paiement sécurisé Mobile Money.
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
                  const Icon = PLUS_PERK_ICONS[i] ?? CauriIcon;
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
                onClick={() => {
                  setSheetMode("activate");
                  setSheet(true);
                  setState("idle");
                }}
                className="k-btn-gold mt-4 h-12 w-full rounded-xl text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Crown size={16} /> Activer Kènè+
              </button>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Paiement sécurisé par Mobile Money (Wave, Orange, MTN, Moov) & Carte.
              </p>
            </div>
          </section>
        </RevealItem>
      ))}

      {/* Tableau comparatif Gratuit vs Kènè+ */}
      <RevealItem>
        <section aria-labelledby="client-plan-comp-t" className="k-card rounded-[24px] p-5 space-y-4">
          <div>
            <h3 id="client-plan-comp-t" className="font-heading font-black text-base">
              Comparatif des formules
            </h3>
            <p className="text-xs text-muted-foreground">
              Choisissez l&apos;accompagnement adapté à votre routine beauté.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-2.5 px-2 font-bold text-muted-foreground">Privilèges beauté</th>
                  <th className="py-2.5 px-2 font-bold text-center w-24 text-muted-foreground">Gratuit</th>
                  <th className="py-2.5 px-2 font-bold text-center w-28 text-gold-text">Kènè+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-2.5 px-2 font-medium">Bilan de peau IA par photo</td>
                  <td className="py-2.5 px-2 text-center text-muted-foreground">1 scan / mois</td>
                  <td className="py-2.5 px-2 text-center text-success font-bold">⚡ Illimité</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2 font-medium">Suivi de l&apos;évolution & courbe d&apos;éclat</td>
                  <td className="py-2.5 px-2 text-center text-muted-foreground">— Non</td>
                  <td className="py-2.5 px-2 text-center text-gold-text font-bold">✓ Inclus</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2 font-medium">Dr Kènè (Assistant dermo-botanique)</td>
                  <td className="py-2.5 px-2 text-center text-muted-foreground">Standard</td>
                  <td className="py-2.5 px-2 text-center text-gold-text font-bold">👑 Prioritaire</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2 font-medium">Passeport de Peau digital (partage salon)</td>
                  <td className="py-2.5 px-2 text-center text-muted-foreground">Basique</td>
                  <td className="py-2.5 px-2 text-center text-gold-text font-bold">✓ Fiche 360°</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2 font-medium">Défis & rituels botaniques personnalisés</td>
                  <td className="py-2.5 px-2 text-center text-muted-foreground">— Non</td>
                  <td className="py-2.5 px-2 text-center text-gold-text font-bold">✓ Inclus</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2 font-medium">Réservation en institut & Boutique en ligne</td>
                  <td className="py-2.5 px-2 text-center text-success font-bold">✓ Inclus</td>
                  <td className="py-2.5 px-2 text-center text-success font-bold">✓ Inclus</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </RevealItem>

      {/* 3 Garanties de sérénité */}
      <RevealItem>
        <div className="grid grid-cols-3 gap-2">
          <div className="k-card rounded-2xl p-3 text-center space-y-1">
            <Clock size={16} className="mx-auto text-gold-text" />
            <p className="text-[11px] font-bold">30 jours</p>
            <p className="text-[9px] text-muted-foreground">Période mensuelle sans engagement</p>
          </div>
          <div className="k-card rounded-2xl p-3 text-center space-y-1">
            <CheckCircle2 size={16} className="mx-auto text-success" />
            <p className="text-[11px] font-bold">Mobile Money</p>
            <p className="text-[9px] text-muted-foreground">Wave · Orange · MTN en 1 clic</p>
          </div>
          <div className="k-card rounded-2xl p-3 text-center space-y-1">
            <ShieldCheck size={16} className="mx-auto text-terre" />
            <p className="text-[11px] font-bold">Zéro surprise</p>
            <p className="text-[9px] text-muted-foreground">Aucun prélèvement automatique</p>
          </div>
        </div>
      </RevealItem>

      {/* Questions fréquentes des utilisatrices */}
      <RevealItem>
        <section aria-labelledby="client-faq-t" className="k-card rounded-[24px] p-5 space-y-3">
          <h3 id="client-faq-t" className="font-heading font-black text-sm">
            Questions fréquentes
          </h3>
          <div className="space-y-2.5 text-xs">
            <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
              <p className="font-bold text-foreground">Suis-je obligée de m&apos;abonner pour utiliser Kènè ?</p>
              <p className="text-muted-foreground leading-relaxed">
                Non ! Vous pouvez utiliser Kènè <strong>gratuitement et sans limite de temps</strong> pour réserver vos soins en institut, acheter vos produits préférés et réaliser 1 diagnostic photo complet par mois.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
              <p className="font-bold text-foreground">Pourquoi choisir Kènè+ à 2 500 FCFA ?</p>
              <p className="text-muted-foreground leading-relaxed">
                Kènè+ est idéal si vous traitez une affection cutanée (taches pigmentaires, acné, sécheresse) et souhaitez suivre les progrès de votre peau semaine après semaine, scanner vos zones dès que nécessaire et bénéficier des conseils illimités du Dr Kènè.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 p-3 bg-muted/10 space-y-1">
              <p className="font-bold text-foreground">Que se passe-t-il à la fin des 30 jours ?</p>
              <p className="text-muted-foreground leading-relaxed">
                Votre pass s&apos;arrête naturellement sans aucun frais supplémentaire. Votre compte redevient gratuit et l&apos;ensemble de votre historique reste sauvegardé.
              </p>
            </div>
          </div>
        </section>
      </RevealItem>

      {/* Note de bas d'écran: l'offre Pro vit sur un compte entreprise dédié. */}
      <RevealItem>
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground px-4">
          L&apos;abonnement Pro (Essentiel / Complexe) est réservé aux comptes entreprise — il se gère depuis l&apos;espace Pro.
        </p>
      </RevealItem>

      {/* Sheet d'activation & renouvellement — Mobile Money & Carte via WiniPayer */}
      <Sheet open={sheet} onOpenChange={(o) => { setSheet(o); if (!o) setState("idle"); }}>
        <SheetContent side="bottom" className="max-w-[560px] mx-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">
              {sheetMode === "renew" ? "Renouveler Kènè+" : "Activer Kènè+"}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {state === "idle" && (
              <div className="space-y-4">
                <p className="rounded-xl bg-gold/10 border border-gold/30 px-3 py-2.5 text-[11px] font-semibold text-gold-text leading-snug">
                  {sheetMode === "renew"
                    ? "Tes 30 jours supplémentaires se raccordent directement à ton échéance (aucun jour perdu)."
                    : "Paiement sécurisé par Mobile Money (Wave, Orange, MTN, Moov) & Carte bancaire via WiniPayer."}
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
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Numéro Mobile Money</p>
                  <p className="k-input h-12 rounded-xl px-3 flex items-center font-mono text-sm tabular-nums">{user.phone}</p>
                </div>
                <p className="flex items-baseline justify-between px-1">
                  <span className="text-xs text-muted-foreground">{sheetMode === "renew" ? "Montant renouvellement (+30 j)" : "Montant mensuel"}</span>
                  <span className="font-mono font-black text-xl tabular-nums text-gold-text">{plusDef ? plusDef.priceFcfa.toLocaleString("fr-FR") : "2 500"} FCFA</span>
                </p>
                <button
                  onClick={confirmPayment}
                  disabled={busy}
                  className="k-btn-gold h-12 w-full rounded-xl text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />}
                  {sheetMode === "renew" ? "Confirmer et renouveler (+30 jours)" : "Confirmer et payer"}
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
                <p className="font-heading font-black text-lg">
                  {sheetMode === "renew" ? "Kènè+ renouvelé" : "Kènè+ activé"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Actif jusqu&apos;au {expiresAt ? fmtJJMM(expiresAt) : "—"} · diagnostics illimités dès maintenant.
                </p>
                <p className="text-[10px] text-muted-foreground">Paiement sécurisé par Mobile Money.</p>
                <button onClick={() => setSheet(false)} className="k-btn-gold mt-2 h-11 px-6 rounded-xl text-primary-foreground font-semibold text-sm focus-visible:outline-2 focus-visible:outline-primary">Fermer</button>
              </motion.div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Reveal>
  );
}
