"use client";
// Kènè Pro — Caisse POS : catalogue cliquable, ticket, paiement mobile money, ticket thermique imprimable
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Minus, Plus, Printer, ReceiptText, Trash2, Wallet, User, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { splitTVA } from "@/lib/accounting/syscohada";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, KenteTop, SectionHeader } from "./ui-bits";
import type { PaymentMethod, ProCatalog, ProClient, ProSale, SalesResponse } from "./types";

interface TicketLine {
  kind: "service" | "product";
  id: string;
  label: string;
  unitPrice: number;
  qty: number;
}

const PAY_METHODS: { code: PaymentMethod; label: string; cls: string }[] = [
  { code: "wave", label: "Wave", cls: "bg-[#1DC8FF] text-[#062A33] hover:brightness-95" },
  { code: "orange", label: "Orange Money", cls: "bg-[#FF7900] text-[#3A1D00] hover:brightness-95" },
  { code: "cash", label: "Espèces", cls: "bg-success text-success-foreground hover:brightness-95" },
  { code: "card", label: "Carte", cls: "bg-finance text-finance-foreground hover:brightness-95" },
];

const METHOD_LABELS: Record<string, string> = { wave: "Wave", orange: "Orange Money", cash: "Espèces", card: "Carte bancaire", wallet: "Wallet Kènè" };

