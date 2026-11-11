"use client";

import { useMemo } from "react";
import {
  Sparkles,
  Calendar,
  Clock,
  ScanFace,
  FolderHeart,
  CalendarCheck,
  TrendingUp,
  ChevronRight,
  Flame,
  Award,
  Crown,
  UserCheck,
  LogOut,
  LogIn,
  MessageCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CauriIcon, SankofaIcon, AbanIcon } from "@/components/kene/icons";
import { KenteTop, Money, ApptStatusBadge } from "./ui-bits";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { formatTime, formatDate } from "@/lib/kene/format";
import { waLink } from "@/lib/kene/followups";
import { useApi } from "./useApi";
import { apiGet } from "@/lib/kene/api";
import { cn } from "@/lib/utils";
import type { ProSectionId } from "./ProApp";
import type { ProOverview, TodayAppointment } from "./types";

interface EmployeeDashboardProps {
  tenantId: string;
  tenantName: string;
  employeeName: string;
  employeeRole: string;
  allowedSections?: ProSectionId[];
  overview: ProOverview | null;
  attendance: {
    id: string;
    checkIn?: string | null;
    checkOut?: string | null;
    status: string;
    hours?: number | null;
  } | null;
  onPointage: (action: "in" | "out") => void;
  pointageBusy: boolean;
  onNavigate: (section: ProSectionId) => void;
  onOpenInciScanner?: () => void;
  onOpenMirrorKiosk?: () => void;
}

