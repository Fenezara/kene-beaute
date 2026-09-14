"use client";
// Kènè Pro — Coupons & promos boutique: création (code auto ou personnalisé),
// suivi des utilisations, activation/désactivation, diffusion aux clientes
// (notification + cloche temps réel via le canal de la).
import { useMemo, useState } from "react";
import { CalendarClock, Loader2, Percent, Plus, Send, Tag, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiGet, apiPatch, apiPost } from "@/lib/kene/api";
import { xof } from "@/lib/kene/format";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, KpiCard, LoadingBlock, SectionHeader } from "./ui-bits";
import type { ProCoupon, ProCoupons } from "./types";
import { proToastError } from "./ProApp";

const STATUS_STYLES: Record<string, string> = {
  actif: "bg-success/15 text-success border-success/30",
  programmé: "bg-sunset/15 text-sunset border-sunset/30",
  expiré: "bg-muted text-muted-foreground border-border",
  épuisé: "bg-bissap/15 text-bissap border-bissap/30",
  inactif: "bg-muted text-muted-foreground border-border",
};

interface FormState {
  code: string;
  label: string;
  kind: "percent" | "fixed";
  value: string;
  minOrder: string;
  maxUses: string;
  expiresAt: string; // AAAA-MM-JJ (input date) — vide = sans échéance
}

const emptyForm: FormState = { code: "", label: "", kind: "percent", value: "10", minOrder: "0", maxUses: "0", expiresAt: "" };

