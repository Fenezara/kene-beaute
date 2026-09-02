"use client";
// Kènè Pro — CRM : recherche, segments RFM, fiche cliente (ventes, RDV, diagnostics IA, notes)
import { useEffect, useMemo, useState } from "react";
import { Phone, Search, Sparkles, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/kene/api";
import { xof, formatDate, formatTime, scoreColor } from "@/lib/kene/format";
import { rfmScore, RFM_SEGMENT_STYLES } from "@/lib/kene/rfm";
import { RFM_SEGMENTS } from "@/lib/kene/types";
import type { BodyZone } from "@/lib/kene/types";
import { parseDiagnosis, diagImgSrc } from "@/components/kene/client/types";
import { SkinTwinCard, type TwinEntry } from "@/components/kene/skintwin/SkinTwinCard";
import { ProEvolutionCard } from "@/components/kene/evolution/ProEvolutionCard";
import { useApi } from "./useApi";
import { ApptStatusBadge, EmptyState, ErrorState, InitialAvatar, Money, SectionHeader, KenteTop } from "./ui-bits";
import type { ProClient, ProClientDetail } from "./types";

function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

function segmentBadge(segment: string) {
  const st = RFM_SEGMENT_STYLES[segment] ?? { bg: "bg-muted", text: "text-muted-foreground", label: segment };
  return <Badge variant="outline" className={cn("text-[10px] px-1.5", st.bg, st.text)}>{st.label}</Badge>;
}

function RfmDots({ client }: { client: ProClient }) {
  const recencyDays = client.lastVisit ? Math.floor((Date.now() - new Date(client.lastVisit).getTime()) / 86_400_000) : 999;
  const score = useMemo(() => rfmScore(recencyDays, client.visitsCount, client.totalSpent), [recencyDays, client.visitsCount, client.totalSpent]);
  const groups: { key: keyof typeof score; label: string; hint: string }[] = [
    { key: "r", label: "Récence", hint: `${recencyDays > 900 ? "jamais" : `${recencyDays} j`} depuis la dernière visite` },
    { key: "f", label: "Fréquence", hint: `${client.visitsCount} visite(s)` },
    { key: "m", label: "Montant", hint: xof(client.totalSpent) },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {groups.map((g) => {
        const val = score[g.key] as number;
        return (
          <div key={g.key} className="rounded-xl border border-border bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{g.label}</p>
            <div className="mt-1.5 flex justify-center gap-1" role="img" aria-label={`${g.label} : ${val}/5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={cn("size-2.5 rounded-full", i < val ? "bg-gold" : "bg-border")} aria-hidden="true" />
              ))}
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-gold">{val}/5</p>
            <p className="text-[9px] text-muted-foreground leading-tight">{g.hint}</p>
          </div>
        );
      })}
    </div>
  );
}

export function CrmSection({ tenantId }: { tenantId: string }) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [segment, setSegment] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const clients = useApi<ProClient[]>(
    () => (tenantId ? apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}${q ? `&q=${encodeURIComponent(q)}` : ""}`).then((r) => r.clients ?? []) : Promise.resolve([])),
    [tenantId, q]
  );

  const filtered = (clients.data ?? []).filter((c) => (segment ? c.rfmSegment === segment : true));
  const all = clients.data ?? [];
  const totalClients = all.length;
  const totalSpent = all.reduce((s, c) => s + c.totalSpent, 0);
  const totalVisits = all.reduce((s, c) => s + c.visitsCount, 0);
  const avgBasket = totalVisits > 0 ? Math.round(totalSpent / totalVisits) : 0;
  const champions = all.filter((c) => c.rfmSegment === "Champions").length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="CRM"
        sub="Base clientes, segmentation RFM et historique complet"
        actions={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher nom ou téléphone…" className="pl-8 w-64 bg-card" aria-label="Rechercher une cliente" />
          </div>
        }
      />

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Users className="size-4" />, label: "Clientes", value: String(totalClients) },
          { icon: <Wallet className="size-4" />, label: "Panier moyen", value: xof(avgBasket) },
          { icon: <Sparkles className="size-4" />, label: "Champions RFM", value: String(champions) },
        ].map((s) => (
          <Card key={s.label} className="overflow-hidden pt-0">
            <KenteTop />
            <CardContent className="p-3 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-gold/12 text-gold shrink-0">{s.icon}</span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="font-mono text-lg font-semibold leading-tight tabular-nums truncate">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres segments */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Filtrer par segment RFM">
        <button
          onClick={() => setSegment(null)}
          className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors", !segment ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
        >
          Tous ({totalClients})
        </button>
        {RFM_SEGMENTS.map((seg) => {
          const n = all.filter((c) => c.rfmSegment === seg).length;
          const st = RFM_SEGMENT_STYLES[seg];
          return (
            <button
              key={seg}
              onClick={() => setSegment(segment === seg ? null : seg)}
              aria-pressed={segment === seg}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                segment === seg ? cn(st.bg, st.text, "border-current font-semibold") : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {st.label} ({n})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {clients.error && !clients.data ? (
          <CardContent className="p-4"><ErrorState message={`CRM indisponible : ${clients.error}`} onRetry={clients.refetch} /></CardContent>
        ) : clients.loading && !clients.data ? (
          <CardContent className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </CardContent>
        ) : filtered.length === 0 ? (
          <CardContent><EmptyState label="Aucune cliente trouvée" sub="Modifiez la recherche ou les filtres de segment." /></CardContent>
        ) : (
          <div className="overflow-x-auto pretty-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
                  <TableHead>Dernière visite</TableHead>
                  <TableHead className="text-right">Visites</TableHead>
                  <TableHead className="text-right">Total dépensé</TableHead>
                  <TableHead>Segment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId(c.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ouvrir la fiche de ${c.name}`}
                    className="cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/50 outline-none"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={c.name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground sm:hidden font-mono">{c.phone}</p>
                          {c.skinType && <p className="hidden lg:block text-[10px] text-muted-foreground capitalize">Peau {c.skinType}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">{c.phone}</TableCell>
                    <TableCell className="text-xs">{c.lastVisit ? formatDate(c.lastVisit) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{c.visitsCount}</TableCell>
                    <TableCell className="text-right"><Money value={c.totalSpent} className="text-xs font-semibold" /></TableCell>
                    <TableCell>{segmentBadge(c.rfmSegment)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {openId && <ClientSheet clientId={openId} tenantId={tenantId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// ═════════════ Fiche cliente ═════════════
function ClientSheet({ clientId, tenantId, onClose }: { clientId: string; tenantId: string; onClose: () => void }) {
  // Note locale : chargée au montage (la fiche est re-montée à chaque ouverture)
  const [note, setNote] = useState(() => (typeof window === "undefined" ? "" : window.localStorage.getItem(`kene-crm-note-${clientId}`) ?? ""));
  const detail = useApi<ProClientDetail>(() => apiGet<ProClientDetail>(`/api/pro/clients/${clientId}`), [clientId]);

  const d = detail.data;
  const c = d?.client;

  /* Jumeau de Peau — agrégation 3D des diagnostics de la cliente (toutes zones) */
  const twinEntries = useMemo<TwinEntry[]>(
    () =>
      (d?.diagnoses ?? []).map((dg) => {
        const r = parseDiagnosis(dg.resultJson);
        return {
          id: dg.id,
          zone: dg.zone as BodyZone,
          score: dg.scoreGlobal,
          fitz: r?.fitzpatrick_estime,
          marks: r?.zones_marquages ?? [],
          date: dg.createdAt,
          indicators: r?.indicateurs,
        };
      }),
    [d?.diagnoses],
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="w-full sm:max-w-lg overflow-y-auto pretty-scroll p-0">
        {detail.error ? (
          <div className="p-4">
            {/* Titre sr-only : Radix exige un SheetTitle dès l'ouverture, même en état d'erreur */}
            <SheetTitle className="sr-only">Fiche cliente indisponible</SheetTitle>
            <ErrorState message={`Fiche indisponible : ${detail.error}`} onRetry={detail.refetch} />
          </div>
        ) : detail.loading || !d || !c ? (
          <div className="space-y-3 p-4">
            {/* Titre sr-only : présent dès le squelette de chargement (exigence Radix a11y) */}
            <SheetTitle className="sr-only">Chargement de la fiche cliente…</SheetTitle>
            <Skeleton className="h-20" />
            <Skeleton className="h-24" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <SheetHeader className="p-4 pb-3 border-b border-border bg-muted/40">
              <div className="flex items-center gap-3">
                <InitialAvatar name={c.name} className="size-12 text-sm" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-heading text-lg leading-tight truncate">{c.name}</SheetTitle>
                  <SheetDescription className="flex items-center gap-2 font-mono text-xs">
                    <Phone className="size-3" aria-hidden="true" /> {c.phone}
                  </SheetDescription>
                </div>
                {segmentBadge(c.rfmSegment)}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-card px-2 py-1.5">
                  <p className="text-[9px] uppercase text-muted-foreground">Visites</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{c.visitsCount}</p>
                </div>
                <div className="rounded-lg bg-card px-2 py-1.5">
                  <p className="text-[9px] uppercase text-muted-foreground">Dépensé</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{xof(c.totalSpent, { compact: true })}</p>
                </div>
                <div className="rounded-lg bg-card px-2 py-1.5">
                  <p className="text-[9px] uppercase text-muted-foreground">Dernière visite</p>
                  <p className="text-sm font-semibold">{c.lastVisit ? formatDate(c.lastVisit, { day: "numeric", month: "short" }) : "—"}</p>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-4 p-4">
              {/* RFM */}
              <section aria-label="Score RFM">
                <h4 className="font-heading text-sm font-bold mb-2">Score RFM</h4>
                <RfmDots client={c} />
              </section>

              {/* Diagnostics liés */}
              {c.userId && (
                <section aria-label="Diagnostics IA liés">
                  <h4 className="font-heading text-sm font-bold mb-2">Diagnostics Kènè ({d.diagnoses.length})</h4>
                  {/* Jumeau de Peau — agrégation 3D de tous les diagnostics de la cliente */}
                  {twinEntries.length > 0 && <SkinTwinCard context="pro" entries={twinEntries} className="mb-4" />}
                  {/* Fil du Temps — courbe d'évolution + lecture pro (séries calculées localement) */}
                  {d.diagnoses.length > 0 && <ProEvolutionCard rows={d.diagnoses} className="mb-4" />}
                  {d.diagnoses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun diagnostic pour cette cliente.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {d.diagnoses.map((dg) => {
                        const img = diagImgSrc(dg.imageData);
                        return (
                          <div key={dg.id} className="overflow-hidden rounded-xl border border-border bg-card">
                            <div className="aspect-square bg-muted">
                              <img src={img} alt={`Diagnostic ${dg.zone}`} className="size-full object-cover" />
                            </div>
                            <div className="p-1.5 text-center">
                              <p className="text-[10px] font-medium capitalize">{dg.zone.replace("_", " ")}</p>
                              <p className="font-mono text-xs font-bold" style={{ color: scoreColor(dg.scoreGlobal) }}>{dg.scoreGlobal}/100</p>
                              <p className="text-[9px] text-muted-foreground">{formatDate(dg.createdAt, { day: "numeric", month: "short" })}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* Onglets */}
              <Tabs defaultValue="sales">
                <TabsList className="w-full">
                  <TabsTrigger value="sales" className="text-xs flex-1">Ventes</TabsTrigger>
                  <TabsTrigger value="appts" className="text-xs flex-1">RDV</TabsTrigger>
                  <TabsTrigger value="notes" className="text-xs flex-1">Notes</TabsTrigger>
                </TabsList>
                <TabsContent value="sales" className="mt-3">
                  {d.sales.length === 0 ? (
                    <EmptyState label="Aucune vente" />
                  ) : (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pretty-scroll pr-1">
                      {d.sales.map((s) => (
                        <li key={s.id} className="rounded-xl border border-border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground font-mono">{formatDate(s.createdAt)} {formatTime(s.createdAt)}</span>
                            <Money value={s.total} className="text-xs font-semibold" />
                          </div>
                          <p className="mt-1 text-xs">{s.items.map((it) => `${it.qty}× ${it.label}`).join(" · ")}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="appts" className="mt-3">
                  {d.appointments.length === 0 ? (
                    <EmptyState label="Aucun rendez-vous" />
                  ) : (
                    <ul className="space-y-2 max-h-72 overflow-y-auto pretty-scroll pr-1">
                      {d.appointments.map((a) => (
                        <li key={a.id} className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{a.service.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {formatDate(a.startAt, { weekday: "short", day: "numeric", month: "short" })} {formatTime(a.startAt)}
                            </p>
                          </div>
                          <ApptStatusBadge status={a.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="notes" className="mt-3">
                  <Textarea
                    rows={5}
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      window.localStorage.setItem(`kene-crm-note-${c.id}`, e.target.value);
                    }}
                    placeholder="Notes privées sur la cliente (allergies, préférences, conseils…)"
                    aria-label="Notes privées"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">Enregistré localement sur ce poste (démo).</p>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
