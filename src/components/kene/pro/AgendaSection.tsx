"use client";
// Kènè Pro — Agenda : vue semaine/jour, création RDV, actions (confirmer, terminer, annuler, no-show, déplacer)
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Banknote,
  CalendarDays,
  CheckCircle2,
  XCircle,
  UserX,
  CalendarClock,
  Calendar as CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPatch } from "@/lib/kene/api";
import { addDays, startOfWeek, formatDate, formatTime, xof } from "@/lib/kene/format";
import { useApi } from "./useApi";
import { ApptStatusBadge, EmptyState, ErrorState, Money, SectionHeader } from "./ui-bits";
import type { ProAppointment, ProCatalog, ProClient } from "./types";

const OPEN = 9;
const CLOSE = 20;
const OPEN_MIN = OPEN * 60;
const ROW_H = 34;
const ROWS = ((CLOSE - OPEN) * 60) / 30;

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function sameDay(a: string | Date, b: Date): boolean {
  return new Date(a).toDateString() === b.toDateString();
}
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeOptions(): string[] {
  const out: string[] = [];
  for (let m = OPEN_MIN; m < CLOSE * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export function AgendaSection({ tenantId }: { tenantId: string }) {
  const [view, setView] = useState<"jour" | "semaine">("semaine");
  const [cursor, setCursor] = useState(() => startOfWeek(new Date())); // toujours aligné lundi
  const [dayOffset, setDayOffset] = useState(() => (new Date().getDay() + 6) % 7);
  const [selected, setSelected] = useState<ProAppointment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(cursor, i)),
    [cursor]
  );
  const rangeFrom = days[0];
  const rangeTo = addDays(days[6], 1);

  const list = useApi<ProAppointment[]>(
    () =>
      apiGet<{ appointments: ProAppointment[] }>(
        `/api/pro/appointments?tenantId=${tenantId}&from=${rangeFrom.toISOString()}&to=${rangeTo.toISOString()}`
      ).then((r) => r.appointments ?? []),
    [tenantId, rangeFrom.toISOString(), rangeTo.toISOString()]
  );

  const catalog = useApi<ProCatalog>(
    () => (tenantId ? apiGet<ProCatalog>(`/api/pro/catalog?tenantId=${tenantId}`) : Promise.resolve({ services: [], products: [] })),
    [tenantId]
  );
  const clients = useApi<ProClient[]>(
    () => (tenantId ? apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}`).then((r) => r.clients ?? []) : Promise.resolve([])),
    [tenantId, createOpen]
  );

  // Praticiennes déduites des RDV : fenêtre large (30 j passés → 45 j à venir)
  // pour disposer des resourceId réels même sur une semaine sans RDV.
  const resourcePool = useApi<ProAppointment[]>(
    () =>
      apiGet<{ appointments: ProAppointment[] }>(
        `/api/pro/appointments?tenantId=${tenantId}&from=${addDays(new Date(), -30).toISOString()}&to=${addDays(new Date(), 45).toISOString()}`
      ).then((r) => r.appointments ?? []),
    [tenantId]
  );

  const resources = useMemo(() => {
    const map = new Map<string, { value: string; name: string; color: string }>();
    for (const a of [...(list.data ?? []), ...(resourcePool.data ?? [])]) {
      const value = a.resourceId ?? a.resource.id ?? a.resource.name;
      if (!map.has(value)) map.set(value, { value, name: a.resource.name, color: a.resource.color });
    }
    return [...map.values()];
  }, [list.data, resourcePool.data]);

  const step = (dir: 1 | -1) => {
    if (view === "semaine") {
      setCursor((c) => addDays(c, dir * 7));
    } else {
      let o = dayOffset + dir;
      if (o < 0) {
        setCursor((c) => addDays(c, -7));
        o = 6;
      } else if (o > 6) {
        setCursor((c) => addDays(c, 7));
        o = 0;
      }
      setDayOffset(o);
    }
  };
  const goToday = () => {
    setCursor(startOfWeek(new Date()));
    setDayOffset((new Date().getDay() + 6) % 7);
  };
  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();

  const label =
    view === "semaine"
      ? `${formatDate(days[0], { day: "numeric", month: "long" })} – ${formatDate(days[6], { day: "numeric", month: "long", year: "numeric" })}`
      : formatDate(days[dayOffset], { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const shownDays = view === "jour" ? [days[dayOffset]] : days;

  async function act(appt: ProAppointment, action: string, extra?: Record<string, unknown>) {
    try {
      const res = await apiPatch<{ appointment: ProAppointment; sale?: unknown }>(`/api/pro/appointments/${appt.id}`, {
        action,
        ...(extra ?? {}),
      });
      if (action === "complete") {
        toast.success("Vente encaissée", { description: "Sale créée + écriture comptable automatique (CA / SYSCOHADA)." });
      } else if (action === "cancel") {
        toast.info("Rendez-vous annulé", { description: "Politique de remboursement appliquée selon le délai." });
      } else {
        toast.success(`RDV ${action === "confirm" ? "confirmé" : action === "no_show" ? "marqué no-show" : "déplacé"}`);
      }
      setSelected(null);
      await Promise.all([list.refetch(), resourcePool.refetch()]);
      return res;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
      throw e;
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Agenda"
        sub="Planification des soins et praticiennes"
        actions={
          <>
            <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "jour" | "semaine")} variant="outline" className="rounded-lg">
              <ToggleGroupItem value="jour" className="text-xs px-3">Jour</ToggleGroupItem>
              <ToggleGroupItem value="semaine" className="text-xs px-3">Semaine</ToggleGroupItem>
            </ToggleGroup>
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5 font-semibold">
              <Plus className="size-4" aria-hidden="true" /> Nouveau RDV
            </Button>
          </>
        }
      />

      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => step(-1)} aria-label={view === "jour" ? "Jour précédent" : "Semaine précédente"}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="font-heading text-sm font-semibold capitalize flex items-center gap-2">
          <CalendarIcon className="size-4 text-primary" aria-hidden="true" />
          {label}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={goToday} className="text-xs">Aujourd&apos;hui</Button>
          <Button variant="ghost" size="icon" onClick={() => step(1)} aria-label={view === "jour" ? "Jour suivant" : "Semaine suivante"}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {list.error && !list.data ? (
        <ErrorState message={`Agenda indisponible : ${list.error}`} onRetry={list.refetch} />
      ) : list.loading && !list.data ? (
        <Skeleton className="h-[480px] w-full" />
      ) : (
        <Card className="overflow-hidden">
          {view === "jour" && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar border-b border-border/70 px-3 py-2">
              {days.map((d, i) => (
                <button
                  key={i}
                  onClick={() => setDayOffset(i)}
                  aria-pressed={i === dayOffset}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                    i === dayOffset ? "bg-primary text-primary-foreground font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {DAY_NAMES[(d.getDay() + 6) % 7]} {formatDate(d, { day: "numeric" })}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto pretty-scroll">
            <div className="min-w-fit">
              {/* En-têtes jours */}
              <div className="grid border-b border-border/70 bg-muted/40" style={{ gridTemplateColumns: `56px repeat(${shownDays.length}, minmax(96px, 1fr))` }}>
                <div className="h-10" aria-hidden="true" />
                {shownDays.map((d, i) => (
                  <div key={i} className={cn("h-10 border-l border-border/60 px-2 flex flex-col items-center justify-center", isToday(d) && "bg-gold/10")}>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{DAY_NAMES[(d.getDay() + 6) % 7]}</span>
                    <span className={cn("font-mono text-sm font-semibold", isToday(d) && "text-primary")}>{formatDate(d, { day: "numeric", month: "2-digit" })}</span>
                  </div>
                ))}
              </div>
              {/* Grille */}
              <div className="grid max-h-[70vh] overflow-y-auto pretty-scroll" style={{ gridTemplateColumns: `56px repeat(${shownDays.length}, minmax(96px, 1fr))` }}>
                <div className="relative" style={{ height: ROWS * ROW_H }}>
                  {Array.from({ length: CLOSE - OPEN }).map((_, i) => (
                    <div key={i} className="absolute right-1 -translate-y-1/2 font-mono text-[10px] text-muted-foreground tabular-nums" style={{ top: i * 2 * ROW_H + ROW_H }}>
                      {String(OPEN + i).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                {shownDays.map((d, di) => {
                  const dayAppts = (list.data ?? []).filter((a) => sameDay(a.startAt, d));
                  return (
                    <div key={di} className={cn("relative border-l border-border/60", isToday(d) && "bg-gold/[0.04]")}>
                      {/* lignes 30 min */}
                      {Array.from({ length: ROWS }).map((_, i) => (
                        <div key={i} className={cn("border-b border-border/40", i % 2 === 0 && "border-border/70")} style={{ height: ROW_H }} />
                      ))}
                      {/* RDV */}
                      {dayAppts.map((a) => {
                        const start = new Date(a.startAt);
                        const startMin = start.getHours() * 60 + start.getMinutes();
                        const top = Math.max(0, ((startMin - OPEN_MIN) / 30) * ROW_H + 1);
                        const height = Math.max(ROW_H - 4, (a.durationMin / 30) * ROW_H - 4);
                        const cancelled = a.status === "cancelled" || a.status === "no_show";
                        return (
                          <button
                            key={a.id}
                            onClick={() => setSelected(a)}
                            aria-label={`${formatTime(a.startAt)} — ${a.clientName} — ${a.service.name}`}
                            className={cn(
                              "absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left shadow-sm transition-transform hover:scale-[1.02] hover:z-20 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-ring",
                              cancelled && "opacity-45 saturate-50"
                            )}
                            style={{
                              top,
                              height,
                              backgroundColor: `color-mix(in srgb, ${a.resource.color} 18%, var(--card))`,
                              borderLeftColor: a.resource.color,
                            }}
                          >
                            <p className="truncate text-[11px] font-semibold leading-tight">{formatTime(a.startAt)} {a.clientName}</p>
                            <p className="truncate text-[10px] leading-tight text-muted-foreground">{a.service.name}</p>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {(list.data ?? []).length === 0 && !list.loading && !list.error && (
        <p className="text-center text-sm text-muted-foreground">Aucun RDV {view === "jour" ? "ce jour" : "cette semaine"} — planifiez-en un avec « Nouveau RDV ».</p>
      )}

      {/* ── Dialog détail RDV ── */}
      {selected && (
        <ApptDetailDialog
          appt={selected}
          resources={resources}
          onClose={() => setSelected(null)}
          onAction={act}
        />
      )}

      {/* ── Dialog création ── */}
      <CreateApptDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
        services={catalog.data?.services ?? []}
        resources={resources}
        clients={clients.data ?? []}
        clientsLoading={clients.loading}
        defaultDate={toLocalISODate(new Date())}
        onCreated={async () => {
          setCreateOpen(false);
          await Promise.all([list.refetch(), resourcePool.refetch()]);
          toast.success("Rendez-vous créé", { description: "La cliente recevra un rappel WhatsApp la veille." });
        }}
      />
    </div>
  );
}

// ═════════════ Détail RDV ═════════════
function ApptDetailDialog({
  appt,
  resources,
  onClose,
  onAction,
}: {
  appt: ProAppointment;
  resources: { value: string; name: string; color: string }[];
  onClose: () => void;
  onAction: (a: ProAppointment, action: string, extra?: Record<string, unknown>) => Promise<unknown>;
}) {
  const [resched, setResched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(toLocalISODate(new Date(appt.startAt)));
  const [time, setTime] = useState(formatTime(appt.startAt));
  const [resourceId, setResourceId] = useState(appt.resourceId ?? appt.resource.id ?? appt.resource.name);

  async function run(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    try {
      await onAction(appt, action, extra);
    } catch {
      /* toast déjà émis */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" aria-hidden="true" /> {appt.clientName}
          </DialogTitle>
          <DialogDescription>
            {formatDate(appt.startAt, { weekday: "long", day: "numeric", month: "long" })} à {formatTime(appt.startAt)} · {appt.durationMin} min
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
            <span className="text-muted-foreground">Soin</span>
            <span className="font-medium">{appt.service.name}</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
            <span className="text-muted-foreground">Praticienne</span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="size-2.5 rounded-full" style={{ background: appt.resource.color }} aria-hidden="true" />
              {appt.resource.name}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
            <span className="text-muted-foreground">Téléphone</span>
            <span className="font-mono text-xs">{appt.clientPhone}</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
            <span className="text-muted-foreground">Tarif</span>
            <Money value={appt.price} className="font-semibold text-primary" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">Statut</span>
            <ApptStatusBadge status={appt.status} />
          </div>
          {appt.notes && (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{appt.notes}</p>
          )}
        </div>

        {!resched ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {appt.status === "pending" && (
              <Button disabled={busy} onClick={() => run("confirm")} className="gap-1.5 bg-success text-success-foreground hover:bg-success/90">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Confirmer
              </Button>
            )}
            {(appt.status === "pending" || appt.status === "confirmed") && (
              <Button disabled={busy} onClick={() => run("complete")} className="gap-1.5">
                <Banknote className="size-4" aria-hidden="true" /> Terminer
              </Button>
            )}
            <Button disabled={busy} variant="outline" onClick={() => setResched(true)} className="gap-1.5">
              <CalendarClock className="size-4" aria-hidden="true" /> Déplacer
            </Button>
            {(appt.status === "pending" || appt.status === "confirmed") && (
              <>
                <Button disabled={busy} variant="outline" className="gap-1.5 text-bissap border-bissap/40 hover:bg-bissap/10" onClick={() => run("cancel")}>
                  <XCircle className="size-4" aria-hidden="true" /> Annuler
                </Button>
                <Button disabled={busy} variant="outline" className="gap-1.5 text-bissap border-bissap/40 hover:bg-bissap/10" onClick={() => run("no_show")}>
                  <UserX className="size-4" aria-hidden="true" /> No-show
                </Button>
              </>
            )}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-3 rounded-xl border border-gold/40 bg-gold/5 p-3">
            <p className="text-xs font-semibold text-gold">Déplacer le rendez-vous</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="rd-date" className="text-xs">Date</Label>
                <Input id="rd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Heure</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger aria-label="Heure"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {timeOptions().map((t) => (
                      <SelectItem key={t} value={t} className="font-mono">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Praticienne</Label>
              <Select value={resourceId} onValueChange={setResourceId}>
                <SelectTrigger aria-label="Praticienne"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {resources.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden="true" /> {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={busy || !date || !time}
                onClick={() => {
                  const dt = new Date(`${date}T${time}:00`);
                  void run("reschedule", { startAt: dt.toISOString(), resourceId });
                }}
                className="gap-1.5"
              >
                <CalendarClock className="size-4" aria-hidden="true" /> Valider le déplacement
              </Button>
              <Button variant="ghost" onClick={() => setResched(false)}>Retour</Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═════════════ Création RDV ═════════════
function CreateApptDialog({
  open,
  onOpenChange,
  tenantId,
  services,
  resources,
  clients,
  clientsLoading,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  services: { id: string; name: string; durationMin: number; price: number }[];
  resources: { value: string; name: string; color: string }[];
  clients: ProClient[];
  clientsLoading: boolean;
  defaultDate: string;
  onCreated: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clientQuery, setClientQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const client = clients.find((c) => c.id === clientId);
  const service = services.find((s) => s.id === serviceId);
  const filteredClients = clients.filter(
    (c) => c.name.toLowerCase().includes(clientQuery.toLowerCase()) || c.phone.replace(/\s/g, "").includes(clientQuery.replace(/\s/g, ""))
  );

  async function submit() {
    if (!serviceId || !resourceId || !date || !time) {
      toast.error("Complétez service, praticienne, date et heure");
      return;
    }
    if (mode === "existing" && !clientId) {
      toast.error("Sélectionnez une cliente");
      return;
    }
    if (mode === "new" && (!newName.trim() || !newPhone.trim())) {
      toast.error("Nom et téléphone de la nouvelle cliente requis");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/pro/appointments", {
        tenantId,
        clientName: mode === "existing" ? client?.name : newName.trim(),
        clientPhone: mode === "existing" ? client?.phone : newPhone.trim(),
        clientProfileId: mode === "existing" ? clientId : undefined,
        serviceId,
        resourceId,
        startAt: new Date(`${date}T${time}:00`).toISOString(),
        notes: notes.trim() || undefined,
      });
      setClientId("");
      setNewName("");
      setNewPhone("");
      setServiceId("");
      setNotes("");
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto pretty-scroll">
        <DialogHeader>
          <DialogTitle className="font-heading">Nouveau rendez-vous</DialogTitle>
          <DialogDescription>Planifiez un soin pour une cliente existante ou nouvelle.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === m ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
              >
                {m === "existing" ? "Cliente existante" : "Nouvelle cliente"}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={comboOpen} className="w-full justify-between font-normal">
                    {client ? `${client.name} — ${client.phone}` : "Rechercher une cliente…"}
                    <ChevronRight className="size-3.5 rotate-90 opacity-50" aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput placeholder="Nom ou téléphone…" value={clientQuery} onValueChange={setClientQuery} />
                    <CommandList>
                      {clientsLoading ? (
                        <div className="p-3 space-y-2">
                          <Skeleton className="h-8" />
                          <Skeleton className="h-8" />
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>Aucune cliente trouvée</CommandEmpty>
                          <CommandGroup>
                            {filteredClients.slice(0, 30).map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={() => {
                                  setClientId(c.id);
                                  setComboOpen(false);
                                }}
                              >
                                <span className="flex-1">{c.name}</span>
                                <span className="font-mono text-[11px] text-muted-foreground">{c.phone}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="na-name" className="text-xs">Nom complet</Label>
                <Input id="na-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Aminata Traoré" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="na-phone" className="text-xs">Téléphone</Label>
                <Input id="na-phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+225 07…" className="font-mono" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Soin</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger aria-label="Soin"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {xof(s.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Praticienne</Label>
              <Select value={resourceId} onValueChange={setResourceId}>
                <SelectTrigger aria-label="Praticienne"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>
                  {resources.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden="true" /> {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="na-date" className="text-xs">Date</Label>
              <Input id="na-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Heure</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger aria-label="Heure"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {timeOptions().map((t) => (
                    <SelectItem key={t} value={t} className="font-mono">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {service && (
            <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold">
              {service.name} · {service.durationMin} min · <span className="font-mono">{xof(service.price)}</span>
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="na-notes" className="text-xs">Notes (optionnel)</Label>
            <Textarea id="na-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Peaux sensibles, arrive 10 min avant…" />
          </div>

          <Button disabled={busy} onClick={submit} className="w-full gap-1.5 font-semibold">
            <Plus className="size-4" aria-hidden="true" /> {busy ? "Création…" : "Créer le rendez-vous"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


