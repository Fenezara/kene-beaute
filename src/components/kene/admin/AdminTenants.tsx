"use client";
// Kènè — Console Admin · Instituts (t. 128): la gestion du réseau partenaire.
// Liste avec recherche + filtre statut, fiche détaillée (dialog), et les
// leviers de gestion: suspendre (motif obligatoire — l'opération ferme:
// vitrine, réservations, connexion de l'équipe), réactiver, piloter la
// commission boutique (0-30 %) et le plan (trial/pro/business).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Building2, CalendarClock, Loader2, MapPin, Package, PauseCircle,
  Percent, PlayCircle, Receipt, Search, ShieldAlert, ShoppingBag, Star, Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, ApiError } from "@/lib/kene/api";
import { formatDate, xof } from "@/lib/kene/format";
import { cn } from "@/lib/utils";
import { useApi } from "@/components/kene/pro/useApi";
import { EmptyState, ErrorState, KenteTop, Money } from "@/components/kene/pro/ui-bits";
import type {
  AdminTenantDetail, AdminTenantPatchResult, AdminTenantRow,
} from "@/components/kene/pro/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminGate } from "./admin-gate";

/** Badge de statut d'un institut — en ligne (vert Baobab) / suspendu (bordeaux Bissap). */
function StatusBadge({ t }: { t: Pick<AdminTenantRow, "active" | "suspendedAt"> }) {
  return t.active ? (
    <Badge className="bg-success/15 text-success border border-success/30 hover:bg-success/15">En ligne</Badge>
  ) : (
    <Badge className="bg-bissap/15 text-bissap border border-bissap/30 hover:bg-bissap/15">Suspendu</Badge>
  );
}

/** Pourcentage FR fidèle: 0.075 → « 7,5 % » (pas d'arrondi trompeur à 8). */
function pctLabel(rate: number): string {
  return `${Math.round(rate * 1000) / 10}`.replace(".", ",") + " %";
}

