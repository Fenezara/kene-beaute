"use client";
// Kènè Pro — Commandes boutique: ce que les clientes commandent DEPUIS L'APP.
// Liste temps réel (rafraîchie par le flux tenant-feed), KPIs du jour,
// suivi livraison (payée → livrée) et annulation avec remboursement wallet.
// t. 139 — REÇU DE CAISSE: toute commande encaissée (payée/livrée) peut être
// imprimée en ticket 80 mm (ou A4) pour la cliente — articles de CET institut,
// mode de paiement, mention honnête « simulation » pour le mobile money d'essai.
import { useState } from "react";
import { CheckCircle2, PackageCheck, Printer, ReceiptText, ShoppingBag, Truck, XCircle, Banknote, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/kene/api";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, InitialAvatar, Money, SectionHeader, KenteTop } from "./ui-bits";
import { proToastError } from "./ProApp";
import type { ProOrdersResponse, ProOrderView } from "./types";

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "À encaisser", cls: "bg-bissap/12 text-bissap border-bissap/30" },
  paid: { label: "À livrer", cls: "bg-gold/15 text-gold-text border-gold/30" },
  delivered: { label: "Livrée", cls: "bg-success/12 text-success border-success/30" },
  cancelled: { label: "Annulée", cls: "bg-muted text-muted-foreground border-border" },
};

