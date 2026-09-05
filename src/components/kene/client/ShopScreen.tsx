"use client";
// Kènè Cliente — Boutique : catalogue, fiche produit, panier, checkout Wave/Orange/Wallet simulé
// + « Mes commandes » : historique des commandes enregistrées (consultation par la cliente).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Heart, History, Loader2, Lock, Minus, Plus, Search, ShoppingBag, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof, CASHBACK_RATE, formatDate, formatTime } from "@/lib/kene/format";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { MOMO_OPERATORS } from "@/lib/kene/rfm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useKene } from "@/store/kene";
import { useFavorites } from "@/store/favorites";
import { useSecurity } from "@/store/security";
import { KenteWeaveCard } from "@/components/kene/weave/KenteWeaveCard";
import { categoryThread } from "@/components/kene/weave/threads";
import type { ApiOrder, ApiPayment, ApiProduct, ApiWallet } from "./types";
import { SHOP_CATEGORIES } from "./types";
import { EmptyBlock, Stars, SuccessBurst } from "./bits";
import { FavButton } from "./FavButton";
import { SecureVerify } from "./SecureVerify";

type PayMethod = "wave" | "orange" | "wallet";

/* Coupon validé au checkout (aperçu local — la consommation a lieu à la commande) */
interface AppliedPromo {
  code: string;
  label: string | null;
  discount: number;
  subtotal: number; // panier au moment de la validation (invalidation si changement)
}

