"use client";
// Kènè — APP PRO (desktop/tablette): Dashboard, Agenda, Diagnostic en cabine, Caisse POS, CRM, Relances, Catalogue, Promos, Stock, Paie, Compta
// TEMPS RÉEL: socket.io vers notify-service (?XTransformPort=3004),
// room tenant:{id} — RDV réservé, commande institut, vente POS → badge Agenda,
// toast, KPIs du dashboard et listes branchées rafraîchis SANS reload.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import { armHeartbeat } from "@/lib/kene/live-socket";
import { BellRing, Building2, ChevronLeft, ChevronRight, Crown, LayoutDashboard, Plus, Settings, ShoppingBag, Sparkles, Stethoscope, TicketPercent, UserPlus, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useKene } from "@/store/kene";
import { apiGet } from "@/lib/kene/api";
import { isOnline } from "@/lib/kene/ux";
import { KeneEmblem, KeneEmblemLockup, KeneMark, DuafeIcon, SankofaIcon, AbanIcon, OsramIcon, KenteIcon, FihankraIcon, BaouleIcon, NkonsonkonsonIcon } from "@/components/kene/icons";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AuroraBackdrop, Eyebrow, Shimmer } from "@/components/kene/ui2026";
import { cn } from "@/lib/utils";
import { useApi } from "./useApi";
import type { ProOverview, ProLive } from "./types";
import { DEFAULT_FALLBACK_OVERVIEW, DEFAULT_FALLBACK_TENANT_ID } from "@/lib/kene/fallback-catalog";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { CreateBranchDialog } from "./CreateBranchDialog";
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
import { MamanAssistantModal } from "./MamanAssistantModal";
import { AssistantSection } from "./AssistantSection";

export type ProSectionId = "dashboard" | "assistant" | "agenda" | "diagnostic" | "caisse" | "orders" | "crm" | "relances" | "equipe" | "catalogue" | "promos" | "stock" | "paie" | "compta" | "parametres" | "abonnement";

const NAV: { id: ProSectionId; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, hint: "KPIs & activité" },
  { id: "assistant", label: "👑 Assistante Maman", icon: Crown, hint: "Débriefing vocal & point" },
  { id: "agenda", label: "Agenda", icon: SankofaIcon, hint: "Rendez-vous" },
  { id: "diagnostic", label: "Diagnostic", icon: Stethoscope, hint: "En cabine + questionnaire" },
  { id: "caisse", label: "Ventes & Caisse", icon: AbanIcon, hint: "Caisse POS · Commandes en ligne" },
  { id: "crm", label: "CRM", icon: OsramIcon, hint: "Clientes & fidélité" },
  { id: "relances", label: "Relances", icon: BellRing, hint: "Suivi post-protocole" },
  { id: "equipe", label: "Équipe", icon: NkonsonkonsonIcon, hint: "Personnel & pointage" },
  { id: "catalogue", label: "Offre & Stock", icon: DuafeIcon, hint: "Soins · Stock · Promos" },
  { id: "paie", label: "Paie", icon: FihankraIcon, hint: "CNPS · IPRES" },
  { id: "compta", label: "Compta", icon: BaouleIcon, hint: "SYSCOHADA" },
  { id: "parametres", label: "Paramètres", icon: Settings, hint: "Institut & Abonnement Kènè+" },
];

/* — Rôles employées: sections visibles par poste. La GÉRANTE
 * (employeeRole absent) garde tout, y compris paie/compta/paramètres.
 * Une employée voit les sections de son poste; les autres sections ne
 * sont ni affichées ni atteignables (redirection auto si la section
 * courante n'est pas autorisée — p.ex. après un changement de compte). */
const EMPLOYEE_SECTIONS: Record<string, ProSectionId[]> = {
  estheticienne: ["agenda", "diagnostic", "assistant", "parametres"],
  dermo_conseillere: ["agenda", "diagnostic", "crm", "relances", "assistant", "parametres"],
  caissiere: ["caisse", "catalogue", "assistant", "parametres"],
  manager: ["dashboard", "agenda", "diagnostic", "caisse", "crm", "relances", "equipe", "catalogue", "assistant", "parametres"],
};
const EMPLOYEE_ROLE_LABELS: Record<string, string> = {
  estheticienne: "Esthéticienne",
  dermo_conseillere: "Dermo-conseillère",
  caissiere: "Caissière",
  manager: "Manager",
};

