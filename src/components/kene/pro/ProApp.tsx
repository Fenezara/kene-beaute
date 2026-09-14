"use client";
// Kènè — APP PRO (desktop/tablette): Dashboard, Agenda, Diagnostic en cabine, Caisse POS, CRM, Relances, Catalogue, Promos, Stock, Paie, Compta
// TEMPS RÉEL: socket.io vers notify-service (?XTransformPort=3004),
// room tenant:{id} — RDV réservé, commande institut, vente POS → badge Agenda,
// toast, KPIs du dashboard et listes branchées rafraîchis SANS reload.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import { armHeartbeat } from "@/lib/kene/live-socket";
import { BellRing, Crown, LayoutDashboard, MapPin, Settings, ShoppingBag, Stethoscope, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import { useKene } from "@/store/kene";
import { apiGet } from "@/lib/kene/api";
import { KeneEmblem, KeneEmblemLockup, DuafeIcon, SankofaIcon, AbanIcon, OsramIcon, KenteIcon, FihankraIcon, BaouleIcon, NkonsonkonsonIcon } from "@/components/kene/icons";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AuroraBackdrop, Eyebrow, Shimmer } from "@/components/kene/ui2026";
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
import { DiagnosticsSection } from "./DiagnosticsSection";
import { SettingsSection } from "./SettingsSection";
import { ProPlanSection } from "./ProPlanSection";
import { TeamSection } from "./TeamSection";
import { OrdersSection } from "./OrdersSection";

export type ProSectionId = "dashboard" | "agenda" | "diagnostic" | "caisse" | "orders" | "crm" | "relances" | "equipe" | "catalogue" | "promos" | "stock" | "paie" | "compta" | "parametres" | "abonnement";

const NAV: { id: ProSectionId; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, hint: "KPIs & activité" },
  { id: "agenda", label: "Agenda", icon: SankofaIcon, hint: "Rendez-vous" },
  { id: "diagnostic", label: "Diagnostic", icon: Stethoscope, hint: "En cabine + questionnaire" },
  { id: "caisse", label: "Caisse", icon: AbanIcon, hint: "Point de vente" },
  { id: "orders", label: "Commandes", icon: ShoppingBag, hint: "Boutique en ligne Kènè" },
  { id: "crm", label: "CRM", icon: OsramIcon, hint: "Clientes & fidélité" },
  { id: "relances", label: "Relances", icon: BellRing, hint: "Suivi post-protocole" },
  { id: "equipe", label: "Équipe", icon: NkonsonkonsonIcon, hint: "Personnel & pointage" },
  { id: "catalogue", label: "Catalogue", icon: DuafeIcon, hint: "Soins & produits" },
  { id: "promos", label: "Promos", icon: TicketPercent, hint: "Coupons boutique" },
  { id: "stock", label: "Stock", icon: KenteIcon, hint: "Inventaire" },
  { id: "paie", label: "Paie", icon: FihankraIcon, hint: "CNPS · IPRES" },
  { id: "compta", label: "Compta", icon: BaouleIcon, hint: "SYSCOHADA" },
  { id: "parametres", label: "Paramètres", icon: Settings, hint: "Compte · affichage · session" },
  { id: "abonnement", label: "Abonnement", icon: Crown, hint: "Offres & facturation" },
];

/* — Rôles employées: sections visibles par poste. La GÉRANTE
 * (employeeRole absent) garde tout, y compris paie/compta/paramètres.
 * Une employée voit les sections de son poste; les autres sections ne
 * sont ni affichées ni atteignables (redirection auto si la section
 * courante n'est pas autorisée — p.ex. après un changement de compte). */