export function ShopScreen() {
  const user = useKene((s) => s.user)!;
  const cart = useKene((s) => s.cart);
  const addToCart = useKene((s) => s.addToCart);
  const setCartQty = useKene((s) => s.setCartQty);
  const clearCart = useKene((s) => s.clearCart);

  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false); // filtre « ♥ Favoris » (cumulable avec catégorie + recherche)
  const favs = useFavorites((s) => s.favs);
  const [detail, setDetail] = useState<ApiProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [checkout, setCheckout] = useState(false);
  const [wallet, setWallet] = useState<ApiWallet | null>(null);
  const [payState, setPayState] = useState<{ phase: "processing" | "success"; method: PayMethod; amount: number } | null>(null);
  const [paying, setPaying] = useState(false);

  // Sécurité renforcée (2FA-lite) : si activée, la cliente re-vérifie son code
  // AVANT que le moindre appel de paiement ne parte (voir startPay + SecureVerify).
  const securityEnabled = useSecurity((s) => s.enabled);
  const [pendingPay, setPendingPay] = useState<PayMethod | null>(null);

  // ─── Double-tap « ajout rapide » (TikTok Shop / Instagram) ───
  // 1er tap = ouvre la fiche (avec un délai court annulable) ; 2e tap < 320 ms
  // = ajoute directement au panier + burst animé sur la carte.
  const lastTap = useRef<{ id: string; t: number; timer: number | null }>({ id: "", t: 0, timer: null });
  const [burst, setBurst] = useState<{ id: string; x: number; y: number } | null>(null);

  const onCardTap = (p: ApiProduct, e: React.MouseEvent<HTMLButtonElement>) => {
    const now = Date.now();
    const s = lastTap.current;
    if (s.id === p.id && now - s.t < 320 && s.timer) {
      window.clearTimeout(s.timer);
      lastTap.current = { id: "", t: 0, timer: null };
      addToCart({ productId: p.id, name: p.name, price: p.price, qty: 1, image: p.image });
      haptic(HAPTIC.light);
      const rect = e.currentTarget.getBoundingClientRect();
      setBurst({ id: p.id, x: e.clientX - rect.left, y: e.clientY - rect.top });
      window.setTimeout(() => setBurst(null), 700);
      toast.success(`${p.name} ajouté au panier`, { description: "Astuce : double-tape une carte pour l'ajouter en 1 geste" });
    } else {
      if (s.timer) window.clearTimeout(s.timer);
      const timer = window.setTimeout(() => {
        setDetail(p);
        setQty(1);
      }, 240);
      lastTap.current = { id: p.id, t: now, timer };
    }
  };
  const [promoInput, setPromoInput] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* « Mes commandes » — historique consultable (chargé au montage, rafraîchi
   * après chaque commande réussie : la cliente suit ses données enregistrées). */
  const [view, setView] = useState<"catalogue" | "commandes">("catalogue");
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const refreshOrders = useCallback(() => {
    apiGet<{ orders: ApiOrder[] }>(`/api/orders?userId=${user.id}`)
      .then((r) => setOrders(r.orders ?? []))
      .catch(() => setOrders((prev) => prev ?? []));
  }, [user.id]);

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  /* Coupon invalidé si le panier a changé depuis la validation (remise recalculée
   * sur un autre sous-total) — la cliente re-valide, jamais de surprise serveur. */
  const livePromo = promo && promo.subtotal === subtotal ? promo : null;
  const discount = livePromo?.discount ?? 0;
  const total = subtotal - discount;
  /* taux de cashback réellement appliqué (wallet de la cliente, sinon défaut) */
  const cashbackRate = wallet?.cashbackRate ?? CASHBACK_RATE;

  useEffect(() => {
    apiGet<{ products: ApiProduct[] }>("/api/shop/products")
      .then((r) => setProducts(r.products ?? []))
      .catch(() => setProducts([]));
    apiGet<{ wallet: ApiWallet }>(`/api/wallet?userId=${user.id}`).then((r) => setWallet(r.wallet)).catch(() => {});
    refreshOrders();
  }, [user.id, refreshOrders]);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        (!cat || p.category === cat) &&
        (!favOnly || favs.includes(p.id)) &&
        (!nq || `${p.name} ${p.botanicals} ${p.description}`.toLowerCase().includes(nq))
    );
  }, [products, cat, q, favOnly, favs]);

  /* le fil de la catégorie — la navette l'illumine dans la bande tissée */
  const weaveCaption =
    products === null
      ? "La navette monte le métier…"
      : `${filtered.length} soin${filtered.length > 1 ? "s" : ""}${
          cat ? ` · ${SHOP_CATEGORIES.find((c) => c.id === cat)?.label.toLowerCase() ?? cat}` : " au catalogue"
        }${favOnly ? " · favoris" : ""}`;

  /* Applique un code promo : aperçu de remise sans consommer le coupon
   * (la consommation a lieu à la commande — toutes les gardes côté serveur). */
  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code || promoChecking) return;
    setPromoChecking(true);
    try {
      const r = await apiPost<{ ok: true; coupon: { code: string; label: string | null }; discount: number; total: number }>(
        "/api/coupons/validate",
        { code, userId: user.id, subtotal }
      );
      setPromo({ code: r.coupon.code, label: r.coupon.label, discount: r.discount, subtotal });
      setPromoInput("");
      toast.success(`Code ${r.coupon.code} appliqué`, { description: `Remise de ${xof(r.discount)} déduite du total.` });
    } catch (e) {
      setPromo(null);
      toast.error(e instanceof Error ? e.message : "Code promo invalide");
    } finally {
      setPromoChecking(false);
    }
  }

  /** Passerelle paiement : vérification d'identité par code si la sécurité
   *  renforcée est active — le paiement initialement prévu (pay) n'est lancé
   *  qu'une fois le code confirmé ; annulé sinon, rien n'est engagé. */
  function startPay(method: PayMethod) {
    if (securityEnabled) {
      haptic(HAPTIC.tap);
      setPendingPay(method);
      return;
    }
    void pay(method);
  }

  async function pay(method: PayMethod) {
    setPaying(true);
    try {
      const items = cart.map((l) => ({ productId: l.productId, qty: l.qty }));
      const r = await apiPost<{ order: ApiOrder; payment: ApiPayment | null; paid: boolean }>("/api/orders", {
        userId: user.id,
        items,
        paymentMethod: method,
        ...(livePromo ? { couponCode: livePromo.code } : {}),
      });
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
      haptic(HAPTIC.success);
      clearCart();
      setPromo(null); // le coupon est consommé : remise à zéro pour la prochaine commande
      void refreshOrders(); // la nouvelle commande apparaît dans « Mes commandes »
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
        <span className="rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1 uppercase tracking-wide">Cashback {Math.round(cashbackRate * 100)} %</span>
      </header>

      {/* Bascule Catalogue ↔ Mes commandes — la cliente consulte ses données */}
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1" role="tablist" aria-label="Vues boutique">
        <button
          role="tab"
          aria-selected={view === "catalogue"}
          onClick={() => setView("catalogue")}
          className={`h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary ${view === "catalogue" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ShoppingBag size={14} aria-hidden="true" /> Catalogue
        </button>
        <button
          role="tab"
          aria-selected={view === "commandes"}
          onClick={() => setView("commandes")}
          className={`h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary ${view === "commandes" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <History size={14} aria-hidden="true" /> Mes commandes{orders !== null && orders.length > 0 ? ` (${orders.length})` : ""}
        </button>
      </div>

      {view === "commandes" ? (
        <OrdersView orders={orders} onRefresh={refreshOrders} onShop={() => setView("catalogue")} />
      ) : (
        <>
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

      {/* Filtres : catégories + favoris (bascules aria-pressed, cumulables) */}
      <div className="flex gap-2 overflow-x-auto py-3 scrollbar-thin -mx-1 px-1" role="group" aria-label="Filtres de la boutique">
        {SHOP_CATEGORIES.map((c) => (
          <button
            key={c.id}
            aria-pressed={cat === c.id}
            onClick={() => setCat(c.id)}
            className={`shrink-0 rounded-full px-3.5 min-h-10 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${cat === c.id ? "bg-primary text-primary-foreground shadow" : "border border-border bg-card text-foreground/80"}`}
          >
            {c.label}
          </button>
        ))}
        {/* ♥ Favoris — filtre cumulable, badge count si ≥ 1 */}
        <button
          aria-pressed={favOnly}
          onClick={() => { setFavOnly((v) => !v); haptic(HAPTIC.tap); }}
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-10 text-xs font-semibold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${favOnly ? "bg-primary text-primary-foreground shadow" : "border border-border bg-card text-foreground/80"}`}
        >
          <Heart size={13} fill={favOnly ? "currentColor" : "none"} aria-hidden="true" />
          Favoris{favs.length > 0 ? ` · ${favs.length}` : ""}
        </button>
      </div>

      {/* Grille produits */}
      {products === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square rounded-2xl" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        favOnly && favs.length === 0 ? (
          <EmptyBlock
            icon={<Heart size={22} />}
            title="Aucun favori pour l'instant"
            text="Touche le cœur sur un soin pour le retrouver ici."
          />
        ) : favOnly ? (
          <EmptyBlock
            icon={<Heart size={22} />}
            title="Aucun favori dans cette sélection"
            text="Tes favoris ne passent pas ce filtre — essaie une autre catégorie ou efface la recherche."
            cta={
              <button
                onClick={() => { setCat(""); setQ(""); }}
                className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary"
              >
                Voir tous mes favoris
              </button>
            }
          />
        ) : (
          <EmptyBlock icon={<Search size={22} />} title="Aucun produit trouvé" text="Essaie un autre mot-clé ou une autre catégorie." />
        )
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((p) => (
            /* Wrapper relatif : le cœur est un FRÈRE de la carte (jamais de <button>
               imbriqué — HTML valide, focus/a11y propres), posé sur l'image en absolu. */
            <div key={p.id} className="relative">
              <button
                onClick={(e) => onCardTap(p, e)}
                className="relative block w-full text-left rounded-2xl border border-border bg-card overflow-hidden shadow-sm active:scale-[0.98] transition-transform hover:border-primary/40 touch-manipulation focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={`${p.name}, ${xof(p.price)} — appuie une fois pour la fiche, deux fois pour l'ajouter au panier`}
              >
                {/* Burst double-tap — panier kente qui jaillit sous le doigt */}
                {burst?.id === p.id && (
                  <motion.span
                    aria-hidden="true"
                    initial={{ scale: 0.3, opacity: 0.95 }}
                    animate={{ scale: 1.7, opacity: 0 }}
                    transition={{ duration: 0.65, ease: "easeOut" }}
                    className="pointer-events-none absolute z-20"
                    style={{ left: burst.x, top: burst.y }}
                  >
                    <span className="grid place-items-center h-20 w-20 -ml-10 -mt-10 rounded-full bg-[#FFF9EC]/30 backdrop-blur-[2px] shadow-xl">
                      <span className="grid place-items-center h-12 w-12 rounded-full bg-gradient-to-br from-[#A0522D] to-[#8B1A3B] shadow-lg">
                        <ShoppingBag size={22} className="text-[#FFF9EC]" />
                      </span>
                    </span>
                  </motion.span>
                )}
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
              <FavButton variant="card" productId={p.id} productName={p.name} />
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Barre panier sticky au-dessus de la nav */}
      <AnimatePresence>
        {cart.length > 0 && !payState && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="sticky bottom-[84px] z-20 mt-4">
            <button
              onClick={() => { setCheckout(true); haptic(HAPTIC.tap); }}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#A0522D] to-[#8B1A3B] text-[#FFF9EC] shadow-xl flex items-center justify-between px-4 active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={`Panier ${cart.length} articles, total ${xof(subtotal)} — commander`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="relative" aria-hidden="true">
                  <ShoppingBag size={20} />
                  <span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-0.5 rounded-full bg-[#FFF9EC] text-[#A0520F] text-[9px] font-black grid place-items-center">{cart.reduce((s, l) => s + l.qty, 0)}</span>
                </span>
                <span aria-hidden="true">{cart.length} article{cart.length > 1 ? "s" : ""}</span>
              </span>
              <span className="font-mono font-black text-base" aria-hidden="true">{xof(subtotal)}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sheet fiche produit */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="bottom" className="max-h-[88vh] rounded-t-3xl px-0 overflow-y-auto max-w-[560px] mx-auto">
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
                {/* Favori — action secondaire de la fiche produit (persistante, par appareil) */}
                <FavButton variant="inline" productId={detail.id} productName={detail.name} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Sheet checkout */}
      <Sheet open={checkout} onOpenChange={(o) => !o && setCheckout(false)}>
        <SheetContent side="bottom" className="max-h-[90vh] rounded-t-3xl overflow-y-auto max-w-[560px] mx-auto">
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

            {/* Code promo — l'aperçu vit côté serveur (lib/kene/coupons) */}
            {livePromo ? (
              <div className="rounded-2xl border border-[#3F7D3F]/30 bg-[#3F7D3F]/[0.06] p-3.5 flex items-center gap-3" aria-live="polite">
                <span className="grid place-items-center h-9 w-9 rounded-full bg-[#3F7D3F]/15 text-[#3F7D3F] shrink-0">
                  <Tag size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold font-mono tracking-wide">{livePromo.code}</p>
                  <p className="text-[11px] text-[#3F7D3F] leading-tight">
                    {livePromo.label ? `${livePromo.label} · ` : ""}−{xof(livePromo.discount)}
                  </p>
                </div>
                <button
                  onClick={() => setPromo(null)}
                  aria-label={`Retirer le code ${livePromo.code}`}
                  className="h-8 w-8 grid place-items-center rounded-full text-muted-foreground hover:bg-muted active:scale-90 transition-all"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && void applyPromo()}
                    placeholder="CODE PROMO"
                    aria-label="Code promo"
                    autoComplete="off"
                    maxLength={24}
                    className="h-12 w-full rounded-2xl border border-border bg-card pl-10 pr-3 text-sm font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal focus-visible:outline-2 focus-visible:outline-primary"
                  />
                </div>
                <button
                  onClick={() => void applyPromo()}
                  disabled={!promoInput.trim() || promoChecking}
                  className="h-12 px-5 rounded-2xl border border-border bg-card text-xs font-bold disabled:opacity-50 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {promoChecking ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : "Appliquer"}
                </button>
              </div>
            )}

            <div className="rounded-2xl bg-muted/60 p-4 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Sous-total</span><span className="font-mono font-semibold">{xof(subtotal)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-[#3F7D3F]">
                  <span className="font-semibold">Remise {livePromo?.code}</span>
                  <span className="font-mono font-semibold">−{xof(discount)}</span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Cashback estimé ({Math.round(cashbackRate * 100)} %)</span><span className="font-mono font-semibold text-[#3F7D3F]">+{xof(Math.round(total * cashbackRate))}</span></div>
              <div className="flex justify-between border-t border-border pt-1.5 text-sm"><span className="font-semibold">Total à payer</span><span className="font-mono font-black text-primary">{xof(total)}</span></div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mode de paiement</p>
              {securityEnabled && (
                <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1">
                  <Lock size={10} aria-hidden="true" /> Vérification par code activée
                </p>
              )}
              <div className="space-y-2">
                {(["wave", "orange"] as const).map((m) => {
                  const o = op(m)!;
                  return (
                    <button key={m} onClick={() => startPay(m)} disabled={paying} className="w-full h-12 rounded-xl border-2 bg-card flex items-center gap-3 px-4 font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" style={{ borderColor: o.color }}>
                      <span className="h-7 w-7 rounded-full grid place-items-center font-heading font-black text-[#1A1410] text-xs shrink-0" style={{ backgroundColor: o.color }}>{o.name.charAt(0)}</span>
                      {o.name}
                      <span className="ml-auto text-[10px] font-normal text-muted-foreground">{o.hint}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => startPay("wallet")}
                  disabled={paying || (wallet?.balance ?? 0) < total}
                  className="w-full h-12 rounded-xl border-2 border-melanine bg-card flex items-center gap-3 px-4 font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="h-7 w-7 rounded-full grid place-items-center bg-melanine text-[#C8951E] shrink-0 font-heading font-black text-xs">K</span>
                  Wallet Kènè
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{wallet ? xof(wallet.balance) : "…"}</span>
                </button>
                {wallet && wallet.balance < total && <p className="text-[10px] text-destructive text-center">Solde insuffisant — approvisionne ton wallet depuis ton profil.</p>}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sécurité renforcée — code OTP exigé avant de lancer le paiement */}
      <SecureVerify
        open={pendingPay !== null}
        phone={user.phone}
        amount={total}
        onVerified={() => {
          const method = pendingPay;
          setPendingPay(null);
          if (method) void pay(method);
        }}
        onCancel={() => setPendingPay(null)}
      />

      {/* Overlay paiement simulé plein écran — dialog accessible (pattern RitualJourney) */}
      <AnimatePresence>
        {payState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={payState.phase === "processing" ? `Paiement en cours, ${xof(payState.amount)}` : "Paiement réussi"}
            onKeyDown={(e) => {
              if (e.key === "Escape" && payState.phase === "success") setPayState(null);
            }}
            className="fixed inset-0 z-[70] bg-[#1A1410]/97 backdrop-blur-sm grid place-items-center"
          >
            <div className="w-full max-w-[560px] mx-auto px-6">
              {payState.phase === "processing" ? (
                <div className="flex flex-col items-center gap-5 text-center" aria-live="polite">
                  <div className="grid place-items-center w-20 h-20 rounded-3xl font-heading font-black text-3xl text-[#1A1410] shadow-lg" style={{ backgroundColor: op(payState.method)?.color ?? "#C8951E" }}>
                    {(op(payState.method)?.name ?? "K").charAt(0)}
                  </div>
                  <p className="font-heading font-bold text-lg text-[#F8F1E4]">{op(payState.method)?.name ?? "Wallet Kènè"}</p>
                  <p className="font-mono text-3xl font-black text-[#F8F1E4]">{xof(payState.amount)}</p>
                  <p className="text-[11px] text-[#F8F1E4]/70 font-mono">+{user.phone.slice(0, 9)}···</p>
                  <div className="flex items-center gap-2 text-sm text-[#F8F1E4]/80">
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Traitement en cours…
                  </div>
                  <p className="text-[10px] text-[#F8F1E4]/60">Paiement mobile money simulé — POC</p>
                </div>
              ) : (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="flex flex-col items-center gap-4 text-center py-6">
                  <SuccessBurst />
                  <p className="font-heading font-black text-xl text-[#F8F1E4]">Paiement réussi</p>
                  <p className="font-mono text-sm font-bold text-[#F8F1E4]/90">{xof(payState.amount)}</p>
                  <p className="text-xs text-[#F8F1E4]/70 max-w-[300px] leading-relaxed">
                    Commande confirmée. <span className="flex items-center gap-1 justify-center mt-1 text-gold-text dark:text-[#E3B454] font-semibold"><BadgeCheck size={13} aria-hidden="true" /> Cashback {xof(Math.round(payState.amount * cashbackRate))} crédité sur ton wallet Kènè</span>
                  </p>
                  <button autoFocus onClick={() => setPayState(null)} className="mt-2 h-12 px-8 rounded-xl bg-primary text-primary-foreground font-semibold shadow active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary">
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

/* ══════════════ Mes commandes — historique consultable ══════════════ */

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-gold/12 text-terre border-gold/30" },
  paid: { label: "Payée", cls: "bg-[#3F7D3F]/12 text-[#3F7D3F] border-[#3F7D3F]/30" },
  delivered: { label: "Livrée", cls: "bg-primary/12 text-primary border-primary/30" },
  cancelled: { label: "Annulée", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

function OrdersView({ orders, onRefresh, onShop }: { orders: ApiOrder[] | null; onRefresh: () => void; onShop: () => void }) {
  if (orders === null) {
    return (
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="mt-4">
        <EmptyBlock
          icon={<History size={22} />}
          title="Aucune commande pour l'instant"
          text="Tes commandes boutique s'enregistrent ici — articles, remises et cashback."
          cta={
            <button onClick={onShop} className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary">
              Découvrir le catalogue
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3" aria-live="polite">
      {orders.map((o) => {
        const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: "bg-muted text-muted-foreground border-border" };
        return (
          <article key={o.id} aria-label={`Commande N° ${o.id.slice(-6).toUpperCase()}`} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="kente-band-soft h-1 w-full" aria-hidden="true" />
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold tracking-wide">N° {o.id.slice(-6).toUpperCase()}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{formatDate(o.createdAt)} · {formatTime(o.createdAt)}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
              </div>

              <ul className="space-y-1.5">
                {(o.items ?? []).map((it) => (
                  <li key={it.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-muted-foreground">{it.qty}×</span> {it.label}
                    </span>
                    <span className="shrink-0 font-mono font-semibold">{xof(it.total)}</span>
                  </li>
                ))}
              </ul>

              <div className="rounded-xl bg-muted/50 px-3 py-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Sous-total</span><span className="font-mono">{xof(o.subtotal)}</span></div>
                {!!o.discount && (
                  <div className="flex justify-between text-terre">
                    <span className="font-semibold">Remise {o.couponCode ?? ""}</span>
                    <span className="font-mono">−{xof(o.discount)}</span>
                  </div>
                )}
                {!!o.cashback && o.status !== "pending" && (
                  <div className="flex justify-between text-[#3F7D3F]">
                    <span>Cashback crédité</span>
                    <span className="font-mono">+{xof(o.cashback)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1 text-xs">
                  <span className="font-semibold">Total</span>
                  <span className="font-mono font-black text-primary">{xof(o.total)}</span>
                </div>
              </div>

              {o.status === "pending" && (
                <p className="text-[10px] text-muted-foreground leading-snug">Paiement mobile money à confirmer — la commande passera à « Payée » dès réception.</p>
              )}
            </div>
          </article>
        );
      })}
      <button onClick={onRefresh} className="h-11 w-full rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground hover:text-foreground active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-primary">
        Rafraîchir
      </button>
    </div>
  );
}
