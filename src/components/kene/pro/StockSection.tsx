"use client";
// Kènè Pro — Stock: inventaire organisé par familles dermo-botaniques,
// distinction Revente Boutique vs Usage Cabine, alertes réassort & traçabilité
import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Filter,
  Info,
  Package,
  PackageCheck,
  PackagePlus,
  PackageX,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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
import {
  PRODUCT_CATEGORIES,
  getProductCategoryMeta,
  getCategoryToneBadgeClass,
  type CategoryMeta,
} from "@/lib/kene/catalog-taxonomy";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, KenteTop, Money, SectionHeader } from "./ui-bits";
import type { ProSectionId } from "./ProApp";
import type { StockResponse, ProProduct } from "./types";

const MOVEMENT_STYLES: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  in: { label: "Entrée", cls: "bg-success/15 text-success border-success/30", icon: <ArrowDownLeft className="size-3" aria-hidden="true" /> },
  out: { label: "Sortie", cls: "bg-terre/15 text-terre border-terre/30", icon: <ArrowUpRight className="size-3" aria-hidden="true" /> },
  loss: { label: "Perte", cls: "bg-bissap/15 text-destructive border-bissap/30", icon: <Trash2 className="size-3" aria-hidden="true" /> },
  adjust: { label: "Ajustement", cls: "bg-muted text-muted-foreground border-border", icon: <PackagePlus className="size-3" aria-hidden="true" /> },
};

/** Détecte si un produit est destiné à l'usage cabine (soin professionnel) */
function isCabinProduct(p: ProProduct): boolean {
  const str = `${p.name} ${p.brandLine ?? ""} ${p.description ?? ""}`.toLowerCase();
  return (
    str.includes("cabine") ||
    str.includes("pro") ||
    str.includes("professionnel") ||
    str.includes("technique") ||
    str.includes("bac")
  );
}

