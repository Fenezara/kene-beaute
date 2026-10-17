"use client";
// Kènè — ESPACE ENTREPRISE V30 (Architecture en 5 Pôles Métiers)
// 1. 📊 Pilotage & Activité (Tableau de bord)
// 2. 🔬 Clinique & Cabine (Diagnostic Peau, Dossiers Cutanés, Agenda & Soins)
// 3. 💳 Caisse & Stock (Ventes & Caisse POS, Offre, Stock & Promos)
// 4. 🤝 Relation & IA (CRM Clientes, Relances, Secrétaire IA)
// 5. ⚖️ RH, Paie & Compta (Équipe & Pointage, Paie CNPS/IPRES, Compta SYSCOHADA, Paramètres)
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { io, type Socket } from "socket.io-client";
import { armHeartbeat } from "@/lib/kene/live-socket";
import {
  BellRing,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  LayoutDashboard,
  Plus,
  Settings,
  ShoppingBag,
  ScanFace,
  ShieldAlert,
  TicketPercent,
  WifiOff,
  BriefcaseBusiness,
  LogIn,
  ArrowLeft,
  FolderHeart,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useKene, type SessionUser } from "@/store/kene";
import { apiGet, apiPost } from "@/lib/kene/api";
import { useNetworkOnline, HAPTIC, haptic } from "@/lib/kene/ux";
import {
  CauriIcon,
  KeneEmblemLockup,
  DuafeIcon,
  SankofaIcon,
  AbanIcon,
  OsramIcon,
  KenteIcon,
  FihankraIcon,
  BaouleIcon,
  NkonsonkonsonIcon,
} from "@/components/kene/icons";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AuroraBackdrop, Eyebrow } from "@/components/kene/ui2026";
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
import { SkinDossiersSection } from "./SkinDossiersSection";
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
import { ProductInciScannerModal } from "./ProductInciScannerModal";
import { KeneMirrorKioskModal } from "./KeneMirrorKioskModal";
import { AssistantSection } from "./AssistantSection";
import { formatRole } from "@/lib/kene/hr-constants";

export type ProSectionId =
  | "dashboard"
  | "assistant"
  | "agenda"
  | "diagnostic"
  | "dossiers_peau"
  | "caisse"
  | "orders"
  | "crm"
  | "relances"
  | "equipe"
  | "catalogue"
  | "promos"
  | "stock"
  | "paie"
  | "compta"
  | "parametres"
  | "abonnement";

export type ProNavCategory = "pilotage" | "clinique" | "commerce" | "relation" | "gestion";

export interface ProNavCategoryDef {
  id: ProNavCategory;
  emoji: string;
  label: string;
  shortLabel: string;
}

export const PRO_NAV_CATEGORIES: ProNavCategoryDef[] = [
  { id: "pilotage", emoji: "📊", label: "Pilotage & Activité", shortLabel: "Pilotage" },
  { id: "clinique", emoji: "🔬", label: "Cabine & Clinique Dermo", shortLabel: "Clinique & Cabine" },
  { id: "commerce", emoji: "💳", label: "Caisse & Commerce", shortLabel: "Caisse & Stock" },
  { id: "relation", emoji: "🤝", label: "Relation & Fidélité", shortLabel: "Relation & IA" },
  { id: "gestion", emoji: "⚖️", label: "Gestion & Administration", shortLabel: "RH, Paie & Compta" },
];

export interface ProNavItem {
  id: ProSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  category: ProNavCategory;
}