export function CouponsSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [diffusing, setDiffusing] = useState<string | null>(null);

  const feed = useApi<ProCoupons>(
    () => (tenantId ? apiGet<ProCoupons>(`/api/pro/coupons?tenantId=${tenantId}`) : Promise.resolve({ coupons: [] })),
    [tenantId]
  );
  const coupons = feed.data?.coupons ?? [];

  const kpis = useMemo(() => {
    const actifs = coupons.filter((c) => c.status === "actif").length;
    const usages = coupons.reduce((s, c) => s + c.usedCount, 0);
    return { actifs, usages, count: coupons.length };
  }, [coupons]);

  async function createCoupon() {
    if (busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        tenantId,
        kind: form.kind,
        value: Number(form.value),
        label: form.label.trim() || undefined,
        minOrder: Number(form.minOrder || 0),
        maxUses: Number(form.maxUses || 0),
      };
      if (form.code.trim()) body.code = form.code.trim();
      if (form.expiresAt) body.expiresAt = new Date(`${form.expiresAt}T23:59:59`).toISOString();

      const r = await apiPost<{ coupon: ProCoupon }>("/api/pro/coupons", body);
      toast.success(`Coupon ${r.coupon.code} créé`, {
        description: `${r.coupon.kind === "percent" ? `-${r.coupon.value} %` : `-${xof(r.coupon.value)}`} · diffusable dès maintenant.`,
      });
      setDialogOpen(false);
      setForm({ ...emptyForm, kind: form.kind });
      await feed.refetch();
    } catch (e) {
      proToastError(e, "Création impossible");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(c: ProCoupon) {
    try {
      await apiPatch<{ coupon: ProCoupon }>("/api/pro/coupons", { tenantId, id: c.id, active: !c.active });
      toast.success(!c.active ? `${c.code} activé` : `${c.code} désactivé`);
      await feed.refetch();
    } catch (e) {
      proToastError(e);
    }
  }

  async function diffuse(c: ProCoupon) {
    if (diffusing) return;
    setDiffusing(c.id);
    try {
      const r = await apiPost<{ ok: true; clients: number }>("/api/pro/coupons/diffuse", { tenantId, couponId: c.id });
      toast.success(`Code ${c.code} diffusé`, {
        description: `${r.clients} cliente${r.clients > 1 ? "s" : ""} notifiée${r.clients > 1 ? "s" : ""} — leur cloche s'est illuminée en direct.`,
      });
    } catch (e) {
      proToastError(e, "Diffusion impossible");
    } finally {
      setDiffusing(null);
    }
  }

  const valueLabel = (c: ProCoupon) => (c.kind === "percent" ? `-${c.value} %` : `-${xof(c.value)}`);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Coupons & promos"
        sub={`Codes applicables à la boutique par tes clientes${tenantName ? ` · ${tenantName}` : ""}.`}
        actions={
          <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" /> Créer un coupon
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard icon={<Tag className="size-4" />} label="Coupons actifs" value={String(kpis.actifs)} hint={`${kpis.count} au total`} monetary={false} />
        <KpiCard icon={<Users className="size-4" />} label="Utilisations" value={String(kpis.usages)} hint="rédemptions clientes" monetary={false} />
        <KpiCard icon={<Percent className="size-4" />} label="Maison" value="1 utilisation / cliente" hint="quota global optionnel" monetary={false} />
      </div>

      {/* Liste */}
      {feed.loading ? (
        <LoadingBlock rows={4} />
      ) : feed.error ? (
        <ErrorState message={feed.error} onRetry={() => void feed.refetch()} />
      ) : coupons.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              label="Aucun coupon pour l'instant"
              sub="Crée ton premier code promo : -15 % sur la boutique, diffusion à toutes tes clientes en un clic."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {coupons.map((c) => (
            <Card key={c.id} className={cn("gap-3", !c.active && "opacity-70")}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono font-bold text-sm tracking-wide">{c.code}</p>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[c.status] ?? STATUS_STYLES.inactif)}>
                        {c.status}
                      </Badge>
                      {c.tenantId === null && (
                        <Badge variant="outline" className="text-[10px] bg-gold/15 text-gold border-gold/30">
                          Maison
                        </Badge>
                      )}
                    </div>
                    {c.label && <p className="mt-1 text-xs text-muted-foreground truncate">{c.label}</p>}
                  </div>
                  <p className="font-mono font-black text-lg text-primary shrink-0">{valueLabel(c)}</p>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                  {c.minOrder > 0 && <span>min. {xof(c.minOrder)}</span>}
                  {c.expiresAt && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3" aria-hidden="true" />
                      {new Date(c.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" aria-hidden="true" />
                    {c.usedCount}{c.maxUses > 0 ? ` / ${c.maxUses}` : ""} utilisation{c.usedCount > 1 ? "s" : ""}
                  </span>
                </div>

                {c.maxUses > 0 && (
                  <div
                    className="h-1.5 rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-label={`Utilisations ${c.usedCount} sur ${c.maxUses}`}
                    aria-valuenow={c.usedCount}
                    aria-valuemin={0}
                    aria-valuemax={c.maxUses}
                  >
                    <div
                      className={cn("h-full rounded-full transition-all", c.usedCount >= c.maxUses ? "bg-bissap" : "bg-success")}
                      style={{ width: `${Math.min(100, (c.usedCount / c.maxUses) * 100)}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={diffusing === c.id || c.status !== "actif" || c.tenantId === null}
                    onClick={() => void diffuse(c)}
                    className="gap-1.5"
                    title={c.tenantId === null ? "Coupon maison — diffusion réservée à l'admin" : "Notifier toutes les clientes"}
                  >
                    {diffusing === c.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}
                    Diffuser
                  </Button>
                  <Button size="sm" variant="ghost" disabled={c.tenantId === null} onClick={() => void toggleActive(c)} className="ml-auto">
                    {c.active ? "Désactiver" : "Activer"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog création */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Nouveau coupon</DialogTitle>
            <DialogDescription>
              La remise s&apos;applique au panier boutique, une seule fois par cliente. Le code est généré automatiquement si tu laisses le champ vide.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-kind">Type de remise</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as "percent" | "fixed", value: v === "percent" ? "10" : "2000" }))}>
                  <SelectTrigger id="cp-kind" aria-label="Type de remise">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Pourcentage</SelectItem>
                    <SelectItem value="fixed">Montant fixe (FCFA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-value">{form.kind === "percent" ? "Réduction (%)" : "Réduction (FCFA)"}</Label>
                <Input
                  id="cp-value"
                  inputMode="numeric"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value.replace(/\D/g, "").slice(0, 7) }))}
                  placeholder={form.kind === "percent" ? "15" : "2000"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp-min">Panier minimum (FCFA)</Label>
                <Input
                  id="cp-min"
                  inputMode="numeric"
                  value={form.minOrder}
                  onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value.replace(/\D/g, "").slice(0, 7) }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-max">Utilisations max (0 = ∞)</Label>
                <Input
                  id="cp-max"
                  inputMode="numeric"
                  value={form.maxUses}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-code">Code personnalisé (facultatif)</Label>
              <Input
                id="cp-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24) }))}
                placeholder="PROMO-AB12 (auto)"
                className="font-mono uppercase tracking-wide"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-label">Description (facultatif)</Label>
              <Input
                id="cp-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value.slice(0, 80) }))}
                placeholder="Fête des mères · été 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cp-exp">Expire le (facultatif)</Label>
              <Input id="cp-exp" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={() => void createCoupon()} disabled={busy || !form.value} className="gap-1.5">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Créer le coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