const EMPLOYEE_SECTIONS: Record<string, ProSectionId[]> = {
  estheticienne: ["agenda", "diagnostic", "parametres"],
  dermo_conseillere: ["agenda", "diagnostic", "crm", "relances", "parametres"],
  caissiere: ["caisse", "orders", "catalogue", "promos", "stock", "parametres"],
  manager: ["dashboard", "agenda", "diagnostic", "caisse", "orders", "crm", "relances", "equipe", "catalogue", "promos", "stock", "abonnement", "parametres"],
};
const EMPLOYEE_ROLE_LABELS: Record<string, string> = {
  estheticienne: "Esthéticienne",
  dermo_conseillere: "Dermo-conseillère",
  caissiere: "Caissière",
  manager: "Manager",
};

const PLAN_STYLES: Record<string, string> = {
  pro: "bg-gold/15 text-gold-text border-transparent ring-1 ring-inset ring-gold/30",
  business: "bg-success/15 text-success border-transparent ring-1 ring-inset ring-success/30",
  trial: "bg-muted text-muted-foreground border-transparent ring-1 ring-inset ring-border",
};

const NOTIFY_PORT = 3004;

function looksLikeLive(f: unknown): f is ProLive {
  const x = f as Partial<ProLive> | null;
  return !!x && typeof x.tenantId === "string" && typeof x.pendingAppts === "number" && typeof x.salesToday === "number";
}