const NAV: ProNavItem[] = [
  // 1. Pilotage & Activité
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, hint: "KPIs & activité en temps réel", category: "pilotage" },

  // 2. Cabine & Clinique Dermo
  { id: "diagnostic", label: "📸 Diagnostic Peau", icon: ScanFace, hint: "En cabine, ordonnances beauté & ventes", category: "clinique" },
  { id: "dossiers_peau", label: "🔬 Dossiers Cutanés", icon: FolderHeart, hint: "Biomarqueurs, photos HD & formulations", category: "clinique" },
  { id: "agenda", label: "Agenda & Soins", icon: SankofaIcon, hint: "Rendez-vous & cabines de soins", category: "clinique" },

  // 3. Caisse & Commerce
  { id: "caisse", label: "Ventes & Caisse", icon: AbanIcon, hint: "Caisse POS · Commandes en ligne", category: "commerce" },
  { id: "catalogue", label: "Offre & Stock", icon: DuafeIcon, hint: "Soins · Stock · Promos", category: "commerce" },

  // 4. Relation & Fidélité
  { id: "crm", label: "CRM Clientes", icon: OsramIcon, hint: "Clientes, fiches & fidélité", category: "relation" },
  { id: "relances", label: "Relances", icon: BellRing, hint: "Suivi post-protocole & rappels", category: "relation" },
  { id: "assistant", label: "👑 Secrétaire IA", icon: Crown, hint: "Rappels WhatsApp 24/7 & Débriefing", category: "relation" },

  // 5. Gestion & Administration
  { id: "equipe", label: "Équipe & Pointage", icon: NkonsonkonsonIcon, hint: "Personnel, planning & présences", category: "gestion" },
  { id: "paie", label: "Paie & Cotisations", icon: FihankraIcon, hint: "Bulletins CNPS · IPRES", category: "gestion" },
  { id: "compta", label: "Compta SYSCOHADA", icon: BaouleIcon, hint: "Bilan & Grand Livre OHADA", category: "gestion" },
  { id: "parametres", label: "Paramètres", icon: Settings, hint: "Institut & Abonnement Kènè+", category: "gestion" },
];

