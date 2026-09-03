"use client";
// Kènè — APP PRO (desktop/tablette) : Dashboard, Agenda, Caisse POS, CRM, Relances, Catalogue, Promos, Stock, Paie, Compta
// TEMPS RÉEL (tâche 35) : socket.io vers notify-service (?XTransformPort=3004),
// room tenant:{id} — RDV réservé, commande institut, vente POS → badge Agenda,
// toast, KPIs du dashboard et listes branchées rafraîchis SANS reload.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import { armHeartbeat } from "@/lib/kene/live-socket";
import { BellRing, LayoutDashboard, MapPin, ChevronDown, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import { useKene } from "@/store/kene";
import { apiGet } from "@/lib/kene/api";
import { KeneLogo, DuafeIcon, SankofaIcon, AbanIcon, OsramIcon, KenteIcon, FihankraIcon, BaouleIcon } from "@/components/kene/icons";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useApi } from "./useApi";
import type { ProOverview, ProLive } from "./types";
import { DashboardSection } from "./DashboardSection";
import { AgendaSection } from "./AgendaSection";
import { PosSection } from "./PosSection";
import { CrmSection } from "./CrmSection";
import { RelancesSection } from "./RelancesSection";
import { CatalogSection } from "./CatalogSection";
import { StockSection } from "./StockSection";
import { PayrollSection } from "./PayrollSection";
import { AccountingSection } from "./AccountingSection";
import { CouponsSection } from "./CouponsSection";

export type ProSectionId = "dashboard" | "agenda" | "caisse" | "crm" | "relances" | "catalogue" | "promos" | "stock" | "paie" | "compta";

const NAV: { id: ProSectionId; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, hint: "KPIs & activité" },
  { id: "agenda", label: "Agenda", icon: SankofaIcon, hint: "Rendez-vous" },
  { id: "caisse", label: "Caisse", icon: AbanIcon, hint: "Point de vente" },
  { id: "crm", label: "CRM", icon: OsramIcon, hint: "Clientes & fidélité" },
  { id: "relances", label: "Relances", icon: BellRing, hint: "Suivi post-protocole" },
  { id: "catalogue", label: "Catalogue", icon: DuafeIcon, hint: "Soins & produits" },
  { id: "promos", label: "Promos", icon: TicketPercent, hint: "Coupons boutique" },
  { id: "stock", label: "Stock", icon: KenteIcon, hint: "Inventaire" },
  { id: "paie", label: "Paie", icon: FihankraIcon, hint: "CNPS · IPRES" },
  { id: "compta", label: "Compta", icon: BaouleIcon, hint: "SYSCOHADA" },
];

const PLAN_STYLES: Record<string, string> = {
  pro: "bg-gold/15 text-gold border-gold/30",
  business: "bg-success/15 text-success border-success/30",
  trial: "bg-muted text-muted-foreground border-border",
};

const NOTIFY_PORT = 3004;

function looksLikeLive(f: unknown): f is ProLive {
  const x = f as Partial<ProLive> | null;
  return !!x && typeof x.tenantId === "string" && typeof x.pendingAppts === "number" && typeof x.salesToday === "number";
}