export function StockSection({ tenantId, onNavigate }: { tenantId: string; onNavigate?: (s: ProSectionId) => void }) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"in" | "out" | "loss">("in");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Filtres d'organisation du stock
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "retail" | "cabin">("all");
  const [healthFilter, setHealthFilter] = useState<"all" | "healthy" | "alert" | "out">("all");

  const stock = useApi<StockResponse>(
    () => (tenantId ? apiGet<StockResponse>(`/api/pro/stock?tenantId=${tenantId}`) : Promise.resolve({ products: [], movements: [] })),
    [tenantId],
    { cacheKey: `kene_pro_stock_${tenantId || "default"}` }
  );

  const products = stock.data?.products ?? [];
  const movements = stock.data?.movements ?? [];

  // Découverte dynamique de toutes les catégories (standard + personnalisées de l'institut)
  const allCategories = useMemo(() => {
    const list: CategoryMeta[] = [...PRODUCT_CATEGORIES];
    const existingIds = new Set(PRODUCT_CATEGORIES.map((c) => c.id.toLowerCase()));
    for (const p of products) {
      if (p.category && !existingIds.has(p.category.toLowerCase())) {
        existingIds.add(p.category.toLowerCase());
        list.push(getProductCategoryMeta(p.category));
      }
    }
    return list;
  }, [products]);

  // Compteurs par catégorie
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      const cat = p.category?.toLowerCase() || "autre";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [products]);

  // Métriques de santé et de destination
  const totalUnits = useMemo(() => products.reduce((s, p) => s + p.stock, 0), [products]);
  const totalValue = useMemo(() => products.reduce((s, p) => s + p.stock * p.price, 0), [products]);
  const alerts = useMemo(() => products.filter((p) => p.stock > 0 && p.stock <= p.stockAlert), [products]);
  const outOfStock = useMemo(() => products.filter((p) => p.stock === 0), [products]);
  const healthyProducts = useMemo(() => products.filter((p) => p.stock > p.stockAlert), [products]);
  const retailProducts = useMemo(() => products.filter((p) => !isCabinProduct(p)), [products]);
  const cabinProducts = useMemo(() => products.filter((p) => isCabinProduct(p)), [products]);

  // Produits filtrés selon la recherche, catégorie, usage et santé du stock
  const filteredProducts = useMemo(() => {
    let list = products;

    // 1. Recherche textuelle
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.botanicals?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.brandLine?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    // 2. Filtre par catégorie de produit
    if (categoryFilter !== "all") {
      list = list.filter((p) => p.category?.toLowerCase() === categoryFilter.toLowerCase());
    }

    // 3. Filtre par usage (Revente vs Cabine Pro)
    if (usageFilter === "retail") {
      list = list.filter((p) => !isCabinProduct(p));
    } else if (usageFilter === "cabin") {
      list = list.filter((p) => isCabinProduct(p));
    }

    // 4. Filtre par santé de stock
    if (healthFilter === "alert") {
      list = list.filter((p) => p.stock > 0 && p.stock <= p.stockAlert);
    } else if (healthFilter === "out") {
      list = list.filter((p) => p.stock === 0);
    } else if (healthFilter === "healthy") {
      list = list.filter((p) => p.stock > p.stockAlert);
    }

    return list;
  }, [products, searchQuery, categoryFilter, usageFilter, healthFilter]);

  // Produit actuellement sélectionné pour le mouvement
  const selectedProduct = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  // Calcul du stock projeté
  const projectedStock = useMemo(() => {
    if (!selectedProduct) return null;
    const n = Number(qty) || 0;
    if (type === "in") return selectedProduct.stock + n;
    return Math.max(0, selectedProduct.stock - n);
  }, [selectedProduct, qty, type]);

  const hasStockDeficit = useMemo(() => {
    if (!selectedProduct || type === "in") return false;
    const n = Number(qty) || 0;
    return n > selectedProduct.stock;
  }, [selectedProduct, qty, type]);

  // Ouverture du dialogue de mouvement avec pré-sélection facultative
  function openMovement(preselectedId?: string) {
    if (preselectedId) {
      setProductId(preselectedId);
    } else if (!productId && products.length > 0) {
      setProductId(products[0].id);
    }
    setType("in");
    setQty("1");
    setReason("");
    setMoveOpen(true);
  }

  async function submitMovement() {
    const n = Number(qty);
    if (!productId || !n || n <= 0) {
      toast.error("Veuillez choisir un produit et une quantité valide");
      return;
    }

    if (hasStockDeficit) {
      toast.error(`Stock insuffisant (${selectedProduct?.stock} disponible(s)) pour effectuer une sortie de ${n} unités`);
      return;
    }

    setBusy(true);
    try {
      await apiPost("/api/pro/stock", {
        tenantId,
        productId,
        type,
        qty: n,
        reason:
          reason.trim() ||
          (type === "in"
            ? "Réassort fournisseur"
            : type === "out"
              ? "Utilisation en soin cabine"
              : "Casse / flacon endommagé"),
      });
      toast.success(
        type === "in"
          ? "Entrée de stock enregistrée (+ " + n + ")"
          : type === "out"
            ? "Sortie de stock enregistrée (- " + n + ")"
            : "Perte enregistrée (- " + n + ")"
      );
      setMoveOpen(false);
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
        title="Stock & Inventaire"
        sub={`${products.length} références dermo-botaniques · ${totalUnits} unités en rayon`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onNavigate?.("catalogue")} className="hidden sm:inline-flex text-xs">
              Catalogue
            </Button>
            <Button onClick={() => openMovement()} className="gap-1.5 font-semibold text-xs sm:text-sm">
              <PackagePlus className="size-4" aria-hidden="true" /> + Mouvement
            </Button>
          </div>
        }
      />

      {/* ───────── 4 Cartes Métriques (KPIs) ───────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Références */}
        <Card className="k-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Références</span>
            <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Package className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="font-heading text-xl font-bold">{products.length}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {retailProducts.length} revente · {cabinProducts.length} cabine
            </p>
          </div>
        </Card>

        {/* Valeur totale */}
        <Card className="k-card p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Valeur Stock</span>
            <div className="grid size-7 place-items-center rounded-lg bg-gold/15 text-gold-text">
              <Money value={totalValue} className="hidden" />
              <PackageCheck className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="font-heading text-xl font-bold">
              <Money value={totalValue} compact />
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Valorisation catalogue</p>
          </div>
        </Card>

        {/* Alertes réassort (cliquable pour filtrer) */}
        <button
          onClick={() => setHealthFilter((prev) => (prev === "alert" ? "all" : "alert"))}
          className={cn(
            "k-card p-3.5 flex flex-col justify-between text-left transition-all rounded-2xl border",
            healthFilter === "alert"
              ? "ring-2 ring-bissap border-bissap bg-bissap/10"
              : alerts.length > 0
                ? "border-bissap/40 hover:bg-bissap/5 cursor-pointer"
                : "border-border opacity-70"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Sous Seuil</span>
            <div className={cn("grid size-7 place-items-center rounded-lg", alerts.length > 0 ? "bg-bissap/15 text-bissap" : "bg-muted text-muted-foreground")}>
              <AlertTriangle className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className={cn("font-heading text-xl font-bold", alerts.length > 0 ? "text-bissap" : "")}>
              {alerts.length}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {alerts.length > 0 ? "À réapprovisionner (clic pour filtrer)" : "Aucune alerte"}
            </p>
          </div>
        </button>

        {/* Ruptures totales (cliquable pour filtrer) */}
        <button
          onClick={() => setHealthFilter((prev) => (prev === "out" ? "all" : "out"))}
          className={cn(
            "k-card p-3.5 flex flex-col justify-between text-left transition-all rounded-2xl border",
            healthFilter === "out"
              ? "ring-2 ring-destructive border-destructive bg-destructive/10"
              : outOfStock.length > 0
                ? "border-destructive/40 hover:bg-destructive/5 cursor-pointer"
                : "border-border opacity-70"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Ruptures</span>
            <div className={cn("grid size-7 place-items-center rounded-lg", outOfStock.length > 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
              <PackageX className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className={cn("font-heading text-xl font-bold", outOfStock.length > 0 ? "text-destructive" : "")}>
              {outOfStock.length}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {outOfStock.length > 0 ? "Stock épuisé (clic pour filtrer)" : "Aucune rupture"}
            </p>
          </div>
        </button>
      </div>

      {/* ───────── Barre de Recherche & Filtres Multi-Axes ───────── */}
      <Card className="k-card p-3.5 space-y-3">
        {/* Ligne 1 : Recherche + Destination (Revente vs Cabine) + Statut */}
        <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
          {/* Champ de recherche */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par nom, plante (karité, baobab, moringa…), catégorie…"
              className="pl-9 pr-8 h-9 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Effacer la recherche"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Filtre Destination d'Usage */}
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-xl shrink-0 self-start md:self-auto">
            <button
              onClick={() => setUsageFilter("all")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                usageFilter === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tous ({products.length})
            </button>
            <button
              onClick={() => setUsageFilter("retail")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1",
                usageFilter === "retail" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
              title="Produits scellés destinés à la vente aux clientes au comptoir"
            >
              <ShoppingBag className="size-3 text-gold-text" /> Revente ({retailProducts.length})
            </button>
            <button
              onClick={() => setUsageFilter("cabin")}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1",
                usageFilter === "cabin" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
              title="Consommables techniques réservés aux soins en cabine"
            >
              <Sparkles className="size-3 text-primary" /> Cabine ({cabinProducts.length})
            </button>
          </div>

          {/* Filtre État de santé */}
          <div className="shrink-0">
            <Select value={healthFilter} onValueChange={(v: any) => setHealthFilter(v)}>
              <SelectTrigger className="h-9 text-xs w-[160px]" aria-label="Filtrer par état de stock">
                <SelectValue placeholder="État du stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les états ({products.length})</SelectItem>
                <SelectItem value="healthy">🟢 Stock Sain ({healthyProducts.length})</SelectItem>
                <SelectItem value="alert">🟡 Sous Seuil ({alerts.length})</SelectItem>
                <SelectItem value="out">🔴 En Rupture ({outOfStock.length})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Ligne 2 : Puces de Catégories Dermo-Botaniques (Scroll Horizontal) */}
        <div className="pt-1 border-t border-border/40">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shrink-0 transition-colors",
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              Toutes les familles
              <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", categoryFilter === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/60")}>
                {products.length}
              </span>
            </button>

            {allCategories.map((cat) => {
              const count = categoryCounts[cat.id.toLowerCase()] || 0;
              const active = categoryFilter.toLowerCase() === cat.id.toLowerCase();
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(active ? "all" : cat.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shrink-0 transition-colors border",
                    active
                      ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
                      : getCategoryToneBadgeClass(cat.tone)
                  )}
                >
                  {cat.shortLabel}
                  <span className={cn("rounded-full px-1.5 py-0.2 text-[10px]", active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-black/10 dark:bg-white/10")}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ───────── Corps : Inventaire & Mouvements ───────── */}
      {stock.error && !stock.data ? (
        typeof navigator !== "undefined" && !navigator.onLine ? (
          <Card className="p-8 text-center space-y-3">
            <EmptyState
              label="Stock hors-ligne"
              sub="L'inventaire de vos produits n'a pas encore été synchronisé sur cet appareil. Vos stocks s'afficheront dès la reconnexion."
            />
            <Button onClick={stock.refetch} variant="outline" className="text-xs">
              Réessayer la connexion
            </Button>
          </Card>
        ) : (
          <ErrorState message={`Stock indisponible : ${stock.error}`} onRetry={stock.refetch} />
        )
      ) : stock.loading && !stock.data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4 items-start">
          {/* ────── Tableau d'inventaire organisé ────── */}
          <Card className="overflow-hidden k-card">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-heading text-base flex items-center gap-2">
                    <span>Inventaire des Références</span>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {filteredProducts.length} affiché{filteredProducts.length > 1 ? "s" : ""}
                    </Badge>
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {searchQuery || categoryFilter !== "all" || usageFilter !== "all" || healthFilter !== "all"
                      ? "Filtres actifs — liste ciblée"
                      : "Vue complète des articles en stock"}
                  </p>
                </div>
                {(searchQuery || categoryFilter !== "all" || usageFilter !== "all" || healthFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setCategoryFilter("all");
                      setUsageFilter("all");
                      setHealthFilter("all");
                    }}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Réinitialiser
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredProducts.length === 0 ? (
                <EmptyState
                  label="Aucun produit trouvé"
                  sub={
                    searchQuery || categoryFilter !== "all" || usageFilter !== "all" || healthFilter !== "all"
                      ? "Modifiez vos filtres ou termes de recherche pour afficher les articles."
                      : "Ajoutez des produits depuis le Catalogue."
                  }
                />
              ) : (
                <div className="overflow-x-auto pretty-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/40 bg-muted/30">
                        <TableHead className="min-w-[220px]">Produit & Botaniques</TableHead>
                        <TableHead className="min-w-[130px]">Famille & Usage</TableHead>
                        <TableHead className="text-right min-w-[140px]">Niveau de Stock</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Seuil</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Valeur</TableHead>
                        <TableHead className="text-right pr-4">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {filteredProducts.map((p) => {
                        const catMeta = getProductCategoryMeta(p.category);
                        const isCabin = isCabinProduct(p);
                        const isAlert = p.stock > 0 && p.stock <= p.stockAlert;
                        const isOut = p.stock === 0;

                        // Jauge de stock en pourcentage (par rapport à 2.5x le seuil)
                        const gaugeMax = Math.max(p.stockAlert * 2.5, 20);
                        const gaugePct = Math.min(100, Math.round((p.stock / gaugeMax) * 100));

                        return (
                          <TableRow
                            key={p.id}
                            className={cn(
                              "transition-colors",
                              isOut && "bg-destructive/[0.04]",
                              isAlert && "bg-bissap/[0.03]"
                            )}
                          >
                            {/* Nom & Botaniques */}
                            <TableCell className="py-3">
                              <div className="flex items-center gap-3">
                                <div className="size-11 rounded-xl overflow-hidden border border-border/60 bg-muted shrink-0 relative">
                                  <img
                                    src={p.hasPhoto ? `/api/media/product/${p.id}` : p.image}
                                    alt={p.name}
                                    className="size-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                                  <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                    <span>🌿 {p.botanicals || "Formule Kènè"}</span>
                                  </p>
                                </div>
                              </div>
                            </TableCell>

                            {/* Famille & Destination (Revente vs Cabine) */}
                            <TableCell className="py-3">
                              <div className="flex flex-col gap-1 items-start">
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] px-2 py-0.5 border font-medium", getCategoryToneBadgeClass(catMeta.tone))}
                                >
                                  {catMeta.shortLabel}
                                </Badge>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.2 rounded-md",
                                    isCabin
                                      ? "bg-primary/10 text-primary"
                                      : "bg-gold/15 text-gold-text"
                                  )}
                                  title={isCabin ? "Produit réservé aux protocoles cabine" : "Produit destiné à la revente au comptoir"}
                                >
                                  {isCabin ? (
                                    <>
                                      <Sparkles className="size-2.5" /> Cabine
                                    </>
                                  ) : (
                                    <>
                                      <ShoppingBag className="size-2.5" /> Revente
                                    </>
                                  )}
                                </span>
                              </div>
                            </TableCell>

                            {/* Niveau de stock + Jauge visuelle */}
                            <TableCell className="text-right py-3">
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "font-mono text-sm font-bold tabular-nums",
                                      isOut ? "text-destructive" : isAlert ? "text-bissap" : "text-foreground"
                                    )}
                                  >
                                    {p.stock}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">unités</span>
                                </div>

                                {/* Jauge visuelle */}
                                <div className="w-20 sm:w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-300",
                                      isOut
                                        ? "w-0"
                                        : isAlert
                                          ? "bg-bissap"
                                          : "bg-success"
                                    )}
                                    style={{ width: `${gaugePct}%` }}
                                  />
                                </div>

                                {isOut ? (
                                  <span className="text-[9px] font-bold text-destructive flex items-center gap-0.5">
                                    <PackageX className="size-2.5" /> Rupture
                                  </span>
                                ) : isAlert ? (
                                  <span className="text-[9px] font-bold text-bissap flex items-center gap-0.5">
                                    <AlertTriangle className="size-2.5" /> Alerte réassort
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-medium text-success flex items-center gap-0.5">
                                    <CheckCircle2 className="size-2.5" /> En stock
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            {/* Seuil d'alerte */}
                            <TableCell className="text-right hidden sm:table-cell font-mono text-xs text-muted-foreground tabular-nums py-3">
                              ≤ {p.stockAlert}
                            </TableCell>

                            {/* Valeur marchande */}
                            <TableCell className="text-right hidden md:table-cell py-3">
                              <Money value={p.stock * p.price} className="text-xs font-semibold" />
                            </TableCell>

                            {/* Action rapide : mouvement */}
                            <TableCell className="text-right pr-4 py-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openMovement(p.id)}
                                className="h-7 px-2 text-[11px] font-medium gap-1 hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                              >
                                <PackagePlus className="size-3" />
                                <span className="hidden sm:inline">Mouvement</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ────── Journal des 50 Derniers Mouvements ────── */}
          <Card className="overflow-hidden k-card">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-heading text-base">Traçabilité des Mouvements</CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Historique des entrées, sorties cabine, ventes et pertes
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {movements.length} récents
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <EmptyState label="Aucun mouvement enregistré" sub="Enregistrez une entrée ou sortie via le bouton Mouvement." />
              ) : (
                <ul className="max-h-[580px] overflow-y-auto pretty-scroll divide-y divide-border/40">
                  {movements.slice(0, 40).map((m) => {
                    const st = MOVEMENT_STYLES[m.type] ?? MOVEMENT_STYLES.adjust;
                    const catMeta = m.product.category ? getProductCategoryMeta(m.product.category) : null;
                    return (
                      <li key={m.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className="mt-0.5">
                          <Badge variant="outline" className={cn("text-[10px] gap-1 shrink-0 px-2 py-0.5 border", st.cls)}>
                            {st.icon} {st.label}
                          </Badge>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-semibold text-foreground">{m.product.name}</p>
                            {catMeta && (
                              <span className={cn("text-[9px] px-1.5 py-0.2 rounded-md font-medium border hidden sm:inline-block", getCategoryToneBadgeClass(catMeta.tone))}>
                                {catMeta.shortLabel}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <span>{m.reason}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={cn(
                              "font-mono text-xs font-bold tabular-nums",
                              m.type === "in" ? "text-success" : m.type === "loss" ? "text-destructive" : "text-terre"
                            )}
                          >
                            {m.type === "in" ? "+" : "−"}
                            {m.qty}
                          </p>
                          <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                            {formatDate(m.createdAt, { day: "2-digit", month: "2-digit" })} {formatTime(m.createdAt)}
                          </p>
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

      {/* ───────── Modal de Saisie de Mouvement Sécurisé (Anti-Erreur) ───────── */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">Enregistrer un Mouvement de Stock</DialogTitle>
            <DialogDescription className="text-xs">
              Mettez à jour les stocks en précisant la destination : utilisation en cabine, vente au comptoir ou réapprovisionnement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* 1. Sélection du Produit */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sélectionnez le Produit</Label>
              <Select value={productId || undefined} onValueChange={setProductId}>
                <SelectTrigger aria-label="Sélectionnez le produit" className="h-10 text-xs">
                  <SelectValue placeholder="Choisir un produit…" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {products.map((p) => {
                    const isCabin = isCabinProduct(p);
                    const catMeta = getProductCategoryMeta(p.category);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span className="font-medium text-xs truncate">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            [{catMeta.shortLabel}] · {isCabin ? "Cabine" : "Revente"} (Stock: {p.stock})
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Carte Aperçu du Produit Sélectionné */}
            {selectedProduct && (
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-10 rounded-lg overflow-hidden border bg-muted shrink-0">
                    <img
                      src={selectedProduct.hasPhoto ? `/api/media/product/${selectedProduct.id}` : selectedProduct.image}
                      alt={selectedProduct.name}
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-xs text-foreground truncate">{selectedProduct.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {getProductCategoryMeta(selectedProduct.category).shortLabel}
                      </span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">
                        {isCabinProduct(selectedProduct) ? "Usage Cabine Pro" : "Revente Boutique"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-muted-foreground block">Stock actuel</span>
                  <span className={cn("font-mono text-sm font-bold", selectedProduct.stock <= selectedProduct.stockAlert ? "text-bissap" : "text-foreground")}>
                    {selectedProduct.stock} unités
                  </span>
                </div>
              </div>
            )}

            {/* 3. Type de Mouvement (3 Puces) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Type d&apos;opération</Label>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-1" role="tablist">
                <button
                  type="button"
                  onClick={() => setType("in")}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                    type === "in" ? "bg-background text-success shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowDownLeft className="size-3.5" /> Entrée (Réassort)
                </button>
                <button
                  type="button"
                  onClick={() => setType("out")}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                    type === "out" ? "bg-background text-terre shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowUpRight className="size-3.5" /> Sortie (Soin / Vente)
                </button>
                <button
                  type="button"
                  onClick={() => setType("loss")}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                    type === "loss" ? "bg-background text-destructive shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Trash2 className="size-3.5" /> Perte / Casse
                </button>
              </div>
            </div>

            {/* 4. Quantité & Calcul du Nouveau Stock */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stock-qty" className="text-xs font-medium">
                  Quantité à {type === "in" ? "ajouter" : "déduire"}
                </Label>
                <Input
                  id="stock-qty"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
                  className="font-mono text-sm h-9"
                  placeholder="1"
                />
              </div>

              {/* Prévision du stock résultant */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Nouveau Stock Projeté</Label>
                <div className="h-9 px-3 rounded-lg border bg-muted/40 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">{selectedProduct?.stock ?? 0}</span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <span
                    className={cn(
                      "font-mono text-sm font-bold",
                      hasStockDeficit ? "text-destructive" : (projectedStock ?? 0) <= (selectedProduct?.stockAlert ?? 0) ? "text-bissap" : "text-success"
                    )}
                  >
                    {projectedStock ?? "—"} unités
                  </span>
                </div>
              </div>
            </div>

            {/* Alerte si tentative de sortie supérieure au stock */}
            {hasStockDeficit && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>
                  Quantité demandée ({qty}) supérieure au stock disponible ({selectedProduct?.stock}).
                </span>
              </div>
            )}

            {/* 5. Motifs Rapides Prédéfinis d'Institut */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Motif de l&apos;opération</Label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {type === "out" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setReason("Utilisation en cabine (Protocole de soin)")}
                      className="text-[10px] px-2 py-1 rounded-md border border-primary/30 bg-primary/5 hover:bg-primary/15 text-primary transition-colors"
                    >
                      ✨ Soin en cabine
                    </button>
                    <button
                      type="button"
                      onClick={() => setReason("Vente directe au comptoir")}
                      className="text-[10px] px-2 py-1 rounded-md border border-gold/30 bg-gold/5 hover:bg-gold/15 text-gold-text transition-colors"
                    >
                      🛍️ Vente comptoir
                    </button>
                    <button
                      type="button"
                      onClick={() => setReason("Mise à disposition testeur cabine")}
                      className="text-[10px] px-2 py-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
                    >
                      🧴 Testeur cabine
                    </button>
                    <button
                      type="button"
                      onClick={() => setReason("Flacon cassé ou endommagé")}
                      className="text-[10px] px-2 py-1 rounded-md border border-destructive/30 bg-destructive/5 hover:bg-destructive/15 text-destructive transition-colors"
                    >
                      ⚠️ Casse / Défaut
                    </button>
                  </>
                ) : type === "in" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setReason("Réassort / Livraison fournisseur Kènè")}
                      className="text-[10px] px-2 py-1 rounded-md border border-success/30 bg-success/5 hover:bg-success/15 text-success transition-colors"
                    >
                      📦 Réassort fournisseur
                    </button>
                    <button
                      type="button"
                      onClick={() => setReason("Retour cliente après échange")}
                      className="text-[10px] px-2 py-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
                    >
                      🔄 Retour cliente
                    </button>
                    <button
                      type="button"
                      onClick={() => setReason("Régularisation suite à inventaire physique")}
                      className="text-[10px] px-2 py-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
                    >
                      📋 Régularisation inventaire
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setReason("Flacon brisé / Casse en cabine")}
                      className="text-[10px] px-2 py-1 rounded-md border border-destructive/30 bg-destructive/5 hover:bg-destructive/15 text-destructive transition-colors"
                    >
                      💥 Flacon brisé
                    </button>
                    <button
                      type="button"
                      onClick={() => setReason("Date limite d'utilisation optimale dépassée")}
                      className="text-[10px] px-2 py-1 rounded-md border border-destructive/30 bg-destructive/5 hover:bg-destructive/15 text-destructive transition-colors"
                    >
                      ⏳ Produit périmé
                    </button>
                  </>
                )}
              </div>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ou saisissez un motif personnalisé…"
                className="text-xs h-9"
              />
            </div>

            {/* Bouton de validation */}
            <Button
              disabled={busy || !selectedProduct || hasStockDeficit}
              onClick={submitMovement}
              className="w-full font-semibold mt-2 text-xs sm:text-sm h-10"
            >
              {busy ? "Enregistrement en cours…" : "Valider le mouvement de stock"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