const EMPLOYEE_SECTIONS: Record<string, ProSectionId[]> = {
  estheticienne: ["dossiers_peau", "diagnostic", "agenda", "assistant", "parametres"],
  dermo_conseillere: ["dossiers_peau", "diagnostic", "crm", "agenda", "relances", "assistant", "parametres"],
  coiffeuse: ["agenda", "diagnostic", "assistant", "parametres"],
  prothesiste_ongulaire: ["agenda", "diagnostic", "assistant", "parametres"],
  masseuse: ["agenda", "diagnostic", "assistant", "parametres"],
  caissiere: ["caisse", "catalogue", "assistant", "parametres"],
  receptionniste: ["agenda", "caisse", "crm", "relances", "assistant", "parametres"],
  responsable_stock: ["catalogue", "stock", "assistant", "parametres"],
  manager: ["dashboard", "dossiers_peau", "diagnostic", "assistant", "agenda", "caisse", "crm", "relances", "equipe", "catalogue", "parametres"],
  apprentie: ["dossiers_peau", "diagnostic", "agenda", "assistant", "parametres"],
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

export function ProEnterpriseShell() {
  const proTenantId = useKene((s) => s.proTenantId);
  const setProTenantId = useKene((s) => s.setProTenantId);
  const setSpace = useKene((s) => s.setSpace);
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
  const [diagCommand, setDiagCommand] = useState<{ clientId: string; nonce: number } | null>(null);
  const [skinDossierClientId, setSkinDossierClientId] = useState<string | null>(null);
  const [crmCreateNonce] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const [mamanAssistantOpen, setMamanAssistantOpen] = useState(false);
  const [inciScannerOpen, setInciScannerOpen] = useState(false);
  const [mirrorKioskOpen, setMirrorKioskOpen] = useState(false);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      document.body.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [section]);

  const online = useNetworkOnline();

  const overview = useApi<ProOverview>(
    () => apiGet<ProOverview>(`/api/pro/overview${proTenantId ? `?tenantId=${proTenantId}` : ""}`),
    [proTenantId],
    {
      cacheKey: `kene_pro_overview_${proTenantId || "default"}`,
      fallbackData: DEFAULT_FALLBACK_OVERVIEW,
    }
  );

  if (!sessionUser || (sessionUser.role !== "pro" && sessionUser.role !== "admin")) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
        <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-card/80 p-8 shadow-xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold-text">
            <BriefcaseBusiness size={32} />
          </div>
          <h2 className="font-heading text-xl font-bold text-foreground">Accès Espace Entreprise</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Cet espace de gestion d&apos;institut est réservé aux professionnelles partenaires Kènè. Veuillez vous identifier avec vos identifiants pour y accéder.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={async () => {
                try {
                  const res = await apiPost<{
                    ok: boolean;
                    user: SessionUser;
                    tenant: { id: string; name: string } | null;
                  }>("/api/auth/login", { phone: "+2250504195071", pin: "1234", mode: "pro" });
                  useKene.getState().setUser({
                    ...res.user,
                    role: "pro",
                    tenantId: res.tenant?.id || "cmts1w5ui0008oww7hm3v18oo",
                  });
                  if (res.tenant?.id) {
                    useKene.getState().setProTenantId(res.tenant.id);
                  }
                  useKene.getState().setSpace("pro");
                  toast.success("Bienvenue Déborah — Cabinet LA DERMO est ouvert 💼");
                } catch {
                  setSpace("client");
                  if (typeof window !== "undefined") {
                    window.location.href = "/?mode=pro";
                  }
                }
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl k-btn-gold text-sm font-bold text-primary-foreground shadow cursor-pointer hover:scale-[1.01] active:scale-[0.98] transition-all"
            >
              <BriefcaseBusiness size={16} />
              Accès Immédiat 1 Clic (Gérante Déborah)
            </button>
            <button
              onClick={() => {
                setSpace("client");
                if (typeof window !== "undefined") {
                  window.location.href = "/?mode=pro";
                }
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-secondary/80 hover:bg-secondary text-sm font-semibold text-foreground shadow-xs cursor-pointer"
            >
              <LogIn size={16} />
              Se connecter avec un autre numéro
            </button>
            <button
              onClick={() => {
                setSpace("client");
                if (typeof window !== "undefined") {
                  window.location.href = "/";
                }
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={14} />
              Retourner à l&apos;Espace Beauté
            </button>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const realTenantId = overview.data?.tenant?.id || sessionUser?.tenantId;
    if (realTenantId && (!proTenantId || proTenantId === DEFAULT_FALLBACK_TENANT_ID)) {
      setProTenantId(realTenantId);
    }
  }, [proTenantId, overview.data?.tenant?.id, sessionUser?.tenantId, setProTenantId]);

  const healedRef = useRef(false);
  useEffect(() => {
    if (!online) return;
    // Ne réinitialise proTenantId que si l'erreur 404 est avérée et non liée au chargement
    if (overview.error && proTenantId && !healedRef.current && overview.error.includes("404")) {
      const isNetworkErr = /hors-ligne|instable|réseau|network|failed to fetch/i.test(overview.error);
      if (isNetworkErr) return;

      healedRef.current = true;
      setProTenantId(null);
      toast.info("Institut mémorisé introuvable — réinitialisation");
    }
  }, [overview.error, proTenantId, setProTenantId, online]);

  const tid =
    (proTenantId && proTenantId !== DEFAULT_FALLBACK_TENANT_ID ? proTenantId : null) ||
    overview.data?.tenant?.id ||
    sessionUser?.tenantId ||
    proTenantId ||
    DEFAULT_FALLBACK_TENANT_ID;

  useEffect(() => {
    if (!tid || !online) return;
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

  useEffect(() => {
    const handleOnline = () => {
      void refetchRef.current?.();
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const [live, setLive] = useState<ProLive | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [agendaSeen, setAgendaSeen] = useState(0);
  const lastEventIdRef = useRef<string | null>(null);
  const refetchRef = useRef(overview.refetch);
  useEffect(() => {
    refetchRef.current = overview.refetch;
  }, [overview.refetch]);

  useEffect(() => {
    if (!tid) return;
    const socket: Socket = io(`/?XTransformPort=${NOTIFY_PORT}`, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 4_000,
      timeout: 8_000,
    });
    const disarm = armHeartbeat(socket);

    socket.on("connect", () => {
      setLiveConnected(true);
      socket.emit("join-tenant", { tenantId: tid });
    });
    socket.on("disconnect", () => setLiveConnected(false));
    socket.on("tenant-feed", (f: unknown) => {
      if (!looksLikeLive(f) || f.tenantId !== tid) return;
      const prevId = lastEventIdRef.current;
      setLive(f);
      setAgendaSeen((seen) => Math.min(seen, f.pendingAppts));
      if (f.last) {
        lastEventIdRef.current = f.last.id;
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
      setRefreshKey((k) => k + 1);
      void refetchRef.current();
    });

    return () => {
      disarm();
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [tid]);

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

  const employeeRole = sessionUser?.employeeRole ?? null;
  const employeePermissions = sessionUser?.employeePermissions ?? null;
  const isEmployee =
    Boolean(employeeRole) ||
    (Array.isArray(employeePermissions) && employeePermissions.length > 0);

  const allowedIds: ProSectionId[] | null = isEmployee
    ? employeePermissions && employeePermissions.length > 0
      ? ([...new Set([...employeePermissions, "parametres"])].filter(
          (id) => id !== "paie" && id !== "compta"
        ) as ProSectionId[])
      : employeeRole
      ? ([...new Set([...(EMPLOYEE_SECTIONS[employeeRole] ?? ["agenda", "diagnostic", "assistant"]), "parametres"])] as ProSectionId[])
      : (["agenda", "diagnostic", "assistant", "parametres"] as ProSectionId[])
    : null;

  const nav = allowedIds ? NAV.filter((n) => allowedIds.includes(n.id)) : NAV;
  const activeSection: ProSectionId =
    allowedIds && (!allowedIds.includes(section) || !nav.some((n) => n.id === section))
      ? (nav[0]?.id ?? "diagnostic")
      : section;

  const availableCategories = useMemo(
    () => PRO_NAV_CATEGORIES.filter((cat) => nav.some((i) => i.category === cat.id)),
    [nav]
  );
  const activeNavItem = nav.find((i) => i.id === activeSection) ?? nav[0];
  const activeCategory: ProNavCategory = activeNavItem?.category ?? "pilotage";
  const activeCategoryDef =
    PRO_NAV_CATEGORIES.find((c) => c.id === activeCategory) ?? PRO_NAV_CATEGORIES[0];
  const activeCategoryItems = nav.filter((i) => i.category === activeCategory);

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

  const isAdmin = sessionUser?.role === "admin";
  const proOwner = sessionUser?.role === "pro" || isAdmin ? sessionUser : null;
  const chipName =
    proOwner?.name && proOwner.name !== "Nouvelle cliente" && proOwner.name.trim()
      ? proOwner.name.trim()
      : tenant?.name
      ? tenant.name
      : "Gérante";
  const chipRole = isAdmin
    ? "👑 Patronne / Admin"
    : employeeRole
    ? formatRole(employeeRole)
    : proOwner
      ? "Fondatrice / Gérante"
      : "Gérante";
  const chipInitials =
    chipName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "GP";

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden overscroll-none select-none">
      <AuroraBackdrop />

      {/* ───────── 1. BANDEAU SUPÉRIEUR PLEINE LARGEUR (TOP BAR) ───────── */}
      <header className="shrink-0 z-40 w-full k-chrome border-b border-border/60 [padding-top:env(safe-area-inset-top,0px)]">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-1.5 sm:gap-3 px-2 sm:px-5 lg:px-6">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
            <KeneEmblemLockup
              size={34}
              labelSize={17}
              label={<>Kènè <span className="text-gold-text">Pro</span></>}
              sublabel="Beauté mélanoderme"
              hideSublabelOnMobile={true}
            />
          </div>

          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            <div className="block">
              <Select
                value={tid || undefined}
                onValueChange={(v) => {
                  if (v === "__create_branch__") {
                    setCreateBranchOpen(true);
                  } else {
                    healedRef.current = false;
                    setProTenantId(v);
                    const currentStoreUser = useKene.getState().user;
                    if (currentStoreUser) {
                      useKene.getState().setUser({ ...currentStoreUser, tenantId: v });
                    }
                    void apiGet<ProOverview>(`/api/pro/overview?tenantId=${v}`).then((fresh) => {
                      if (fresh && fresh.tenant) {
                        overview.setData(fresh);
                      }
                    }).catch(() => {
                      void overview.refetch();
                    });
                    toast.success("Établissement actif mis à jour");
                  }
                }}
                disabled={tenantOptions.length <= 1 && !proOwner && !isAdmin}
              >
                <SelectTrigger
                  className="k-chip h-8 sm:h-9 rounded-xl px-2 sm:px-3 text-[11px] sm:text-xs font-medium text-foreground max-w-[130px] sm:max-w-[210px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  aria-label="Institut actif"
                >
                  <div className="flex items-center gap-1 sm:gap-1.5 truncate">
                    <Building2 className="size-3 sm:size-3.5 shrink-0 text-gold-text" />
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

            {tenant && (
              <Badge variant="outline" className={cn("hidden lg:inline-flex text-[10px] font-semibold", PLAN_STYLES[tenant.plan] ?? PLAN_STYLES.trial)}>
                {tenant.plan === "business" ? "Complexe" : tenant.plan === "pro" ? "Essentiel" : "Pass Découverte 30j"}
              </Badge>
            )}

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

            {!online && (
              <span
                title="Mode Hors-ligne — Caisse POS, Catalogue & Clientes locaux opérationnels"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-500 shadow-xs"
              >
                <WifiOff className="size-3 text-amber-500" />
                <span className="hidden sm:inline">Hors-ligne (Caisse active)</span>
                <span className="sm:hidden">Hors-ligne</span>
              </span>
            )}

            <button
              type="button"
              onClick={goToClientSpace}
              className="hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-full text-xs font-semibold bg-gradient-to-r from-primary/10 via-primary/15 to-gold/10 hover:from-primary/20 hover:to-gold/20 text-primary border border-primary/30 transition-all shadow-xs active:scale-95 shrink-0"
              title="Accéder à Mon Espace Beauté personnel (Soins, Diagnostic & Rituels)"
            >
              <CauriIcon className="size-3.5 text-primary shrink-0" />
              <span>Mon Espace Beauté 🌸</span>
            </button>

            <SpaceSwitcher variant="compact" />
            <ThemeToggle />

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

        {/* Sous-bandeau mobile uniquement (< md) */}
        <div className="md:hidden border-t border-border/40 px-3 py-2 space-y-2">
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

          {/* Navigation mobile en 2 niveaux : 1. Pôles Métiers · 2. Onglets du Pôle */}
          <div className="space-y-1.5">
            <div
              aria-label="Pôles Métiers Entreprise (mobile)"
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"
            >
              <button
                type="button"
                onClick={goToClientSpace}
                className="relative inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1 min-h-8 text-[11px] font-bold bg-primary/15 text-primary border border-primary/30 shadow-xs active:scale-95 transition-all"
                title="Accéder à Mon Espace Beauté"
              >
                <CauriIcon className="size-3.5" />
                <span>Beauté 🌸</span>
              </button>

              {availableCategories.map((cat) => {
                const isCatActive = activeCategory === cat.id;
                const firstItem = nav.find((i) => i.category === cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      if (firstItem) openSection(firstItem.id);
                    }}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1 min-h-8 text-[11px] font-bold transition-all border",
                      isCatActive
                        ? "bg-primary/15 text-primary border-primary/40 shadow-xs"
                        : "bg-card/60 text-muted-foreground border-border/60 hover:text-foreground"
                    )}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            <nav
              aria-label="Sous-onglets du pôle actif (mobile)"
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5"
            >
              {activeCategoryItems.map((item) => {
                const badge = navBadges[item.id];
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      chipRefs.current[item.id] = el;
                    }}
                    onClick={() => openSection(item.id)}
                    aria-current={activeSection === item.id ? "page" : undefined}
                    aria-label={badge ? `${item.label} — ${badge} RDV à confirmer` : item.label}
                    className={cn(
                      "relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 min-h-8 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                      activeSection === item.id
                        ? "k-btn-gold text-primary-foreground font-bold shadow-xs"
                        : "k-chip text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-3.5" />
                    <span>{item.label}</span>
                    {badge ? (
                      <span
                        role="status"
                        className="grid h-4 min-w-4 place-items-center rounded-full bg-bissap px-1 text-[10px] font-semibold text-white"
                      >
                        {badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Barre Principale d'Organisation par 5 Pôles Métiers intégrée au Header (PC & Tablette md+) */}
        <div className="hidden md:flex items-center justify-between gap-3 border-t border-border/50 bg-card/65 px-5 py-2 backdrop-blur-md">
          <nav aria-label="Pôles Métiers Entreprise" className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {availableCategories.map((cat) => {
              const isCatActive = activeCategory === cat.id;
              const catItems = nav.filter((i) => i.category === cat.id);
              const firstItem = catItems[0];
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    haptic(HAPTIC.tap);
                    if (firstItem) openSection(firstItem.id);
                  }}
                  className={cn(
                    "h-9 px-3.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all border shrink-0 cursor-pointer",
                    isCatActive
                      ? "k-btn-gold text-primary-foreground border-transparent shadow-sm scale-[1.01]"
                      : "bg-background/80 text-muted-foreground border-border/70 hover:text-foreground hover:border-gold/40"
                  )}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.shortLabel}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-mono",
                      isCatActive ? "bg-black/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {catItems.length}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Actions Express Cabine */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                setMirrorKioskOpen(true);
              }}
              className="h-8.5 px-3 rounded-xl border border-primary/45 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-black flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Ouvrir le Mode Kiosque Tablette Salle d'Attente (Kènè Mirror)"
            >
              <Sparkles size={13} />
              <span>🪞 Kiosque Mirror</span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                setInciScannerOpen(true);
              }}
              className="h-8.5 px-3 rounded-xl border border-gold/50 bg-gold/15 hover:bg-gold/25 text-gold-text text-[11px] font-black flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Scanner un cosmétique (Liste Rouge Kènè & Analyse INCI)"
            >
              <ShieldAlert size={13} />
              <span>🧴 Scanner INCI</span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                openSection("caisse");
              }}
              className="h-8.5 px-3 rounded-xl border border-emerald-600/50 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white text-[11px] font-black flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              <AbanIcon size={13} />
              <span>Encaisser POS</span>
            </button>
          </div>
        </div>
      </header>

      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-gold/15 text-gold-text text-[11px] font-semibold py-1.5 px-3 border-b border-gold/30">
          <WifiOff size={13} aria-hidden="true" />
          Mode hors-ligne — Vos données locales (Tableau de bord, CRM, Caisse) restent disponibles
        </div>
      )}

      {/* ───────── 2. CORPS : RAIL LATÉRAL EN 5 PÔLES MÉTIERS + CONTENU PRINCIPAL ───────── */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        <aside
          className={cn(
            "hidden md:flex flex-col shrink-0 k-chrome text-foreground h-full overflow-y-auto overscroll-contain pretty-scroll border-r border-border/60 transition-all duration-300",
            sidebarExpanded ? "w-[248px]" : "w-[68px]"
          )}
        >
          {sidebarExpanded && (
            <div className="px-3.5 pt-3 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-gold-text">
                5 Pôles Métiers
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                {activeCategoryDef.shortLabel}
              </span>
            </div>
          )}

          <nav aria-label="Navigation App Pro" className="flex-1 px-2.5 py-2 space-y-2">
            {availableCategories.map((cat) => {
              const catItems = nav.filter((item) => item.category === cat.id);
              if (catItems.length === 0) return null;
              const isCatActive = activeCategory === cat.id;
              const firstItem = catItems[0];
              const catBadgeCount = catItems.reduce((sum, it) => sum + (navBadges[it.id] ?? 0), 0);

              if (!sidebarExpanded) {
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      haptic(HAPTIC.tap);
                      if (firstItem) openSection(firstItem.id);
                    }}
                    title={`${cat.label} (${catItems.map((i) => i.label).join(" · ")})`}
                    className={cn(
                      "relative w-full flex flex-col items-center justify-center rounded-2xl p-2.5 text-xs transition-all cursor-pointer border",
                      isCatActive
                        ? "k-btn-gold text-primary-foreground font-black border-transparent shadow-sm"
                        : "bg-card/50 text-muted-foreground border-border/50 hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    <span className="text-base">{cat.emoji}</span>
                    {catBadgeCount > 0 && (
                      <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-bissap px-1 text-[9px] font-bold text-white">
                        {catBadgeCount}
                      </span>
                    )}
                  </button>
                );
              }

              return (
                <div
                  key={cat.id}
                  className={cn(
                    "rounded-2xl border transition-all overflow-hidden",
                    isCatActive
                      ? "border-gold/50 bg-gradient-to-b from-gold/12 via-primary/5 to-card shadow-xs"
                      : "border-border/55 bg-card/40 hover:border-border"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      haptic(HAPTIC.tap);
                      if (!isCatActive && firstItem) {
                        openSection(firstItem.id);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors cursor-pointer",
                      isCatActive ? "text-foreground font-black" : "text-muted-foreground hover:text-foreground font-bold"
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm shrink-0">{cat.emoji}</span>
                      <span className="text-xs truncate">{cat.shortLabel}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {catBadgeCount > 0 && (
                        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-bissap px-1 text-[10px] font-bold text-white">
                          {catBadgeCount}
                        </span>
                      )}
                      <ChevronDown
                        size={14}
                        className={cn(
                          "transition-transform duration-200",
                          isCatActive ? "rotate-0 text-gold-text" : "-rotate-90 opacity-60"
                        )}
                      />
                    </span>
                  </button>

                  {isCatActive && (
                    <div className="px-2 pb-2 pt-0.5 space-y-1 border-t border-border/40">
                      {catItems.map((item) => {
                        const active = activeSection === item.id;
                        const badge = navBadges[item.id];
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openSection(item.id)}
                            aria-current={active ? "page" : undefined}
                            title={`${item.label} — ${item.hint}`}
                            className={cn(
                              "relative w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs transition-all cursor-pointer",
                              active
                                ? "k-btn-gold text-primary-foreground font-black shadow-xs"
                                : "text-foreground/80 hover:bg-accent/70 hover:text-foreground font-semibold"
                            )}
                          >
                            <item.icon className="size-4 shrink-0" />
                            <span className="min-w-0 truncate text-left">{item.label}</span>
                            {badge ? (
                              <span
                                role="status"
                                className="ml-auto grid h-4.5 min-w-4.5 place-items-center rounded-full bg-bissap px-1 text-[10px] font-semibold text-white"
                              >
                                {badge}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {sidebarExpanded && (
              <div className="pt-2 space-y-1.5">
                <p className="px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  ⚡ Outils Cabine Express
                </p>
                <button
                  type="button"
                  onClick={() => setMirrorKioskOpen(true)}
                  className="w-full flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 hover:bg-gold/20 px-3 py-2 text-xs font-bold text-foreground transition-all cursor-pointer"
                >
                  <span>🪞</span>
                  <span className="truncate">Borne Kènè Mirror (30s)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInciScannerOpen(true)}
                  className="w-full flex items-center gap-2 rounded-xl border border-primary/35 bg-primary/10 hover:bg-primary/20 px-3 py-2 text-xs font-bold text-foreground transition-all cursor-pointer"
                >
                  <span>🧴</span>
                  <span className="truncate">Scanner Produit INCI</span>
                </button>
              </div>
            )}
          </nav>

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
              <CauriIcon size={16} className="text-primary shrink-0" />
              {sidebarExpanded && (
                <div className="flex flex-col text-left leading-tight truncate">
                  <span className="truncate">Mon Espace Beauté</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Personnel 🌸</span>
                </div>
              )}
            </button>
          </div>

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
        <main
          ref={mainScrollRef}
          className={cn(
            "flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto overscroll-y-none overscroll-contain touch-pan-y pretty-scroll",
            activeSection === "assistant"
              ? "p-2 sm:p-4 lg:p-5"
              : "p-3 sm:p-5 lg:p-6"
          )}
        >
          {activeSection !== "assistant" && (
            <div className="mb-3.5 rounded-[18px] border border-primary/25 bg-card/95 px-3 py-2 backdrop-blur-md shadow-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-black text-gold-text dark:text-[#E3B04B] uppercase tracking-wider pr-1.5 shrink-0 flex items-center gap-1">
                  <span>{activeCategoryDef.emoji}</span>
                  <span>{activeCategoryDef.label} :</span>
                </span>
                {activeCategoryItems.map((item) => {
                  const isItemActive = activeSection === item.id;
                  const badge = navBadges[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openSection(item.id)}
                      className={cn(
                        "h-8 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer",
                        isItemActive
                          ? "k-btn-gold text-primary-foreground shadow-xs"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <item.icon className="size-3.5" />
                      <span>{item.label}</span>
                      {badge ? (
                        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-bissap px-1 text-[10px] font-semibold text-white">
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <span className="text-[11px] text-muted-foreground hidden xl:inline truncate">
                {activeNavItem?.hint}
              </span>
            </div>
          )}

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
            className={cn("min-w-0", activeSection === "assistant" && "flex-1 min-h-0 flex flex-col")}
          >
            {activeSection === "dashboard" && (
              <DashboardSection tenantId={tid} overview={overview} loadingOverview={overview.loading} onNavigate={openSection} />
            )}
            {activeSection === "assistant" && (
              <AssistantSection
                tenantId={tid}
                tenantName={tenant?.name ?? "Institut"}
                userName={chipName}
                onNavigate={openSection}
                refreshKey={refreshKey}
              />
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
            {activeSection === "dossiers_peau" && (
              <SkinDossiersSection
                tenantId={tid}
                preselectedClientId={skinDossierClientId}
                onClearPreselected={() => setSkinDossierClientId(null)}
                onStartDiagnostic={(clientId) => {
                  setDiagCommand({ clientId, nonce: Date.now() });
                  openSection("diagnostic");
                }}
                onNavigateToCrm={() => {
                  openSection("crm");
                }}
              />
            )}
            {activeSection === "crm" && (
              <CrmSection
                tenantId={tid}
                createClientNonce={crmCreateNonce}
                onStartDiagnostic={(clientId) => {
                  setDiagCommand({ clientId, nonce: Date.now() });
                  openSection("diagnostic");
                }}
                onOpenSkinDossier={(clientId) => {
                  setSkinDossierClientId(clientId);
                  openSection("dossiers_peau");
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
        </main>
      </div>

      <CreateBranchDialog
        open={createBranchOpen}
        onOpenChange={setCreateBranchOpen}
        onSuccess={(newBranch) => {
          setProTenantId(newBranch.id);
          void overview.refetch();
        }}
      />

      <button
        type="button"
        onClick={() => openSection("assistant")}
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-gradient-to-tr from-[#C8951E] to-[#E07A2B] text-[#16110D] shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all ring-4 ring-black/40 group"
        aria-label="Ouvrir la Secrétaire IA de Direction"
        title="Secrétaire IA de Direction (Débriefing 1 clic)"
      >
        <Crown size={26} className="group-hover:rotate-12 transition-transform" />
      </button>

      {mamanAssistantOpen && (
        <MamanAssistantModal
          tenantId={tid}
          tenantName={tenant?.name ?? "Institut"}
          userName={chipName}
          isOpen={mamanAssistantOpen}
          onClose={() => setMamanAssistantOpen(false)}
          onActionExecuted={() => {
            setRefreshKey((k) => k + 1);
            void overview.refetch();
          }}
        />
      )}

      <ProductInciScannerModal
        open={inciScannerOpen}
        onOpenChange={setInciScannerOpen}
        tenantId={tid}
      />

      <KeneMirrorKioskModal
        open={mirrorKioskOpen}
        onOpenChange={setMirrorKioskOpen}
        tenantId={tid}
        instituteName={tenant?.name ?? "Institut Partenaire Kènè"}
        onCompleted={(clientId) => {
          setRefreshKey((k) => k + 1);
          void overview.refetch();
          if (clientId) {
            setSkinDossierClientId(clientId);
            openSection("dossiers_peau");
          } else {
            openSection("diagnostic");
          }
        }}
      />
    </div>
  );
}

export function proToastError(e: unknown, fallback = "Action impossible") {
  toast.error(e instanceof Error ? e.message : fallback);
}
