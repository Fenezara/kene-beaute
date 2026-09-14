"use client";
// Kènè Pro — Stock: inventaire produits, mouvements (entrée/sortie/perte), alertes
import { useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate, formatTime } from "@/lib/kene/format";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, KenteTop, Money, SectionHeader } from "./ui-bits";
import type { ProSectionId } from "./ProApp";
import type { StockResponse } from "./types";

const MOVEMENT_STYLES: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  in: { label: "Entrée", cls: "bg-success/15 text-success border-success/30", icon: <ArrowDownLeft className="size-3" aria-hidden="true" /> },
  out: { label: "Sortie", cls: "bg-terre/15 text-terre border-terre/30", icon: <ArrowUpRight className="size-3" aria-hidden="true" /> },
  loss: { label: "Perte", cls: "bg-bissap/15 text-bissap border-bissap/30", icon: <Trash2 className="size-3" aria-hidden="true" /> },
  adjust: { label: "Ajustement", cls: "bg-muted text-muted-foreground border-border", icon: <PackagePlus className="size-3" aria-hidden="true" /> },
};

export function StockSection({ tenantId, onNavigate }: { tenantId: string; onNavigate?: (s: ProSectionId) => void }) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"in" | "out" | "loss">("in");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const stock = useApi<StockResponse>(() => (tenantId ? apiGet<StockResponse>(`/api/pro/stock?tenantId=${tenantId}`) : Promise.resolve({ products: [], movements: [] })), [tenantId]);

  const products = stock.data?.products ?? [];
  const movements = stock.data?.movements ?? [];
  const alerts = products.filter((p) => p.stock <= p.stockAlert);
  const totalValue = products.reduce((s, p) => s + p.stock * p.price, 0);

  async function submitMovement() {
    const n = Number(qty);
    if (!productId || !n || n <= 0) {
      toast.error("Choisissez un produit et une quantité valide");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/pro/stock", { tenantId, productId, type, qty: n, reason: reason.trim() || (type === "in" ? "Réassort fournisseur" : type === "out" ? "Vente comptoir" : "Casse / péremption") });
      toast.success(type === "in" ? "Entrée de stock enregistrée" : type === "out" ? "Sortie de stock enregistrée" : "Perte enregistrée");
      setMoveOpen(false);
      setProductId("");
      setQty("1");
      setReason("");
      await stock.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mouvement impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Stock"
        sub={`${products.length} références en inventaire`}
        actions={
          <Button onClick={() => setMoveOpen(true)} className="gap-1.5 font-semibold">
            <PackagePlus className="size-4" aria-hidden="true" /> Mouvement
          </Button>
        }
      />

      {/* Alertes */}
      {alerts.length > 0 && (
        <Card className="border-bissap/40 bg-bissap/5 overflow-hidden pt-0">
          <KenteTop className="opacity-60" />
          <CardContent className="p-3.5 flex flex-wrap items-center gap-2">
            <AlertTriangle className="size-4 text-bissap shrink-0" aria-hidden="true" />
            <p className="text-sm text-bissap font-medium flex-1 min-w-40">
              {alerts.length} produit{alerts.length > 1 ? "s" : ""} sous le seuil d&apos;alerte : {alerts.slice(0, 3).map((p) => p.name).join(", ")}
              {alerts.length > 3 ? "…" : ""}
            </p>
            <Button size="sm" variant="outline" className="border-bissap/40 text-bissap hover:bg-bissap/10" onClick={() => onNavigate?.("catalogue")}>
              Commander au catalogue
            </Button>
          </CardContent>
        </Card>
      )}

      {stock.error && !stock.data ? (
        <ErrorState message={`Stock indisponible : ${stock.error}`} onRetry={stock.refetch} />
      ) : stock.loading && !stock.data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        <div className="grid xl:grid-cols-[1.5fr_1fr] gap-4 items-start">
          {/* Inventaire */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base flex items-center justify-between">
                Inventaire
                <Money value={totalValue} className="text-sm font-semibold text-muted-foreground" compact />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {products.length === 0 ? (
                <EmptyState label="Aucun produit en stock" sub="Ajoutez des produits depuis le Catalogue." />
              ) : (
                <div className="overflow-x-auto pretty-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Seuil</TableHead>
                        <TableHead className="text-right">Valeur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p) => (
                        <TableRow key={p.id} className={cn(p.stock <= p.stockAlert && "bg-bissap/[0.04]")}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="size-10 rounded-lg overflow-hidden border border-border bg-muted shrink-0">
                                <img src={p.image} alt={p.name} className="size-full object-cover" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{p.name}</p>
                                <p className="text-[10px] text-muted-foreground capitalize">{p.category}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn("font-mono text-sm font-semibold tabular-nums", p.stock <= p.stockAlert ? "text-bissap" : "")}>{p.stock}</span>
                            {p.stock <= p.stockAlert && (
                              <Badge variant="outline" className="ml-1.5 bg-bissap/10 text-bissap border-bissap/40 text-[9px] px-1 py-0">Alerte</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right hidden sm:table-cell font-mono text-xs text-muted-foreground tabular-nums">{p.stockAlert}</TableCell>
                          <TableCell className="text-right"><Money value={p.stock * p.price} className="text-xs" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mouvements */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">Derniers mouvements</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <EmptyState label="Aucun mouvement" />
              ) : (
                <ul className="max-h-96 overflow-y-auto pretty-scroll divide-y divide-border/70">
                  {movements.slice(0, 30).map((m) => {
                    const st = MOVEMENT_STYLES[m.type] ?? MOVEMENT_STYLES.adjust;
                    return (
                      <li key={m.id} className="flex items-center gap-2.5 px-4 py-2.5">
                        <Badge variant="outline" className={cn("text-[10px] gap-1 shrink-0", st.cls)}>
                          {st.icon} {st.label}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{m.product.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{m.reason}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs font-semibold tabular-nums">{m.type === "in" ? "+" : m.type === "out" ? "−" : "−"}{m.qty}</p>
                          <p className="text-[9px] text-muted-foreground font-mono">{formatDate(m.createdAt, { day: "2-digit", month: "2-digit" })} {formatTime(m.createdAt)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Dialog mouvement ── */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Mouvement de stock</DialogTitle>
            <DialogDescription>Enregistrez une entrée, une sortie ou une perte d&apos;inventaire.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Produit</Label>
              <Select value={productId || undefined} onValueChange={setProductId}>
                <SelectTrigger aria-label="Produit"><SelectValue placeholder="Choisir un produit…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (stock {p.stock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Type de mouvement">
              {(["in", "out", "loss"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1",
                    type === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {MOVEMENT_STYLES[t].icon} {MOVEMENT_STYLES[t].label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="mv-qty" className="text-xs">Quantité</Label>
                <Input id="mv-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mv-reason" className="text-xs">Motif</Label>
                <Input id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Livraison Fournisseur Kènè…" />
              </div>
            </div>
            <Button disabled={busy} onClick={submitMovement} className="w-full font-semibold">
              {busy ? "Enregistrement…" : "Enregistrer le mouvement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
