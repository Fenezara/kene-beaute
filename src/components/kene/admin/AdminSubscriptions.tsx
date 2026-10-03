"use client";
// Kènè — Console Admin · Abonnements (t. 135): la monétisation Kènè+ / Pro
// entre dans la console. Liste complète (actives, expirées, annulées,
// offertes) avec recherche et filtres, KPIs (abonnées actives, revenus
// mensuels simulés — MRR, échéances ≤ 7 j, mois offerts), et les 2 leviers
// de gestion: ANNULER (motif obligatoire, l'abonnée est notifiée et perd
// ses avantages immédiatement) et OFFRIR 30 JOURS (geste commercial —
// nouvelle période tracée, jamais d'écrasement, 0 F).
// Normes: historique intouchable (IFRS 15/SYSCOHADA — on annule/ajoute,
// jamais on ne modifie), MRR = KPI standard, step-up sur chaque levier
// (ASVS V2.7 — le dialogue « Confirme ton identité » s'ouvre si besoin).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BadgeCheck, CalendarClock, Download, Gift, Loader2, Search, Sparkles,
  Ban, CreditCard, Users, Wallet,
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
import { apiGet, ApiError, downloadFile } from "@/lib/kene/api";
import { formatDate, xof } from "@/lib/kene/format";
import { cn } from "@/lib/utils";
import { useApi } from "@/components/kene/pro/useApi";
import { EmptyState, ErrorState, KenteTop, KpiCard, Money } from "@/components/kene/pro/ui-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminGate } from "./admin-gate";
import type { AdminSubRow, AdminSubPatchResult, AdminSubsPayload } from "@/components/kene/pro/types";

const DAY = 86_400_000;

/** « 12 sept. » — dates courtes de période. */
function shortDate(iso: string): string {
  return formatDate(new Date(iso), { day: "numeric", month: "short" });
}

/** « aujourd'hui » · « demain » · « dans 6 j » · « depuis 3 j » (expirée). */
function whenLabel(iso: string, derived: AdminSubRow["derived"]): string {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
  if (derived === "expired" || diff < 0) return `expirée depuis ${Math.abs(diff)} j`;
  if (diff === 0) return "expire aujourd'hui";
  if (diff === 1) return "demain";
  return `dans ${diff} j`;
}

/** Badge de statut dérivé — Actif (Baobab) / Expire bientôt (or) / Expirée / Annulée (Bissap). */
function SubStatusBadge({ s }: { s: AdminSubRow }) {
  if (s.derived === "active") {
    return <Badge className="bg-success/15 text-success border border-success/30 hover:bg-success/15">Actif</Badge>;
  }
  if (s.derived === "expiring") {
    return <Badge className="border border-gold/40 bg-gold/15 text-gold hover:bg-gold/15">Expire bientôt</Badge>;
  }
  if (s.derived === "expired") {
    return <Badge variant="outline" className="text-muted-foreground">Expirée</Badge>;
  }
  return <Badge className="bg-bissap/15 text-bissap border border-bissap/30 hover:bg-bissap/15">Annulée</Badge>;
}

type SubFilter = "all" | "active" | "expiring" | "expired" | "cancelled" | "gift";

