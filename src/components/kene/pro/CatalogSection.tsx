"use client";
// Kènè Pro — Catalogue : soins & produits, création/édition, activation
import { useState } from "react";
import { Clock, MoreVertical, Package, Pencil, Percent, Plus, Power, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiGet, apiPatch, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, Money, SectionHeader } from "./ui-bits";
import type { ProCatalog, ProProduct, ProService } from "./types";

const SERVICE_CATS = ["soin", "gommage", "massage", "diagnostic", "consultation"] as const;
const PRODUCT_CATS = ["serum", "creme", "huile", "gommage", "masque", "savon"] as const;
const PRODUCT_IMAGES = ["serum-moringa", "baume-karite", "huile-baobab", "gommage-bissap", "masque-aloka", "savon-noir", "brune-nere", "solaire-spf50"] as const;

interface FormState {
  name: string;
  category: string;
  price: string;
  durationMin: string;
  commissionPct: string;
  stock: string;
  stockAlert: string;
  description: string;
  botanicals: string;
  image: string;
}

const emptyForm: FormState = {
  name: "",
  category: "soin",
  price: "",
  durationMin: "60",
  commissionPct: "10",
  stock: "25",
  stockAlert: "8",
  description: "",
  botanicals: "",
  image: "serum-moringa",
};

