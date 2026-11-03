"use client";
// Kènè Pro — Centre de Notifications de l'Établissement (2026)
// Synchronisation temps réel avec l'activité cliente & salon :
// • Nouveaux rendez-vous cabine & demandes en attente
// • Annulations ou déplacements par les clientes
// • Commandes boutique à préparer / expédier
// • Alertes ruptures de stock
// • Nouveaux avis clientes 5 étoiles
// • Partage de dossier cutané / bilan de peau cliente
import { useState, useEffect, useRef } from "react";
import {
  Bell,
  BellRing,
  CalendarCheck2,
  CalendarX2,
  ShoppingBag,
  AlertTriangle,
  Star,
  FolderHeart,
  CheckCheck,
  CheckCircle2,
  Loader2,
  ArrowRight,
  WifiOff,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost } from "@/lib/kene/api";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { toast } from "sonner";
import { readMeta } from "@/lib/kene/reminders";
import { cn } from "@/lib/utils";
import type { ProSectionId } from "./ProEnterpriseShell";

export interface ProNotificationItem {
  id: string;
  channel: string;
  toPhone: string;
  message: string;
  status: string;
  metaJson: string | null;
  readAt: string | null;
  createdAt: string;
}

interface ProNotificationFeed {
  notifications: ProNotificationItem[];
  unread: number;
}

interface ClassifiedProNotif {
  category: string;
  actionLabel: string;
  targetSection: ProSectionId;
  Icon: typeof BellRing;
  iconBoxClass: string;
  badgeClass: string;
}

function classifyProNotif(item: ProNotificationItem): ClassifiedProNotif {
  const meta = readMeta(item.metaJson);
  const msg = (item.message || "").toLowerCase();

  // 1. Alertes de stock
  if (meta.type === "stock_alert" || msg.includes("stock") || msg.includes("seuil d'alerte")) {
    return {
      category: "Alerte Stock",
      actionLabel: "Voir l'inventaire",
      targetSection: "stock",
      Icon: AlertTriangle,
      iconBoxClass: "bg-amber-500/15 text-amber-500 border border-amber-500/30",
      badgeClass: "bg-amber-500/15 text-amber-500 border border-amber-500/30",
    };
  }

  // 2. Annulation ou modification de RDV
  if (meta.type === "appt_cancelled" || msg.includes("annulé") || msg.includes("absence")) {
    return {
      category: "Annulation RDV",
      actionLabel: "Ouvrir l'agenda",
      targetSection: "agenda",
      Icon: CalendarX2,
      iconBoxClass: "bg-red-500/15 text-red-500 border border-red-500/30",
      badgeClass: "bg-red-500/15 text-red-500 border border-red-500/30",
    };
  }

  // 3. Rendez-vous ou Soin cabine
  if (meta.apptId || msg.includes("rdv") || msg.includes("rendez-vous") || msg.includes("soin")) {
    return {
      category: "Rendez-vous Cabine",
      actionLabel: "Voir l'agenda",
      targetSection: "agenda",
      Icon: CalendarCheck2,
      iconBoxClass: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
      badgeClass: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
    };
  }

  // 4. Commandes boutique
  if (meta.orderId || msg.includes("commande") || msg.includes("panier")) {
    return {
      category: "Commande Boutique",
      actionLabel: "Voir les commandes",
      targetSection: "caisse",
      Icon: ShoppingBag,
      iconBoxClass: "bg-gold/15 text-gold-text border border-gold/30",
      badgeClass: "bg-gold/15 text-gold-text border border-gold/30",
    };
  }

  // 5. Partage de bilan de peau par une cliente
  if (meta.type === "client_share" || msg.includes("partagé ses bilans") || msg.includes("bilan de peau")) {
    return {
      category: "Dossier Cutané Partagé",
      actionLabel: "Consulter la fiche CRM",
      targetSection: "crm",
      Icon: FolderHeart,
      iconBoxClass: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
      badgeClass: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
    };
  }

  // 6. Avis cliente
  if (msg.includes("avis") || msg.includes("★") || msg.includes("étoile")) {
    return {
      category: "Avis Cliente",
      actionLabel: "Consulter les avis",
      targetSection: "crm",
      Icon: Star,
      iconBoxClass: "bg-[#D49A24]/15 text-[#D49A24] border border-[#D49A24]/30",
      badgeClass: "bg-[#D49A24]/15 text-[#D49A24] border border-[#D49A24]/30",
    };
  }

  // 7. Défaut : Notification d'activité institut
  return {
    category: "Activité Salon",
    actionLabel: "Voir les détails",
    targetSection: "dashboard",
    Icon: BellRing,
    iconBoxClass: "bg-primary/15 text-primary border border-primary/30",
    badgeClass: "bg-primary/10 text-primary border border-primary/25",
  };
}

