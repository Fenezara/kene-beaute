"use client";
// Kènè — Console Admin · Utilisatrices (t. 128): l'annuaire des comptes pour
// la modération. Recherche + filtre par rôle, et les leviers individualisés:
// verrouiller un compte (motif obligatoire, montré au compte à sa tentative
// de connexion) / déverrouiller, et depuis t. 141 l'ACCÈS CONSOLE DÉLÉGUÉ:
// donner l'accès Console à une cliente de confiance / le retirer (jamais au
// dernier admin, jamais à soi-même — protections côté serveur).
import { useEffect, useMemo, useState } from "react";
import { Crown, Loader2, Lock, LockOpen, Search, ShieldCheck, Users, Trash2, AlertTriangle } from "lucide-react";
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
import { formatDate } from "@/lib/kene/format";
import { cn } from "@/lib/utils";
import { useApi } from "@/components/kene/pro/useApi";
import { EmptyState, ErrorState, KenteTop } from "@/components/kene/pro/ui-bits";
import type { AdminUserPatchResult, AdminUserRow } from "@/components/kene/pro/types";
import { useAdminGate } from "./admin-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROLE_LABEL: Record<string, string> = {
  client: "Cliente",
  pro: "Pro",
  admin: "Admin",
};

export function AdminUsers() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const [role, setRole] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState<"all" | "real" | "demo">("all");
  const list = useApi(
    () => apiGet<{ users: AdminUserRow[] }>(`/api/admin/users?q=${encodeURIComponent(dq)}&role=${role}`),
    [dq, role],
  );

  const allUsers = useMemo(() => list.data?.users ?? [], [list.data]);
  const realCount = useMemo(() => allUsers.filter((u) => !u.isDemo).length, [allUsers]);
  const demoCount = useMemo(() => allUsers.filter((u) => u.isDemo).length, [allUsers]);

  const rows = useMemo(() => {
    let all = allUsers;
    if (accountTypeFilter === "real") all = all.filter((u) => !u.isDemo);
    if (accountTypeFilter === "demo") all = all.filter((u) => u.isDemo);
    return all;
  }, [allUsers, accountTypeFilter]);

  // Dialogs de verrouillage + accès Console (t. 141) + purge légale RGPD/ARTCI
  const [lockFor, setLockFor] = useState<AdminUserRow | null>(null);
  const [promoteFor, setPromoteFor] = useState<AdminUserRow | null>(null);
  const [demoteFor, setDemoteFor] = useState<AdminUserRow | null>(null);
  const [purgeFor, setPurgeFor] = useState<AdminUserRow | null>(null);
  const [purgeReason, setPurgeReason] = useState("");
  const [busy, setBusy] = useState(false);

  // t. 141 — qui suis-je dans cette console ? (pour ne jamais proposer de
  // retirer MON propre accès — la protection vit aussi côté serveur).
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ user: { id: string } }>("/api/auth/session")
      .then((r) => setMeId(r.user.id))
      .catch(() => setMeId(null));
  }, []);

  // t. 130 — le PATCH de verrouillage passe par le gate (step-up serveur:
  // code frais exigé, dialogue de confirmation puis rejeu automatique).
  const gate = useAdminGate();

  const patchUser = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await gate.elevatedPatch<AdminUserPatchResult>(`/api/admin/users/${id}`, body);
      toast.success(okMsg);
      await list.refetch();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action impossible — réessaie");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const purgeUser = async (id: string, reason: string) => {
    setBusy(true);
    try {
      await gate.elevatedDelete(`/api/admin/users/${id}?reason=${encodeURIComponent(reason)}`);
      toast.success("Compte purgé et anonymisé conformément aux normes RGPD / ARTCI");
      setPurgeFor(null);
      setPurgeReason("");
      await list.refetch();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Suppression impossible — réessaie");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barre: recherche + filtres rôle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher par nom, téléphone, ville…"
            aria-label="Rechercher un compte"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filtrer par rôle">
          {([
            ["", "Toutes"],
            ["client", "Clientes"],
            ["pro", "Pro"],
            ["admin", "Admin"],
          ] as const).map(([key, label]) => (
            <button
              key={key || "all"}
              onClick={() => setRole(key)}
              aria-pressed={role === key}
              className={cn(
                "min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors",
                role === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtres Type de compte (Utilisateurs Réels vs Démos) */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par type de compte">
        {([
          ["all", `Tous les comptes (${allUsers.length})`],
          ["real", `Utilisateurs Réels (${realCount})`],
          ["demo", `Comptes Démo (${demoCount})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setAccountTypeFilter(key)}
            aria-pressed={accountTypeFilter === key}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
              accountTypeFilter === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Liste */}
      <Card className="overflow-hidden pt-0">
        <KenteTop />
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-base">
            <Users className="size-4 text-primary" aria-hidden="true" />
            Comptes de la plateforme
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
            <EmptyState label={dq ? `Aucun compte ne correspond à « ${dq} »` : "Aucun compte"} />
          ) : (
            <div className="overflow-x-auto pretty-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Compte</TableHead>
                    <TableHead className="hidden md:table-cell">Rôle</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Activité</TableHead>
                    <TableHead className="hidden sm:table-cell">Inscrite le</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((u) => (
                    <TableRow key={u.id} className={cn(u.lockedAt && "opacity-75")}>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium leading-tight">{u.name}</p>
                          {u.isDemo ? (
                            <span className="rounded-full bg-muted/70 text-muted-foreground border border-dashed border-border px-2 py-0.5 text-[9.5px] font-medium">
                              Compte Démo
                            </span>
                          ) : (
                            <span className="rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-[9.5px] font-semibold">
                              Utilisateur Réel
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{u.phone}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              u.role === "admin" && "border-finance/40 text-finance",
                              u.role === "pro" && "border-gold/40 text-gold",
                            )}
                          >
                            {ROLE_LABEL[u.role] ?? u.role}
                          </Badge>
                          {u.tenantName && <span className="text-[10px] text-muted-foreground">{u.tenantName}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right text-xs text-muted-foreground">
                        {u.orders} commande{u.orders > 1 ? "s" : ""} · {u.diagnoses} diag.
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {formatDate(new Date(u.createdAt), { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell>
                        {u.lockedAt ? (
                          <Badge className="bg-bissap/15 text-bissap border border-bissap/30 hover:bg-bissap/15" title={u.lockedReason ?? undefined}>
                            Verrouillée
                          </Badge>
                        ) : (
                          <Badge className="bg-success/15 text-success border border-success/30 hover:bg-success/15">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.role === "admin" ? (
                          u.id === meId ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-finance" title="Ton compte — on ne retire pas son propre accès">
                              <Crown className="size-3.5" aria-hidden="true" /> toi
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-11 gap-1.5 border-bissap/40 text-bissap hover:bg-bissap/10 hover:text-bissap"
                              disabled={busy}
                              onClick={() => setDemoteFor(u)}
                              aria-label={`Retirer l'accès Console de ${u.name}`}
                            >
                              <ShieldCheck className="size-4" aria-hidden="true" />
                              <span className="hidden sm:inline">Retirer la Console</span>
                            </Button>
                          )
                        ) : (
                          <span className="inline-flex flex-wrap justify-end gap-1.5">
                            {/* t. 141 — accès Console délégué: clientes uniquement
                                (les comptes Pro restent liés à leur institut). */}
                            {u.role === "client" && !u.lockedAt && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-11 gap-1.5 border-finance/40 text-finance hover:bg-finance/10 hover:text-finance"
                                disabled={busy}
                                onClick={() => setPromoteFor(u)}
                                aria-label={`Donner l'accès Console à ${u.name}`}
                              >
                                <Crown className="size-4" aria-hidden="true" />
                                <span className="hidden md:inline">Console</span>
                              </Button>
                            )}
                            {u.lockedAt ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-11 gap-1.5 border-success/40 text-success hover:bg-success/10 hover:text-success"
                                disabled={busy}
                                onClick={() => void patchUser(u.id, { locked: false }, `${u.name} peut se reconnecter`)}
                              >
                                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LockOpen className="size-4" aria-hidden="true" />}
                                <span className="hidden sm:inline">Déverrouiller</span>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-11 gap-1.5 border-bissap/40 text-bissap hover:bg-bissap/10 hover:text-bissap"
                                onClick={() => setLockFor(u)}
                              >
                                <Lock className="size-4" aria-hidden="true" />
                                <span className="hidden sm:inline">Verrouiller</span>
                              </Button>
                            )}
                            {u.id !== meId && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-11 px-3 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                  setPurgeFor(u);
                                  setPurgeReason("Demande formelle de suppression (RGPD / ARTCI)");
                                }}
                                title="Purger et anonymiser le compte"
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                                <span className="hidden xl:inline ml-1 text-xs">Purger</span>
                              </Button>
                            )}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de verrouillage — motif obligatoire */}
      <Dialog open={Boolean(lockFor)} onOpenChange={(o) => (!o ? setLockFor(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-bissap">
              <Lock className="size-5" aria-hidden="true" />
              Verrouiller {lockFor?.name ?? ""} ?
            </DialogTitle>
            <DialogDescription>
              Le compte ne pourra plus se connecter (le motif lui sera montré) et sa session
              ouverte s&apos;éteindra à son prochain passage. Réversible à tout moment.
            </DialogDescription>
          </DialogHeader>
          <LockReasonDialogInner
            busy={busy}
            onCancel={() => setLockFor(null)}
            onConfirm={async (reason) => {
              if (!lockFor) return;
              const okDone = await patchUser(lockFor.id, { locked: true, reason }, `${lockFor.name} verrouillée — motif enregistré`);
              if (okDone) setLockFor(null);
            }}
          />
        </DialogContent>
      </Dialog>
      {/* t. 141 — Dialog: DONNER l'accès Console (énoncé d'impact complet) */}
      <Dialog open={Boolean(promoteFor)} onOpenChange={(o) => (!o ? setPromoteFor(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-finance">
              <Crown className="size-5" aria-hidden="true" />
              Donner l&apos;accès Console à {promoteFor?.name ?? ""} ?
            </DialogTitle>
            <DialogDescription>
              Elle ouvrira la Console Kènè (/console) avec son propre numéro et verra toute la
              plateforme : instituts, utilisatrices, abonnements, sécurité.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-xl bg-muted/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            Les actions sensibles (suspension, verrouillage, annulation d&apos;abonnement, offre de
            jours) resteront protégées par la confirmation d&apos;identité (code frais) et chaque
            geste sera tracé au journal d&apos;audit. Elle est notifiée immédiatement — et tu peux
            retirer son accès à tout moment depuis cette même liste.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setPromoteFor(null)} disabled={busy}>Pas maintenant</Button>
            <Button
              className="h-11 gap-1.5"
              disabled={busy}
              onClick={async () => {
                if (!promoteFor) return;
                const okDone = await patchUser(promoteFor.id, { action: "promote" }, `${promoteFor.name} a maintenant accès à la Console 👑`);
                if (okDone) setPromoteFor(null);
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Crown className="size-4" aria-hidden="true" />}
              Donner l&apos;accès
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* t. 141 — Dialog: RETIRER l'accès Console */}
      <Dialog open={Boolean(demoteFor)} onOpenChange={(o) => (!o ? setDemoteFor(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-bissap">
              <ShieldCheck className="size-5" aria-hidden="true" />
              Retirer l&apos;accès Console de {demoteFor?.name ?? ""} ?
            </DialogTitle>
            <DialogDescription>
              Son compte redevient cliente — ses données restent intactes. Sa session console
              ouverte s&apos;éteindra à son prochain rechargement de page (le cookie expire au bout
              de 8 h au maximum).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setDemoteFor(null)} disabled={busy}>Annuler</Button>
            <Button
              className="h-11 gap-1.5 bg-bissap text-white hover:bg-bissap/90"
              disabled={busy}
              onClick={async () => {
                if (!demoteFor) return;
                const okDone = await patchUser(demoteFor.id, { action: "demote" }, `Accès Console retiré — ${demoteFor.name} redevient cliente`);
                if (okDone) setDemoteFor(null);
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
              Retirer l&apos;accès
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog de purge / anonymisation légale */}
      <Dialog open={Boolean(purgeFor)} onOpenChange={(o) => (!o ? setPurgeFor(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-destructive">
              <AlertTriangle className="size-5" aria-hidden="true" />
              Purger le compte de {purgeFor?.name ?? ""} ?
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              Conforme aux exigences <strong>RGPD (Art. 17)</strong> et <strong>ARTCI</strong>.
              Les photos et analyses IA de peau, passkeys et notifications seront <strong>définitivement supprimées</strong>.
              Les commandes et reçus de caisse seront <strong>anonymisés</strong> pour la conformité comptable SYSCOHADA (10 ans).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="purge-reason" className="text-xs font-semibold">Motif légal consigné dans le journal d&apos;audit</Label>
            <Input
              id="purge-reason"
              value={purgeReason}
              onChange={(e) => setPurgeReason(e.target.value)}
              placeholder="ex: Demande d'effacement cliente, fraude avérée..."
              className="h-11 text-xs"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setPurgeFor(null)} disabled={busy}>Annuler</Button>
            <Button
              className="h-11 gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy || !purgeReason.trim()}
              onClick={() => {
                if (purgeFor) void purgeUser(purgeFor.id, purgeReason.trim());
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
              Purger définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Champ motif + boutons du dialog de verrouillage (état local propre par ouverture). */
function LockReasonDialogInner({
  busy, onCancel, onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="lock-reason">Motif (montré au compte à sa prochaine connexion)</Label>
        <Input
          id="lock-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="p. ex. Comportement abusif signalé par un institut"
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
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />}
          Verrouiller
        </Button>
      </DialogFooter>
    </>
  );
}
