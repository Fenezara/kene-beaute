"use client";
// Kènè Pro — Caisse POS: catalogue cliquable, ticket, paiement mobile money, ticket thermique imprimable
import { useMemo, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, MessageCircle, Minus, Plus, Printer, ReceiptText, Search, Trash2, Wallet, User, UserRoundPlus, Sparkles, X, Bluetooth, Share2, WifiOff, RefreshCw, Lock, CalendarCheck, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/kene/api";
import { xof, formatDate, formatTime } from "@/lib/kene/format";
import { splitTVA } from "@/lib/accounting/syscohada";
import { openThermalPrintWindow, ThermalFormat } from "@/lib/accounting/receipt-thermal";
import { openCashClosurePrintWindow, CashClosureData } from "@/lib/hardware/cash-closure-ticket";
import { getTenantPosSettings, type TenantPosSettings } from "@/lib/kene/tenant-settings";
import { printDirectWebBluetooth } from "@/lib/hardware/bluetooth-escpos";
import { saveOfflineSale, getPendingOfflineSales, syncOfflineSales, isNetworkOnline } from "@/lib/pos/offline-queue";
import { openWhatsApp, buildWhatsAppReceiptMessage } from "@/lib/kene/whatsapp-relay";
import {
  SERVICE_CATEGORIES,
  PRODUCT_CATEGORIES,
  getServiceCategoryMeta,
  getProductCategoryMeta,
  getCategoryToneBadgeClass,
} from "@/lib/kene/catalog-taxonomy";
import { useApi } from "./useApi";
import { EmptyState, ErrorState, KenteTop, SectionHeader } from "./ui-bits";
import { DEFAULT_FALLBACK_CATALOG, DEFAULT_FALLBACK_CLIENTS, DEFAULT_FALLBACK_TEAM } from "@/lib/kene/fallback-catalog";
import type { EmployeesResponse, PaymentMethod, ProCatalog, ProClient, ProSale, SalesResponse } from "./types";

interface TicketLine {
  kind: "service" | "product";
  id: string;
  label: string;
  unitPrice: number;
  qty: number;
}

const PAY_METHODS: { code: PaymentMethod; label: string; cls: string }[] = [
  { code: "wave", label: "Wave", cls: "bg-[#1DC8FF] text-[#062A33] hover:brightness-95" },
  { code: "orange", label: "Orange Money", cls: "bg-[#FF7900] text-[#3A1D00] hover:brightness-95" },
  { code: "cash", label: "Espèces", cls: "bg-success text-success-foreground hover:brightness-95" },
  { code: "card", label: "Carte", cls: "bg-finance text-finance-foreground hover:brightness-95" },
];

const METHOD_LABELS: Record<string, string> = { wave: "Wave", orange: "Orange Money", cash: "Espèces", card: "Carte bancaire", wallet: "Wallet Kènè" };

export function PosSection({
  tenantId,
  tenantName,
  tenantCity,
  tenantPhone,
  refreshKey = 0,
}: {
  tenantId: string;
  tenantName: string;
  tenantCity?: string;
  tenantPhone?: string;
  refreshKey?: number;
}) {
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [discountInput, setDiscountInput] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ticket, setTicket] = useState<ProSale | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [thermalFormat, setThermalFormat] = useState<ThermalFormat>("80mm");

  // Préférences fiscales & modes de paiement configurés par la Patronne
  const [posSettings, setPosSettings] = useState<TenantPosSettings>(() => getTenantPosSettings(tenantId));

  useEffect(() => {
    setPosSettings(getTenantPosSettings(tenantId));
    const handleSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tenantId || detail.tenantId === tenantId) {
        setPosSettings(getTenantPosSettings(tenantId));
      }
    };
    window.addEventListener("kene:tenant-settings-changed", handleSettingsChanged);
    return () => {
      window.removeEventListener("kene:tenant-settings-changed", handleSettingsChanged);
    };
  }, [tenantId]);

  const availablePayMethods = useMemo(() => {
    return PAY_METHODS.filter((m) => posSettings.allowedPaymentMethods[m.code as keyof typeof posSettings.allowedPaymentMethods] ?? true);
  }, [posSettings.allowedPaymentMethods]);

  // Passerelle RDV ↔ Caisse & Attribution Praticienne
  const [practitionerName, setPractitionerName] = useState<string>("");
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(null);
  const [depositDeducted, setDepositDeducted] = useState<number>(0);

  // Clôture de caisse journalière (Rapport Z)
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureSubmitting, setClosureSubmitting] = useState(false);
  const [closureInitialCash, setClosureInitialCash] = useState<string>("25000");
  const [closureCountedCash, setClosureCountedCash] = useState<string>("");
  const [closureNotes, setClosureNotes] = useState<string>("");
  const [closureResponsible, setClosureResponsible] = useState<string>("Responsable caisse");
  const [closureData, setClosureData] = useState<any>(null);

  // Cliente express — mode saisie allégé (2 champs) pour les praticiennes peu administratives
  const [expressOpen, setExpressOpen] = useState(false);
  const [expressName, setExpressName] = useState("");
  const [expressPhone, setExpressPhone] = useState("");
  const [expressBusy, setExpressBusy] = useState(false);

  // Matériel & Résilience réseau
  const [bluetoothPrinting, setBluetoothPrinting] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [syncingOffline, setSyncingOffline] = useState(false);

  const catalog = useApi<ProCatalog>(
    () => (tenantId ? apiGet<ProCatalog>(`/api/pro/catalog?tenantId=${tenantId}`) : Promise.resolve(DEFAULT_FALLBACK_CATALOG)),
    [tenantId],
    { cacheKey: `kene_pro_catalog_${tenantId || "default"}`, fallbackData: DEFAULT_FALLBACK_CATALOG }
  );
  const clients = useApi<ProClient[]>(
    () => (tenantId ? apiGet<{ clients: ProClient[] }>(`/api/pro/clients?tenantId=${tenantId}`).then((r) => r.clients ?? []) : Promise.resolve(DEFAULT_FALLBACK_CLIENTS)),
    [tenantId],
    { cacheKey: `kene_pro_clients_${tenantId || "default"}`, fallbackData: DEFAULT_FALLBACK_CLIENTS }
  );
  const sales = useApi<SalesResponse>(
    () => (tenantId ? apiGet<SalesResponse>(`/api/pro/sales?tenantId=${tenantId}`) : Promise.resolve({ sales: [] })),
    [tenantId, refreshKey],
    { cacheKey: `kene_pro_sales_${tenantId || "default"}` }
  );

  const team = useApi<EmployeesResponse>(
    () => (tenantId ? apiGet<EmployeesResponse>(`/api/pro/employees?tenantId=${tenantId}`) : Promise.resolve(DEFAULT_FALLBACK_TEAM)),
    [tenantId],
    { cacheKey: `kene_pro_employees_${tenantId || "default"}`, fallbackData: DEFAULT_FALLBACK_TEAM }
  );

  const todayAppointments = useApi<{ appointments: any[] }>(() => {
    if (!tenantId) return Promise.resolve({ appointments: [] });
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
    const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
    return apiGet<{ appointments: any[] }>(`/api/pro/appointments?tenantId=${tenantId}&from=${from}&to=${to}`);
  }, [tenantId, refreshKey]);

  const discount = Math.max(0, Math.min(Number(discountInput) || 0, 1_000_000));
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0), [lines]);
  const total = Math.max(0, subtotal - Math.min(discount, subtotal) - depositDeducted);

  // Organisation & Filtres du Catalogue POS
  const [posServiceCat, setPosServiceCat] = useState<string>("all");
  const [posProductCat, setPosProductCat] = useState<string>("all");
  const [posSearch, setPosSearch] = useState<string>("");

  const activeServices = useMemo(() => (catalog.data?.services ?? []).filter((s) => s.active), [catalog.data?.services]);
  const activeProducts = useMemo(() => (catalog.data?.products ?? []).filter((p) => p.active), [catalog.data?.products]);

  const allPosServiceCategories = useMemo(() => {
    const list = [...SERVICE_CATEGORIES];
    const existingIds = new Set(SERVICE_CATEGORIES.map((c) => c.id.toLowerCase()));
    for (const s of activeServices) {
      if (s.category && !existingIds.has(s.category.toLowerCase())) {
        existingIds.add(s.category.toLowerCase());
        list.push(getServiceCategoryMeta(s.category));
      }
    }
    return list;
  }, [activeServices]);

  const allPosProductCategories = useMemo(() => {
    const list = [...PRODUCT_CATEGORIES];
    const existingIds = new Set(PRODUCT_CATEGORIES.map((c) => c.id.toLowerCase()));
    for (const p of activeProducts) {
      if (p.category && !existingIds.has(p.category.toLowerCase())) {
        existingIds.add(p.category.toLowerCase());
        list.push(getProductCategoryMeta(p.category));
      }
    }
    return list;
  }, [activeProducts]);

  const serviceCatCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of activeServices) c[s.category] = (c[s.category] || 0) + 1;
    return c;
  }, [activeServices]);

  const productCatCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of activeProducts) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [activeProducts]);

  const filteredPosServices = useMemo(() => {
    let list = activeServices;
    if (posServiceCat !== "all") {
      list = list.filter((s) => s.category.toLowerCase() === posServiceCat.toLowerCase());
    }
    if (posSearch.trim()) {
      const q = posSearch.toLowerCase().trim();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.botanicals ?? "").toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeServices, posServiceCat, posSearch]);

  const filteredPosProducts = useMemo(() => {
    let list = activeProducts;
    if (posProductCat !== "all") {
      list = list.filter((p) => p.category.toLowerCase() === posProductCat.toLowerCase());
    }
    if (posSearch.trim()) {
      const q = posSearch.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.botanicals ?? "").toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeProducts, posProductCat, posSearch]);

  const getTicketQty = useCallback(
    (kind: "service" | "product", id: string) => {
      const found = lines.find((l) => l.kind === kind && l.id === id);
      return found ? found.qty : 0;
    },
    [lines]
  );

  const checkOfflineCount = useCallback(async () => {
    if (!tenantId) return;
    try {
      const pending = await getPendingOfflineSales(tenantId);
      setPendingOfflineCount(pending.length);
    } catch {
      // ignore
    }
  }, [tenantId]);

  const handleSyncOffline = useCallback(async () => {
    if (!tenantId || syncingOffline) return;
    setSyncingOffline(true);
    try {
      const res = await syncOfflineSales(tenantId);
      if (res.syncedCount > 0) {
        toast.success(`${res.syncedCount} vente(s) synchronisée(s) avec succès !`);
        void sales.refetch();
      }
      await checkOfflineCount();
    } catch {
      toast.error("Échec de la synchronisation hors-ligne");
    } finally {
      setSyncingOffline(false);
    }
  }, [tenantId, syncingOffline, checkOfflineCount, sales]);

  useEffect(() => {
    setOnline(isNetworkOnline());
    void checkOfflineCount();

    const onOnline = () => {
      setOnline(true);
      void handleSyncOffline();
    };
    const onOffline = () => {
      setOnline(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [checkOfflineCount, handleSyncOffline]);

  function addLine(kind: "service" | "product", id: string, label: string, unitPrice: number) {
    setLines((ls) => {
      const ex = ls.find((l) => l.kind === kind && l.id === id);
      if (ex) return ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { kind, id, label, unitPrice, qty: 1 }];
    });
  }
  function setQty(i: number, delta: number) {
    setLines((ls) =>
      ls.map((l, idx) => (idx === i ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  async function createExpressClient() {
    const name = expressName.trim().replace(/\s+/g, " ");
    const phone = expressPhone.trim();
    if (name.length < 2) {
      toast.error("Le nom est trop court");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      toast.error("Téléphone invalide — au moins 8 chiffres");
      return;
    }
    setExpressBusy(true);
    try {
      const r = await apiPost<{ client: ProClient; reused: boolean }>("/api/pro/clients", { tenantId, name, phone });
      setClientId(r.client.id);
      setExpressOpen(false);
      setExpressName("");
      setExpressPhone("");
      void clients.refetch();
      toast.success(
        r.reused
          ? `${r.client.name} existait déjà — fiche réutilisée`
          : `${r.client.name} ajoutée au carnet clientes`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setExpressBusy(false);
    }
  }

  const pendingAppointmentsToday = useMemo(() => {
    return (todayAppointments.data?.appointments ?? []).filter(
      (a: any) => a.status !== "completed" && a.status !== "cancelled"
    );
  }, [todayAppointments.data?.appointments]);

  function handleImportAppointment(appt: any) {
    if (appt.service?.id) {
      addLine("service", appt.service.id, appt.service.name, appt.service.price);
    }
    if (appt.clientProfile?.id) {
      setClientId(appt.clientProfile.id);
    }
    setLinkedAppointmentId(appt.id);
    if (appt.depositAmount > 0 && appt.depositStatus === "paid") {
      setDepositDeducted(appt.depositAmount);
    } else {
      setDepositDeducted(0);
    }
    if (appt.resource?.name) {
      setPractitionerName(appt.resource.name);
    }
    toast.success(`RDV de ${appt.clientName} importé ! ${appt.depositAmount > 0 ? `Acompte de ${xof(appt.depositAmount)} déduit.` : ""}`);
  }

  const loadClosureData = async () => {
    if (!tenantId) return;
    setClosureLoading(true);
    try {
      const res = await apiGet<any>(`/api/pro/sales/closure?tenantId=${tenantId}`);
      setClosureData(res);
    } catch {
      toast.error("Impossible de charger le bilan de caisse");
    } finally {
      setClosureLoading(false);
    }
  };

  const handleValidateClosure = async () => {
    if (!tenantId) return;
    const opening = Number(closureInitialCash) || 0;
    const counted = Number(closureCountedCash);
    if (isNaN(counted) || counted < 0) {
      toast.error("Veuillez saisir le montant physique compté dans le tiroir");
      return;
    }
    setClosureSubmitting(true);
    try {
      const res = await apiPost<{ success: boolean; closure: any }>("/api/pro/sales/closure", {
        tenantId,
        closedBy: closureResponsible.trim() || "Responsable caisse",
        openingCash: opening,
        countedCash: counted,
        notes: closureNotes.trim() || undefined,
      });
      toast.success("Rapport Z de clôture validé et archivé avec succès !");
      setClosureData((prev: any) => ({
        ...prev,
        pastClosures: [res.closure, ...(prev?.pastClosures ?? [])],
      }));
      openCashClosurePrintWindow(
        {
          tenantName,
          tenantCity: tenantCity || (tenantName.includes("Dakar") ? "Dakar" : "Abidjan"),
          tenantPhone: tenantPhone || undefined,
          closureDate: res.closure.closureDate,
          closedBy: res.closure.closedBy,
          openingCash: res.closure.openingCash,
          cashSales: res.closure.cashSales,
          countedCash: res.closure.countedCash,
          cashVariance: res.closure.cashVariance,
          waveSales: res.closure.waveSales,
          orangeSales: res.closure.orangeSales,
          cardSales: res.closure.cardSales,
          walletSales: res.closure.walletSales,
          totalSales: res.closure.totalSales,
          salesCount: res.closure.salesCount,
          notes: res.closure.notes,
          taxExempt: !posSettings.isVatSubject,
        },
        thermalFormat
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la clôture");
    } finally {
      setClosureSubmitting(false);
    }
  };

  async function pay(method: PaymentMethod) {
    if (lines.length === 0) {
      toast.error("Le ticket est vide");
      return;
    }
    setBusy(true);
    try {
      if (!isNetworkOnline()) {
        throw new Error("Réseau indisponible");
      }
      const res = await apiPost<{ sale: ProSale }>("/api/pro/sales", {
        tenantId,
        items: lines.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty })),
        paymentMethod: method,
        clientProfileId: clientId || undefined,
        discount: Math.min(discount, subtotal),
        appointmentId: linkedAppointmentId || undefined,
        depositDeducted: depositDeducted > 0 ? depositDeducted : undefined,
        practitionerName: practitionerName || undefined,
      });
      const sale: ProSale = {
        ...res.sale,
        items: res.sale.items ?? lines.map((l) => ({ label: l.label, qty: l.qty, unitPrice: l.unitPrice, total: l.unitPrice * l.qty, kind: l.kind })),
        discount: res.sale.discount ?? Math.min(discount, subtotal),
        subtotal: res.sale.subtotal ?? subtotal,
      };
      setSuccess(true);
      window.setTimeout(() => {
        setTicket(sale);
        setSheetOpen(true);
        setSuccess(false);
        setLines([]);
        setDiscountInput("");
        setClientId("");
        setLinkedAppointmentId(null);
        setDepositDeducted(0);
        setPractitionerName("");
        void sales.refetch();
        void todayAppointments.refetch();
      }, 1300);
    } catch (e) {
      // Résilience HORS-LIGNE : mise en file locale immédiate
      try {
        const localItem = await saveOfflineSale({
          tenantId,
          items: lines.map((l) => ({ kind: l.kind, id: l.id, label: l.label, unitPrice: l.unitPrice, qty: l.qty })),
          paymentMethod: method,
          clientProfileId: clientId || undefined,
          discount: Math.min(discount, subtotal),
          total,
        });
        const offlineSale: ProSale = {
          id: localItem.localId,
          tenantId,
          cashierName: practitionerName || "Caisse Déconnectée",
          paymentMethod: method,
          total,
          subtotal,
          discount: Math.min(discount, subtotal),
          createdAt: localItem.createdAt,
          items: lines.map((l) => ({ label: l.label, qty: l.qty, unitPrice: l.unitPrice, total: l.unitPrice * l.qty, kind: l.kind })),
          clientProfile: (clients.data ?? []).find((c) => c.id === clientId),
        };
        await checkOfflineCount();
        setSuccess(true);
        toast.info("Vente enregistrée en mode hors-ligne. Synchronisation automatique au retour du réseau.");
        window.setTimeout(() => {
          setTicket(offlineSale);
          setSheetOpen(true);
          setSuccess(false);
          setLines([]);
          setDiscountInput("");
          setClientId("");
          setLinkedAppointmentId(null);
          setDepositDeducted(0);
          setPractitionerName("");
        }, 1300);
      } catch {
        toast.error(e instanceof Error ? e.message : "Encaissement impossible");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Caisse" sub="Encaissement soins & produits — Wave, Orange Money, espèces, carte" />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setClosureOpen(true);
              void loadClosureData();
            }}
            className="h-8 gap-1.5 text-xs font-semibold border-gold/40 text-gold-text hover:bg-gold/10"
          >
            <Lock className="size-3.5" />
            Clôture de Caisse (Rapport Z)
          </Button>

          {online && pendingOfflineCount === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
              <span className="size-2 rounded-full bg-success animate-pulse" />
              En ligne
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <WifiOff className="size-3.5" />
                {pendingOfflineCount > 0 ? `${pendingOfflineCount} vente(s) en attente` : "Mode Hors-ligne"}
              </span>
              {pendingOfflineCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSyncOffline}
                  disabled={syncingOffline}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  <RefreshCw className={cn("size-3.5", syncingOffline && "animate-spin")} />
                  Synchroniser
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-4 items-start">
        {/* ── Catalogue ── */}
        <Card className="overflow-hidden pt-0">
          <KenteTop />
          <CardContent className="p-4">
            {catalog.error && !catalog.data ? (
              <ErrorState message={`Catalogue indisponible : ${catalog.error}`} onRetry={catalog.refetch} />
            ) : catalog.loading && !catalog.data ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <Tabs defaultValue="service" className="space-y-3">
                {/* ⚡ Favoris de caisse express (1 clic pour les 5 prestations fréquentes) */}
                {activeServices.length > 0 && (
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-2.5 space-y-1.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                        <Sparkles className="size-3.5" /> Accès express caisse (1 clic) :
                      </p>
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">Ajout direct au ticket</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      {activeServices.slice(0, 5).map((s) => {
                        const inTicket = getTicketQty("service", s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => addLine("service", s.id, s.name, s.price)}
                            className={cn(
                              "shrink-0 h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95",
                              inTicket > 0
                                ? "k-btn-gold text-primary-foreground shadow-xs"
                                : "bg-card border border-border text-foreground hover:border-primary/50"
                            )}
                          >
                            <Plus className="size-3" />
                            <span>{s.name}</span>
                            <span className="font-mono text-[10px] opacity-80">{xof(s.price)}</span>
                            {inTicket > 0 && (
                              <span className="grid size-4 place-items-center rounded-full bg-black/25 text-[10px] font-bold text-white">
                                {inTicket}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <TabsList>
                    <TabsTrigger value="service" className="text-xs gap-1.5">
                      Soins ({activeServices.length})
                    </TabsTrigger>
                    <TabsTrigger value="product" className="text-xs gap-1.5">
                      Produits ({activeProducts.length})
                    </TabsTrigger>
                  </TabsList>

                  {/* Recherche rapide au comptoir */}
                  <div className="relative w-full sm:w-60">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden="true" />
                    <Input
                      type="text"
                      placeholder="Recherche rapide..."
                      value={posSearch}
                      onChange={(e) => setPosSearch(e.target.value)}
                      className="h-8 pl-8 pr-7 text-xs rounded-full bg-muted/40"
                    />
                    {posSearch && (
                      <button
                        type="button"
                        onClick={() => setPosSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full"
                        aria-label="Effacer la recherche"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── SOINS EN CABINE ── */}
                <TabsContent value="service" className="space-y-3">
                  {/* Chips des types de soins */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pretty-scroll no-scrollbar -mx-1 px-1">
                    <button
                      type="button"
                      onClick={() => setPosServiceCat("all")}
                      className={cn(
                        "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1 min-h-[32px]",
                        posServiceCat === "all"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-card text-muted-foreground hover:bg-muted/70 border-border"
                      )}
                    >
                      <span>Tous</span>
                      <span className={cn(
                        "text-[9px] px-1 py-0.2 rounded-full",
                        posServiceCat === "all" ? "bg-white/20 text-white" : "bg-muted text-foreground"
                      )}>
                        {activeServices.length}
                      </span>
                    </button>

                    {allPosServiceCategories.map((cat) => {
                      const count = serviceCatCounts[cat.id] || 0;
                      const isSelected = posServiceCat.toLowerCase() === cat.id.toLowerCase();
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setPosServiceCat(cat.id)}
                          className={cn(
                            "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1 min-h-[32px]",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-card text-muted-foreground hover:bg-muted/70 border-border"
                          )}
                          title={cat.description}
                        >
                          <span>{cat.shortLabel}</span>
                          <span className={cn(
                            "text-[9px] px-1 py-0.2 rounded-full",
                            isSelected ? "bg-white/20 text-white" : "bg-muted text-foreground"
                          )}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {filteredPosServices.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {filteredPosServices.map((s) => {
                        const catMeta = getServiceCategoryMeta(s.category);
                        const inTicket = getTicketQty("service", s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => addLine("service", s.id, s.name, s.price)}
                            className={cn(
                              "group relative rounded-xl border p-3 text-left transition-all hover:border-gold hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring flex flex-col justify-between min-h-[92px]",
                              inTicket > 0 ? "border-gold/60 bg-gold/5" : "border-border bg-card"
                            )}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 border font-medium", getCategoryToneBadgeClass(catMeta.tone))}>
                                  {catMeta.shortLabel}
                                </Badge>
                                {inTicket > 0 && (
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gold text-charcoal shadow-xs">
                                    ×{inTicket}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-semibold leading-tight line-clamp-2 group-hover:text-primary">{s.name}</p>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between gap-1 border-t border-border/40 pt-1.5">
                              <span className="text-[10px] text-muted-foreground">{s.durationMin} min</span>
                              <span className="font-mono text-xs font-bold text-gold-text">{xof(s.price)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      label={
                        posSearch || posServiceCat !== "all"
                          ? "Aucun soin ne correspond à la sélection"
                          : "Aucun soin actif au catalogue"
                      }
                    />
                  )}
                </TabsContent>

                {/* ── PRODUITS AU COMPTOIR ── */}
                <TabsContent value="product" className="space-y-3">
                  {/* Chips des types de produits */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pretty-scroll no-scrollbar -mx-1 px-1">
                    <button
                      type="button"
                      onClick={() => setPosProductCat("all")}
                      className={cn(
                        "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1 min-h-[32px]",
                        posProductCat === "all"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-card text-muted-foreground hover:bg-muted/70 border-border"
                      )}
                    >
                      <span>Tous</span>
                      <span className={cn(
                        "text-[9px] px-1 py-0.2 rounded-full",
                        posProductCat === "all" ? "bg-white/20 text-white" : "bg-muted text-foreground"
                      )}>
                        {activeProducts.length}
                      </span>
                    </button>

                    {allPosProductCategories.map((cat) => {
                      const count = productCatCounts[cat.id] || 0;
                      const isSelected = posProductCat.toLowerCase() === cat.id.toLowerCase();
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setPosProductCat(cat.id)}
                          className={cn(
                            "shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-all flex items-center gap-1 min-h-[32px]",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-card text-muted-foreground hover:bg-muted/70 border-border"
                          )}
                          title={cat.description}
                        >
                          <span>{cat.shortLabel}</span>
                          <span className={cn(
                            "text-[9px] px-1 py-0.2 rounded-full",
                            isSelected ? "bg-white/20 text-white" : "bg-muted text-foreground"
                          )}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {filteredPosProducts.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {filteredPosProducts.map((p) => {
                        const catMeta = getProductCategoryMeta(p.category);
                        const inTicket = getTicketQty("product", p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => addLine("product", p.id, p.name, p.price)}
                            className={cn(
                              "group relative rounded-xl border p-3 text-left transition-all hover:border-gold hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-ring flex flex-col justify-between min-h-[92px]",
                              inTicket > 0 ? "border-gold/60 bg-gold/5" : "border-border bg-card"
                            )}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 border font-medium", getCategoryToneBadgeClass(catMeta.tone))}>
                                  {catMeta.shortLabel}
                                </Badge>
                                {inTicket > 0 && (
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gold text-charcoal shadow-xs">
                                    ×{inTicket}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-semibold leading-tight line-clamp-2 group-hover:text-primary">{p.name}</p>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between gap-1 border-t border-border/40 pt-1.5">
                              <span className={cn("text-[10px]", p.stock <= p.stockAlert ? "text-bissap font-semibold" : "text-muted-foreground")}>
                                Stock : {p.stock}
                              </span>
                              <span className="font-mono text-xs font-bold text-gold-text">{xof(p.price)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      label={
                        posSearch || posProductCat !== "all"
                          ? "Aucun produit ne correspond à la sélection"
                          : "Aucun produit actif au catalogue"
                      }
                    />
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* ── Ticket ── */}
        <Card className="lg:sticky lg:top-24 overflow-hidden pt-0 relative">
          <KenteTop />
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <ReceiptText className="size-4 text-primary" aria-hidden="true" /> Ticket en cours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                Cliquez sur un soin ou produit pour l&apos;ajouter au ticket.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto pretty-scroll pr-1">
                <AnimatePresence initial={false}>
                  {lines.map((l, i) => (
                    <motion.li
                      key={`${l.kind}-${l.id}`}
                      layout
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{l.label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{xof(l.unitPrice)} × {l.qty}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-10" onClick={() => setQty(i, -1)} aria-label={`Retirer un ${l.label}`}>
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-5 text-center font-mono text-xs font-semibold tabular-nums">{l.qty}</span>
                        <Button variant="ghost" size="icon" className="size-10" onClick={() => setQty(i, 1)} aria-label={`Ajouter un ${l.label}`}>
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                      <span className="min-w-[85px] w-auto shrink-0 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap">{xof(l.unitPrice * l.qty)}</span>
                      <Button variant="ghost" size="icon" className="size-10 text-muted-foreground hover:text-bissap" onClick={() => setQty(i, -l.qty)} aria-label={`Supprimer ${l.label}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            {/* Passerelle RDV du jour */}
            {pendingAppointmentsToday.length > 0 && !linkedAppointmentId && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-primary">
                  <span className="flex items-center gap-1.5">
                    <CalendarCheck className="size-3.5" /> RDV du jour à encaisser ({pendingAppointmentsToday.length})
                  </span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1 pretty-scroll">
                  {pendingAppointmentsToday.map((appt: any) => (
                    <div key={appt.id} className="flex items-center justify-between gap-1 text-[11px] bg-card rounded-lg p-2 border shadow-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{appt.clientName} · {appt.service?.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatTime(appt.startAt)} {appt.depositAmount > 0 ? `· Acompte payé: ${xof(appt.depositAmount)}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-6 text-[10px] px-2 font-bold shrink-0"
                        onClick={() => handleImportAppointment(appt)}
                      >
                        Encaisser
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Badge RDV lié */}
            {linkedAppointmentId && (
              <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                <span className="flex items-center gap-1.5 font-medium truncate">
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                  RDV #{linkedAppointmentId.slice(-6).toUpperCase()} lié
                  {depositDeducted > 0 && <strong className="text-emerald-700 dark:text-emerald-400 font-mono">(-{xof(depositDeducted)} déduit)</strong>}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLinkedAppointmentId(null);
                    setDepositDeducted(0);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground rounded"
                  title="Délier le RDV"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="pos-client" className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="size-3" aria-hidden="true" /> Cliente (optionnel)
              </Label>
              <div className="flex gap-1.5">
                <Select value={clientId || undefined} onValueChange={(v) => setClientId(v === "__none" ? "" : v)}>
                  <SelectTrigger id="pos-client" className="h-8 text-xs flex-1 min-w-0">
                    <SelectValue placeholder="Sans cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sans cliente</SelectItem>
                    {(clients.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => setExpressOpen(true)}
                  aria-label="Cliente express — créer une fiche en 2 champs"
                  title="Cliente express — 2 champs"
                  className="h-8 px-2.5 shrink-0 rounded-md border border-gold/50 text-gold-text text-[11px] font-bold flex items-center gap-1.5 hover:bg-gold/10 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <UserRoundPlus size={14} aria-hidden="true" /> <span className="hidden sm:inline">Express</span>
                </button>
              </div>
            </div>

            {/* Praticienne (pour calcul automatique des commissions de paie) */}
            <div className="space-y-1">
              <Label htmlFor="pos-practitioner" className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3 text-gold-text" aria-hidden="true" /> Praticienne (Commissions)
              </Label>
              <Select value={practitionerName || "__none"} onValueChange={(v) => setPractitionerName(v === "__none" ? "" : v)}>
                <SelectTrigger id="pos-practitioner" className="h-8 text-xs">
                  <SelectValue placeholder="Aucune / Standard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">-- Aucune / Caisse standard --</SelectItem>
                  {(team.data?.employees ?? []).map((emp) => (
                    <SelectItem key={emp.id} value={emp.name}>
                      {emp.name} ({emp.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cliente express — Dialog 2 champs (mode saisie allégé) */}
            <Dialog open={expressOpen} onOpenChange={setExpressOpen}>
              <DialogContent className="max-w-[360px] rounded-2xl p-5 gap-4">
                <DialogHeader className="space-y-1.5 text-left">
                  <DialogTitle className="font-heading font-black text-base flex items-center gap-2">
                    <UserRoundPlus size={17} className="text-gold-text" aria-hidden="true" /> Cliente express
                  </DialogTitle>
                  <DialogDescription className="text-xs leading-relaxed">
                    Une walk-in qui n&apos;est pas au carnet ? Deux champs suffisent — le CRM se remplit tout seul ensuite.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="express-name" className="text-xs">Nom complet</Label>
                    <Input
                      id="express-name"
                      value={expressName}
                      onChange={(e) => setExpressName(e.target.value)}
                      placeholder="Aïcha Bakayoko"
                      className="h-10"
                      autoFocus
                      maxLength={80}
                      onKeyDown={(e) => e.key === "Enter" && createExpressClient()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="express-phone" className="text-xs">Téléphone</Label>
                    <Input
                      id="express-phone"
                      value={expressPhone}
                      onChange={(e) => setExpressPhone(e.target.value)}
                      inputMode="tel"
                      placeholder="07 07 07 07 07"
                      className="h-10"
                      maxLength={20}
                      onKeyDown={(e) => e.key === "Enter" && createExpressClient()}
                    />
                    <p className="text-[10px] text-muted-foreground">Sert aux relances WhatsApp — saisi une seule fois.</p>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpressOpen(false)}
                    disabled={expressBusy}
                    className="rounded-lg"
                  >
                    <X size={14} aria-hidden="true" /> Annuler
                  </Button>
                  <Button
                    size="sm"
                    onClick={createExpressClient}
                    disabled={expressBusy}
                    className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {expressBusy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                    Créer et encaisser
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="space-y-1.5 border-t border-dashed border-border pt-2 text-sm">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Sous-total</span>
                <span className="font-mono tabular-nums">{xof(subtotal)}</span>
              </div>
              {depositDeducted > 0 && (
                <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Acompte en ligne déduit</span>
                  <span className="font-mono tabular-nums">-{xof(depositDeducted)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 text-xs">
                <Label htmlFor="pos-remise" className="text-muted-foreground">Remise (FCFA)</Label>
                <Input
                  id="pos-remise"
                  inputMode="numeric"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  className="h-10 w-28 text-right font-mono text-xs"
                />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-heading font-bold">TOTAL</span>
                <span className="font-mono text-xl font-bold text-gold-text tabular-nums">{xof(total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {availablePayMethods.map((m) => (
                <button
                  key={m.code}
                  disabled={busy || lines.length === 0}
                  onClick={() => pay(m.code)}
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none",
                    m.cls
                  )}
                >
                  {m.code === "wave" || m.code === "orange" ? <Wallet className="size-4" aria-hidden="true" /> : m.code === "cash" ? <ReceiptText className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                  {m.label}
                </button>
              ))}
            </div>
          </CardContent>

          {/* Overlay succès */}
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 grid place-items-center rounded-xl bg-card/95"
                role="status"
                aria-live="polite"
              >
                <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className="flex flex-col items-center gap-2">
                  <span className="grid size-16 place-items-center rounded-full bg-success text-success-foreground shadow-lg">
                    <Check className="size-9" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <p className="font-heading font-bold text-success">Encaissé !</p>
                  <p className="font-mono text-sm font-semibold">{xof(total)}</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      {/* ── Ventes récentes ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base">Ventes récentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sales.loading && !sales.data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (sales.data?.sales ?? []).length === 0 ? (
            <EmptyState label="Aucune vente enregistrée" sub="Les encaissements POS apparaîtront ici." />
          ) : (
            <ul className="divide-y divide-border/70">
              {(sales.data?.sales ?? []).slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-mono text-[10px] text-muted-foreground w-24 shrink-0 tabular-nums">
                    {formatDate(s.createdAt, { day: "2-digit", month: "2-digit" })} {formatTime(s.createdAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{s.items?.map((it) => `${it.qty}× ${it.label}`).join(", ") || "Vente"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {METHOD_LABELS[s.paymentMethod] ?? s.paymentMethod}
                      {s.clientProfile?.name ? ` · ${s.clientProfile.name}` : ""}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold tabular-nums">{xof(s.total)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 gap-1 text-[11px]"
                    onClick={() => {
                      setTicket(s);
                      setSheetOpen(true);
                    }}
                  >
                    <Printer className="size-3.5" aria-hidden="true" /> Ticket
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Ticket thermique ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto pretty-scroll">
          <SheetHeader className="sr-only">
            <SheetTitle>Ticket de caisse</SheetTitle>
            <SheetDescription>Reçu thermique imprimable</SheetDescription>
          </SheetHeader>
          {ticket && (
            <div className="mt-2 space-y-3">
              {/* Sélecteur de format thermique */}
              <div className="flex items-center justify-between rounded-lg bg-muted/60 p-2 text-xs">
                <span className="font-medium text-muted-foreground">Format papier :</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setThermalFormat("80mm")}
                    className={cn(
                      "rounded px-2 py-1 font-mono font-semibold transition-colors",
                      thermalFormat === "80mm" ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    80 mm (Caisse)
                  </button>
                  <button
                    type="button"
                    onClick={() => setThermalFormat("58mm")}
                    className={cn(
                      "rounded px-2 py-1 font-mono font-semibold transition-colors",
                      thermalFormat === "58mm" ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    58 mm (Mobile)
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  "print-area mx-auto bg-white px-4 py-5 font-mono text-[11px] leading-relaxed text-black shadow-md rounded-sm transition-all",
                  thermalFormat === "58mm" ? "w-[240px] text-[10px]" : "w-[300px]"
                )}
              >
                <div className="text-center">
                  <p className="text-[13px] font-bold tracking-wide uppercase">{tenantName}</p>
                  <p className="mt-0.5 font-bold">TICKET DE CAISSE</p>
                  <p>{formatDate(ticket.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" })} {formatTime(ticket.createdAt)}</p>
                  <p>N° {(ticket.paymentRef ?? ticket.id).slice(-8).toUpperCase()}</p>
                </div>
                <div className="my-2 border-t border-dashed border-black/60" />
                <ul className="space-y-1">
                  {(ticket.items ?? []).map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{it.qty}× {it.label}</span>
                      <span className="shrink-0 tabular-nums">{it.total.toLocaleString("fr-FR")}</span>
                    </li>
                  ))}
                </ul>
                <div className="my-2 border-t border-dashed border-black/60" />
                <div className="flex justify-between"><span>Sous-total</span><span className="tabular-nums">{(ticket.subtotal ?? ticket.total).toLocaleString("fr-FR")}</span></div>
                {(ticket.discount ?? 0) > 0 && (
                  <div className="flex justify-between"><span>Remise</span><span className="tabular-nums">-{ticket.discount!.toLocaleString("fr-FR")}</span></div>
                )}
                <div className="flex justify-between text-[13px] font-bold"><span>TOTAL</span><span className="tabular-nums">{ticket.total.toLocaleString("fr-FR")} FCFA</span></div>
                {posSettings.isVatSubject ? (
                  <div className="mt-1 flex justify-between text-[10px]">
                    <span>dont TVA 18 % incluse</span>
                    <span className="tabular-nums">{splitTVA(ticket.total).tva.toLocaleString("fr-FR")}</span>
                  </div>
                ) : (
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground italic">
                    <span>Régime fiscal</span>
                    <span>Exonéré de TVA</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between"><span>{METHOD_LABELS[ticket.paymentMethod] ?? ticket.paymentMethod}</span><span className="text-right">{ticket.cashierName ?? "Caisse 1"}</span></div>
                <div className="my-2 border-t border-dashed border-black/60" />
                <p className="text-center font-bold">Merci de votre visite !</p>
                <p className="text-center text-[9px] mt-1">Kènè POS · Conforme SYSCOHADA</p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                {/* Impression directe Bluetooth ESC/POS */}
                <Button
                  onClick={async () => {
                    setBluetoothPrinting(true);
                    try {
                      const res = await printDirectWebBluetooth(
                        {
                          tenantName,
                          receiptNumber: (ticket.paymentRef ?? ticket.id).slice(-8).toUpperCase(),
                          createdAt: ticket.createdAt,
                          cashierName: ticket.cashierName ?? "Caisse 1",
                          clientName: ticket.clientProfile?.name,
                          items: (ticket.items ?? []).map((it) => ({
                            label: it.label,
                            qty: it.qty,
                            unitPrice: it.unitPrice,
                            total: it.total,
                            kind: it.kind === "product" ? "product" : "service",
                          })),
                          subtotal: ticket.subtotal ?? ticket.total,
                          discount: ticket.discount ?? 0,
                          total: ticket.total,
                          paymentMethod: ticket.paymentMethod,
                          paymentRef: ticket.paymentRef ?? undefined,
                          taxExempt: !posSettings.isVatSubject,
                        },
                        thermalFormat
                      );
                      if (res.success) {
                        toast.success(`Ticket imprimé sur ${res.deviceName || "l'imprimante Bluetooth"} !`);
                      } else if (res.error) {
                        toast.error(res.error);
                      }
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Échec d'impression Bluetooth");
                    } finally {
                      setBluetoothPrinting(false);
                    }
                  }}
                  disabled={bluetoothPrinting}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {bluetoothPrinting ? <Loader2 className="size-4 animate-spin" /> : <Bluetooth className="size-4" />}
                  Imprimer en direct Bluetooth ({thermalFormat})
                </Button>

                {/* Impression système standard */}
                <Button
                  variant="outline"
                  onClick={() => {
                    openThermalPrintWindow(
                      {
                        tenantName,
                        receiptNumber: (ticket.paymentRef ?? ticket.id).slice(-8).toUpperCase(),
                        createdAt: ticket.createdAt,
                        cashierName: ticket.cashierName ?? "Caisse 1",
                        clientName: ticket.clientProfile?.name,
                        items: (ticket.items ?? []).map((it) => ({
                          label: it.label,
                          qty: it.qty,
                          unitPrice: it.unitPrice,
                          total: it.total,
                          kind: it.kind === "product" ? "product" : "service",
                        })),
                        subtotal: ticket.subtotal ?? ticket.total,
                        discount: ticket.discount ?? 0,
                        total: ticket.total,
                        paymentMethod: ticket.paymentMethod,
                        paymentRef: ticket.paymentRef ?? undefined,
                        taxExempt: !posSettings.isVatSubject,
                      },
                      thermalFormat
                    );
                  }}
                  className="w-full gap-2 font-semibold text-xs"
                >
                  <Printer className="size-4" aria-hidden="true" /> Impression système standard
                </Button>

                {/* Ticket dématérialisé sur WhatsApp */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const clientPhone = ticket.clientProfile?.phone || expressPhone;
                    const phoneToUse = clientPhone || window.prompt("Numéro WhatsApp de la cliente (ex: 07 08 09 10 11) :");
                    if (!phoneToUse) return;
                    const msg = buildWhatsAppReceiptMessage({
                      tenantName,
                      receiptNumber: (ticket.paymentRef ?? ticket.id).slice(-8).toUpperCase(),
                      clientName: ticket.clientProfile?.name,
                      items: (ticket.items ?? []).map((it) => ({
                        label: it.label,
                        qty: it.qty,
                        total: it.total,
                      })),
                      total: ticket.total,
                      paymentMethod: METHOD_LABELS[ticket.paymentMethod] ?? ticket.paymentMethod,
                    });
                    openWhatsApp(phoneToUse, msg);
                  }}
                  className="w-full gap-2 text-xs font-bold bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/40"
                >
                  <MessageCircle className="size-4 text-[#25D366]" /> Envoyer le reçu sur WhatsApp
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.open(
                      `/api/pro/sales/receipt?id=${ticket.id}&tenantId=${tenantId}&format=${thermalFormat}&autoprint=1`,
                      "_blank"
                    );
                  }}
                  className="w-full text-[11px] text-muted-foreground"
                >
                  Ouvrir flux direct ESC/POS
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Modal Clôture de Caisse (Rapport Z) ── */}
      <Dialog open={closureOpen} onOpenChange={setClosureOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto pretty-scroll p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 text-gold-text">
              <Lock className="size-5" />
              <DialogTitle className="font-heading text-lg">Clôture de Caisse Journalière — Rapport Z</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Pointage physique des espèces, rapprochement Mobile Money &amp; calcul de l&apos;écart de caisse (SYSCOHADA).
            </DialogDescription>
          </DialogHeader>

          {closureLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Calcul du bilan de la journée en cours...</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Synthèse globale */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Tickets Vente</p>
                  <p className="font-mono text-xl font-black mt-0.5">{closureData?.salesCount ?? 0}</p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">CA Encaissé</p>
                  <p className="font-mono text-lg font-black text-gold-text mt-0.5">{xof(closureData?.totalSales ?? 0)}</p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Ventes Espèces</p>
                  <p className="font-mono text-lg font-bold text-success mt-0.5">{xof(closureData?.cashSales ?? 0)}</p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    {posSettings.isVatSubject ? "TVA 18% SYSCOHADA" : "Régime fiscal"}
                  </p>
                  <p className="font-mono text-base font-bold text-muted-foreground mt-0.5">
                    {posSettings.isVatSubject ? xof(closureData?.tvaAmount ?? 0) : "Exonéré"}
                  </p>
                </div>
              </div>

              {/* Pointage physique et Écart */}
              <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-primary flex items-center gap-1.5">
                    <ReceiptText className="size-4" /> Pointage Tiroir-Caisse (Espèces)
                  </h4>
                  {closureCountedCash.trim() !== "" && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-mono font-bold px-2.5 py-0.5",
                        Number(closureCountedCash) - ((Number(closureInitialCash) || 0) + (closureData?.cashSales ?? 0)) === 0
                          ? "bg-emerald-500/20 text-emerald-700 border-emerald-500/40"
                          : Number(closureCountedCash) - ((Number(closureInitialCash) || 0) + (closureData?.cashSales ?? 0)) > 0
                          ? "bg-blue-500/20 text-blue-700 border-blue-500/40"
                          : "bg-red-500/20 text-red-700 border-red-500/40"
                      )}
                    >
                      {Number(closureCountedCash) - ((Number(closureInitialCash) || 0) + (closureData?.cashSales ?? 0)) === 0
                        ? "✓ Écart 0 F (Caisse conforme)"
                        : Number(closureCountedCash) - ((Number(closureInitialCash) || 0) + (closureData?.cashSales ?? 0)) > 0
                        ? `+${xof(Number(closureCountedCash) - ((Number(closureInitialCash) || 0) + (closureData?.cashSales ?? 0)))} (Excédent)`
                        : `${xof(Number(closureCountedCash) - ((Number(closureInitialCash) || 0) + (closureData?.cashSales ?? 0)))} (Déficit)`}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="closure-opening" className="text-xs">Fond de caisse d&apos;ouverture (FCFA)</Label>
                    <Input
                      id="closure-opening"
                      inputMode="numeric"
                      value={closureInitialCash}
                      onChange={(e) => setClosureInitialCash(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="25000"
                      className="font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">Monnaie de démarrage présente dans le tiroir ce matin.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="closure-counted" className="text-xs font-bold text-foreground">
                      Espèces physiques comptées ce soir (FCFA) *
                    </Label>
                    <Input
                      id="closure-counted"
                      inputMode="numeric"
                      value={closureCountedCash}
                      onChange={(e) => setClosureCountedCash(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="Ex: 85000"
                      className="font-mono text-sm border-primary/50 focus:border-primary font-bold"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Total attendu théorique : {xof((Number(closureInitialCash) || 0) + (closureData?.cashSales ?? 0))}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ventilation par méthode de paiement */}
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <p className="text-xs font-bold text-foreground">Ventilation des règlements de la séance</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-muted/60">
                    <span className="text-[10px] text-muted-foreground block">Espèces</span>
                    <span className="font-mono font-bold text-success">{xof(closureData?.cashSales ?? 0)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/60">
                    <span className="text-[10px] text-muted-foreground block">Wave</span>
                    <span className="font-mono font-bold text-[#1DC8FF]">{xof(closureData?.waveSales ?? 0)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/60">
                    <span className="text-[10px] text-muted-foreground block">Orange Money</span>
                    <span className="font-mono font-bold text-[#FF7900]">{xof(closureData?.orangeSales ?? 0)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/60">
                    <span className="text-[10px] text-muted-foreground block">Carte / Wallet</span>
                    <span className="font-mono font-bold">{xof((closureData?.cardSales ?? 0) + (closureData?.walletSales ?? 0))}</span>
                  </div>
                </div>
              </div>

              {/* Responsable & Justificatif */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="closure-resp" className="text-xs">Responsable de caisse</Label>
                  <Input
                    id="closure-resp"
                    value={closureResponsible}
                    onChange={(e) => setClosureResponsible(e.target.value)}
                    placeholder="Nom de la gérante ou caissière"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="closure-notes" className="text-xs">Justificatif / Remarques écart (optionnel)</Label>
                  <Input
                    id="closure-notes"
                    value={closureNotes}
                    onChange={(e) => setClosureNotes(e.target.value)}
                    placeholder="Ex: pourboires caisse déduits, achat glaçons..."
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Historique des derniers Z clôturés */}
              {(closureData?.pastClosures ?? []).length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-bold text-muted-foreground">Historique récent des rapports Z</p>
                  <div className="max-h-36 overflow-y-auto pretty-scroll space-y-1 pr-1">
                    {closureData.pastClosures.slice(0, 5).map((z: any) => (
                      <div key={z.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/40 border">
                        <div>
                          <span className="font-bold">{z.id}</span> · {formatDate(z.closureDate)} {formatTime(z.closureDate)}
                          <span className="text-[10px] text-muted-foreground ml-2">par {z.closedBy}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{xof(z.totalSales)}</span>
                          <Badge variant="outline" className={cn("text-[10px] font-mono", z.cashVariance === 0 ? "text-success" : z.cashVariance > 0 ? "text-blue-600" : "text-bissap")}>
                            {z.cashVariance === 0 ? "0 F" : `${z.cashVariance > 0 ? "+" : ""}${xof(z.cashVariance)}`}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => openCashClosurePrintWindow({ ...z, taxExempt: !posSettings.isVatSubject }, thermalFormat)}
                            title="Réimprimer le ticket Z"
                          >
                            <Printer className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClosureOpen(false)}
            >
              Fermer
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!closureData) return;
                  const opening = Number(closureInitialCash) || 0;
                  const counted = Number(closureCountedCash) || 0;
                  const expected = opening + (closureData.cashSales ?? 0);
                  openCashClosurePrintWindow(
                    {
                      tenantName,
                      tenantCity: tenantCity || (tenantName.includes("Dakar") ? "Dakar" : "Abidjan"),
                      tenantPhone: tenantPhone || undefined,
                      closureDate: new Date().toISOString(),
                      closedBy: closureResponsible || "Responsable caisse",
                      openingCash: opening,
                      cashSales: closureData.cashSales ?? 0,
                      countedCash: counted,
                      cashVariance: counted - expected,
                      waveSales: closureData.waveSales ?? 0,
                      orangeSales: closureData.orangeSales ?? 0,
                      cardSales: closureData.cardSales ?? 0,
                      walletSales: closureData.walletSales ?? 0,
                      totalSales: closureData.totalSales ?? 0,
                      salesCount: closureData.salesCount ?? 0,
                      notes: closureNotes || undefined,
                      taxExempt: !posSettings.isVatSubject,
                    },
                    thermalFormat
                  );
                }}
                className="gap-1.5 text-xs font-semibold"
              >
                <Printer className="size-3.5" />
                Aperçu Ticket Z
              </Button>
              <Button
                size="sm"
                onClick={handleValidateClosure}
                disabled={closureSubmitting || closureLoading || closureCountedCash.trim() === ""}
                className="gap-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {closureSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
                Valider &amp; Clôturer la Caisse
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
