"use client";
// Kènè Cliente — « Le Fil du Parrainage » : partage ton code, suis tes filleules,
// échange le code d'une amie (cadeau de bienvenue immédiat, bonus parrain à sa 1ʳᵉ commande).
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Gift, HeartHandshake, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate, xof } from "@/lib/kene/format";
import { FILLEUL_GIFT, PARRAIN_REWARD, referralWaLink, type ReferralSummary } from "@/lib/kene/referral";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTitle } from "./bits";

export function ParrainageCard({ userId, userName, onRedeemed }: { userId: string; userName: string; onRedeemed?: () => void }) {
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet<ReferralSummary>(`/api/referral?userId=${userId}`)
      .then((r) => { setData(r); setFailed(false); })
      .catch(() => setFailed(true));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyCode() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      toast.success("Code copié — colle-le à ton amie 🧡");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible — note le code à la main");
    }
  }

  function shareWhatsapp() {
    if (!data) return;
    window.open(referralWaLink(data.code, userName.split(" ")[0], FILLEUL_GIFT), "_blank", "noopener");
  }

  async function submitCode() {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      toast.error("Le code fait au moins 4 caractères");
      return;
    }
    setBusy(true);
    try {
      const r = await apiPost<{ gift: number; parrain: { name: string } }>("/api/referral/redeem", { userId, code: trimmed });
      toast.success(`Bienvenue dans le fil ! Cadeau de ${xof(r.gift)} crédité 💛`);
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
  const shareLead = /^nouvelle/i.test(userName) || !firstName ? "Ton fil à partager" : `${firstName} partage son fil`;

  return (
    <section aria-labelledby="par-t">
      <SectionTitle icon={<HeartHandshake size={16} />}><span id="par-t">Le Fil du Parrainage</span></SectionTitle>

      {data === null && !failed && (
        <div className="space-y-2">
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-16 rounded-2xl" />
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
        <div className="space-y-3">
          {/* Carte code — le fil à partager */}
          <div className="rounded-3xl bg-[#1A1410] text-[#F8F1E4] p-5 shadow-md relative overflow-hidden">
            <div aria-hidden="true" className="absolute inset-0 kente-band-soft opacity-25" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-70">Ton code à tisser entre amies</p>
              <div className="flex items-center gap-2 mt-1.5">
                <p className="font-mono font-black text-2xl tracking-wide flex-1 truncate" aria-label={`Code parrain ${data.code}`}>{data.code}</p>
                <button onClick={copyCode} aria-label="Copier mon code parrain" className="h-11 w-11 shrink-0 grid place-items-center rounded-xl bg-[#C8951E]/15 border border-[#C8951E]/50 text-[#E3B454] active:scale-90 transition-transform focus-visible:outline-2 focus-visible:outline-[#C8951E]">
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
              <p className="text-[11px] opacity-80 mt-2 leading-relaxed">
                <Sparkles size={11} className="inline -mt-0.5 mr-1 text-[#C8951E]" aria-hidden="true" />
                {shareLead} : ton amie reçoit <span className="font-bold text-[#E3B454]">{xof(FILLEUL_GIFT)}</span> à l&apos;inscription, toi <span className="font-bold text-[#E3B454]">{xof(PARRAIN_REWARD)}</span> dès sa première commande.
              </p>
              <button onClick={shareWhatsapp} className="mt-4 h-11 w-full rounded-xl bg-[#3F7D3F] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-[#3F7D3F]">
                <Send size={16} /> Inviter une amie sur WhatsApp
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-border bg-card p-3 text-center">
              <p className="font-mono font-black text-lg" aria-label={`${data.stats.invitees} filleules`}>{data.stats.invitees}</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mt-0.5">Filleules</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 text-center">
              <p className="font-mono font-black text-lg text-[#3F7D3F]" aria-label={`${data.stats.rewarded} récompensées`}>{data.stats.rewarded}</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mt-0.5">Récompensées</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 text-center">
              <p className="font-mono font-black text-lg text-gold-text" aria-label={`Gains ${data.stats.earnings} FCFA`}>{data.stats.earnings.toLocaleString("fr-FR")}</p>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mt-0.5">Gains FCFA</p>
            </div>
          </div>

          {/* Filleules */}
          {data.invitees.length > 0 && (
            <div className="rounded-2xl border border-border bg-card divide-y divide-border max-h-44 overflow-y-auto scrollbar-thin" role="list" aria-label="Mes filleules">
              {data.invitees.map((f) => (
                <div key={f.id} role="listitem" className="flex items-center gap-3 px-4 py-3">
                  <span className="grid place-items-center h-9 w-9 rounded-full shrink-0 bg-gradient-to-br from-[#C8951E] to-[#A0522D] text-[#FFF9EC] font-heading font-black text-sm" aria-hidden="true">
                    {f.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">Rejointe le {formatDate(f.joinedAt, { day: "numeric", month: "short" })}</p>
                  </div>
                  {f.rewarded ? (
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-bold bg-[#3F7D3F]/15 text-[#3F7D3F] whitespace-nowrap">+{xof(PARRAIN_REWARD)} ✓</span>
                  ) : (
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-bold bg-muted text-muted-foreground whitespace-nowrap">1ʳᵉ commande…</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Parrain (le fil qui m'a reliée) OU échange de code */}
          {data.referredBy ? (
            <div className="rounded-2xl border border-[#C8951E]/40 bg-[#C8951E]/5 p-4 flex items-center gap-3">
              <span className="grid place-items-center h-10 w-10 rounded-full bg-[#C8951E]/15 text-[#C8951E] shrink-0"><Gift size={18} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Parrainée par {data.referredBy.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {data.referredBy.rewarded
                    ? "Ton bonus lui a été offert grâce à ta première commande 💛"
                    : `Elle recevra ${xof(PARRAIN_REWARD)} dès ta première commande.`}
                </p>
              </div>
            </div>
          ) : (
            <button onClick={() => setRedeemOpen(true)} className="w-full rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-left active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-primary">
              <p className="flex items-center gap-2 font-heading font-bold text-sm text-primary"><Gift size={16} /> Une amie t&apos;a donné son code ?</p>
              <p className="text-xs text-muted-foreground mt-1">Échange-le et reçois {xof(FILLEUL_GIFT)} de bienvenue sur ton wallet.</p>
            </button>
          )}
        </div>
      )}

      {/* Sheet échange de code */}
      <Sheet open={redeemOpen} onOpenChange={(o) => { setRedeemOpen(o); if (!o) setCode(""); }}>
        <SheetContent side="bottom" className="max-w-[430px] mx-auto rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">Le code de ton amie</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            <p className="text-xs text-muted-foreground -mt-1">
              Demande-le à celle qui t&apos;a invitée — tu recevras <span className="font-bold text-foreground">{xof(FILLEUL_GIFT)}</span> de bienvenue, et elle <span className="font-bold text-foreground">{xof(PARRAIN_REWARD)}</span> dès ta première commande.
            </p>
            <div>
              <label htmlFor="par-code" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Code parrain</label>
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
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />} Échanger mon code
            </motion.button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
