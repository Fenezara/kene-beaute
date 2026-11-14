"use client";

import { useState } from "react";
import { useKene } from "@/store/kene";
import {
  Calendar as CalendarIcon,
  Clock,
  UserCheck,
  Banknote,
  Receipt,
  CalendarCheck,
  Users,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Package,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { KpiCard, Money, ApptStatusBadge, KenteTop } from "./ui-bits";
import { useApi } from "./useApi";
import { apiGet } from "@/lib/kene/api";
import { formatDate, formatTime } from "@/lib/kene/format";
import { CauriIcon, AbanIcon, SankofaIcon } from "@/components/kene/icons";
import { cn } from "@/lib/utils";

interface DailyAuditResponse {
  date: string;
  summary: {
    caTotal: number;
    completedSalesCount: number;
    refundedSalesCount: number;
    payments: {
      wave: number;
      orange: number;
      mtn: number;
      moov: number;
      cash: number;
      card: number;
    };
    presentStaffCount: number;
    totalStaffCount: number;
    apptsTotal: number;
    apptsCompleted: number;
  };
  attendances: Array<{
    id: string;
    employeeName: string;
    role: string;
    checkIn?: string | null;
    checkOut?: string | null;
    status: string;
    hours?: number | null;
    expectedStart?: string;
    expectedEnd?: string;
    lateMinutes?: number;
    earlyMinutes?: number;
    punctualityLabel?: string;
  }>;
  absentEmployees: Array<{
    id: string;
    name: string;
    role: string;
    expectedStart?: string;
    expectedEnd?: string;
    shiftState?: string;
    punctualityLabel?: string;
  }>;
  sales: Array<{
    id: string;
    total: number;
    discount: number;
    paymentMethod: string;
    cashierName: string;
    status: string;
    createdAt: string;
    clientName: string;
    items: Array<{ label: string; qty: number; total: number; kind: string }>;
  }>;
  appointments: Array<{
    id: string;
    clientName: string;
    clientPhone?: string | null;
    serviceName: string;
    resourceName: string;
    startAt: string;
    status: string;
    price: number;
  }>;
  inventoryMovements: Array<{
    id: string;
    productName: string;
    type: string;
    qty: number;
    reason?: string | null;
    createdAt: string;
  }>;
}

interface DailyAuditCalendarModalProps {
  tenantId: string;
  tenantName: string;
  trigger?: React.ReactNode;
}

export function DailyAuditCalendarModal({ tenantId, tenantName, trigger }: DailyAuditCalendarModalProps) {
  const sessionUser = useKene((s) => s.user);
  const isOwner = sessionUser?.role === "admin" || (sessionUser?.role === "pro" && !sessionUser?.employeeRole);

  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [activeTab, setActiveTab] = useState<"vue_globale" | "caisse" | "pointage" | "soins">("vue_globale");

  const auditApi = useApi<DailyAuditResponse | null>(
    () =>
      tenantId && open
        ? apiGet<DailyAuditResponse>(`/api/pro/audit/daily?tenantId=${tenantId}&date=${selectedDate}`)
        : Promise.resolve(null),
    [tenantId, selectedDate, open]
  );

  const data = auditApi.data;
  const loading = auditApi.loading;

  // Fonctions de navigation rapide de date
  const changeDateByDays = (days: number) => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + days);
    setSelectedDate(cur.toISOString().slice(0, 10));
  };

  const setShortcutDate = (preset: "today" | "yesterday" | "before_yesterday") => {
    const d = new Date();
    if (preset === "yesterday") d.setDate(d.getDate() - 1);
    if (preset === "before_yesterday") d.setDate(d.getDate() - 2);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const parsedSelected = new Date(selectedDate);
  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  // Sécurité Direction : Seule la gérante / direction a accès à l'audit historique
  if (!isOwner) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-gold/40 text-gold-text hover:bg-gold/10 gap-2 font-bold h-9 shadow-sm"
          >
            <CalendarIcon className="size-4 text-gold-text" />
            <span>Historique par Date</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-0 rounded-3xl border-gold/30">
        <KenteTop />
        <div className="p-4 sm:p-6 space-y-5 overflow-x-hidden">
          {/* En-tête avec Sélecteur de Date & Raccourcis */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-gold/15 text-gold-text border-gold/30 py-0.5 px-2.5">
                  <Sparkles className="size-3 text-gold-text mr-1" />
                  <span>Journal de Bord Historique</span>
                </Badge>
                <span className="text-xs text-muted-foreground">{tenantName}</span>
              </div>
              <h2 className="font-heading text-xl sm:text-2xl font-bold text-foreground mt-1">
                {formatDate(parsedSelected.toISOString(), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>

            {/* Contrôleur de Date */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-2xl border border-border">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => changeDateByDays(-1)}
                  className="size-8 rounded-xl"
                  title="Jour précédent"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold px-2 py-1 outline-none cursor-pointer text-foreground"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => changeDateByDays(1)}
                  className="size-8 rounded-xl"
                  title="Jour suivant"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* Raccourcis d'accès direct */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={isToday ? "default" : "outline"}
                  onClick={() => setShortcutDate("today")}
                  className={cn("text-xs h-8 rounded-xl px-2.5", isToday && "k-btn-gold text-primary-foreground")}
                >
                  Aujourd&apos;hui
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShortcutDate("yesterday")}
                  className="text-xs h-8 rounded-xl px-2.5"
                >
                  Hier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShortcutDate("before_yesterday")}
                  className="text-xs h-8 rounded-xl px-2.5"
                >
                  Avant-hier
                </Button>
              </div>
            </div>
          </div>

          {/* Onglets thématiques du jour sélectionné */}
          <div className="flex items-center gap-2 border-b border-border/60 pb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("vue_globale")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0",
                activeTab === "vue_globale"
                  ? "k-btn-gold text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <TrendingUp className="size-3.5" />
              <span>Synthèse de la journée</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("caisse")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0",
                activeTab === "caisse"
                  ? "k-btn-gold text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <AbanIcon size={16} />
              <span>Caisse &amp; Recettes ({data?.summary?.completedSalesCount ?? 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pointage")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0",
                activeTab === "pointage"
                  ? "k-btn-gold text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <UserCheck className="size-3.5" />
              <span>Présences &amp; Pointages ({data?.summary?.presentStaffCount ?? 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("soins")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0",
                activeTab === "soins"
                  ? "k-btn-gold text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <SankofaIcon size={16} />
              <span>Soins &amp; RDV ({data?.summary?.apptsTotal ?? 0})</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-gold-text" />
              <p className="text-xs">Chargement du journal du {selectedDate}...</p>
            </div>
          ) : !data ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Aucune donnée trouvée pour cette date.</div>
          ) : (
            <>
              {/* VUE 1 : SYNTHÈSE GLOBALE DU JOUR */}
              {activeTab === "vue_globale" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="rounded-2xl border-gold/40 bg-gradient-to-br from-gold/5 via-card to-card p-4 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recette Encaissée</p>
                      <Money value={data.summary.caTotal} className="font-heading text-xl sm:text-2xl font-black text-gold-text" />
                      <p className="text-[10px] text-muted-foreground">{data.summary.completedSalesCount} encaissement(s)</p>
                    </Card>

                    <Card className="rounded-2xl border-border/70 p-4 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Équipe en Poste</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-heading text-2xl font-black text-foreground">{data.summary.presentStaffCount}</span>
                        <span className="text-xs text-muted-foreground">/ {data.summary.totalStaffCount} collaboratrices</span>
                      </div>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Pointages certifiés</p>
                    </Card>

                    <Card className="rounded-2xl border-border/70 p-4 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Soins Réalisés</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-heading text-2xl font-black text-foreground">{data.summary.apptsTotal}</span>
                        <span className="text-xs text-muted-foreground">({data.summary.apptsCompleted} achevé(s))</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Planning cabine</p>
                    </Card>

                    <Card className="rounded-2xl border-border/70 p-4 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mouvements Stock</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-heading text-2xl font-black text-foreground">{data.inventoryMovements.length}</span>
                        <span className="text-xs text-muted-foreground">opération(s)</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Entrées &amp; sorties cabine</p>
                    </Card>
                  </div>

                  {/* Répartition des encaissements par canal */}
                  <Card className="rounded-2xl border-border/70 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <CauriIcon size={16} className="text-gold-text" />
                      <span>Ventilation des modes de règlement de la journée</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-muted/40 border border-border">
                        <p className="text-[10px] text-muted-foreground">Wave Digital</p>
                        <Money value={data.summary.payments.wave} className="font-bold text-sky-500" />
                      </div>
                      <div className="p-2.5 rounded-xl bg-muted/40 border border-border">
                        <p className="text-[10px] text-muted-foreground">Orange Money</p>
                        <Money value={data.summary.payments.orange} className="font-bold text-amber-500" />
                      </div>
                      <div className="p-2.5 rounded-xl bg-muted/40 border border-border">
                        <p className="text-[10px] text-muted-foreground">Espèces (Tiroir)</p>
                        <Money value={data.summary.payments.cash} className="font-bold text-emerald-500" />
                      </div>
                      <div className="p-2.5 rounded-xl bg-muted/40 border border-border">
                        <p className="text-[10px] text-muted-foreground">Carte Bancaire / Autre</p>
                        <Money value={data.summary.payments.card + data.summary.payments.mtn + data.summary.payments.moov} className="font-bold text-foreground" />
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {/* VUE 2 : CAISSE & VENTES DÉTAILLÉES */}
              {activeTab === "caisse" && (
                <div className="space-y-3">
                  {data.sales.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-2xl">
                      Aucune vente enregistrée pour cette date.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60 rounded-2xl border border-border/70 overflow-hidden">
                      {data.sales.map((sale) => (
                        <div key={sale.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card hover:bg-muted/20">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-heading text-sm font-bold text-foreground">{sale.clientName}</span>
                              <Badge variant="outline" className={cn("text-[10px] uppercase font-bold", sale.status === "completed" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : "bg-destructive/10 text-destructive")}>
                                {sale.status === "completed" ? "Encaissé" : "Annulé"}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">{formatTime(sale.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span>Moyen : <strong className="text-foreground uppercase">{sale.paymentMethod}</strong></span>
                              <span>·</span>
                              <span>Caissière : {sale.cashierName}</span>
                              {sale.discount > 0 && <span className="text-amber-600 font-semibold">· Remise : -{sale.discount} F</span>}
                            </div>
                            <p className="text-[11px] text-gold-text mt-1">
                              {sale.items.map((it) => `${it.qty}x ${it.label}`).join(" + ")}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <Money value={sale.total} className="font-heading text-base font-bold text-foreground" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* VUE 3 : POINTAGES & PRÉSENCES DE L'ÉQUIPE */}
              {activeTab === "pointage" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 divide-y divide-border/60 overflow-hidden">
                    {data.attendances.map((att) => (
                      <div key={att.id} className="p-3.5 flex items-center justify-between gap-3 bg-card">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "size-9 rounded-xl flex items-center justify-center font-bold text-xs",
                              att.status === "late"
                                ? "bg-amber-500/15 text-amber-600"
                                : "bg-emerald-500/10 text-emerald-600"
                            )}
                          >
                            <CheckCircle2 className="size-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-heading text-sm font-bold text-foreground">{att.employeeName}</p>
                              {att.expectedStart && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 text-gold-text border border-gold/30 font-semibold">
                                  Prévu {att.expectedStart.replace(":", "h")} – {(att.expectedEnd || "19:00").replace(":", "h")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{att.role}</p>
                          </div>
                        </div>
                        <div className="text-right space-y-0.5">
                          <p
                            className={cn(
                              "text-xs font-bold",
                              att.status === "late"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            )}
                          >
                            Arrivée : {att.checkIn || "—"} {att.checkOut ? `→ Départ : ${att.checkOut}` : "(En poste)"}
                          </p>
                          {att.punctualityLabel && (
                            <p className="text-[10.5px] font-mono text-muted-foreground">{att.punctualityLabel}</p>
                          )}
                          {att.hours && <p className="text-[10px] text-muted-foreground">{att.hours.toFixed(1)}h travaillées</p>}
                        </div>
                      </div>
                    ))}

                    {data.absentEmployees.map((abs) => (
                      <div key={abs.id} className="p-3.5 flex items-center justify-between gap-3 bg-muted/10 opacity-75">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center font-bold text-xs">
                            <XCircle className="size-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-heading text-sm font-bold text-foreground">{abs.name}</p>
                              {abs.expectedStart && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                  Prévu {abs.expectedStart.replace(":", "h")} – {(abs.expectedEnd || "19:00").replace(":", "h")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{abs.role}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs text-muted-foreground bg-muted">
                          {abs.punctualityLabel || "Non pointée"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* VUE 4 : SOINS & RENDEZ-VOUS CABINE */}
              {activeTab === "soins" && (
                <div className="space-y-3">
                  {data.appointments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-2xl">
                      Aucun soin programmé pour cette date.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60 rounded-2xl border border-border/70 overflow-hidden">
                      {data.appointments.map((appt) => (
                        <div key={appt.id} className="p-3.5 flex items-center justify-between gap-3 bg-card">
                          <div className="flex items-center gap-3">
                            <div className="size-11 rounded-xl bg-gold/10 border border-gold/20 text-gold-text font-mono font-bold text-xs flex flex-col items-center justify-center">
                              <span>{formatTime(appt.startAt)}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-heading text-sm font-bold text-foreground">{appt.clientName}</span>
                                <ApptStatusBadge status={appt.status} />
                              </div>
                              <p className="text-xs text-gold-text font-medium">{appt.serviceName}</p>
                              <p className="text-[11px] text-muted-foreground">{appt.resourceName}</p>
                            </div>
                          </div>
                          <Money value={appt.price} className="font-heading text-sm font-bold text-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
