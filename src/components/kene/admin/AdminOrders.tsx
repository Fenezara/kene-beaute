"use client";
// Kènè — Console Admin · Gestion centralisée des Ventes & Commandes Réseau
// 1. Double vue : Ventes Caisse Salons (POS en institut) & Commandes en Ligne
// 2. Traçabilité complète des encaissements (Wave, Orange, MTN, Espèces, Carte)
// 3. Suivi par institut partenaire, praticienne et cliente
// 4. Contact direct WhatsApp et factures/reçus

import { useEffect, useState, useMemo } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  User,
  XCircle,
} from "lucide-react";
import { CauriIcon } from "@/components/kene/icons";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPatch } from "@/lib/kene/api";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { KpiCard } from "@/components/kene/pro/ui-bits";

interface OrderItem {
  id: string;
  qty: number;
  unitPrice: number;
  total: number;
  label: string;
  product?: {
    id: string;
    name: string;
    brandLine: string;
    tenant?: {
      id: string;
      name: string;
    } | null;
  };
}

interface AdminOrder {
  id: string;
  createdAt: string;
  total: number;
  subtotal: number;
  shippingFee: number;
  discount: number;
  couponCode?: string | null;
  status: "pending" | "paid" | "preparing" | "in_transit" | "delivered" | "cancelled";
  deliveryCity?: string | null;
  deliveryArea?: string | null;
  deliveryAddress?: string | null;
  deliveryPhone?: string | null;
  deliveryNotes?: string | null;
  user: {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
  };
  payment?: {
    id: string;
    method: string;
    status: string;
    ref: string;
  } | null;
  items: OrderItem[];
}

interface AdminSaleItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  total: number;
}

interface AdminSale {
  id: string;
  createdAt: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: string;
  practitioner?: string | null;
  receiptNumber?: string | null;
  tenant: {
    id: string;
    name: string;
    city: string;
    phone?: string | null;
  };
  clientProfile?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  items: AdminSaleItem[];
}