export function AdminTenants() {
  // Recherche debouncée (250 ms) — pattern 2026: l'UI répond au doigt,
  // le réseau n'est tapé qu'au repos de frappe.
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const list = useApi(
    () => apiGet<{ tenants: AdminTenantRow[] }>(`/api/admin/tenants?q=${encodeURIComponent(dq)}`),
    [dq],
  );

  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "suspended">("all");
  // Incrémenté après chaque PATCH réussi → la FICHE ouverte se recharge
  // (elle vit dans TenantSheet avec son propre useApi: la liste seule ne suffit pas).
  const [refreshKey, setRefreshKey] = useState(0);
  const rows = useMemo(() => {
    const all = list.data?.tenants ?? [];
    if (statusFilter === "online") return all.filter((t) => t.active);
    if (statusFilter === "suspended") return all.filter((t) => !t.active);
    return all;
  }, [list.data, statusFilter]);

  // Fiche détaillée (dialog) + dialog de suspension
  const [openId, setOpenId] = useState<string | null>(null);
  const [suspendFor, setSuspendFor] = useState<AdminTenantRow | null>(null);
  const [busy, setBusy] = useState(false);

  // t. 130 — les PATCH passent par le gate: confirmation d'identité (code
  // frais < 5 min) exigée par le serveur, dialogue puis rejeu automatique.
  const gate = useAdminGate();

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>, okMsg: string) => {
      setBusy(true);
      try {
        const r = await gate.elevatedPatch<AdminTenantPatchResult>(`/api/admin/tenants/${id}`, body);
        if (!r.changed) {
          toast.info(r.message ?? "Aucun changement appliqué");
        } else {
          toast.success(okMsg);
        }
        await Promise.all([list.refetch()]);
        setRefreshKey((k) => k + 1);
        return true;
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Action impossible — réessaie");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [list, gate],
  );

  return (
    <div className="space-y-4">
      {/* Barre: recherche + filtres statut */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un institut, une ville, une gérante…"
            aria-label="Rechercher un institut"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filtrer par statut">
          {([
            ["all", "Tous"],
            ["online", "En ligne"],
            ["suspended", "Suspendus"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              aria-pressed={statusFilter === key}
              className={cn(
                "min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                statusFilter === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <Card className="overflow-hidden pt-0">
        <KenteTop />
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-base">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            Instituts partenaires
            <Badge variant="outline" className="font-mono text-[10px]">{rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.error && !list.data ? (
            <div className="p-4"><ErrorState message={list.error} onRetry={list.refetch} /></div>
          ) : list.loading && !list.data ? (
            <div className="space-y-2 p-4" aria-busy="true">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState label={dq ? `Aucun institut ne correspond à « ${dq} »` : "Aucun institut partenaire"} />
          ) : (
            <div className="overflow-x-auto pretty-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institut</TableHead>
                    <TableHead className="hidden md:table-cell">Gérante</TableHead>
                    <TableHead className="text-right">CA 30 j</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Commandes</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Commission</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id} className={cn(!t.active && "opacity-75")}>
                      <TableCell>
                        <p className="font-medium leading-tight">{t.name}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3 shrink-0" aria-hidden="true" />
                          {t.city}
                          <span className="font-mono text-[9px] text-muted-foreground/70">{t.country}</span>
                        </p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm leading-tight">{t.ownerName}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{t.ownerPhone}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={t.caBoutique30 + t.caPos30} className="text-sm font-semibold" />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          boutique {xof(t.caBoutique30, { compact: true })} · caisse {xof(t.caPos30, { compact: true })}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right text-sm">
                        {t.orders30}
                        {t.pendingOrders > 0 && (
                          <span className="ml-1 text-[10px] text-gold" title={`${t.pendingOrders} en attente`}>
                            +{t.pendingOrders}⏳
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right font-mono text-sm">
                        {pctLabel(t.commissionRate)}
                      </TableCell>
                      <TableCell><StatusBadge t={t} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" className="h-11" onClick={() => setOpenId(t.id)}>
                            Fiche
                          </Button>
                          {t.active ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-11 gap-1.5 border-bissap/40 text-bissap hover:bg-bissap/10 hover:text-bissap"
                              onClick={() => setSuspendFor(t)}
                              aria-label={`Suspendre ${t.name}`}
                            >
                              <PauseCircle className="size-4" aria-hidden="true" />
                              <span className="hidden sm:inline">Suspendre</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-11 gap-1.5 border-success/40 text-success hover:bg-success/10 hover:text-success"
                              disabled={busy}
                              onClick={() => void patch(t.id, { active: true }, `${t.name} est de retour en ligne`)}
                              aria-label={`Réactiver ${t.name}`}
                            >
                              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="size-4" aria-hidden="true" />}
                              <span className="hidden sm:inline">Réactiver</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fiche détaillée */}
      {openId && <TenantSheet id={openId} refreshKey={refreshKey} onClose={() => setOpenId(null)} onSuspend={(t) => { setSuspendFor(t); }} busy={busy} patch={patch} />}

      {/* Dialog de suspension — motif obligatoire, impact énoncé noir sur blanc */}
      <SuspendDialog
        target={suspendFor}
        busy={busy}
        onCancel={() => setSuspendFor(null)}
        onConfirm={async (reason) => {
          if (!suspendFor) return;
          const okDone = await patch(suspendFor.id, { active: false, reason }, `${suspendFor.name} suspendu — la gérante est notifiée`);
          if (okDone) setSuspendFor(null);
        }}
      />
    </div>
  );
}

// ─────────────── Fiche détaillée d'un institut ───────────────

function TenantSheet({
  id, refreshKey, onClose, onSuspend, busy, patch,
}: {
  id: string;
  refreshKey: number;
  onClose: () => void;
  onSuspend: (t: AdminTenantRow) => void;
  busy: boolean;
  patch: (id: string, body: Record<string, unknown>, okMsg: string) => Promise<boolean>;
}) {
  const detail = useApi(() => apiGet<{ tenant: AdminTenantDetail }>(`/api/admin/tenants/${id}`), [id, refreshKey]);
  const t = detail.data?.tenant;

  // Commission & plan: pattern « draft » — la valeur affichée est celle du
  // serveur TANT QUE rien n'est en cours d'édition (null = pas de brouillon).
  // Zéro setState dans un effet: la fiche peut recharger, le brouillon suit.
  const [draftPct, setDraftPct] = useState<string | null>(null);
  const [draftPlan, setDraftPlan] = useState<string | null>(null);
  // Saisie en notation point (l'inputMode decimal + parseFloat), affichage
  // FR ailleurs. 7,5 % se saisit « 7.5 ».
  const commissionPct = draftPct ?? (t ? String(Math.round(t.commissionRate * 1000) / 10) : "");
  const plan = draftPlan ?? t?.plan ?? "";

  const commissionDirty =
    t !== undefined && draftPct !== null && draftPct.trim() !== String(Math.round(t.commissionRate * 1000) / 10);
  const planDirty = t !== undefined && draftPlan !== null && draftPlan !== t.plan;
  const pctValue = Number.parseFloat(commissionPct);
  const pctValid = Number.isFinite(pctValue) && pctValue >= 0 && pctValue <= 30;

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto pretty-scroll sm:max-w-2xl">
        {detail.error ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">Fiche institut</DialogTitle>
              <DialogDescription>Une erreur est survenue.</DialogDescription>
            </DialogHeader>
            <ErrorState message={detail.error} onRetry={detail.refetch} />
          </>
        ) : !t ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">Fiche institut</DialogTitle>
              <DialogDescription>Chargement de la fiche en cours.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3" aria-busy="true" aria-label="Chargement de la fiche institut">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-heading">
                {t.name}
                <StatusBadge t={t} />
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{t.city} · {t.country}</span>
                <span className="flex items-center gap-1"><Receipt className="size-3.5" aria-hidden="true" />{t.ownerName} · <span className="font-mono">{t.ownerPhone}</span></span>
                <span className="flex items-center gap-1"><Star className="size-3.5 text-gold" aria-hidden="true" />{t.rating.toFixed(1)} ({t.reviewCount} avis)</span>
              </DialogDescription>
            </DialogHeader>

            {!t.active && t.suspendedReason && (
              <p role="status" className="rounded-xl bg-bissap/10 px-3.5 py-3 text-sm text-bissap">
                <ShieldAlert className="mr-1.5 inline size-4" aria-hidden="true" />
                Suspendu le {formatDate(new Date(t.suspendedAt ?? ""), { day: "numeric", month: "long", year: "numeric" })} — « {t.suspendedReason} »
              </p>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "CA 30 j (total)", value: xof(t.caBoutique30 + t.caPos30, { compact: true }) },
                { label: "Commandes 30 j", value: String(t.orders30) },
                { label: "Clientes CRM", value: String(t.clientsCrm) },
                { label: "Équipe active", value: String(t.employees) },
                { label: "Diagnostics cabine 30 j", value: String(t.proDiag30) },
                { label: "RDV à venir", value: String(t.upcomingAppointments) },
                { label: "Catalogue actif", value: String(t.products) },
                { label: "En attente (boutique)", value: String(t.pendingOrders) },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                  <p className="text-[11px] leading-tight text-muted-foreground">{k.label}</p>
                  <p className="mt-1 font-mono text-lg font-bold tabular-nums">{k.value}</p>
                </div>
              ))}
            </div>

            {/* Leviers: commission + plan */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 p-3.5">
                <Label htmlFor="commission" className="flex items-center gap-1.5 text-xs font-medium">
                  <Percent className="size-3.5" aria-hidden="true" /> Commission boutique (%)
                </Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="commission"
                    inputMode="decimal"
                    value={commissionPct}
                    onChange={(e) => setDraftPct(e.target.value)}
                    aria-invalid={!pctValid}
                    className="h-11"
                  />
                  <Button
                    size="sm"
                    className="h-11"
                    disabled={!pctValid || !commissionDirty || busy}
                    onClick={() =>
                      void patch(t.id, { commissionRate: pctValue / 100 }, `Commission de ${t.name} fixée à ${String(pctValue).replace(".", ",")} %`).then((okDone) => {
                        if (okDone) setDraftPct(null);
                      })
                    }
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Enregistrer"}
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Kènè prélève sur les ventes boutique — appliqué aux prochaines commandes.</p>
              </div>

              <div className="rounded-xl border border-border/60 p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <Package className="size-3.5" aria-hidden="true" /> Plan
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Plan de l'institut">
                  {(["trial", "pro", "business"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setDraftPlan(p)}
                      aria-pressed={plan === p}
                      className={cn(
                        "min-h-11 rounded-full border px-3.5 text-sm font-medium capitalize transition-colors",
                        plan === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                  <Button
                    size="sm"
                    className="ml-auto h-11"
                    disabled={!planDirty || busy}
                    onClick={() =>
                      void patch(t.id, { plan }, `Plan de ${t.name} : ${plan}`).then((okDone) => {
                        if (okDone) setDraftPlan(null);
                      })
                    }
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Enregistrer"}
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Essai, Pro ou Business — la tarification Kènè.</p>
              </div>
            </div>

            {/* Équipe */}
            {t.team.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Users className="size-3.5" aria-hidden="true" /> Équipe active ({t.team.length})
                </p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {t.team.map((e) => (
                    <li key={e.name} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                      <span className="font-medium">{e.name}</span>
                      <span className="text-muted-foreground"> · {e.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top produits */}
            {t.topProducts.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <ShoppingBag className="size-3.5" aria-hidden="true" /> Top produits — 30 jours
                </p>
                <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                  {t.topProducts.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {p.qty} vendus · {xof(p.ca, { compact: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dernières activités */}
            <div className="grid gap-3 sm:grid-cols-2">
              {t.lastSales.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Receipt className="size-3.5" aria-hidden="true" /> Dernières ventes caisse
                  </p>
                  <ul className="space-y-1.5">
                    {t.lastSales.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-muted-foreground">{s.clientName ?? "Cliente express"}</span>
                        <span className="shrink-0 font-mono text-xs"><Money value={s.total} className="text-sm" /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {t.lastOrders.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <CalendarClock className="size-3.5" aria-hidden="true" /> Dernières commandes boutique
                  </p>
                  <ul className="space-y-1.5">
                    {t.lastOrders.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-muted-foreground">
                          {o.clientName}
                          <span className="ml-1 text-[10px] uppercase text-muted-foreground/70">{o.status}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs"><Money value={o.total} className="text-sm" /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" className="h-11" onClick={onClose}>Fermer</Button>
              {t.active ? (
                <Button
                  variant="outline"
                  className="h-11 gap-1.5 border-bissap/40 text-bissap hover:bg-bissap/10 hover:text-bissap"
                  onClick={() => onSuspend({ ...t })}
                >
                  <PauseCircle className="size-4" aria-hidden="true" /> Suspendre l'institut
                </Button>
              ) : (
                <Button
                  className="h-11 gap-1.5 bg-success text-white hover:bg-success/90"
                  disabled={busy}
                  onClick={() => void patch(t.id, { active: true }, `${t.name} est de retour en ligne`)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="size-4" aria-hidden="true" />}
                  Réactiver
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Dialog de suspension ───────────────

function SuspendDialog({
  target, busy, onCancel, onConfirm,
}: {
  target: AdminTenantRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  // L'état repart à zéro à chaque ouverture: Radix démonte le contenu du
  // dialog fermé — jamais un motif qui traîne d'un institut à l'autre.
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-bissap">
            <AlertTriangle className="size-5" aria-hidden="true" />
            Suspendre {target?.name ?? ""} ?
          </DialogTitle>
          <DialogDescription>
            L&apos;institut quitte immédiatement la vitrine Kènè (boutique, annuaire, réservations) et
            son équipe ne peut plus se connecter. La gérante reçoit le motif ci-dessous. Les données
            restent intactes — la décision est réversible.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="suspend-reason">Motif (montré à la gérante)</Label>
          <Input
            id="suspend-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="p. ex. Commission impayée depuis 60 jours"
            aria-invalid={!valid && reason.length > 0}
            className="h-11"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onCancel} disabled={busy}>Annuler</Button>
          <Button
            className="h-11 gap-1.5 bg-bissap text-white hover:bg-bissap/90"
            disabled={!valid || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PauseCircle className="size-4" aria-hidden="true" />}
            Suspendre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