const PAYMENT_LABELS: Record<string, string> = {
  wave: "Wave",
  orange: "Orange Money",
  wallet: "Wallet Kènè",
  cash: "Espèces",
  card: "Carte",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const st = ORDER_STATUS[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={cn("text-[10px] px-1.5", st.cls)}>{st.label}</Badge>;
}

export function OrdersSection({ tenantId, tenantName = "Institut", refreshKey }: { tenantId: string; tenantName?: string; refreshKey?: number }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  // t. 139 — reçu de caisse: la commande encaissée dont on prépare le ticket.
  const [receiptFor, setReceiptFor] = useState<ProOrderView | null>(null);

  const orders = useApi<ProOrdersResponse>(
    () => (tenantId ? apiGet<ProOrdersResponse>(`/api/pro/orders?tenantId=${tenantId}`) : Promise.resolve({ orders: [], kpis: { today: 0, toPay: 0, toDeliver: 0, revenue30d: 0 } })),
    [tenantId, refreshKey]
  );

  async function patchStatus(order: ProOrderView, status: "delivered" | "cancelled") {
    setBusyId(order.id);
    try {
      await apiPatch(`/api/pro/orders/${order.id}?tenantId=${tenantId}`, { status });
      toast.success(status === "delivered" ? "Commande marquée livrée" : "Commande annulée", {
        description: `${order.clientName} · ${xof(order.total)}`,
      });
      setConfirmCancelId(null);
      await orders.refetch();
    } catch (e) {
      proToastError(e, "Action impossible");
    } finally {
      setBusyId(null);
    }
  }

  const data = orders.data;
  const k = data?.kpis;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Commandes boutique"
        sub="Les commandes passées par vos clientes depuis l'application Kènè — synchronisées en temps réel"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: <ShoppingBag className="size-4" />, label: "Aujourd'hui", value: String(k?.today ?? 0) },
          { icon: <Clock className="size-4" />, label: "À encaisser", value: String(k?.toPay ?? 0) },
          { icon: <Truck className="size-4" />, label: "À livrer", value: String(k?.toDeliver ?? 0) },
          { icon: <Banknote className="size-4" />, label: "CA articles 30 j", value: xof(k?.revenue30d ?? 0, { compact: true }) },
        ].map((s) => (
          <Card key={s.label} className="overflow-hidden pt-0">
            <KenteTop />
            <CardContent className="p-3 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-gold/12 text-gold-text shrink-0">{s.icon}</span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="font-mono text-lg font-semibold leading-tight tabular-nums truncate">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Liste */}
      <Card className="overflow-hidden">
        {orders.error && !data ? (
          <CardContent className="p-4">
            <ErrorState message={`Commandes indisponibles : ${orders.error}`} onRetry={orders.refetch} />
          </CardContent>
        ) : orders.loading && !data ? (
          <CardContent className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </CardContent>
        ) : !data || data.orders.length === 0 ? (
          <CardContent>
            <EmptyState
              label="Aucune commande pour l'instant"
              sub="Dès qu'une cliente commande un de vos produits dans la boutique Kènè, la commande apparaît ici — badge et toast en temps réel inclus."
            />
          </CardContent>
        ) : (
          <div className="overflow-x-auto pretty-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Articles</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">CA institut</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Total commande</TableHead>
                  <TableHead className="hidden md:table-cell">Paiement</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-right">Suivi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.map((o) => (
                  <TableRow key={o.id} className={cn(o.status === "cancelled" && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={o.clientName} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{o.clientName}</p>
                          {/* Mobile: date + CA institut repliés sous le nom */}
                          <p className="truncate text-[10px] text-muted-foreground font-mono sm:hidden">
                            {formatDate(o.createdAt, { day: "numeric", month: "short" })} · {xof(o.ownTotal, { compact: true })}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56">
                      <p className="truncate text-xs">
                        {o.items.map((i) => `${i.qty}× ${i.label}`).join(" · ")}
                      </p>
                      {o.couponCode && (
                        <p className="text-[10px] text-gold-text">Coupon {o.couponCode} · remise {xof(o.discount)}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right">
                      <Money value={o.ownTotal} className="text-xs font-semibold" />
                      {o.ownTotal !== o.total && (
                        <p className="text-[9px] text-muted-foreground">sur {xof(o.total, { compact: true })} total</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      <Money value={o.total} className="text-xs" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {o.payment ? `${PAYMENT_LABELS[o.payment.method] ?? o.payment.method}` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {formatDate(o.createdAt, { day: "numeric", month: "short" })}
                      <span className="hidden lg:inline"> {formatTime(o.createdAt)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* t. 139 — reçu de caisse: toute commande ENCAISSÉE
                          (payée ou livrée) peut être imprimée pour la cliente. */}
                      {(o.status === "paid" || o.status === "delivered") && confirmCancelId !== o.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-8 ml-1.5"
                          onClick={() => setReceiptFor(o)}
                          aria-label={`Imprimer le reçu de caisse de la commande de ${o.clientName}`}
                        >
                          <ReceiptText className="size-3.5" aria-hidden="true" />
                          <span className="hidden lg:inline">Reçu</span>
                        </Button>
                      )}
                      {o.status === "paid" && confirmCancelId !== o.id && (
                        <Button
                          size="sm"
                          className="gap-1.5 h-8 font-semibold"
                          disabled={busyId === o.id}
                          onClick={() => void patchStatus(o, "delivered")}
                          aria-label={`Marquer la commande de ${o.clientName} comme livrée`}
                        >
                          <PackageCheck className="size-3.5" aria-hidden="true" />
                          Livrée
                        </Button>
                      )}
                      {(o.status === "pending" || o.status === "paid") && confirmCancelId !== o.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-8 ml-1.5 text-bissap border-bissap/40 hover:bg-bissap/10"
                          disabled={busyId === o.id}
                          onClick={() => setConfirmCancelId(o.id)}
                          aria-label={`Annuler la commande de ${o.clientName}`}
                        >
                          <XCircle className="size-3.5" aria-hidden="true" />
                          Annuler
                        </Button>
                      )}
                      {confirmCancelId === o.id && (
                        <span className="inline-flex items-center gap-1" role="group" aria-label="Confirmer l'annulation">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={busyId === o.id}
                            onClick={() => setConfirmCancelId(null)}
                          >
                            Non
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 gap-1 bg-bissap hover:bg-bissap/90"
                            disabled={busyId === o.id}
                            onClick={() => void patchStatus(o, "cancelled")}
                          >
                            <CheckCircle2 className="size-3.5" aria-hidden="true" />
                            Confirmer
                          </Button>
                        </span>
                      )}
                      {(o.status === "delivered" || o.status === "cancelled") && confirmCancelId !== o.id && (
                        <span className="text-[10px] text-muted-foreground">{o.status === "delivered" ? "✓ livrée" : "—"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        « CA institut » ne compte que vos articles dans chaque commande (une commande peut mélanger plusieurs
        instituts). L&apos;annulation d&apos;une commande payée en wallet rembourse la cliente automatiquement et
        remet vos articles en stock.
      </p>

      {/* t. 139 — Dialogue du reçu: aperçu fidèle du ticket + impression
          (imprimante ticket 80 mm ou A4 — le CSS d'impression masque tout
          sauf le ticket). */}
      <Dialog open={Boolean(receiptFor)} onOpenChange={(o) => (!o ? setReceiptFor(null) : undefined)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <ReceiptText className="size-5 text-primary" aria-hidden="true" />
              Reçu de caisse
            </DialogTitle>
            <DialogDescription>
              Aperçu du ticket tel qu&apos;il sortira à l&apos;impression — conserve le en vos archives de caisse.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-white p-3 text-black shadow-inner">
            {receiptFor && <ReceiptTicket o={receiptFor} tenantName={tenantName} />}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setReceiptFor(null)}>Fermer</Button>
            <Button className="h-11 gap-1.5" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden="true" />
              Imprimer le reçu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zone d'impression (t. 139): rendue dans le DOM mais masquée à
          l'écran ; @media print masque TOUT sauf elle (visibilité) et force
          une page ticket 80 mm — le dialogue reste ouvert, il devient
          invisible à l'impression. */}
      {receiptFor && (
        <>
          <style>{`
@media print {
  body * { visibility: hidden; }
  #kene-receipt-print, #kene-receipt-print * { visibility: visible; }
  #kene-receipt-print {
    position: absolute; left: 0; top: 0; width: 100%;
    background: white; color: black;
  }
  @page { size: 80mm auto; margin: 4mm; }
}
          `}</style>
          <div id="kene-receipt-print" className="hidden bg-white text-black">
            <ReceiptTicket o={receiptFor} tenantName={tenantName} />
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────── Ticket de caisse (t. 139) ───────────────
 * Monospace blanc/noir — fidèle à l'impression thermique. Ne montre que les
 * articles de CET institut (une commande mixte imprimera le ticket de chaque
 * vendeur chez elle). Modes de paiement honnêtes: Wave/Orange/Wallet =
 * simulation (mode essai), Espèces/Carte = réels. */
function ReceiptTicket({ o, tenantName }: { o: ProOrderView; tenantName: string }) {
  const mine = o.items.filter((i) => i.mine);
  const simulated = o.payment ? ["wave", "orange", "wallet"].includes(o.payment.method) : false;
  const dashed = "border-t border-dashed border-black/40 my-2";
  return (
    <div className="mx-auto w-full max-w-[300px] px-1 py-1 font-mono text-[11px] leading-relaxed">
      <p className="text-center text-[13px] font-bold uppercase tracking-wide">{tenantName}</p>
      <p className="text-center text-[10px]">Boutique Kènè — partenaire</p>
      <p className="mt-1 text-center text-[12px] font-bold">TICKET DE CAISSE</p>
      <div className={dashed} aria-hidden="true" />
      <p className="flex justify-between"><span>Le {formatDate(o.createdAt, { day: "numeric", month: "short", year: "numeric" })}</span><span>{formatTime(o.createdAt)}</span></p>
      <p className="flex justify-between"><span>Réf</span><span className="font-bold">{o.id.slice(-8).toUpperCase()}</span></p>
      <p className="flex justify-between"><span>Cliente</span><span className="truncate pl-2">{o.clientName}</span></p>
      <div className={dashed} aria-hidden="true" />
      {mine.map((i) => (
        <p key={i.label} className="flex justify-between gap-2">
          <span className="min-w-0">{i.qty}× {i.label}</span>
          <span className="shrink-0 tabular-nums">{i.total.toLocaleString("fr-FR")}</span>
        </p>
      ))}
      {o.couponCode && <p className="mt-1 text-[10px]">Coupon {o.couponCode} — remise appliquée à la commande</p>}
      {o.ownTotal !== o.total && <p className="text-[10px]">Part d&apos;un achat multi-boutiques</p>}
      <div className={dashed} aria-hidden="true" />
      <p className="flex justify-between text-[13px] font-bold">
        <span>TOTAL ENCAISSÉ</span>
        <span className="tabular-nums">{o.ownTotal.toLocaleString("fr-FR")} F</span>
      </p>
      <p className="flex justify-between">
        <span>Règlement</span>
        <span>{o.payment ? PAYMENT_LABELS[o.payment.method] ?? o.payment.method : "à la livraison"}{simulated ? " · simulation" : ""}</span>
      </p>
      {o.payment?.ref && <p className="flex justify-between text-[10px]"><span>Réf paiement</span><span>{o.payment.ref.slice(-10)}</span></p>}
      <div className={dashed} aria-hidden="true" />
      <p className="text-center">Merci de ta visite 💛</p>
      <p className="text-center text-[10px]">Kènè — la beauté mélanoderme, enfin comprise.</p>
      {simulated && <p className="mt-1 text-center text-[9px]">Paiement mobile money en mode essai — aucun débit réel.</p>}
      <p className="mt-1 text-center text-[9px]">Conserve ce reçu — généré par la Console Pro Kènè.</p>
    </div>
  );
}
