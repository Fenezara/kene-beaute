"use client";
// Kènè Cliente — Boutique : catalogue, fiche produit, panier, checkout Wave/Orange/Wallet simulé
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Check, Loader2, Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { MOMO_OPERATORS } from "@/lib/kene/rfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useKene } from "@/store/kene";
import { KenteWeaveCard } from "@/components/kene/weave/KenteWeaveCard";
import { categoryThread } from "@/components/kene/weave/threads";
import type { ApiOrder, ApiPayment, ApiProduct, ApiWallet } from "./types";
import { SHOP_CATEGORIES } from "./types";
import { EmptyBlock, Stars } from "./bits";

type PayMethod = "wave" | "orange" | "wallet";

export function ShopScreen() {
  const user = useKene((s) => s.user)!;
  const cart = useKene((s) => s.cart);
  const addToCart = useKene((s) => s.addToCart);
  const setCartQty = useKene((s) => s.setCartQty);
  const clearCart = useKene((s) => s.clearCart);

  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<ApiProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [checkout, setCheckout] = useState(false);
  const [wallet, setWallet] = useState<ApiWallet | null>(null);
  const [payState, setPayState] = useState<{ phase: "processing" | "success"; method: PayMethod; amount: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  useEffect(() => {
    apiGet<{ products: ApiProduct[] }>("/api/shop/products")
      .then((r) => setProducts(r.products ?? []))
      .catch(() => setProducts([]));
    apiGet<{ wallet: ApiWallet }>(`/api/wallet?userId=${user.id}`).then((r) => setWallet(r.wallet)).catch(() => {});
  }, [user.id]);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (products ?? []).filter((p) => (!cat || p.category === cat) && (!nq || `${p.name} ${p.botanicals} ${p.description}`.toLowerCase().includes(nq)));
  }, [products, cat, q]);

  /* le fil de la catégorie — la navette l'illumine dans la bande tissée */
  const weaveCaption =
    products === null
      ? "La navette monte le métier…"
      : `${filtered.length} soin${filtered.length > 1 ? "s" : ""}${
          cat ? ` · ${SHOP_CATEGORIES.find((c) => c.id === cat)?.label.toLowerCase() ?? cat}` : " au catalogue"
        }`;

  async function pay(method: PayMethod) {
    setPaying(true);
    try {
      const items = cart.map((l) => ({ productId: l.productId, qty: l.qty }));
      const r = await apiPost<{ order: ApiOrder; payment: ApiPayment | null; paid: boolean }>("/api/orders", { userId: user.id, items, paymentMethod: method });
      const amount = r.order.total;
      if (method !== "wallet" && r.payment) {
        setCheckout(false);
        setPayState({ phase: "processing", method, amount });
        await new Promise((res) => setTimeout(res, 3000));
        const c = await apiPost<{ payment: ApiPayment; order?: ApiOrder; wallet?: ApiWallet }>("/api/payments/confirm", { paymentId: r.payment.id });
        if (c.wallet) setWallet(c.wallet);
      } else {
        setCheckout(false);
        setPayState({ phase: "processing", method: "wallet", amount });
        await new Promise((res) => setTimeout(res, 1200));
      }
      setPayState({ phase: "success", method, amount });
      clearCart();
      const cb = r.order.cashback;
      toast.success(cb > 0 ? `Commande confirmée — cashback ${xof(cb)} crédité sur ton wallet` : "Commande confirmée et payée");
      if (method === "wallet") {
        const w = await apiGet<{ wallet: ApiWallet }>(`/api/wallet?userId=${user.id}`).catch(() => null);
        if (w) setWallet(w.wallet);
      }
    } catch (e) {
      setPayState(null);
      toast.error(e instanceof Error ? e.message : "Paiement impossible");
    } finally {
      setPaying(false);
    }
  }

  const op = (m: PayMethod) => MOMO_OPERATORS.find((o) => o.code === m);

  return (
    <div className="pt-4 pb-2">
      <header className="flex items-center justify-between">
        <h1 className="font-heading font-black text-xl">Boutique Kènè</h1>
        <span className="rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1 uppercase tracking-wide">Cashback 5 %</span>
      </header>

      {/* Le Fil de Kente — hero tissé, le fil de la catégorie s'illumine */}
      <div className="mt-4">
        <KenteWeaveCard highlightIndex={cat ? categoryThread(cat) : -1} caption={weaveCaption} />
      </div>

      {/* Recherche */}
      <div className="mt-3 relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un soin, un botanique…"
          aria-label="Rechercher un produit"
          className="h-12 w-full rounded-2xl border border-border bg-card pl-10 pr-4 text-sm focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      {/* Catégories */}
      <div className="flex gap-2 overflow-x-auto py-3 scrollbar-thin -mx-1 px-1" role="tablist" aria-label="Catégories">
        {SHOP_CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            onClick={() => setCat(c.id)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${cat === c.id ? "bg-primary text-primary-foreground shadow" : "border border-border bg-card text-foreground/80"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grille produits */}
      {products === null ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square rounded-2xl" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyBlock icon={<Search size={22} />} title="Aucun produit trouvé" text="Essaie un autre mot-clé ou une autre catégorie." />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => { setDetail(p); setQty(1); }}
              className="text-left rounded-2xl border border-border bg-card overflow-hidden shadow-sm active:scale-[0.98] transition-transform hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={`${p.name}, ${xof(p.price)}`}
            >
              <img src={p.image} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" />
              <div className="p-2.5">
                <p className="text-[13px] font-semibold leading-tight line-clamp-2 min-h-9">{p.name}</p>
                <p className="text-[10px] text-terre mt-1 truncate">{p.botanicals}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="font-mono text-[13px] font-bold">{xof(p.price)}</span>
                  <Stars rating={p.rating} size={9} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Barre panier sticky au-dessus de la nav */}
      <AnimatePresence>
        {cart.length > 0 && !payState && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="sticky bottom-[84px] z-20 mt-4">
            <button
              onClick={() => setCheckout(true)}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#C8951E] to-[#A0522D] text-[#FFF9EC] shadow-xl flex items-center justify-between px-4 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={`Panier ${cart.length} articles, total ${xof(subtotal)} — commander`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="relative">
                  <ShoppingBag size={20} />
                  <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-0.5 rounded-full bg-[#FFF9EC] text-[#A0520F] text-[9px] font-black grid place-items-center">{cart.reduce((s, l) => s + l.qty, 0)}</span>
                </span>
                {cart.length} article{cart.length > 1 ? "s" : ""}
              </span>
              <span className="font-mono font-black text-base">{xof(subtotal)}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sheet fiche produit */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="bottom" className="max-h-[88vh] rounded-t-3xl px-0 overflow-y-auto max-w-[430px] mx-auto">
          {detail && (
            <>
              <div className="mx-auto sticky top-0 z-10 bg-card/95 backdrop-blur pt-2 pb-1">
                <div className="h-1 w-10 rounded-full bg-muted mx-auto" aria-hidden="true" />
              </div>
              <img src={detail.image} alt={detail.name} className="aspect-square w-full object-cover px-0" />
              <SheetHeader className="px-5 pt-4 text-left">
                <SheetTitle className="font-heading font-black text-lg leading-tight">{detail.name}</SheetTitle>
                <div className="flex items-center gap-2">
                  <Stars rating={detail.rating} />
                  <span className="text-[11px] text-muted-foreground">{detail.rating.toFixed(1)} ({detail.reviewCount} avis)</span>
                </div>
              </SheetHeader>
              <div className="px-5 pb-6 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">{detail.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.botanicals.split(/[,;]/).map((b, i) => (
                    <span key={i} className="rounded-full bg-karite border border-[#C8951E]/30 px-2.5 py-1 text-[10px] font-semibold text-terre">{b.trim()}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xl font-black text-primary">{xof(detail.price)}</p>
                    {detail.compareAt && detail.compareAt > detail.price && <p className="text-[11px] text-muted-foreground line-through">{xof(detail.compareAt)}</p>}
                  </div>
                  <div className="flex items-center gap-3 rounded-full border border-border px-2 py-1.5">
                    <button onClick={() => setQty((n) => Math.max(1, n - 1))} className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted active:scale-90 transition-all" aria-label="Diminuer la quantité"><Minus size={16} /></button>
                    <span className="font-mono font-bold w-5 text-center" aria-live="polite">{qty}</span>
                    <button onClick={() => setQty((n) => Math.min(detail.stock, n + 1))} className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted active:scale-90 transition-all" aria-label="Augmenter la quantité"><Plus size={16} /></button>
                  </div>
                </div>
                <button
                  onClick={() => { addToCart({ productId: detail.id, name: detail.name, price: detail.price, qty, image: detail.image }); toast.success(`${qty} × ${detail.name} ajouté au panier`); setDetail(null); }}
                  className="h-12 w-full rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Plus size={17} /> Ajouter au panier — {xof(detail.price * qty)}
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Sheet checkout */}
      <Sheet open={checkout} onOpenChange={(o) => !o && setCheckout(false)}>
        <SheetContent side="bottom" className="max-h-[90vh] rounded-t-3xl overflow-y-auto max-w-[430px] mx-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading font-black">Ma commande</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="space-y-2">
              {cart.map((l) => (
                <div key={l.productId} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
                  <img src={l.image} alt={l.name} className="h-12 w-12 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-tight line-clamp-2">{l.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{xof(l.price)} × {l.qty}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCartQty(l.productId, l.qty - 1)} className="h-8 w-8 grid place-items-center rounded-full border border-border active:scale-90 transition-transform" aria-label={`Retirer un ${l.name}`}><Minus size={13} /></button>
                    <span className="font-mono text-xs font-bold w-4 text-center">{l.qty}</span>
                    <button onClick={() => setCartQty(l.productId, l.qty + 1)} className="h-8 w-8 grid place-items-center rounded-full border border-border active:scale-90 transition-transform" aria-label={`Ajouter un ${l.name}`}><Plus size={13} /></button>
                    <button onClick={() => setCartQty(l.productId, 0)} className="h-8 w-8 grid place-items-center rounded-full text-destructive hover:bg-destructive/10 active:scale-90 transition-all" aria-label={`Supprimer ${l.name}`}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-muted/60 p-4 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Sous-total</span><span className="font-mono font-semibold">{xof(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cashback estimé (5 %)</span><span className="font-mono font-semibold text-[#3F7D3F]">+{xof(Math.round(subtotal * 0.05))}</span></div>
              <div className="flex justify-between border-t border-border pt-1.5 text-sm"><span className="font-semibold">Total à payer</span><span className="font-mono font-black text-primary">{xof(subtotal)}</span></div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mode de paiement</p>
              <div className="space-y-2">
                {(["wave", "orange"] as const).map((m) => {
                  const o = op(m)!;
                  return (
                    <button key={m} onClick={() => pay(m)} disabled={paying} className="w-full h-12 rounded-xl border-2 bg-card flex items-center gap-3 px-4 font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" style={{ borderColor: o.color }}>
                      <span className="h-7 w-7 rounded-full grid place-items-center font-heading font-black text-[#1A1410] text-xs shrink-0" style={{ backgroundColor: o.color }}>{o.name.charAt(0)}</span>
                      {o.name}
                      <span className="ml-auto text-[10px] font-normal text-muted-foreground">{o.hint}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => pay("wallet")}
                  disabled={paying || (wallet?.balance ?? 0) < subtotal}
                  className="w-full h-12 rounded-xl border-2 border-melanine bg-card flex items-center gap-3 px-4 font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="h-7 w-7 rounded-full grid place-items-center bg-melanine text-[#C8951E] shrink-0 font-heading font-black text-xs">K</span>
                  Wallet Kènè
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{wallet ? xof(wallet.balance) : "…"}</span>
                </button>
                {wallet && wallet.balance < subtotal && <p className="text-[10px] text-destructive text-center">Solde insuffisant — approvisionne ton wallet depuis ton profil.</p>}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Overlay paiement simulé plein écran */}
      <AnimatePresence>
        {payState && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-[#1A1410]/97 backdrop-blur-sm grid place-items-center">
            <div className="w-full max-w-[430px] mx-auto px-6">
              {payState.phase === "processing" ? (
                <div className="flex flex-col items-center gap-5 text-center" aria-live="polite">
                  <div className="grid place-items-center w-20 h-20 rounded-3xl font-heading font-black text-3xl text-[#1A1410] shadow-lg" style={{ backgroundColor: op(payState.method)?.color ?? "#C8951E" }}>
                    {(op(payState.method)?.name ?? "K").charAt(0)}
                  </div>
                  <p className="font-heading font-bold text-lg text-[#F8F1E4]">{op(payState.method)?.name ?? "Wallet Kènè"}</p>
                  <p className="font-mono text-3xl font-black text-[#F8F1E4]">{xof(payState.amount)}</p>
                  <p className="text-[11px] text-[#F8F1E4]/60 font-mono">+{user.phone.slice(0, 9)}···</p>
                  <div className="flex items-center gap-2 text-sm text-[#F8F1E4]/80">
                    <Loader2 size={16} className="animate-spin" /> Traitement en cours…
                  </div>
                  <p className="text-[10px] text-[#F8F1E4]/40">Paiement mobile money simulé — POC</p>
                </div>
              ) : (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="flex flex-col items-center gap-4 text-center py-6">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 15 }} className="grid place-items-center h-20 w-20 rounded-full bg-[#3F7D3F] shadow-xl">
                    <Check size={40} className="text-white" strokeWidth={3} />
                  </motion.span>
                  <p className="font-heading font-black text-xl text-[#F8F1E4]">Paiement réussi</p>
                  <p className="text-xs text-[#F8F1E4]/70 max-w-[280px] leading-relaxed">
                    Commande confirmée. <span className="flex items-center gap-1 justify-center mt-1 text-[#C8951E] font-semibold"><BadgeCheck size={13} /> Cashback {xof(Math.round(payState.amount * 0.05))} crédité sur ton wallet Kènè</span>
                  </p>
                  <button onClick={() => setPayState(null)} className="mt-2 h-12 px-8 rounded-xl bg-primary text-primary-foreground font-semibold shadow active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary">
                    Continuer mes achats
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