export function EmployeeDashboardSection({
  tenantId,
  tenantName,
  employeeName,
  employeeRole,
  allowedSections,
  overview,
  attendance,
  onPointage,
  pointageBusy,
  onNavigate,
  onOpenInciScanner,
  onOpenMirrorKiosk,
}: EmployeeDashboardProps) {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Récupération des commissions et primes attribuées par la direction
  const commissionsApi = useApi<{
    period: string;
    practitioners: Array<{
      employeeId: string;
      name: string;
      role: string;
      servicesRevenue: number;
      servicesCount: number;
      serviceCommission: number;
      productsRevenue: number;
      productsCount: number;
      productCommission: number;
      totalCommission: number;
      awardedBonus: number;
      bonuses: Array<{ id: string; amount: number; reason: string; moment: string; createdAt: string; awardedBy: string }>;
      salesCount: number;
    }>;
  }>(
    () => (tenantId ? apiGet<any>(`/api/pro/payroll/commissions?tenantId=${tenantId}&period=${currentPeriod}`) : Promise.resolve(null)),
    [tenantId, currentPeriod]
  );

  // Filtrage des commissions pour cette praticienne spécifique
  const myCommission = useMemo(() => {
    if (!commissionsApi.data?.practitioners || !employeeName) return null;
    const cleanCurrent = employeeName.trim().toLowerCase();
    return (
      commissionsApi.data.practitioners.find(
        (p) =>
          p.name.trim().toLowerCase() === cleanCurrent ||
          p.name.trim().toLowerCase().includes(cleanCurrent) ||
          cleanCurrent.includes(p.name.trim().toLowerCase())
      ) ?? null
    );
  }, [commissionsApi.data, employeeName]);

  // RDV du jour
  const todayAppts: TodayAppointment[] = overview?.todayAppointments ?? [];
  const completedApptsCount = todayAppts.filter((a) => a.status === "completed").length;
  const pendingApptsCount = todayAppts.filter((a) => a.status === "pending" || a.status === "confirmed").length;

  // Raccourcis autorisés pour la collaboratrice
  const canDiag = !allowedSections || allowedSections.includes("diagnostic");
  const canDossiers = !allowedSections || allowedSections.includes("dossiers_peau");
  const canAgenda = !allowedSections || allowedSections.includes("agenda");
  const canCaisse = !allowedSections || allowedSections.includes("caisse");

  // Message d'accueil personnalisé selon l'heure
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bel après-midi" : "Bonsoir";

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* ── 1. BANNIÈRE PRESTIGE MÉTIER & BIENVENUE ── */}
      <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-card via-card/90 to-gold/10 p-5 sm:p-7 shadow-xl">
        <KenteTop />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-gold/15 text-gold-text border-gold/30 hover:bg-gold/20 gap-1.5 py-0.5 px-2.5">
                <Sparkles className="size-3.5 text-gold-text animate-pulse" />
                <span>Espace Praticienne · {tenantName}</span>
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="size-3 text-gold-text" />
                {formatDate(now.toISOString(), { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <span>{greeting}, <span className="text-gold-text">{employeeName}</span></span>
              <span className="text-xl sm:text-2xl">✨</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl leading-relaxed">
              Prépare tes rituels dermo-botaniques du jour, consulte tes soins cabine et suis l&apos;évolution de tes primes d&apos;excellence.
            </p>
          </div>

          {/* Badge Pointage du Jour */}
          <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="rounded-2xl border border-border/80 bg-background/80 backdrop-blur-sm p-3.5 px-4 shadow-sm flex items-center justify-between sm:justify-start gap-4">
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <UserCheck className="size-3.5 text-gold-text" />
                  <span>Présence au poste</span>
                </div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  {attendance?.checkIn ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                      <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                      Arrivée à {attendance.checkIn}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">Non pointée</span>
                  )}
                </div>
              </div>

              {!attendance?.checkIn ? (
                <Button
                  size="sm"
                  onClick={() => onPointage("in")}
                  disabled={pointageBusy}
                  className="k-btn-gold text-primary-foreground font-bold h-9 px-3.5 rounded-xl text-xs gap-1.5 shadow whitespace-nowrap shrink-0"
                >
                  <LogIn className="size-3.5 shrink-0" />
                  <span>Pointer mon arrivée</span>
                </Button>
              ) : !attendance.checkOut ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onPointage("out")}
                  disabled={pointageBusy}
                  className="border-border hover:bg-muted font-medium h-9 px-3 rounded-xl text-xs gap-1.5"
                >
                  <LogOut className="size-3.5 text-muted-foreground" />
                  <span>Fin de service</span>
                </Button>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground text-xs py-1 px-2.5">
                  Journée terminée ({attendance.hours?.toFixed(1) ?? "—"}h)
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. KPIS PERSONNELS & OBJECTIFS DU MOIS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Soins du jour */}
        <Card className="rounded-2xl border-border/70 hover:border-gold/40 transition-all bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4 sm:p-5 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Soins du Jour</span>
              <div className="p-2 rounded-xl bg-gold/10 text-gold-text">
                <SankofaIcon size={18} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-2xl sm:text-3xl font-black text-foreground">
                {todayAppts.length}
              </span>
              <span className="text-xs text-muted-foreground">
                ({completedApptsCount} terminé{completedApptsCount > 1 ? "s" : ""})
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {pendingApptsCount > 0 ? `${pendingApptsCount} à réaliser aujourd'hui` : "Tous les soins du jour sont bouclés"}
            </p>
          </CardContent>
        </Card>

        {/* Prime attribuée par la Direction */}
        <Card className="rounded-2xl border-gold/40 bg-gradient-to-br from-gold/5 via-card/80 to-card hover:border-gold/60 transition-all">
          <CardContent className="p-4 sm:p-5 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-text">Prime Validée Direction</span>
              <div className="p-2 rounded-xl bg-gold/20 text-gold-text">
                <CauriIcon size={18} />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <Money
                value={myCommission?.awardedBonus ?? 0}
                className="font-heading text-xl sm:text-2xl font-black text-gold-text"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {(myCommission?.awardedBonus ?? 0) > 0
                ? `${myCommission?.bonuses?.length ?? 1} prime(s) accordée(s) ce mois`
                : "Attribuée discrétionnairement par la Direction"}
            </p>
          </CardContent>
        </Card>

        {/* Mon CA Généré */}
        <Card className="rounded-2xl border-border/70 hover:border-gold/40 transition-all bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4 sm:p-5 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Mon Chiffre Attribué</span>
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <Money
                value={(myCommission?.servicesRevenue ?? 0) + (myCommission?.productsRevenue ?? 0)}
                className="font-heading text-xl sm:text-2xl font-bold text-foreground"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {myCommission?.salesCount ?? 0} encaissement(s) nominatif(s) ce mois
            </p>
          </CardContent>
        </Card>

        {/* Qualité & Avis Clientes */}
        <Card className="rounded-2xl border-border/70 hover:border-gold/40 transition-all bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4 sm:p-5 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-bold uppercase tracking-wider">Satisfaction Clientes</span>
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <Award className="size-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-heading text-2xl sm:text-3xl font-black text-foreground">
                {overview?.tenant?.rating ? overview.tenant.rating.toFixed(1) : "5.0"}
              </span>
              <span className="text-amber-500 font-bold text-sm">★</span>
              <span className="text-xs text-muted-foreground">/ 5</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Excellence rituelle &amp; écoute cabine
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. RACCOURCIS ACTION RAPIDE CABINE ── */}
      <div className="space-y-3">
        <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Sparkles className="size-4 text-gold-text" />
          <span>Actions Rapides &amp; Rituels</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {canDiag && (
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                onNavigate("diagnostic");
              }}
              className="flex flex-col items-start gap-2 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-card to-card p-4 text-left transition-all hover:scale-[1.02] hover:border-gold/60 shadow-sm cursor-pointer group"
            >
              <div className="p-2.5 rounded-xl bg-gold/20 text-gold-text group-hover:bg-gold group-hover:text-primary-foreground transition-colors">
                <ScanFace className="size-5" />
              </div>
              <div>
                <p className="font-heading text-sm font-bold text-foreground">Nouveau Diagnostic</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Biomarqueurs &amp; ordonnance</p>
              </div>
            </button>
          )}

          {canDossiers && (
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                onNavigate("dossiers_peau");
              }}
              className="flex flex-col items-start gap-2 rounded-2xl border border-border/70 bg-card p-4 text-left transition-all hover:scale-[1.02] hover:border-gold/40 shadow-sm cursor-pointer group"
            >
              <div className="p-2.5 rounded-xl bg-muted text-muted-foreground group-hover:bg-gold/15 group-hover:text-gold-text transition-colors">
                <FolderHeart className="size-5" />
              </div>
              <div>
                <p className="font-heading text-sm font-bold text-foreground">Dossiers Cutanés</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Fiches clientes &amp; photos</p>
              </div>
            </button>
          )}

          {canAgenda && (
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                onNavigate("agenda");
              }}
              className="flex flex-col items-start gap-2 rounded-2xl border border-border/70 bg-card p-4 text-left transition-all hover:scale-[1.02] hover:border-gold/40 shadow-sm cursor-pointer group"
            >
              <div className="p-2.5 rounded-xl bg-muted text-muted-foreground group-hover:bg-gold/15 group-hover:text-gold-text transition-colors">
                <Calendar className="size-5" />
              </div>
              <div>
                <p className="font-heading text-sm font-bold text-foreground">Planning Cabine</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Réservations &amp; rendez-vous</p>
              </div>
            </button>
          )}

          {canCaisse && (
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                onNavigate("caisse");
              }}
              className="flex flex-col items-start gap-2 rounded-2xl border border-border/70 bg-card p-4 text-left transition-all hover:scale-[1.02] hover:border-gold/40 shadow-sm cursor-pointer group"
            >
              <div className="p-2.5 rounded-xl bg-muted text-muted-foreground group-hover:bg-gold/15 group-hover:text-gold-text transition-colors">
                <AbanIcon size={20} />
              </div>
              <div>
                <p className="font-heading text-sm font-bold text-foreground">Encaisser POS</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Espèces, Wave, Orange Money</p>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* ── 4. TIMELINE DES SOINS DE LA JOURNÉE ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-1 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <CalendarCheck className="size-4 text-gold-text" />
              <span>Planning &amp; Soins de la Journée ({todayAppts.length})</span>
            </h2>
            {canAgenda && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("agenda")}
                className="text-xs font-bold text-gold-text hover:text-gold-text/80 h-8 gap-1"
              >
                <span>Ouvrir l&apos;agenda complet</span>
                <ChevronRight className="size-3.5" />
              </Button>
            )}
          </div>

          <Card className="rounded-2xl border-border/70 overflow-hidden shadow-sm">
            <CardContent className="p-0">
              {todayAppts.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="mx-auto size-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                    <CalendarCheck className="size-6 text-gold-text/60" />
                  </div>
                  <p className="font-heading text-sm font-bold text-foreground">Aucun soin programmé aujourd&apos;hui</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    La cabine est libre. Tu peux accueillir des clientes sans rendez-vous ou planifier de nouveaux protocoles.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {todayAppts.map((appt) => {
                    const isDone = appt.status === "completed";
                    return (
                      <div
                        key={appt.id}
                        className={cn(
                          "p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-muted/30",
                          isDone && "opacity-75 bg-muted/10"
                        )}
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <div className="shrink-0 flex flex-col items-center justify-center size-12 rounded-xl bg-gold/10 border border-gold/20 text-gold-text font-mono font-bold text-xs">
                            <span>{appt.startAt ? formatTime(appt.startAt) : "—"}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-heading text-sm font-bold text-foreground">{appt.clientName}</p>
                              <ApptStatusBadge status={appt.status} />
                            </div>
                            <p className="text-xs text-gold-text font-medium mt-0.5">
                              {appt.serviceName}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Cabine : {appt.resourceName || "Cabine principale"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {appt.clientPhone && (
                            <a
                              href={waLink(appt.clientPhone, `Bonjour ${appt.clientName}, votre praticienne ${employeeName} de ${tenantName} vous attend pour votre soin.`)}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 rounded-xl border border-border/80 hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/30 text-muted-foreground transition-all"
                              title="Message WhatsApp"
                            >
                              <MessageCircle className="size-4" />
                            </a>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onNavigate("agenda")}
                            className="h-8 rounded-xl text-xs font-semibold border-border hover:bg-muted"
                          >
                            <span>Voir le détail</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── 5. FOCUS PROTOCOLE & CONSEILS DERMO-BOTANIQUES ── */}
        <div className="space-y-3">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Flame className="size-4 text-gold-text" />
            <span>Excellence en Cabine</span>
          </h2>

          <Card className="rounded-2xl border-gold/30 bg-gradient-to-br from-card via-card to-gold/5 shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-gold/15 flex items-center justify-center text-gold-text">
                <Crown className="size-5" />
              </div>
              <div>
                <p className="font-heading text-xs font-bold text-foreground">Standard Mélanoderme 2026</p>
                <p className="text-[10px] text-muted-foreground">Protocole haute tolérance phototypes IV à VI</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
              <div className="flex items-start gap-2">
                <span className="text-gold-text font-bold">1.</span>
                <span><strong>Scan &amp; Biomarqueurs</strong> : Toujours vérifier la tolérance cutanée avant d&apos;appliquer des exfoliants chimiques (AHA/BHA).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gold-text font-bold">2.</span>
                <span><strong>Actifs Botaniques</strong> : Privilégier le beurre de karité bio non raffiné et l&apos;huile de moringa pure en phase d&apos;apaisement.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gold-text font-bold">3.</span>
                <span><strong>Conseil Revente</strong> : Chaque soin cabine s&apos;accompagne d&apos;une ordonnance de soin à domicile (5% de prime directe sur vos ventes).</span>
              </div>
            </div>

            {onOpenInciScanner && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenInciScanner}
                className="w-full rounded-xl text-xs font-bold border-gold/40 text-gold-text hover:bg-gold/10 gap-2 h-9"
              >
                <ScanFace className="size-4" />
                <span>Scanner une formule (INCI)</span>
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
