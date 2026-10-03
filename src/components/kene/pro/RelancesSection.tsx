"use client";
// Kènè Pro — Relances « Le Fil du Retour »: post-protocole, soins de suivi,
// satisfaction produits et réactivation des clientes inactives — dérivées de l'activité réelle.
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, BellRing, CalendarCheck, Check, Loader2, MessageCircle, Phone, Send, Sparkles, Undo2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/kene/api";
import { formatDate } from "@/lib/kene/format";
import {
  buildRelanceMessage,
  waLink,
  KIND_META,
  type FollowUpItem,
} from "@/lib/kene/followups";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, InitialAvatar, KpiCard, SectionHeader, KenteTop } from "./ui-bits";

interface FollowUpsResponse {
  items: FollowUpItem[];
  counts: { late: number; week: number; upcoming: number; done: number; dismissed: number };
  tenant: { name: string };
}

type FilterId = "late" | "week" | "upcoming" | "done" | "dismissed";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "late", label: "En retard" },
  { id: "week", label: "Cette semaine" },
  { id: "upcoming", label: "À venir" },
  { id: "done", label: "Traitées" },
  { id: "dismissed", label: "Ignorées" },
];

function matchFilter(i: FollowUpItem, f: FilterId): boolean {
  if (f === "done") return i.status === "done";
  if (f === "dismissed") return i.status === "dismissed";
  if (i.status !== "todo") return false;
  if (f === "late") return i.daysFromNow < 0;
  if (f === "week") return i.daysFromNow >= 0 && i.daysFromNow <= 7;
  return i.daysFromNow > 7;
}

/** Puce d'échéance: En retard de N j / Aujourd'hui / Dans N j */
function DueChip({ item }: { item: FollowUpItem }) {
  const d = item.daysFromNow;
  const cls =
    d < 0
      ? "bg-bissap/15 text-destructive border-bissap/30"
      : d === 0
        ? "bg-sunset/15 text-sunset-text border-sunset/30"
        : d <= 7
          ? "bg-gold/15 text-gold-text border-gold/30"
          : "bg-muted text-muted-foreground border-border";
  const label = d < 0 ? `En retard de ${-d} j` : d === 0 ? "Aujourd'hui" : `Dans ${d} j`;
  return <Badge variant="outline" className={cn("text-[10px] px-1.5 tabular-nums", cls)}>{label}</Badge>;
}

const VIA_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  call: "Appel",
  visit: "En institut",
  sms: "SMS",
};

