"use client";
// Kènè — ESPACE ENTREPRISE V30 (Architecture en 5 Pôles Métiers)
// 1. 📊 Pilotage & Activité (Tableau de bord)
// 2. 🔬 Clinique & Cabine (Diagnostic Peau, Dossiers Cutanés, Agenda & Soins)
// 3. 💳 Caisse & Stock (Ventes & Caisse POS, Offre, Stock & Promos)
// 4. 🤝 Relation & IA (CRM Clientes, Relances, Secrétaire IA)
// 5. ⚖️ RH, Paie & Compta (Équipe & Pointage, Paie CNPS/IPRES, Compta SYSCOHADA, Paramètres)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  LogOut,
  CheckCircle2,
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
import { applyTierThemeToDom, saveTenantTierTheme, syncActiveTierTheme } from "@/lib/kene/tier-theme";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AuroraBackdrop, Eyebrow } from "@/components/kene/ui2026";
import { cn } from "@/lib/utils";
import { useApi } from "./useApi";
import type { ProOverview, ProLive } from "./types";
import { DEFAULT_FALLBACK_OVERVIEW, DEFAULT_FALLBACK_TENANT_ID } from "@/lib/kene/fallback-catalog";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { unlockAudioContext } from "../client/ttsAudio";
import { syncOfflineSales } from "@/lib/pos/offline-queue";
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

export type ProNavCategory = "pilotage" | "clinique" | "commerce" | "relation" | "gestion" | "reglages";

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
  { id: "reglages", emoji: "⚙️", label: "Paramètres & Profil", shortLabel: "Paramètres" },
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

  // 3. Caisse, Stock & Commerce
  { id: "caisse", label: "Ventes & Caisse", icon: AbanIcon, hint: "Caisse POS · Commandes en ligne", category: "commerce" },
  { id: "stock", label: "Inventaire Stock", icon: KenteIcon, hint: "Produits, seuils d'alerte & réassort", category: "commerce" },
  { id: "catalogue", label: "Catalogue Soins", icon: DuafeIcon, hint: "Prestations, tarifs & cartes des soins", category: "commerce" },

  // 4. Relation & Fidélité
  { id: "crm", label: "CRM Clientes", icon: OsramIcon, hint: "Clientes, fiches & fidélité", category: "relation" },
  { id: "relances", label: "Relances", icon: BellRing, hint: "Suivi post-protocole & rappels", category: "relation" },
  { id: "assistant", label: "👑 Secrétaire IA", icon: Crown, hint: "Rappels WhatsApp 24/7 & Débriefing", category: "relation" },

  // 5. Gestion & Administration (Gérance / RH / Paie / Compta — strictly exclusive)
  { id: "equipe", label: "Équipe & Pointage", icon: NkonsonkonsonIcon, hint: "Personnel, planning & présences", category: "gestion" },
  { id: "paie", label: "Paie & Cotisations", icon: FihankraIcon, hint: "Bulletins CNPS · IPRES", category: "gestion" },
  { id: "compta", label: "Compta SYSCOHADA", icon: BaouleIcon, hint: "Bilan & Grand Livre OHADA", category: "gestion" },

  // 6. Paramètres & Configuration (Accès universel distinct)
  { id: "parametres", label: "Paramètres", icon: Settings, hint: "Profil, établissement & réglages", category: "reglages" },
];

const EMPLOYEE_SECTIONS: Record<string, ProSectionId[]> = {
  estheticienne: ["dossiers_peau", "diagnostic", "agenda", "assistant", "parametres"],
  dermo_conseillere: ["dossiers_peau", "diagnostic", "crm", "agenda", "relances", "assistant", "parametres"],
  coiffeuse: ["agenda", "diagnostic", "assistant", "parametres"],
  prothesiste_ongulaire: ["agenda", "diagnostic", "assistant", "parametres"],
  masseuse: ["agenda", "diagnostic", "assistant", "parametres"],
  caissiere: ["caisse", "catalogue", "stock", "assistant", "parametres"],
  receptionniste: ["agenda", "caisse", "crm", "relances", "assistant", "parametres"],
  responsable_stock: ["stock", "catalogue", "assistant", "parametres"],
  manager: ["dashboard", "dossiers_peau", "diagnostic", "assistant", "agenda", "caisse", "crm", "relances", "equipe", "catalogue", "stock", "parametres"],
  apprentie: ["dossiers_peau", "diagnostic", "agenda", "assistant", "parametres"],
};

/**
 * Résolution dynamique des intitulés et emojis de pôles métiers.
 * Adapte automatiquement le libellé pour chaque collaboratrice selon les modules autorisés :
 * ex: si une esthéticienne n'a pas accès à la caisse mais au stock, le pôle s'intitule "Stock & Soins" (📦)
 * et JAMAIS "Caisse & Stock" ni "Caisse & Commerce" (💳) pour éviter toute confusion.
 */