export function AdminSubscriptions() {
  // Recherche debouncée (250 ms) — même pattern que Instituts/Utilisatrices.
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const list = useApi(
    () => apiGet<AdminSubsPayload>(`/api/admin/subscriptions?q=${encodeURIComponent(dq)}`),
    [dq],
  );

  const [filter, setFilter] = useState<SubFilter>("all");
  const rows = useMemo(() => {
    const all = list.data?.subs ?? [];
    switch (filter) {
      case "active": return all.filter((s) => s.derived === "active");
      case "expiring": return all.filter((s) => s.derived === "expiring");
      case "expired": return all.filter((s) => s.derived === "expired");
      case "cancelled": return all.filter((s) => s.derived === "cancelled");
      case "gift": return all.filter((s) => (s.source === "console_gift" || s.source === "referral_gift") && (s.derived === "active" || s.derived === "expiring"));
      default: return all;
    }
  }, [list.data, filter]);

  // Dialogs d'action (annulation à motif / offre 30 j) + busy.
  const [cancelFor, setCancelFor] = useState<AdminSubRow | null>(null);
  const [giftFor, setGiftFor] = useState<AdminSubRow | null>(null);
  const [busy, setBusy] = useState(false);

  // t. 135 — les PATCH passent par le gate: step-up (code frais < 5 min)
  // exigé par le serveur, dialogue puis rejeu automatique.
  const gate = useAdminGate();

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>, okMsg: string) => {
      setBusy(true);
      try {
        const r = await gate.elevatedPatch<AdminSubPatchResult>(`/api/admin/subscriptions/${id}`, body);
        toast.success(r.message ?? okMsg);
        await list.refetch();
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

  // t. 140 — export comptable CSV: l'historique COMPLET des abonnements
  // (IFRS 15 — lignes clôturées incluses) pour la comptable.
  const [exportBusy, setExportBusy] = useState(false);
  async function exportCsv() {
    setExportBusy(true);
    try {
      const name = await downloadFile("/api/admin/subscriptions?format=csv", "kene-abonnements.csv");
      toast.success("Export téléchargé", { description: `${name} · historique complet (IFRS 15)` });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export impossible — réessaie");
    } finally {
      setExportBusy(false);
    }
  }

  const k = list.data?.kpis;

  return (
    <div className="space-y-4">
      {/* KPIs monétisation — simulation assumée (mode essai) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard icon={<Users className="size-4" />} label="Abonnées actives" value={String(k?.activeCount ?? 0)} monetary={false} />
        <KpiCard
          icon={<Wallet className="size-4" />}
          label="Revenus mensuels"
          value={xof(k?.mrrFcfa ?? 0, { compact: true })}
          hint="Abonnements actifs"
        />
        <KpiCard icon={<CalendarClock className="size-4" />} label="Expirent ≤ 7 j" value={String(k?.expiringSoon ?? 0)} monetary={false} />
        <KpiCard icon={<Gift className="size-4" />} label="Mois offerts actifs" value={String(k?.giftActive ?? 0)} monetary={false} hint="Console & parrainage" />
      </div>

      {/* Barre: recherche + export + filtres */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une abonnée, un plan…"
              aria-label="Rechercher un abonnement"
              className="pl-9"
            />
          </div>
          {/* t. 140 — export comptable CSV (historique complet, hors recherche) */}
          <Button
            variant="outline"
            className="h-11 gap-1.5 sm:ml-auto"
            disabled={exportBusy}
            onClick={() => void exportCsv()}
            aria-label="Exporter l'historique complet des abonnements en CSV"
          >
            {exportBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
            <span className="hidden sm:inline">Exporter CSV</span>
          </Button>
        </div>
        <div className="-mx-1 overflow-x-auto pretty-scroll px-1 pb-1" role="group" aria-label="Filtrer par statut">
          <div className="flex min-w-max gap-1.5">
            {([
              ["all", "Tous"],
              ["active", "Actifs"],
              ["expiring", "Expirent bientôt"],
              ["expired", "Expirées"],
              ["cancelled", "Annulées"],
              ["gift", "Offerts"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  "min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  filter === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Liste */}
      <Card className="overflow-hidden pt-0">
        <KenteTop />
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-base">
            <CreditCard className="size-4 text-primary" aria-hidden="true" />
            Abonnements Kènè+ &amp; Pro
            <Badge variant="outline" className="font-mono text-[10px]">{rows.length}</Badge>
            {(list.data?.byPlan ?? []).map((p) => (
              <Badge key={p.plan} variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">
                {p.label} ×{p.count}
              </Badge>
            ))}
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
            <EmptyState label={dq ? `Aucun abonnement ne correspond à « ${dq} »` : "Aucun abonnement pour ce filtre"} />
          ) : (
            <div className="overflow-x-auto pretty-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Abonnée</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Prix / mois</TableHead>
                    <TableHead className="hidden md:table-cell">Période</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.id} className={cn((s.derived === "cancelled" || s.derived === "expired") && "opacity-75")}>
                      <TableCell>
                        <p className="font-medium leading-tight">{s.userName}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{s.userPhone}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {s.planLabel}
                        </Badge>
                        {s.source === "console_gift" && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-gold">
                            <Gift className="size-3" aria-hidden="true" /> Offert par la Console
                          </p>
                        )}
                        {s.source === "referral_gift" && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-gold">
                            <Gift className="size-3" aria-hidden="true" /> Mois de parrainage
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.priceFcfa > 0 ? (
                          <Money value={s.priceFcfa} className="text-sm font-semibold" />
                        ) : (
                          <span className="text-sm font-semibold text-gold">Offert</span>
                        )}
                        {/* Sous-texte porteur du contexte — masqué < md : la
                            colonne Prix est étroite sur mobile et le badge
                            plan / « Offert par la Console » porte déjà l'info. */}
                        <p className="mt-0.5 hidden text-[10px] text-muted-foreground md:block">
                          {s.source === "console_gift" ? "geste commercial" : s.source === "referral_gift" ? "cadeau parrainage" : s.source === "winipayer" ? "WiniPayer" : "mobile money"}
                        </p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm leading-tight">
                          {shortDate(s.startedAt)} → <span className="font-semibold">{shortDate(s.expiresAt)}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{whenLabel(s.expiresAt, s.derived)}</p>
                      </TableCell>
                      <TableCell><SubStatusBadge s={s} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {s.derived !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-11 gap-1.5 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
                              disabled={busy}
                              onClick={() => setGiftFor(s)}
                              aria-label={`Offrir 30 jours à ${s.userName}`}
                            >
                              <Gift className="size-4" aria-hidden="true" />
                              <span className="hidden sm:inline">+30 j</span>
                            </Button>
                          )}
                          {(s.derived === "active" || s.derived === "expiring") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-11 gap-1.5 border-bissap/40 text-bissap hover:bg-bissap/10 hover:text-bissap"
                              disabled={busy}
                              onClick={() => setCancelFor(s)}
                              aria-label={`Annuler l'abonnement de ${s.userName}`}
                            >
                              <Ban className="size-4" aria-hidden="true" />
                              <span className="hidden sm:inline">Annuler</span>
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

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] leading-relaxed text-muted-foreground">
        <BadgeCheck className="size-3.5 shrink-0" aria-hidden="true" />
        Historique intouchable (IFRS 15): une annulation clôt la ligne, une offre en ouvre une nouvelle — rien ne s'efface.
        Paiements sécurisés Mobile Money & Cartes.
      </p>

      {/* Dialog d'annulation — motif obligatoire, impact énoncé */}
      <CancelSubDialog
        target={cancelFor}
        busy={busy}
        onCancel={() => setCancelFor(null)}
        onConfirm={async (reason) => {
          if (!cancelFor) return;
          const okDone = await patch(cancelFor.id, { action: "cancel", reason }, "Abonnement annulé");
          if (okDone) setCancelFor(null);
        }}
      />

      {/* Dialog d'offre 30 jours — geste commercial énoncé */}
      <GiftSubDialog
        target={giftFor}
        busy={busy}
        onCancel={() => setGiftFor(null)}
        onConfirm={async () => {
          if (!giftFor) return;
          const okDone = await patch(giftFor.id, { action: "extend" }, "30 jours offerts");
          if (okDone) setGiftFor(null);
        }}
      />
    </div>
  );
}

// ─────────────── Dialog d'annulation ───────────────

function CancelSubDialog({
  target, busy, onCancel, onConfirm,
}: {
  target: AdminSubRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  // Radix démonte le contenu du dialog fermé: le motif repart à zéro
  // à chaque ouverture — jamais un motif qui traîne d'une abonnée à l'autre.
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;
  const first = target?.userName.split(" ")[0] ?? "";

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-bissap">
            <AlertTriangle className="size-5" aria-hidden="true" />
            Annuler {target?.planLabel ?? ""} de {first} ?
          </DialogTitle>
          <DialogDescription>
            {first} perd immédiatement ses avantages ({target?.planLabel === "Kènè+" ? "diagnostics illimités, suivi, Dr. Kènè prioritaire" : "outils de gestion de l'institut"}) et
            reçoit ton motif par notification. Ses données restent intactes — elle peut se réabonner
            librement. La ligne reste dans l&apos;historique (jamais supprimée).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="sub-cancel-reason">Motif (montré à l&apos;abonnée)</Label>
          <Input
            id="sub-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="p. ex. Demande de remboursement traitée"
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
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Ban className="size-4" aria-hidden="true" />}
            Confirmer l&apos;annulation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Dialog d'offre 30 jours ───────────────

function GiftSubDialog({
  target, busy, onCancel, onConfirm,
}: {
  target: AdminSubRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const first = target?.userName.split(" ")[0] ?? "";
  const base = target ? (new Date(target.expiresAt).getTime() > Date.now() ? new Date(target.expiresAt) : new Date()) : new Date();
  const newEnd = target ? new Date(base.getTime() + 30 * DAY) : null;

  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-gold">
            <Sparkles className="size-5" aria-hidden="true" />
            Offrir 30 jours à {first} ?
          </DialogTitle>
          <DialogDescription>
            Geste commercial: une nouvelle période de 30 jours se raccorde après l&apos;échéance
            actuelle{newEnd ? ` (jusqu&apos;au ${formatDate(newEnd, { day: "numeric", month: "long" })})` : ""} —
            0 F, marquée « offerte par la Console » dans son historique. {first} est notifiée de
            ta attention 💛
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-xl bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          L&apos;échéance existante n&apos;est jamais écrasée: la ligne courante est clôturée et la
          période offerte s&apos;ouvre comme une nouvelle ligne tracée (norme comptable IFRS 15).
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onCancel} disabled={busy}>Pas maintenant</Button>
          <Button
            className="h-11 gap-1.5"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Gift className="size-4" aria-hidden="true" />}
            Offrir 30 jours
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