export function RelancesSection({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const data = useApi<FollowUpsResponse | null>(
    () => (tenantId ? apiGet<FollowUpsResponse>(`/api/pro/followups?tenantId=${tenantId}`) : Promise.resolve(null)),
    [tenantId]
  );
  const [filter, setFilter] = useState<FilterId>("late");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Filtre initial intelligent: premier panier non vide
  useEffect(() => {
    if (!data.data) return;
    const c = data.data.counts;
    const order: FilterId[] = ["late", "week", "upcoming", "done", "dismissed"];
    const firstNonEmpty = order.find((f) => (c as Record<FilterId, number>)[f] > 0);
    if (firstNonEmpty) setFilter(firstNonEmpty);
  }, [data.data]);

  const items = data.data?.items ?? [];
  const counts = data.data?.counts ?? { late: 0, week: 0, upcoming: 0, done: 0, dismissed: 0 };
  const visible = useMemo(() => items.filter((i) => matchFilter(i, filter)), [items, filter]);
  const todoTotal = counts.late + counts.week + counts.upcoming;
  const [batchBusy, setBatchBusy] = useState(false);

  async function batchRelance(via: "sms" | "whatsapp") {
    const lateItems = items.filter((i) => i.status === "todo" && i.daysFromNow < 0);
    if (lateItems.length === 0) {
      toast.info("Aucune cliente en retard à relancer.");
      return;
    }
    setBatchBusy(true);
    try {
      const batchPayload = lateItems.map((it) => ({
        dedupKey: it.dedupKey,
        clientProfileId: it.clientProfileId ?? undefined,
        clientPhone: it.clientPhone,
        clientName: it.clientName,
        message: buildRelanceMessage(it.kind, { clientName: it.clientName, detail: it.detail, dueAt: it.dueAt, tenantName }),
      }));

      await apiPost("/api/pro/followups", {
        tenantId,
        batch: batchPayload,
        via,
      });

      toast.success(`${lateItems.length} relance(s) en retard traitées par ${via.toUpperCase()} 🚀`);
      await data.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la relance groupée");
    } finally {
      setBatchBusy(false);
    }
  }

  async function mark(item: FollowUpItem, status: "done" | "dismissed" | "todo", via?: "whatsapp" | "call" | "visit" | "sms") {
    const first = item.clientName.split(/\s+/)[0] ?? item.clientName;
    const message = buildRelanceMessage(item.kind, { clientName: item.clientName, detail: item.detail, dueAt: item.dueAt, tenantName });
    setBusyKey(item.dedupKey);
    try {
      if (status === "done" && via === "whatsapp") {
        window.open(waLink(item.clientPhone, message), "_blank", "noopener,noreferrer");
      }
      await apiPost("/api/pro/followups", {
        tenantId,
        dedupKey: item.dedupKey,
        status,
        via: via ?? null,
        clientProfileId: item.clientProfileId ?? undefined,
        clientPhone: item.clientPhone,
        clientName: item.clientName,
        message: via === "whatsapp" || via === "sms" ? message : undefined,
      });
      if (status === "done") {
        toast.success(
          via === "whatsapp"
            ? `Relance WhatsApp envoyée à ${first} — marquée traitée`
            : via === "sms"
              ? `Relance SMS envoyée à ${first} via Zavu/SMS — marquée traitée`
              : via === "call"
                ? `Relance de ${first} marquée traitée (appel)`
                : `Relance de ${first} marquée traitée`
        );
      } else if (status === "dismissed") {
        toast.info(`Relance de ${first} ignorée pour aujourd'hui`);
      } else {
        toast.info(`Relance de ${first} réactivée`);
      }
      await data.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Relances"
        sub="Le Fil du Retour — protocoles, soins de suivi et clientes à réactiver, calculés sur l'activité réelle"
        actions={
          <div className="flex items-center gap-2">
            {counts.late > 0 && (
              <Button
                size="sm"
                onClick={() => void batchRelance("sms")}
                disabled={batchBusy}
                className="h-8 gap-1.5 k-btn-gold text-primary-foreground text-xs font-bold shadow-sm"
              >
                {batchBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                <span>Relancer les {counts.late} en retard (SMS)</span>
              </Button>
            )}
            <Badge variant="outline" className="gap-1.5 bg-muted/60 text-muted-foreground">
              <Sparkles className="size-3" aria-hidden="true" /> {todoTotal} à traiter · auto
            </Badge>
          </div>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={<BellRing className="size-4" />} label="En retard" value={String(counts.late)} hint="À relancer en priorité" monetary={false} />
        <KpiCard icon={<CalendarCheck className="size-4" />} label="Cette semaine" value={String(counts.week)} hint="Échéance ≤ 7 jours" monetary={false} />
        <KpiCard icon={<Sparkles className="size-4" />} label="À venir" value={String(counts.upcoming)} hint="Plus d'une semaine" monetary={false} />
        <KpiCard icon={<Check className="size-4" />} label="Traitées" value={String(counts.done)} hint="Relances closes" monetary={false} />
      </div>

      {/* Filtres */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Filtrer les relances">
        {FILTERS.map((f) => {
          const n = (counts as Record<FilterId, number>)[f.id];
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={active}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                active
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label} ({n})
            </button>
          );
        })}
      </div>

      {/* Liste */}
      {data.error && !data.data ? (
        <Card><CardContent className="p-4"><ErrorState message={`Relances indisponibles : ${data.error}`} onRetry={data.refetch} /></CardContent></Card>
      ) : data.loading && !data.data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement des relances">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card className="overflow-hidden">
          <KenteTop />
          <CardContent>
            <EmptyState
              label={todoTotal === 0 ? "Aucune relance à faire" : "Rien dans ce panier"}
              sub={todoTotal === 0 ? "Toutes vos clientes sont à jour — le fil du retour est tranquille ✨" : "Les relances de ce filtre sont vides."}
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3 max-h-[62vh] overflow-y-auto pretty-scroll pr-1" aria-label="Liste des relances">
          <AnimatePresence initial={false}>
            {visible.map((item) => (
              <motion.li
                key={item.dedupKey}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <Card className={cn("overflow-hidden pt-0", item.status === "todo" && item.daysFromNow < 0 && "border-bissap/30")}>
                  <KenteTop />
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <InitialAvatar name={item.clientName} className="size-10" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-semibold truncate">{item.clientName}</p>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5", KIND_META[item.kind].cls)}>{KIND_META[item.kind].label}</Badge>
                          <DueChip item={item} />
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{item.clientPhone}</p>
                        <p className="text-xs font-medium mt-1.5">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                        {item.note && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-gold-text">
                            <CalendarCheck className="size-3" aria-hidden="true" /> {item.note}
                          </p>
                        )}
                        {item.status !== "todo" && (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Check className="size-3 text-success" aria-hidden="true" />
                            {item.status === "done" ? "Traitée" : "Ignorée"}
                            {item.via && VIA_LABELS[item.via] ? ` · ${VIA_LABELS[item.via]}` : ""}
                            {item.handledAt ? ` · le ${formatDate(item.handledAt, { day: "numeric", month: "short" })}` : ""}
                          </p>
                        )}
                      </div>
                    </div>

                    {item.status === "todo" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => void mark(item, "done", "whatsapp")}
                          disabled={busyKey === item.dedupKey}
                          className="gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold"
                          aria-label={`Relancer ${item.clientName} sur WhatsApp et marquer traitée`}
                        >
                          <MessageCircle className="size-3.5" aria-hidden="true" /> WhatsApp
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void mark(item, "done", "sms")}
                          disabled={busyKey === item.dedupKey}
                          className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 font-semibold"
                          aria-label={`Relancer ${item.clientName} par SMS direct (Zavu) et marquer traitée`}
                        >
                          <Send className="size-3.5" aria-hidden="true" /> SMS Direct
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void mark(item, "done", "call")}
                          disabled={busyKey === item.dedupKey}
                          className="gap-1.5"
                          aria-label={`Marquer la relance de ${item.clientName} traitée après appel`}
                        >
                          <Phone className="size-3.5" aria-hidden="true" /> Appel traité
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void mark(item, "dismissed")}
                          disabled={busyKey === item.dedupKey}
                          className="gap-1.5 text-muted-foreground"
                          aria-label={`Ignorer la relance de ${item.clientName} pour aujourd'hui`}
                        >
                          <Archive className="size-3.5" aria-hidden="true" /> Plus tard
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void mark(item, "todo")}
                          disabled={busyKey === item.dedupKey}
                          className="gap-1.5"
                          aria-label={`Réactiver la relance de ${item.clientName}`}
                        >
                          <Undo2 className="size-3.5" aria-hidden="true" /> Réactiver
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <p className="text-[10px] text-muted-foreground">
        Relances recalculées à chaque ouverture depuis les diagnostics, RDV, ventes et visites — aucun planification à maintenir. Les relances WhatsApp sont journalisées dans l&apos;historique client.
      </p>
    </div>
  );
}
