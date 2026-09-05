"use client";
// Kènè Cliente — Profil : identité, profil peau rééditable, wallet complet, parrainage — ÉCLAT 2026.
// Les réglages (langue, notifications, sécurité, RGPD, PWA, espace entreprise,
// déconnexion) vivent désormais dans SettingsScreen (t. 69-c) — lien discret
// en pied d'écran vers l'onglet « parametres ».
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, BadgeCheck, Check, Loader2, MapPin,
  Pencil, Phone, Plus, Settings, Sparkles, Wallet as WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/kene/api";
import { formatDate, xof, CASHBACK_RATE } from "@/lib/kene/format";
import { useT } from "@/lib/kene/use-t";
import { MOMO_OPERATORS } from "@/lib/kene/rfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Reveal, RevealItem, Shimmer } from "@/components/kene/ui2026";
import { useKene, type SessionUser } from "@/store/kene";
import type { ApiUser, ApiWallet, ApiWalletTx } from "./types";
import { FITZPATRICK_CARDS, SKIN_GOALS, SKIN_TYPES } from "./types";
import { SectionTitle } from "./bits";
import { ParrainageCard } from "./ParrainageCard";

/** SessionUser + goals (string JSON) renvoyé par PATCH profile */
type ClientUser = SessionUser & { goals?: string | null };

const REASON_LABELS: Record<string, string> = {
  cashback: "Cashback commande",
  referral: "Bonus parrainage",
  topup: "Approvisionnement",
  payment: "Paiement",
  refund: "Remboursement RDV",
};

