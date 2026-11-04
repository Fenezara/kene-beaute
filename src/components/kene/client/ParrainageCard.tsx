"use client";
// Kènè Cliente — « Le Fil du Parrainage »: partage ton code, cumule tes mois d'abonnement
// Kènè+ et débloque les paliers exclusifs (Initié: 5 amies = 1 mois Kènè+).
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Gift, HeartHandshake, Loader2, Send, Trophy, Users, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { useKene, isSavedUser } from "@/store/kene";
import {
  referralWaLink,
  REFERRAL_TIERS,
  FILLEUL_GIFT_DAYS,
  type ReferralSummary,
} from "@/lib/kene/referral";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTitle } from "./bits";

export function ParrainageCard({ userId, userName, onRedeemed }: { userId: string; userName: string; onRedeemed?: () => void }) {
  const user = useKene((s) => s.user);
  const isGuest = !isSavedUser(user);

  const [data, setData] = useState<ReferralSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (isGuest) return;
    apiGet<ReferralSummary>(`/api/referral?userId=${userId}`)
      .then((r) => { setData(r); setFailed(false); })
      .catch(() => setFailed(true));
  }, [userId, isGuest]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyCode() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      toast.success("Code copié — partage-le à tes amies 🌿");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible — note le code à la main");
    }
  }

  function shareWhatsapp() {
    if (!data) return;
    window.open(referralWaLink(data.code, userName.split(" ")[0]), "_blank", "noopener");
  }

  async function submitCode() {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      toast.error("Le code fait au moins 4 caractères");
      return;
    }
    setBusy(true);
    try {
      const r = await apiPost<{ giftDays: number; parrain: { name: string } }>("/api/referral/redeem", { userId, code: trimmed });
      toast.success(`Bienvenue ! ${r.giftDays} jours de Kènè+ viennent d'être activés sur ton compte 💛`);
      setRedeemOpen(false);
      setCode("");
      load();
      onRedeemed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code invalide");
    } finally {
      setBusy(false);
    }
  }

  const firstName = userName.split(" ")[0];

  if (isGuest) {
    return (
      <section aria-labelledby="par-t">
        <SectionTitle icon={<HeartHandshake size={16} />}><span id="par-t">Le Fil du Parrainage</span></SectionTitle>
        <div className="rounded-3xl bg-[#1A1410] text-[#F8F1E4] p-5 shadow-md relative overflow-hidden border border-gold/30">
          <div aria-hidden="true" className="absolute inset-0 kente-band-soft opacity-20" />
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-gold/20 text-gold-text border border-gold/40">
                <Lock size={10} /> Réservé aux Membres
              </span>
              <span className="text-[11px] font-bold text-muted-foreground">Mode Invité</span>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 p-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Votre code personnel</p>
                <p className="font-mono font-black text-xl tracking-widest text-[#FFF9EC] mt-0.5">KENE-••••••</p>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold-text">
                <Lock size={16} />
              </span>
            </div>

            <p className="text-xs text-[#F8F1E4]/90 mt-3 leading-relaxed">
              Offrez <strong className="text-[#E3B454] font-bold">30 jours de Kènè+</strong> à vos amies. Pour chaque palier de 5 amies qui réalisent leur scan, recevez <strong className="text-[#E3B454] font-bold">1 mois d&apos;abonnement Kènè+ offert</strong> (valeur 2 500 FCFA/mois).
            </p>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("kene:open-link-account"));
                }
              }}
              className="mt-4 h-12 w-full rounded-xl k-btn-gold font-black text-xs text-primary-foreground flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-md cursor-pointer"
            >
              <Sparkles size={16} /> Créer mon compte pour débloquer mon code (0 FCFA)
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="par-t">
      <SectionTitle icon={<HeartHandshake size={16} />}><span id="par-t">Le Fil du Parrainage</span></SectionTitle>

      {data === null && !failed && (
        <div className="space-y-2">
          <Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      )}

      {failed && (
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className="text-xs text-muted-foreground">Impossible de charger le parrainage pour l&apos;instant.</p>
          <button onClick={load} className="mt-2 h-9 px-4 rounded-xl border border-border text-xs font-bold active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary">
            Réessayer
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Carte Code & Partage WhatsApp */}
          <div className="rounded-3xl bg-[#1A1410] text-[#F8F1E4] p-5 shadow-md relative overflow-hidden">
            <div aria-hidden="true" className="absolute inset-0 kente-band-soft opacity-20" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#C8951E] font-bold">Ton Cercle de Beauté</p>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#C8951E]/20 text-[#E3B454] border border-[#C8951E]/30">
                  <Trophy size={10} /> {data.stats.currentTier}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <p className="font-mono font-black text-2xl tracking-wide flex-1 truncate text-[#FFF9EC]" aria-label={`Code parrain ${data.code}`}>{data.code}</p>
                <button onClick={copyCode} aria-label="Copier mon code parrain" className="h-11 w-11 shrink-0 grid place-items-center rounded-xl bg-[#C8951E]/15 border border-[#C8951E]/50 text-[#E3B454] active:scale-90 transition-transform focus-visible:outline-2 focus-visible:outline-[#C8951E]">
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>

              <p className="text-[12px] opacity-90 mt-2.5 leading-relaxed">
                Offre <strong className="text-[#E3B454] font-bold">30 jours de Kènè+</strong> à tes amies. 
                Dès <strong className="text-[#E3B454] font-bold">10 amies inscrites</strong>, gagne <strong className="text-[#E3B454] font-bold">1 mois d&apos;abonnement Kènè+ offert</strong> (et jusqu&apos;à 1 an complet !).
              </p>

              <button onClick={shareWhatsapp} className="mt-4 h-12 w-full rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-md focus-visible:outline-2 focus-visible:outline-[#25D366]">
                <Send size={16} /> Inviter mes amies sur WhatsApp
              </button>
            </div>
          </div>

          {/* Jauge de Progression des Paliers */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-[#C8951E]" />
                <span className="text-xs font-bold text-foreground">Objectif : {data.stats.nextTierGoal} amies</span>
              </div>
              <span className="text-xs font-mono font-bold text-primary">{data.stats.totalInvitees} / {data.stats.nextTierGoal} amies</span>
            </div>

            <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#C8951E] to-[#25D366] rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, data.stats.progressPct)}%` }}
              />
            </div>

            {/* Statistiques clés */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-xl bg-muted/50 p-2.5 text-center">
                <p className="font-mono font-black text-xl text-primary">{data.stats.totalInvitees}</p>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Amies Réunies</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-2.5 text-center">
                <p className="font-mono font-black text-xl text-[#25D366]">{data.stats.monthsGranted} mois</p>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Kènè+ Gagnés</p>
              </div>
            </div>
          </div>

          {/* Grille des Paliers Kènè */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Paliers de privilèges</p>
            <div className="space-y-2">
              {REFERRAL_TIERS.map((tier) => {
                const unlocked = data.stats.totalInvitees >= tier.minInvitees;
                return (
                  <div 
                    key={tier.id}
                    className={`flex items-start gap-3 p-2.5 rounded-xl border text-xs transition-colors ${
                      unlocked 
                        ? "border-[#25D366]/40 bg-[#25D366]/5 text-foreground font-medium" 
                        : "border-border/60 bg-muted/20 text-muted-foreground"
                    }`}
                  >
                    <span className={`grid place-items-center h-6 w-6 rounded-full shrink-0 text-[11px] font-bold ${
                      unlocked ? "bg-[#25D366] text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      {unlocked ? "✓" : tier.minInvitees}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className={`font-bold ${unlocked ? "text-[#1b8742]" : "text-foreground"}`}>{tier.name} ({tier.minInvitees} amies)</p>
                        <span className="text-[10px] font-bold">{tier.monthsGranted} {tier.monthsGranted > 1 ? "mois" : "mois"}</span>
                      </div>
                      <p className="text-[11px] opacity-80 mt-0.5">{tier.perks}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Liste des amies ayant rejoint */}
          {data.invitees.length > 0 && (
            <div className="rounded-2xl border border-border bg-card divide-y divide-border max-h-48 overflow-y-auto scrollbar-thin" role="list" aria-label="Mes amies">
              {data.invitees.map((f) => (
                <div key={f.id} role="listitem" className="flex items-center gap-3 px-4 py-3">
                  <span className="grid place-items-center h-8 w-8 rounded-full shrink-0 bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] font-bold text-xs" aria-hidden="true">
                    {f.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">Inscrite le {formatDate(f.joinedAt, { day: "numeric", month: "short" })}</p>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-[#25D366]/15 text-[#1b8742] whitespace-nowrap">
                    30j Kènè+ activés ✓
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Parrain / Marraine OU échange de code */}
          {data.referredBy ? (
            <div className="rounded-2xl border border-[#C8951E]/40 bg-[#C8951E]/5 p-3.5 flex items-center gap-3">
              <span className="grid place-items-center h-9 w-9 rounded-full bg-[#C8951E]/15 text-[#C8951E] shrink-0"><Gift size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Invitée par {data.referredBy.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tu as bénéficié de 30 jours de Kènè+ offerts grâce à son invitation.
                </p>
              </div>
            </div>
          ) : (
            <button onClick={() => setRedeemOpen(true)} className="w-full rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
              <p className="flex items-center gap-2 font-heading font-bold text-sm text-primary"><Gift size={16} /> Une amie t&apos;a partagé son code ?</p>
              <p className="text-xs text-muted-foreground mt-1">Saisis-le pour activer immédiatement 30 jours d&apos;abonnement Kènè+ offerts.</p>
            </button>
          )}
        </div>
      )}

      {/* Sheet échange de code */}
      <Sheet open={redeemOpen} onOpenChange={(o) => { setRedeemOpen(o); if (!o) setCode(""); }}>
        <SheetContent side="bottom" className="max-w-[560px] mx-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">Activer le code d&apos;une amie</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            <p className="text-xs text-muted-foreground -mt-1">
              Saisis le code partagé par ton amie pour débloquer <span className="font-bold text-foreground">30 jours de Kènè+ offerts</span> et accéder à ton diagnostic facial complet.
            </p>
            <div>
              <label htmlFor="par-code" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Code Kènè</label>
              <input
                id="par-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter" && !busy) submitCode(); }}
                placeholder="Ex. MARIAM-KENE"
                autoComplete="off"
                className="mt-1.5 h-12 w-full rounded-xl border border-border bg-background px-3 font-mono text-base font-bold tracking-wider uppercase focus-visible:outline-2 focus-visible:outline-primary"
              />
            </div>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={submitCode}
              disabled={busy}
              className="h-12 w-full rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />} Activer mes 30 jours offerts
            </motion.button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