export function resolveCategoryDef(
  baseCat: ProNavCategoryDef,
  itemsInCat: ProNavItem[],
  isOwner: boolean
): ProNavCategoryDef {
  const itemIds = new Set(itemsInCat.map((i) => i.id));

  // 1. Pôle Commerce, Caisse & Stock
  if (baseCat.id === "commerce") {
    const hasCaisse = itemIds.has("caisse");
    const hasStock = itemIds.has("stock");
    const hasCatalogue = itemIds.has("catalogue");

    if (hasCaisse && (hasStock || hasCatalogue)) {
      return {
        id: "commerce",
        emoji: "💳",
        label: "Caisse & Stock",
        shortLabel: "Caisse & Stock",
      };
    }
    if (hasCaisse && !hasStock && !hasCatalogue) {
      return {
        id: "commerce",
        emoji: "💳",
        label: "Ventes & Caisse POS",
        shortLabel: "Caisse POS",
      };
    }
    if (!hasCaisse && hasStock && hasCatalogue) {
      return {
        id: "commerce",
        emoji: "📦",
        label: "Stock & Prestations",
        shortLabel: "Stock & Soins",
      };
    }
    if (!hasCaisse && hasStock && !hasCatalogue) {
      return {
        id: "commerce",
        emoji: "📦",
        label: "Inventaire du Stock",
        shortLabel: "Stock",
      };
    }
    if (!hasCaisse && !hasStock && hasCatalogue) {
      return {
        id: "commerce",
        emoji: "🛍️",
        label: "Catalogue des Soins",
        shortLabel: "Catalogue Soins",
      };
    }
  }

  // 2. Pôle Cabine & Clinique
  if (baseCat.id === "clinique") {
    const hasAgenda = itemIds.has("agenda");
    const hasDiagOrDossier = itemIds.has("diagnostic") || itemIds.has("dossiers_peau");
    if (hasAgenda && !hasDiagOrDossier) {
      return {
        id: "clinique",
        emoji: "📅",
        label: "Agenda & Rendez-vous",
        shortLabel: "Agenda",
      };
    }
    if (!hasAgenda && hasDiagOrDossier) {
      return {
        id: "clinique",
        emoji: "🔬",
        label: "Diagnostics Cutanés",
        shortLabel: "Diagnostics",
      };
    }
  }

  // 3. Pôle Relation & Clientes
  if (baseCat.id === "relation") {
    const hasAssistant = itemIds.has("assistant");
    const hasCrmOrRelances = itemIds.has("crm") || itemIds.has("relances");
    if (!hasAssistant && hasCrmOrRelances) {
      return {
        id: "relation",
        emoji: "👥",
        label: "Relation & Suivi Clientes",
        shortLabel: "Clientes",
      };
    }
    if (hasAssistant && !hasCrmOrRelances) {
      return {
        id: "relation",
        emoji: "👑",
        label: "Secrétaire IA de Direction",
        shortLabel: "Secrétaire IA",
      };
    }
  }

  // 4. Pôle Gestion & Administration
  if (baseCat.id === "gestion") {
    const hasPaieOrCompta = itemIds.has("paie") || itemIds.has("compta");
    const hasEquipe = itemIds.has("equipe");
    if (!hasPaieOrCompta && hasEquipe) {
      return {
        id: "gestion",
        emoji: "👥",
        label: "Équipe & Présences",
        shortLabel: "Équipe",
      };
    }
  }

  // 5. Pôle Paramètres & Profil
  if (baseCat.id === "reglages") {
    if (isOwner) {
      return {
        id: "reglages",
        emoji: "⚙️",
        label: "Institut & Paramètres",
        shortLabel: "Paramètres",
      };
    } else {
      return {
        id: "reglages",
        emoji: "⚙️",
        label: "Mon Profil & Paramètres",
        shortLabel: "Mon Profil",
      };
    }
  }

  return baseCat;
}

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
  const [assistantNonce, setAssistantNonce] = useState(0);

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
    () => {
      const params = new URLSearchParams();
      if (proTenantId) params.set("tenantId", proTenantId);
      if (sessionUser?.id) params.set("userId", sessionUser.id);
      const qs = params.toString();
      return apiGet<ProOverview>(`/api/pro/overview${qs ? `?${qs}` : ""}`);
    },
    [proTenantId, sessionUser?.id],
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
              onClick={() => {
                setSpace("client");
                if (typeof window !== "undefined") {
                  window.location.href = "/?mode=pro";
                }
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl k-btn-gold text-sm font-bold text-primary-foreground shadow cursor-pointer hover:scale-[1.01] active:scale-[0.98] transition-all"
            >
              <LogIn size={16} />
              S&apos;identifier (Espace Gérante)
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
    if (realTenantId && !proTenantId) {
      setProTenantId(realTenantId);
    }
  }, [proTenantId, overview.data?.tenant?.id, sessionUser?.tenantId, setProTenantId]);

  // Synchronisation de la parure / couleur officielle de l'institut pour tous les écrans du salon (gérante + employées)
  useEffect(() => {
    const tenantTheme = (overview.data?.tenant as any)?.themeTier;
    if (tenantTheme) {
      applyTierThemeToDom(tenantTheme);
      const targetTid = overview.data?.tenant?.id || proTenantId;
      if (targetTid) {
        saveTenantTierTheme(targetTid, tenantTheme);
      }
    }
  }, [overview.data?.tenant, proTenantId]);

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
    proTenantId ||
    overview.data?.tenant?.id ||
    sessionUser?.tenantId ||
    DEFAULT_FALLBACK_TENANT_ID;

  const serverViewer = overview.data?.viewer;
  const employeeRole = serverViewer?.employeeRole ?? sessionUser?.employeeRole ?? null;
  const employeePermissions = serverViewer?.employeePermissions ?? sessionUser?.employeePermissions ?? null;
  const employeeName = serverViewer?.employeeName ?? sessionUser?.employeeName ?? null;
  const isEmployee =
    (serverViewer ? !serverViewer.isOwner : false) ||
    Boolean(employeeRole) ||
    (Array.isArray(employeePermissions) && employeePermissions.length > 0);

  // Normalisation des permissions avec rétro-compatibilité
  const normalizedPermissions = useMemo(() => {
    if (!employeePermissions) return null;
    const set = new Set(employeePermissions);
    // Si l'employée a "catalogue" hérité de l'ancien module groupé, lui ouvrir également "stock"
    if (set.has("catalogue") && !set.has("stock")) {
      set.add("stock");
    }
    return Array.from(set);
  }, [employeePermissions]);

  const allowedIds: ProSectionId[] | null = isEmployee
    ? normalizedPermissions && normalizedPermissions.length > 0
      ? ([...new Set([...normalizedPermissions, "parametres"])].filter(
          (id) => id !== "paie" && id !== "compta"
        ) as ProSectionId[])
      : employeeRole
      ? ([...new Set([...(EMPLOYEE_SECTIONS[employeeRole] ?? ["agenda", "diagnostic", "assistant"]), "parametres"])] as ProSectionId[])
      : (["agenda", "diagnostic", "assistant", "parametres"] as ProSectionId[])
    : null;

  const isOwner = sessionUser?.role === "admin" || (serverViewer ? serverViewer.isOwner : !isEmployee);

  useEffect(() => {
    if (!tid || !online) return;
    const timer = window.setTimeout(() => {
      const endpoints: string[] = [`/api/pro/overview?tenantId=${tid}`];
      if (!isEmployee || allowedIds?.includes("crm")) {
        endpoints.push(`/api/pro/clients?tenantId=${tid}`);
      }
      if (!isEmployee || allowedIds?.includes("catalogue")) {
        endpoints.push(`/api/pro/catalog?tenantId=${tid}`);
      }
      if (!isEmployee || allowedIds?.includes("stock")) {
        endpoints.push(`/api/pro/stock?tenantId=${tid}`);
      }
      if (!isEmployee || employeeRole === "manager") {
        endpoints.push(`/api/pro/employees?tenantId=${tid}`);
      }
      if (!isEmployee || allowedIds?.includes("caisse")) {
        endpoints.push(`/api/pro/sales?tenantId=${tid}`);
      }
      endpoints.forEach((ep) => {
        void apiGet(ep).catch(() => {});
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [tid, online, isEmployee, allowedIds, employeeRole]);

  // Reprise & Resynchronisation automatique dès le retour du réseau (zéro fermeture d'application nécessaire)
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      return;
    }
    // Exécuter la synchronisation uniquement si l'on revient d'une coupure réseau effective
    if (!wasOfflineRef.current) return;
    wasOfflineRef.current = false;

    haptic(HAPTIC.success);
    void refetchRef.current?.();
    setRefreshKey((k) => k + 1);
    void syncOfflineSales(tid).then((res) => {
      if (res.syncedCount > 0) {
        toast.success(`${res.syncedCount} encaissement(s) hors-ligne synchronisé(s) !`);
        void refetchRef.current?.();
        setRefreshKey((k) => k + 1);
      }
    });
  }, [online, tid]);

  // Pointage collaboratrice (auto-pointage en 1 clic pour le personnel)
  const [staffAttendance, setStaffAttendance] = useState<{
    id: string;
    checkIn?: string | null;
    checkOut?: string | null;
    status: string;
    hours?: number | null;
  } | null>(null);
  const [staffEmployee, setStaffEmployee] = useState<{ id: string; name: string; role: string } | null>(null);
  const [attendanceBusy, setAttendanceBusy] = useState(false);

  const loadAttendance = useCallback(async () => {
    if (!tid) return;
    try {
      const uId = useKene.getState().user?.id;
      const params = new URLSearchParams({ tenantId: tid });
      if (uId) params.set("userId", uId);
      const res = await apiGet<{
        attendance: { id: string; checkIn?: string | null; checkOut?: string | null; status: string; hours?: number | null } | null;
        employee: { id: string; name: string; role: string } | null;
      }>(`/api/pro/employees/attendance?${params.toString()}`);
      if (res?.employee) {
        setStaffEmployee(res.employee);
        setStaffAttendance(res.attendance);
      }
    } catch {}
  }, [tid]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  const handleSelfPointage = async (action: "in" | "out") => {
    if (!staffEmployee) return;
    setAttendanceBusy(true);
    try {
      haptic(HAPTIC.success);
      const res = await apiPost<{
        attendance: { id: string; checkIn?: string | null; checkOut?: string | null; status: string; hours?: number | null };
      }>("/api/pro/employees/attendance", {
        employeeId: staffEmployee.id,
        action,
      });
      setStaffAttendance(res.attendance);
      toast.success(
        action === "in"
          ? `Pointage d'arrivée enregistré (${res.attendance.checkIn || "OK"}). Bonne journée !`
          : `Pointage de sortie enregistré (${res.attendance.checkOut || "OK"}). ${res.attendance.hours || 0}h travaillées.`
      );
    } catch (e: any) {
      toast.error(e?.message || "Erreur de pointage");
    } finally {
      setAttendanceBusy(false);
    }
  };

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

  // Synchronisation en temps réel des droits employés servis par le serveur
  useEffect(() => {
    const v = overview.data?.viewer;
    if (!v) return;
    const current = useKene.getState().user;
    if (!current) return;

    const vRole = v.employeeRole ?? null;
    const vName = v.employeeName ?? null;
    const vPerms = v.employeePermissions ? [...v.employeePermissions].sort() : null;

    const sRole = current.employeeRole ?? null;
    const sName = current.employeeName ?? null;
    const sPerms = current.employeePermissions ? [...current.employeePermissions].sort() : null;

    const roleDiff = vRole !== sRole;
    const nameDiff = vName !== sName;
    const permsDiff = JSON.stringify(vPerms) !== JSON.stringify(sPerms);
    const userNameDiff = Boolean(vName && current.name !== vName);

    if (roleDiff || nameDiff || permsDiff || userNameDiff) {
      useKene.getState().setUser({
        ...current,
        name: vName || current.name,
        employeeRole: vRole,
        employeePermissions: v.employeePermissions ?? null,
        employeeName: vName,
      });
    }
  }, [overview.data?.viewer]);

  const openSection = (s: ProSectionId) => {
    if (allowedIds && !allowedIds.includes(s) && s !== "parametres") {
      toast.error("Module réservé", { description: "Cette section ne fait pas partie de vos attributions." });
      return;
    }
    if (s === "assistant") {
      try {
        unlockAudioContext();
      } catch {}
      setAssistantNonce((n) => n + 1);
    }
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
      setSection("stock");
      return;
    }
    if (s === "catalogue") {
      setCatalogTab("products");
      setSection("catalogue");
      return;
    }
    if (s === "promos") {
      if (!isOwner && employeeRole !== "manager") {
        toast.error("Accès réservé", { description: "Les codes promo sont réservés à la gérance." });
        return;
      }
      setCatalogTab("promos");
      setSection("catalogue");
      return;
    }
    if (s === "abonnement") {
      if (!isOwner) {
        toast.error("Accès réservé", { description: "L'abonnement de l'institut est géré par la fondatrice." });
        return;
      }
      setSettingsTab("subscription");
      setSection("parametres");
      return;
    }
    setSection(s);
  };

  const agendaBadge = Math.max(0, (live?.pendingAppts ?? 0) - agendaSeen);
  const navBadges: Partial<Record<ProSectionId, number>> = agendaBadge > 0 ? { agenda: agendaBadge } : {};

  const filteredNav = allowedIds ? NAV.filter((n) => allowedIds.includes(n.id)) : NAV;
  const nav = filteredNav.length > 0 ? filteredNav : NAV;
  const activeSection: ProSectionId =
    allowedIds && (!allowedIds.includes(section) || !nav.some((n) => n.id === section))
      ? (nav[0]?.id ?? "diagnostic")
      : section;

  const availableCategories = useMemo(
    () =>
      PRO_NAV_CATEGORIES.filter((cat) => nav.some((i) => i.category === cat.id)).map((cat) => {
        const catItems = nav.filter((i) => i.category === cat.id);
        return resolveCategoryDef(cat, catItems, isOwner);
      }),
    [nav, isOwner]
  );
  const activeNavItem = nav.find((i) => i.id === activeSection) ?? nav[0];
  const activeCategory: ProNavCategory = activeNavItem?.category ?? "pilotage";
  const activeCategoryItems = nav.filter((i) => i.category === activeCategory);
  const activeCategoryDef = useMemo(() => {
    const base = PRO_NAV_CATEGORIES.find((c) => c.id === activeCategory) ?? PRO_NAV_CATEGORIES[0];
    return resolveCategoryDef(base, activeCategoryItems, isOwner);
  }, [activeCategory, activeCategoryItems, isOwner]);

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

  useEffect(() => {
    if (!tid) return;
    syncActiveTierTheme({
      user: useKene.getState().user,
      tenantId: tid,
      planId: tenant?.plan,
    });
  }, [tid, tenant?.plan]);

  const handleTenantSwitch = (v: string) => {
    if (v === "__create_branch__") {
      setCreateBranchOpen(true);
    } else {
      healedRef.current = false;
      setProTenantId(v);
      const currentStoreUser = useKene.getState().user;
      if (currentStoreUser) {
        useKene.getState().setUser({ ...currentStoreUser, tenantId: v, selectedTenantId: v });
        void apiPost("/api/auth/profile", { userId: currentStoreUser.id, selectedTenantId: v }).catch(() => {});
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
  };

  const isAdmin = sessionUser?.role === "admin";
  const proOwner = isOwner ? sessionUser : null;
  const isGeneric = (n?: string | null) =>
    !n ||
    n.trim() === "" ||
    n === "Nouvelle cliente" ||
    n === "Nouvelle invitée" ||
    n.startsWith("Membre ") ||
    n.includes("??") ||
    n === "estheticienne" ||
    n === "collaboratrice";

  const chipName =
    sessionUser?.name && !isGeneric(sessionUser.name)
      ? sessionUser.name.trim()
      : employeeName && !isGeneric(employeeName)
      ? employeeName.trim()
      : sessionUser?.name && sessionUser.name.trim()
      ? sessionUser.name.trim()
      : isOwner
      ? "Gérante"
      : "Collaboratrice";

  const chipRole = isAdmin
    ? "👑 Patronne / Admin"
    : employeeRole
    ? formatRole(employeeRole)
    : isOwner
      ? "Fondatrice / Gérante"
      : "Collaboratrice";

  const chipInitials =
    (chipName || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => (w[0] ? w[0].toUpperCase() : ""))
      .join("") || (isOwner ? "GP" : "CO");

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
                onValueChange={handleTenantSwitch}
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

            {staffEmployee && (
              <div className="hidden md:flex items-center shrink-0">
                {!staffAttendance?.checkIn ? (
                  <button
                    type="button"
                    onClick={() => handleSelfPointage("in")}
                    disabled={attendanceBusy}
                    className="h-8 px-3 rounded-full text-xs font-bold bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-600/40 flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer"
                    title="Enregistrer mon heure d'arrivée au salon"
                  >
                    <LogIn size={13} className="text-emerald-600 dark:text-emerald-400" />
                    <span>Pointer mon arrivée</span>
                  </button>
                ) : !staffAttendance?.checkOut ? (
                  <button
                    type="button"
                    onClick={() => handleSelfPointage("out")}
                    disabled={attendanceBusy}
                    className="h-8 px-3 rounded-full text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer"
                    title="Enregistrer mon départ du salon"
                  >
                    <LogOut size={13} className="text-amber-600 dark:text-amber-400" />
                    <span>Arrivée {staffAttendance.checkIn} · Pointer sortie</span>
                  </button>
                ) : (
                  <span
                    className="h-8 px-3 rounded-full text-[11px] font-bold bg-muted/70 text-muted-foreground border border-border flex items-center gap-1.5"
                    title={`Pointage effectué aujourd'hui : ${staffAttendance.checkIn} → ${staffAttendance.checkOut} (${staffAttendance.hours || 0}h)`}
                  >
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    <span>Pointé ({staffAttendance.checkIn} → {staffAttendance.checkOut})</span>
                  </span>
                )}
              </div>
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

            {/* Bouton direct Paramètres dans le Header (Accès instantané universel) */}
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                openSection("parametres");
              }}
              aria-label="Ouvrir les paramètres"
              title={isOwner ? "Paramètres de l'établissement & Direction" : "Mon espace collaboratrice & réglages"}
              className={cn(
                "grid place-items-center size-8 sm:size-9 rounded-full transition-all active:scale-95 shrink-0 border cursor-pointer",
                activeSection === "parametres"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-muted/40 border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Settings className="size-4" />
            </button>

            {/* Profil utilisateur cliquable (ouvre directement les paramètres) */}
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                openSection("parametres");
              }}
              title={`Connecté : ${chipName}${sessionUser?.phone ? ` (${sessionUser.phone})` : ""} · Cliquez pour ouvrir vos réglages`}
              className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-border/60 shrink-0 text-left cursor-pointer hover:opacity-85 transition-opacity"
            >
              <span
                aria-hidden="true"
                className="k-glow-gold relative grid size-7 sm:size-8 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[10px] sm:text-[11px] font-bold text-[#FFF9EC] shrink-0 overflow-hidden"
              >
                {sessionUser?.id ? (
                  <img
                    src={`/api/media/user/${sessionUser.id}`}
                    alt=""
                    className="size-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                ) : null}
                <span>{chipInitials}</span>
              </span>
              <div className="flex flex-col text-left leading-tight min-w-0">
                <p className="text-[11px] sm:text-xs font-bold text-foreground truncate max-w-[85px] xs:max-w-[110px] sm:max-w-[150px]">
                  {chipName}
                </p>
                <Eyebrow className="mt-0.5 text-[8px] sm:text-[9px] truncate max-w-[85px] xs:max-w-[110px] sm:max-w-[150px]">
                  {chipRole}
                </Eyebrow>
              </div>
            </button>
          </div>
        </div>

        {/* Sous-bandeau mobile uniquement (< md) */}
        <div className="md:hidden border-t border-border/40 px-3 py-2 space-y-2">
          {/* Badge d'identification Collaboratrice cliquable vers ses réglages (Mobile < md) */}
          {isEmployee && (
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                openSection("parametres");
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-gold/10 border border-gold/30 shadow-2xs text-left active:scale-[0.99] transition-transform cursor-pointer"
              title="Toucher pour ouvrir mes réglages"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="relative grid size-6 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-white text-[10px] font-bold shrink-0 overflow-hidden">
                  {sessionUser?.id ? (
                    <img
                      src={`/api/media/user/${sessionUser.id}`}
                      alt=""
                      className="size-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : null}
                  <span>{chipInitials}</span>
                </span>
                <div className="truncate text-left leading-tight">
                  <span className="text-xs font-bold text-foreground truncate block">{chipName}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold">{chipRole} · {tenant?.name ?? "Institut"}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  En poste
                </span>
                <Settings size={12} className="text-muted-foreground" />
              </div>
            </button>
          )}
          {(tenantOptions.length > 1 || proOwner) && (
            <div className="sm:hidden">
              <Select
                value={tid || undefined}
                onValueChange={handleTenantSwitch}
                disabled={tenantOptions.length <= 1 && !proOwner && !isAdmin}
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

          {/* Pointage Mobile Collaboratrice */}
          {staffEmployee && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-card/90 border border-border shadow-2xs">
              <span className="text-[11px] font-bold text-foreground truncate">
                Pointage · {staffEmployee?.name ? staffEmployee.name.split(" ")[0] : "Collaboratrice"}
              </span>
              {!staffAttendance?.checkIn ? (
                <button
                  type="button"
                  onClick={() => handleSelfPointage("in")}
                  disabled={attendanceBusy}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-bold bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-600/40 flex items-center gap-1 active:scale-95 cursor-pointer shadow-2xs"
                >
                  <LogIn size={12} className="text-emerald-600 dark:text-emerald-400" />
                  <span>Pointer arrivée</span>
                </button>
              ) : !staffAttendance?.checkOut ? (
                <button
                  type="button"
                  onClick={() => handleSelfPointage("out")}
                  disabled={attendanceBusy}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 flex items-center gap-1 active:scale-95 cursor-pointer shadow-2xs"
                >
                  <LogOut size={12} className="text-amber-600 dark:text-amber-400" />
                  <span>Pointer sortie ({staffAttendance.checkIn})</span>
                </button>
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  {staffAttendance.checkIn} → {staffAttendance.checkOut} ({staffAttendance.hours || 0}h)
                </span>
              )}
            </div>
          )}

          {/* ⚡ Outils Cabine Express (Mobile < md) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {(!allowedIds || allowedIds.includes("diagnostic")) && (
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  openSection("diagnostic");
                }}
                className="h-7.5 px-2.5 rounded-xl border border-primary/40 bg-primary/10 text-primary text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs active:scale-95 transition-all"
              >
                <ScanFace size={13} />
                <span>📸 Scan Cabine</span>
              </button>
            )}
            {(!allowedIds || allowedIds.includes("caisse")) && (
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  openSection("caisse");
                }}
                className="h-7.5 px-2.5 rounded-xl border border-emerald-600/40 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs active:scale-95 transition-all"
              >
                <AbanIcon size={13} />
                <span>💳 Caisse POS</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                haptic(HAPTIC.tap);
                setInciScannerOpen(true);
              }}
              className="h-7.5 px-2.5 rounded-xl border border-gold/40 bg-gold/15 text-gold-text text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs active:scale-95 transition-all"
            >
              <ShieldAlert size={13} />
              <span>🧴 INCI</span>
            </button>
            {(!allowedIds || allowedIds.includes("diagnostic")) && (
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  setMirrorKioskOpen(true);
                }}
                className="h-7.5 px-2.5 rounded-xl border border-border bg-card text-foreground text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs active:scale-95 transition-all"
              >
                <Sparkles size={13} />
                <span>🪞 Miroir</span>
              </button>
            )}
            {(!allowedIds || allowedIds.includes("dossiers_peau")) && (
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  openSection("dossiers_peau");
                }}
                className="h-7.5 px-2.5 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs active:scale-95 transition-all"
              >
                <FolderHeart size={13} />
                <span>Dossiers</span>
              </button>
            )}
          </div>

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
            {(!allowedIds || allowedIds.includes("diagnostic")) && (
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  openSection("diagnostic");
                }}
                className="h-8.5 px-3 rounded-xl border border-primary/45 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-black flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                title="Lancer un diagnostic de peau multi-vues en cabine"
              >
                <ScanFace size={13} />
                <span>📸 Scan Cabine</span>
              </button>
            )}

            {(!allowedIds || allowedIds.includes("caisse")) && (
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  openSection("caisse");
                }}
                className="h-8.5 px-3 rounded-xl border border-emerald-600/50 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white text-[11px] font-black flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                title="Ouvrir la caisse et enregistrer un encaissement"
              >
                <AbanIcon size={13} />
                <span>💳 Encaisser POS</span>
              </button>
            )}

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

            {(!allowedIds || allowedIds.includes("diagnostic")) && (
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  setMirrorKioskOpen(true);
                }}
                className="h-8.5 px-3 rounded-xl border border-border bg-card hover:bg-accent text-foreground text-[11px] font-black flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                title="Ouvrir le Mode Kiosque Tablette Salle d'Attente (Kènè Mirror)"
              >
                <Sparkles size={13} />
                <span>🪞 Kiosque Mirror</span>
              </button>
            )}

            {(!allowedIds || allowedIds.includes("dossiers_peau")) && (
              <button
                type="button"
                onClick={() => {
                  haptic(HAPTIC.tap);
                  openSection("dossiers_peau");
                }}
                className="h-8.5 px-3 rounded-xl border border-border/80 bg-card/80 hover:bg-accent text-muted-foreground hover:text-foreground text-[11px] font-bold flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
                title="Accéder aux dossiers cutanés et historiques"
              >
                <FolderHeart size={13} />
                <span>Dossiers</span>
              </button>
            )}
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

          {/* Identification Employée / Collaboratrice dans le menu latéral */}
          {sidebarExpanded && isEmployee && (
            <div className="mx-2.5 mt-1.5 mb-2 p-2.5 rounded-xl bg-gold/10 border border-gold/25 flex items-center gap-2 shadow-2xs">
              <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-[#FFF9EC] text-xs font-black shrink-0 shadow-xs">
                {chipInitials}
              </span>
              <div className="min-w-0 flex-1 text-left leading-tight">
                <p className="text-xs font-bold text-foreground truncate">{chipName}</p>
                <p className="text-[10px] text-gold-text font-semibold truncate">{chipRole}</p>
              </div>
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
            {staffEmployee && (
              <div className="hidden md:flex items-center shrink-0">
                {!staffAttendance?.checkIn ? (
                  <button
                    type="button"
                    onClick={() => handleSelfPointage("in")}
                    disabled={attendanceBusy}
                    className="h-8 px-3 rounded-full text-xs font-bold bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-600/40 flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer"
                    title="Enregistrer mon heure d'arrivée au salon"
                  >
                    <LogIn size={13} className="text-emerald-600 dark:text-emerald-400" />
                    <span>Pointer mon arrivée</span>
                  </button>
                ) : !staffAttendance?.checkOut ? (
                  <button
                    type="button"
                    onClick={() => handleSelfPointage("out")}
                    disabled={attendanceBusy}
                    className="h-8 px-3 rounded-full text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer"
                    title="Enregistrer mon départ du salon"
                  >
                    <LogOut size={13} className="text-amber-600 dark:text-amber-400" />
                    <span>Arrivée {staffAttendance.checkIn} · Pointer sortie</span>
                  </button>
                ) : (
                  <span
                    className="h-8 px-3 rounded-full text-[11px] font-bold bg-muted/70 text-muted-foreground border border-border flex items-center gap-1.5"
                    title={`Pointage effectué aujourd'hui : ${staffAttendance.checkIn} → ${staffAttendance.checkOut} (${staffAttendance.hours || 0}h)`}
                  >
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    <span>Pointé ({staffAttendance.checkIn} → {staffAttendance.checkOut})</span>
                  </span>
                )}
              </div>
            )}

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
              <DashboardSection
                tenantId={tid}
                overview={overview}
                loadingOverview={overview.loading}
                onNavigate={openSection}
                onOpenInciScanner={() => setInciScannerOpen(true)}
                onOpenMirrorKiosk={() => setMirrorKioskOpen(true)}
              />
            )}
            {activeSection === "assistant" && (
              <AssistantSection
                tenantId={tid}
                tenantName={tenant?.name ?? "Institut"}
                userName={chipName}
                userRole={employeeRole || (isOwner ? "gerante" : "collaboratrice")}
                isOwner={isOwner}
                allowedSections={allowedIds ?? undefined}
                tenantPlan={tenant?.plan || "trial"}
                onNavigate={openSection}
                refreshKey={refreshKey}
                overview={overview.data}
                live={live}
                assistantNonce={assistantNonce}
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
            {(activeSection === "catalogue" || activeSection === "stock" || activeSection === "promos") && (() => {
              const canViewCatalogue = !allowedIds || allowedIds.includes("catalogue");
              const canViewStock = !allowedIds || allowedIds.includes("stock");
              const canViewPromos = isOwner || employeeRole === "manager";
              const subTabCount = [canViewCatalogue, canViewStock, canViewPromos].filter(Boolean).length;

              const effectiveTab: "products" | "stock" | "promos" =
                activeSection === "stock" && canViewStock
                  ? "stock"
                  : activeSection === "catalogue" && canViewCatalogue
                  ? "products"
                  : activeSection === "promos" && canViewPromos
                  ? "promos"
                  : canViewCatalogue && catalogTab === "products"
                  ? "products"
                  : canViewStock && catalogTab === "stock"
                  ? "stock"
                  : canViewStock
                  ? "stock"
                  : canViewCatalogue
                  ? "products"
                  : "products";

              return (
                <div className="space-y-4">
                  {subTabCount > 1 && (
                    <div className="flex items-center gap-2 border-b border-border/60 pb-3 overflow-x-auto no-scrollbar">
                      {canViewCatalogue && (
                        <button
                          type="button"
                          onClick={() => openSection("catalogue")}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 cursor-pointer",
                            effectiveTab === "products"
                              ? "k-btn-gold text-primary-foreground shadow-sm"
                              : "k-chip text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <DuafeIcon size={15} />
                          <span>Catalogue & Soins</span>
                        </button>
                      )}
                      {canViewStock && (
                        <button
                          type="button"
                          onClick={() => openSection("stock")}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 cursor-pointer",
                            effectiveTab === "stock"
                              ? "k-btn-gold text-primary-foreground shadow-sm"
                              : "k-chip text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <KenteIcon size={15} />
                          <span>Inventaire Stock</span>
                        </button>
                      )}
                      {canViewPromos && (
                        <button
                          type="button"
                          onClick={() => openSection("promos")}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all shrink-0 cursor-pointer",
                            effectiveTab === "promos"
                              ? "k-btn-gold text-primary-foreground shadow-sm"
                              : "k-chip text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <TicketPercent size={15} />
                          <span>Codes Promo & Réductions</span>
                        </button>
                      )}
                    </div>
                  )}
                  {effectiveTab === "products" && <CatalogSection tenantId={tid} />}
                  {effectiveTab === "stock" && <StockSection tenantId={tid} onNavigate={openSection} />}
                  {effectiveTab === "promos" && canViewPromos && (
                    <CouponsSection tenantId={tid} tenantName={tenant?.name ?? "Institut"} />
                  )}
                </div>
              );
            })()}
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
                    <span>{isOwner ? "Institut & Établissement" : "Mon Profil & Paramètres"}</span>
                  </button>
                  {isOwner && (
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
                  )}
                </div>
                {settingsTab === "settings" || !isOwner ? (
                  <SettingsSection
                    tenantId={tid}
                    tenantName={tenant?.name ?? "Institut"}
                    tenantCity={tenant?.city}
                    onNavigate={openSection}
                    staffAttendance={staffAttendance}
                    onPointage={handleSelfPointage}
                    attendanceBusy={attendanceBusy}
                  />
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

      {(!allowedIds || allowedIds.includes("assistant")) && (
        <button
          type="button"
          onClick={() => {
            try {
              unlockAudioContext();
            } catch {}
            openSection("assistant");
          }}
          className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-gradient-to-tr from-[#C8951E] to-[#E07A2B] text-[#16110D] shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all ring-4 ring-black/40 group cursor-pointer"
          aria-label="Ouvrir la Secrétaire IA de Direction"
          title="Secrétaire IA de Direction (Débriefing 1 clic)"
        >
          <Crown size={26} className="group-hover:rotate-12 transition-transform" />
        </button>
      )}

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