export function PosSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [discountInput, setDiscountInput] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ticket, setTicket] = useState<ProSale | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const catalog = useApi<ProCatalog>(() => (tenantId ? apiGet<ProCatalog>(`/api/pro/catalog?tenantId=${tenantId}`) : Promise.resolve({ services: [], products: [] })), [tenantId]);
  const clients = useApi<ProClient[]>(
    () => (tenantId ? apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}`).then((r) => r.clients ?? []) : Promise.resolve([])),
    [tenantId]
  );
  const sales = useApi<SalesResponse>(() => (tenantId ? apiGet<SalesResponse>(`/api/pro/sales?tenantId=${tenantId}`) : Promise.resolve({ sales: [] })), [tenantId]);

  const discount = Math.max(0, Math.min(Number(discountInput) || 0, 1_000_000));
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0), [lines]);
  const total = Math.max(0, subtotal - Math.min(discount, subtotal));

  function addLine(kind: "service" | "product", id: string, label: string, unitPrice: number) {
    setLines((ls) => {
      const ex = ls.find((l) => l.kind === kind && l.id === id);
      if (ex) return ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { kind, id, label, unitPrice, qty: 1 }];
    });
  }
  function setQty(i: number, delta: number) {
    setLines((ls) =>
      ls.map((l, idx) => (idx === i ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  async function pay(method: PaymentMethod) {
    if (lines.length === 0) {
      toast.error("Le ticket est vide");
      return;
    }
    setBusy(true);
    try {
      const res = await apiPost<{ sale: ProSale }>("/api/pro/sales", {
        tenantId,
        items: lines.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty })),
        paymentMethod: method,
        clientProfileId: clientId || undefined,
        discount: Math.min(discount, subtotal),
      });
      const sale: ProSale = {
        ...res.sale,
        items: res.sale.items ?? lines.map((l) => ({ label: l.label, qty: l.qty, unitPrice: l.unitPrice, total: l.unitPrice * l.qty, kind: l.kind })),
        discount: res.sale.discount ?? Math.min(discount, subtotal),
        subtotal: res.sale.subtotal ?? subtotal,
      };
      setSuccess(true);
      window.setTimeout(() => {
        setTicket(sale);
        setSheetOpen(true);
        setSuccess(false);
        setLines([]);
        setDiscountInput("");
        setClientId("");
        void sales.refetch();
      }, 1300);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Encaissement impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Caisse" sub="Encaissement soins & produits — Wave, Orange Money, espèces, carte" />

      <div className="grid lg:grid-cols-[1fr_400px] gap-4 items-start">
        {/* ── Catalogue ── */}
        <Card className="overflow-hidden pt-0">
          <KenteTop />
          <CardContent className="p-4">
            {catalog.error && !catalog.data ? (
              <ErrorState message={`Catalogue indisponible : ${catalog.error}`} onRetry={catalog.refetch} />
            ) : catalog.loading && !catalog.data ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <Tabs defaultValue="service">
                <TabsList className="mb-3">
                  <TabsTrigger value="service" className="text-xs gap-1.5">Soins</TabsTrigger>
                  <TabsTrigger value="product" className="text-xs gap-1.5">Produits</TabsTrigger>
                </TabsList>
                <TabsContent value="service">
                  {catalog.data?.services.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {catalog.data.services.filter((s) => s.active).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => addLine("service", s.id, s.name, s.price)}
                          className="group rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-gold hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <p className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-primary">{s.name}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{s.durationMin} min</p>
                          <p className="mt-1 font-mono text-sm font-semibold text-gold">{xof(s.price)}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucun soin actif au catalogue" />
                  )}
                </TabsContent>
                <TabsContent value="product">
                  {catalog.data?.products.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {catalog.data.products.filter((p) => p.active).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addLine("product", p.id, p.name, p.price)}
                          className="group rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-gold hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <p className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-primary">{p.name}</p>
                          <p className={cn("mt-1 text-[11px]", p.stock <= p.stockAlert ? "text-bissap font-medium" : "text-muted-foreground")}>
                            Stock : {p.stock}
                          </p>
                          <p className="mt-1 font-mono text-sm font-semibold text-gold">{xof(p.price)}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="Aucun produit POS actif" />
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* ── Ticket ── */}
        <Card className="lg:sticky lg:top-24 overflow-hidden pt-0 relative">
          <KenteTop />
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <ReceiptText className="size-4 text-primary" aria-hidden="true" /> Ticket en cours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                Cliquez sur un soin ou produit pour l&apos;ajouter au ticket.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto pretty-scroll pr-1">
                <AnimatePresence initial={false}>
                  {lines.map((l, i) => (
                    <motion.li
                      key={`${l.kind}-${l.id}`}
                      layout
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{l.label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{xof(l.unitPrice)} × {l.qty}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-6" onClick={() => setQty(i, -1)} aria-label={`Retirer un ${l.label}`}>
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-5 text-center font-mono text-xs font-semibold tabular-nums">{l.qty}</span>
                        <Button variant="ghost" size="icon" className="size-6" onClick={() => setQty(i, 1)} aria-label={`Ajouter un ${l.label}`}>
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="w-20 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">{xof(l.unitPrice * l.qty)}</span>
                      <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-bissap" onClick={() => setQty(i, -l.qty)} aria-label={`Supprimer ${l.label}`}>
                        <Trash2 className="size-3" />
                      </Button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            <div className="space-y-1">
              <Label htmlFor="pos-client" className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="size-3" aria-hidden="true" /> Cliente (optionnel)
              </Label>
              <Select value={clientId || undefined} onValueChange={(v) => setClientId(v === "__none" ? "" : v)}>
                <SelectTrigger id="pos-client" className="h-8 text-xs">
                  <SelectValue placeholder="Sans client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sans client</SelectItem>
                  {(clients.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 border-t border-dashed border-border pt-2 text-sm">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Sous-total</span>
                <span className="font-mono tabular-nums">{xof(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <Label htmlFor="pos-remise" className="text-muted-foreground">Remise (FCFA)</Label>
                <Input
                  id="pos-remise"
                  inputMode="numeric"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  className="h-7 w-28 text-right font-mono text-xs"
                />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-heading font-bold">TOTAL</span>
                <span className="font-mono text-xl font-bold text-gold tabular-nums">{xof(total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PAY_METHODS.map((m) => (
                <button
                  key={m.code}
                  disabled={busy || lines.length === 0}
                  onClick={() => pay(m.code)}
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none",
                    m.cls
                  )}
                >
                  {m.code === "wave" || m.code === "orange" ? <Wallet className="size-4" aria-hidden="true" /> : m.code === "cash" ? <ReceiptText className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                  {m.label}
                </button>
              ))}
            </div>
          </CardContent>

          {/* Overlay succès */}
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 grid place-items-center rounded-xl bg-card/95"
                role="status"
                aria-live="polite"
              >
                <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className="flex flex-col items-center gap-2">
                  <span className="grid size-16 place-items-center rounded-full bg-success text-success-foreground shadow-lg">
                    <Check className="size-9" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <p className="font-heading font-bold text-success">Encaissé !</p>
                  <p className="font-mono text-sm font-semibold">{xof(total)}</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      {/* ── Ventes récentes ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">Ventes récentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sales.loading && !sales.data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (sales.data?.sales ?? []).length === 0 ? (
            <EmptyState label="Aucune vente enregistrée" sub="Les encaissements POS apparaîtront ici." />
          ) : (
            <ul className="divide-y divide-border/70">
              {(sales.data?.sales ?? []).slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-mono text-[10px] text-muted-foreground w-24 shrink-0 tabular-nums">
                    {formatDate(s.createdAt, { day: "2-digit", month: "2-digit" })} {formatTime(s.createdAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{s.items?.map((it) => `${it.qty}× ${it.label}`).join(", ") || "Vente"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {METHOD_LABELS[s.paymentMethod] ?? s.paymentMethod}
                      {s.clientProfile?.name ? ` · ${s.clientProfile.name}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold tabular-nums">{xof(s.total)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() => {
                      setTicket(s);
                      setSheetOpen(true);
                    }}
                  >
                    <Printer className="size-3.5" aria-hidden="true" /> Ticket
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Ticket thermique ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto pretty-scroll">
          <SheetHeader className="sr-only">
            <SheetTitle>Ticket de caisse</SheetTitle>
            <SheetDescription>Reçu thermique imprimable</SheetDescription>
          </SheetHeader>
          {ticket && (
            <div className="mt-2 space-y-3">
              <div className="print-area mx-auto w-[300px] bg-white px-4 py-5 font-mono text-[11px] leading-relaxed text-black shadow-md rounded-sm">
                <div className="text-center">
                  <p className="text-[13px] font-bold tracking-wide uppercase">{tenantName}</p>
                  <p className="mt-0.5">TICKET DE CAISSE</p>
                  <p>{formatDate(ticket.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" })} {formatTime(ticket.createdAt)}</p>
                  <p>N° {(ticket.paymentRef ?? ticket.id).slice(-8).toUpperCase()}</p>
                </div>
                <div className="my-2 border-t border-dashed border-black/60" />
                <ul className="space-y-1">
                  {(ticket.items ?? []).map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{it.qty}× {it.label}</span>
                      <span className="shrink-0 tabular-nums">{it.total.toLocaleString("fr-FR")}</span>
                    </li>
                  ))}
                </ul>
                <div className="my-2 border-t border-dashed border-black/60" />
                <div className="flex justify-between"><span>Sous-total</span><span className="tabular-nums">{(ticket.subtotal ?? ticket.total).toLocaleString("fr-FR")}</span></div>
                {(ticket.discount ?? 0) > 0 && (
                  <div className="flex justify-between"><span>Remise</span><span className="tabular-nums">-{ticket.discount!.toLocaleString("fr-FR")}</span></div>
                )}
                <div className="flex justify-between text-[13px] font-bold"><span>TOTAL</span><span className="tabular-nums">{ticket.total.toLocaleString("fr-FR")} FCFA</span></div>
                <div className="mt-1 flex justify-between text-[10px]">
                  <span>dont TVA 18 % incluse</span>
                  <span className="tabular-nums">{splitTVA(ticket.total).tva.toLocaleString("fr-FR")}</span>
                </div>
                <div className="mt-2 flex justify-between"><span>{METHOD_LABELS[ticket.paymentMethod] ?? ticket.paymentMethod}</span><span className="text-right">{ticket.cashierName ?? "Caisse 1"}</span></div>
                <div className="my-2 border-t border-dashed border-black/60" />
                <p className="text-center">Merci de votre visite</p>
                <p className="text-center font-bold">Kènè — Ticket de caisse</p>
                <p className="text-center text-[9px] mt-1">Conforme SYSCOHADA · écriture CA auto</p>
              </div>
              <Button onClick={() => window.print()} className="w-full gap-2 font-semibold">
                <Printer className="size-4" aria-hidden="true" /> Imprimer le ticket
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
