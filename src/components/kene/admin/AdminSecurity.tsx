"use client";
// Kènè — Console Admin · Posture sécurité (t. 128: extraite d'AdminApp,
// enrichie des kinds de gestion t. 128): 4 indicateurs + journal d'audit.
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import { cn } from "@/lib/utils";
import { useApi, type UseApiResult } from "@/components/kene/pro/useApi";
import { KenteTop } from "@/components/kene/pro/ui-bits";
import type { AdminSecurity } from "@/components/kene/pro/types";

// Kind → libellé FR lisible + pastille couleur (tokens shadcn: succès vert
// Baobab, échecs/verrous bordeaux Bissap, demande de code or profond, les
// décisions de GESTION t. 128 en or — acte fondateur piloté, pas une alerte
// ni une routine). Zéro nouvelle dépendance.
const SEC_KINDS: Record<string, { label: string; cls: string }> = {
  login_success: { label: "Connexion réussie", cls: "bg-success/15 text-success" },
  login_failed: { label: "Code erroné", cls: "bg-bissap/15 text-bissap" },
  login_locked: { label: "Compte verrouillé", cls: "bg-bissap/15 text-bissap" },
  otp_request: { label: "Code demandé", cls: "bg-primary/15 text-primary" },
  logout: { label: "Déconnexion", cls: "bg-muted text-muted-foreground" },
  payment_confirm: { label: "Paiement confirmé", cls: "bg-muted text-muted-foreground" },
  admin_access: { label: "Accès console", cls: "bg-muted text-muted-foreground" },
  pro_register: { label: "Inscription pro", cls: "bg-muted text-muted-foreground" },
  push_subscribe: { label: "Abonnement push", cls: "bg-muted text-muted-foreground" },
  upload_reject: { label: "Fichier rejeté", cls: "bg-muted text-muted-foreground" },
  // ── t. 128 — gestes de gestion console ──
  tenant_suspended: { label: "Institut suspendu", cls: "bg-gold/15 text-gold" },
  tenant_reactivated: { label: "Institut réactivé", cls: "bg-success/15 text-success" },
  tenant_commission: { label: "Commission fixée", cls: "bg-gold/15 text-gold" },
  tenant_plan: { label: "Plan changé", cls: "bg-muted text-muted-foreground" },
  user_locked: { label: "Compte verrouillé (console)", cls: "bg-gold/15 text-gold" },
  user_unlocked: { label: "Compte déverrouillé", cls: "bg-success/15 text-success" },
  // ── t. 130 — step-up & passkeys ──
  admin_elevated: { label: "Identité confirmée (step-up)", cls: "bg-primary/15 text-primary" },
  admin_elevate_failed: { label: "Step-up refusé", cls: "bg-bissap/15 text-bissap" },
  passkey_registered: { label: "Passkey enregistré", cls: "bg-gold/15 text-gold" },
  passkey_register_failed: { label: "Passkey refusé", cls: "bg-bissap/15 text-bissap" },
  passkey_removed: { label: "Passkey retiré", cls: "bg-muted text-muted-foreground" },
};

/** Heure FR compacte: « 16/08 14:32 » (— si date illisible). */
function secTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : formatDate(d, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AdminSecurity({ sec }: { sec: UseApiResult<AdminSecurity> }) {
  const d = sec.data;
  const loading = sec.loading && !d;
  const failed = d?.stats.failedLogins24h ?? 0;
  const locked = d?.stats.locked24h ?? 0;
  const indicators = [
    { label: "Événements 24 h", value: d?.stats.last24h ?? 0, warn: false },
    { label: "Échecs de connexion 24 h", value: failed, warn: failed > 0 },
    { label: "Verrouillages 24 h", value: locked, warn: locked > 0 },
    { label: "Total journal", value: d?.stats.total ?? 0, warn: false },
  ];

  return (
    <Card className="overflow-hidden pt-0">
      <KenteTop />
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-base">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          Posture sécurité
          <Badge variant="outline" className="font-mono text-[10px]">2026</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 4 indicateurs — sobre, alerte bordeaux seulement si > 0 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {indicators.map((i) => (
            <div key={i.label} className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] leading-tight text-muted-foreground">{i.label}</p>
              <p className={cn("mt-1 font-mono text-xl font-bold tabular-nums", i.warn ? "text-bissap" : "text-foreground")}>
                {loading ? "…" : i.value}
              </p>
            </div>
          ))}
        </div>

        {/* Journal — erreur inline (la carte reste debout), vide, ou liste */}
        {sec.error ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-bissap/10 px-3.5 py-3 text-sm text-bissap">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">Journal indisponible : {sec.error}</span>
            <Button size="sm" variant="outline" onClick={() => void sec.refetch()} className="gap-1.5">
              <RefreshCw className="size-3.5" aria-hidden="true" /> Réessayer
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Chargement du journal sécurité">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : !d || d.events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            Rien à signaler — le journal démarre avec la prochaine connexion
          </p>
        ) : (
          <ul
            role="list"
            aria-label="Journal de sécurité — événements les plus récents"
            className="max-h-80 divide-y divide-border/60 overflow-y-auto pretty-scroll"
          >
            {d.events.map((e) => {
              const k = SEC_KINDS[e.kind] ?? { label: e.kind, cls: "bg-muted text-muted-foreground" };
              return (
                <li role="listitem" key={e.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5">
                  <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ring-current/15", k.cls)}>
                    {k.label}
                  </span>
                  {e.phone && <span className="font-mono text-xs text-muted-foreground">{e.phone}</span>}
                  {e.ip && <span className="hidden font-mono text-[11px] text-muted-foreground/70 sm:inline">{e.ip}</span>}
                  {e.detail && (
                    <span className="hidden max-w-40 truncate text-[11px] text-muted-foreground/80 md:inline" title={e.detail}>{e.detail}</span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{secTime(e.ts)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