export function ProApp() {
  const proTenantId = useKene((s) => s.proTenantId);
  const setProTenantId = useKene((s) => s.setProTenantId);
  // Compte de session: alimente le chip de la sidebar. Depuis
  // l'isolation des comptes, l'espace Pro n'est monté QUE pour une
  // session de rôle « pro » — le fallback « Fatou Koné » reste défensif
  // (aucun risque si un jour l'espace est ouvert sans session).
  const sessionUser = useKene((s) => s.user);
  const [section, setSection] = useState<ProSectionId>("dashboard");
  // Commande « Lancer un diagnostic » depuis la fiche CRM (objet neuf à chaque
  // clic → rouvre l'assistant même pour la même cliente)
  const [diagCommand, setDiagCommand] = useState<{ clientId: string; nonce: number } | null>(null);

  const overview = useApi<ProOverview>(
    () => apiGet<ProOverview>(`/api/pro/overview${proTenantId ? `?tenantId=${proTenantId}` : ""}`),
    [proTenantId]
  );

  // Première résolution serveur: le tenant de la session est mémorisé
  // (: le serveur renvoie l'institut de LA GÉRANTE, pas un « défaut »)
  useEffect(() => {
    if (!proTenantId && overview.data?.tenant?.id) setProTenantId(overview.data.tenant.id);
  }, [proTenantId, overview.data, setProTenantId]);

  // AUTO-GUÉRISON: un institut mémorisé (localStorage) disparu ou ÉTRANGER
  // (: l'ancien bug pouvait y persister l'id du « premier institut de
  // la base ») ne doit jamais bloquer l'espace Pro — on oublie la préférence
  // périmée: la résolution sans id renvoie désormais l'institut de la gérante.
  const healedRef = useRef(false);
  useEffect(() => {
    if (overview.error && proTenantId && !healedRef.current) {
      healedRef.current = true;
      setProTenantId(null);
      toast.info("Institut mémorisé périmé — ton institut est rechargé");
    }
  }, [overview.error, proTenantId, setProTenantId]);

  const tid = proTenantId ?? overview.data?.tenant.id ?? "";

 /* ── Temps réel institut (room tenant:{tid}) ─────────────────────────
 * join-tenant à la connexion (et à chaque changement d'institut);
 * tenant-feed → badge RDV à confirmer, toast d'arrivée (RDV réservé par
 * une cliente ou commande institut — jamais les actions de la pro
 * elle-même), KPIs dashboard et listes Agenda/Caisse rafraîchies.
 * Dégradation douce: sans service, tout continue au montage. */
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
    // Auto-guérison: service redémarré à chaud → zombie détecté ≤ 35 s,
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
      // Le baseline « déjà vues » descend avec les confirmations: si la pro
      // a vu 3 demandes, en confirme une (reste 2) puis qu'une NOUVELLE arrive
      // (3), le badge doit montrer 1 — pas 0.
      setAgendaSeen((seen) => Math.min(seen, f.pendingAppts));
      if (f.last) {
        lastEventIdRef.current = f.last.id;
        // Toast d'arrivée: uniquement les événements distants (réservation
        // cliente à confirmer, commande boutique) — la pro voit déjà ses
        // propres actions (POS, RDV créés côté institut → statut confirmed).
        // prevId null = premier fil après montage: pas de toast (vieille
        // activité déjà là au chargement, cf. garde prev!== null du centre
        // de notifications cliente).
        if (prevId !== null && f.last.id !== prevId) {
          if (f.last.type === "appointment" && f.last.status === "pending") {
            toast.success("Nouvelle demande de RDV", { description: f.last.label, duration: 6_000 });
          } else if (f.last.type === "order") {
            toast.success("Commande boutique reçue", { description: f.last.label, duration: 6_000 });
          } else if (f.last.type === "review") {
            toast.success("Nouvel avis cliente", { description: f.last.label, duration: 6_000 });
          }
        }
      }
      // KPIs + listes branchées: rechargement live (anti-flash: setFeed des useApi)
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

  // — sections du poste (employée) vs tout (gérante).
  const employeeRole = sessionUser?.employeeRole ?? null;
  const allowedIds = employeeRole ? EMPLOYEE_SECTIONS[employeeRole] ?? ["parametres"] : null;
  const nav = allowedIds ? NAV.filter((n) => allowedIds.includes(n.id)) : NAV;
  // Une employée n'atterrit jamais sur une section interdite: la section
  // ACTIVE est dérivée (clamp) — pas de redirection, pas d'effet, la valeur
  // mémoire reste ce qu'elle est mais le rendu suit strictement le poste.
  const activeSection: ProSectionId =
    allowedIds && !allowedIds.includes(section) ? allowedIds[0]! : section;

  // Nav mobile : la puce ACTIVE reste toujours visible — la bande défile
  // d'elle-même quand la section change (p.ex. pont Paie → « Gérer l'équipe »).
  const chipRefs = useRef<Partial<Record<ProSectionId, HTMLButtonElement | null>>>({});
  useEffect(() => {
    chipRefs.current[activeSection]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeSection]);

  const tenantOptions = useMemo(() => {
    const t = overview.data?.tenant;
    return t ? [{ id: t.id, name: t.name, city: t.city, country: t.country, plan: t.plan }] : [];
  }, [overview.data]);

  const tenant = overview.data?.tenant;
  const activeLabel = NAV.find((n) => n.id === activeSection)?.label ?? "";

  // Chip compte: nom de la gérante de session (rôle « pro », le
  // seul qui monte cet espace depuis l'isolation); le fallback « Fatou
  // Koné » reste défensif (session pro sans nom lisible).
  const proOwner = sessionUser?.role === "pro" ? sessionUser : null;
  const chipName =
    proOwner?.name && proOwner.name !== "Nouvelle cliente" && proOwner.name.trim() ? proOwner.name.trim() : "Fatou Koné";
  const chipRole = employeeRole
    ? EMPLOYEE_ROLE_LABELS[employeeRole] ?? "Employée"
    : proOwner
      ? "Fondatrice / Gérante"
      : "Gérante";
  const chipInitials =
    chipName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "FK";

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row">
      {/* Atmosphère ÉCLAT 2026 — lueurs aurora derrière tout l'espace Pro
 (sobriété back-office: le fond de page reste --background). */}
      <AuroraBackdrop />

      {/* ───────── Rail sidebar tablette (md→lg icônes) / desktop (lg+ libellés) — chrome verre ───────── */}
      <aside className="hidden md:flex w-[76px] lg:w-[240px] shrink-0 flex-col k-chrome text-foreground sticky top-0 self-start max-h-screen overflow-y-auto pretty-scroll">
        <div className="p-2.5 lg:p-4 lg:pb-3">
          {/* Lockup Sceau 2026 — l'espace Pro porte le Médaillon Kènè */}
          <div className="flex items-center justify-center lg:justify-start">
            <KeneEmblemLockup
              size={44}
              labelSize={19}
              label={<>Kènè <span className="text-gold-text">Pro</span></>}
              sublabel="Gestion institut"
              className="hidden lg:inline-flex"
            />
            <span className="lg:hidden" aria-hidden="true">
              <KeneEmblem size={44} />
            </span>
          </div>
        </div>

        <div className="hidden lg:block px-4 pb-3">
          <Select value={tid || undefined} onValueChange={(v) => setProTenantId(v)} disabled={tenantOptions.length <= 1}>
            <SelectTrigger
              className="k-chip h-auto w-full rounded-xl py-2.5 text-[13px] font-medium text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              aria-label="Institut actif"
            >
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
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="size-3" aria-hidden="true" />
                  {tenant.city} · {tenant.country}
                </span>
              </>
            ) : (
              <Shimmer className="h-4 w-24" />
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

        <nav aria-label="Navigation App Pro" className="flex-1 px-1.5 lg:px-3 py-2 space-y-1">
          {nav.map((item) => {
            const active = activeSection === item.id;
            const badge = navBadges[item.id];
            return (
              <button
                key={item.id}
                onClick={() => openSection(item.id)}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? `${item.label} — ${badge} RDV à confirmer` : item.label}
                title={item.label}
                className={cn(
                  "relative w-full flex items-center justify-center lg:justify-start gap-3 rounded-2xl px-2 py-2.5 lg:px-3.5 text-sm text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                  active
                    ? "bg-primary/12 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="pro-nav-rail"
                    aria-hidden="true"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="k-rail-line absolute left-0 top-1/2 -translate-y-1/2 h-[26px] w-[3px] rounded-full"
                  />
                )}
                <item.icon className="size-4.5 shrink-0" />
                <span className="hidden lg:block min-w-0 truncate">{item.label}</span>
                {badge ? (
                  <span
                    role="status"
                    className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-bissap px-1.5 text-[11px] font-semibold text-white"
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Chip gérante — carte verre: la gérante de session (rôle
 « pro », seule façon d'entrer ici depuis l'isolation); le
 fallback « Fatou Koné — Gérante » reste défensif. Les réglages
 vivent dans la NAV ci-dessus, dernière entrée. */}
        <div className="p-2.5 lg:p-4">
          <div className="k-card rounded-[20px] p-2 lg:p-3">
            <div className="flex flex-col lg:flex-row items-center gap-2 lg:gap-2.5">
              <span
                aria-hidden="true"
                className="k-glow-gold grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[11px] font-semibold text-[#FFF9EC]"
              >
                {chipInitials}
              </span>
              <div className="hidden w-full min-w-0 leading-tight lg:block">
                <p className="truncate font-heading text-[13px] font-bold">{chipName}</p>
                <Eyebrow className="mt-0.5 text-[9px]">{chipRole}</Eyebrow>
              </div>
              <div className="lg:ml-auto flex items-center gap-1.5">
                <ThemeToggle />
              </div>
            </div>
          </div>
          <p className="hidden lg:block px-1 pt-3 text-[10px] leading-relaxed text-muted-foreground/60">
            Kènè Pro — paiements en mode essai · CNPS CI / IPM SN / SYSCOHADA
          </p>
        </div>
      </aside>

      {/* ───────── Zone contenu ───────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Nav mobile — chips verre scrollables (uniquement <md), chrome collant.
            Fondus de bord : la bande annonce qu'elle défile (puce coupée + fondu). */}
        <div className="md:hidden sticky top-0 z-30 k-chrome">
          <nav
            aria-label="Navigation App Pro (mobile)"
            className="flex gap-1.5 overflow-x-auto no-scrollbar px-3 py-2.5 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]"
          >
          {nav.map((item) => {
              const badge = navBadges[item.id];
              return (
                <button
                  key={item.id}
                  ref={(el) => { chipRefs.current[item.id] = el; }}
                  onClick={() => openSection(item.id)}
                  aria-current={activeSection === item.id ? "page" : undefined}
                  aria-label={badge ? `${item.label} — ${badge} RDV à confirmer` : item.label}
                  className={cn(
                    "relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 min-h-11 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    activeSection === item.id
                      ? "k-btn-gold text-primary-foreground font-semibold"
                      : "k-chip text-muted-foreground hover:text-foreground"
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

        {/* En-tête pro (desktop lg+) — chrome verre collant. Le h1 UNIQUE de
 l'espace Pro vit ici, rendu en permanence (sr-only <lg où l'en-tête
 compact + la chip active de la nav portent déjà la section courante). */}
        <header className="lg:sticky lg:top-0 lg:z-30 lg:pt-6">
          <div className="sr-only lg:not-sr-only">
            <div className="k-chrome mx-6 rounded-[20px]">
              <div className="flex min-h-16 items-center px-7">
                <h1 className="font-heading text-xl font-bold tracking-tight truncate">{activeLabel}</h1>
              </div>
            </div>
          </div>
        </header>

        <div className="p-3 sm:p-5 lg:p-6 flex-1 min-w-0">
          {/* En-tête compact mobile + tablette (rail icônes md→lg sans libellés) —
 sans le h1: celui-ci vit dans l'en-tête pro chrome ci-dessus. */}
          <div className="lg:hidden mb-4 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground truncate flex items-center gap-1.5">
                <span className="truncate">{tenant ? `${tenant.name} · ${tenant.city}` : "…"}</span>
                {liveConnected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-medium text-success shrink-0">
                    <span className="relative flex size-1.5" aria-hidden="true">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                    </span>
                    En direct
                  </span>
                )}
              </p>
            </div>
            <KeneEmblem size={38} />
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
            </div>
          </div>

          {overview.error && activeSection === "dashboard" && (
            <div className="mb-4 rounded-2xl border border-bissap/30 bg-bissap/5 px-4 py-2.5 text-sm text-bissap">
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
            {activeSection === "dashboard" && (
              <DashboardSection tenantId={tid} overview={overview} loadingOverview={overview.loading} onNavigate={openSection} />
            )}
            {activeSection === "agenda" && <AgendaSection tenantId={tid} refreshKey={refreshKey} />}
            {activeSection === "diagnostic" && (
              <DiagnosticsSection
                tenantId={tid}
                refreshKey={refreshKey}
                preselectCommand={diagCommand}
                onCommandHandled={() => setDiagCommand(null)}
                onNavigate={openSection}
              />
            )}
            {activeSection === "caisse" && <PosSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} refreshKey={refreshKey} />}
            {activeSection === "orders" && <OrdersSection tenantId={tid} refreshKey={refreshKey} />}
            {activeSection === "crm" && <CrmSection tenantId={tid} onStartDiagnostic={(clientId) => { setDiagCommand({ clientId, nonce: Date.now() }); openSection("diagnostic"); }} />}
            {activeSection === "relances" && <RelancesSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
            {activeSection === "equipe" && <TeamSection tenantId={tid} defaultCountry={tenant?.country ?? "CI"} />}
            {activeSection === "catalogue" && <CatalogSection tenantId={tid} />}
            {activeSection === "promos" && <CouponsSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
            {activeSection === "stock" && <StockSection tenantId={tid} onNavigate={openSection} />}
            {activeSection === "paie" && <PayrollSection tenantId={tid} defaultCountry={tenant?.country ?? "CI"} tenantName={tenant?.name ?? "Institut"} onNavigate={openSection} />}
            {activeSection === "compta" && <AccountingSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
            {activeSection === "parametres" && <SettingsSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} tenantCity={tenant?.city} onNavigate={openSection} />}
            {activeSection === "abonnement" && <ProPlanSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
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
