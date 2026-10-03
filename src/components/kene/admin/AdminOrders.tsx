"use client";
// Kènè — Console Admin · Gestion centralisée des commandes boutique
// 1. Liste complète et en temps réel de toutes les commandes du réseau
// 2. Filtrage par statut (payé, en préparation, en cours de livraison, livré, annulé)
// 3. Changement direct de statut d'expédition (préparateur / coursier)
// 4. Lien direct vers la facture PDF et contact WhatsApp client

import { useEffect, useState, useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

interface OrdersResponse {
  orders: AdminOrder[];
  stats: {
    total: number;
    paid: number;
    preparing: number;
    inTransit: number;
    delivered: number;
    pending: number;
    cancelled: number;
    totalRevenue: number;
  };
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "En attente", color: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Clock },
  paid: { label: "Payée (SasPay)", color: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: CheckCircle2 },
  preparing: { label: "En préparation", color: "bg-purple-500/15 text-purple-600 border-purple-500/30", icon: Package },
  in_transit: { label: "En cours de livraison", color: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30", icon: Truck },
  delivered: { label: "Livrée", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  cancelled: { label: "Annulée", color: "bg-rose-500/15 text-rose-600 border-rose-500/30", icon: XCircle },
};

export function AdminOrders() {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
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
      toast.error("Erreur de chargement des commandes", {
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
            Commandes Boutique en Ligne
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Suivi centralisé des ventes de produits, expéditions et encaissements SasPay
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
            icon={<ShoppingBag className="size-4" />}
            label="Total Commandes"
            value={String(data.stats.total)}
            monetary={false}
          />
          <KpiCard
            icon={<CheckCircle2 className="size-4" />}
            label="Chiffre d'Affaires"
            value={xof(data.stats.totalRevenue, { compact: true })}
            monetary={false}
            hint={`${data.stats.paid + data.stats.delivered} commandes payées`}
          />
          <KpiCard
            icon={<Truck className="size-4" />}
            label="En Préparation / Transit"
            value={String(data.stats.preparing + data.stats.inTransit)}
            monetary={false}
            hint="À expédier"
          />
          <KpiCard
            icon={<Clock className="size-4" />}
            label="Livrées avec Succès"
            value={String(data.stats.delivered)}
            monetary={false}
          />
        </div>
      )}

      {/* Filtres & Recherche */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Rechercher par cliente, téléphone, ville, commune ou réf..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl h-10 text-sm"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-56 rounded-xl h-10 text-sm">
            <Filter className="size-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="paid">Payées (SasPay)</SelectItem>
            <SelectItem value="preparing">En préparation</SelectItem>
            <SelectItem value="in_transit">En livraison</SelectItem>
            <SelectItem value="delivered">Livrées</SelectItem>
            <SelectItem value="pending">En attente de paiement</SelectItem>
            <SelectItem value="cancelled">Annulées</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Liste des Commandes */}
      <div className="space-y-3">
        {loading && !data ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">Chargement des commandes du réseau...</p>
          </div>
        ) : !data || data.orders.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-border text-center space-y-2 bg-card/50">
            <Package className="size-10 text-muted-foreground/60 mx-auto" />
            <p className="font-heading font-semibold text-sm">Aucune commande trouvée</p>
            <p className="text-xs text-muted-foreground">
              {search || statusFilter !== "all"
                ? "Essaie de modifier tes critères de filtre ou de recherche."
                : "Les commandes passées sur la boutique apparaîtront ici en temps réel."}
            </p>
          </div>
        ) : (
          data.orders.map((o) => {
            const statusConfig = STATUS_LABELS[o.status] || STATUS_LABELS.pending;
            const StatusIcon = statusConfig.icon;
            const clientPhone = o.deliveryPhone || o.user.phone;

            return (
              <Card key={o.id} className="border-border/80 hover:border-border transition-all overflow-hidden">
                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Ligne 1 : En-tête de la commande */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-muted text-foreground">
                        #{o.id.slice(-6).toUpperCase()}
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
                        <SelectTrigger className="h-7 w-32 rounded-lg text-xs font-medium border-border/80">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="paid">Payée</SelectItem>
                          <SelectItem value="preparing">Préparation</SelectItem>
                          <SelectItem value="in_transit">En livraison</SelectItem>
                          <SelectItem value="delivered">Livrée</SelectItem>
                          <SelectItem value="cancelled">Annulée</SelectItem>
                          <SelectItem value="pending">En attente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Ligne 2 : Détails Client & Livraison + Panier */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    {/* Colonne 1 : Cliente & Contact */}
                    <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                      <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <User className="size-3 text-primary" />
                        Cliente & Contact
                      </p>
                      <p className="font-heading font-bold text-sm text-foreground">{o.user.name}</p>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Phone className="size-3" />
                        {clientPhone}
                      </p>
                      {o.user.email && <p className="text-muted-foreground text-[11px] truncate">{o.user.email}</p>}
                    </div>

                    {/* Colonne 2 : Destination de livraison */}
                    <div className="space-y-1.5 p-3 rounded-xl bg-muted/40 border border-border/50">
                      <p className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="size-3 text-primary" />
                        Livraison
                      </p>
                      <p className="font-semibold text-foreground">
                        {o.deliveryArea ? `${o.deliveryArea} (${o.deliveryCity?.toUpperCase() || "ABIDJAN"})` : o.deliveryCity?.toUpperCase() || "Non spécifié"}
                      </p>
                      {o.deliveryAddress ? (
                        <p className="text-muted-foreground line-clamp-2">{o.deliveryAddress}</p>
                      ) : (
                        <p className="text-muted-foreground/60 italic">Adresse détaillée non renseignée</p>
                      )}
                      {o.deliveryNotes && (
                        <p className="text-amber-600 dark:text-amber-400 text-[11px] italic">
                          Note : « {o.deliveryNotes} »
                        </p>
                      )}
                    </div>

                    {/* Colonne 3 : Encaissement & Total */}
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
                        <span>Frais de port :</span>
                        <span>{o.shippingFee > 0 ? xof(o.shippingFee) : "Offert"}</span>
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
                      Articles ({o.items.reduce((s, i) => s + i.qty, 0)})
                    </p>
                    <div className="divide-y divide-border/40 text-xs">
                      {o.items.map((item) => (
                        <div key={item.id} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-primary">{item.qty}x</span>
                            <span className="font-medium text-foreground">{item.label}</span>
                            {item.product?.tenant && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                Vendeur : {item.product.tenant.name}
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
                        const msg = `Bonjour ${o.user.name} ! 🌿 C'est l'équipe Kènè au sujet de votre commande #${o.id.slice(-6).toUpperCase()} d'un montant de ${xof(o.total)}. Votre colis est en cours de traitement.`;
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
                        Bordereau / Facture
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