interface OrdersResponse {
  orders: AdminOrder[];
  sales: AdminSale[];
  stats: {
    totalOrders: number;
    paidOrders: number;
    preparingOrders: number;
    deliveredOrders: number;
    pendingOrders: number;
    cancelledOrders: number;
    ordersVolume: number;
    totalSales: number;
    salesVolume: number;
    networkGmv: number;
  };
}

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "En attente", color: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Clock },
  paid: { label: "Payée (SasPay / MoMo)", color: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: CheckCircle2 },
  preparing: { label: "En préparation salon", color: "bg-purple-500/15 text-purple-600 border-purple-500/30", icon: Package },
  in_transit: { label: "Prêt / En cours", color: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30", icon: Store },
  delivered: { label: "Remise à la cliente", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  cancelled: { label: "Annulée", color: "bg-rose-500/15 text-rose-600 border-rose-500/30", icon: XCircle },
};

const PAYMENT_METHOD_LABELS: Record<string, { label: string; color: string }> = {
  cash: { label: "Espèces", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  wave: { label: "Wave", color: "bg-sky-500/10 text-sky-600 border-sky-500/20" },
  orange: { label: "Orange Money", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  mtn: { label: "MTN MoMo", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  moov: { label: "Moov Money", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  card: { label: "Carte Bancaire", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  wallet: { label: "Wallet Kènè", color: "bg-gold/15 text-gold-text border-gold/30" },
};

export function AdminOrders() {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pos" | "online">("pos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const q = encodeURIComponent(search.trim());
      const res = await apiGet<OrdersResponse>(
        `/api/admin/orders?q=${q}&status=${encodeURIComponent(statusFilter)}`
      );
      setData(res);
    } catch (err: any) {
      toast.error("Erreur de chargement des transactions", {
        description: err?.message || "Vérifie tes accès administrateur.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchOrders, 300);
    return () => clearTimeout(t);
  }, [search, statusFilter]);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      await apiPatch<{ success: boolean; order: AdminOrder }>("/api/admin/orders", {
        orderId,
        status: newStatus,
      });
      toast.success("Statut mis à jour");
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          orders: prev.orders.map((o) => (o.id === orderId ? { ...o, status: newStatus as any } : o)),
        };
      });
    } catch (err: any) {
      toast.error("Échec de mise à jour du statut", { description: err?.message });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold flex items-center gap-2">
            <ShoppingBag className="size-5 text-primary" />
            Ventes Caisse &amp; Commandes Réseau
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Supervision centralisée des encaissements physiques en salon (POS) et des commandes de rituels en ligne
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchOrders}
          disabled={loading}
          className="gap-1.5 rounded-full text-xs font-semibold self-start sm:self-auto"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Cartes KPIs de synthèse */}
      {data?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            icon={<Receipt className="size-4" />}
            label="Ventes Caisse Salons"
            value={xof(data.stats.salesVolume, { compact: true })}
            monetary={false}
            hint={`${data.stats.totalSales} ventes en institut`}
          />
          <KpiCard
            icon={<ShoppingBag className="size-4" />}
            label="Commandes en Ligne"
            value={xof(data.stats.ordersVolume, { compact: true })}
            monetary={false}
            hint={`${data.stats.paidOrders + data.stats.deliveredOrders} payées`}
          />
          <KpiCard
            icon={<CauriIcon className="size-4" />}
            label="Volume Réseau (GMV)"
            value={xof(data.stats.networkGmv, { compact: true })}
            monetary={false}
            hint="Total encaissements réseau"
          />
          <KpiCard
            icon={<CheckCircle2 className="size-4" />}
            label="Commandes Honorées"
            value={String(data.stats.deliveredOrders)}
            monetary={false}
            hint="Remises en main propre"
          />
        </div>
      )}

      {/* Sélecteur de vue : Ventes Caisse Salons vs Commandes en Ligne */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex rounded-xl p-1 bg-muted/60 border border-border">
          <button
            onClick={() => setActiveTab("pos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "pos"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Receipt className="size-3.5" />
            Ventes Caisse Salons ({data?.sales.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("online")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "online"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingBag className="size-3.5" />
            Commandes en Ligne ({data?.orders.length ?? 0})
          </button>
        </div>

        {/* Filtres & Recherche */}
        <div className="flex flex-col sm:flex-row gap-2 flex-1 sm:justify-end">
          <div className="relative min-w-[240px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={activeTab === "pos" ? "Rechercher par cliente, institut, praticienne..." : "Rechercher par cliente, réf, commune..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl h-10 text-xs"
            />
          </div>

          {activeTab === "online" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 rounded-xl h-10 text-xs">
                <Filter className="size-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filtrer statut" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="paid">Payées (SasPay)</SelectItem>
                <SelectItem value="preparing">En préparation</SelectItem>
                <SelectItem value="in_transit">Prêt / En cours</SelectItem>
                <SelectItem value="delivered">Remises à la cliente</SelectItem>
                <SelectItem value="pending">En attente de paiement</SelectItem>
                <SelectItem value="cancelled">Annulées</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* CONTENU ONGLET 1 : Ventes Caisse Salons (POS) */}
      {activeTab === "pos" && (
        <div className="space-y-3">
          {loading && !data ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Chargement des encaissements cabine...</p>
            </div>
          ) : !data || data.sales.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-border text-center space-y-2 bg-card/50">
              <Receipt className="size-10 text-muted-foreground/60 mx-auto" />
              <p className="font-heading font-semibold text-sm">Aucune vente caisse trouvée</p>
              <p className="text-xs text-muted-foreground">
                {search
                  ? "Essaie de modifier tes critères de recherche."
                  : "Les ventes réalisées au comptoir des salons s'afficheront ici en direct."}
              </p>
            </div>
          ) : (
            data.sales.map((s) => {
              const payInfo = PAYMENT_METHOD_LABELS[s.paymentMethod.toLowerCase()] || {
                label: s.paymentMethod,
                color: "bg-muted text-muted-foreground border-border",
              };
              const clientPhone = s.clientProfile?.phone;

              return (
                <Card key={s.id} className="border-border/80 hover:border-border transition-all overflow-hidden">
                  <CardContent className="p-4 sm:p-5 space-y-3.5">
                    {/* Ligne 1 : En-tête de la vente */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border/60">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-muted text-foreground">
                          TICKET #{s.receiptNumber || s.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(s.createdAt)} à {formatTime(s.createdAt)}
                        </span>
                        {s.practitioner && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            Praticienne : {s.practitioner}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={`gap-1 px-2.5 py-0.5 text-xs font-semibold border ${payInfo.color}`}>
                          {payInfo.label}
                        </Badge>
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs font-semibold">
                          Encaissé
                        </Badge>
                      </div>
                    </div>

                    {/* Ligne 2 : Détails Institut, Cliente & Total */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                      {/* Institut */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                        <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <Building2 className="size-3 text-primary" />
                          Institut Vendeur
                        </p>
                        <p className="font-heading font-bold text-sm text-foreground">{s.tenant.name}</p>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <MapPin className="size-3" />
                          {s.tenant.city}
                        </p>
                      </div>

                      {/* Cliente */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                        <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <User className="size-3 text-primary" />
                          Cliente
                        </p>
                        <p className="font-heading font-bold text-sm text-foreground">
                          {s.clientProfile?.name || "Cliente de passage (comptoir)"}
                        </p>
                        {clientPhone && (
                          <p className="text-muted-foreground flex items-center gap-1">
                            <Phone className="size-3" />
                            {clientPhone}
                          </p>
                        )}
                      </div>

                      {/* Total Encaissé */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                        <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <CauriIcon className="size-3 text-primary" />
                          Règlement Caisse
                        </p>
                        <div className="flex items-baseline justify-between">
                          <span className="text-muted-foreground">Total TTC :</span>
                          <span className="font-heading font-black text-base text-foreground">{xof(s.total)}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex justify-between">
                          <span>Moyen :</span>
                          <span className="font-medium text-foreground">{payInfo.label}</span>
                        </div>
                      </div>
                    </div>

                    {/* Ligne 3 : Articles vendus */}
                    <div className="p-2.5 rounded-xl bg-background border border-border/70 space-y-1.5">
                      <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
                        Lignes de vente ({s.items.reduce((acc, i) => acc + i.qty, 0)})
                      </p>
                      <div className="divide-y divide-border/40 text-xs">
                        {s.items.map((item) => (
                          <div key={item.id} className="py-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-primary">{item.qty}x</span>
                              <span className="font-medium text-foreground">{item.name}</span>
                            </div>
                            <span className="font-semibold text-foreground">{xof(item.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ligne 4 : Actions rapides */}
                    {clientPhone && (
                      <div className="flex items-center justify-end gap-2 pt-0.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const msg = `Bonjour ${s.clientProfile?.name || ""} ! 🌿 Merci pour votre visite chez ${s.tenant.name}. Votre ticket de caisse d'un montant de ${xof(s.total)} a bien été enregistré. Au plaisir de prendre soin de votre peau !`;
                            openWhatsApp(clientPhone, msg);
                          }}
                          className="h-8 rounded-lg text-xs gap-1.5 text-[#128C7E] dark:text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10"
                        >
                          <MessageCircle className="size-3.5" />
                          Remercier par WhatsApp
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* CONTENU ONGLET 2 : Commandes en Ligne */}
      {activeTab === "online" && (
        <div className="space-y-3">
          {loading && !data ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Chargement des commandes en ligne...</p>
            </div>
          ) : !data || data.orders.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-border text-center space-y-2 bg-card/50">
              <Package className="size-10 text-muted-foreground/60 mx-auto" />
              <p className="font-heading font-semibold text-sm">Aucune commande trouvée</p>
              <p className="text-xs text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "Essaie de modifier tes critères de filtre ou de recherche."
                  : "Les commandes de soins passées par les clientes apparaîtront ici."}
              </p>
            </div>
          ) : (
            data.orders.map((o) => {
              const statusConfig = ORDER_STATUS_LABELS[o.status] || ORDER_STATUS_LABELS.pending;
              const StatusIcon = statusConfig.icon;
              const clientPhone = o.deliveryPhone || o.user.phone;

              return (
                <Card key={o.id} className="border-border/80 hover:border-border transition-all overflow-hidden">
                  <CardContent className="p-4 sm:p-5 space-y-4">
                    {/* Ligne 1 : En-tête de la commande */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-border/60">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-muted text-foreground">
                          COMMANDE #{o.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(o.createdAt)} à {formatTime(o.createdAt)}
                        </span>
                        {o.couponCode && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                            Code : {o.couponCode} (-{xof(o.discount)})
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={`gap-1 px-2.5 py-0.5 text-xs font-semibold border ${statusConfig.color}`}>
                          <StatusIcon className="size-3" />
                          {statusConfig.label}
                        </Badge>

                        {/* Sélecteur de statut rapide pour l'administrateur */}
                        <Select
                          value={o.status}
                          onValueChange={(val) => handleStatusChange(o.id, val)}
                          disabled={updatingId === o.id}
                        >
                          <SelectTrigger className="h-7 w-36 rounded-lg text-xs font-medium border-border/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="paid">Payée</SelectItem>
                            <SelectItem value="preparing">En préparation</SelectItem>
                            <SelectItem value="in_transit">Prêt / En cours</SelectItem>
                            <SelectItem value="delivered">Remise à la cliente</SelectItem>
                            <SelectItem value="cancelled">Annulée</SelectItem>
                            <SelectItem value="pending">En attente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Ligne 2 : Détails Client & Retrait / Destination */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      {/* Cliente */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                        <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <User className="size-3 text-primary" />
                          Cliente &amp; Contact
                        </p>
                        <p className="font-heading font-bold text-sm text-foreground">{o.user.name}</p>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Phone className="size-3" />
                          {clientPhone}
                        </p>
                        {o.user.email && <p className="text-muted-foreground text-[11px] truncate">{o.user.email}</p>}
                      </div>

                      {/* Modalité de mise à disposition */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                        <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <MapPin className="size-3 text-primary" />
                          Mise à disposition / Lieu
                        </p>
                        <p className="font-semibold text-foreground">
                          {o.deliveryArea ? `${o.deliveryArea} (${o.deliveryCity?.toUpperCase() || "ABIDJAN"})` : o.deliveryCity?.toUpperCase() || "Retrait en institut"}
                        </p>
                        {o.deliveryAddress ? (
                          <p className="text-muted-foreground line-clamp-2">{o.deliveryAddress}</p>
                        ) : (
                          <p className="text-muted-foreground/60 italic">À retirer auprès de l&apos;institut partenaire</p>
                        )}
                        {o.deliveryNotes && (
                          <p className="text-amber-600 dark:text-amber-400 text-[11px] italic">
                            Note : « {o.deliveryNotes} »
                          </p>
                        )}
                      </div>

                      {/* Règlement */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                        <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <ShoppingBag className="size-3 text-primary" />
                          Règlement
                        </p>
                        <div className="flex items-baseline justify-between">
                          <span className="text-muted-foreground">Total payé :</span>
                          <span className="font-heading font-black text-base text-foreground">{xof(o.total)}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex justify-between">
                          <span>Service :</span>
                          <span>{o.shippingFee > 0 ? xof(o.shippingFee) : "Inclus"}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex justify-between">
                          <span>Passerelle :</span>
                          <span className="font-medium uppercase text-foreground">
                            {o.payment?.method || "SasPay"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Ligne 3 : Articles commandés */}
                    <div className="p-3 rounded-xl bg-background border border-border/70 space-y-2">
                      <p className="font-bold text-[11px] text-muted-foreground uppercase tracking-wide">
                        Soins &amp; Produits ({o.items.reduce((s, i) => s + i.qty, 0)})
                      </p>
                      <div className="divide-y divide-border/40 text-xs">
                        {o.items.map((item) => (
                          <div key={item.id} className="py-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-primary">{item.qty}x</span>
                              <span className="font-medium text-foreground">{item.label}</span>
                              {item.product?.tenant && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                  Institut : {item.product.tenant.name}
                                </Badge>
                              )}
                            </div>
                            <span className="font-semibold text-foreground">{xof(item.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ligne 4 : Actions rapides */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const sellerName = o.items[0]?.product?.tenant?.name || "votre institut partenaire";
                          const msg = `Bonjour ${o.user.name} ! 🌿 C'est l'équipe Kènè au sujet de votre commande de soins #${o.id.slice(-6).toUpperCase()} d'un montant de ${xof(o.total)} auprès de ${sellerName}. Vos produits sont prêts pour vous.`;
                          openWhatsApp(clientPhone, msg);
                        }}
                        className="h-8 rounded-lg text-xs gap-1.5 text-[#128C7E] dark:text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10"
                      >
                        <MessageCircle className="size-3.5" />
                        WhatsApp Cliente
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="h-8 rounded-lg text-xs gap-1.5 border-border"
                      >
                        <a href={`/api/orders/invoice?id=${encodeURIComponent(o.id)}`} target="_blank" rel="noopener noreferrer">
                          <Download className="size-3.5" />
                          Bordereau / Reçu
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