const PLAN_STYLES: Record<string, string> = {
  pro: "bg-gold/15 text-gold-text border-transparent ring-1 ring-inset ring-gold/30",
  business: "bg-primary/15 text-primary border-transparent ring-1 ring-inset ring-primary/30",
  trial: "bg-gold/10 text-gold-text border-transparent ring-1 ring-inset ring-gold/25",
};

const NOTIFY_PORT = 3004;

function looksLikeLive(f: unknown): f is ProLive {
  const x = f as Partial<ProLive> | null;
  return !!x && typeof x.tenantId === "string" && typeof x.pendingAppts === "number" && typeof x.salesToday === "number";
}

export function ProApp() {
  const proTenantId = useKene((s) => s.proTenantId);
  const setProTenantId = useKene((s) => s.setProTenantId);
  const setSpace = useKene((s) => s.setSpace);
  // Compte de session: alimente le chip de la sidebar. Depuis
  // l'isolation des comptes, l'espace Pro n'est monté QUE pour une
  // session de rôle « pro » — le fallback « Fatou Koné » reste défensif
  // (aucun risque si un jour l'espace est ouvert sans session).
  const sessionUser = useKene((s) => s.user);

  function goToClientSpace() {
    setSpace("client");
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new Event("popstate"));
    }
    toast.success("Bienvenue dans ton Espace Beauté personnel 🌸");
  }
  const [section, setSection] = useState<ProSectionId>("dashboard");
  const [salesTab, setSalesTab] = useState<"pos" | "orders">("pos");
  const [catalogTab, setCatalogTab] = useState<"products" | "stock" | "promos">("products");
  const [settingsTab, setSettingsTab] = useState<"settings" | "subscription">("settings");
  // Commande « Lancer un diagnostic » depuis la fiche CRM (objet neuf à chaque
  // clic → rouvre l'assistant même pour la même cliente)
  const [diagCommand, setDiagCommand] = useState<{ clientId: string; nonce: number } | null>(null);
  // Commande « Nouvelle cliente » depuis l'Accès Rapide
  const [crmCreateNonce, setCrmCreateNonce] = useState(0);
  // Rail latéral rétractable (68px compact par défaut sur tablette, extensible à 220px)
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  // Modal de l'Assistante de la Maman (Débriefing & dispatch 1-tap)
  const [mamanAssistantOpen, setMamanAssistantOpen] = useState(false);

  // Détection de connectivité réseau pour la résilience offline (façon Wave)
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(isOnline());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const overview = useApi<ProOverview>(
    () => apiGet<ProOverview>(`/api/pro/overview${proTenantId ? `?tenantId=${proTenantId}` : ""}`),
    [proTenantId],
    {
      cacheKey: `kene_pro_overview_${proTenantId || "default"}`,
      fallbackData: DEFAULT_FALLBACK_OVERVIEW,
    }
  );

  // Première résolution serveur: le tenant de la session est mémorisé
  // (: le serveur renvoie l'institut de LA GÉRANTE, pas un « défaut »)
  useEffect(() => {
    if (!proTenantId && overview.data?.tenant?.id) {
      setProTenantId(overview.data.tenant.id);
    } else if (!proTenantId) {
      const activeId = sessionUser?.tenantId || DEFAULT_FALLBACK_TENANT_ID;
      if (activeId) setProTenantId(activeId);
    }
  }, [proTenantId, overview.data, sessionUser?.tenantId, setProTenantId]);

  // AUTO-GUÉRISON : un institut mémorisé disparu ne doit JAMAIS être effacé
  // si le navigateur est hors-ligne ou s'il s'agit d'une instabilité réseau passagère.
  const healedRef = useRef(false);
  useEffect(() => {
    if (!online || !isOnline()) return;
    if (overview.error && proTenantId && !healedRef.current) {
      const isNetworkErr = /hors-ligne|instable|réseau|network|failed to fetch/i.test(overview.error);
      if (isNetworkErr) return;

      healedRef.current = true;
      setProTenantId(null);
      toast.info("Institut mémorisé périmé — ton institut est rechargé");
    }
  }, [overview.error, proTenantId, setProTenantId, online]);

  const tid = proTenantId || overview.data?.tenant?.id || sessionUser?.tenantId || DEFAULT_FALLBACK_TENANT_ID;

  // Pré-remplissage du cache hors-ligne pour l'espace entreprise (CRM, catalogue, stock, etc.)
  // Assure la disponibilité immédiate des écrans même si la connexion est coupée en cours de journée
  useEffect(() => {
    if (!tid || !online || !isOnline()) return;
    const timer = window.setTimeout(() => {
      const endpoints = [
        `/api/pro/overview?tenantId=${tid}`,
        `/api/pro/clients?tenantId=${tid}`,
        `/api/pro/catalog?tenantId=${tid}`,
        `/api/pro/stock?tenantId=${tid}`,
        `/api/pro/employees?tenantId=${tid}`,
        `/api/pro/sales?tenantId=${tid}`,
      ];
      endpoints.forEach((ep) => {
        void apiGet(ep).catch(() => {});
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [tid, online]);

  // Rafraîchissement automatique dès que le réseau revient
  useEffect(() => {
    const handleOnline = () => {
      void refetchRef.current?.();
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

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
    if (s === "orders") {
      setSalesTab("orders");
      setSection("caisse");
      return;
    }
    if (s === "caisse") {
      setSalesTab("pos");
      setSection("caisse");
      return;
    }
    if (s === "stock") {
      setCatalogTab("stock");
      setSection("catalogue");
      return;
    }
    if (s === "promos") {
      setCatalogTab("promos");
      setSection("catalogue");
      return;
    }
    if (s === "abonnement") {
      setSettingsTab("subscription");
      setSection("parametres");
      return;
    }
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

  const [createBranchOpen, setCreateBranchOpen] = useState(false);

  const tenantOptions = useMemo(() => {
    if (overview.data?.tenants && overview.data.tenants.length > 0) {
      return overview.data.tenants;
    }
    const t = overview.data?.tenant;
    return t ? [{ id: t.id, name: t.name, city: t.city, country: t.country, plan: t.plan }] : [];
  }, [overview.data]);

  const tenant = overview.data?.tenant;

  // Chip compte: nom de la gérante ou de l'admin suprême connectée
  const isAdmin = sessionUser?.role === "admin";
  const proOwner = sessionUser?.role === "pro" || isAdmin ? sessionUser : null;
  const chipName =
    proOwner?.name && proOwner.name !== "Nouvelle cliente" && proOwner.name.trim() ? proOwner.name.trim() : "Fatou Koné";
  const chipRole = isAdmin
    ? "👑 Patronne / Admin"
    : employeeRole
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
    <div className="w-full min-h-screen flex flex-col">
      {/* Atmosphère ÉCLAT 2026 — lueurs aurora derrière tout l'espace Pro */}
      <AuroraBackdrop />

      {/* ───────── 1. BANDEAU SUPÉRIEUR PLEINE LARGEUR (TOP BAR) ───────── */}
      {/* Porteur officiel du Logo + Nom + Slogan en haut à gauche en continu sur PC, tablette et mobile */}
      <header className="sticky top-0 z-40 w-full k-chrome border-b border-border/60 pt-8 sm:pt-4 md:pt-0 [padding-top:max(env(safe-area-inset-top,0px),2.25rem)] md:[padding-top:env(safe-area-inset-top,0px)]">
        <div className="flex h-16 items-center justify-between gap-3 px-3.5 sm:px-5 lg:px-6">
          {/* TOUT EN HAUT À GAUCHE : Logo Médaillon officiel (42px) + Nom + Slogan */}
          <div className="flex items-center gap-3 min-w-0">
            <KeneEmblemLockup
              size={42}
              labelSize={20}
              label={<>Kènè <span className="text-gold-text">Pro</span></>}
              sublabel="Beauté mélanoderme"
            />
          </div>

          {/* À DROITE : Sélecteur d'établissement + Direct + Thème + Console + Profil */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Sélecteur d'établissement (masqué sur mobile très étroit, visible dès sm) */}
            <div className="hidden sm:block">
              <Select
                value={tid || undefined}
                onValueChange={(v) => {
                  if (v === "__create_branch__") {
                    setCreateBranchOpen(true);
                  } else {
                    setProTenantId(v);
                  }
                }}
                disabled={tenantOptions.length <= 1 && !proOwner}
              >
                <SelectTrigger
                  className="k-chip h-9 rounded-xl px-3 text-xs font-medium text-foreground max-w-[210px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  aria-label="Institut actif"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Building2 className="size-3.5 shrink-0 text-gold-text" />
                    <span className="truncate">{tenant?.name ?? "Institut…"}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {tenantOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex flex-col py-0.5 text-left">
                        <span className="font-semibold text-xs text-foreground">{t.name}</span>
                        <span className="text-[10px] text-muted-foreground">{t.city} · {t.country}</span>
                      </div>
                    </SelectItem>
                  ))}
                  {proOwner && (
                    <SelectItem
                      value="__create_branch__"
                      className="mt-1 border-t border-border/40 pt-1.5 font-medium text-xs text-primary focus:text-primary cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <Plus className="size-3.5" />
                        <span>+ Ajouter un établissement...</span>
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Badge d'offre de l'établissement */}
            {tenant && (
              <Badge variant="outline" className={cn("hidden lg:inline-flex text-[10px] font-semibold", PLAN_STYLES[tenant.plan] ?? PLAN_STYLES.trial)}>
                {tenant.plan === "business" ? "Complexe" : tenant.plan === "pro" ? "Essentiel" : "Pass Découverte 30j"}
              </Badge>
            )}

            {/* Badge Direct */}
            {liveConnected && (
              <span
                title="Connecté en temps réel — RDV, commandes et ventes arrivent sans recharger"
                className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success"
              >
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                Direct
              </span>
            )}

            {/* Bouton direct Mon Espace Beauté */}
            <button
              type="button"
              onClick={goToClientSpace}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-full text-xs font-semibold bg-gradient-to-r from-primary/10 via-primary/15 to-gold/10 hover:from-primary/20 hover:to-gold/20 text-primary border border-primary/30 transition-all shadow-xs active:scale-95 shrink-0"
              title="Accéder à Mon Espace Beauté personnel (Soins, IA & Rituels)"
            >
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span className="hidden sm:inline">Mon Espace Beauté 🌸</span>
              <span className="sm:hidden">Beauté 🌸</span>
            </button>

            {/* Sélecteur d'interfaces Kènè */}
            <SpaceSwitcher variant="compact" />

            {/* Basculeur de thème */}
            <ThemeToggle />

            {/* Chip gérante compacte */}
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border/60">
              <span
                aria-hidden="true"
                className="k-glow-gold grid size-8 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[11px] font-semibold text-[#FFF9EC]"
              >
                {chipInitials}
              </span>
              <div className="hidden lg:block text-left leading-tight">
                <p className="text-xs font-bold truncate max-w-[130px]">{chipName}</p>
                <Eyebrow className="mt-0.5 text-[9px]">{chipRole}</Eyebrow>
              </div>
            </div>
          </div>
        </div>

        {/* Sous-bandeau mobile uniquement (< md) : sélecteur si mobile étroit + nav chips */}
        <div className="md:hidden border-t border-border/40 px-3 py-2 space-y-2">
          {/* Sélecteur d'établissement sur mobile */}
          {(tenantOptions.length > 1 || proOwner) && (
            <div className="sm:hidden">
              <Select
                value={tid || undefined}
                onValueChange={(v) => {
                  if (v === "__create_branch__") {
                    setCreateBranchOpen(true);
                  } else {
                    setProTenantId(v);
                  }
                }}
                disabled={tenantOptions.length <= 1 && !proOwner}
              >
                <SelectTrigger
                  className="k-chip h-8 w-full rounded-xl px-2.5 text-xs font-semibold"
                  aria-label="Changer d'institut"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Building2 className="size-3.5 shrink-0 text-gold-text" />
                    <span className="truncate">{tenant?.name ?? "Institut…"}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {tenantOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex flex-col py-0.5 text-left">
                        <span className="font-semibold text-xs">{t.name}</span>
                        <span className="text-[10px] text-muted-foreground">{t.city} · {t.country}</span>
                      </div>
                    </SelectItem>
                  ))}
                  {proOwner && (
                    <SelectItem
                      value="__create_branch__"
                      className="mt-1 border-t border-border/40 pt-1.5 font-medium text-xs text-primary focus:text-primary cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <Plus className="size-3" />
                        <span>+ Ajouter un établissement...</span>
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Navigation mobile chips */}
          <nav
            aria-label="Navigation App Pro (mobile)"
            className="flex gap-1.5 overflow-x-auto no-scrollbar [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]"
          >
            {/* Accès rapide direct Espace Beauté personnel sur mobile */}
            <button
              type="button"
              onClick={goToClientSpace}
              className="relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 min-h-9 text-xs font-bold bg-primary/15 text-primary border border-primary/30 shadow-xs active:scale-95 transition-all"
              title="Accéder à Mon Espace Beauté"
            >
              <Sparkles className="size-3.5" />
              <span>Espace Beauté 🌸</span>
            </button>
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
                    "relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 min-h-9 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
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
      </header>

      {/* Bandeau hors-ligne — résilience réseau façon Wave (Tableau de bord, CRM, Caisse, etc.) */}
      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-gold/15 text-gold-text text-[11px] font-semibold py-1.5 px-3 border-b border-gold/30">
          <WifiOff size={13} aria-hidden="true" />
          Mode hors-ligne — Vos données locales (Tableau de bord, CRM, Caisse) restent disponibles
        </div>
      )}

      {/* ───────── 2. CORPS : RAIL LATÉRAL FIN (68 px) + CONTENU PRINCIPAL ───────── */}
      <div className="flex-1 flex flex-row min-w-0">
        {/* Rail de navigation compact 68 px (avec toggle possible vers 220 px) */}
        <aside
          className={cn(
            "hidden md:flex flex-col shrink-0 k-chrome text-foreground sticky top-[calc(4rem+env(safe-area-inset-top,0px))] self-start h-[calc(100vh-4rem-env(safe-area-inset-top,0px))] overflow-y-auto pretty-scroll border-r border-border/60 transition-all duration-300",
            sidebarExpanded ? "w-[220px]" : "w-[68px]"
          )}
        >
          <nav aria-label="Navigation App Pro" className="flex-1 px-2 py-3 space-y-1">
            {nav.map((item) => {
              const active = activeSection === item.id;
              const badge = navBadges[item.id];
              return (
                <button
                  key={item.id}
                  onClick={() => openSection(item.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={badge ? `${item.label} — ${badge} RDV à confirmer` : item.label}
                  title={`${item.label} — ${item.hint}`}
                  className={cn(
                    "relative w-full flex items-center gap-3 rounded-xl p-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                    sidebarExpanded ? "justify-start px-3" : "justify-center",
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
                      className="k-rail-line absolute left-0 top-1/2 -translate-y-1/2 h-[24px] w-[3px] rounded-full"
                    />
                  )}
                  <item.icon className="size-5 shrink-0" />
                  {sidebarExpanded && <span className="min-w-0 truncate">{item.label}</span>}
                  {badge ? (
                    <span
                      role="status"
                      className={cn(
                        "grid h-4.5 min-w-4.5 place-items-center rounded-full bg-bissap px-1 text-[10px] font-semibold text-white",
                        sidebarExpanded ? "ml-auto" : "absolute top-1 right-1"
                      )}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          {/* Accès direct Mon Espace Beauté */}
          <div className="p-2 border-t border-border/40">
            <button
              type="button"
              onClick={goToClientSpace}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 transition-all active:scale-95 shadow-xs",
                sidebarExpanded ? "justify-start px-3" : "justify-center"
              )}
              title="Basculer vers Mon Espace Beauté (Soins & Rituels personnels)"
              aria-label="Basculer vers Mon Espace Beauté"
            >
              <Sparkles size={16} className="text-primary shrink-0" />
              {sidebarExpanded && (
                <div className="flex flex-col text-left leading-tight truncate">
                  <span className="truncate">Mon Espace Beauté</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Personnel 🌸</span>
                </div>
              )}
            </button>
          </div>

          {/* Bouton bascule plier / déplier en bas du rail */}
          <div className="p-2 border-t border-border/40">
            <button
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className={cn(
                "w-full flex items-center gap-2 rounded-xl p-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
                sidebarExpanded ? "justify-start px-2.5" : "justify-center"
              )}
              title={sidebarExpanded ? "Réduire la barre de navigation" : "Agrandir la barre de navigation"}
              aria-label={sidebarExpanded ? "Réduire la barre de navigation" : "Agrandir la barre de navigation"}
            >
              {sidebarExpanded ? (
                <>
                  <ChevronLeft size={16} className="shrink-0" />
                  <span className="truncate">Réduire</span>
                </>
              ) : (
                <ChevronRight size={16} className="shrink-0" />
              )}
            </button>
          </div>
        </aside>

        {/* ───────── Zone contenu principal ───────── */}
        <div className="flex-1 min-w-0 flex flex-col p-3 sm:p-5 lg:p-6">
          {/* ⚡ Barre d'actions express praticienne (Encaisser, RDV, Scan) */}
          <div className="mb-4 rounded-2xl border border-border/80 bg-card/75 p-2.5 sm:p-3 backdrop-blur-md shadow-sm flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pl-1 hidden sm:inline shrink-0">
              ⚡ Accès rapide :
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => openSection("assistant")}
                className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl border border-[#C8951E]/60 bg-gradient-to-r from-[#C8951E]/25 via-gold/15 to-transparent hover:from-[#C8951E]/35 text-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
              >
                <Crown size={15} className="text-[#C8951E]" /> Assistante Maman ✨
              </button>
              <button
                type="button"
                onClick={() => openSection("caisse")}
                className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform shrink-0"
              >
                <AbanIcon size={16} /> Encaisser
              </button>
              <button
                type="button"
                onClick={() => openSection("agenda")}
                className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl border border-primary/35 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform shrink-0"
              >
                <SankofaIcon size={16} /> Nouveau RDV
              </button>
              <button
                type="button"
                onClick={() => openSection("diagnostic")}
                className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl border border-border bg-card text-foreground hover:bg-muted text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform shrink-0"
              >
                <Stethoscope size={16} /> Scan Cabine
              </button>
              <button
                type="button"
                onClick={() => {
                  setCrmCreateNonce(Date.now());
                  openSection("crm");
                }}
                className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl border border-primary/35 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform shrink-0"
              >
                <UserPlus size={16} /> + Cliente
              </button>
              <button
                type="button"
                onClick={goToClientSpace}
                className="hidden xl:flex h-9 px-3.5 rounded-xl border border-primary/35 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold items-center justify-center gap-1.5 active:scale-95 transition-transform shrink-0"
                title="Mon Espace Beauté (Soins & Rituels personnels)"
              >
                <Sparkles size={15} /> Mon Espace Beauté 🌸
              </button>
            </div>
          </div>

          {overview.error && !/network|failed to fetch|hors-ligne|load failed|offline/i.test(overview.error) && activeSection === "dashboard" && (
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
            {activeSection === "assistant" && (
              <AssistantSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} onNavigate={openSection} refreshKey={refreshKey} />
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
            {(activeSection === "caisse" || activeSection === "orders") && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                  <button
                    type="button"
                    onClick={() => setSalesTab("pos")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                      salesTab === "pos"
                        ? "k-btn-gold text-primary-foreground shadow-sm"
                        : "k-chip text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <AbanIcon size={15} />
                    <span>Encaisser (Caisse POS)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesTab("orders")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                      salesTab === "orders"
                        ? "k-btn-gold text-primary-foreground shadow-sm"
                        : "k-chip text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ShoppingBag size={15} />
                    <span>Commandes en ligne</span>
                  </button>
                </div>
                {salesTab === "pos" ? (
                  <PosSection
                    tenantId={tid}
                    tenantName={tenant?.name ?? "Institut"}
                    tenantCity={tenant?.city}
                    tenantPhone={tenant?.phone}
                    refreshKey={refreshKey}
                  />
                ) : (
                  <OrdersSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} refreshKey={refreshKey} />
                )}
              </div>
            )}
            {activeSection === "crm" && (
              <CrmSection
                tenantId={tid}
                createClientNonce={crmCreateNonce}
                onStartDiagnostic={(clientId) => {
                  setDiagCommand({ clientId, nonce: Date.now() });
                  openSection("diagnostic");
                }}
              />
            )}
            {activeSection === "relances" && <RelancesSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
            {activeSection === "equipe" && <TeamSection tenantId={tid} defaultCountry={tenant?.country ?? "CI"} />}
            {(activeSection === "catalogue" || activeSection === "stock" || activeSection === "promos") && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-border/60 pb-3 overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setCatalogTab("products")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0",
                      catalogTab === "products"
                        ? "k-btn-gold text-primary-foreground shadow-sm"
                        : "k-chip text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <DuafeIcon size={15} />
                    <span>Soins & Produits</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogTab("stock")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0",
                      catalogTab === "stock"
                        ? "k-btn-gold text-primary-foreground shadow-sm"
                        : "k-chip text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <KenteIcon size={15} />
                    <span>Inventaire Stock</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogTab("promos")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0",
                      catalogTab === "promos"
                        ? "k-btn-gold text-primary-foreground shadow-sm"
                        : "k-chip text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <TicketPercent size={15} />
                    <span>Codes Promo & Réductions</span>
                  </button>
                </div>
                {catalogTab === "products" && <CatalogSection tenantId={tid} />}
                {catalogTab === "stock" && <StockSection tenantId={tid} onNavigate={openSection} />}
                {catalogTab === "promos" && <CouponsSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
              </div>
            )}
            {activeSection === "paie" && <PayrollSection tenantId={tid} defaultCountry={tenant?.country ?? "CI"} tenantName={tenant?.name ?? "Institut"} onNavigate={openSection} />}
            {activeSection === "compta" && <AccountingSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />}
            {(activeSection === "parametres" || activeSection === "abonnement") && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                  <button
                    type="button"
                    onClick={() => setSettingsTab("settings")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                      settingsTab === "settings"
                        ? "k-btn-gold text-primary-foreground shadow-sm"
                        : "k-chip text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Settings size={15} />
                    <span>Institut & Établissement</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsTab("subscription")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                      settingsTab === "subscription"
                        ? "k-btn-gold text-primary-foreground shadow-sm"
                        : "k-chip text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Crown size={15} className="text-gold" />
                    <span>Mon Abonnement Kènè+ Pro</span>
                  </button>
                </div>
                {settingsTab === "settings" ? (
                  <SettingsSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} tenantCity={tenant?.city} onNavigate={openSection} />
                ) : (
                  <ProPlanSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <CreateBranchDialog
        open={createBranchOpen}
        onOpenChange={setCreateBranchOpen}
        onSuccess={(newBranch) => {
          setProTenantId(newBranch.id);
          void overview.refetch();
        }}
      />

      {/* Bouton d'action flottant (FAB) permanent pour l'Assistante de la Maman */}
      <button
        type="button"
        onClick={() => openSection("assistant")}
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-gradient-to-tr from-[#C8951E] to-[#E07A2B] text-[#16110D] shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all ring-4 ring-black/40 group"
        aria-label="Ouvrir l'Assistante de la Maman"
        title="Assistante de la Maman (Débriefing 1 clic)"
      >
        <Crown size={26} className="group-hover:rotate-12 transition-transform" />
      </button>

      {/* Modal Assistante de la Maman */}
      {mamanAssistantOpen && (
        <MamanAssistantModal
          tenantId={tid}
          tenantName={tenant?.name ?? "Institut"}
          isOpen={mamanAssistantOpen}
          onClose={() => setMamanAssistantOpen(false)}
          onActionExecuted={() => {
            setRefreshKey((k) => k + 1);
            void overview.refetch();
          }}
        />
      )}
    </div>
  );
}

/** Toast helper partagé */
export function proToastError(e: unknown, fallback = "Action impossible") {
  toast.error(e instanceof Error ? e.message : fallback);
}