export function ProApp() {
  const proTenantId = useKene((s) => s.proTenantId);
  const setProTenantId = useKene((s) => s.setProTenantId);
  const [section, setSection] = useState<ProSectionId>("dashboard");

  const overview = useApi<ProOverview>(
    () => apiGet<ProOverview>(`/api/pro/overview${proTenantId ? `?tenantId=${proTenantId}` : ""}`),
    [proTenantId]
  );

  // Mémorise le tenant par défaut au premier chargement
  useEffect(() => {
    if (!proTenantId && overview.data?.tenant?.id) setProTenantId(overview.data.tenant.id);
  }, [proTenantId, overview.data, setProTenantId]);

  // AUTO-GUÉRISON : un institut mémorisé (localStorage) disparu de la base ne doit jamais bloquer
  // l'espace Pro — on oublie la préférence périmée et on retombe sur l'institut par défaut.
  const healedRef = useRef(false);
  useEffect(() => {
    if (overview.error && proTenantId && !healedRef.current) {
      healedRef.current = true;
      setProTenantId(null);
      toast.info("Institut mémorisé indisponible — institut par défaut chargé");
    }
  }, [overview.error, proTenantId, setProTenantId]);

  const tid = proTenantId ?? overview.data?.tenant.id ?? "";

  /* ── Temps réel institut (room tenant:{tid}) ─────────────────────────
   * join-tenant à la connexion (et à chaque changement d'institut) ;
   * tenant-feed → badge RDV à confirmer, toast d'arrivée (RDV réservé par
   * une cliente ou commande institut — jamais les actions de la pro
   * elle-même), KPIs dashboard et listes Agenda/Caisse rafraîchies.
   * Dégradation douce : sans service, tout continue au montage. */
  const [live, setLive] = useState<ProLive | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [agendaSeen, setAgendaSeen] = useState(0); // badge = nouveau depuis la dernière visite Agenda
  const lastEventIdRef = useRef<string | null>(null);
  const refetchRef = useRef(overview.refetch);
  useEffect(() => {
    refetchRef.current = overview.refetch;
  }, [overview.refetch]);

  useEffect(() => {
    if (!tid) return;
    // Never use PORT in the URL, always use XTransformPort
    // DO NOT change the path, it is used by Caddy to forward the request to the correct port
    const socket: Socket = io(`/?XTransformPort=${NOTIFY_PORT}`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 4_000,
      timeout: 8_000,
    });
    // Auto-guérison : service redémarré à chaud → zombie détecté ≤ 35 s,
    // reconnexion → join-tenant rejoué au connect.
    const disarm = armHeartbeat(socket);

    socket.on("connect", () => {
      setLiveConnected(true);
      socket.emit("join-tenant", { tenantId: tid });
    });
    socket.on("disconnect", () => setLiveConnected(false));
    socket.on("tenant-feed", (f: unknown) => {
      if (!looksLikeLive(f) || f.tenantId !== tid) return; // garde défensive
      const prevId = lastEventIdRef.current;
      setLive(f);
      // Le baseline « déjà vues » descend avec les confirmations : si la pro
      // a vu 3 demandes, en confirme une (reste 2) puis qu'une NOUVELLE arrive
      // (3), le badge doit montrer 1 — pas 0.
      setAgendaSeen((seen) => Math.min(seen, f.pendingAppts));
      if (f.last) {
        lastEventIdRef.current = f.last.id;
        // Toast d'arrivée : uniquement les événements distants (réservation
        // cliente à confirmer, commande boutique) — la pro voit déjà ses
        // propres actions (POS, RDV créés côté institut → statut confirmed).
        // prevId null = premier fil après montage : pas de toast (vieille
        // activité déjà là au chargement, cf. garde prev !== null du centre
        // de notifications cliente).
        if (prevId !== null && f.last.id !== prevId) {
          if (f.last.type === "appointment" && f.last.status === "pending") {
            toast.success("Nouvelle demande de RDV", { description: f.last.label, duration: 6_000 });
          } else if (f.last.type === "order") {
            toast.success("Commande boutique reçue", { description: f.last.label, duration: 6_000 });
          }
        }
      }
      // KPIs + listes branchées : rechargement live (anti-flash : setFeed des useApi)
      setRefreshKey((k) => k + 1);
      void refetchRef.current();
    });

    return () => {
      disarm();
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [tid]);

  // Le badge se vide quand la pro visite l'Agenda (elle a vu la liste)
  const openSection = (s: ProSectionId) => {
    if (s === "agenda") setAgendaSeen(live?.pendingAppts ?? 0);
    setSection(s);
  };
  const agendaBadge = Math.max(0, (live?.pendingAppts ?? 0) - agendaSeen);
  const navBadges: Partial<Record<ProSectionId, number>> = agendaBadge > 0 ? { agenda: agendaBadge } : {};

  const tenantOptions = useMemo(() => {
    const t = overview.data?.tenant;
    return t ? [{ id: t.id, name: t.name, city: t.city, country: t.country, plan: t.plan }] : [];
  }, [overview.data]);

  const tenant = overview.data?.tenant;
  const activeLabel = NAV.find((n) => n.id === section)?.label ?? "";

  return (
    <div className="mx-auto w-full max-w-[1600px] min-h-screen flex flex-col lg:flex-row">
      {/* ───────── Sidebar desktop ───────── */}
      <aside className="hidden lg:flex w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 self-start max-h-screen overflow-y-auto pretty-scroll">
        <div className="p-4 pb-3">
          <div className="flex items-center gap-2.5">
            <KeneLogo size={36} withText={false} />
            <div className="leading-tight">
              <p className="font-heading font-bold text-lg">Kènè <span className="text-sidebar-primary">Pro</span></p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/60">Gestion institut</p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-3">
          <Select value={tid || undefined} onValueChange={(v) => setProTenantId(v)} disabled={tenantOptions.length <= 1}>
            <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground h-auto py-2" aria-label="Institut actif">
              <SelectValue placeholder="Institut…" />
            </SelectTrigger>
            <SelectContent>
              {tenantOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tenant ? (
              <>
                <Badge variant="outline" className={cn("text-[10px]", PLAN_STYLES[tenant.plan] ?? PLAN_STYLES.trial)}>
                  {tenant.plan === "business" ? "Business" : tenant.plan === "pro" ? "Pro" : "Essai"}
                </Badge>
                <span className="inline-flex items-center gap-1 text-[11px] text-sidebar-foreground/60">
                  <MapPin className="size-3" aria-hidden="true" />
                  {tenant.city} · {tenant.country}
                </span>
              </>
            ) : (
              <Skeleton className="h-4 w-24 bg-sidebar-accent" />
            )}
            {liveConnected && (
              <span
                title="Connecté en temps réel — RDV, commandes et ventes arrivent sans recharger"
                className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success"
              >
                <span className="relative flex size-1.5" aria-hidden="true">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                En direct
              </span>
            )}
          </div>
        </div>

        <nav aria-label="Navigation App Pro" className="flex-1 px-3 py-2 space-y-1">
          {NAV.map((item) => {
            const badge = navBadges[item.id];
            return (
              <button
                key={item.id}
                onClick={() => openSection(item.id)}
                aria-current={section === item.id ? "page" : undefined}
                aria-label={badge ? `${item.label} — ${badge} RDV à confirmer` : item.label}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-left transition-colors",
                  section === item.id
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="size-4.5 shrink-0" />
                <span className="min-w-0 truncate">{item.label}</span>
                {badge ? (
                  <span
                    role="status"
                    className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-bissap px-1.5 text-[11px] font-semibold text-white"
                  >
                    {badge}
                  </span>
                ) : (
                  section === item.id && <ChevronDown className="size-3.5 -rotate-90 opacity-70" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[11px] font-semibold text-[#FFF9EC]"
            >
              FK
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">Fatou Koné</p>
              <p className="text-[11px] text-sidebar-foreground/60">Gérante — démo</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />
            </div>
          </div>
          <div className="px-4 pt-3">
            <SpaceSwitcher />
          </div>
          <p className="px-4 pt-3 pb-4 text-[10px] leading-relaxed text-sidebar-foreground/50">
            Kènè POC — paiements simulés · CNPS CI / IPM SN / SYSCOHADA
          </p>
        </div>
      </aside>

      {/* ───────── Zone contenu ───────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Nav mobile — chips scrollables */}
        <div className="lg:hidden border-b border-border bg-card/70">
          <nav aria-label="Navigation App Pro (mobile)" className="flex gap-1.5 overflow-x-auto no-scrollbar px-3 py-2.5">
            {NAV.map((item) => {
              const badge = navBadges[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => openSection(item.id)}
                  aria-current={section === item.id ? "page" : undefined}
                  aria-label={badge ? `${item.label} — ${badge} RDV à confirmer` : item.label}
                  className={cn(
                    "relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
                    section === item.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                  {badge ? (
                    <span role="status" className="grid h-4 min-w-4 place-items-center rounded-full bg-bissap px-1 text-[10px] font-semibold text-white">
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 sm:p-5 lg:p-6 flex-1 min-w-0">
          {/* En-tête mobile */}
          <div className="lg:hidden mb-4 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                {tenant ? `${tenant.city} · ${tenant.country}` : "…"}
                {liveConnected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-medium text-success">
                    <span className="relative flex size-1.5" aria-hidden="true">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                    </span>
                    En direct
                  </span>
                )}
              </p>
              <h1 className="font-heading text-lg font-bold truncate">{activeLabel} — {tenant?.name ?? "Kènè Pro"}</h1>
            </div>
            <KeneLogo size={30} withText={false} />
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <span className="md:hidden">
                <SpaceSwitcher />
              </span>
            </div>
          </div>

          {overview.error && section === "dashboard" && (
            <div className="mb-4 rounded-lg border border-bissap/30 bg-bissap/5 px-4 py-2.5 text-sm text-bissap">
              Impossible de charger l&apos;institut : {overview.error}
            </div>
          )}

          <motion.div
            key={section}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="min-w-0"
          >
            {section === "dashboard" && (
              <DashboardSection tenantId={tid} overview={overview} loadingOverview={overview.loading} onNavigate={openSection} />
            )}
            {section === "agenda" && <AgendaSection tenantId={tid} refreshKey={refreshKey} />}
            {section === "caisse" && <PosSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} refreshKey={refreshKey} />}
            {section === "crm" && <CrmSection tenantId={tid} />}
            {section === "relances" && <RelancesSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
            {section === "catalogue" && <CatalogSection tenantId={tid} />}
            {section === "promos" && <CouponsSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
            {section === "stock" && <StockSection tenantId={tid} onNavigate={openSection} />}
            {section === "paie" && <PayrollSection tenantId={tid} defaultCountry={tenant?.country ?? "CI"} tenantName={tenant?.name ?? "Institut"} />}
            {section === "compta" && <AccountingSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Toast helper partagé */
export function proToastError(e: unknown, fallback = "Action impossible") {
  toast.error(e instanceof Error ? e.message : fallback);
}