export function ProfileScreen() {
  const user = useKene((s) => s.user) as ClientUser;
  const setUser = useKene((s) => s.setUser);
  const setClientTab = useKene((s) => s.setClientTab);
  const { t } = useT();

  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(user.name);
  const [city, setCity] = useState(user.city ?? "");
  const [savingId, setSavingId] = useState(false);

  const [fitz, setFitz] = useState(user.fitzpatrick ?? "V");
  const [skinType, setSkinType] = useState(user.skinType ?? "mixte");
  const [allergies, setAllergies] = useState(user.allergies ?? "");
  const [goals, setGoals] = useState<string[]>(() => {
    try {
      return (JSON.parse(user.goals ?? "[]") as { id: string }[]).map((g) => g.id);
    } catch {
      return [];
    }
  });
  const [savingSkin, setSavingSkin] = useState(false);

  const [wallet, setWallet] = useState<ApiWallet | null>(null);
  const [txs, setTxs] = useState<ApiWalletTx[] | null>(null);
  const [topup, setTopup] = useState(false);
  const [amount, setAmount] = useState(5000);
  const [method, setMethod] = useState<"wave" | "orange">("wave");
  const [topupState, setTopupState] = useState<"idle" | "processing" | "done">("idle");
  const [topupBusy, setTopupBusy] = useState(false);

  const loadWallet = useCallback(() => {
    apiGet<{ wallet: ApiWallet; transactions: ApiWalletTx[] }>(`/api/wallet?userId=${user.id}`)
      .then((r) => { setWallet(r.wallet); setTxs(r.transactions ?? []); })
      .catch(() => setTxs([]));
  }, [user.id]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  async function saveIdentity() {
    setSavingId(true);
    try {
      const r = await apiPatch<{ user: ApiUser }>("/api/auth/profile", { userId: user.id, name: name.trim() || undefined, city: city.trim() || undefined });
      setUser({ ...user, ...r.user } as SessionUser);
      setEdit(false);
      toast.success("Profil mis à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setSavingId(false);
    }
  }

  async function saveSkin() {
    setSavingSkin(true);
    try {
      const r = await apiPatch<{ user: ApiUser }>("/api/auth/profile", {
        userId: user.id,
        skinType,
        fitzpatrick: fitz,
        allergies: allergies.trim() || undefined,
        goals: goals.map((id) => ({ id, label: SKIN_GOALS.find((g) => g.id === id)?.label ?? id })),
      });
      setUser({ ...user, ...r.user } as SessionUser);
      toast.success("Profil peau mis à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setSavingSkin(false);
    }
  }

  async function runTopup() {
    setTopupBusy(true);
    setTopupState("processing");
    try {
      const r = await apiPost<{ payment: { id: string; confirmToken?: string } }>("/api/wallet/topup", { userId: user.id, amount, method });
      // Contrat confirmToken (63-b/63-c) : un approvisionnement mobile money en
      // attente porte son jeton — absent, on n'appelle JAMAIS confirm et on
      // revient au formulaire comme après un échec (aucun crédit fantôme).
      const confirmToken = r.payment.confirmToken;
      if (!confirmToken) {
        setTopupState("idle");
        toast.error("Paiement impossible — réessaie dans quelques instants");
        return;
      }
      await new Promise((res) => setTimeout(res, 2600));
      await apiPost("/api/payments/confirm", { paymentId: r.payment.id, confirmToken });
      setTopupState("done");
      toast.success(`${xof(amount)} crédités sur ton wallet`);
      loadWallet();
    } catch (e) {
      setTopupState("idle");
      toast.error(e instanceof Error ? e.message : "Approvisionnement impossible");
    } finally {
      setTopupBusy(false);
    }
  }

  return (
    <>
      <Reveal className="pt-4 pb-2 flex flex-col gap-6" stagger={0.07}>
        <RevealItem className="self-start">
          <button onClick={() => setClientTab("accueil")} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary rounded min-h-10 px-1" aria-label={t("profile.back.aria")}>
            <ArrowLeft size={15} /> {t("tab.home")}
          </button>
        </RevealItem>

      {/* Identité */}
      <RevealItem>
        <section aria-labelledby="me-t" className="k-card overflow-hidden rounded-[24px]">
          <div className="kente-band h-1.5 w-full" aria-hidden="true" />
          <div id="me-t" className="p-5">
            <div className="flex items-center gap-4">
              <span className="k-glow-gold grid place-items-center h-16 w-16 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] font-heading font-black text-2xl">
                {user.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading font-black text-[22px] leading-tight truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 font-mono"><Phone size={12} /> {user.phone}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5"><MapPin size={12} /> {user.city || "Ville non renseignée"}</p>
              </div>
              <button onClick={() => setEdit((v) => !v)} aria-label="Modifier mon profil" className="k-chip h-10 w-10 grid place-items-center rounded-full text-muted-foreground hover:text-primary transition-all focus-visible:outline-2 focus-visible:outline-primary">
                <Pencil size={16} />
              </button>
            </div>
            {edit && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                <div className="mt-4 space-y-3">
                  <div>
                    <label htmlFor="p-name" className="text-[11px] font-semibold text-muted-foreground">Prénom & nom</label>
                    <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className="k-input mt-1 h-11 w-full rounded-xl px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
                  </div>
                  <div>
                    <label htmlFor="p-city" className="text-[11px] font-semibold text-muted-foreground">Ville</label>
                    <input id="p-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Abidjan" className="k-input mt-1 h-11 w-full rounded-xl px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
                  </div>
                  <button onClick={saveIdentity} disabled={savingId} className="k-btn-gold h-11 w-full rounded-xl text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                    {savingId ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Enregistrer
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </section>
      </RevealItem>

      {/* Profil peau */}
      <RevealItem>
        <section aria-labelledby="skin-t">
          <SectionTitle icon={<Sparkles size={16} />}><span id="skin-t">Mon profil peau</span></SectionTitle>
          <div className="k-card rounded-[24px] p-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2">Phototype Fitzpatrick</p>
              <div className="grid grid-cols-3 gap-2">
                {FITZPATRICK_CARDS.map((f) => (
                  <button key={f.id} onClick={() => setFitz(f.id)} aria-pressed={fitz === f.id} className={`rounded-[14px] p-1.5 border-2 text-left active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary ${fitz === f.id ? "border-primary" : "border-transparent"}`}>
                    <div className="h-8 rounded-lg mb-1" style={{ background: f.gradient }} aria-hidden="true" />
                    <p className="text-[11px] font-bold">{f.id}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2">Type de peau</p>
              <div className="flex flex-wrap gap-1.5">
                {SKIN_TYPES.map((t) => (
                  <button key={t.id} onClick={() => setSkinType(t.id)} aria-pressed={skinType === t.id} className={`rounded-full px-3 min-h-10 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-primary ${skinType === t.id ? "k-btn-gold text-primary-foreground" : "k-chip"}`}>{t.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2">Objectifs</p>
              <div className="flex flex-wrap gap-1.5">
                {SKIN_GOALS.map((g) => (
                  <button key={g.id} onClick={() => setGoals((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))} aria-pressed={goals.includes(g.id)} className={`rounded-full px-3 min-h-10 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-primary ${goals.includes(g.id) ? "k-btn-gold text-primary-foreground" : "k-chip"}`}>{g.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="p-all" className="text-[11px] font-semibold text-muted-foreground">Allergies</label>
              <textarea id="p-all" value={allergies} onChange={(e) => setAllergies(e.target.value)} rows={2} placeholder="Ex. huile de coco…" className="k-input mt-1 w-full rounded-xl px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
            </div>
            <button onClick={saveSkin} disabled={savingSkin} className="k-btn-gold h-11 w-full rounded-xl text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {savingSkin ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Mettre à jour mon profil peau
            </button>
          </div>
        </section>
      </RevealItem>

      {/* Wallet */}
      <RevealItem>
        <section aria-labelledby="wa-t">
          <SectionTitle icon={<WalletIcon size={16} />}><span id="wa-t">Mon wallet Kènè</span></SectionTitle>
          <div className="k-glow-gold relative rounded-[24px] bg-[#1A1410] text-[#F8F1E4] p-5 overflow-hidden">
            <div aria-hidden="true" className="absolute inset-0 bogolan-dots opacity-20" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-70">Solde disponible</p>
              <p className="font-mono font-black text-3xl mt-1 tabular-nums">{wallet ? xof(wallet.balance) : "···"}</p>
              <div className="flex items-center gap-2 mt-2 text-[11px] opacity-80">
                <BadgeCheck size={13} className="text-[#C8951E]" /> Cashback {Math.round((wallet?.cashbackRate ?? CASHBACK_RATE) * 100)} % sur chaque commande
              </div>
              <button onClick={() => { setTopup(true); setTopupState("idle"); }} className="k-btn-gold mt-4 h-11 w-full rounded-xl text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-[#C8951E]">
                <Plus size={16} /> Approvisionner
              </button>
            </div>
          </div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-4 mb-2">Dernières transactions</p>
          {txs === null ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Shimmer key={i} className="h-12 rounded-[14px]" />)}</div>
          ) : txs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Aucune transaction pour l&apos;instant.</p>
          ) : (
            <div className="k-card divide-y divide-border max-h-72 overflow-y-auto scrollbar-thin rounded-[24px]">
              {txs.map((t) => {
                const credit = t.type === "credit";
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`grid place-items-center h-8 w-8 rounded-[10px] shrink-0 ${credit ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {credit ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{REASON_LABELS[t.reason] ?? t.reason}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(t.createdAt, { day: "numeric", month: "short", year: "2-digit" })}</p>
                    </div>
                    <span className={`font-mono text-sm font-bold tabular-nums ${credit ? "text-success" : "text-destructive"}`}>
                      {credit ? "+" : "−"}{xof(t.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </RevealItem>

      {/* Parrainage — le fil qui relie les amies */}
      <ParrainageCard userId={user.id} userName={user.name} onRedeemed={loadWallet} />

      {/* Passerelle Paramètres (t. 69-c) — les réglages de l'application
          (apparence, langue, notifications, sécurité, RGPD, PWA, session)
          vivent désormais dans l'onglet dédié : lien discret en pied de profil. */}
      <RevealItem className="self-center pt-1">
        <button onClick={() => setClientTab("parametres")} className="inline-flex items-center gap-1.5 min-h-10 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors rounded focus-visible:outline-2 focus-visible:outline-primary">
          <Settings size={13} /> Paramètres de l&apos;application
        </button>
      </RevealItem>
      </Reveal>

      {/* Sheet approvisionnement */}
      <Sheet open={topup} onOpenChange={(o) => { setTopup(o); if (!o) setTopupState("idle"); }}>
        <SheetContent side="bottom" className="max-w-[560px] mx-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">Approvisionner mon wallet</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            {topupState === "idle" && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Montant</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[2000, 5000, 10000].map((a) => (
                      <button key={a} onClick={() => setAmount(a)} aria-pressed={amount === a} className={`h-12 rounded-xl font-mono text-sm font-bold tabular-nums transition-all focus-visible:outline-2 focus-visible:outline-primary ${amount === a ? "k-btn-gold text-primary-foreground" : "k-chip"}`}>
                        {a.toLocaleString("fr-FR")}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Depuis</p>
                  <div className="grid grid-cols-2 gap-2">
                    {MOMO_OPERATORS.filter((o) => o.code === "wave" || o.code === "orange").map((o) => (
                      <button key={o.code} onClick={() => setMethod(o.code as "wave" | "orange")} aria-pressed={method === o.code} className={`h-12 rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-bold active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${method === o.code ? "bg-card" : "border-border bg-card opacity-60"}`} style={{ borderColor: method === o.code ? o.color : undefined }}>
                        <span className="h-6 w-6 rounded-full grid place-items-center text-[#1A1410] font-black text-[11px]" style={{ backgroundColor: o.color }}>{o.name.charAt(0)}</span>
                        {o.name}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={runTopup} disabled={topupBusy} className="k-btn-gold h-12 w-full rounded-xl text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {topupBusy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Créditer {xof(amount)}
                </button>
              </div>
            )}
            {topupState === "processing" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="grid place-items-center w-16 h-16 rounded-3xl font-heading font-black text-2xl text-[#1A1410]" style={{ backgroundColor: MOMO_OPERATORS.find((o) => o.code === method)?.color }}>
                  {MOMO_OPERATORS.find((o) => o.code === method)?.name.charAt(0)}
                </div>
                <p className="font-mono text-2xl font-black tabular-nums">{xof(amount)}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Traitement en cours…</div>
                <p className="text-[10px] text-muted-foreground font-mono">{user.phone}</p>
              </div>
            )}
            {topupState === "done" && (
              <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 py-8 text-center">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 15 }} className="grid place-items-center h-16 w-16 rounded-full bg-[#346834]">
                  <Check size={32} className="text-white" strokeWidth={3} />
                </motion.span>
                <p className="font-heading font-black text-lg">Wallet crédité</p>
                <p className="text-xs text-muted-foreground">Nouveau solde mis à disposition immédiatement.</p>
                <button onClick={() => setTopup(false)} className="k-btn-gold mt-2 h-11 px-6 rounded-xl text-primary-foreground font-semibold text-sm focus-visible:outline-2 focus-visible:outline-primary">Fermer</button>
              </motion.div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