export function CatalogSection({ tenantId }: { tenantId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editType, setEditType] = useState<"service" | "product">("service");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const catalog = useApi<ProCatalog>(() => (tenantId ? apiGet<ProCatalog>(`/api/pro/catalog?tenantId=${tenantId}`) : Promise.resolve({ services: [], products: [] })), [tenantId]);

  function openCreate(type: "service" | "product") {
    setEditType(type);
    setEditId(null);
    setForm({ ...emptyForm, category: type === "service" ? "soin" : "serum" });
    setDialogOpen(true);
  }
  function openEdit(type: "service" | "product", item: ProService | ProProduct) {
    setEditType(type);
    setEditId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      price: String(item.price),
      durationMin: String((item as ProService).durationMin ?? 60),
      commissionPct: String((item as ProService).commissionPct ?? 10),
      stock: String((item as ProProduct).stock ?? 0),
      stockAlert: String((item as ProProduct).stockAlert ?? 8),
      description: item.description ?? "",
      botanicals: item.botanicals ?? "",
      image: (item as ProProduct).image?.replace("/products/", "").replace(".webp", "") ?? "serum-moringa",
    });
    setDialogOpen(true);
  }

  async function toggleActive(type: "service" | "product", item: ProService | ProProduct) {
    try {
      await apiPatch("/api/pro/catalog", { tenantId, type, id: item.id, data: { active: !item.active } });
      toast.success(item.active ? `${item.name} désactivé` : `${item.name} activé`);
      await catalog.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modification impossible");
    }
  }

  async function submit() {
    const price = Number(form.price);
    if (!form.name.trim() || !price || price <= 0) {
      toast.error("Nom et prix valides requis");
      return;
    }
    setBusy(true);
    try {
      const data =
        editType === "service"
          ? {
              name: form.name.trim(),
              category: form.category,
              price,
              durationMin: Number(form.durationMin) || 60,
              commissionPct: Number(form.commissionPct) || 0,
              description: form.description.trim() || undefined,
              botanicals: form.botanicals.trim() || undefined,
            }
          : {
              name: form.name.trim(),
              category: form.category,
              price,
              stock: Number(form.stock) || 0,
              stockAlert: Number(form.stockAlert) || 0,
              description: form.description.trim(),
              botanicals: form.botanicals.trim(),
              image: `/products/${form.image}.webp`,
            };
      if (editId) {
        await apiPatch("/api/pro/catalog", { tenantId, type: editType, id: editId, data });
        toast.success("Fiche mise à jour");
      } else {
        await apiPost("/api/pro/catalog", { tenantId, type: editType, data });
        toast.success(editType === "service" ? "Soin ajouté au catalogue" : "Produit ajouté au catalogue");
      }
      setDialogOpen(false);
      await catalog.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  }

  const f = (k: keyof FormState, v: string) => setForm((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Catalogue"
        sub="Soins praticables et produits revendus en institut"
        actions={
          <>
            <Button variant="outline" onClick={() => openCreate("product")} className="gap-1.5">
              <Plus className="size-4" aria-hidden="true" /> Nouveau produit
            </Button>
            <Button onClick={() => openCreate("service")} className="gap-1.5 font-semibold">
              <Plus className="size-4" aria-hidden="true" /> Nouveau soin
            </Button>
          </>
        }
      />

      {catalog.error && !catalog.data ? (
        <ErrorState message={`Catalogue indisponible : ${catalog.error}`} onRetry={catalog.refetch} />
      ) : catalog.loading && !catalog.data ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="service">
          <TabsList className="mb-3">
            <TabsTrigger value="service" className="text-xs gap-1.5"><Sparkles className="size-3.5" aria-hidden="true" /> Soins ({catalog.data?.services.length ?? 0})</TabsTrigger>
            <TabsTrigger value="product" className="text-xs gap-1.5"><Package className="size-3.5" aria-hidden="true" /> Produits ({catalog.data?.products.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="service">
            {(catalog.data?.services ?? []).length === 0 ? (
              <EmptyState label="Aucun soin au catalogue" />
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {(catalog.data?.services ?? []).map((s) => (
                  <Card key={s.id} className={cn("gap-2", !s.active && "opacity-55")}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-heading font-semibold leading-tight">{s.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] capitalize">{s.category}</Badge>
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="size-3" aria-hidden="true" /> {s.durationMin} min
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Percent className="size-3" aria-hidden="true" /> {s.commissionPct} %
                            </span>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Actions pour ${s.name}`}>
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit("service", s)}>
                              <Pencil className="size-3.5" /> Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive("service", s)}>
                              <Power className="size-3.5" /> {s.active ? "Désactiver" : "Activer"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <Money value={s.price} className="text-lg font-bold text-gold" />
                        <div className="flex items-center gap-1.5">
                          <Switch checked={s.active} onCheckedChange={() => toggleActive("service", s)} aria-label={`Activer ${s.name}`} />
                          <span className="text-[10px] text-muted-foreground">{s.active ? "Actif" : "Inactif"}</span>
                        </div>
                      </div>
                      {s.botanicals && <p className="mt-1.5 text-[11px] text-muted-foreground">Botaniques : {s.botanicals}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="product">
            {(catalog.data?.products ?? []).length === 0 ? (
              <EmptyState label="Aucun produit au catalogue" />
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {(catalog.data?.products ?? []).map((p) => (
                  <Card key={p.id} className={cn("gap-2", !p.active && "opacity-55")}>
                    <CardContent className="p-4 flex gap-3">
                      <div className="size-16 shrink-0 rounded-xl overflow-hidden bg-muted border border-border">
                        <img src={p.image} alt={p.name} className="size-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-heading font-semibold leading-tight truncate">{p.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px] capitalize">{p.category}</Badge>
                              <Badge variant="outline" className={cn("text-[10px] font-mono", p.stock <= p.stockAlert ? "bg-bissap/10 text-bissap border-bissap/40" : "text-muted-foreground")}>
                                Stock {p.stock}
                              </Badge>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Actions pour ${p.name}`}>
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit("product", p)}>
                                <Pencil className="size-3.5" /> Modifier
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleActive("product", p)}>
                                <Power className="size-3.5" /> {p.active ? "Désactiver" : "Activer"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <Money value={p.price} className="text-lg font-bold text-gold" />
                          <div className="flex items-center gap-1.5">
                            <Switch checked={p.active} onCheckedChange={() => toggleActive("product", p)} aria-label={`Activer ${p.name}`} />
                            <span className="text-[10px] text-muted-foreground">{p.active ? "Actif" : "Inactif"}</span>
                          </div>
                        </div>
                        {p.botanicals && <p className="mt-1 text-[11px] text-muted-foreground truncate">Botaniques : {p.botanicals}</p>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* ── Dialog création/édition ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto pretty-scroll">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editId ? "Modifier" : "Nouveau"} {editType === "service" ? "soin" : "produit"}
            </DialogTitle>
            <DialogDescription>
              {editType === "service" ? "Prestation praticable en cabine (durée, commission)." : "Produit revendu au comptoir (stock, seuil d'alerte)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cat-name" className="text-xs">Nom</Label>
                <Input id="cat-name" value={form.name} onChange={(e) => f("name", e.target.value)} placeholder={editType === "service" ? "Soin éclat Karité" : "Sérum Moringa"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => f("category", v)}>
                  <SelectTrigger aria-label="Catégorie"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(editType === "service" ? SERVICE_CATS : PRODUCT_CATS).map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cat-price" className="text-xs">Prix (FCFA)</Label>
                <Input id="cat-price" inputMode="numeric" value={form.price} onChange={(e) => f("price", e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" placeholder="15000" />
              </div>
              {editType === "service" ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="cat-dur" className="text-xs">Durée (min)</Label>
                    <Input id="cat-dur" inputMode="numeric" value={form.durationMin} onChange={(e) => f("durationMin", e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cat-com" className="text-xs">Commission (%)</Label>
                    <Input id="cat-com" inputMode="numeric" value={form.commissionPct} onChange={(e) => f("commissionPct", e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="cat-stock" className="text-xs">Stock</Label>
                    <Input id="cat-stock" inputMode="numeric" value={form.stock} onChange={(e) => f("stock", e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cat-alert" className="text-xs">Seuil alerte</Label>
                    <Input id="cat-alert" inputMode="numeric" value={form.stockAlert} onChange={(e) => f("stockAlert", e.target.value.replace(/[^0-9]/g, ""))} className="font-mono" />
                  </div>
                </>
              )}
            </div>
            {editType === "product" && (
              <div className="space-y-1">
                <Label className="text-xs">Visuel produit</Label>
                <Select value={form.image} onValueChange={(v) => f("image", v)}>
                  <SelectTrigger aria-label="Visuel produit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRODUCT_IMAGES.map((img) => (
                      <SelectItem key={img} value={img}>{img.replace("-", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="size-12 rounded-lg overflow-hidden border border-border bg-muted">
                    <img src={`/products/${form.image}.webp`} alt="Aperçu visuel produit" className="size-full object-cover" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">/products/{form.image}.webp</span>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="cat-desc" className="text-xs">Description</Label>
              <Textarea id="cat-desc" rows={2} value={form.description} onChange={(e) => f("description", e.target.value)} placeholder="Gommage doux adapté aux peaux mélanodermes…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cat-bot" className="text-xs">Botaniques</Label>
              <Input id="cat-bot" value={form.botanicals} onChange={(e) => f("botanicals", e.target.value)} placeholder="Karité, Baobab, Moringa" />
            </div>
            {form.price && (
              <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold">
                Prix affiché : <span className="font-mono font-semibold">{xof(Number(form.price) || 0)}</span>
              </p>
            )}
            <Button disabled={busy} onClick={submit} className="w-full font-semibold">
              {busy ? "Enregistrement…" : editId ? "Enregistrer les modifications" : "Ajouter au catalogue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