function timeAgo(dateStr: string): string {
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 60) return "À l'instant";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Hier";
  return `Il y a ${diffD} j`;
}

export function ProNotificationCenter({
  tenantId,
  unreadCount = 0,
  onNavigate,
}: {
  tenantId: string;
  unreadCount?: number;
  onNavigate: (section: ProSectionId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<ProNotificationFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchFeed = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await apiGet<ProNotificationFeed>(`/api/pro/notifications?tenantId=${tenantId}`);
      setFeed(res);
    } catch {
      // silence
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchFeed();
    }
  }, [open, tenantId]);

  const markAllRead = async () => {
    if (!tenantId || busy || !feed || feed.unread === 0) return;
    setBusy(true);
    try {
      await apiPost("/api/pro/notifications/read", { tenantId });
      haptic(HAPTIC.success);
      setFeed((f) => (f ? { ...f, unread: 0, notifications: f.notifications.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })) } : f));
      toast.success("Toutes les notifications sont marquées lues");
    } catch {
      toast.error("Échec lors de la mise à jour");
    } finally {
      setBusy(false);
    }
  };

  const markSingleRead = async (item: ProNotificationItem) => {
    if (!item.readAt) {
      void apiPost("/api/pro/notifications/read", { tenantId, ids: [item.id] }).catch(() => null);
      setFeed((f) => {
        if (!f) return f;
        return {
          ...f,
          unread: Math.max(0, f.unread - 1),
          notifications: f.notifications.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
        };
      });
    }
    const classified = classifyProNotif(item);
    setOpen(false);
    onNavigate(classified.targetSection);
  };

  const displayBadge = unreadCount > 0 ? unreadCount : feed?.unread ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic(HAPTIC.light);
          setOpen(true);
        }}
        aria-label={displayBadge > 0 ? `${displayBadge} notifications d'institut non lues` : "Centre de notifications établissement"}
        className="relative grid place-items-center size-8 sm:size-9 rounded-full bg-muted/40 border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all shrink-0 cursor-pointer"
        title="Centre de notifications de l'établissement"
      >
        <Bell className="size-4" />
        {displayBadge > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-bissap px-1 text-[9px] font-black text-white shadow-xs animate-in zoom-in-50"
          >
            {displayBadge > 9 ? "9+" : displayBadge}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-background">
          <SheetHeader className="p-4 border-b border-border/60 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-gold/15 text-gold-text">
                  <BellRing size={16} />
                </span>
                <div>
                  <SheetTitle className="text-sm font-heading font-black text-foreground">
                    Notifications Salon
                  </SheetTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Activité cliente &amp; alertes synchronisées
                  </p>
                </div>
              </div>
              {feed && feed.unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllRead}
                  disabled={busy}
                  className="h-7 text-xs font-semibold text-primary gap-1 px-2 hover:bg-primary/10"
                >
                  <CheckCheck size={14} /> Tout marquer lu
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {loading && !feed ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            ) : !feed || feed.notifications.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="size-12 rounded-full bg-muted grid place-items-center mx-auto text-muted-foreground">
                  <Bell size={20} />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  Aucune notification récente
                </p>
                <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                  Les réservations, commandes, alertes stocks et avis clientes apparaîtront automatiquement ici en direct.
                </p>
              </div>
            ) : (
              feed.notifications.map((item) => {
                const isUnread = !item.readAt;
                const info = classifyProNotif(item);
                const ItemIcon = info.Icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => markSingleRead(item)}
                    className={cn(
                      "w-full text-left p-3 rounded-2xl border transition-all flex items-start gap-3 active:scale-[0.99] cursor-pointer",
                      isUnread
                        ? "bg-card border-gold/40 shadow-xs ring-1 ring-gold/20"
                        : "bg-muted/30 border-border/50 hover:bg-muted/60 opacity-80"
                    )}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", info.iconBoxClass)}>
                      <ItemIcon size={16} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={cn("text-[9.5px] font-black uppercase tracking-wider px-2 py-0.2 rounded-full", info.badgeClass)}>
                          {info.category}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {timeAgo(item.createdAt)}
                        </span>
                      </div>
                      <p className={cn("text-xs leading-snug line-clamp-2", isUnread ? "font-bold text-foreground" : "text-muted-foreground")}>
                        {item.message}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10.5px] font-bold text-primary flex items-center gap-1">
                          {info.actionLabel} <ArrowRight size={11} />
                        </span>
                        {isUnread && (
                          <span className="size-2 rounded-full bg-bissap" aria-label="Non lue" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
